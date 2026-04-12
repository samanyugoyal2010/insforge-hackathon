"use client";

import { dualStorageGet, dualStorageRemove, dualStorageSet } from "@/lib/dual-storage";
import { loadCircuitronForProject, persistCircuitronForProject } from "@/lib/circuitron-persist";
import {
  readWorkspace,
  writeWorkspace,
  type ChatMsg,
  type MockWorkspaceState,
} from "@/lib/mock-workspace";
import { clampLayerCountForFab, clampPcbOutlineMm } from "@/lib/fab-quote";
import { flushPcbToDualStorage } from "@/lib/pcb-persist-bridge";
import { getSession, hydrateAuthSession } from "@/lib/supabase-auth";

const CAD_PREFIX = "node0-cad-shell:";
const BOM_PREFIX = "node0-bom:";
const FIRMWARE_PREFIX = "node0-firmware:";
/** Mock fab orders (Order panel) — also persisted in `extras` in Supabase */
export const ORDERS_SESSION_PREFIX = "node0-orders:";

function readSessionJson(key: string): unknown | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = dualStorageGet(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

type RemoteProjectRow = {
  client_id: string;
  name: string;
  tagline: string;
  updated_at: string;
  messages?: unknown;
  pcb_snapshot?: unknown | null;
  cad_document?: unknown | null;
  bom?: unknown | null;
  extras?: unknown | null;
  team_id?: string | null;
  firmware?: string | null;
  artifact_manifest?: unknown[] | null;
};

type ArtifactFetchResponse = {
  files?: Record<string, string>;
};

async function pullArtifactsFromCloud(
  accessToken: string,
  clientId: string,
): Promise<Record<string, string> | null> {
  const res = await fetch(
    `/api/workspace/artifacts?client_id=${encodeURIComponent(clientId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as ArtifactFetchResponse;
  if (!data.files || typeof data.files !== "object") return null;
  return data.files;
}

async function pushArtifactsToCloud(
  accessToken: string,
  clientId: string,
  files: Record<string, string>,
  teamId?: string,
): Promise<unknown[] | null> {
  const res = await fetch("/api/workspace/artifacts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      files,
      team_id: teamId ?? null,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { artifacts?: unknown[] };
  return Array.isArray(data.artifacts) ? data.artifacts : null;
}

function collectExtrasForProject(projectId: string): unknown | null {
  if (typeof window === "undefined") return null;
  const out: Record<string, unknown> = {};
  try {
    const ordersRaw = dualStorageGet(ORDERS_SESSION_PREFIX + projectId);
    if (ordersRaw) {
      const o = JSON.parse(ordersRaw) as unknown;
      if (Array.isArray(o)) out.mockOrders = o;
    }
  } catch {
    /* ignore */
  }
  const tool = dualStorageGet(`node0-project-tool:${projectId}`);
  if (tool) out.projectTool = tool;
  const cadT =
    dualStorageGet(`node0-cad-technical:${projectId}`) ??
    dualStorageGet(`node0-cad-developer:${projectId}`);
  const pcbT = dualStorageGet(`node0-pcb-technical:${projectId}`);
  if (cadT != null) out.cadTechnical = cadT === "1";
  if (pcbT != null) out.pcbTechnical = pcbT === "1";
  return Object.keys(out).length > 0 ? out : null;
}

function getWorkspaceFilesFromPcb(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const w = (raw as Record<string, unknown>).workspaceFiles;
  if (!w || typeof w !== "object") return null;
  return w as Record<string, string>;
}

/** Legacy Circuitron shape used by PCBViewer when `workspaceFiles` is absent. */
function getLegacyPcbFilesFromPcb(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const files = (raw as Record<string, unknown>).files;
  if (!files || typeof files !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) {
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Matches viewer logic: `workspaceFiles` and/or string `files` entries. */
function getPcbCombinedFileMap(raw: unknown): Record<string, string> | null {
  const wf = getWorkspaceFilesFromPcb(raw);
  const leg = getLegacyPcbFilesFromPcb(raw);
  if (!wf && !leg) return null;
  return { ...leg, ...wf };
}

function pcbHasWorkspaceFiles(raw: unknown): boolean {
  const f = getPcbCombinedFileMap(raw);
  return Boolean(f && Object.keys(f).length > 0);
}

const COMPACT_PCB_ROW_KEYS = new Set([
  "success",
  "pcbSource",
  "error",
  "pcbWarnings",
  "generatedAt",
  "widthMm",
  "heightMm",
  "layerCount",
]);

/** True if `v` only contains keys we store in `node0_workspace_projects.pcb_snapshot` (fab metadata). */
function isCompactPcbSnapshot(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  for (const k of Object.keys(v as Record<string, unknown>)) {
    if (!COMPACT_PCB_ROW_KEYS.has(k)) return false;
  }
  return true;
}

/** True if local Circuitron JSON should not be cleared on pull. */
function circuitronLocalWorthKeeping(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw !== "object" || Array.isArray(raw)) return false;
  if (pcbHasWorkspaceFiles(raw)) return true;
  if (!isCompactPcbSnapshot(raw)) return true;
  const o = raw as Record<string, unknown>;
  if (typeof o.pcbSource === "string" && o.pcbSource.trim().length > 0) return true;
  if (o.success === true) return true;
  if (typeof o.error === "string" && o.error.length > 0) return true;
  return Object.keys(o).length > 0;
}

function compactPcbSnapshotForCloud(value: unknown): unknown | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  // Avoid syncing huge generated file blobs to workspace row payload.
  const compact: Record<string, unknown> = {
    success: typeof v.success === "boolean" ? v.success : undefined,
    pcbSource: typeof v.pcbSource === "string" ? v.pcbSource : undefined,
    error: typeof v.error === "string" ? v.error : undefined,
    pcbWarnings: Array.isArray(v.pcbWarnings)
      ? v.pcbWarnings.slice(0, 6)
      : undefined,
    generatedAt: Date.now(),
  };
  if (
    typeof v.widthMm === "number" &&
    Number.isFinite(v.widthMm) &&
    typeof v.heightMm === "number" &&
    Number.isFinite(v.heightMm)
  ) {
    const c = clampPcbOutlineMm(v.widthMm, v.heightMm);
    compact.widthMm = c.widthMm;
    compact.heightMm = c.heightMm;
  }
  if (typeof v.layerCount === "number" && Number.isFinite(v.layerCount)) {
    compact.layerCount = clampLayerCountForFab(v.layerCount);
  }
  return compact;
}

function applyExtrasToSession(clientId: string, extras: unknown) {
  if (extras == null || typeof extras !== "object" || Array.isArray(extras)) {
    return;
  }
  const e = extras as Record<string, unknown>;
  try {
    if (Array.isArray(e.mockOrders)) {
      dualStorageSet(
        ORDERS_SESSION_PREFIX + clientId,
        JSON.stringify(e.mockOrders),
      );
    } else {
      dualStorageRemove(ORDERS_SESSION_PREFIX + clientId);
    }
    if (typeof e.projectTool === "string") {
      dualStorageSet(`node0-project-tool:${clientId}`, e.projectTool);
    }
    if (typeof e.cadTechnical === "boolean") {
      dualStorageSet(
        `node0-cad-technical:${clientId}`,
        e.cadTechnical ? "1" : "0",
      );
    }
    if (typeof e.pcbTechnical === "boolean") {
      dualStorageSet(
        `node0-pcb-technical:${clientId}`,
        e.pcbTechnical ? "1" : "0",
      );
    }
  } catch {
    /* quota */
  }
}

function isChatMsgArray(v: unknown): v is ChatMsg[] {
  if (!Array.isArray(v)) return false;
  return v.every(
    (x) =>
      Boolean(x) &&
      typeof x === "object" &&
      typeof (x as ChatMsg).role === "string" &&
      typeof (x as ChatMsg).text === "string",
  );
}

/**
 * Replace local session workspace from Supabase (per-user). Returns true if remote had rows.
 */
export async function pullWorkspaceFromCloud(): Promise<boolean> {
  await hydrateAuthSession();
  const session = await getSession();
  if (!session?.access_token) return false;

  const res = await fetch("/api/workspace", {
    method: "GET",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!res.ok) return false;

  const data = (await res.json()) as { projects?: RemoteProjectRow[] };
  const rows = Array.isArray(data.projects) ? data.projects : [];
  if (rows.length === 0) return false;

  const localBeforePull = readWorkspace();
  const remoteIds = new Set(rows.map((r) => r.client_id));

  for (const row of rows) {
    /**
     * When the DB row has null CAD/BOM (never synced, older schema, or failed save),
     * do **not** delete sessionStorage — that was wiping local edits on every pull
     * and made enclosures “reset to a blank cube” after refresh.
     */
    if (row.bom != null) {
      try {
        dualStorageSet(BOM_PREFIX + row.client_id, JSON.stringify(row.bom));
      } catch {
        /* quota */
      }
    }

    if (row.cad_document != null) {
      try {
        dualStorageSet(
          CAD_PREFIX + row.client_id,
          JSON.stringify(row.cad_document),
        );
      } catch {
        /* quota */
      }
    }

    if (row.pcb_snapshot != null || (row.artifact_manifest?.length ?? 0) > 0) {
      const artifactFiles = await pullArtifactsFromCloud(
        session.access_token,
        row.client_id,
      );
      const localPcb = loadCircuitronForProject(row.client_id);
      const localFiles = getPcbCombinedFileMap(localPcb);

      let merged: unknown;
      if (artifactFiles && Object.keys(artifactFiles).length > 0) {
        merged = {
          ...(typeof row.pcb_snapshot === "object" && row.pcb_snapshot
            ? (row.pcb_snapshot as Record<string, unknown>)
            : {}),
          workspaceFiles: artifactFiles,
        };
      } else if (localFiles && Object.keys(localFiles).length > 0) {
        /** Artifact GET failed or empty; keep local PCB so we don't replace real files with a compact snapshot. */
        merged = localPcb;
      } else if (
        localPcb != null &&
        !isCompactPcbSnapshot(localPcb) &&
        isCompactPcbSnapshot(row.pcb_snapshot)
      ) {
        /** Local still has full Circuitron payload; DB row only holds fab metadata — do not replace. */
        merged = localPcb;
      } else {
        merged = row.pcb_snapshot;
      }
      persistCircuitronForProject(row.client_id, merged);
    } else {
      const localPcb = loadCircuitronForProject(row.client_id);
      if (!circuitronLocalWorthKeeping(localPcb)) {
        dualStorageRemove("node0-circuitron:" + row.client_id);
      }
    }

    if (
      typeof row.firmware === "string" &&
      row.firmware.trim().length > 0
    ) {
      try {
        dualStorageSet(FIRMWARE_PREFIX + row.client_id, row.firmware);
      } catch {
        /* quota */
      }
    }

    if (row.extras != null) {
      applyExtrasToSession(row.client_id, row.extras);
    }
  }

  const fromRemote: MockWorkspaceState["projects"] = rows.map((p) => ({
    id: p.client_id,
    name: p.name,
    tagline: p.tagline ?? "",
    updatedAt: Date.parse(p.updated_at) || Date.now(),
    ...(typeof p.team_id === "string" ? { teamId: p.team_id } : {}),
  }));

  const localOnlyProjects = localBeforePull.projects.filter(
    (p) => !remoteIds.has(p.id),
  );

  const messages: Record<string, ChatMsg[]> = {};
  for (const p of rows) {
    const remoteMsgs = isChatMsgArray(p.messages) ? p.messages : [];
    const localMsgs = localBeforePull.messages[p.client_id] ?? [];
    messages[p.client_id] =
      remoteMsgs.length > 0 ? remoteMsgs : localMsgs;
  }
  for (const p of localOnlyProjects) {
    const lm = localBeforePull.messages[p.id];
    if (lm && lm.length > 0) {
      messages[p.id] = lm;
    } else if (!(p.id in messages)) {
      messages[p.id] = [];
    }
  }

  const next: MockWorkspaceState = {
    projects: [...fromRemote, ...localOnlyProjects],
    messages,
  };

  writeWorkspace(next);
  try {
    window.dispatchEvent(new Event("node0-extras-hydrated"));
  } catch {
    /* ignore */
  }
  return true;
}

async function putWorkspacePayload(
  accessToken: string,
  projects: unknown[],
): Promise<boolean> {
  const res = await fetch("/api/workspace", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ projects }),
  });
  return res.ok;
}

/**
 * Push local session workspace to Supabase (full list + reconcile deletions on server).
 *
 * Artifact uploads require a `node0_workspace_projects` row (ACL). We upsert rows first
 * when any board has `workspaceFiles`, then upload to storage and upsert again with manifests.
 * Remote `artifact_manifest` is preserved for projects that have no local file payload.
 */
export async function pushWorkspaceToCloud(): Promise<boolean> {
  await hydrateAuthSession();
  const session = await getSession();
  if (!session?.access_token) return false;

  flushPcbToDualStorage();

  const local = readWorkspace();
  if (local.projects.length === 0) return true;

  const token = session.access_token;

  const manifestRes = await fetch("/api/workspace", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const manifestById = new Map<string, unknown[] | null>();
  if (manifestRes.ok) {
    const data = (await manifestRes.json()) as {
      projects?: Array<{ client_id: string; artifact_manifest?: unknown[] | null }>;
    };
    for (const pr of data.projects ?? []) {
      manifestById.set(
        pr.client_id,
        Array.isArray(pr.artifact_manifest) ? pr.artifact_manifest : null,
      );
    }
  }

  const buildRow = (p: (typeof local.projects)[0], artifact_manifest: unknown[] | null) => {
    const rawPcb = loadCircuitronForProject(p.id);
    const cad_document = readSessionJson(CAD_PREFIX + p.id);
    const bom = readSessionJson(BOM_PREFIX + p.id);

    return {
      client_id: p.id,
      name: p.name,
      tagline: p.tagline,
      updated_at: new Date(p.updatedAt).toISOString(),
      messages: local.messages[p.id] ?? [],
      pcb_snapshot: compactPcbSnapshotForCloud(rawPcb),
      cad_document,
      bom,
      extras: collectExtrasForProject(p.id),
      team_id: p.teamId ?? null,
      firmware: dualStorageGet(FIRMWARE_PREFIX + p.id) ?? null,
      artifact_manifest,
    };
  };

  const anyPcbFiles = local.projects.some((p) =>
    pcbHasWorkspaceFiles(loadCircuitronForProject(p.id)),
  );

  if (anyPcbFiles) {
    const pass1 = local.projects.map((p) =>
      buildRow(p, manifestById.get(p.id) ?? null),
    );
    if (!(await putWorkspacePayload(token, pass1))) return false;

    const pass2 = await Promise.all(
      local.projects.map(async (p) => {
        const baseManifest = manifestById.get(p.id) ?? null;
        const rawPcb = loadCircuitronForProject(p.id);
        const files = getPcbCombinedFileMap(rawPcb);
        if (files && Object.keys(files).length > 0) {
          const uploaded = await pushArtifactsToCloud(
            token,
            p.id,
            files,
            p.teamId,
          );
          return buildRow(p, uploaded ?? baseManifest);
        }
        return buildRow(p, baseManifest);
      }),
    );
    return putWorkspacePayload(token, pass2);
  }

  const projects = local.projects.map((p) =>
    buildRow(p, manifestById.get(p.id) ?? null),
  );
  return putWorkspacePayload(token, projects);
}

/**
 * If the cloud is empty but this browser has boards, upload once (migration / first device).
 */
export async function pushLocalWorkspaceIfCloudEmpty(): Promise<void> {
  await hydrateAuthSession();
  const session = await getSession();
  if (!session?.access_token) return;

  const local = readWorkspace();
  if (local.projects.length === 0) return;

  const head = await fetch("/api/workspace", {
    method: "GET",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!head.ok) return;

  const data = (await head.json()) as { projects?: unknown[] };
  const remoteCount = Array.isArray(data.projects) ? data.projects.length : 0;
  if (remoteCount > 0) return;

  await pushWorkspaceToCloud();
}
