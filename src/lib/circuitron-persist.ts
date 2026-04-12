import { dualStorageGet, dualStorageRemove, dualStorageSet } from "@/lib/dual-storage";

const PREFIX = "node0-circuitron:";

/** Persist full PCB/schematic payload (session + localStorage mirror). */
export function persistCircuitronForProject(projectId: string, data: unknown) {
  if (typeof window === "undefined") return;
  try {
    dualStorageSet(PREFIX + projectId, JSON.stringify(data));
  } catch (e) {
    console.warn("[node0] PCB snapshot not persisted:", e);
  }
}

export function loadCircuitronForProject(projectId: string): unknown | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = dualStorageGet(PREFIX + projectId);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function clearCircuitronForProject(projectId: string) {
  if (typeof window === "undefined") return;
  dualStorageRemove(PREFIX + projectId);
}
