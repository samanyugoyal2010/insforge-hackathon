/**
 * Main Circuitron PCB generation API endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { circuitronSubprocess, circuitronFileProcessor } from "@/lib/circuitron";
import type { CircuitronRequest } from "@/lib/circuitron/types";
import { circuitronGenerateBodySchema } from "@/lib/api/schemas/circuitron";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { getAuthedUser } from "@/lib/team-server";
import path from "path";
import os from "os";

// Configure longer timeout for complex PCB generation (15 minutes)
export const maxDuration = 900; // 15 minutes in seconds
export const dynamic = "force-dynamic";

function safeStoredArtifactName(runSlug: string, relKey: string): string {
  const normalized = relKey.split(/[/\\]/).join("__");
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${runSlug}__${cleaned}`.slice(0, 220);
}

async function persistArtifactsForServing(
  runSlug: string,
  entries: Array<{ relKey: string; content: string; type: string }>,
): Promise<void> {
  const publicDir = path.join(os.tmpdir(), "circuitron-output");
  await fs.mkdir(publicDir, { recursive: true });
  for (const { relKey, content } of entries) {
    const name = safeStoredArtifactName(runSlug, relKey);
    await fs.writeFile(path.join(publicDir, name), content, "utf-8");
  }
}

async function persistArtifactsToSupabaseStorage(params: {
  request: NextRequest;
  projectName: string;
  runSlug: string;
  entries: Array<{ relKey: string; content: string; type: string }>;
}) {
  const { supabase, user } = await getAuthedUser(params.request);
  const service = createSupabaseServiceClient();
  if (!supabase || !user || !service) return null;

  const rows: Array<{
    user_id: string;
    team_id: string | null;
    client_id: string;
    kind: string;
    storage_path: string;
    public_name: string;
    size_bytes: number;
    content_type: string;
  }> = [];
  for (const ent of params.entries) {
    const base = ent.relKey.replace(/[^a-zA-Z0-9._/-]/g, "_");
    const objectPath = `${user.id}/${params.runSlug}/${base.slice(-140)}`;
    const contentType =
      ent.relKey.endsWith(".svg") ? "image/svg+xml" : "text/plain; charset=utf-8";
    const { error: upErr } = await service.storage
      .from("node0-artifacts")
      .upload(objectPath, new Blob([ent.content], { type: contentType }), {
        upsert: false,
        contentType,
      });
    if (upErr) continue;
    rows.push({
      user_id: user.id,
      team_id: null,
      client_id: params.projectName,
      kind: ent.relKey,
      storage_path: objectPath,
      public_name: safeStoredArtifactName(params.runSlug, ent.relKey),
      size_bytes: Buffer.byteLength(ent.content, "utf-8"),
      content_type: contentType,
    });
  }
  if (rows.length === 0) return null;
  const { data } = await supabase
    .from("node0_project_artifacts")
    .insert(rows)
    .select("id,kind,storage_path,public_name,size_bytes");
  return data ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = circuitronGenerateBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const outputDir = path.join(
      os.tmpdir(),
      "circuitron-output",
      `pcb-${Date.now()}`,
    );
    const runSlug = path.basename(outputDir);
    const circuitronRequest: CircuitronRequest = {
      prompt: body.prompt.trim(),
      projectName: body.projectName?.trim() || "pcb-design",
      outputDir,
      options: {
        noFootprintSearch: true,
        keepSkidl: true,
        dev: false,
        ...body.options,
      },
    };

    let enhancedPrompt = circuitronRequest.prompt;
    if (body.conversationContext?.trim()) {
      enhancedPrompt = `Context: ${body.conversationContext.trim()}\n\nRequest: ${enhancedPrompt}`;
    }
    circuitronRequest.prompt = enhancedPrompt;

    console.log("Starting Circuitron PCB generation:", {
      prompt: circuitronRequest.prompt.substring(0, 100) + "...",
      projectName: circuitronRequest.projectName,
      outputDir,
    });

    const progressEvents: string[] = [];
    const startTime = Date.now();

    const response = await circuitronSubprocess.execute(circuitronRequest, {
      onProgress: (event) => {
        progressEvents.push(`${event.type}: ${event.message}`);
        console.log("Circuitron progress:", event);
      },
      onLog: (message) => {
        console.log("Circuitron:", message);
      },
      onError: (error) => {
        console.error("Circuitron error:", error);
      },
    });

    const duration = Date.now() - startTime;

    if (!response.success) {
      return NextResponse.json({
        success: false,
        error: response.error || "PCB generation failed",
        logs: response.logs,
        progressEvents,
        duration,
        designValidation: response.designValidation,
      });
    }

    let processedFiles: Record<string, unknown> = {};
    let finalOutputDir = outputDir;
    const toPersist: Array<{ relKey: string; content: string; type: string }> =
      [];

    if (
      response.fileContentsByBasename &&
      Object.keys(response.fileContentsByBasename).length > 0
    ) {
      console.log(
        "Using files processed by subprocess:",
        Object.keys(response.fileContentsByBasename),
      );

      for (const [filename, content] of Object.entries(
        response.fileContentsByBasename,
      )) {
        const ext = path.extname(filename).toLowerCase();
        let type: string | null = null;

        if (ext === ".svg") type = "svg";
        else if (ext === ".net") type = "netlist";
        else if (ext === ".kicad_pcb") type = "kicad_pcb";
        else if (ext === ".kicad_sch") type = "sch";
        else if (ext === ".sch") type = "sch";
        else if (ext === ".erc") type = "erc";
        else if (filename.toLowerCase().includes("skidl") && ext === ".py")
          type = "skidl";

        if (type) {
          processedFiles[type] = {
            originalPath: safeStoredArtifactName(runSlug, filename),
            content,
            size: content.length,
          };
          toPersist.push({ relKey: filename, content, type });
        }
      }
    } else {
      finalOutputDir = response.actualOutputDir || outputDir;
      processedFiles = await circuitronFileProcessor.processOutputFiles(
        finalOutputDir,
      );

      for (const [type, pf] of Object.entries(processedFiles)) {
        if (
          pf &&
          typeof pf === "object" &&
          "originalPath" in pf &&
          "content" in pf &&
          typeof (pf as { content?: unknown }).content === "string"
        ) {
          const originalPath = String((pf as { originalPath: string }).originalPath);
          const content = (pf as { content: string }).content;
          const base = path.basename(originalPath);
          const stored = safeStoredArtifactName(runSlug, base);
          (pf as { originalPath: string }).originalPath = stored;
          toPersist.push({ relKey: base, content, type });
        }
      }
    }

    await persistArtifactsForServing(runSlug, toPersist);
    const storageArtifacts = await persistArtifactsToSupabaseStorage({
      request,
      projectName: circuitronRequest.projectName,
      runSlug,
      entries: toPersist,
    });

    const fileUrls: { [key: string]: string } = {};
    for (const [type, file] of Object.entries(processedFiles)) {
      if (
        file &&
        typeof file === "object" &&
        "originalPath" in file &&
        typeof (file as { originalPath: unknown }).originalPath === "string"
      ) {
        const filename = (file as { originalPath: string }).originalPath;
        fileUrls[type] = `/api/circuitron/files/${encodeURIComponent(filename)}`;
      }
    }

    try {
      await fs.rm(finalOutputDir, { recursive: true, force: true });
    } catch (error) {
      console.warn("Failed to cleanup temporary directory:", error);
    }

    const result = {
      success: true,
      files: fileUrls,
      processedFiles,
      logs: response.logs,
      progressEvents,
      duration,
      cost: response.cost,
      designValidation: response.designValidation,
      metadata: {
        projectName: circuitronRequest.projectName,
        generatedAt: new Date().toISOString(),
        circuitronVersion: "0.1.0",
        runSlug,
      },
      artifactManifest: storageArtifacts,
    };

    console.log("Circuitron PCB generation completed successfully:", {
      duration,
      filesGenerated: Object.keys(fileUrls),
      cost: response.cost,
      designValidation: result.designValidation?.level,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("PCB generation error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error during PCB generation",
        files: {},
        logs: [],
        progressEvents: [],
        duration: 0,
      },
      { status: 500 },
    );
  }
}
