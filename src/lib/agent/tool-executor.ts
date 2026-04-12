import type OpenAI from "openai";
import {
  cadIntentDescriptionFromArgs,
  formatCadGenerationContextBlock,
  pcbHintsFromToolArgs,
} from "@/lib/cadam/context";
import {
  generateOpenscadFromContext,
  resolveCadOpenAiModel,
} from "@/lib/cadam/generate-openscad";
import { runCadiumEngine } from "@/lib/cadium/engine";
import {
  applyCadToolArgs,
  cadTopologyWarnings,
  defaultCadDocument,
  documentToSyntheticShell,
} from "@/lib/cad-document";
import { EMPTY_BOM, type BomDocument } from "@/lib/bom";
import {
  circuitronSubprocess,
  type CircuitronResponse,
} from "@/lib/circuitron";
import {
  type AgentStateSnapshot,
  type AgentToolCall,
  type AgentToolResult,
  isRecord,
  normalizeBomLine,
} from "@/lib/agent/contracts";
import type { PcbEngine } from "@/lib/pcb-engine";
import type { CadEngine } from "@/lib/cad-engine";
import { generatePcbWithPcbflow } from "@/lib/pcbflow";
import { buildKicadStyleSchematicSvg } from "@/lib/pcbflow/kicad-style-schematic-svg";

export type ExecuteToolCallsOptions = {
  pcbEngine?: PcbEngine;
  cadEngine?: CadEngine;
  openaiClient?: OpenAI | null;
};

/** BOM/PCB before enclosure so CAD can read board outline from the same batch. */
function sortToolCallsForExecution(calls: AgentToolCall[]): AgentToolCall[] {
  const rank = (t: AgentToolCall["tool"]) => {
    if (t === "replace_bom" || t === "append_bom_lines") return 0;
    if (t === "update_pcb") return 1;
    if (t === "update_firmware") return 2;
    if (t === "update_cad") return 3;
    return 3;
  };
  return [...calls].sort((a, b) => rank(a.tool) - rank(b.tool));
}

function pcbHintsFromToolCallBatch(
  calls: AgentToolCall[],
): ReturnType<typeof pcbHintsFromToolArgs> | null {
  const pcb = calls.find((c) => c.tool === "update_pcb");
  if (!pcb?.args || !isRecord(pcb.args)) return null;
  const h = pcbHintsFromToolArgs(pcb.args);
  if (h.widthMm == null && h.heightMm == null && h.layerCount == null)
    return null;
  return h;
}

/** Tool args that imply a new enclosure / CSG — require OpenSCAD regen. */
function isStructuralCadToolArgs(args: Record<string, unknown>): boolean {
  const keys = [
    "cadFeatures",
    "features",
    "lengthMm",
    "widthMm",
    "heightMm",
    "wallMm",
    "cornerRadiusMm",
  ];
  return keys.some((k) => args[k] !== undefined);
}

function toNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function escapeSvgText(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * LLM tool JSON varies: nets use `nodes` or `connectedNodes`; board size as
 * `widthMm` / `heightMm` or nested `boardDimensions`.
 */
function normalizePcbToolArgs(raw: Record<string, unknown>): Record<string, unknown> {
  const bd = isRecord(raw.boardDimensions) ? raw.boardDimensions : null;
  const w =
    toNumber(raw.widthMm) ??
    toNumber(raw.width) ??
    toNumber(bd?.width) ??
    toNumber(bd?.w);
  const h =
    toNumber(raw.heightMm) ??
    toNumber(raw.height) ??
    toNumber(bd?.height) ??
    toNumber(bd?.h);
  const netsIn = Array.isArray(raw.nets) ? raw.nets : [];
  const nets = netsIn.map((n) => {
    if (!isRecord(n)) return n;
    const nodesRaw = n.nodes ?? n.connectedNodes ?? n.connectedPins ?? n.pins;
    const nodes = Array.isArray(nodesRaw)
      ? nodesRaw.map((x) => (typeof x === "string" ? x : String(x)))
      : [];
    return { ...n, nodes };
  });
  const next: Record<string, unknown> = { ...raw, nets };
  if (w != null) next.widthMm = w;
  if (h != null) next.heightMm = h;
  return next;
}

/**
 * Generate PCB design using Circuitron
 */
async function generatePcbWithCircuitron(
  args: Record<string, unknown>,
  projectName: string,
  conversationContext?: string,
): Promise<CircuitronResponse> {
  try {
    // Extract PCB requirements from args
    const components = Array.isArray(args.components) ? args.components : [];
    const nets = Array.isArray(args.nets) ? args.nets : [];
    const widthMm = toNumber(args.widthMm) || 80;
    const heightMm = toNumber(args.heightMm) || 50;
    const layerCount = toNumber(args.layerCount) || 2;

    // Build a descriptive prompt for Circuitron based on the tool arguments
    let prompt = `Design a production-ready PCB with the following specifications:

Board Dimensions: ${widthMm}mm x ${heightMm}mm, ${layerCount} layers

Components:`;

    if (components.length > 0) {
      components.forEach((comp: any, i: number) => {
        if (isRecord(comp)) {
          prompt += `
- ${comp.ref || `U${i+1}`}: ${comp.value || 'Component'} (${comp.footprint || 'TBD'})`;
        }
      });
    } else {
      prompt += `
- Design appropriate components based on the circuit requirements`;
    }

    if (nets.length > 0) {
      prompt += `

Connectivity:`;
      nets.forEach((net: any) => {
        if (isRecord(net) && Array.isArray(net.nodes)) {
          prompt += `
- ${net.name}: Connect ${net.nodes.join(', ')}`;
        }
      });
    }

    // Add autoroute instruction if specified
    if (args.autoroute) {
      prompt += `

Route all connections automatically with clean paths and no overlapping traces.`;
    }

    prompt += `

Requirements:
- Generate a real manufacturable KiCad PCB layout, not a mock preview.
- Ensure ALL nets are connected and routed.
- Keep clearances and avoid overlapping/stacked traces.
- Use sane placement and orientation so related components are grouped logically.
- Return actual output artifacts (at minimum: .kicad_pcb, schematic SVG/netlist when available).`;

    // Add conversation context if provided
    if (conversationContext) {
      prompt = `Context: ${conversationContext}\n\n${prompt}`;
    }

    console.log('Sending PCB design request to Circuitron:', prompt.substring(0, 200) + '...');

    // Call Circuitron subprocess
    const response = await circuitronSubprocess.execute({
      prompt,
      projectName,
      options: {
        noFootprintSearch: true, // For stability
        keepSkidl: true,
        dev: false
      }
    }, {
      onProgress: (event) => {
        console.log(`Circuitron progress: ${event.type} - ${event.message}`);
      },
      onLog: (message) => {
        console.log(`Circuitron: ${message}`);
      }
    });

    return response;

  } catch (error) {
    console.error("Error generating PCB with Circuitron:", error);
    return {
      success: false,
      files: {},
      logs: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function refFromNetNode(node: unknown): string | null {
  if (typeof node !== "string") return null;
  const s = node.trim();
  if (!s) return null;
  const i = s.indexOf(".");
  const head = i >= 0 ? s.slice(0, i) : s;
  const designator = head.replace(/[+-]+$/u, "").trim();
  return designator || null;
}

function buildWorkspaceFilesFromCircuitron(
  response: CircuitronResponse,
): Record<string, string> | null {
  const art = response.fileContentsByBasename;
  if (!art || Object.keys(art).length === 0) return null;
  const ws: Record<string, string> = { ...art };
  const svg = Object.keys(art).find((k) => k.toLowerCase().endsWith(".svg"));
  if (svg) ws["schematic.svg"] = art[svg];
  const net = Object.keys(art).find((k) => k.toLowerCase().endsWith(".net"));
  if (net) ws["netlist.net"] = art[net];
  const py = Object.keys(art).find(
    (k) => k.toLowerCase().includes("skidl") && k.endsWith(".py"),
  );
  if (py) ws["design.skidl"] = art[py];
  const kicad = Object.keys(art).find((k) => k.endsWith(".kicad_pcb"));
  if (kicad) ws["layout.kicad_pcb"] = art[kicad];
  const erc = Object.keys(art).find((k) => k.toLowerCase().endsWith(".erc"));
  if (erc) ws["design.erc"] = art[erc];
  return ws;
}

function workspaceHasSchematic(ws: Record<string, string>): boolean {
  return Object.keys(ws).some(
    (k) => k === "schematic.svg" || k.toLowerCase().endsWith(".svg"),
  );
}

/** Schematic symbol bounding box in SVG user units (pins on left/right centers). */
type SchRect = { x: number; y: number; w: number; h: number };

function uniqueRefsInOrder(refs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of refs) {
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}

/** Pick exit/entry points: wire leaves right face of left symbol, enters left face of right symbol (or mirrored). */
function schPortsBetween(a: SchRect, b: SchRect): {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
} {
  const acy = a.y + a.h / 2;
  const bcy = b.y + b.h / 2;
  const acx = a.x + a.w / 2;
  const bcx = b.x + b.w / 2;
  if (bcx >= acx) {
    return { sx: a.x + a.w, sy: acy, ex: b.x, ey: bcy };
  }
  return { sx: a.x, sy: acy, ex: b.x + b.w, ey: bcy };
}

/** Single Manhattan polyline (horizontal run through midpoint — reads like a KiCad-style net). */
function orthogonalWireD(sx: number, sy: number, ex: number, ey: number): string {
  const tol = 0.5;
  if (Math.abs(sx - ex) < tol) return `M${sx} ${sy} L${ex} ${ey}`;
  if (Math.abs(sy - ey) < tol) return `M${sx} ${sy} L${ex} ${ey}`;
  const midX = (sx + ex) / 2;
  return `M${sx} ${sy} L${midX} ${sy} L${midX} ${ey} L${ex} ${ey}`;
}

/** Vertices along an orthogonal M/L path (for via placement). */
function verticesFromOrthogonalD(d: string): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const re = /[ML]\s*([-\d.]+)\s+([-\d.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    pts.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
  }
  return pts;
}

/** Mock copper: KiCad F.Cu–like red + thermal relief + plated vias at bends. */
function pcbCopperWithVias(sx: number, sy: number, ex: number, ey: number): string {
  const d = orthogonalWireD(sx, sy, ex, ey);
  const verts = verticesFromOrthogonalD(d);
  const viaR = 2.1;
  const vias = verts
    .map(
      (p) =>
        `\n    <circle cx="${p.x}" cy="${p.y}" r="${viaR}" fill="#1a1a1a" stroke="#c0c0c0" stroke-width="0.65"/>`,
    )
    .join("");
  return `
    <path d="${d}" stroke="#5c1010" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>
    <path d="${d}" stroke="#c0392b" stroke-width="2.35" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" stroke="#ff8a80" stroke-width="0.55" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>${vias}`;
}

function pcbTracePathsFromNets(
  nets: unknown[],
  pcbLayout: Map<string, SchRect>,
): string {
  let out = "";
  let laneIndex = 0;
  for (const net of nets) {
    if (!isRecord(net) || !Array.isArray(net.nodes)) continue;
    const refs = uniqueRefsInOrder(
      net.nodes
        .map(refFromNetNode)
        .filter((r): r is string => Boolean(r)),
    );
    const placed = refs
      .map((r) => ({ r, box: pcbLayout.get(r) }))
      .filter((x): x is { r: string; box: SchRect } => Boolean(x.box));
    if (placed.length < 2) continue;
    placed.sort(
      (a, b) => a.box.x + a.box.w / 2 - (b.box.x + b.box.w / 2),
    );
    const laneOffset = (laneIndex % 6) * 5 - 12.5;
    laneIndex += 1;
    for (let i = 0; i < placed.length - 1; i++) {
      const raw = schPortsBetween(
        placed[i]!.box,
        placed[i + 1]!.box,
      );
      // Slight per-net lane offsets reduce heavy trace overlap in previews.
      const sx = raw.sx;
      const sy = raw.sy + laneOffset;
      const ex = raw.ex;
      const ey = raw.ey + laneOffset;
      out += pcbCopperWithVias(sx, sy, ex, ey);
    }
  }
  return out;
}

function componentRectFromValue(value: string): { w: number; h: number } {
  const vl = value.toLowerCase();
  if (vl.includes("esp32") || vl.includes("mcu")) return { w: 50, h: 30 };
  if (vl.includes("usb") || vl.includes("connector")) return { w: 22, h: 16 };
  if (vl.includes("led")) return { w: 18, h: 18 };
  if (vl.includes("motor") || vl.includes("driver")) return { w: 36, h: 22 };
  if (vl.includes("regulator") || vl.includes("buck") || vl.includes("ldo"))
    return { w: 24, h: 16 };
  return { w: 20, h: 14 };
}

function synthesizeNetsFromComponents(components: unknown[]): unknown[] {
  const refs = components
    .map((c, i) =>
      isRecord(c) && typeof c.ref === "string" ? c.ref : `U${i + 1}`,
    )
    .filter((r) => typeof r === "string" && r.length > 0);
  if (refs.length < 2) return [];
  const mcu = refs.find((r) => /^U1$|ESP|MCU/i.test(r)) ?? refs[0];
  const others = refs.filter((r) => r !== mcu);
  const sig = others.map((r) => `${r}.SIG`);
  const ctrlNodes = sig.length > 0 ? [`${mcu}.IO1`, ...sig] : [];
  return [
    { name: "VCC", nodes: [`${mcu}.VCC`, ...others.map((r) => `${r}.VCC`)] },
    { name: "GND", nodes: [`${mcu}.GND`, ...others.map((r) => `${r}.GND`)] },
    ...(ctrlNodes.length > 0 ? [{ name: "CTRL", nodes: ctrlNodes }] : []),
  ];
}

function generateMockNetlistFromArgs(
  projectName: string,
  widthMm: number,
  heightMm: number,
  components: unknown[],
  nets: unknown[],
): string {
  const lines: string[] = [
    `# Preview netlist for ${projectName}`,
    `# Board: ${widthMm}mm × ${heightMm}mm (from tool args — not a KiCad export)`,
    ``,
    `(components`,
  ];
  components.forEach((comp: any, index: number) => {
    if (!comp || typeof comp !== "object") return;
    const ref = typeof comp.ref === "string" ? comp.ref : `U${index + 1}`;
    const value =
      typeof comp.value === "string"
        ? comp.value
        : typeof comp.description === "string"
          ? comp.description
          : "Part";
    const fp =
      typeof comp.footprint === "string" ? comp.footprint : "TBD";
    lines.push(`  (${ref} / ${value} / ${fp})`);
  });
  lines.push(`)`);
  lines.push(``);
  lines.push(`(nets`);
  nets.forEach((net: any) => {
    if (!isRecord(net) || !Array.isArray(net.nodes)) return;
    const nm = typeof net.name === "string" ? net.name : "NET";
    lines.push(`  (${nm} ${net.nodes.join(" ")})`);
  });
  lines.push(`)`);
  return lines.join("\n");
}

function generateMockSkidlStub(
  projectName: string,
  components: unknown[],
): string {
  const summary = Array.isArray(components)
    ? components
        .map((c: any, i: number) => {
          if (!c || typeof c !== "object") return null;
          const ref = c.ref || `U${i + 1}`;
          const val = c.value || c.description || "?";
          return `#   ${ref}: ${val}`;
        })
        .filter(Boolean)
        .join("\n")
    : "";
  return `# SKiDL export placeholder for ${projectName}
# Use pcbflow / KiCad for manufacturing exports. Parts from tool args:
${summary || "#   (no components in tool args)"}
`;
}

async function generateFirmwareFromContext(params: {
  openai: OpenAI;
  projectName: string;
  conversationContext?: string;
  pcbArgs: Record<string, unknown>;
}): Promise<string> {
  const model = process.env.OPENAI_FIRMWARE_MODEL?.trim() || "o3";
  const prompt = [
    `Project: ${params.projectName}`,
    "Generate production-ready embedded firmware in C++ for Arduino/PlatformIO style ESP32 target.",
    "Output code only. No markdown fences. Include setup(), loop(), WiFi provisioning stub, schedule logic, and safe actuator control.",
    "Assume this is for the current PCB and BOM context.",
    params.conversationContext ? `Conversation context:\n${params.conversationContext}` : "",
    `PCB args:\n${JSON.stringify(params.pcbArgs)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const completion = await params.openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a senior embedded systems engineer. Return only compilable firmware code, no prose.",
      },
      { role: "user", content: prompt },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Firmware generation returned empty output");
  }
  return text
    .trim()
    .replace(/^```[a-zA-Z]*\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

/** One short line for UI — no tracebacks. */
function pcbUiWarningLine(message: string): string {
  const t = message.trim();
  const tr = t.indexOf("Traceback");
  const fileBlock = t.indexOf("\n  File ");
  const cut = tr >= 0 ? tr : fileBlock >= 0 ? fileBlock : -1;
  const head = cut >= 0 ? t.slice(0, cut).trim() : t;
  const line = head.split(/\n/)[0]?.trim() || head;
  return line.length > 200 ? `${line.slice(0, 197)}…` : line;
}

function mergePcbflowFailureWithMockPreview(
  pcbArgs: Record<string, unknown>,
  projectName: string,
  pcbflowError: string,
): CircuitronResponse {
  const mock = generateMockPcbData(pcbArgs, projectName);
  return {
    ...mock,
    success: true,
    logs: [...(mock.logs ?? []), `PCBFlow error: ${pcbflowError}`],
  };
}

function generateMockPcbData(
  args: Record<string, unknown>,
  projectName: string,
): CircuitronResponse {
  const widthMm = toNumber(args.widthMm) || toNumber(args.width) || 50;
  const heightMm = toNumber(args.heightMm) || toNumber(args.height) || 30;
  const netsFromArgs = Array.isArray(args.nets) ? args.nets : [];
  const components = Array.isArray(args.components) ? args.components : [];
  const netsRaw =
    netsFromArgs.length > 0 ? netsFromArgs : synthesizeNetsFromComponents(components);

  const innerPad = 18;
  const innerW = Math.max(
    320,
    widthMm * 4 + innerPad * 2,
    Math.max(0, components.length) * 26 + 120,
  );
  const innerH = Math.max(
    240,
    heightMm * 4 +
      innerPad * 2 +
      Math.max(0, Math.ceil(components.length / 3) - 1) * 46,
  );

  const pcbLayout = new Map<string, SchRect>();

  if (components.length > 0) {
    const cols = Math.max(3, Math.ceil(Math.sqrt(components.length * 1.5)));
    const rows = Math.ceil(components.length / cols);
    const cellW = (innerW - 80) / Math.max(1, cols - 1);
    const cellH = (innerH - 80) / Math.max(1, rows - 1);
    
    components.forEach((comp: any, index: number) => {
      if (!comp || typeof comp !== "object") return;
      const ref = comp.ref || `U${index + 1}`;
      const value = comp.value || comp.description || "Component";
      const dim = componentRectFromValue(String(value));
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      const jx = Math.sin(index * 13.5) * (cellW * 0.15) + (row % 2) * (cellW * 0.15);
      const jy = Math.cos(index * 21.3) * (cellH * 0.15);

      const px = 40 + col * cellW + jx;
      const py = 40 + row * cellH + jy;
      
      const pw = dim.w;
      const ph = dim.h;
      pcbLayout.set(ref, {
        x: Math.max(10, Math.min(px, innerW - pw - 10)),
        y: Math.max(10, Math.min(py, innerH - ph - 10)),
        w: pw,
        h: ph,
      });
    });
  }

  const pcbFromNets = pcbTracePathsFromNets(netsRaw, pcbLayout);
  const pcbFallbackChain = (): string => {
    if (pcbLayout.size < 2) {
      return pcbCopperWithVias(48, 42, Math.min(innerW, 220) - 48, 42);
    }
    const sorted = [...pcbLayout.entries()].sort(
      (a, b) => a[1].x + a[1].w / 2 - (b[1].x + b[1].w / 2),
    );
    let s = "";
    for (let i = 0; i < sorted.length - 1; i++) {
      const { sx, sy, ex, ey } = schPortsBetween(
        sorted[i]![1],
        sorted[i + 1]![1],
      );
      s += pcbCopperWithVias(sx, sy + i * 3, ex, ey + i * 3);
    }
    return s;
  };
  const pcbTraces = pcbFromNets || pcbFallbackChain();

  const holeInset = 14;
  const mountHoles = `
    <circle cx="${holeInset}" cy="${holeInset}" r="3.5" fill="#1a3322" stroke="#2a5c3e" stroke-width="0.8"/>
    <circle cx="${innerW - holeInset}" cy="${holeInset}" r="3.5" fill="#1a3322" stroke="#2a5c3e" stroke-width="0.8"/>
    <circle cx="${holeInset}" cy="${innerH - holeInset}" r="3.5" fill="#1a3322" stroke="#2a5c3e" stroke-width="0.8"/>
    <circle cx="${innerW - holeInset}" cy="${innerH - holeInset}" r="3.5" fill="#1a3322" stroke="#2a5c3e" stroke-width="0.8"/>`;

  const footprintSvgs = components
    .map((comp: any, index: number) => {
      if (!comp || typeof comp !== "object") return "";
      const ref = comp.ref || `U${index + 1}`;
      const value = comp.value || "IC";
      const box = pcbLayout.get(ref);
      const dim = componentRectFromValue(String(value));
      const w = box?.w ?? dim.w;
      const h = box?.h ?? dim.h;
      const x = box?.x ?? 20 + (index % 4) * 60;
      const y = box?.y ?? 30 + Math.floor(index / 4) * 40;
      const vl = String(value).toLowerCase();
      let shape = "";
      if (vl.includes("esp32") || vl.includes("mcu")) {
        shape = `<rect x="${x - 1}" y="${y - 1}" width="${w + 2}" height="${h + 2}" fill="none" stroke="#d4af37" stroke-width="0.45" opacity="0.9"/>
          <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#b8b8b8" stroke="#ececec" stroke-width="0.35" rx="1.5"/>`;
      } else if (vl.includes("usb") || vl.includes("connector")) {
        shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#c4cdd6" stroke="#e8eef5" stroke-width="0.35" rx="0.8"/>`;
      } else if (vl.includes("led")) {
        shape = `<rect x="${x + 2}" y="${y + 2}" width="${Math.min(w, 18)}" height="${Math.min(h, 18)}" fill="#f4d03f" stroke="#b7950b" stroke-width="0.4" rx="1"/>`;
      } else if (vl.includes("motor") || vl.includes("driver")) {
        shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#5d6d7e" stroke="#aeb6bf" stroke-width="0.35" rx="1"/>`;
      } else {
        shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#85929e" stroke="#d5d8dc" stroke-width="0.3" rx="0.6"/>`;
      }
      const ty = y + Math.min(h * 0.55, 14);
      return (
        shape +
        `<text x="${x + w * 0.5}" y="${ty}" font-size="6" fill="#1c2833" font-weight="700" font-family="ui-monospace,monospace" text-anchor="middle">${escapeSvgText(ref)}</text>`
      );
    })
    .join("\n    ");

  const schematicSvg = buildKicadStyleSchematicSvg(
    { components, nets: netsRaw },
    projectName,
    {
      footerNote:
        "Logical schematic from tool args — pcbflow/KiCad export is the manufacturing source of truth.",
    },
  );

  const svgW = innerW + 100;
  const svgH = innerH + 70;
  const titleX = svgW / 2;
  const pcbLayoutSvg = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="background:#252526">
  <defs>
    <linearGradient id="pcb" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#142e1f"/>
      <stop offset="100%" stop-color="#0d1f15"/>
    </linearGradient>
    <pattern id="pcbgrid" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#ffffff" stroke-width="0.25" opacity="0.08"/>
    </pattern>
    <filter id="s"><feDropShadow dx="0" dy="1" stdDeviation="3" flood-opacity="0.45"/></filter>
  </defs>
  <text x="${titleX}" y="18" text-anchor="middle" font-size="11" font-weight="600" fill="#d4d4d4" font-family="ui-monospace,monospace">${escapeSvgText(projectName)} · F.Cu preview</text>
  <g transform="translate(50, 32)" filter="url(#s)">
    <rect width="${innerW}" height="${innerH}" fill="url(#pcb)" rx="2" stroke="#3d3d3d" stroke-width="0.8"/>
    <rect width="${innerW}" height="${innerH}" fill="url(#pcbgrid)" rx="2"/>
    <rect x="4" y="4" width="${innerW - 8}" height="${innerH - 8}" rx="1.5" fill="#0f2418" stroke="none" opacity="0.42"/>
    ${mountHoles}

    ${footprintSvgs}

    ${pcbTraces}
  </g>
  <text x="${titleX}" y="${svgH - 12}" text-anchor="middle" font-size="7.5" fill="#858585" font-family="ui-monospace,monospace">${widthMm}×${heightMm} mm · ${components.length} footprints · F.Cu preview (tool args)</text>
</svg>`;

  const netlistText = generateMockNetlistFromArgs(
    projectName,
    widthMm,
    heightMm,
    components,
    netsRaw,
  );
  const skidlText = generateMockSkidlStub(projectName, components);

  const mockFiles: Record<string, string> = {
    "schematic.svg": schematicSvg,
    "pcb_3d.wrl": pcbLayoutSvg,
    "netlist.net": netlistText,
    "design.skidl": skidlText,
  };

  return {
    success: true,
    files: {},
    workspaceFiles: mockFiles,
    fileContentsByBasename: { ...mockFiles },
    pcbSource: "mock",
    logs: [
      `Manhattan PCB preview for ${projectName}`,
      `Board ${widthMm}×${heightMm} mm, ${components.length} components (not DRC’d)`,
    ],
    error: undefined,
  };
}

export function getDefaultAgentState(): AgentStateSnapshot {
  return {
    cad: defaultCadDocument(),
    pcb: null, // PCB state is now handled by Circuitron
    bom: EMPTY_BOM,
    circuitronResults: null, // New field for Circuitron results
    firmware: null,
  };
}

export async function executeToolCalls(
  state: AgentStateSnapshot,
  toolCalls: AgentToolCall[],
  projectName = "Hardware Design",
  conversationContext?: string,
  options?: ExecuteToolCallsOptions,
): Promise<{
  nextState: AgentStateSnapshot;
  toolResults: AgentToolResult[];
}> {
  const nextState = { ...state };
  const toolResults: AgentToolResult[] = [];
  const pcbEngine: PcbEngine = options?.pcbEngine ?? "pcbflow";
  const cadEngine: CadEngine = options?.cadEngine ?? "cadam";
  const openaiClient = options?.openaiClient ?? null;
  const orderedCalls = sortToolCallsForExecution(toolCalls);

  for (const call of orderedCalls) {
    const args = call.args || {};

    console.log(`Executing tool: ${call.tool}`, args);

    try {
      switch (call.tool) {
        case "update_cad": {
          const prevCad = nextState.cad;
          /** Capture before applyCadToolArgs — new cadFeatures strip openscad from the merged doc. */
          const previousScadCode = prevCad.openscad?.code?.trim();
          nextState.cad = applyCadToolArgs(nextState.cad, args);
          const shell = documentToSyntheticShell(nextState.cad);
          const pcbBatchHints = pcbHintsFromToolCallBatch(orderedCalls);
          const openscadWarnings: string[] = [];

          const argRec = isRecord(args) ? args : {};
          const skipOpenscadCall =
            Boolean(previousScadCode) && !isStructuralCadToolArgs(argRec);

          if (openaiClient && skipOpenscadCall && prevCad.openscad) {
            nextState.cad = {
              ...nextState.cad,
              openscad: prevCad.openscad,
            };
          } else if (openaiClient) {
            try {
              const contextBlock = formatCadGenerationContextBlock({
                bom: nextState.bom,
                shell,
                pcbHints: pcbBatchHints ?? undefined,
                conversationContext,
              });

              let code: string, parameters: any[];

              if (cadEngine === "cadium") {
                const result = await runCadiumEngine({
                  openai: openaiClient,
                  model: resolveCadOpenAiModel(),
                  userPrompt: cadIntentDescriptionFromArgs(argRec, projectName),
                  contextBlock,
                  baseCode: previousScadCode,
                });
                code = result.code;
                parameters = result.parameters;
              } else {
                const result = await generateOpenscadFromContext({
                  openai: openaiClient,
                  model: resolveCadOpenAiModel(),
                  userPrompt: cadIntentDescriptionFromArgs(argRec, projectName),
                  contextBlock,
                  baseCode: previousScadCode,
                });
                code = result.code;
                parameters = result.parameters;
              }

              nextState.cad = {
                ...nextState.cad,
                openscad: { code, parameters },
              };
            } catch (e) {
              const msg =
                e instanceof Error ? e.message : "OpenSCAD generation failed";
              openscadWarnings.push(msg);
              if (prevCad.openscad) {
                nextState.cad = {
                  ...nextState.cad,
                  openscad: prevCad.openscad,
                };
              }
            }
          }

          const s = documentToSyntheticShell(nextState.cad);
          const oscNote = nextState.cad.openscad
            ? `; OpenSCAD source ${nextState.cad.openscad.code.length} chars`
            : "";
          const cadHints = cadTopologyWarnings(nextState.cad);
          const cadWarnings = [...openscadWarnings, ...cadHints];
          toolResults.push({
            tool: call.tool,
            applied: true,
            summary: `Updated CAD: ${nextState.cad.features.length} CSG feature(s); enclosure ~${s.lengthMm}×${s.widthMm}×${s.heightMm}mm${oscNote}`,
            ...(cadWarnings.length ? { warnings: cadWarnings } : {}),
          });
          break;
        }

        case "update_pcb": {
          console.log(`Generating PCB for project (PCBFlow): ${projectName}`);
          const pcbArgs = normalizePcbToolArgs(isRecord(args) ? args : {});
          if (pcbEngine !== "pcbflow") {
            console.warn(
              `[PCB] Requested engine "${pcbEngine}" ignored; PCBFlow is the only supported engine.`,
            );
          }
          if (!openaiClient) {
            const err =
              "PCBFlow requires an OpenAI client on the server (misconfiguration).";
            nextState.circuitronResults = {
              success: false,
              files: {},
              logs: [],
              error: err,
              pcbSource: "pcbflow",
              pcbWarnings: [err],
            };
            toolResults.push({
              tool: call.tool,
              applied: false,
              summary: err,
              data: nextState.circuitronResults,
            });
            break;
          }

          try {
            const cr = await generatePcbWithPcbflow({
              openai: openaiClient,
              pcbArgs,
              projectName,
              conversationContext,
            });
            const ws =
              cr.workspaceFiles && Object.keys(cr.workspaceFiles).length > 0
                ? { ...cr.workspaceFiles }
                : null;

            if (!ws) {
              const detailedError =
                cr.error ||
                "PCBFlow produced no PCB output files.";
              const degraded = mergePcbflowFailureWithMockPreview(
                pcbArgs,
                projectName,
                detailedError,
              );
              const outlineW = toNumber(pcbArgs.widthMm) || 80;
              const outlineH = toNumber(pcbArgs.heightMm) || 50;
              const outlineLayers = toNumber(pcbArgs.layerCount) || 2;
              nextState.circuitronResults = {
                ...degraded,
                widthMm: outlineW,
                heightMm: outlineH,
                layerCount: outlineLayers,
              };
              toolResults.push({
                tool: call.tool,
                applied: true,
                summary: `PCBFlow failed; showing Manhattan F.Cu preview (${outlineW}×${outlineH} mm).`,
                warnings: nextState.circuitronResults.pcbWarnings,
                data: nextState.circuitronResults,
              });
              break;
            }

            const partial = !cr.success;
            const outlineW = toNumber(pcbArgs.widthMm) || 80;
            const outlineH = toNumber(pcbArgs.heightMm) || 50;
            const outlineLayers = toNumber(pcbArgs.layerCount) || 2;
            nextState.circuitronResults = {
              ...cr,
              success: true,
              workspaceFiles: ws,
              pcbSource: "pcbflow",
              widthMm: outlineW,
              heightMm: outlineH,
              layerCount: outlineLayers,
              pcbWarnings: partial
                ? [pcbUiWarningLine(cr.error || "PCBFlow completed with warnings.")]
                : undefined,
            };
            toolResults.push({
              tool: call.tool,
              applied: true,
              summary: partial
                ? `PCB from PCBFlow (partial): ${Object.keys(ws).join(", ")}`
                : `PCB generated via PCBFlow: ${Object.keys(ws).join(", ")}`,
              warnings: partial
                ? [pcbUiWarningLine(cr.error || "Partial PCBFlow output")]
                : undefined,
              data: nextState.circuitronResults,
            });
          } catch (error) {
            const errorMsg = `PCBFlow error: ${error instanceof Error ? error.message : error}`;
            const degraded = mergePcbflowFailureWithMockPreview(
              pcbArgs,
              projectName,
              errorMsg,
            );
            const outlineW = toNumber(pcbArgs.widthMm) || 80;
            const outlineH = toNumber(pcbArgs.heightMm) || 50;
            const outlineLayers = toNumber(pcbArgs.layerCount) || 2;
            nextState.circuitronResults = {
              ...degraded,
              widthMm: outlineW,
              heightMm: outlineH,
              layerCount: outlineLayers,
            };
            toolResults.push({
              tool: call.tool,
              applied: true,
              summary: `PCBFlow threw; showing Manhattan F.Cu preview (${outlineW}×${outlineH} mm).`,
              warnings: nextState.circuitronResults.pcbWarnings,
              data: nextState.circuitronResults,
            });
          }
          break;
        }

        case "update_firmware": {
          if (!openaiClient) {
            toolResults.push({
              tool: call.tool,
              applied: false,
              summary: "Firmware generation unavailable: missing OpenAI client.",
            });
            break;
          }
          try {
            const code = await generateFirmwareFromContext({
              openai: openaiClient,
              projectName,
              conversationContext,
              pcbArgs: isRecord(args) ? args : {},
            });
            nextState.firmware = code;
            toolResults.push({
              tool: call.tool,
              applied: true,
              summary: `Firmware generated (${code.length} chars).`,
            });
          } catch (error) {
            const msg = error instanceof Error ? error.message : "Firmware generation failed";
            toolResults.push({
              tool: call.tool,
              applied: false,
              summary: msg,
              errors: [msg],
            });
          }
          break;
        }

        case "replace_bom": {
          const lines = Array.isArray(args.lines) ? args.lines : [];
          nextState.bom = {
            lines: lines.filter(isRecord).map(normalizeBomLine),
          };
          toolResults.push({
            tool: call.tool,
            applied: true,
            summary: `BOM replaced with ${nextState.bom.lines.length} components`,
          });
          break;
        }

        case "append_bom_lines": {
          const lines = Array.isArray(args.lines) ? args.lines : [];
          const newLines = lines.filter(isRecord).map(normalizeBomLine);
          nextState.bom = {
            lines: [...nextState.bom.lines, ...newLines],
          };
          toolResults.push({
            tool: call.tool,
            applied: true,
            summary: `Added ${newLines.length} components to BOM`,
          });
          break;
        }

        default: {
          toolResults.push({
            tool: call.tool,
            applied: false,
            summary: `Unknown tool: ${call.tool}`,
            errors: [`Tool "${call.tool}" is not supported`],
          });
          break;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error executing tool ${call.tool}:`, error);

      toolResults.push({
        tool: call.tool,
        applied: false,
        summary: `Error: ${errorMessage}`,
        errors: [errorMessage],
      });
    }
  }

  return { nextState, toolResults };
}