/**
 * Full workspace + per-project panel dump to localStorage right before Stripe redirect,
 * and restore on return so CAD/PCB/BOM/firmware survive even if cloud sync fails.
 */

import { dualStorageGet, dualStorageSet } from "@/lib/dual-storage";
import { flushPcbToDualStorage } from "@/lib/pcb-persist-bridge";
import {
  readWorkspace,
  writeWorkspace,
  type MockWorkspaceState,
} from "@/lib/mock-workspace";
import { getCachedAuthUserId } from "@/lib/supabase-auth";

const SNAPSHOT_VERSION = 1;
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h
export const STRIPE_RETURN_SESSION_KEY = "node0_stripe_return_expected";

const CAD_PREFIX = "node0-cad-shell:";
const BOM_PREFIX = "node0-bom:";
const FIRMWARE_PREFIX = "node0-firmware:";
const CIRCUITRON_PREFIX = "node0-circuitron:";
const ORDERS_PREFIX = "node0-orders:";

function snapshotStorageKey(userId: string) {
  return `node0_stripe_full_snapshot:${userId}`;
}

type PerProjectSnap = {
  cadShell: string | null;
  bom: string | null;
  firmware: string | null;
  circuitron: string | null;
  orders: string | null;
};

type SnapshotPayload = {
  v: number;
  savedAt: number;
  userId: string;
  checkoutProjectId: string;
  workspace: MockWorkspaceState;
  perProject: Record<string, PerProjectSnap>;
};

function collectPerProject(workspace: MockWorkspaceState): Record<string, PerProjectSnap> {
  const out: Record<string, PerProjectSnap> = {};
  for (const p of workspace.projects) {
    const id = p.id;
    out[id] = {
      cadShell: dualStorageGet(CAD_PREFIX + id),
      bom: dualStorageGet(BOM_PREFIX + id),
      firmware: dualStorageGet(FIRMWARE_PREFIX + id),
      circuitron: dualStorageGet(CIRCUITRON_PREFIX + id),
      orders: dualStorageGet(ORDERS_PREFIX + id),
    };
  }
  return out;
}

function applyPerProject(perProject: Record<string, PerProjectSnap>) {
  for (const [id, snap] of Object.entries(perProject)) {
    try {
      if (snap.cadShell != null) dualStorageSet(CAD_PREFIX + id, snap.cadShell);
      if (snap.bom != null) dualStorageSet(BOM_PREFIX + id, snap.bom);
      if (snap.firmware != null) dualStorageSet(FIRMWARE_PREFIX + id, snap.firmware);
      if (snap.circuitron != null) dualStorageSet(CIRCUITRON_PREFIX + id, snap.circuitron);
      if (snap.orders != null) dualStorageSet(ORDERS_PREFIX + id, snap.orders);
    } catch {
      /* quota */
    }
  }
}

/**
 * Call immediately before navigating to Stripe (after flush). Writes one localStorage blob.
 */
export function saveStripeCheckoutLocalSnapshot(checkoutProjectId: string): boolean {
  if (typeof window === "undefined") return false;
  flushPcbToDualStorage();
  const userId = getCachedAuthUserId();
  if (!userId) return false;

  const workspace = readWorkspace();
  const payload: SnapshotPayload = {
    v: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    userId,
    checkoutProjectId,
    workspace: {
      projects: workspace.projects.map((p) => ({ ...p })),
      messages: JSON.parse(JSON.stringify(workspace.messages)) as MockWorkspaceState["messages"],
    },
    perProject: collectPerProject(workspace),
  };

  try {
    const raw = JSON.stringify(payload);
    if (raw.length > 4_500_000) {
      console.warn("[stripe snapshot] payload very large; localStorage may fail");
    }
    localStorage.setItem(snapshotStorageKey(userId), raw);
    return true;
  } catch (e) {
    console.warn("[stripe snapshot] save failed:", e);
    return false;
  }
}

export function setStripeReturnExpectedFlag(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STRIPE_RETURN_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearStripeReturnExpectedFlag(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STRIPE_RETURN_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Restore snapshot if user is returning from Stripe (success URL and/or session flag).
 * Applies to dual-storage + workspace, then removes snapshot from localStorage.
 */
export function restoreStripeCheckoutLocalSnapshotIfNeeded(
  userId: string,
  opts: { checkoutSuccessQuery: boolean },
): boolean {
  if (typeof window === "undefined") return false;

  let pending = false;
  try {
    pending = sessionStorage.getItem(STRIPE_RETURN_SESSION_KEY) === "1";
  } catch {
    pending = false;
  }

  if (!opts.checkoutSuccessQuery && !pending) return false;

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(snapshotStorageKey(userId));
  } catch {
    return false;
  }
  if (!raw) {
    clearStripeReturnExpectedFlag();
    return false;
  }

  let parsed: SnapshotPayload;
  try {
    parsed = JSON.parse(raw) as SnapshotPayload;
  } catch {
    localStorage.removeItem(snapshotStorageKey(userId));
    clearStripeReturnExpectedFlag();
    return false;
  }

  if (
    parsed.v !== SNAPSHOT_VERSION ||
    typeof parsed.savedAt !== "number" ||
    parsed.userId !== userId ||
    !parsed.workspace?.projects ||
    !parsed.perProject
  ) {
    localStorage.removeItem(snapshotStorageKey(userId));
    clearStripeReturnExpectedFlag();
    return false;
  }

  if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
    localStorage.removeItem(snapshotStorageKey(userId));
    clearStripeReturnExpectedFlag();
    return false;
  }

  try {
    writeWorkspace(parsed.workspace);
    applyPerProject(parsed.perProject);
    localStorage.removeItem(snapshotStorageKey(userId));
    clearStripeReturnExpectedFlag();
    try {
      window.dispatchEvent(new Event("node0-mock-workspace"));
      window.dispatchEvent(new Event("node0-extras-hydrated"));
    } catch {
      /* ignore */
    }
    return true;
  } catch (e) {
    console.warn("[stripe snapshot] restore failed:", e);
    return false;
  }
}
