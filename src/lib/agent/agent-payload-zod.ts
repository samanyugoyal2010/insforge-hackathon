import { z } from "zod";

/**
 * OpenAI structured outputs (strict JSON schema) reject `z.record(z.unknown())`
 * because `additionalProperties` must declare a `type`. Tool arguments are nested
 * JSON, so we carry them as a string and parse after the completion.
 */
export const agentToolCallZod = z.object({
  tool: z.enum([
    "update_cad",
    "update_pcb",
    "update_firmware",
    "replace_bom",
    "append_bom_lines",
  ]),
  /** Single JSON object as text, e.g. {"widthMm":80} or {"lines":[...]}. Use "{}" if none. */
  argsJson: z.string().default("{}"),
});

export const agentModelPayloadZod = z.object({
  reply: z.string(),
  toolCalls: z.array(agentToolCallZod).default([]),
  /** Short product/board name; null if unchanged. OpenAI structured outputs require nullable, not optional. */
  projectTitle: z.string().max(72).nullable(),
  /** One-line subtitle; null if none. */
  projectTagline: z.string().max(140).nullable(),
});

export type AgentModelPayloadParsed = z.infer<typeof agentModelPayloadZod>;
