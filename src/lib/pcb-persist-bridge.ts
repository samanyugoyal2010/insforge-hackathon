/**
 * Lets `pushWorkspaceToCloud` / Stripe checkout flush in-memory PCB into dual-storage
 * before reading `loadCircuitronForProject` (which only sees persisted data).
 */

let flushHandler: (() => void) | null = null;

export function setPcbFlushHandler(handler: (() => void) | null): void {
  flushHandler = handler;
}

export function flushPcbToDualStorage(): void {
  try {
    flushHandler?.();
  } catch {
    /* ignore */
  }
}
