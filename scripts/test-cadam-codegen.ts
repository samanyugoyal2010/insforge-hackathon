/**
 * Live OpenAI → OpenSCAD smoke test (CADAM-style codegen).
 * Requires OPENAI_API_KEY (or .env.local).
 * Run: npm run test:cadam:codegen
 */

import { existsSync, readFileSync } from "fs";
import path from "path";
import OpenAI from "openai";
import { scoreOpenSCADCode } from "../src/lib/cadam/extract-openscad";
import {
  formatCadGenerationContextBlock,
  cadIntentDescriptionFromArgs,
} from "../src/lib/cadam/context";
import {
  generateOpenscadFromContext,
  resolveCadOpenAiModel,
} from "../src/lib/cadam/generate-openscad";
import { createBomLine } from "../src/lib/bom";
import { DEFAULT_SHELL } from "../src/lib/cad-shell";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("Missing OPENAI_API_KEY (set in env or .env.local).");
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });
  const model = resolveCadOpenAiModel();

  const bom = {
    lines: [
      createBomLine({
        designators: "U1",
        description: "MCU module",
        footprint: "MODULE",
        qty: 1,
      }),
    ],
  };

  const contextBlock = formatCadGenerationContextBlock({
    bom,
    shell: DEFAULT_SHELL,
    pcbHints: { widthMm: 80, heightMm: 50, layerCount: 2 },
    conversationContext: "Small handheld enclosure with USB-C slot",
  });

  const userPrompt = cadIntentDescriptionFromArgs({
    lengthMm: 100,
    widthMm: 60,
    heightMm: 28,
    wallMm: 2,
    cornerRadiusMm: 3,
  });

  console.log("OpenSCAD codegen model:", model);
  const { code, parameters } = await generateOpenscadFromContext({
    openai,
    model,
    userPrompt,
    contextBlock,
  });

  const score = scoreOpenSCADCode(code);
  if (score < 5) {
    console.error("Low OpenSCAD heuristic score:", score);
    console.error(code.slice(0, 500));
    process.exit(1);
  }

  const numericParams = parameters.filter((p) => p.type === "number");
  if (numericParams.length < 1) {
    console.error("Expected at least one numeric parameter, got:", parameters);
    process.exit(1);
  }

  console.log("test-cadam-codegen: OK");
  console.log("  score:", score, " params:", parameters.length);
  console.log("  preview:", code.split("\n").slice(0, 6).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
