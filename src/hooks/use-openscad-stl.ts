"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

type OpenSCADFS = {
  writeFile(path: string, data: string | ArrayBufferView): void;
  readFile(path: string, opts: { encoding: "binary" }): Uint8Array;
};

type OpenSCADInstance = {
  callMain(args: string[]): number;
  FS: OpenSCADFS;
};

type OpenSCADFactory = (opts?: Record<string, unknown>) => Promise<OpenSCADInstance>;

function normalizeOpenScadCode(raw: string): string {
  const trimmed = raw.trim();
  // Strip fenced markdown if it slipped through.
  const fenced = trimmed.match(/```(?:openscad)?\s*([\s\S]*?)\s*```/i);
  const body = (fenced ? fenced[1] : trimmed).trim();
  return body
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\r\n/g, "\n");
}

function hasBalancedDelimiters(code: string): boolean {
  const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const opening = new Set(Object.keys(pairs));
  const closing = new Set(Object.values(pairs));
  const stack: string[] = [];
  for (const ch of code) {
    if (opening.has(ch)) stack.push(ch);
    else if (closing.has(ch)) {
      const top = stack.pop();
      if (!top || pairs[top] !== ch) return false;
    }
  }
  return stack.length === 0;
}

function isLikelyOpenScad(code: string): boolean {
  if (!code || code.length < 16) return false;
  if (/^#/.test(code)) return false;
  if (/```/.test(code)) return false;
  if (/^\s*[-*]\s+/m.test(code)) return false;
  if (/^\s*\d+\.\s+/m.test(code)) return false;
  if (/^\s*(here('| i)s|this is|note:)/im.test(code)) return false;
  if (!hasBalancedDelimiters(code)) return false;
  return /\b(cube|cylinder|sphere|union|difference|translate|rotate|module)\b/i.test(
    code,
  );
}

async function loadOpenScadFactory(): Promise<OpenSCADFactory> {
  const href = new URL(
    "/vendor/openscad-wasm/openscad.js",
    window.location.origin,
  ).href;
  const mod = await import(/* webpackIgnore: true */ href);
  return mod.default as OpenSCADFactory;
}

/**
 * Compile OpenSCAD source to a Three.js BufferGeometry (binary STL via WASM).
 * CADAM-style flags (GPL-3.0 vendor wasm).
 */
export async function compileOpenscadToBufferGeometry(
  code: string,
): Promise<THREE.BufferGeometry> {
  const normalized = normalizeOpenScadCode(code);
  if (!isLikelyOpenScad(normalized)) {
    throw new Error("OpenSCAD source is malformed; using CSG fallback.");
  }
  const OpenSCAD = await loadOpenScadFactory();
  const instance = await OpenSCAD({
    noInitialRun: true,
    locateFile: (path: string) =>
      `${window.location.origin}/vendor/openscad-wasm/${path}`,
  });

  const inputFile = "/input.scad";
  const outputFile = "/out.stl";
  instance.FS.writeFile(inputFile, normalized);

  const args = [
    inputFile,
    "-o",
    outputFile,
    "--export-format=binstl",
    "--enable=manifold",
    "--enable=fast-csg",
    "--enable=lazy-union",
  ];

  const exit = instance.callMain(args);
  if (exit !== 0) {
    throw new Error(`OpenSCAD exited with code ${exit}`);
  }

  const stlData = instance.FS.readFile(outputFile, { encoding: "binary" });
  const copy = new Uint8Array(stlData.byteLength);
  copy.set(stlData);
  const loader = new STLLoader();
  const geom = loader.parse(copy.buffer);
  geom.computeVertexNormals();
  geom.center();
  geom.scale(0.001, 0.001, 0.001);
  return geom;
}

export function useOpenscadStl(code: string | undefined | null) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const trimmed = code?.trim();
    if (!trimmed) {
      setGeometry((g) => {
        g?.dispose();
        return null;
      });
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const geom = await compileOpenscadToBufferGeometry(trimmed);
        if (cancelled || !mounted.current) {
          geom.dispose();
          return;
        }
        setGeometry((prev) => {
          prev?.dispose();
          return geom;
        });
      } catch (e) {
        if (!cancelled && mounted.current) {
          setError(e instanceof Error ? e.message : String(e));
          setGeometry((g) => {
            g?.dispose();
            return null;
          });
        }
      } finally {
        if (!cancelled && mounted.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  return { geometry, loading, error };
}
