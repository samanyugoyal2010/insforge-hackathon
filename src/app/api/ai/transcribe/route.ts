import OpenAI, { toFile } from "openai";
import { NextResponse } from "next/server";

export const maxDuration = 120;

const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey }) : null;

const MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "whisper-1";

export async function POST(req: Request) {
  if (!client) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY on the server." },
      { status: 500 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json(
        { error: "Audio file is required." },
        { status: 400 },
      );
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio must be under 25MB." },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const name =
      file instanceof File && file.name ? file.name : "recording.webm";
    const type = file.type || "audio/webm";

    const uploadable = await toFile(buf, name, { type });

    const transcription = await client.audio.transcriptions.create({
      file: uploadable,
      // whisper-1 and gpt-4o* transcribe models supported by API
      model: MODEL,
    });

    const text =
      typeof transcription === "string"
        ? transcription
        : transcription.text?.trim() ?? "";

    return NextResponse.json({ text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
