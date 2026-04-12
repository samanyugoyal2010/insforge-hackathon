export type ArPcbComponent = {
  ref: string;
  /** mm from board left edge */
  xMm: number;
  /** mm from board top edge */
  yMm: number;
  rotationDeg: number;
  layer: "top" | "bottom";
  footprint: string;
  value: string;
  /** Progressive assembly: part not yet “placed” at current guide step (dimmed in 3D). */
  assemblyPending?: boolean;
};

export type ArPcbScene = {
  widthMm: number;
  heightMm: number;
  /** Populated from pcbflow centroids when available; else fallback grid. */
  components: ArPcbComponent[];
  notice?: string;
};

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** FNV-1a — stable variant picker per board / project. */
function fnv1a32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickVariant(seed: string, modulo: number): number {
  if (modulo <= 1) return 0;
  return fnv1a32(seed) % modulo;
}

function guessBoardMmFromSvg(svg: string): { widthMm: number; heightMm: number } | null {
  const mmPair = svg.match(
    /\bwidth="([\d.]+)\s*mm"\s+height="([\d.]+)\s*mm"/i,
  );
  if (mmPair) {
    const pxW = Number(mmPair[1]);
    const pxH = Number(mmPair[2]);
    if (Number.isFinite(pxW) && Number.isFinite(pxH) && pxW > 0 && pxH > 0) {
      return {
        widthMm: clamp(pxW, 12, 280),
        heightMm: clamp(pxH, 12, 220),
      };
    }
  }

  const wPlain = svg.match(/\bwidth="([\d.]+)"/i)?.[1];
  const hPlain = svg.match(/\bheight="([\d.]+)"/i)?.[1];
  const vw = svg.match(/\bviewBox="([\d.\s-]+)"/i)?.[1];

  if (vw) {
    const parts = vw.trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const vbW = parts[2];
      const vbH = parts[3];
      // pcbflow svgout uses SCALE_FACTOR=4: viewBox units ≈ 0.25 mm.
      const wMm = clamp(vbW / 4, 12, 280);
      const hMm = clamp(vbH / 4, 12, 220);
      return { widthMm: wMm, heightMm: hMm };
    }
  }
  if (wPlain && hPlain) {
    const pxW = Number(wPlain);
    const pxH = Number(hPlain);
    if (Number.isFinite(pxW) && Number.isFinite(pxH) && pxW > 0 && pxH > 0) {
      return {
        widthMm: clamp(pxW / 5, 40, 200),
        heightMm: clamp(pxH / 5, 30, 150),
      };
    }
  }
  return null;
}

function extractRefsFromSvg(svg: string): string[] {
  const refs: string[] = [];
  const re = /<text\b[^>]*>([^<]{1,16})<\/text>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    const t = m[1].trim();
    if (/^[A-Z]{1,6}\d{1,4}$/i.test(t)) refs.push(t.toUpperCase());
  }
  return [...new Set(refs)];
}

export function footprintGuessFromRef(ref: string): { footprint: string; value: string } {
  const r = ref.toUpperCase();
  if (r.startsWith("U")) return { footprint: "IC", value: "IC" };
  if (r.startsWith("J") || r.startsWith("P")) return { footprint: "CONN", value: "Connector" };
  if (r.startsWith("SW")) return { footprint: "SW", value: "Switch" };
  if (r.startsWith("LED") || r.startsWith("D")) return { footprint: "LED", value: "LED/diode" };
  if (r.startsWith("R")) return { footprint: "0603", value: "Resistor" };
  if (r.startsWith("C")) return { footprint: "0603", value: "Capacitor" };
  return { footprint: "GENERIC", value: "Component" };
}

function parseNoteToFootprintValue(
  note: string,
  ref: string,
): { footprint: string; value: string } {
  const t = note.trim();
  if (!t) return footprintGuessFromRef(ref);
  const dash = t.indexOf("-");
  if (dash < 0) {
    return { footprint: t.slice(0, 32), value: footprintGuessFromRef(ref).value };
  }
  const fp = t.slice(0, dash).trim();
  const rest = t.slice(dash + 1).trim().replace(/-/g, " ");
  const base = footprintGuessFromRef(ref);
  return {
    footprint: fp.length > 0 ? fp.slice(0, 32) : base.footprint,
    value: rest.length > 0 ? rest.slice(0, 48) : base.value,
  };
}

function parseCsvRowLoose(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export type PcbflowCentroidRow = {
  ref: string;
  xMm: number;
  yMm: number;
  rotationDeg: number;
  layer: "top" | "bottom";
  note: string;
};

/** pcbflow `save_centroids` CSV (Designator, Center(X), Center(Y), Rotatation, Layer, Note). */
export function parsePcbflowCentroidsCsv(csv: string): PcbflowCentroidRow[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const out: PcbflowCentroidRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvRowLoose(lines[li]);
    if (cells.length < 5) continue;
    const ref = cells[0]?.trim().toUpperCase();
    if (!ref || !/^[A-Z]{1,6}\d{1,4}$/i.test(ref)) continue;
    const x = Number(cells[1]);
    const y = Number(cells[2]);
    const rot = Number(cells[3]);
    const layerRaw = (cells[4] ?? "top").toLowerCase();
    const layer: "top" | "bottom" = layerRaw.startsWith("bot") ? "bottom" : "top";
    const note = cells.slice(5).join(",").trim();
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({
      ref,
      xMm: x,
      yMm: y,
      rotationDeg: Number.isFinite(rot) ? rot : 0,
      layer,
      note,
    });
  }
  return out;
}

function boardEnvelopeFromCentroids(
  components: ArPcbComponent[],
  svgGuess: { widthMm: number; heightMm: number } | null,
): { widthMm: number; heightMm: number } {
  if (components.length === 0) {
    return svgGuess ?? { widthMm: 80, heightMm: 50 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of components) {
    minX = Math.min(minX, c.xMm);
    minY = Math.min(minY, c.yMm);
    maxX = Math.max(maxX, c.xMm);
    maxY = Math.max(maxY, c.yMm);
  }
  const pad = 6;
  const wb = Math.max(18, maxX - minX + 2 * pad);
  const hb = Math.max(18, maxY - minY + 2 * pad);
  if (svgGuess) {
    return {
      widthMm: Math.max(wb, svgGuess.widthMm),
      heightMm: Math.max(hb, svgGuess.heightMm),
    };
  }
  return { widthMm: wb, heightMm: hb };
}

/**
 * Prefer pcbflow centroids (real XY mm). pcbflow silk is stroked geometry, so SVG
 * usually has no parseable `<text>` refs — without centroids every board looked identical.
 */
export function arPcbSceneFromPcbflowAssets(params: {
  svg: string;
  centroidsCsv?: string | null;
}): ArPcbScene | null {
  const t = params.svg?.trim();
  if (!t || !t.includes("<svg")) return null;

  const svgBoard = guessBoardMmFromSvg(t);
  const csv = params.centroidsCsv?.trim();
  if (csv) {
    const rows = parsePcbflowCentroidsCsv(csv);
    if (rows.length > 0) {
      const components: ArPcbComponent[] = rows.map((r) => {
        const nv = parseNoteToFootprintValue(r.note, r.ref);
        const fg = footprintGuessFromRef(r.ref);
        return {
          ref: r.ref,
          xMm: r.xMm,
          yMm: r.yMm,
          rotationDeg: r.rotationDeg,
          layer: r.layer,
          footprint: nv.footprint !== "GENERIC" ? nv.footprint : fg.footprint,
          value: nv.value.length > 0 ? nv.value : fg.value,
        };
      });
      const board = boardEnvelopeFromCentroids(components, svgBoard);
      return {
        ...board,
        components,
        notice:
          "3D positions follow pcbflow centroid export (mm). Regenerate the board if parts move in Python.",
      };
    }
  }

  return arPcbFromSvgTextFallback(t, svgBoard);
}

function arPcbFromSvgTextFallback(
  svg: string,
  svgBoard: { widthMm: number; heightMm: number } | null,
): ArPcbScene | null {
  const refs = extractRefsFromSvg(svg);
  const board = svgBoard ?? { widthMm: 80, heightMm: 50 };

  const cols = refs.length > 18 ? 6 : refs.length > 10 ? 5 : 4;
  const marginX = 10;
  const marginY = 10;
  const cellX = (board.widthMm - marginX * 2) / Math.max(cols - 1, 1);
  const cellY = 12;

  const components: ArPcbComponent[] = refs.map((ref, i) => {
    const { footprint, value } = footprintGuessFromRef(ref);
    const h = fnv1a32(ref + board.widthMm.toFixed(1) + board.heightMm.toFixed(1));
    const jitterX = (((h >> 3) % 19) - 9) * 0.45;
    const jitterY = (((h >> 11) % 19) - 9) * 0.45;
    const xMm = clamp(marginX + (i % cols) * cellX + jitterX, 4, board.widthMm - 4);
    const yMm = clamp(marginY + Math.floor(i / cols) * cellY + jitterY, 4, board.heightMm - 4);
    return {
      ref,
      xMm,
      yMm,
      rotationDeg: 0,
      layer: "top",
      footprint,
      value,
    };
  });

  return {
    ...board,
    components,
    notice:
      "No pcbflow_centroids.csv in workspace — using SVG <text> refs + jittered grid. Re-export PCB with centroids=True for real placement.",
  };
}

export function arPcbFromLayoutPreviewSvg(svg: string): ArPcbScene | null {
  return arPcbSceneFromPcbflowAssets({ svg, centroidsCsv: null });
}

export function arPcbSceneFromWorkspaceFiles(
  wf: Record<string, string>,
  layoutSvg: string,
): ArPcbScene | null {
  const csv = wf["pcbflow_centroids.csv"] ?? null;
  return arPcbSceneFromPcbflowAssets({ svg: layoutSvg, centroidsCsv: csv });
}

export function filterArPcbSceneToRefSet(
  scene: ArPcbScene,
  refs: Set<string> | null | undefined,
): ArPcbScene {
  if (!refs || refs.size === 0) return scene;
  const allow = new Set([...refs].map((r) => r.trim().toUpperCase()).filter(Boolean));
  return {
    ...scene,
    components: scene.components.filter((c) => allow.has(c.ref.toUpperCase())),
  };
}

export type ArTutorialStep = {
  id: string;
  ref: string;
  title: string;
  instruction: string;
};

const BENCH_VARIANTS = [
  "ESD mat if you have one; ventilation; bright light. Smallest SMDs first, tack-align-reflow. ICs: pin‑1, corners first. Inspect rails, then current-limited first power. Mount in the enclosure last—standoffs, cable routing, then lid.",
  "Work under good magnification for 0603/0402. Tack one joint, re-square the part, then finish. Check solder bridges on fine-pitch ICs before power. Enclosure: torque standoffs evenly; keep flex away from sharp edges.",
  "Keep iron temperature modest; use flux on every SMD joint. Power path / connectors: mechanical strain relief before final test. When the board is clean, snap it into the shell and route cables away from anything hot.",
];

const TAIL_VARIANTS = [
  "This view is a camera feed with a 3D model on top (not world-locked AR). Drag to orbit if gyro is off. Tap a glowing reference to jump steps.",
  "Orbit with one finger; pinch to zoom. Highlights follow the guide card—tap a lit footprint to sync the step.",
  "3D is a preview mesh from your layout export. If something looks offset, regenerate with pcbflow centroids enabled.",
];

const INTRO_WITH_SOLDER = [
  "Use Next/Back to walk the board in build order. Each step spotlights one reference; the 3D view highlights that footprint so you can line up the real part.",
  "Follow the sequence: the card tells you what to place next, and the board glows on that designator. Jump around by tapping a highlighted part.",
  "One ref at a time—match the silk label in your bin to the glowing 3D pad group before soldering.",
];

export function buildFullArTutorial(
  pcb: ArPcbScene | null,
  opts?: { projectKey?: string },
): ArTutorialStep[] {
  const key = opts?.projectKey?.trim() || "default";
  const solder = buildArSolderTutorial(pcb, key);

  const benchIdx = pickVariant(`${key}:bench`, BENCH_VARIANTS.length);
  const tailIdx = pickVariant(`${key}:tail`, TAIL_VARIANTS.length);
  const introIdx = pickVariant(`${key}:intro`, INTRO_WITH_SOLDER.length);

  const bench: ArTutorialStep[] = [
    {
      id: "bench-all",
      ref: "",
      title: "Bench & finish",
      instruction: BENCH_VARIANTS[benchIdx] ?? BENCH_VARIANTS[0],
    },
  ];

  const tail: ArTutorialStep[] = [
    {
      id: "wrap-scan",
      ref: "",
      title: "3D overlay",
      instruction: TAIL_VARIANTS[tailIdx] ?? TAIL_VARIANTS[0],
    },
  ];

  const intro: ArTutorialStep[] = [
    {
      id: "intro",
      ref: "",
      title: "Assembly guide",
      instruction:
        solder.length > 0
          ? INTRO_WITH_SOLDER[introIdx] ?? INTRO_WITH_SOLDER[0]
          : "No parts were found for this layout (add pcbflow centroids export or SVG text refs). Steps below are general bench tips only.",
    },
  ];

  if (solder.length > 0) {
    return [...intro, ...solder, ...bench, ...tail];
  }

  return [...intro, ...bench, ...tail];
}

export function derivePcbSceneAssemblyProgress(
  pcb: ArPcbScene,
  steps: ArTutorialStep[],
  activeStep: number,
): ArPcbScene {
  const solder = buildArSolderTutorial(pcb, "");
  const orderRefs = solder.map((s) => s.ref);
  if (orderRefs.length === 0) {
    return pcb;
  }
  const cur = steps[activeStep]?.ref?.trim() ?? "";
  const pos = orderRefs.indexOf(cur);
  if (!cur || pos < 0) {
    return {
      ...pcb,
      components: pcb.components.map((c) => ({ ...c, assemblyPending: false })),
    };
  }
  const placed = new Set(orderRefs.slice(0, pos + 1));
  return {
    ...pcb,
    components: pcb.components.map((c) => {
      if (!orderRefs.includes(c.ref)) {
        return { ...c, assemblyPending: false };
      }
      return { ...c, assemblyPending: !placed.has(c.ref) };
    }),
  };
}

export function buildArSolderRefSet(pcb: ArPcbScene | null): Set<string> {
  return new Set(buildArSolderTutorial(pcb, "").map((s) => s.ref));
}

const HINT_PASSIVE = [
  "Pre-tin one pad lightly. Tweezer the part onto the wet pad, reflow, nudge square, then solder the opposite pad with fresh flux.",
  "Use a small chisel or hoof tip: heat the pad until the part seats, then add solder to the second joint—avoid cooking the body.",
  "Tack-reflow flow: one joint first, check rotation against silk, finish the other side. Inspect for tombstoning.",
  "Wipe the tip; dab flux on both lands. Anchor one end, then drag a tiny amount of solder across the free pad.",
];

const HINT_IC = [
  "Tack one corner pad, re-align pin‑1 to silk, then run down the sides with flux. Bridge? Wick + flux, not more heat.",
  "Corner anchor, then alternate sides so the package stays flat. Magnification helps on fine pitch.",
  "Check ground pad paste if present; otherwise corners first, then perimeter. Visual inspect every row.",
  "Use enough flux; keep iron dwell short per pin. Drag-solder or line-by-line—pick what matches your tip.",
];

const HINT_LED = [
  "Confirm cathode/anode against your schematic. Tack one end, align to silk polarity mark, then finish.",
  "LEDs are heat-sensitive—quick joints. If dim after install, you likely have orientation or a dead part.",
  "One pad tack, slide until the body lines up with the silk caret, then wet the second pad.",
];

const HINT_CONN = [
  "Seat the housing flat on the board before soldering any pin. Tack diagonally opposite pins, re-square, then fill the rest.",
  "Check pin‑1 / keying vs silk. Mechanical retention first, then electrical—reduces lifted pads.",
  "For headers, use a spare connector as a jig so the row stays vertical while you tack the ends.",
];

const HINT_GENERIC = [
  "Align to silk, tack, inspect from two angles, then complete all joints. Flux is cheap—use it.",
  "One mechanical pin first if the part wobbles; then electrical pins in an order that keeps it flat.",
  "After soldering, continuity-check critical nets before full power.",
  "Keep tip clean; if solder balls, stop and re-flux rather than forcing heat.",
];

export function buildArSolderTutorial(
  pcb: ArPcbScene | null,
  variantKey = "",
): ArTutorialStep[] {
  if (!pcb || pcb.components.length === 0) return [];

  const score = (ref: string) => {
    const r = ref.toUpperCase();
    if (r.startsWith("R") || r.startsWith("C") || r.startsWith("L")) return 10;
    if (r.startsWith("D") || r.startsWith("LED")) return 20;
    if (r.startsWith("U")) return 30;
    if (r.startsWith("SW")) return 35;
    if (r.startsWith("J") || r.startsWith("P")) return 40;
    return 50;
  };

  const ordered = [...pcb.components].sort((a, b) => score(a.ref) - score(b.ref));

  return ordered.map((c, idx) => {
    const seed = `${variantKey}|${c.ref}|${c.value}|${idx}`;
    let pool = HINT_GENERIC;
    const fp = c.footprint.toUpperCase();
    if (c.footprint === "CONN") pool = HINT_CONN;
    else if (
      c.footprint === "IC" ||
      /^(QFN|BGA|SOIC|TSSOP|FTG|SOT\d)/i.test(c.footprint)
    ) {
      pool = HINT_IC;
    } else if (c.footprint === "LED") pool = HINT_LED;
    else if (
      fp === "0603" ||
      fp.startsWith("R") ||
      fp.startsWith("C") ||
      fp.startsWith("L") ||
      /^(R|C|L)\d{3,4}$/.test(fp)
    ) {
      pool = HINT_PASSIVE;
    }
    const hi = pickVariant(seed, pool.length);
    const instruction = pool[hi] ?? pool[0];

    const valShow =
      c.value &&
      c.value.length > 0 &&
      c.value.length < 28 &&
      !/^(IC|Resistor|Capacitor|Connector|Component)$/i.test(c.value)
        ? ` (${c.value})`
        : "";
    const title = `${idx + 1}. ${c.ref}${valShow}`;

    return { id: `step-${c.ref}-${idx}`, ref: c.ref, title, instruction };
  });
}
