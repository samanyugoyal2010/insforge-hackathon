import type { BomDocument } from "@/lib/bom";
import type { ShellParams } from "@/lib/cad-shell";
import { CAD_CONTEXT_PRINTABILITY_BLOCK } from "@/lib/cadam/prompts";

export type PcbOutlineHints = {
  widthMm?: number;
  heightMm?: number;
  layerCount?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Extract board outline from `update_pcb`-style tool args. */
export function pcbHintsFromToolArgs(
  args: Record<string, unknown>,
): PcbOutlineHints {
  const bd = isRecord(args.boardDimensions) ? args.boardDimensions : null;
  const widthMm =
    toNumber(args.widthMm) ??
    toNumber(args.width) ??
    toNumber(bd?.width) ??
    toNumber(bd?.w);
  const heightMm =
    toNumber(args.heightMm) ??
    toNumber(args.height) ??
    toNumber(bd?.height) ??
    toNumber(bd?.h);
  const layerCount = toNumber(args.layerCount);
  const out: PcbOutlineHints = {};
  if (widthMm != null) out.widthMm = widthMm;
  if (heightMm != null) out.heightMm = heightMm;
  if (layerCount != null) out.layerCount = layerCount;
  return out;
}

function summarizeBom(bom: BomDocument, maxLines = 24): string {
  if (!bom.lines.length) return "(no BOM lines yet)";
  const lines = bom.lines.slice(0, maxLines).map((l) => {
    const bits = [
      l.designators || "?",
      l.description || l.mpn || "?",
      l.footprint ? `fp:${l.footprint}` : "",
      `×${l.qty}`,
    ].filter(Boolean);
    return `- ${bits.join(" — ")}`;
  });
  const more =
    bom.lines.length > maxLines
      ? `\n… +${bom.lines.length - maxLines} more lines`
      : "";
  return lines.join("\n") + more;
}

function summarizeShell(shell: ShellParams): string {
  return `Enclosure target (mm): L×W×H = ${shell.lengthMm}×${shell.widthMm}×${shell.heightMm}, wall ${shell.wallMm}, corner R ${shell.cornerRadiusMm}`;
}

/**
 * Extra context appended to the OpenSCAD codegen user message (BOM, PCB outline, enclosure dims).
 */
export function formatCadGenerationContextBlock(input: {
  bom: BomDocument;
  shell: ShellParams;
  pcbHints?: PcbOutlineHints | null;
  conversationContext?: string;
}): string {
  const parts: string[] = [
    CAD_CONTEXT_PRINTABILITY_BLOCK,
    "",
    "## Hardware context (use for internal clearances, ports, and overall size)",
    summarizeShell(input.shell),
    "",
    "## Bill of materials (represent major parts with cutouts / keepouts where sensible)",
    summarizeBom(input.bom),
  ];

  if (input.pcbHints?.widthMm != null && input.pcbHints?.heightMm != null) {
    parts.push(
      "",
      "## PCB outline (mm)",
      `Board: ${input.pcbHints.widthMm} × ${input.pcbHints.heightMm} mm` +
        (input.pcbHints.layerCount != null
          ? `, ${input.pcbHints.layerCount} layer(s)`
          : ""),
      "Use this for INTERNAL keepout and standoffs only. Do NOT shrink the outer enclosure to a flat slab the size of the PCB—keep substantial interior height/depth for battery, magnet, buzzer, and wiring unless the user explicitly asked for an ultra-thin tag.",
      "Leave clearance around the board inside the enclosure; add a floor or standoffs if appropriate.",
    );
  }

  if (input.conversationContext?.trim()) {
    parts.push("", "## User conversation (intent)", input.conversationContext.trim());
  }

  return parts.join("\n");
}

/** Build a natural-language design brief from `update_cad` tool args JSON. */
export function cadIntentDescriptionFromArgs(
  args: Record<string, unknown>,
  projectName?: string,
): string {
  const productHint = projectName?.trim()
    ? `for a "${projectName.trim()}" product`
    : "";
  const features = args.cadFeatures ?? args.features;
  if (Array.isArray(features) && features.length > 0) {
    return `Build a purpose-designed 3D-printable enclosure${productHint ? ` ${productHint}` : ""} matching this CSG feature list (interpret in OpenSCAD; make the shape recognizably match the product type—not a generic box): ${JSON.stringify(features)}`;
  }
  const dims = [
    args.lengthMm != null ? `lengthMm=${args.lengthMm}` : "",
    args.widthMm != null ? `widthMm=${args.widthMm}` : "",
    args.heightMm != null ? `heightMm=${args.heightMm}` : "",
    args.wallMm != null ? `wallMm=${args.wallMm}` : "",
    args.cornerRadiusMm != null ? `cornerRadiusMm=${args.cornerRadiusMm}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  if (dims) {
    return `Build a purpose-designed 3D-printable enclosure${productHint ? ` ${productHint}` : ""} with outer dimensions: ${dims}. ` +
      `The enclosure must look like the actual product (not a featureless box). Add product-specific geometry: shaped contours, functional openings, mounting features, labels/emboss matching the product type. ` +
      `Use wall_thickness >= 2mm (parameter) and difference(outer,inner) for a hollow shell. Include interior cavity for PCB.`;
  }
  return `Build a purpose-designed 3D-printable enclosure${productHint ? ` ${productHint}` : ""}. ` +
    `The shape must be recognizably related to the product type (not a featureless rectangle). Add product-specific geometry: contoured exterior, functional openings/ports, mounting features, embossed labels. ` +
    `wall_thickness >= 2mm, solid hollow shell (difference of thick outer and inset inner), interior for PCB, USB or power cutout, vents if needed.`;
}
