/**
 * Runs LLM-generated Python with pcbflow. This is arbitrary code execution on the host:
 * use only in trusted environments or run inside an isolated container (no network, CPU/mem limits).
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import path from "path";
import os from "os";

function pcbflowTimeoutMs(): number {
  const n = parseInt(process.env.NODE0_PCBFLOW_TIMEOUT_MS || "120000", 10);
  return Math.min(Math.max(n, 15000), 600000);
}

/**
 * Prefer project venv from `npm run setup:pcbflow` so system `python3` is not required to have pcbflow.
 */
function pythonBinary(): string {
  const fromEnv = process.env.NODE0_PYTHON?.trim();
  if (fromEnv) return fromEnv;
  const venvPython = path.join(
    process.cwd(),
    ".venv-pcbflow",
    "bin",
    process.platform === "win32" ? "python.exe" : "python3",
  );
  if (existsSync(venvPython)) return venvPython;
  return process.platform === "win32" ? "python" : "python3";
}

async function walkFiles(dir: string): Promise<string[]> {
  const dirents = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const d of dirents) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      out.push(...(await walkFiles(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function pickLayoutSvg(svgPaths: string[]): string | null {
  if (svgPaths.length === 0) return null;
  const lower = svgPaths.map((p) => ({ p, b: path.basename(p).toLowerCase() }));
  const top = lower.find(
    (x) =>
      x.b.includes("top") ||
      x.b.includes("_t.") ||
      x.b.includes("gtl") ||
      x.b.includes("all"),
  );
  const chosen = top?.p ?? svgPaths.sort()[0];
  return chosen;
}

/** Final full board from pcbflow: `./out/out_preview_top.svg` when basename is `"out"`. */
function pickFinalLayoutSvgPath(svgPaths: string[]): string | null {
  if (svgPaths.length === 0) return null;
  const n = svgPaths.map((p) => normPath(p));
  const outTopIdx = n.findIndex((p) => /\/out\/[^/]*preview_top\.svg$/i.test(p));
  if (outTopIdx >= 0) return svgPaths[outTopIdx];
  const nonStage = svgPaths.filter(
    (p, i) => !/\/stage_\d+\//i.test(n[i]),
  );
  return pickLayoutSvg(nonStage.length ? nonStage : svgPaths);
}

/** e.g. `./stage_0/stage_0_preview_top.svg` */
function collectStagePreviewTopPaths(svgPaths: string[]): Map<number, string> {
  const m = new Map<number, string>();
  const n = svgPaths.map((p) => normPath(p));
  for (let i = 0; i < svgPaths.length; i++) {
    const match = /\/stage_(\d+)\/[^/]*preview_top\.svg$/i.exec(n[i]);
    if (match) {
      const idx = parseInt(match[1], 10);
      m.set(idx, svgPaths[i]);
    }
  }
  return m;
}

export type PcbflowRunResult =
  | {
      ok: true;
      stdout: string;
      stderr: string;
      workspaceFiles: Record<string, string>;
      fileContentsByBasename: Record<string, string>;
    }
  | {
      ok: false;
      stdout: string;
      stderr: string;
      error: string;
    };

export async function runPcbflowPythonScript(script: string): Promise<PcbflowRunResult> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "pcbflow-"));
  const scriptPath = path.join(workDir, "run_pcbflow.py");

  try {
    await writeFile(scriptPath, script, "utf8");

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(pythonBinary(), [scriptPath], {
        cwd: workDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let settled = false;
      const ms = pcbflowTimeoutMs();
      const t = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(new Error(`PCBFlow Python timed out after ${ms}ms`));
      }, ms);

      child.stdout?.on("data", (c: Buffer) => stdoutChunks.push(c));
      child.stderr?.on("data", (c: Buffer) => stderrChunks.push(c));
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        reject(err);
      });
      child.on("close", (c) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve(c ?? 1);
      });
    });

    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    const stderr = Buffer.concat(stderrChunks).toString("utf8");

    if (code !== 0) {
      return {
        ok: false,
        stdout,
        stderr,
        error: `Python exited with code ${code}. ${stderr.slice(0, 2000) || stdout.slice(0, 2000)}`,
      };
    }

    const outDir = path.join(workDir, "out");
    let searchRoot = workDir;
    try {
      await readdir(outDir);
      searchRoot = outDir;
    } catch {
      /* outputs may be directly in workDir */
    }

    const allFiles = await walkFiles(searchRoot);
    const workspaceFiles: Record<string, string> = {};
    const fileContentsByBasename: Record<string, string> = {};

    const svgPaths = allFiles.filter((f) => f.toLowerCase().endsWith(".svg"));
    const stageMap = collectStagePreviewTopPaths(svgPaths);
    const layoutSvgPath = pickFinalLayoutSvgPath(svgPaths);
    if (layoutSvgPath) {
      const svgText = await readFile(layoutSvgPath, "utf8");
      workspaceFiles["pcb_3d.wrl"] = svgText;
      workspaceFiles["layout_board.svg"] = svgText;
      fileContentsByBasename[path.basename(layoutSvgPath)] = svgText;
    }

    const stageIndices = [...stageMap.keys()].sort((a, b) => a - b);
    for (const i of stageIndices) {
      const p = stageMap.get(i);
      if (!p) continue;
      const svgText = await readFile(p, "utf8");
      const key = `layout_board_stage_${i}.svg`;
      workspaceFiles[key] = svgText;
      fileContentsByBasename[path.basename(p)] = svgText;
    }

    const csvPaths = allFiles.filter((f) => f.toLowerCase().endsWith(".csv"));
    const centroidPaths = csvPaths.filter((f) =>
      f.toLowerCase().includes("centroid"),
    );
    if (centroidPaths.length > 0) {
      const n = centroidPaths.map((p) => normPath(p));
      const preferOut = centroidPaths.find((p, i) =>
        /\/out\/[^/]*centroid/i.test(n[i]),
      );
      const centroidPath = preferOut ?? centroidPaths[0];
      const centroidText = await readFile(centroidPath, "utf8");
      workspaceFiles["pcbflow_centroids.csv"] = centroidText;
      fileContentsByBasename[path.basename(centroidPath)] = centroidText;
    }

    for (const csvPath of csvPaths) {
      const base = path.basename(csvPath);
      if (base.toLowerCase().includes("centroid")) continue;
      if (base.toLowerCase().includes("bom") || csvPaths.length === 1) {
        const text = await readFile(csvPath, "utf8");
        workspaceFiles["bom_pcbflow.csv"] = text;
        fileContentsByBasename[base] = text;
        break;
      }
    }

    workspaceFiles["design_pcbflow.py"] = script;
    fileContentsByBasename["run_pcbflow.py"] = script;

    if (!layoutSvgPath) {
      return {
        ok: false,
        stdout,
        stderr,
        error:
          "pcbflow ran but no layout preview_top SVG was found under output directory. Ensure brd.save_svg(\"out\", in_subdir=True) on the final board.",
      };
    }

    return {
      ok: true,
      stdout,
      stderr,
      workspaceFiles,
      fileContentsByBasename,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      stdout: "",
      stderr: "",
      error: msg,
    };
  } finally {
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
