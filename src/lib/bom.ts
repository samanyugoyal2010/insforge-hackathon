export type BomLine = {
  id: string;
  designators: string;
  description: string;
  mpn: string;
  manufacturer: string;
  qty: number;
  footprint: string;
  notes: string;
};

export type BomDocument = {
  lines: BomLine[];
};

export const EMPTY_BOM: BomDocument = { lines: [] };

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `bom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createBomLine(overrides: Partial<BomLine> = {}): BomLine {
  return {
    id: newId(),
    designators: "",
    description: "",
    mpn: "",
    manufacturer: "",
    qty: 1,
    footprint: "",
    notes: "",
    ...overrides,
  };
}

function clampQty(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1_000_000, Math.max(1, Math.floor(n)));
}

/** Normalize object keys for synonym lookup (MPN → mpn, part number → part_number). */
function normKey(s: string): string {
  return s.toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * First non-empty string value on `line` whose key matches any synonym (case / spacing insensitive).
 * Handles model output like `MPN`, `designator`, `part_number`, LCSC columns, etc.
 */
export function pickBomStringField(
  line: Record<string, unknown>,
  synonyms: string[],
): string {
  const byNorm = new Map<string, string>();
  for (const [k, v] of Object.entries(line)) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t) continue;
    byNorm.set(normKey(k), t);
  }
  for (const syn of synonyms) {
    const hit = byNorm.get(normKey(syn));
    if (hit) return hit;
  }
  return "";
}

export function pickBomQty(line: Record<string, unknown>): number {
  const keys = ["qty", "quantity", "Qty", "QTY", "count"];
  for (const k of keys) {
    const raw = line[k];
    if (typeof raw === "number" && Number.isFinite(raw)) return clampQty(raw);
    if (typeof raw === "string" && raw.trim() !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampQty(n);
    }
  }
  const byNorm = new Map<string, unknown>();
  for (const [k, v] of Object.entries(line)) {
    byNorm.set(normKey(k), v);
  }
  for (const syn of ["qty", "quantity", "count"]) {
    const raw = byNorm.get(normKey(syn));
    if (typeof raw === "number" && Number.isFinite(raw)) return clampQty(raw);
    if (typeof raw === "string" && raw.trim() !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampQty(n);
    }
  }
  return 1;
}

function normalizeLine(raw: Record<string, unknown>, index: number): BomLine | null {
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : `import-${index}-${newId()}`;
  const qty = pickBomQty(raw);

  return {
    id,
    designators: pickBomStringField(raw, [
      "designators",
      "designator",
      "ref",
      "refs",
      "reference",
    ]),
    description: pickBomStringField(raw, [
      "description",
      "component",
      "value",
      "part",
      "item",
    ]),
    mpn: pickBomStringField(raw, [
      "mpn",
      "MPN",
      "part_number",
      "partnumber",
      "manufacturer_part_number",
      "manufacturer part number",
      "lcsc",
      "lcsc_part",
      "jlc",
      "sku",
      "vendor_part",
      "catalog",
    ]),
    manufacturer: pickBomStringField(raw, [
      "manufacturer",
      "mfr",
      "vendor",
      "brand",
    ]),
    qty,
    footprint: pickBomStringField(raw, [
      "footprint",
      "fp",
      "package",
      "land_pattern",
      "pcb_footprint",
    ]),
    notes: pickBomStringField(raw, ["notes", "note", "comment", "comments"]),
  };
}

export function parseBomDocumentJson(raw: string): BomDocument | null {
  try {
    const o = JSON.parse(raw) as unknown;
    let arr: unknown[];
    if (Array.isArray(o)) {
      arr = o;
    } else if (o && typeof o === "object" && Array.isArray((o as BomDocument).lines)) {
      arr = (o as BomDocument).lines;
    } else {
      return null;
    }
    const lines: BomLine[] = [];
    for (let i = 0; i < arr.length; i++) {
      const row = arr[i];
      if (!row || typeof row !== "object") continue;
      const line = normalizeLine(row as Record<string, unknown>, i);
      if (line) lines.push(line);
    }
    return { lines };
  } catch {
    return null;
  }
}

function escapeCsvField(s: string) {
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function bomToCsv(doc: BomDocument): string {
  const headers = [
    "Designators",
    "Description",
    "MPN",
    "Manufacturer",
    "Qty",
    "Footprint",
    "Notes",
  ];
  const rows = doc.lines.map((l) => [
    l.designators,
    l.description,
    l.mpn,
    l.manufacturer,
    String(l.qty),
    l.footprint,
    l.notes,
  ]);
  return [headers, ...rows]
    .map((r) => r.map(escapeCsvField).join(","))
    .join("\r\n");
}

export function downloadBomCsv(filenameStem: string, doc: BomDocument) {
  const csv = bomToCsv(doc);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filenameStem.endsWith(".csv")
    ? filenameStem
    : `${filenameStem}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
