"use client";

import { useSyncExternalStore } from "react";

/**
 * Stable `window.location.origin` on the client; empty on SSR.
 * Avoids useEffect+setState patterns that trip strict React lint rules.
 */
export function useClientOrigin(): string {
  return useSyncExternalStore(
    () => () => {},
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    () => "",
  );
}
