"use client";

import {
  EMPTY_BOM,
  parseBomDocumentJson,
  type BomDocument,
} from "@/lib/bom";
import { dualStorageGet, dualStorageSet } from "@/lib/dual-storage";
import * as React from "react";

const STORAGE_PREFIX = "node0-bom:";

function load(projectId: string): BomDocument {
  if (typeof window === "undefined") return EMPTY_BOM;
  try {
    const raw = dualStorageGet(STORAGE_PREFIX + projectId);
    if (!raw) return EMPTY_BOM;
    const parsed = parseBomDocumentJson(raw);
    return parsed ?? EMPTY_BOM;
  } catch {
    return EMPTY_BOM;
  }
}

function save(projectId: string, doc: BomDocument) {
  try {
    dualStorageSet(STORAGE_PREFIX + projectId, JSON.stringify(doc));
  } catch {
    /* ignore */
  }
}

/** Write BOM for a project when the chat runs async and the user may have switched boards. */
export function persistBomForProject(projectId: string, doc: BomDocument) {
  save(projectId, doc);
}

export function useBom(
  projectId: string | null,
  /** When this changes (e.g. cloud pull finished), reload from sessionStorage */
  reloadKey?: unknown,
) {
  const [document, setDocument] = React.useState<BomDocument>(EMPTY_BOM);

  React.useEffect(() => {
    if (!projectId) {
      setDocument(EMPTY_BOM);
      return;
    }
    setDocument(load(projectId));
  }, [projectId, reloadKey]);

  const update = React.useCallback(
    (next: BomDocument | ((prev: BomDocument) => BomDocument)) => {
      setDocument((prev) => {
        const resolved =
          typeof next === "function"
            ? (next as (p: BomDocument) => BomDocument)(prev)
            : next;
        if (projectId) save(projectId, resolved);
        return resolved;
      });
    },
    [projectId],
  );

  return { document, setDocument: update };
}
