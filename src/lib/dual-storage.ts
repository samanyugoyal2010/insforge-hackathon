/**
 * Mirror sessionStorage → localStorage for project data so Stripe redirects,
 * new tabs, and session quirks don't wipe CAD/PCB/BOM/firmware/workspace.
 */

const LS_MIRROR_PREFIX = "node0-mirror:";

export function dualStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
  try {
    localStorage.setItem(LS_MIRROR_PREFIX + key, value);
  } catch {
    /* quota */
  }
}

export function dualStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  let fromSession: string | null = null;
  try {
    fromSession = sessionStorage.getItem(key);
  } catch {
    fromSession = null;
  }
  if (fromSession !== null) return fromSession;

  let fromLocal: string | null = null;
  try {
    fromLocal = localStorage.getItem(LS_MIRROR_PREFIX + key);
  } catch {
    fromLocal = null;
  }
  if (fromLocal !== null) {
    try {
      sessionStorage.setItem(key, fromLocal);
    } catch {
      /* ignore */
    }
    return fromLocal;
  }
  return null;
}

export function dualStorageRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LS_MIRROR_PREFIX + key);
  } catch {
    /* ignore */
  }
}
