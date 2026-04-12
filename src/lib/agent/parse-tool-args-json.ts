import type { AgentModelPayload, AgentToolCall } from "@/lib/agent/contracts";
import type { AgentModelPayloadParsed } from "@/lib/agent/agent-payload-zod";

/**
 * Parse argsJson from strict-schema-safe tool call rows into AgentToolCall.args.
 */
export function parseArgsJsonString(raw: string): Record<string, unknown> {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return {};
  try {
    const v = JSON.parse(s) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const v = JSON.parse(m[0]) as unknown;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          return v as Record<string, unknown>;
        }
      } catch {
        /* ignore */
      }
    }
  }
  return {};
}

export function toolCallsFromParsedPayload(
  parsed: AgentModelPayloadParsed,
): AgentModelPayload["toolCalls"] {
  return parsed.toolCalls.map(
    (tc): AgentToolCall => ({
      tool: tc.tool,
      args: parseArgsJsonString(tc.argsJson ?? "{}"),
    }),
  );
}
