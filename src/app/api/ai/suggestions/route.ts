import OpenAI from "openai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey }) : null;

const MODEL =
  process.env.OPENAI_SUGGESTIONS_MODEL?.trim() || "gpt-4o-mini";

const MAX_SUGGESTIONS = 3;
const MAX_EACH = 120;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function sanitizeSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.replace(/\s+/g, " ").trim().slice(0, MAX_EACH);
    if (t.length < 8) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

const VALID_TOOLS = new Set([
  "cad",
  "pcb",
  "bom",
  "order",
  "ar",
  "code",
]);

export async function POST(req: Request) {
  if (!client) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY on the server." },
      { status: 500 },
    );
  }

  try {
    const body = (await req.json()) as {
      projectName?: string;
      conversationContext?: string;
      activeTool?: string;
      bomLineCount?: number;
      cadFeatureCount?: number;
    };

    const projectName = (body.projectName ?? "Untitled board").trim();
    const conversationContext = (body.conversationContext ?? "").trim();
    const rawTool = (body.activeTool ?? "cad").trim().toLowerCase();
    const activeTool = VALID_TOOLS.has(rawTool) ? rawTool : "cad";

    const bomLineCount =
      typeof body.bomLineCount === "number" && Number.isFinite(body.bomLineCount)
        ? Math.max(0, Math.floor(body.bomLineCount))
        : undefined;
    const cadFeatureCount =
      typeof body.cadFeatureCount === "number" &&
      Number.isFinite(body.cadFeatureCount)
        ? Math.max(0, Math.floor(body.cadFeatureCount))
        : undefined;

    const userParts = [
      `Project name: ${projectName}`,
      `Active workspace tab: ${activeTool}`,
    ];
    if (bomLineCount !== undefined) {
      userParts.push(`BOM line count: ${bomLineCount}`);
    }
    if (cadFeatureCount !== undefined) {
      userParts.push(`CAD feature count: ${cadFeatureCount}`);
    }
    if (conversationContext) {
      userParts.push(`Recent conversation:\n${conversationContext}`);
    } else {
      userParts.push(
        "No messages yet — suggest good first steps for this hardware project.",
      );
    }

    const completion = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 300,
      temperature: 0.65,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You help hardware engineers using an AI CAD/PCB workspace (enclosures, boards, BOMs).
Respond with a JSON object ONLY, shape: {"suggestions":["...","..."]}
Rules:
- Exactly 3 suggestions (no more, no fewer when possible)
- Each suggestion is a short prompt the user can send to the AI assistant (one line, max ${MAX_EACH} characters)
- Be specific to PCB, enclosure CAD, BOM, ordering, firmware when relevant
- Match the active workspace tab when it helps (cad vs pcb vs bom vs order vs ar vs code)
- Do not repeat the same idea twice
- No markdown, no numbering inside strings`,
        },
        { role: "user", content: userParts.join("\n\n") },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content?.trim() ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON from model." },
        { status: 502 },
      );
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.suggestions)) {
      return NextResponse.json(
        { error: "Missing suggestions array." },
        { status: 502 },
      );
    }

    const suggestions = sanitizeSuggestions(parsed.suggestions);
    return NextResponse.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown AI error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
