/**
 * Server-side OpenSCAD STL compilation via WASM.
 * Used by the AR handoff route to pre-render geometry so mobile browsers
 * don't need to load the ~10 MB WASM module themselves.
 */

import { readFile } from "fs/promises";
import path from "path";

type OpenSCADFS = {
  writeFile(path: string, data: string | ArrayBufferView): void;
  readFile(path: string, opts: { encoding: "binary" }): Uint8Array;
};

type OpenSCADInstance = {
  callMain(args: string[]): number;
  FS: OpenSCADFS;
};

type OpenSCADFactory = (opts?: Record<string, unknown>) => Promise<OpenSCADInstance>;

let cachedFactory: OpenSCADFactory | null = null;

async function getOpenScadFactory(): Promise<OpenSCADFactory> {
  if (cachedFactory) return cachedFactory;

  const jsPath = path.join(process.cwd(), "public", "vendor", "openscad-wasm", "openscad.js");
  const wasmDir = path.join(process.cwd(), "public", "vendor", "openscad-wasm");

  const mod = await import(/* webpackIgnore: true */ `file://${jsPath}`);
  const factory = mod.default as OpenSCADFactory;

  const wrapped: OpenSCADFactory = (opts) =>
    factory({
      ...opts,
      locateFile: (p: string) => path.join(wasmDir, p),
    });

  cachedFactory = wrapped;
  return wrapped;
}

function normalizeCode(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:openscad)?\s*([\s\S]*?)\s*```/i);
  const body = (fenced ? fenced[1] : trimmed).trim();
  return body
    .replace(/^\uFEFF/, "")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\r\n/g, "\n");
}

function isLikelyOpenScad(code: string): boolean {
  if (!code || code.length < 16) return false;
  return /\b(cube|cylinder|sphere|union|difference|translate|rotate|module)\b/i.test(code);
}

/**
 * Compile OpenSCAD source to a base64-encoded binary STL on the server.
 * Returns null on any failure (missing WASM, compile error, etc.) — caller
 * treats it as a best-effort enhancement.
 */
export async function serverCompileOpenscadToStlBase64(
  code: string,
): Promise<string | null> {
  try {
    const normalized = normalizeCode(code);
    if (!isLikelyOpenScad(normalized)) return null;

    const wasmPath = path.join(
      process.cwd(),
      "public",
      "vendor",
      "openscad-wasm",
      "openscad.wasm",
    );
    try {
      await readFile(wasmPath);
    } catch {
      return null;
    }

    const OpenSCAD = await getOpenScadFactory();
    const instance = await OpenSCAD({ noInitialRun: true });

    const inputFile = "/input.scad";
    const outputFile = "/out.stl";
    instance.FS.writeFile(inputFile, normalized);

    const exit = instance.callMain([
      inputFile,
      "-o",
      outputFile,
      "--export-format=binstl",
      "--enable=manifold",
      "--enable=fast-csg",
      "--enable=lazy-union",
    ]);

    if (exit !== 0) return null;

    const stlData = instance.FS.readFile(outputFile, { encoding: "binary" });
    if (!stlData || stlData.byteLength < 84) return null;

    return Buffer.from(stlData).toString("base64");
  } catch {
    return null;
  }
}
