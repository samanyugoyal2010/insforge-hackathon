import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getDefaultAgentState } from "@/lib/agent/tool-executor";
import { isRecord } from "@/lib/agent/contracts";
import { parseCadDocumentUnknown } from "@/lib/cad-document";
import { EMPTY_BOM } from "@/lib/bom";
import { streamingAgentLoop } from "@/lib/agent/streaming-loop";
import { parsePcbEngine } from "@/lib/pcb-engine";
import { parseCadEngine } from "@/lib/cad-engine";

export const maxDuration = 300;

const apiKey = process.env.OPENAI_API_KEY;

const client = apiKey ? new OpenAI({ apiKey }) : null;

function parseMode(raw: string) {
  const trimmed = raw.trim();
  const searchMatch = /^\[Search:\s*([\s\S]*)\]$/i.exec(trimmed);
  if (searchMatch) return { mode: "search" as const, text: searchMatch[1].trim() };
  const thinkMatch = /^\[Think:\s*([\s\S]*)\]$/i.exec(trimmed);
  if (thinkMatch) return { mode: "think" as const, text: thinkMatch[1].trim() };
  return { mode: "default" as const, text: trimmed };
}

function parseState(body: {
  currentCad?: unknown;
  currentPcb?: unknown;
  currentBom?: unknown;
}) {
  const defaults = getDefaultAgentState();
  const cad = isRecord(body.currentCad)
    ? parseCadDocumentUnknown(body.currentCad) ?? defaults.cad
    : defaults.cad;

  // PCB state is now null since we use Circuitron
  const pcb = null;

  const bom =
    isRecord(body.currentBom) && Array.isArray(body.currentBom.lines)
      ? {
          lines: body.currentBom.lines.filter(isRecord).map((line) => ({
            id: typeof line.id === "string" ? line.id : `line-${Date.now()}`,
            designators:
              typeof line.designators === "string" ? line.designators : "",
            description:
              typeof line.description === "string" ? line.description : "",
            mpn: typeof line.mpn === "string" ? line.mpn : "",
            manufacturer:
              typeof line.manufacturer === "string" ? line.manufacturer : "",
            qty:
              typeof line.qty === "number" && Number.isFinite(line.qty)
                ? Math.max(1, Math.floor(line.qty))
                : 1,
            footprint: typeof line.footprint === "string" ? line.footprint : "",
            notes: typeof line.notes === "string" ? line.notes : "",
          })),
        }
      : EMPTY_BOM;
  return { cad, pcb, bom };
}

export async function POST(req: Request) {
  if (!client) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY on the server." },
      { status: 500 },
    );
  }

  try {
    const body = (await req.json()) as {
      message?: string;
      projectName?: string;
      images?: string[];
      conversationContext?: string;
      currentCad?: Record<string, unknown>;
      currentPcb?: Record<string, unknown>;
      currentBom?: { lines?: unknown[] };
      stream?: boolean;
      pcbEngine?: unknown;
      cadEngine?: unknown;
    };
    const message = (body.message ?? "").trim();
    const projectName = (body.projectName ?? "Untitled board").trim();
    const conversationContext = (body.conversationContext ?? "").trim();
    const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];
    const parsedMode = parseMode(message);
    const mode = "think" as const;
    const text = parsedMode.text;
    const normalizedText = text || (images.length > 0 ? "Describe this image." : "");

    if (!normalizedText) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const initialState = parseState(body);
    const pcbEngine = parsePcbEngine(body.pcbEngine);
    const cadEngine = parseCadEngine(body.cadEngine);
    if (body.stream) {
      const encoder = new TextEncoder();
      const abortController = new AbortController();

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: string, payload: unknown) => {
            if (abortController.signal.aborted) {
              return;
            }
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
              ),
            );
          };

          // Send immediate acknowledgment
          send("start", { ok: true });
          send("typing", { message: "I understand your request..." });

          try {
            await streamingAgentLoop({
              client,
              mode,
              projectName,
              message: normalizedText,
              conversationContext,
              images,
              initialState,
              pcbEngine,
              cadEngine,
              abortSignal: abortController.signal,
              onToken: (token) => {
                send("token", { token });
              },
              onProgress: (progress) => {
                send("progress", progress);
              },
              onToolCall: (toolCall) => {
                send("tool_call", toolCall);
              },
              onToolResult: (result) => {
                send("tool_result", result);
              },
              onComplete: (result) => {
                send("done", {
                  reply: result.reply,
                  toolCalls: result.toolCalls,
                  toolResults: result.toolResults,
                  nextState: result.nextState,
                });
              },
            });
          } catch (streamError) {
            if (streamError instanceof Error && streamError.name === 'AbortError') {
              send("cancelled", { message: "Request was cancelled by user" });
            } else {
              send("error", {
                error:
                  streamError instanceof Error
                    ? streamError.message
                    : "Unknown AI error.",
              });
            }
          } finally {
            controller.close();
          }
        },
        cancel() {
          abortController.abort();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await streamingAgentLoop({
      client,
      mode,
      projectName,
      message: normalizedText,
      conversationContext,
      images,
      initialState,
      pcbEngine,
      cadEngine,
    });
    return NextResponse.json({
      reply: result.reply,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
      nextState: result.nextState,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
