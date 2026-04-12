/**
 * Direct PCB generation endpoint for testing with CURL
 * Bypasses the AI chat and calls Circuitron directly
 */

import { NextRequest, NextResponse } from "next/server";
import { circuitronSubprocess } from "@/lib/circuitron";
import { pcbDirectGenerateBodySchema } from "@/lib/api/schemas/circuitron";

export const maxDuration = 900; // 15 minutes
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = pcbDirectGenerateBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    console.log("Direct PCB generation request:", body.prompt.slice(0, 120));

    const result = await circuitronSubprocess.execute(
      {
        prompt: body.prompt.trim(),
        projectName: body.projectName?.trim() || "direct-test",
        options: {
          noFootprintSearch: true,
          keepSkidl: true,
          dev: false,
        },
      },
      {
        onProgress: (event) => {
          console.log(`Circuitron progress: ${event.type} - ${event.message}`);
        },
        onLog: (message) => {
          console.log(`Circuitron: ${message}`);
        },
        onError: (error) => {
          console.error(`Circuitron error: ${error.message}`);
        },
      },
    );

    return NextResponse.json({
      success: result.success,
      files: result.files,
      fileContentsByBasename: result.fileContentsByBasename,
      logs: result.logs,
      error: result.error,
      duration: result.duration,
      designValidation: result.designValidation,
      metadata: {
        prompt: body.prompt,
        projectName: body.projectName?.trim() || "direct-test",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Direct PCB generation error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        files: {},
        logs: [],
        duration: 0,
      },
      { status: 500 },
    );
  }
}
