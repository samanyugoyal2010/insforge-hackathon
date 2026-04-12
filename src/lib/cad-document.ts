import type { CadOpenScadParameter } from "@/lib/cadam/parameter-types";
import {
  clampShell,
  DEFAULT_SHELL,
  type ShellParams,
} from "@/lib/cad-shell";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export type CadBooleanOp = "union" | "subtract";

export type CadShapeKind = "box" | "cylinder" | "sphere" | "roundedBox";

export type CadFeature = {
  id?: string;
  op: CadBooleanOp;
  shape: CadShapeKind;
  /** Center position in mm (right-handed: X width, Y height, Z length/depth). */
  positionMm: { x: number; y: number; z: number };
  rotationDeg?: { x: number; y: number; z: number };
  /** box / roundedBox full extents (mm). */
  sizeMm?: { x: number; y: number; z: number };
  radiusMm?: number;
  /** Cylinder / sphere vertical extent for cylinder (mm). */
  heightMm?: number;
  cornerRadiusMm?: number;
  label?: string;
};

/** View / cutaway (not a separate CSG feature—applied when baking the solid). */
export type CadOpenFaceMode = "none" | "front" | "top";

export type CadPresentation = {
  /** Remove the +Z “front” cap or +Y “top” so PCB/cavity read from orbit. */
  openFace?: CadOpenFaceMode;
  /** Fraction of depth (front) or height (top) carved away, ~0.35–0.7. */
  openFaceReveal?: number;
};

/** OpenSCAD source produced by CADAM-style codegen (GPL-3.0 upstream pipeline). */
export type CadOpenscadPayload = {
  code: string;
  parameters: CadOpenScadParameter[];
};

export type CadDocument = {
  version: 2;
  features: CadFeature[];
  presentation?: CadPresentation;
  openscad?: CadOpenscadPayload;
};

export function defaultOpenPresentation(): CadPresentation {
  return { openFace: "front", openFaceReveal: 0.52 };
}

function clampMm(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function toVec3(
  v: unknown,
): { x: number; y: number; z: number } | null {
  if (!isRecord(v)) return null;
  const x = typeof v.x === "number" ? v.x : typeof v.X === "number" ? v.X : NaN;
  const y = typeof v.y === "number" ? v.y : typeof v.Y === "number" ? v.Y : NaN;
  const z = typeof v.z === "number" ? v.z : typeof v.Z === "number" ? v.Z : NaN;
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

function toSize(
  v: unknown,
): { x: number; y: number; z: number } | null {
  if (!isRecord(v)) return null;
  const x =
    typeof v.x === "number"
      ? v.x
      : typeof v.width === "number"
        ? v.width
        : typeof v.w === "number"
          ? v.w
          : NaN;
  const y =
    typeof v.y === "number"
      ? v.y
      : typeof v.height === "number"
        ? v.height
        : typeof v.h === "number"
          ? v.h
          : NaN;
  const z =
    typeof v.z === "number"
      ? v.z
      : typeof v.depth === "number"
        ? v.depth
        : typeof v.length === "number"
          ? v.length
          : typeof v.d === "number"
            ? v.d
            : NaN;
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

function normalizeOp(raw: unknown): CadBooleanOp | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s === "union" || s === "combine" || s === "add" || s === "join")
    return "union";
  if (
    s === "subtract" ||
    s === "remove" ||
    s === "cut" ||
    s === "difference" ||
    s === "sub"
  )
    return "subtract";
  return null;
}

function normalizeShape(raw: unknown): CadShapeKind | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (s === "box" || s === "cube") return "box";
  if (s === "cylinder" || s === "cyl") return "cylinder";
  if (s === "sphere" || s === "ball") return "sphere";
  if (s === "roundedbox" || s === "roundbox" || s === "filletbox")
    return "roundedBox";
  return null;
}

export function clampFeature(f: CadFeature): CadFeature {
  const pos = {
    x: clampMm(f.positionMm.x, -500, 500),
    y: clampMm(f.positionMm.y, -500, 500),
    z: clampMm(f.positionMm.z, -500, 500),
  };
  const rot = f.rotationDeg
    ? {
        x: clampMm(f.rotationDeg.x, -360, 360),
        y: clampMm(f.rotationDeg.y, -360, 360),
        z: clampMm(f.rotationDeg.z, -360, 360),
      }
    : undefined;
  let sizeMm = f.sizeMm;
  if (sizeMm) {
    sizeMm = {
      x: clampMm(sizeMm.x, 0.5, 500),
      y: clampMm(sizeMm.y, 0.5, 200),
      z: clampMm(sizeMm.z, 0.5, 500),
    };
  }
  const radiusMm =
    f.radiusMm != null ? clampMm(f.radiusMm, 0.2, 250) : undefined;
  const heightMm =
    f.heightMm != null ? clampMm(f.heightMm, 0.5, 500) : undefined;
  const cornerRadiusMm =
    f.cornerRadiusMm != null
      ? clampMm(f.cornerRadiusMm, 0, 48)
      : undefined;
  return {
    ...f,
    positionMm: pos,
    rotationDeg: rot,
    sizeMm,
    radiusMm,
    heightMm,
    cornerRadiusMm,
  };
}

export function clampPresentation(p: CadPresentation): CadPresentation {
  const openFace: CadOpenFaceMode =
    p.openFace === "top" ? "top" : p.openFace === "none" ? "none" : "front";
  const openFaceReveal = clampMm(p.openFaceReveal ?? 0.52, 0.12, 0.9);
  return { openFace, openFaceReveal };
}

function normalizeOpenFaceMode(raw: unknown): CadOpenFaceMode | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "none" || s === "closed") return "none";
  if (s === "top" || s === "open_top" || s === "lid_off") return "top";
  if (
    s === "front" ||
    s === "open_front" ||
    s === "front_panel" ||
    s === "see_inside" ||
    s === "cutaway" ||
    s === "interior" ||
    s === "inside"
  )
    return "front";
  return undefined;
}

function parsePresentationRecord(raw: unknown): CadPresentation | null {
  if (!isRecord(raw)) return null;
  const of = normalizeOpenFaceMode(raw.openFace);
  const rev =
    typeof raw.openFaceReveal === "number" && Number.isFinite(raw.openFaceReveal)
      ? raw.openFaceReveal
      : undefined;
  if (of == null && rev == null) return null;
  return clampPresentation({
    openFace: of ?? "front",
    openFaceReveal: rev ?? 0.52,
  });
}

function parsePresentationFromDocumentJson(
  o: Record<string, unknown>,
): CadPresentation | undefined {
  const nested = parsePresentationRecord(o.presentation);
  if (nested) return nested;
  const of = normalizeOpenFaceMode(o.openFace);
  if (of != null || typeof o.openFaceReveal === "number") {
    return clampPresentation({
      openFace: of ?? "front",
      openFaceReveal:
        typeof o.openFaceReveal === "number" ? o.openFaceReveal : 0.52,
    });
  }
  return undefined;
}

function parsePresentationFromToolArgs(
  args: Record<string, unknown>,
): Partial<CadPresentation> | null {
  const nested = isRecord(args.presentation)
    ? parsePresentationRecord(args.presentation)
    : null;
  const of = normalizeOpenFaceMode(args.openFace);
  const rev =
    typeof args.openFaceReveal === "number" && Number.isFinite(args.openFaceReveal)
      ? args.openFaceReveal
      : undefined;
  if (!nested && of == null && rev == null) return null;
  return {
    ...(nested ?? {}),
    ...(of != null ? { openFace: of } : {}),
    ...(rev != null ? { openFaceReveal: rev } : {}),
  };
}

function mergePresentation(
  prev: CadPresentation | undefined,
  patch: Partial<CadPresentation> | null,
): CadPresentation {
  if (!patch || Object.keys(patch).length === 0) {
    return prev ?? defaultOpenPresentation();
  }
  return clampPresentation({
    openFace: patch.openFace ?? prev?.openFace ?? "front",
    openFaceReveal: patch.openFaceReveal ?? prev?.openFaceReveal ?? 0.52,
  });
}

function parseOpenscadPayload(raw: unknown): CadOpenscadPayload | undefined {
  if (!isRecord(raw)) return undefined;
  const code = typeof raw.code === "string" ? raw.code.trim() : "";
  if (!code) return undefined;
  const parameters = Array.isArray(raw.parameters)
    ? (raw.parameters as CadOpenScadParameter[])
    : [];
  return { code, parameters };
}

export function clampCadDocument(doc: CadDocument): CadDocument {
  const features = doc.features.map(clampFeature).filter((f) => {
    if (f.shape === "box" || f.shape === "roundedBox") {
      return (
        f.sizeMm != null &&
        f.sizeMm.x > 0 &&
        f.sizeMm.y > 0 &&
        f.sizeMm.z > 0
      );
    }
    if (f.shape === "cylinder" || f.shape === "sphere") {
      return f.radiusMm != null && f.radiusMm > 0;
    }
    return false;
  });
  const out: CadDocument = { version: 2, features };
  if (doc.presentation) {
    out.presentation = clampPresentation(doc.presentation);
  }
  const osc = doc.openscad?.code?.trim()
    ? {
        code: doc.openscad.code.trim(),
        parameters: doc.openscad.parameters ?? [],
      }
    : undefined;
  if (osc) {
    out.openscad = osc;
  }
  if (features.length === 0 && !out.openscad) {
    return {
      version: 2,
      features: [],
      presentation: out.presentation ?? defaultOpenPresentation(),
    };
  }
  return out;
}

/**
 * Hints when the document is still a minimal enclosure in feature-CSG form
 * (no OpenSCAD). Skipped if OpenSCAD is present — detail may live in code.
 */
export function cadTopologyWarnings(doc: CadDocument): string[] {
  if (doc.openscad?.code?.trim()) return [];
  if (doc.features.length === 0) return [];
  const subs = doc.features.filter((f) => f.op === "subtract");
  if (subs.length <= 1 && doc.features.length <= 2) {
    return [
      "CAD is still only a basic shell (outer solid and at most one cavity). Ask for ports, vents, buttons, or mounting holes — or use OpenSCAD — so the model gains real cutouts.",
    ];
  }
  return [];
}

/** Build a 2-feature shell (outer union + inner cavity subtract) from box params. */
export function shellParamsToDocument(s: ShellParams): CadDocument {
  const c = clampShell(s);
  const w = c.widthMm;
  const h = c.heightMm;
  const d = c.lengthMm;
  const wall = c.wallMm;
  const r = c.cornerRadiusMm;
  const innerW = Math.max(w - 2 * wall, 1);
  const innerH = Math.max(h - 2 * wall, 1);
  const innerD = Math.max(d - 2 * wall, 1);
  const innerR = Math.max(r - wall, 0);
  return clampCadDocument({
    version: 2,
    features: [
      {
        op: "union",
        shape: "roundedBox",
        positionMm: { x: 0, y: 0, z: 0 },
        sizeMm: { x: w, y: h, z: d },
        cornerRadiusMm: r,
        label: "outer shell",
      },
      {
        op: "subtract",
        shape: "roundedBox",
        positionMm: { x: 0, y: 0, z: 0 },
        sizeMm: { x: innerW, y: innerH, z: innerD },
        cornerRadiusMm: innerR,
        label: "cavity",
      },
    ],
    presentation: defaultOpenPresentation(),
  });
}

/** Best-effort read of enclosure sizes from a 2-feature shell+cavity doc. */
export function documentToSyntheticShell(doc: CadDocument): ShellParams {
  const f0 = doc.features[0];
  if (
    f0?.op === "union" &&
    (f0.shape === "roundedBox" || f0.shape === "box") &&
    f0.sizeMm &&
    Math.abs(f0.positionMm.x) < 1e-3 &&
    Math.abs(f0.positionMm.y) < 1e-3 &&
    Math.abs(f0.positionMm.z) < 1e-3
  ) {
    const w = f0.sizeMm.x;
    const h = f0.sizeMm.y;
    const d = f0.sizeMm.z;
    const r = f0.cornerRadiusMm ?? 0;
    const f1 = doc.features[1];
    let wall = DEFAULT_SHELL.wallMm;
    if (
      f1?.op === "subtract" &&
      (f1.shape === "roundedBox" || f1.shape === "box") &&
      f1.sizeMm
    ) {
      wall = Math.max(0.4, (w - f1.sizeMm.x) / 2);
    }
    return clampShell({
      lengthMm: d,
      widthMm: w,
      heightMm: h,
      wallMm: wall,
      cornerRadiusMm: r,
    });
  }
  return { ...DEFAULT_SHELL };
}

export function applyLegacyShellPatch(
  doc: CadDocument,
  patch: Partial<ShellParams>,
): CadDocument {
  const base = documentToSyntheticShell(doc);
  const next = clampShell({ ...base, ...patch });
  const rebuilt = shellParamsToDocument(next);
  return {
    ...rebuilt,
    presentation: doc.presentation ?? rebuilt.presentation,
  };
}

function parseFeatureRow(raw: unknown, index: number): CadFeature | null {
  if (!isRecord(raw)) return null;
  const op = normalizeOp(raw.op ?? raw.operation ?? raw.mode);
  const shape = normalizeShape(raw.shape ?? raw.type ?? raw.primitive);
  if (!op || !shape) return null;

  let positionMm =
    toVec3(raw.positionMm) ??
    toVec3(raw.position) ??
    (Array.isArray(raw.xyz) && raw.xyz.length >= 3
      ? {
          x: Number(raw.xyz[0]),
          y: Number(raw.xyz[1]),
          z: Number(raw.xyz[2]),
        }
      : null);
  if (!positionMm || !Object.values(positionMm).every(Number.isFinite)) {
    positionMm = { x: 0, y: 0, z: 0 };
  }

  const rotationDeg =
    toVec3(raw.rotationDeg) ??
    toVec3(raw.rotation) ??
    (isRecord(raw.eulerDeg) ? toVec3(raw.eulerDeg) : null) ??
    undefined;

  const sizeMm =
    toSize(raw.sizeMm) ??
    toSize(raw.size) ??
    (isRecord(raw.dimensions) ? toSize(raw.dimensions) : null) ??
    undefined;

  const radiusMm =
    typeof raw.radiusMm === "number"
      ? raw.radiusMm
      : typeof raw.radius === "number"
        ? raw.radius
        : undefined;

  const heightMm =
    typeof raw.heightMm === "number"
      ? raw.heightMm
      : typeof raw.height === "number"
        ? raw.height
        : undefined;

  const cornerRadiusMm =
    typeof raw.cornerRadiusMm === "number"
      ? raw.cornerRadiusMm
      : typeof raw.cornerRadius === "number"
        ? raw.cornerRadius
        : undefined;

  const label =
    typeof raw.label === "string"
      ? raw.label.slice(0, 120)
      : typeof raw.name === "string"
        ? raw.name.slice(0, 120)
        : undefined;

  return clampFeature({
    id: typeof raw.id === "string" ? raw.id : `f-${index}`,
    op,
    shape,
    positionMm,
    rotationDeg: rotationDeg ?? undefined,
    sizeMm: sizeMm ?? undefined,
    radiusMm,
    heightMm,
    cornerRadiusMm,
    label,
  });
}

export function parseCadFeaturesFromToolArgs(
  raw: unknown,
): CadFeature[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CadFeature[] = [];
  for (let i = 0; i < raw.length; i++) {
    const f = parseFeatureRow(raw[i], i);
    if (f) out.push(f);
  }
  return out.length > 0 ? out : null;
}

export function parseCadDocumentJson(raw: string): CadDocument | null {
  try {
    const o = JSON.parse(raw) as unknown;
    return parseCadDocumentUnknown(o);
  } catch {
    return null;
  }
}

export function parseCadDocumentUnknown(o: unknown): CadDocument | null {
  if (!isRecord(o)) return null;
  if (o.version === 2 && Array.isArray(o.features)) {
    const featuresFromParse = parseCadFeaturesFromToolArgs(o.features);
    const openscad = parseOpenscadPayload(o.openscad);
    let features: CadFeature[];
    if (featuresFromParse) {
      features = featuresFromParse;
    } else if (o.features.length === 0) {
      features = [];
    } else {
      return null;
    }
    if (features.length === 0 && !openscad) {
      return clampCadDocument({
        version: 2,
        features: [],
        presentation:
          parsePresentationFromDocumentJson(o) ?? defaultOpenPresentation(),
      });
    }
    return clampCadDocument({
      version: 2,
      features,
      presentation:
        parsePresentationFromDocumentJson(o) ?? defaultOpenPresentation(),
      ...(openscad ? { openscad } : {}),
    });
  }
  /** Legacy v1: flat shell params */
  const lengthMm = typeof o.lengthMm === "number" ? o.lengthMm : NaN;
  const widthMm = typeof o.widthMm === "number" ? o.widthMm : NaN;
  const heightMm = typeof o.heightMm === "number" ? o.heightMm : NaN;
  const wallMm = typeof o.wallMm === "number" ? o.wallMm : NaN;
  const cornerRadiusMm =
    typeof o.cornerRadiusMm === "number" ? o.cornerRadiusMm : NaN;
  if ([lengthMm, widthMm, heightMm, wallMm, cornerRadiusMm].every(Number.isFinite)) {
    return shellParamsToDocument(
      clampShell({
        lengthMm,
        widthMm,
        heightMm,
        wallMm,
        cornerRadiusMm,
      }),
    );
  }
  return null;
}

/** Empty scene until the agent emits geometry or OpenSCAD (no placeholder shell). */
export function defaultCadDocument(): CadDocument {
  return clampCadDocument({
    version: 2,
    features: [],
    presentation: defaultOpenPresentation(),
  });
}

function legacyPatchFromArgs(
  args: Record<string, unknown>,
): Partial<ShellParams> | null {
  const lengthMm = typeof args.lengthMm === "number" ? args.lengthMm : undefined;
  const widthMm = typeof args.widthMm === "number" ? args.widthMm : undefined;
  const heightMm = typeof args.heightMm === "number" ? args.heightMm : undefined;
  const wallMm = typeof args.wallMm === "number" ? args.wallMm : undefined;
  const cornerRadiusMm =
    typeof args.cornerRadiusMm === "number" ? args.cornerRadiusMm : undefined;
  if (
    lengthMm == null &&
    widthMm == null &&
    heightMm == null &&
    wallMm == null &&
    cornerRadiusMm == null
  ) {
    return null;
  }
  return {
    ...(lengthMm != null ? { lengthMm } : {}),
    ...(widthMm != null ? { widthMm } : {}),
    ...(heightMm != null ? { heightMm } : {}),
    ...(wallMm != null ? { wallMm } : {}),
    ...(cornerRadiusMm != null ? { cornerRadiusMm } : {}),
  };
}

/** Merge `update_cad` tool args into a CAD document (features list and/or legacy dims). */
export function applyCadToolArgs(
  doc: CadDocument,
  args: Record<string, unknown>,
): CadDocument {
  const ensureShellCavity = (features: CadFeature[]): CadFeature[] => {
    const hasSubtract = features.some((f) => f.op === "subtract");
    if (hasSubtract || features.length === 0) return features;
    const outer = features.find((f) => f.op === "union");
    if (!outer) return features;
    if (
      (outer.shape !== "box" && outer.shape !== "roundedBox") ||
      !outer.sizeMm
    ) {
      return features;
    }
    const wall = 2.4;
    const inner = {
      x: Math.max(outer.sizeMm.x - wall * 2, 1),
      y: Math.max(outer.sizeMm.y - wall * 2, 1),
      z: Math.max(outer.sizeMm.z - wall * 2, 1),
    };
    // If shell is too small to hold a cavity, keep original as-is.
    if (inner.x <= 1 || inner.y <= 1 || inner.z <= 1) return features;
    return [
      ...features,
      clampFeature({
        op: "subtract",
        shape: outer.shape,
        positionMm: { ...outer.positionMm },
        rotationDeg: outer.rotationDeg
          ? { ...outer.rotationDeg }
          : undefined,
        sizeMm: inner,
        cornerRadiusMm:
          outer.shape === "roundedBox"
            ? Math.max((outer.cornerRadiusMm ?? 0) - wall, 0)
            : undefined,
        label: "auto cavity",
      }),
    ];
  };

  const presPatch = parsePresentationFromToolArgs(args);

  const fromFeatures = parseCadFeaturesFromToolArgs(
    args.cadFeatures ?? args.features,
  );
  if (fromFeatures && fromFeatures.length > 0) {
    const normalizedFeatures = ensureShellCavity(fromFeatures);
    return clampCadDocument({
      version: 2,
      features: normalizedFeatures,
      presentation: mergePresentation(doc.presentation, presPatch),
    });
  }
  const legacy = legacyPatchFromArgs(args);
  if (legacy && Object.keys(legacy).length > 0) {
    const next = applyLegacyShellPatch(doc, legacy);
    return clampCadDocument({
      ...next,
      presentation: mergePresentation(next.presentation, presPatch),
      ...(doc.openscad ? { openscad: doc.openscad } : {}),
    });
  }
  if (presPatch) {
    return clampCadDocument({
      ...doc,
      presentation: mergePresentation(doc.presentation, presPatch),
    });
  }
  return doc;
}
