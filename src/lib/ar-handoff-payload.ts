import { arPcbSceneFromWorkspaceFiles, type ArPcbScene } from "@/lib/ar-pcb";
import type { PcbAssemblyStagePlan } from "@/lib/pcbflow/plan-assembly-stages";

const LAYOUT_STAGE_KEY_RE = /^layout_board_stage_(\d+)\.svg$/i;

/** Max uncompressed JSON size after gzip decode (cad + full circuitron). */
export const AR_HANDOFF_MAX_UNCOMPRESSED_BYTES = 48 * 1024 * 1024;

export function getWorkspaceFileMapFromCircuitronSnap(
  snap: unknown,
): Record<string, string> | null {
  if (!snap || typeof snap !== "object") return null;
  const s = snap as {
    workspaceFiles?: unknown;
    files?: Record<string, string | undefined>;
  };
  const wf =
    s.workspaceFiles &&
    typeof s.workspaceFiles === "object" &&
    Object.keys(s.workspaceFiles as object).length > 0
      ? (s.workspaceFiles as Record<string, string>)
      : s.files && typeof s.files["schematic.svg"] === "string"
        ? (s.files as Record<string, string>)
        : null;
  if (!wf) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(wf)) {
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function pickLayoutSvgFromWorkspaceFiles(
  wf: Record<string, string>,
): string | undefined {
  return (
    wf["layout_board.svg"] ??
    wf["pcbflow_layout.svg"] ??
    Object.entries(wf).find(
      ([k]) =>
        k.toLowerCase().includes("layout") && k.toLowerCase().endsWith(".svg"),
    )?.[1]
  );
}

export function listLayoutStageSvgKeys(wf: Record<string, string>): number[] {
  const idx: number[] = [];
  for (const k of Object.keys(wf)) {
    const m = LAYOUT_STAGE_KEY_RE.exec(k);
    if (m) idx.push(parseInt(m[1], 10));
  }
  return [...new Set(idx)].sort((a, b) => a - b);
}

export function parseAssemblyStagesFromWorkspace(
  wf: Record<string, string>,
): PcbAssemblyStagePlan | null {
  const raw = wf["pcbflow_assembly_stages.json"];
  if (!raw || typeof raw !== "string") return null;
  try {
    const j = JSON.parse(raw) as { stages?: unknown };
    if (!Array.isArray(j.stages)) return null;
    const stages = j.stages
      .filter((s) => s && typeof s === "object")
      .map((s) => {
        const o = s as { label?: unknown; refs?: unknown };
        return {
          label: typeof o.label === "string" ? o.label : "Stage",
          refs: Array.isArray(o.refs)
            ? o.refs.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
            : [],
        };
      });
    return stages.length > 0 ? { stages } : null;
  } catch {
    return null;
  }
}

/**
 * Picks the layout SVG to render for the current assembly step when pcbflow
 * exported per-stage boards (`layout_board_stage_N.svg`).
 */
export function pickLayoutSvgStringForArAssemblyStep(params: {
  wf: Record<string, string>;
  activeStep: number;
  steps: Array<{ ref?: string | null }>;
}): string | undefined {
  const full = pickLayoutSvgFromWorkspaceFiles(params.wf);
  const stageNums = listLayoutStageSvgKeys(params.wf);
  if (stageNums.length < 2) return full;

  const plan = parseAssemblyStagesFromWorkspace(params.wf);
  const cur = params.steps[params.activeStep];
  const ref = cur?.ref?.trim() || null;

  let stageIdx = 0;
  if (ref && plan?.stages?.length) {
    const j = plan.stages.findIndex((s) => s.refs.includes(ref));
    stageIdx = j >= 0 ? j : plan.stages.length - 1;
  }

  const listIdx = Math.max(
    0,
    Math.min(stageIdx, stageNums.length - 1),
  );
  const n = stageNums[listIdx];
  const key = `layout_board_stage_${n}.svg`;
  return params.wf[key] ?? full;
}

/**
 * Cumulative ref list for the assembly stage that matches the current tutorial step
 * (same mapping as staged layout SVG selection). Used to filter 3D parts — silk is not
 * parseable from pcbflow SVG, so we must not rebuild the scene from staged SVG alone.
 */
export function cumulativeStageRefsForTutorialStep(params: {
  wf: Record<string, string>;
  activeStep: number;
  steps: Array<{ ref?: string | null }>;
}): string[] | null {
  const stageNums = listLayoutStageSvgKeys(params.wf);
  if (stageNums.length < 2) return null;
  const plan = parseAssemblyStagesFromWorkspace(params.wf);
  if (!plan?.stages?.length) return null;

  const cur = params.steps[params.activeStep];
  const ref = cur?.ref?.trim() || null;

  let stageIdx = 0;
  if (ref && plan.stages.length) {
    const j = plan.stages.findIndex((s) => s.refs.includes(ref));
    stageIdx = j >= 0 ? j : plan.stages.length - 1;
  }

  const maxStage = Math.min(stageNums.length, plan.stages.length) - 1;
  const listIdx = Math.max(0, Math.min(stageIdx, maxStage));
  return plan.stages[listIdx]?.refs ?? null;
}

/** Same SVG string the AR page uses to build `ArPcbScene`. */
export function extractLayoutSvgStringFromCircuitronSnap(
  snap: unknown,
): string | null {
  const wf = getWorkspaceFileMapFromCircuitronSnap(snap);
  if (!wf) return null;
  const s = pickLayoutSvgFromWorkspaceFiles(wf);
  return s && s.trim().length > 0 ? s : null;
}

export function arPcbSceneFromCircuitronSnap(snap: unknown): ArPcbScene | null {
  const wf = getWorkspaceFileMapFromCircuitronSnap(snap);
  if (!wf) return null;
  const svg = pickLayoutSvgFromWorkspaceFiles(wf);
  return svg ? arPcbSceneFromWorkspaceFiles(wf, svg) : null;
}

/** Full Circuitron snapshot for AR handoff (no field stripping). */
export function circuitronForArHandoff(circuitron: unknown): unknown {
  if (circuitron != null && typeof circuitron === "object") return circuitron;
  return {};
}

export function handoffPayloadByteLength(payload: {
  cad: unknown;
  circuitron: unknown;
}): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

export function assertHandoffPayloadUnderCap(payload: {
  cad: unknown;
  circuitron: unknown;
}): void {
  if (handoffPayloadByteLength(payload) > AR_HANDOFF_MAX_UNCOMPRESSED_BYTES) {
    const err = new Error("PAYLOAD_TOO_LARGE");
    (err as Error & { code?: string }).code = "PAYLOAD_TOO_LARGE";
    throw err;
  }
}
