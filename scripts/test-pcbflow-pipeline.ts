/**
 * Integration test: OpenAI (same SYSTEM/user prompt shape as production) → Python pcbflow → SVG artifacts.
 *
 * Requires:
 *   - OPENAI_API_KEY (or in .env.local)
 *   - npm run setup:pcbflow ( .venv-pcbflow with pcbflow installed )
 *
 * Run: npm run test:pcbflow
 */

import { existsSync, readFileSync } from "fs";
import path from "path";
import OpenAI from "openai";
import { generatePcbWithPcbflow } from "../src/lib/pcbflow/index";

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

/** Mirrors `update_pcb` + chat context; uses only generic pcbflow parts (classes), not KiCad footprint strings. */
const EXAMPLE_USER_SCENE =
  "Simple 2-layer demo: two SMD resistors and one cap, GND pour, 35×25 mm board.";

const EXAMPLE_PCB_ARGS: Record<string, unknown> = {
  widthMm: 35,
  heightMm: 25,
  layerCount: 2,
  components: [
    { ref: "R1", value: "1k", footprint: "R0603" },
    { ref: "R2", value: "10k", footprint: "R0603" },
    { ref: "C1", value: "100n", footprint: "C0402" },
  ],
  nets: [
    { name: "GND", nodes: ["R1.1", "R2.1", "C1.2"] },
    { name: "VCC", nodes: ["R1.2", "C1.1"] },
  ],
  autoroute: false,
};

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("Missing OPENAI_API_KEY (set in env or .env.local).");
    process.exit(1);
  }

  const venvPy = path.join(process.cwd(), ".venv-pcbflow", "bin", "python3");
  if (!existsSync(venvPy)) {
    console.error(
      "Missing .venv-pcbflow/bin/python3 — run: npm run setup:pcbflow",
    );
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });
  console.log("Running generatePcbWithPcbflow (OpenAI + pcbflow subprocess)…");
  console.log("Example scene:", EXAMPLE_USER_SCENE.slice(0, 80) + "…");

  const result = await generatePcbWithPcbflow({
    openai,
    pcbArgs: EXAMPLE_PCB_ARGS,
    projectName: "test-led-board",
    conversationContext: `User: ${EXAMPLE_USER_SCENE}`,
  });

  if (!result.success) {
    console.error("FAILED:", result.error);
    console.error("logs:", result.logs);
    process.exit(1);
  }

  const wf = result.workspaceFiles ?? {};
  const svg =
    wf["pcb_3d.wrl"] ?? wf["layout_board.svg"] ?? "";
  if (!svg.includes("<svg")) {
    console.error("FAILED: no SVG content in workspaceFiles keys:", Object.keys(wf));
    process.exit(1);
  }

  console.log("OK — pcbflow pipeline succeeded.");
  console.log("workspaceFiles keys:", Object.keys(wf));
  console.log("SVG length (chars):", svg.length);
  if (wf["design_pcbflow.py"]) {
    console.log("design_pcbflow.py length:", wf["design_pcbflow.py"].length);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
