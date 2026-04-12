"use client";

import { useEffect, useRef, useState } from "react";
import type { CadDocument } from "@/lib/cad-document";
import { documentToSyntheticShell } from "@/lib/cad-document";
import type { ArPcbScene } from "@/lib/ar-pcb";

const AFRAME_SRC = "https://unpkg.com/aframe@1.4.2/dist/aframe.min.js";
const ARJS_SRC =
  "https://unpkg.com/@ar-js-org/ar.js@3.4.7/aframe/build/aframe-ar.js";

const MM = 0.001;
/** Match `cad-three-viewport` PcbAssembly (board thickness). */
const PCB_THICKNESS_M = 1.6 * MM;
const PCB_FLOOR_LIFT_M = 2.2 * MM + 8e-5;

let scriptsPromise: Promise<void> | null = null;

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function ensureArLibs(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!scriptsPromise) {
    scriptsPromise = loadScriptOnce(AFRAME_SRC).then(() => loadScriptOnce(ARJS_SRC));
  }
  return scriptsPromise;
}

function partMaterial(highlight: boolean): string {
  if (highlight) {
    return "color: #38bdf8; metalness: 0.35; roughness: 0.35; emissive: #0c4a6e; emissiveIntensity: 0.45";
  }
  return "color: #5a6a8a; metalness: 0.25; roughness: 0.55";
}

export type ArJsMarkerViewProps = {
  cad: CadDocument;
  pcb: ArPcbScene | null;
  highlightRef: string | null;
  className?: string;
};

/**
 * Hiro marker AR via A-Frame + AR.js. Board/parts use the same XZ mapping as
 * `PcbAssembly` in cad-three-viewport; shell is a bbox with its bottom on the marker plane.
 */
export function ArJsMarkerView({
  cad,
  pcb,
  highlightRef,
  className,
}: ArJsMarkerViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneElRef = useRef<HTMLElement | null>(null);
  const partElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const highlightRefLive = useRef(highlightRef);
  highlightRefLive.current = highlightRef;
  const [sceneTick, setSceneTick] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let nudgeTimer: number | undefined;

    (async () => {
      try {
        await ensureArLibs();
      } catch {
        return;
      }
      if (cancelled || !host) return;

      if (sceneElRef.current?.parentNode) {
        sceneElRef.current.parentNode.removeChild(sceneElRef.current);
      }
      sceneElRef.current = null;
      partElsRef.current = new Map();

      const scene = document.createElement("a-scene");
      scene.setAttribute("embedded", "");
      // WebGL must be transparent or it paints opaque black over the webcam feed.
      scene.setAttribute(
        "arjs",
        "trackingMethod: best; sourceType: webcam; debugUIEnabled: false; videoTexture: true;",
      );
      scene.setAttribute(
        "style",
        "width:100%;height:100%;min-height:100%;position:absolute;inset:0;margin:0;background:transparent;",
      );
      scene.setAttribute("vr-mode-ui", "enabled: false");
      scene.setAttribute("loading-screen", "enabled: false");
      scene.setAttribute(
        "renderer",
        "logarithmicDepthBuffer: true; alpha: true; antialias: true",
      );

      const marker = document.createElement("a-marker");
      marker.setAttribute("preset", "hiro");

      const shell = documentToSyntheticShell(cad);
      const sw = shell.widthMm * MM;
      const sh = shell.heightMm * MM;
      const sd = shell.lengthMm * MM;

      const shellBox = document.createElement("a-box");
      shellBox.setAttribute("position", `0 ${sh / 2} 0`);
      shellBox.setAttribute("width", String(sw));
      shellBox.setAttribute("height", String(sh));
      shellBox.setAttribute("depth", String(sd));
      shellBox.setAttribute(
        "material",
        "color: #64748b; opacity: 0.22; transparent: true; side: double",
      );
      marker.appendChild(shellBox);

      if (pcb && pcb.widthMm > 0 && pcb.heightMm > 0) {
        const boardW = pcb.widthMm * MM;
        const boardH = pcb.heightMm * MM;
        const shellW = shell.widthMm * MM;
        const shellL = shell.lengthMm * MM;
        const scale = Math.min(
          0.92 * (shellW / Math.max(boardW, 1e-4)),
          0.92 * (shellL / Math.max(boardH, 1e-4)),
          1,
        );

        const bw = boardW * scale;
        const bh = boardH * scale;
        const boardY = PCB_THICKNESS_M / 2 + PCB_FLOOR_LIFT_M;

        const board = document.createElement("a-plane");
        board.setAttribute("width", String(bw));
        board.setAttribute("height", String(bh));
        board.setAttribute("rotation", "-90 0 0");
        board.setAttribute("position", `0 ${boardY} 0`);
        board.setAttribute(
          "material",
          "color: #1a3328; roughness: 0.85; metalness: 0.1; side: double",
        );
        marker.appendChild(board);

        for (const c of pcb.components) {
          const x = (c.xMm - pcb.widthMm / 2) * MM * scale;
          const z = (c.yMm - pcb.heightMm / 2) * MM * scale;
          const t = 2.5 * MM;
          const y =
            boardY + PCB_THICKNESS_M / 2 + t / 2 + 1.2e-4;
          const box = document.createElement("a-box");
          box.setAttribute("position", `${x} ${y} ${z}`);
          box.setAttribute("width", String(4 * MM * scale));
          box.setAttribute("height", String(t));
          box.setAttribute("depth", String(4 * MM * scale));
          box.setAttribute("data-ar-ref", c.ref);
          const hi = highlightRefLive.current === c.ref;
          box.setAttribute("material", partMaterial(hi));
          marker.appendChild(box);
          partElsRef.current.set(c.ref, box);
        }
      } else {
        const placeholder = document.createElement("a-box");
        placeholder.setAttribute("position", `0 ${PCB_THICKNESS_M} 0`);
        placeholder.setAttribute("width", "0.06");
        placeholder.setAttribute("height", "0.004");
        placeholder.setAttribute("depth", "0.04");
        placeholder.setAttribute(
          "material",
          "color: #334155; opacity: 0.9; transparent: true",
        );
        marker.appendChild(placeholder);
      }

      const cam = document.createElement("a-entity");
      cam.setAttribute("camera", "");
      scene.appendChild(marker);
      scene.appendChild(cam);

      host.appendChild(scene);

      const nudgeWebcam = () => {
        const root = scene as HTMLElement & {
          resize?: () => void;
          renderer?: { render?: (s: unknown, c: unknown) => void };
        };
        root.resize?.();
        const videos = host.querySelectorAll("video");
        videos.forEach((v) => {
          v.setAttribute("playsinline", "true");
          v.setAttribute("webkit-playsinline", "true");
          v.muted = true;
          void v.play().catch(() => {});
        });
      };

      scene.addEventListener(
        "loaded",
        () => {
          if (cancelled) return;
          requestAnimationFrame(() => {
            nudgeWebcam();
            window.dispatchEvent(new Event("resize"));
          });
        },
        { once: true },
      );

      nudgeTimer = window.setTimeout(() => {
        if (!cancelled) nudgeWebcam();
      }, 400);

      sceneElRef.current = scene;
      if (!cancelled) setSceneTick((n) => n + 1);
    })();

    return () => {
      cancelled = true;
      if (nudgeTimer !== undefined) window.clearTimeout(nudgeTimer);
      if (sceneElRef.current?.parentNode) {
        sceneElRef.current.parentNode.removeChild(sceneElRef.current);
      }
      sceneElRef.current = null;
      partElsRef.current.clear();
    };
  }, [cad, pcb]);

  useEffect(() => {
    const map = partElsRef.current;
    for (const [ref, el] of map) {
      el.setAttribute("material", partMaterial(ref === highlightRef));
    }
  }, [highlightRef, sceneTick]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    />
  );
}
