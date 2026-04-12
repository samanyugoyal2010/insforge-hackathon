import {
  defaultCadDocument,
  documentToSyntheticShell,
  parseCadDocumentUnknown,
} from "@/lib/cad-document";

const MM2_PER_CM2 = 100;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** PCB edge length bounds (mm) for quoting and cloud snapshot. */
export const FAB_PCB_MM_MIN = 8;
export const FAB_PCB_MM_MAX = 500;

export function clampPcbOutlineMm(
  widthMm: number,
  heightMm: number,
): { widthMm: number; heightMm: number } {
  const w = Math.min(FAB_PCB_MM_MAX, Math.max(FAB_PCB_MM_MIN, widthMm));
  const h = Math.min(FAB_PCB_MM_MAX, Math.max(FAB_PCB_MM_MIN, heightMm));
  return { widthMm: w, heightMm: h };
}

export function clampLayerCountForFab(n: number): number {
  return Math.min(12, Math.max(1, Math.round(n)));
}

export type FabQuoteLine = {
  key: "pcb" | "cad" | "platform";
  unitAmountCents: number;
  quantity: number;
  name: string;
  description: string;
};

export type FabQuoteResult = {
  lines: FabQuoteLine[];
  totalCents: number;
  pcbWidthMm: number;
  pcbHeightMm: number;
  pcbAreaCm2: number;
  pcbUsedDefaultOutline: boolean;
  cadVolumeDm3: number;
  cadShell: ReturnType<typeof documentToSyntheticShell>;
};

function parseCadFromRow(raw: unknown): ReturnType<typeof documentToSyntheticShell> {
  if (raw == null || typeof raw !== "object") {
    return documentToSyntheticShell(defaultCadDocument());
  }
  const doc = parseCadDocumentUnknown(raw);
  if (doc) return documentToSyntheticShell(doc);
  return documentToSyntheticShell(defaultCadDocument());
}

function pcbOutlineFromSnapshot(raw: unknown): {
  widthMm: number;
  heightMm: number;
  usedDefault: boolean;
} {
  const fallbackW = 80;
  const fallbackH = 50;
  if (!raw || typeof raw !== "object") {
    const c = clampPcbOutlineMm(fallbackW, fallbackH);
    return { ...c, usedDefault: true };
  }
  const v = raw as Record<string, unknown>;
  const w = typeof v.widthMm === "number" && Number.isFinite(v.widthMm) ? v.widthMm : null;
  const h = typeof v.heightMm === "number" && Number.isFinite(v.heightMm) ? v.heightMm : null;
  if (w == null || h == null) {
    const c = clampPcbOutlineMm(fallbackW, fallbackH);
    return { ...c, usedDefault: true };
  }
  return { ...clampPcbOutlineMm(w, h), usedDefault: false };
}

/**
 * Build fab quote line items (USD cents).
 * PCB/CAD **subtotals** scale with `qty` (area/volume × rate × qty).
 * Min/max envs clamp the **whole line** for that checkout (not × qty)—otherwise
 * a 5× small board order hits a punitive “minimum per piece × 5”.
 *
 * Default rates/mins are a **small-batch ballpark** (file prep + coordination),
 * not bare offshore fab—tune FAB_* to match your manufacturer.
 */
export function computeFabQuote(input: {
  pcbSnapshot: unknown;
  cadDocument: unknown;
  qty: number;
}): FabQuoteResult {
  const qty = Math.max(1, Math.min(1_000_000, Math.floor(input.qty)));
  const { widthMm, heightMm, usedDefault } = pcbOutlineFromSnapshot(input.pcbSnapshot);
  const areaMm2 = widthMm * heightMm;
  const pcbAreaCm2 = areaMm2 / MM2_PER_CM2;

  /** ~$0.14/cm²/board equivalent before qty; above commodity panel pricing, below boutique. */
  const pcbRate = envInt("FAB_PCB_CENTS_PER_CM2", 14);
  /** ~$14/dm³ × volume × qty; 3D print / enclosure prep varies widely. */
  const cadRate = envInt("FAB_CAD_CENTS_PER_DM3", 1400);
  const platformCents = envInt("FAB_PLATFORM_FEE_CENTS", 500);

  const pcbSubtotal = Math.round(pcbAreaCm2 * pcbRate * qty);
  /** One-time floor for the PCB line (~$22)—covers review without min×qty robbery. */
  const pcbMin = envInt("FAB_PCB_MIN_CENTS", 2200);
  const pcbMax = envInt("FAB_PCB_MAX_CENTS", 250_000);
  const pcbLineCents = Math.min(pcbMax, Math.max(pcbMin, pcbSubtotal));

  const shell = parseCadFromRow(input.cadDocument);
  const volMm3 = shell.lengthMm * shell.widthMm * shell.heightMm;
  const cadVolumeDm3 = volMm3 / 1_000_000;
  const cadSubtotal = Math.round(cadVolumeDm3 * cadRate * qty);
  const cadMin = envInt("FAB_CAD_MIN_CENTS", 900);
  const cadMax = envInt("FAB_CAD_MAX_CENTS", 80_000);
  const cadLineCents = Math.min(cadMax, Math.max(cadMin, cadSubtotal));

  const pcbDesc = usedDefault
    ? `Estimated default outline (${widthMm}×${heightMm} mm, ${pcbAreaCm2.toFixed(1)} cm² per board) × ${qty} pcs — update PCB in project for exact sizing.`
    : `${widthMm}×${heightMm} mm (${pcbAreaCm2.toFixed(1)} cm² per board) × ${qty} pcs.`;

  const cadDesc = `${shell.lengthMm.toFixed(1)}×${shell.widthMm.toFixed(1)}×${shell.heightMm.toFixed(1)} mm enclosure volume (${cadVolumeDm3.toFixed(2)} dm³) × ${qty} pcs.`;

  const lines: FabQuoteLine[] = [
    {
      key: "pcb",
      unitAmountCents: pcbLineCents,
      quantity: 1,
      name: "PCB fabrication (per run)",
      description: pcbDesc,
    },
    {
      key: "cad",
      unitAmountCents: cadLineCents,
      quantity: 1,
      name: "CAD / enclosure file prep",
      description: cadDesc,
    },
    {
      key: "platform",
      unitAmountCents: platformCents,
      quantity: 1,
      name: "Node0 platform & handling",
      description: "Order routing, design package intake, and support coordination.",
    },
  ];

  const totalCents = lines.reduce((s, l) => s + l.unitAmountCents * l.quantity, 0);

  return {
    lines,
    totalCents,
    pcbWidthMm: widthMm,
    pcbHeightMm: heightMm,
    pcbAreaCm2,
    pcbUsedDefaultOutline: usedDefault,
    cadVolumeDm3,
    cadShell: shell,
  };
}
