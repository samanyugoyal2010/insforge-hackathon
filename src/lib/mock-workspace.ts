import { dualStorageGet, dualStorageRemove, dualStorageSet } from "@/lib/dual-storage";
import { getCachedAuthUserId } from "@/lib/supabase-auth";

export type ChatMsg = {
  role: "user" | "assistant" | "assistant-streaming" | "typing" | "progress";
  text: string;
};

export type MockProject = {
  id: string;
  name: string;
  updatedAt: number;
  /** Short line for cards */
  tagline: string;
  /** Optional team scope for shared collaboration */
  teamId?: string;
};

const STORAGE_KEY_PREFIX = "node0_workspace_v2";
const LEGACY_STORAGE_KEY = "node0_mock_workspace_v1";

export type MockWorkspaceState = {
  projects: MockProject[];
  messages: Record<string, ChatMsg[]>;
};

const EMPTY: MockWorkspaceState = { projects: [], messages: {} };

function cloneSeed(): MockWorkspaceState {
  return {
    projects: EMPTY.projects.map((p) => ({ ...p })),
    messages: Object.fromEntries(
      Object.entries(EMPTY.messages).map(([k, v]) => [k, v.map((m) => ({ ...m }))]),
    ),
  };
}

function storageKeyForCurrentUser() {
  const userId = getCachedAuthUserId();
  if (!userId) return null;
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function parse(raw: string | null): MockWorkspaceState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as MockWorkspaceState;
    if (!o.projects || !Array.isArray(o.projects) || !o.messages) return null;
    return o;
  } catch {
    return null;
  }
}

export function readWorkspace(): MockWorkspaceState {
  if (typeof window === "undefined") return cloneSeed();
  const key = storageKeyForCurrentUser();
  if (!key) return cloneSeed();
  sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  const parsed = parse(dualStorageGet(key));
  if (!parsed) return cloneSeed();
  return parsed;
}

export function writeWorkspace(state: MockWorkspaceState) {
  if (typeof window === "undefined") return;
  const key = storageKeyForCurrentUser();
  if (!key) return;
  dualStorageSet(key, JSON.stringify(state));
  window.dispatchEvent(new Event("node0-mock-workspace"));
}

export function subscribeWorkspace(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener("node0-mock-workspace", h);
  return () => window.removeEventListener("node0-mock-workspace", h);
}

export function createProjectId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `p_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `p_${Date.now().toString(36)}`;
}

export function clearWorkspaceStorage() {
  if (typeof window === "undefined") return;
  const key = storageKeyForCurrentUser();
  if (!key) return;
  dualStorageRemove(key);
  window.dispatchEvent(new Event("node0-mock-workspace"));
}
