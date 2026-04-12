import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  type AgentModelPayload,
  type AgentStateSnapshot,
  type AgentToolCall,
  parseAgentPayload,
} from "@/lib/agent/contracts";
import {
  type AgentModelPayloadParsed,
  agentModelPayloadZod,
} from "@/lib/agent/agent-payload-zod";
import { toolCallsFromParsedPayload, parseArgsJsonString } from "@/lib/agent/parse-tool-args-json";
import { dedupeRepeatedAssistantReply } from "@/lib/agent/sanitize-reply";
import { executeToolCalls } from "@/lib/agent/tool-executor";
import type { PcbEngine } from "@/lib/pcb-engine";
import type { CadEngine } from "@/lib/cad-engine";

function makeSystemInstruction(
  mode: "default" | "search" | "think",
  structured: boolean,
) {
  const baseInstruction =
    "You are Node0, a senior hardware engineer. You ship concrete designs in the app panels (CAD, PCB, BOM)—not vague plans. " +
    "For every NEW product or hardware build request in this turn, you MUST emit tool calls that populate data: " +
    "replace_bom (≥10 lines: designator, description, MPN or common LCSC/JLC-style part, footprint, qty, manufacturer when known), " +
    "update_cad: use cadFeatures (array) for constructive solid geometry—each entry { op: union|subtract (or combine|cut), shape: box|cylinder|sphere|roundedBox, positionMm:{x,y,z}, optional rotationDeg, sizeMm:{x,y,z} for box/roundedBox, radiusMm and heightMm for cylinder, radiusMm for sphere, cornerRadiusMm for roundedBox, label }. Apply in order: first union seeds the solid; subtract removes material (e.g. inner cavity, USB slot, vent holes). Prefer ≥5 features for a real enclosure. CRITICAL: the enclosure must be recognizably shaped like the actual product—a dog feeder needs a bowl/hopper shape, a weather station needs a curved housing, a remote needs an ergonomic grip. NEVER send a plain rectangular box for a real product; use cylinders, spheres, rounded boxes at various angles to create product-appropriate geometry. You may instead send only lengthMm,widthMm,heightMm,wallMm,cornerRadiusMm for a quick box template—use wallMm ≥ 2.5 for FDM-printable walls (never below 2 mm)—but the OpenSCAD backend will still generate product-specific shapes from the project name. " +
    "On follow-up CAD requests, emit ONLY changed fields: e.g. wallMm or lengthMm alone, or presentation/openFace only for view—do not resend the entire cadFeatures array unless the enclosure topology actually changes (the backend edits existing OpenSCAD incrementally). " +
    "Always set presentation for visibility: default is open-front cutaway. Use openFace:\"front\" (or presentation:{openFace:\"front\",openFaceReveal:0.5}) so the user can see the PCB and cavity; use openFace:\"top\" for lid-off; openFace:\"none\" only for a fully closed shell. When the user asks to see inside, open the front panel, cutaway, or show internal parts, you MUST emit openFace:\"front\" (and optionally adjust openFaceReveal 0.4–0.65). " +
    "update_pcb (components with ref, value, footprint, position; nets with name and nodes array of pin refs like U1.GND or C1+; connectedNodes is accepted as an alias; widthMm/heightMm or boardDimensions; autoroute:true for automatic routing). " +
    "update_firmware (generate complete firmware source code for the designed hardware; output the source text in argsJson with key `code`). " +
    "update_pcb drives pcbflow Python on the server: the board tab must show filled copper (GND pours on GTL+GBL), outline, and silk—not wireframe stubs. Pass complete components[] and nets[] so previews and pours stay coherent. " +
    "Use ESP32-class MCU, USB-C power input, motor driver or suitable FET, and a hobby servo or geared motor as the user asked; pick sane 2-layer-friendly placement. " +
    "Hand-solder bias: 1206/0805 or through-hole where possible. " +
    "Put tool arguments ONLY in each tool's argsJson as a single JSON object string. " +
    "In reply: be brief (under ~900 characters). Use short bullets. Do NOT use long markdown essays, numbered '###' sections, or duplicate paragraphs. " +
    "Do NOT say 'we will' or 'next steps' without having already issued the tool calls in this same response. ";

  if (structured) {
    const tail =
      mode === "think"
        ? "Reason carefully, then still output the required tool calls. "
        : "";
    return (
      baseInstruction +
      tail +
      "Populate reply (brief) and toolCalls. If the user described a product, gadget, PCB, or circuit to realize (including temperature/USB/heating/display projects), you MUST emit replace_bom + update_cad + update_pcb in this response—never refuse with 'no edits needed', 'if satisfied', or toolCalls:[]. " +
      "For hardware builds that involve control logic, scheduling, sensing, motors, connectivity, or user interaction, also emit update_firmware in the same response. " +
      "Empty toolCalls ONLY for abstract theory Q&A with zero build intent. Follow-up rants demanding you ship the design still require full tool calls. " +
      "Always set projectTitle to a concise product/board name (3–8 words); projectTagline to one short subtitle or null."
    );
  }

  if (mode === "think") {
    return (
      baseInstruction +
      "Think deeply about the design problem and provide detailed technical analysis. " +
      "Always return strict JSON only: {\"reply\":string,\"toolCalls\":[...]}."
    );
  }

  return (
    baseInstruction +
    "Be conversational and helpful while maintaining technical accuracy. " +
    "Always return strict JSON only: {\"reply\":string,\"toolCalls\":[...]}."
  );
}

function getContextualProgressMessage(toolCalls: AgentToolCall[]): string {
  if (toolCalls.length === 0) return "Analyzing your request...";

  const toolTypes = new Set(toolCalls.map((tc) => tc.tool));

  if (toolTypes.has("update_cad")) {
    return "Updating your CAD model...";
  }
  if (toolTypes.has("update_pcb")) {
    return "Optimizing PCB layout and routing...";
  }
  if (toolTypes.has("replace_bom") || toolTypes.has("append_bom_lines")) {
    return "Updating bill of materials...";
  }

  return "Processing design changes...";
}

function fallbackPayload(raw: string): AgentModelPayload {
  const parsed = parseAgentPayload(raw);
  if (parsed) return parsed;
  return { reply: raw.trim() || "No response.", toolCalls: [] };
}

function safeParseAgentPayloadFromMessageContent(
  content: OpenAI.Chat.Completions.ChatCompletionMessage["content"] | null,
): AgentModelPayload {
  if (typeof content === "string") {
    return fallbackPayload(content);
  }
  if (Array.isArray(content)) {
    const parts = content as Array<{ type?: string; text?: string }>;
    const text = parts
      .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
      .join("\n")
      .trim();
    return fallbackPayload(text);
  }
  return { reply: "No response.", toolCalls: [] };
}

/**
 * Structured design path (tools + Circuitron) vs conversational mini model.
 * Product pitches like "USB-powered coaster to keep my mug warm" used to miss the
 * narrow "build|design|…" regex and got prose-only replies with toolCalls: [].
 */
function detectDesignIntent(intentSource: string, message: string): boolean {
  const msgTrim = message.trim();
  const looksLikePureQna =
    /^\s*(what|why|how\b|explain|define|describe|compare|is there|are there|can you explain|tell me what|difference between|which is better|pros and cons)\b/i.test(
      msgTrim,
    );

  const explicit =
    /\b(build|design|pcb|bom|cad|schematic|enclosure|board|circuit|sensor|components?\b|layout|go ahead|proceed|continue|make|create|add|update|modify|change|place|route|connect|finalize|finalise|finalizing|implement|spec(?:-|\s)?out|bill of materials|no cloud|straightforward|powered by|power it|have to|must\s+(emit|call|do))\b/i.test(
      intentSource,
    );

  const hardwareContext =
    /\b(usb|usbc|usb[-\s]?c|battery|charger|thermistor|thermocouple|\bntc\b|\bptc\b|temperature|thermal|heater|heat|heated|warming|warm|cooling|cool|sensor|mcu|microcontroller|esp32|esp[-\s]?s3|stm32|arduino|rp2040|display|oled|lcd|e-?ink|tft|segment|clock|rtc|desk\s*clock|coaster|mug|coffee|brew|pcb|netlist|footprint|solder|smd|through[-\s]?hole|voltage|current|watt|\bma\b|3\.3v|5v|9v|12v|24v|ldo|regulator|buck|boost|pmic|mosfet|\bfet\b|igbt|relay|ssr|motor|servo|stepper|brushed|haptic|led|rgb|neopixel|wifi|bluetooth|ble|zigbee|raspberry\b|cloud|offline|prototype|enclosure|housing|\bcase\b|gadget|device|module|powered|wearable|iot|heating element|safety limit)\b/i.test(
      intentSource,
    );

  const productPitch =
    intentSource.trim().length >= 18 && hardwareContext && !looksLikePureQna;

  return explicit || productPitch;
}

export async function streamingAgentLoop(params: {
  client: OpenAI;
  mode: "default" | "search" | "think";
  projectName: string;
  message: string;
  conversationContext?: string;
  images: string[];
  initialState: AgentStateSnapshot;
  /** Dashboard Settings: Circuitron (default) or PCBFlow (codegen + local Python). */
  pcbEngine?: PcbEngine;
  /** Dashboard Settings: cadam (default) or cadium. */
  cadEngine?: CadEngine;
  abortSignal?: AbortSignal;
  onToken?: (token: string) => void;
  onProgress?: (progress: {
    message: string;
    type: "analyzing" | "processing" | "updating";
  }) => void;
  onToolCall?: (toolCall: unknown) => void;
  onToolResult?: (result: unknown) => void;
  onComplete?: (result: {
    reply: string;
    toolCalls: AgentModelPayload["toolCalls"];
    toolResults: Awaited<ReturnType<typeof executeToolCalls>>["toolResults"];
    nextState: AgentStateSnapshot;
  }) => void;
}) {
  const {
    client,
    mode,
    projectName,
    message,
    images,
    abortSignal,
    onToken,
    onProgress,
    onToolCall,
    onToolResult,
    onComplete,
  } = params;
  let workingState = params.initialState;
  const allToolCalls: AgentModelPayload["toolCalls"] = [];
  const allToolResults: Awaited<ReturnType<typeof executeToolCalls>>["toolResults"] = [];
  const intentSource = `${params.conversationContext ?? ""}\n${message}`;

  const designIntent = detectDesignIntent(intentSource, message);

  onProgress?.({ message: "Understanding your request...", type: "analyzing" });

  if (abortSignal?.aborted) {
    throw new Error("Request aborted", { cause: { name: "AbortError" } });
  }

  try {
    const bomLineCount = workingState.bom.lines.length;
    const workspaceUnsetHint =
      designIntent && bomLineCount === 0
        ? "Workspace: BOM is still empty and CAD may be a default template only—the user expects a full concrete BOM, enclosure, and PCB for their idea, not advice to skip tools.\n"
        : "";

    const designModeInstruction = designIntent
      ? "Design mode: you MUST emit replace_bom, update_cad, and update_pcb in this turn. Do NOT return an empty toolCalls array. Do not claim 'no edits are needed' or that monitoring/advice is enough—materialize the design in the panels.\n"
      : "If this is pure Q&A with no hardware to change, return an empty toolCalls array.\n";

    const userTextBody =
      `Project: ${projectName}\n` +
      `Request: ${message}\n` +
      `${params.conversationContext ? `Recent conversation:\n${params.conversationContext}\n` : ""}` +
      workspaceUnsetHint +
      `Current CAD: ${JSON.stringify(workingState.cad)}\n` +
      `Current PCB: ${JSON.stringify(workingState.pcb)}\n` +
      `Current BOM: ${JSON.stringify(workingState.bom)}\n` +
      designModeInstruction;

    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: "text", text: userTextBody },
      ...images.map((imageUrl) => ({
        type: "image_url" as const,
        image_url: { url: imageUrl },
      })),
    ];

    let finalReply = "";
    let finalToolCalls: AgentModelPayload["toolCalls"] = [];
    let finalProjectTitle: string | undefined;
    let finalProjectTagline: string | undefined;

    if (designIntent) {
      onProgress?.({ message: "Generating design updates...", type: "processing" });

      const model = process.env.OPENAI_BEST_MODEL?.trim() || "o3";
      const systemContent = makeSystemInstruction(mode, true);

      const parseDesign = async (
        userParts: OpenAI.Chat.ChatCompletionContentPart[],
      ) => {
        try {
          return await client.chat.completions.parse({
            model,
            max_completion_tokens: 8192,
            messages: [
              { role: "system", content: systemContent },
              { role: "user", content: userParts },
            ],
            response_format: zodResponseFormat(
              agentModelPayloadZod,
              "node0_agent_payload",
            ),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isLengthParseIssue =
            /length limit was reached/i.test(message) ||
            /Could not parse response content/i.test(message);
          if (!isLengthParseIssue) throw error;
          const fallbackCompletion = await client.chat.completions.create({
            model,
            max_completion_tokens: 8192,
            messages: [
              { role: "system", content: systemContent },
              { role: "user", content: userParts },
            ],
            response_format: { type: "json_object" },
          });
          const message0 = fallbackCompletion.choices[0]?.message;
          const fb = safeParseAgentPayloadFromMessageContent(
            message0?.content ?? null,
          );
          return {
            choices: [
              {
                message: {
                  ...message0,
                  parsed: fb,
                },
              },
            ],
          } as unknown as Awaited<ReturnType<typeof client.chat.completions.parse>>;
        }
      };

      let completion = await parseDesign(userContent);

      if (abortSignal?.aborted) {
        throw new Error("Request aborted", { cause: { name: "AbortError" } });
      }

      let msg = completion.choices[0]?.message;
      const applyParsed = () => {
        finalProjectTitle = undefined;
        finalProjectTagline = undefined;
        if (msg?.refusal) {
          finalReply = msg.refusal;
          finalToolCalls = [];
        } else if (msg?.parsed) {
          const parsed = msg.parsed as AgentModelPayloadParsed;
          finalReply = dedupeRepeatedAssistantReply(parsed.reply);
          finalToolCalls = toolCallsFromParsedPayload(parsed);
          const pt = parsed.projectTitle;
          if (typeof pt === "string" && pt.trim()) {
            finalProjectTitle = pt.trim().slice(0, 72);
          }
          const tg = parsed.projectTagline;
          if (typeof tg === "string" && tg.trim()) {
            finalProjectTagline = tg.trim().slice(0, 140);
          }
        } else {
          const raw = msg?.content ?? "";
          const fb = fallbackPayload(raw);
          finalReply = dedupeRepeatedAssistantReply(fb.reply);
          finalToolCalls = fb.toolCalls;
          if (fb.projectTitle) finalProjectTitle = fb.projectTitle;
          if (fb.projectTagline) finalProjectTagline = fb.projectTagline;
        }
      };
      applyParsed();

      // Check if all required tools are present for product builds
      const hasRequiredTools = finalToolCalls.some(call => call.tool === "replace_bom") &&
                              finalToolCalls.some(call => call.tool === "update_cad") &&
                              finalToolCalls.some(call => call.tool === "update_pcb");

      if (
        (!hasRequiredTools || finalToolCalls.length === 0) &&
        designIntent &&
        !msg?.refusal &&
        !abortSignal?.aborted
      ) {
        onProgress?.({
          message: "Enforcing complete BOM, CAD, and PCB updates…",
          type: "processing",
        });
        const retryContent: OpenAI.Chat.ChatCompletionContentPart[] = [
          ...userContent,
          {
            type: "text",
            text:
              "\n\nYou MUST emit required tool calls now: replace_bom (≥10 lines with MPN/footprint/qty), update_cad (enclosure dimensions in mm for THIS product), update_pcb (components + nets + autoroute:true), and update_firmware when control logic is needed. toolCalls must not be empty. Prose-only or 'no edits needed' responses are invalid.",
          },
        ];
        completion = await parseDesign(retryContent);
        if (abortSignal?.aborted) {
          throw new Error("Request aborted", { cause: { name: "AbortError" } });
        }
        msg = completion.choices[0]?.message;
        applyParsed();
      }

      // Failsafe: Manually add missing tools if still missing after enforcement
      const stillMissingTools = [];
      if (!finalToolCalls.some(call => call.tool === "replace_bom")) {
        stillMissingTools.push("replace_bom");
      }
      if (!finalToolCalls.some(call => call.tool === "update_cad")) {
        stillMissingTools.push("update_cad");
      }
      if (!finalToolCalls.some(call => call.tool === "update_pcb")) {
        stillMissingTools.push("update_pcb");
      }
      if (!finalToolCalls.some(call => call.tool === "update_firmware")) {
        stillMissingTools.push("update_firmware");
      }

      if (stillMissingTools.length > 0 && designIntent) {
        onProgress?.({
          message: `Adding missing tools: ${stillMissingTools.join(', ')}`,
          type: "processing",
        });

        // Add default replace_bom if missing
        if (stillMissingTools.includes("replace_bom")) {
          finalToolCalls.push({
            tool: "replace_bom",
            args: {
              lines: [
                { designator: "U1", description: "ESP32 WiFi/Bluetooth MCU", MPN: "ESP32-WROOM-32", footprint: "ESP32-WROOM-32", qty: 1 },
                { designator: "U2", description: "3.3V LDO Regulator", MPN: "AMS1117-3.3", footprint: "SOT-223", qty: 1 },
                { designator: "Q1", description: "N-Channel MOSFET", MPN: "IRLZ44N", footprint: "TO-220", qty: 1 },
                { designator: "J1", description: "USB-C Connector", MPN: "TYPE-C-31-M-12", footprint: "USB-C-12", qty: 1 },
                { designator: "M1", description: "Stepper Motor", MPN: "NEMA17-HS4023", footprint: "Motor-Mount", qty: 1 },
                { designator: "R1", description: "Pull-up Resistor 10k", MPN: "RC1206FR-0710KL", footprint: "1206", qty: 1 },
                { designator: "C1", description: "Capacitor 100uF", MPN: "UPW1E101MED", footprint: "Radial-D6.3mm", qty: 2 },
                { designator: "C2", description: "Capacitor 10uF", MPN: "CL21B106KAYNNNE", footprint: "0805", qty: 2 },
                { designator: "D1", description: "Schottky Diode", MPN: "MBRS340T3G", footprint: "DO-214AA", qty: 1 },
                { designator: "Y1", description: "Crystal 40MHz", MPN: "ECS-400-20-5PX-TR", footprint: "HC-49/US", qty: 1 }
              ]
            }
          });
        }

        // Add default update_cad if missing — not bare L×W×H only: wall, fillet, and a
        // representative front-panel subtract so the default is never shell+cavity alone.
        if (stillMissingTools.includes("update_cad")) {
          const widthMm = 80;
          const heightMm = 50;
          const lengthMm = 120;
          const wallMm = 2.8;
          const cornerRadiusMm = 4;
          const innerW = Math.max(widthMm - 2 * wallMm, 1);
          const innerH = Math.max(heightMm - 2 * wallMm, 1);
          const innerD = Math.max(lengthMm - 2 * wallMm, 1);
          const innerR = Math.max(cornerRadiusMm - wallMm, 0);
          finalToolCalls.push({
            tool: "update_cad",
            args: {
              lengthMm,
              widthMm,
              heightMm,
              wallMm,
              cornerRadiusMm,
              presentation: {
                openFace: "front",
                openFaceReveal: 0.52,
              },
              cadFeatures: [
                {
                  op: "union",
                  shape: "roundedBox",
                  positionMm: { x: 0, y: 0, z: 0 },
                  sizeMm: { x: widthMm, y: heightMm, z: lengthMm },
                  cornerRadiusMm,
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
                {
                  op: "subtract",
                  shape: "box",
                  positionMm: { x: 0, y: -6, z: lengthMm / 2 - 1 },
                  sizeMm: { x: 11, y: 4.5, z: 14 },
                  label: "USB-C slot (template)",
                },
              ],
            },
          });
        }

        // Add default update_pcb if missing
        if (stillMissingTools.includes("update_pcb")) {
          finalToolCalls.push({
            tool: "update_pcb",
            args: {
              components: [
                { ref: "U1", value: "ESP32-WROOM-32", footprint: "ESP32-WROOM-32", position: "20,20" },
                { ref: "U2", value: "AMS1117-3.3", footprint: "SOT-223", position: "50,20" },
                { ref: "Q1", value: "MOSFET", footprint: "TO-220", position: "20,50" },
                { ref: "J1", value: "USB-C", footprint: "USB-C-12", position: "5,40" },
                { ref: "M1", value: "Stepper", footprint: "Motor-Mount", position: "70,50" }
              ],
              nets: [
                { name: "VCC", nodes: ["U1.VCC", "U2.OUT", "Q1.VDD"] },
                { name: "GND", nodes: ["U1.GND", "U2.GND", "J1.GND"] },
                { name: "GPIO", nodes: ["U1.GPIO4", "Q1.GATE"] }
              ],
              boardDimensions: "80,120",
              autoroute: true
            }
          });
        }
        if (stillMissingTools.includes("update_firmware")) {
          finalToolCalls.push({
            tool: "update_firmware",
            args: {
              code:
                "// Firmware placeholder generated by fallback.\n" +
                "#include <Arduino.h>\n\n" +
                "void setup() {\n  Serial.begin(115200);\n}\n\n" +
                "void loop() {\n  delay(1000);\n}\n",
            },
          });
        }
      }

      for (const char of finalReply) {
        onToken?.(char);
      }
    } else {
      const stream = await client.chat.completions.create({
        model: "gpt-4o-mini",
        stream: true,
        messages: [
          {
            role: "system",
            content:
              "You are Node0, a friendly hardware design assistant. Answer concisely. " +
              "Do not use JSON unless the user asks for data.",
          },
          {
            role: "user",
            content: userContent,
          },
        ],
      });

      let accumulatedContent = "";

      for await (const chunk of stream) {
        if (abortSignal?.aborted) {
          throw new Error("Request aborted", { cause: { name: "AbortError" } });
        }

        const delta = chunk.choices[0]?.delta;
        if (!delta?.content) continue;

        accumulatedContent += delta.content;
        for (const char of delta.content) {
          onToken?.(char);
        }
      }

      finalReply = accumulatedContent.trim();
      finalToolCalls = [];
    }

    // Do not stream finalReply again here: design-intent path already calls onToken
    // per character (above), and the conversational path streams each delta. A second
    // word-by-word pass duplicated the entire message in the UI ("Here'sHere's a a…").

    if (finalToolCalls.length > 0) {
      if (abortSignal?.aborted) {
        throw new Error("Request aborted", { cause: { name: "AbortError" } });
      }

      onProgress?.({
        message: getContextualProgressMessage(finalToolCalls),
        type: "updating",
      });

      for (const toolCall of finalToolCalls) {
        if (abortSignal?.aborted) {
          throw new Error("Request aborted", { cause: { name: "AbortError" } });
        }
        onToolCall?.(toolCall);
      }

      const nameForDesign =
        (finalProjectTitle?.trim() || projectName).trim() || "Untitled board";

      const executed = await executeToolCalls(
        workingState,
        finalToolCalls,
        nameForDesign,
        params.conversationContext,
        {
          pcbEngine: params.pcbEngine ?? "pcbflow",
          cadEngine: params.cadEngine ?? "cadam",
          openaiClient: client,
        },
      );
      workingState = executed.nextState;
      allToolCalls.push(...finalToolCalls);
      allToolResults.push(...executed.toolResults);

      for (const result of executed.toolResults) {
        onToolResult?.(result);
      }
    }

    if (designIntent) {
      const pt = finalProjectTitle?.trim();
      const tg = finalProjectTagline?.trim();
      if (pt || tg) {
        workingState = {
          ...workingState,
          ...(pt ? { projectTitle: pt.slice(0, 72) } : {}),
          ...(tg ? { projectTagline: tg.slice(0, 140) } : {}),
        };
      }
    }

    onComplete?.({
      reply: finalReply,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      nextState: workingState,
    });

    return {
      reply: finalReply,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      nextState: workingState,
    };
  } catch (error) {
    if (
      abortSignal?.aborted ||
      (error instanceof Error && error.message.includes("aborted"))
    ) {
      const abortError = new Error("Request was cancelled");
      abortError.name = "AbortError";
      throw abortError;
    }
    throw new Error(
      `Streaming agent loop failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
