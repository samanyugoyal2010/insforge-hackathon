"use client";

import {
  defaultCadDocument,
  parseCadDocumentJson,
  type CadDocument,
} from "@/lib/cad-document";
import { dualStorageGet, dualStorageSet } from "@/lib/dual-storage";
import * as React from "react";

const STORAGE_PREFIX = "node0-cad-shell:";

function load(projectId: string): CadDocument {
  if (typeof window === "undefined") return defaultCadDocument();
  try {
    const raw = dualStorageGet(STORAGE_PREFIX + projectId);
    if (!raw) return defaultCadDocument();
    const parsed = parseCadDocumentJson(raw);
    return parsed ?? defaultCadDocument();
  } catch {
    return defaultCadDocument();
  }
}

function save(projectId: string, doc: CadDocument) {
  try {
    dualStorageSet(STORAGE_PREFIX + projectId, JSON.stringify(doc));
  } catch {
    /* ignore */
  }
}

export function useCadShell(
  projectId: string | null,
  /** When this changes (e.g. cloud pull finished), reload from sessionStorage */
  reloadKey?: unknown,
) {
  const [cad, setCad] = React.useState<CadDocument>(() => defaultCadDocument());

  React.useEffect(() => {
    if (!projectId) {
      setCad(defaultCadDocument());
      return;
    }
    setCad(load(projectId));
  }, [projectId, reloadKey]);

  const update = React.useCallback(
    (next: CadDocument | ((prev: CadDocument) => CadDocument)) => {
      setCad((prev) => {
        const resolved =
          typeof next === "function"
            ? (next as (p: CadDocument) => CadDocument)(prev)
            : next;
        if (projectId) save(projectId, resolved);
        return resolved;
      });
    },
    [projectId],
  );

  return { cad, setCad };
}
