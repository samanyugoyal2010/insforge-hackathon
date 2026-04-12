import type OpenAI from "openai";
import type { CircuitronResponse } from "@/lib/circuitron/types";
import { generatePcbflowPythonScript } from "@/lib/pcbflow/generate-script";
import { planPcbAssemblyStages } from "@/lib/pcbflow/plan-assembly-stages";
import { runPcbflowPythonScript } from "@/lib/pcbflow/run-subprocess";
import {
  buildPcbSpecificationText,
  normalizePcbArgsForPcbflow,
} from "@/lib/pcbflow/spec-from-args";
import { buildLogicalSchematicSvgFromArgs } from "@/lib/pcbflow/logical-schematic-svg";
import { isRecord } from "@/lib/agent/contracts";

/**
 * LLM codegen + local Python (pcbflow). See run-subprocess security note.
 */
export async function generatePcbWithPcbflow(params: {
  openai: OpenAI;
  pcbArgs: Record<string, unknown>;
  projectName: string;
  conversationContext?: string;
}): Promise<CircuitronResponse> {
  const normalized = normalizePcbArgsForPcbflow(
    isRecord(params.pcbArgs) ? params.pcbArgs : {},
  );
  const specification = buildPcbSpecificationText(
    normalized,
    params.projectName,
    params.conversationContext,
  );

  const planned = await planPcbAssemblyStages({
    openai: params.openai,
    specification,
    projectName: params.projectName,
  });
  if (!planned.ok) {
    return {
      success: false,
      files: {},
      logs: [],
      error: `Assembly stage planning failed (required before pcbflow codegen): ${planned.error}`,
      pcbSource: "pcbflow",
    };
  }
  const assemblyPlan = planned.plan;

  const gen = await generatePcbflowPythonScript({
    openai: params.openai,
    specification,
    projectName: params.projectName,
    assemblyPlan,
  });

  if (!gen.ok) {
    return {
      success: false,
      files: {},
      logs: [gen.error],
      error: gen.error,
      pcbSource: "pcbflow",
    };
  }

  const stagesFellBack = gen.stagesFallback === true;

  const run = await runPcbflowPythonScript(gen.script);
  const logs = [run.stdout, run.stderr].filter(Boolean);

  if (!run.ok) {
    return {
      success: false,
      files: {},
      logs,
      error: run.error,
      pcbSource: "pcbflow",
    };
  }

  const logicalSvg = buildLogicalSchematicSvgFromArgs(
    normalized,
    params.projectName,
  );
  const stageMeta = { version: 1 as const, stages: assemblyPlan.stages };
  const workspaceFiles: Record<string, string> = {
    ...run.workspaceFiles,
    "schematic.svg": logicalSvg,
  };
  if (!stagesFellBack) {
    workspaceFiles["pcbflow_assembly_stages.json"] = JSON.stringify(stageMeta);
  }

  const pcbWarnings: string[] = [];
  if (stagesFellBack && gen.stagesFallback) {
    pcbWarnings.push(
      `Multi-stage assembly SVGs could not be generated (${gen.stagesFallbackReason}). Board was built without per-stage exports; AR assembly will use progressive dimming instead.`,
    );
  }

  return {
    success: true,
    files: {},
    fileContentsByBasename: {
      ...run.fileContentsByBasename,
      "schematic.svg": logicalSvg,
    },
    workspaceFiles,
    pcbSource: "pcbflow",
    logs,
    ...(pcbWarnings.length > 0 ? { pcbWarnings } : {}),
    designValidation: {
      level: "unknown",
      errorCount: 0,
      warningCount: 0,
      headline: "Design validation",
      snippets: [
        "PCBFlow builds a logical preview here. For production sign-off, run KiCad ERC/DRC on the exported board.",
      ],
    },
  };
}
