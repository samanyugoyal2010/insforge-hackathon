import type OpenAI from "openai";
import { generateOpenscadFromContext, resolveCadOpenAiModel } from "@/lib/cadam/generate-openscad";
import parseParameters from "@/lib/cadam/parse-parameters";
import { PARAMETRIC_AGENT_PROMPT, CADIUM_TOOLS } from "./prompts";
import type { GenerateOpenscadParams, GenerateOpenscadResult } from "@/lib/cadam/generate-openscad";

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function runCadiumEngine(
  params: GenerateOpenscadParams
): Promise<GenerateOpenscadResult> {
  const hasBase = Boolean(params.baseCode?.trim());
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: PARAMETRIC_AGENT_PROMPT },
  ];

  if (hasBase) {
    messages.push({
      role: "assistant",
      content: params.baseCode!.trim(),
    });
  }

  messages.push({ role: "user", content: params.userPrompt.trim() });

  try {
    const runner = await params.openai.chat.completions.create({
      model: resolveCadOpenAiModel(),
      messages,
      tools: CADIUM_TOOLS,
      tool_choice: "auto",
    });

    const responseMessage = runner.choices[0]?.message;

    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      
      if (toolCall?.type === "function") {
        if (toolCall.function.name === "apply_parameter_changes") {
          let args: { updates?: { name: string; value: string }[] } = {};
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            // fallback to regen if parsing fails
          }

          const baseCode = params.baseCode;
          if (baseCode && args.updates && args.updates.length > 0) {
            let patchedCode = baseCode;
            const currentParams = parseParameters(baseCode);
            for (const upd of args.updates) {
              const target = currentParams.find((p) => p.name === upd.name);
              if (!target) continue;
              let coerced: string | number | boolean = upd.value;
              try {
                if (target.type === "number") coerced = Number(upd.value);
                else if (target.type === "boolean") coerced = String(upd.value) === "true";
                else if (target.type === "string") coerced = String(upd.value);
              } catch (_) {
                coerced = upd.value;
              }
              patchedCode = patchedCode.replace(
                new RegExp(
                  `^\\s*(${escapeRegExp(target.name)}\\s*=\\s*)[^;]+;([\\t\\f\\cK ]*\\/\\/[^\\n]*)?`,
                  "m"
                ),
                (_, g1: string, g2: string) => {
                  if (target.type === "string") {
                    return `${g1}"${String(coerced).replace(/"/g, '\\"')}";${g2 || ""}`;
                  }
                  return `${g1}${coerced};${g2 || ""}`;
                }
              );
            }
            console.log("[runCadiumEngine] Applied parameter changes directly.");
            return {
              code: patchedCode,
              parameters: parseParameters(patchedCode),
            };
          }
        } else if (toolCall.function.name === "build_parametric_model") {
          let args: { text?: string } = {};
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            // Ignore parse errors, just use the original prompt
          }
          
          console.log("[runCadiumEngine] Agent decided to build_parametric_model. Proceeding to regeneration.");
          if (args.text) {
             params.userPrompt = args.text;
          }
        }
      }
    }
  } catch (err) {
    console.error("[runCadiumEngine] Agentic pass failed, falling back to full regeneration:", err);
  }

  // Fallback or build_parametric_model branch: full regeneration
  return generateOpenscadFromContext(params);
}
