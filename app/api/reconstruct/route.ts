import { NextResponse } from "next/server";
import OpenAI from "openai";

// Server-only: OpenRouter key never reaches the browser.
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const MODEL = process.env.OPENROUTER_CHAT_MODEL || "google/gemini-2.5-flash";
const MAX_IMAGES = 8;

const SYSTEM = `You are a 3D room reconstruction engine. You receive photographs of a single real room and must infer its approximate 3D layout. Respond with STRICT JSON only — no prose, no markdown fences.

Coordinate system: meters. The room is centered at the origin. X is width, Z is depth, Y is up with the floor at Y=0. An object's "position" is the CENTER of its bounding box, so a floor-resting object has position Y equal to half its height.

Return exactly this shape:
{
  "title": string,                       // short friendly room name, e.g. "Sunlit Living Room"
  "roomType": string,                    // e.g. "living room", "bedroom", "kitchen"
  "dimensions": { "width": number, "depth": number, "height": number },  // meters; width 3-12, depth 3-12, height 2.4-3.4
  "wallColor": "#rrggbb",
  "floorColor": "#rrggbb",
  "ceilingColor": "#rrggbb",
  "objects": [
    {
      "name": string,                    // "sofa", "bed", "coffee table", "rug", "tv", "shelf", "plant", ...
      "position": [number, number, number],   // meters, center of bounding box, inside the room
      "size": [number, number, number],        // meters [width, height, depth]
      "rotationY": number,               // radians, rotation about vertical axis
      "color": "#rrggbb"                 // dominant color of the object
    }
  ]
}

Rules:
- Infer real furniture and large objects you can see. Up to 14 objects. Keep every object fully inside the room bounds.
- Make dimensions plausible for the room type and the furniture you place.
- Floor-resting objects (sofa, bed, table, rug, chair) must have position Y = size_height / 2. A rug is very thin (height ~0.02). Wall-mounted items (tv, picture) may sit higher.
- Use realistic colors sampled from the photos.
- Output ONLY the JSON object.`;

type Body = { photoUrls?: string[]; roomName?: string };

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "image/jpeg";
    const mime = type.startsWith("image/") ? type : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "AI gateway not configured (missing OPENROUTER_API_KEY)." },
      { status: 500 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const urls = (body.photoUrls ?? []).slice(0, MAX_IMAGES);
  if (urls.length === 0) {
    return NextResponse.json(
      { error: "No photos to reconstruct from." },
      { status: 400 }
    );
  }

  // Fetch + inline images so the model always gets the bytes (URLs may redirect).
  const dataUrls = (await Promise.all(urls.map(toDataUrl))).filter(
    (u): u is string => Boolean(u)
  );
  if (dataUrls.length === 0) {
    return NextResponse.json(
      { error: "Could not load any of the photos." },
      { status: 502 }
    );
  }

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `These are photos of one room${
        body.roomName ? ` the user calls "${body.roomName}"` : ""
      }. Reconstruct its 3D layout as JSON.`,
    },
    ...dataUrls.map(
      (u) =>
        ({ type: "image_url", image_url: { url: u } }) as const
    ),
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    let layout: unknown;
    try {
      layout = JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("Model did not return JSON");
      layout = JSON.parse(cleaned.slice(start, end + 1));
    }

    return NextResponse.json({ layout });
  } catch (err) {
    console.error("[reconstruct] error", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Reconstruction failed.",
      },
      { status: 502 }
    );
  }
}
