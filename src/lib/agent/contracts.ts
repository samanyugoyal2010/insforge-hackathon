import {
  pickBomQty,
  pickBomStringField,
  type BomDocument,
  type BomLine,
} from "@/lib/bom";
import type { CadDocument } from "@/lib/cad-document";
import type { CircuitronResponse } from "@/lib/circuitron";

export type AgentToolName =
  | "update_cad"
  | "update_pcb"
  | "update_firmware"
  | "replace_bom"
  | "append_bom_lines";

export type AgentToolCall = {
  tool: AgentToolName;
  args: Record<string, unknown>;
};

export type AgentStateSnapshot = {
  cad: CadDocument;
  pcb: null; // PCB state is now handled by Circuitron
  bom: BomDocument;
  circuitronResults?: CircuitronResponse | null; // Results from Circuitron
  firmware?: string | null;
  /** AI-chosen display name; client updates project list + CAD/BOM export filenames. */
  projectTitle?: string;
  projectTagline?: string;
};

export type AgentToolResult = {
  tool: AgentToolName;
  applied: boolean;
  summary: string;
  data?: any; // Additional result data (e.g., Circuitron files)
  warnings?: string[];
  errors?: string[];
};

export type AgentModelPayload = {
  reply: string;
  toolCalls: AgentToolCall[];
  projectTitle?: string;
  projectTagline?: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const VALID_TOOLS: AgentToolName[] = [
  "update_cad",
  "update_pcb",
  "update_firmware",
  "replace_bom",
  "append_bom_lines",
];

function normalizeToolName(value: unknown): AgentToolName | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "update_cad" || v === "updatecad") return "update_cad";
  if (v === "update_pcb" || v === "updatepcb") return "update_pcb";
  if (v === "update_firmware" || v === "updatefirmware") return "update_firmware";
  if (v === "replace_bom" || v === "update_bom" || v === "updatebom")
    return "replace_bom";
  if (v === "append_bom_lines" || v === "appendbomlines")
    return "append_bom_lines";
  return null;
}

function parseToolCalls(raw: unknown): AgentToolCall[] {
  if (!Array.isArray(raw)) return [];
  const calls: AgentToolCall[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const normalizedTool = normalizeToolName(item.tool ?? item.type);
    if (!normalizedTool || !VALID_TOOLS.includes(normalizedTool)) continue;
    const args = isRecord(item.args)
      ? item.args
      : isRecord(item.data)
        ? item.data
        : {};
    calls.push({ tool: normalizedTool, args });
  }
  return calls;
}

function metaFromParsedRecord(parsed: Record<string, unknown>): {
  projectTitle?: string;
  projectTagline?: string;
} {
  const out: { projectTitle?: string; projectTagline?: string } = {};
  if (typeof parsed.projectTitle === "string") {
    const t = parsed.projectTitle.trim();
    if (t) out.projectTitle = t.slice(0, 72);
  }
  if (typeof parsed.projectTagline === "string") {
    const t = parsed.projectTagline.trim();
    if (t) out.projectTagline = t.slice(0, 140);
  }
  return out;
}

export function parseAgentPayload(raw: string): AgentModelPayload | null {
  const candidates: string[] = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (typeof parsed.reply !== "string" || parsed.reply.trim() === "") continue;
      return {
        reply: parsed.reply.trim(),
        toolCalls: parseToolCalls(parsed.toolCalls),
        ...metaFromParsedRecord(parsed),
      };
    } catch {
      try {
        const unescaped = candidate.replace(/\\"/g, '"');
        const parsed = JSON.parse(unescaped) as Record<string, unknown>;
        if (typeof parsed.reply !== "string" || parsed.reply.trim() === "") continue;
        return {
          reply: parsed.reply.trim(),
          toolCalls: parseToolCalls(parsed.toolCalls),
          ...metaFromParsedRecord(parsed),
        };
      } catch {
        const replyMatch = candidate.match(/"reply"\s*:\s*"([\s\S]*?)"\s*(,|})/);
        if (replyMatch?.[1]) {
          const reply = replyMatch[1]
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .trim();
          return {
            reply,
            toolCalls: parseToolCalls([]),
          };
        }
      }
    }
  }
  return null;
}

export function normalizeBomLine(line: Record<string, unknown>, index: number): BomLine {
  const description = pickBomStringField(line, [
    "description",
    "component",
    "value",
    "part",
    "item",
  ]);
  const qty = pickBomQty(line);

  return {
    id:
      typeof line.id === "string" && line.id.length > 0
        ? line.id
        : `ai-bom-${Date.now()}-${index}`,
    designators: pickBomStringField(line, [
      "designators",
      "designator",
      "ref",
      "refs",
      "reference",
    ]),
    description,
    mpn: pickBomStringField(line, [
      "mpn",
      "MPN",
      "part_number",
      "partnumber",
      "manufacturer_part_number",
      "lcsc",
      "lcsc_part",
      "jlc",
      "sku",
      "vendor_part",
      "catalog",
    ]),
    manufacturer: pickBomStringField(line, [
      "manufacturer",
      "mfr",
      "vendor",
      "brand",
    ]),
    qty,
    footprint: pickBomStringField(line, [
      "footprint",
      "fp",
      "package",
      "land_pattern",
      "pcb_footprint",
    ]),
    notes: pickBomStringField(line, ["notes", "note", "comment", "comments"]),
  };
}
