import type OpenAI from "openai";
import { extractOpenSCADCodeFromText } from "@/lib/cadam/extract-openscad";
import parseParameters from "@/lib/cadam/parse-parameters";
import {
  EDIT_MODE_USER_SUFFIX,
  STRICT_CODE_PROMPT,
  USER_PRINTABILITY_NUDGE,
} from "@/lib/cadam/prompts";
import type { CadOpenScadParameter } from "@/lib/cadam/parameter-types";

export type GenerateOpenscadParams = {
  openai: OpenAI;
  /** Model id, e.g. from OPENAI_CAD_MODEL or gpt-4o-mini */
  model: string;
  /** Primary design brief (from tool args or intent). */
  userPrompt: string;
  /** Extra markdown block: BOM, PCB size, conversation. */
  contextBlock: string;
  /** Previous OpenSCAD when iterating. */
  baseCode?: string;
  /** When recompiling after WASM error. */
  fixError?: string;
};

export type GenerateOpenscadResult = {
  code: string;
  parameters: CadOpenScadParameter[];
};

/** Env: OPENAI_CAD_MODEL overrides; else gpt-4o. */
export function resolveCadOpenAiModel(): string {
  const m = process.env.OPENAI_CAD_MODEL?.trim();
  if (m) return m;
  return "gpt-4o";
}

export async function generateOpenscadFromContext(
  params: GenerateOpenscadParams,
): Promise<GenerateOpenscadResult> {
  const hasBase = Boolean(params.baseCode?.trim());
  const userParts = [
    params.userPrompt.trim(),
    "",
    params.contextBlock.trim(),
    "",
    USER_PRINTABILITY_NUDGE,
    ...(hasBase ? ["", EDIT_MODE_USER_SUFFIX] : []),
  ].join("\n");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (hasBase) {
    messages.push({
      role: "assistant",
      content: params.baseCode!.trim(),
    });
  }

  const userContent = params.fixError?.trim()
    ? `${userParts}\n\nFix this OpenSCAD compile or geometry error (stderr or description):\n${params.fixError.trim()}${hasBase ? `\n\n${EDIT_MODE_USER_SUFFIX}` : ""}`
    : userParts;

  messages.push({ role: "user", content: userContent });

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const completion = await params.openai.chat.completions.create({
      model: params.model,
      temperature: 0.2, // low temp for coding
      max_completion_tokens: 16000,
      messages: [{ role: "system", content: STRICT_CODE_PROMPT }, ...messages],
    });

    let raw = completion.choices[0]?.message?.content ?? "";
    if (typeof raw !== "string") {
      raw = "";
    }
    raw = raw.trim();

    const extracted = extractOpenSCADCodeFromText(raw);
    const code = (extracted ?? raw).trim();

    if (!code || code === "404") {
      if (attempt < maxAttempts - 1) {
         messages.push({ role: "assistant", content: raw });
         messages.push({ role: "user", content: "You must output valid OpenSCAD code. Ensure it is not empty. Try again." });
         continue;
      }
      throw new Error("OpenSCAD codegen returned empty or invalid output");
    }

    // HARD RULE: No rotate_extrude or cylinder
    if (code.includes("rotate_extrude(") || code.includes("cylinder(")) {
      if (attempt < maxAttempts - 1) {
        messages.push({ role: "assistant", content: raw });
        messages.push({ role: "user", content: "HARD RULE VIOLATION: Do not use \`rotate_extrude\` or \`cylinder\`. You must prioritize strict rectangular/cubic enclosures using \`cube\` and \`square\` primitives ONLY. Cylinders are strictly banned." });
        continue;
      }
    }

    // HARD RULE: Must use rectangular primitives for the enclosure
    if (!code.includes("cube(") && !code.includes("square(")) {
      if (attempt < maxAttempts - 1) {
        messages.push({ role: "assistant", content: raw });
        messages.push({ role: "user", content: "HARD RULE VIOLATION: The design completely lacks rectangular geometry. You must use \`cube()\` or \`square()\` to form the primary enclosure body. Do not rely entirely on cylinders and spheres." });
        continue;
      }
    }

    // Passed all hard rules
    return {
      code,
      parameters: parseParameters(code),
    };
  }

  throw new Error("Failed to generate valid rectangular CAD after multiple attempts.");
}
