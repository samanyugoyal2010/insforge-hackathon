/**
 * Realistic PCB Viewer - Actually useful for engineers
 * Shows proper PCB layout, component placement, and routing
 */

"use client";

import { useState, useRef, useMemo, useEffect, useId, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ProcessedFile } from "@/lib/circuitron";
import { cn } from "@/lib/utils";

interface RealisticPCBViewerProps {
  pcbFile?: ProcessedFile;
  schematicFile?: ProcessedFile; // Add support for schematic files
  allFiles?: Record<string, ProcessedFile>; // Add support for multiple files
  loading?: boolean;
  error?: string;
  className?: string;
}

interface Component {
  ref: string;
  name: string;
  footprint: string;
  x: number;
  y: number;
  rotation: number;
  layer: 'top' | 'bottom';
}

interface Net {
  name: string;
  points: Array<{ x: number; y: number; layer: 'top' | 'bottom' }>;
  width: number;
}

interface PCBData {
  width: number;
  height: number;
  layers: number;
  components: Component[];
  nets: Net[];
  drills: Array<{ x: number; y: number; diameter: number }>;
  layoutNotice?: string;
}

function emptyPcb(): PCBData {
  return {
    width: 80,
    height: 50,
    layers: 2,
    components: [],
    nets: [],
    drills: [],
  };
}

function parseKiCadBoardSize(content: string): { width: number; height: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const lineRe =
    /\(gr_line[\s\S]*?\(start\s+([-\d.]+)\s+([-\d.]+)\)[\s\S]*?\(end\s+([-\d.]+)\s+([-\d.]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(content)) !== null) {
    xs.push(parseFloat(m[1]), parseFloat(m[3]));
    ys.push(parseFloat(m[2]), parseFloat(m[4]));
  }
  if (xs.length === 0) return { width: 80, height: 50 };
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return {
    width: Number.isFinite(w) && w >= 8 ? Math.min(w, 200) : 80,
    height: Number.isFinite(h) && h >= 8 ? Math.min(h, 150) : 50,
  };
}

function parseOrthogonalPathPoints(d: string): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const r = /[ML]\s*([-\d.]+)\s+([-\d.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = r.exec(d)) !== null) {
    pts.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
  }
  return pts;
}

/**
 * Map SVG path points into the same "mm" space as synthetic components so traces
 * line up with footprints (previously paths were scaled to the full board only).
 */
function mapPathPointsToComponentBBox(
  raw: { x: number; y: number }[],
  components: Component[],
  boardW: number,
  boardH: number,
): { x: number; y: number; layer: "top" }[] {
  let pMinX = Infinity;
  let pMinY = Infinity;
  let pMaxX = -Infinity;
  let pMaxY = -Infinity;
  for (const p of raw) {
    pMinX = Math.min(pMinX, p.x);
    pMinY = Math.min(pMinY, p.y);
    pMaxX = Math.max(pMaxX, p.x);
    pMaxY = Math.max(pMaxY, p.y);
  }
  const spanPX = Math.max(pMaxX - pMinX, 1e-6);
  const spanPY = Math.max(pMaxY - pMinY, 1e-6);
  const px0 = (pMinX + pMaxX) / 2;
  const py0 = (pMinY + pMaxY) / 2;

  if (components.length === 0) {
    const margin = 6;
    const scale = Math.min(
      (boardW - margin * 2) / spanPX,
      (boardH - margin * 2) / spanPY,
    );
    const ox =
      margin + (boardW - margin * 2 - spanPX * scale) / 2 - pMinX * scale;
    const oy =
      margin + (boardH - margin * 2 - spanPY * scale) / 2 - pMinY * scale;
    return raw.map((p) => ({
      x: p.x * scale + ox,
      y: p.y * scale + oy,
      layer: "top",
    }));
  }

  const padX = 10;
  const padY = 8;
  const cMinX = Math.min(...components.map((c) => c.x - padX));
  const cMaxX = Math.max(...components.map((c) => c.x + padX));
  const cMinY = Math.min(...components.map((c) => c.y - padY));
  const cMaxY = Math.max(...components.map((c) => c.y + padY));
  const spanCX = Math.max(cMaxX - cMinX, 1e-3);
  const spanCY = Math.max(cMaxY - cMinY, 1e-3);
  const scale = Math.min(spanCX / spanPX, spanCY / spanPY);
  const cx0 = (cMinX + cMaxX) / 2;
  const cy0 = (cMinY + cMaxY) / 2;

  return raw.map((p) => ({
    x: cx0 + (p.x - px0) * scale,
    y: cy0 + (p.y - py0) * scale,
    layer: "top",
  }));
}

/** Extract main copper paths from mock preview SVG (skips shadow/halo duplicates). */
function copperNetsFromPreviewSvg(
  content: string,
  components: Component[],
  boardW: number,
  boardH: number,
): Net[] {
  const pathRe = /<path\b([^>]*)\/>/gi;
  const nets: Net[] = [];
  const seenD = new Set<string>();
  let pm: RegExpExecArray | null;
  while ((pm = pathRe.exec(content)) !== null) {
    const attrs = pm[1];
    if (!/stroke="#(?:b87333|c0392b)"/.test(attrs)) continue;
    const dm = attrs.match(/\bd="([^"]+)"/);
    if (!dm) continue;
    const d = dm[1];
    if (seenD.has(d)) continue;
    seenD.add(d);
    const raw = parseOrthogonalPathPoints(d);
    if (raw.length < 2) continue;
    const points = mapPathPointsToComponentBBox(raw, components, boardW, boardH);
    nets.push({
      name: `N${nets.length + 1}`,
      points,
      width: 0.45,
    });
  }
  return nets;
}

function parseSyntheticPreviewSvg(content: string): PCBData {
  const refs: string[] = [];
  const re = /<text[^>]*font-size="6"[^>]*>([^<]{1,12})<\/text>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(content)) !== null) {
    const t = mm[1].trim();
    if (/^[#]?[A-Z]{1,4}\d+$/i.test(t)) refs.push(t);
  }
  const unique = [...new Set(refs)];
  const height = Math.max(50, 20 + Math.ceil(unique.length / 4) * 16);
  const width = 80;
  const components: Component[] = unique.map((ref, i) => ({
    ref,
    name: ref,
    footprint: "GENERIC",
    x: 12 + (i % 4) * 18,
    y: 12 + Math.floor(i / 4) * 16,
    rotation: 0,
    layer: "top",
  }));
  const nets = copperNetsFromPreviewSvg(content, components, width, height);
  return {
    width,
    height,
    layers: 2,
    components,
    nets,
    drills: [],
    layoutNotice:
      "Fallback board view: placement and Manhattan-style copper from tool args only (not DRC’d). A successful pcbflow export shows real pours and Gerber-style layers; use KiCad for manufacturing sign-off.",
  };
}

type PcbFileMeta = {
  syntheticLayout?: boolean;
  sourceFormat?: string;
};

function downloadHrefForProcessedFile(
  file: import("@/lib/circuitron").ProcessedFile,
  fileName: string,
): string {
  const c = file.content;
  if (!c) return `/api/circuitron/files/${encodeURIComponent(fileName)}`;
  if (file.type === "svg" || fileName.toLowerCase().endsWith(".svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c)}`;
  }
  if (file.type === "netlist" || fileName.toLowerCase().endsWith(".net")) {
    return `data:text/plain;charset=utf-8,${encodeURIComponent(c)}`;
  }
  if (file.type === "skidl" || fileName.toLowerCase().endsWith(".py")) {
    return `data:text/plain;charset=utf-8,${encodeURIComponent(c)}`;
  }
  if (file.type === "kicad_pcb") {
    return `data:text/plain;charset=utf-8,${encodeURIComponent(c)}`;
  }
  return `/api/circuitron/files/${encodeURIComponent(fileName)}`;
}

function parsePCBData(content: string, meta?: PcbFileMeta): PCBData {
  const t = content?.trim() ?? "";
  if (!t) return emptyPcb();

  const isKicad =
    meta?.sourceFormat === "kicad_pcb" ||
    /^\(\s*kicad_pcb\b/m.test(t);
  if (isKicad) {
    const { width, height } = parseKiCadBoardSize(t);
    const modCount = (t.match(/\(module\b/g) || []).length;
    const fpCount = (t.match(/\(footprint\b/g) || []).length; // Also check for newer footprint format
    const totalFootprints = modCount + fpCount;
    return {
      ...emptyPcb(),
      width,
      height,
      layoutNotice:
        totalFootprints > 0
          ? `Real KiCad PCB (${totalFootprints} footprint${totalFootprints === 1 ? "" : "s"}) — open in KiCad for copper and 3D view.`
          : "Real KiCad PCB file — open in KiCad for full copper, DRC, and 3D visualization.",
    };
  }

  // Handle KiCad schematic files
  const isKicadSch =
    meta?.sourceFormat === "kicad_sch" ||
    /^EESchema Schematic File/m.test(t) ||
    /^\(kicad_sch\b/m.test(t);
  if (isKicadSch) {
    const compCount = (t.match(/^\$Comp/gm) || []).length;
    const symbolCount = (t.match(/\(symbol\b/g) || []).length;
    const totalComponents = compCount + symbolCount;
    return {
      ...emptyPcb(),
      width: 150,
      height: 100,
      layoutNotice:
        totalComponents > 0
          ? `Real KiCad Schematic (${totalComponents} component${totalComponents === 1 ? "" : "s"}) — open in KiCad for editing and simulation.`
          : "Real KiCad Schematic file — open in KiCad for circuit design and editing.",
    };
  }

  if (
    meta?.syntheticLayout ||
    (t.includes("<svg") && t.includes("PCB Layout (preview)"))
  ) {
    return parseSyntheticPreviewSvg(t);
  }

  if (t.includes("<svg")) {
    const widthMatch = t.match(/width="(\d+)"/);
    const heightMatch = t.match(/height="(\d+)"/);
    let width = 80;
    let height = 50;
    if (widthMatch && heightMatch) {
      width = Math.min(Math.max(parseInt(widthMatch[1], 10) / 5, 40), 200);
      height = Math.min(Math.max(parseInt(heightMatch[1], 10) / 5, 30), 150);
    }

    if (meta?.sourceFormat === "svg_preview") {
      return {
        ...emptyPcb(),
        width,
        height,
        layoutNotice:
          "PCBFlow SVG — native copper/silk from the generated Python build. Pan/zoom the artwork; export Gerbers from the downloaded bundle for fab.",
      };
    }

    // Determine if this is a real schematic SVG or mock
    const isRealSchematic =
      t.includes("schematic") || t.includes("circuit") || !t.includes("PCB Layout");

    return {
      ...emptyPcb(),
      width,
      height,
      layoutNotice: isRealSchematic
        ? "Real schematic diagram (SVG) — generated from actual circuit design."
        : "SVG layout preview — copper/via details not parsed here.",
    };
  }

  return emptyPcb();
}

const ZOOM_MIN = 0.12;
const ZOOM_MAX = 6;
const DEFAULT_ZOOM_LAYOUT = 0.58;
const DEFAULT_ZOOM_SCHEMATIC_TAB = 0.83;
const VECTOR_MM_TO_PX = 5.5;

type BoardViewportProps = {
  pan: { x: number; y: number };
  zoom: number;
  onZoomChange: (z: number) => void;
  onPanDelta: (dx: number, dy: number) => void;
  children: ReactNode;
  className?: string;
};

/** Single transform: pan + scale from center (no nested overflow/scale). */
function BoardViewport({
  pan,
  zoom,
  onZoomChange,
  onPanDelta,
  children,
  className,
}: BoardViewportProps) {
  const dragRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    onZoomChange(Math.min(Math.max(zoom * factor, ZOOM_MIN), ZOOM_MAX));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = true;
    lastRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - lastRef.current.x;
    const dy = e.clientY - lastRef.current.y;
    lastRef.current = { x: e.clientX, y: e.clientY };
    onPanDelta(dx, dy);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  return (
    <div
      className={cn(
        "relative min-h-0 w-full min-w-0 flex-1 flex-basis-0 overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0 overflow-hidden bg-[#070709]",
          "cursor-grab touch-none select-none active:cursor-grabbing",
        )}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          aria-hidden
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_70%_at_50%_45%,rgba(34,197,94,0.07),transparent_65%)]"
          aria-hidden
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="pointer-events-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              willChange: "transform",
            }}
          >
            <div className="pointer-events-auto">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Component footprint renderers
function renderESP32(x: number, y: number, rotation: number) {
  return (
    <g key="esp32" transform={`translate(${x}, ${y}) rotate(${rotation})`}>
      {/* Main module */}
      <rect x="-9" y="-12.5" width="18" height="25" fill="#1a1a1a" stroke="#333" strokeWidth="0.1" rx="1"/>
      {/* Metal shield */}
      <rect x="-8" y="-11.5" width="16" height="23" fill="#c0c0c0" stroke="#999" strokeWidth="0.1" rx="0.5"/>
      {/* Antenna area */}
      <rect x="6" y="-9" width="2" height="6" fill="#8B4513" strokeWidth="0.05" stroke="#654321"/>
      {/* Reference */}
      <text x="0" y="-15" textAnchor="middle" fontSize="2" fill="#333">ESP32</text>

      {/* Pin indicators */}
      <g fill="#b8860b" stroke="#8b6914" strokeWidth="0.02">
        {Array.from({length: 19}, (_, i) => (
          <circle key={i} cx={-9 + i} cy="-12.8" r="0.15"/>
        ))}
        {Array.from({length: 19}, (_, i) => (
          <circle key={i} cx={-9 + i} cy="12.8" r="0.15"/>
        ))}
      </g>
    </g>
  );
}

function renderL298N(x: number, y: number, rotation: number) {
  return (
    <g key="l298n" transform={`translate(${x}, ${y}) rotate(${rotation})`}>
      {/* IC package */}
      <rect x="-7.5" y="-5" width="15" height="10" fill="#1a1a1a" stroke="#333" strokeWidth="0.1" rx="0.5"/>
      {/* Heat sink */}
      <rect x="-8" y="-6" width="16" height="12" fill="#e0e0e0" stroke="#999" strokeWidth="0.1" rx="0.5"/>
      {/* Heat sink fins */}
      {Array.from({length: 8}, (_, i) => (
        <line key={i} x1={-7 + i * 2} y1="-5.5" x2={-7 + i * 2} y2="5.5" stroke="#ccc" strokeWidth="0.1"/>
      ))}
      <text x="0" y="-8" textAnchor="middle" fontSize="2" fill="#333">L298N</text>

      {/* Pins */}
      <g fill="#b8860b" stroke="#8b6914" strokeWidth="0.02">
        {Array.from({length: 8}, (_, i) => (
          <circle key={i} cx={-7 + i * 2} cy="5.2" r="0.1"/>
        ))}
        {Array.from({length: 7}, (_, i) => (
          <circle key={i} cx={-6 + i * 2} cy="-5.2" r="0.1"/>
        ))}
      </g>
    </g>
  );
}

function renderUSBC(x: number, y: number, rotation: number) {
  return (
    <g key="usbc" transform={`translate(${x}, ${y}) rotate(${rotation})`}>
      <rect x="-4" y="-2.5" width="8" height="5" fill="#c0c0c0" stroke="#999" strokeWidth="0.1" rx="0.5"/>
      <rect x="-3" y="-1.5" width="6" height="3" fill="#333" rx="1"/>
      <text x="0" y="-4" textAnchor="middle" fontSize="1.5" fill="#333">USB-C</text>

      {/* Pins */}
      <g fill="#b8860b" strokeWidth="0.02">
        {Array.from({length: 12}, (_, i) => (
          <rect key={i} x={-3 + i * 0.5} y="-1.2" width="0.2" height="2.4" rx="0.1"/>
        ))}
      </g>
    </g>
  );
}

function renderCapacitor(x: number, y: number, rotation: number, value: string) {
  const size = value.includes('µF') ? 1.5 : 1.0;
  return (
    <g key={`cap-${x}-${y}`} transform={`translate(${x}, ${y}) rotate(${rotation})`}>
      <rect x={-size} y={-0.5} width={size * 2} height={1} fill="#8B4513" stroke="#654321" strokeWidth="0.05" rx="0.1"/>
      <text x="0" y="-1.2" textAnchor="middle" fontSize="0.8" fill="#333">{value}</text>

      {/* Pads */}
      <rect x={-size - 0.2} y={-0.3} width="0.4" height="0.6" fill="#b8860b"/>
      <rect x={size - 0.2} y={-0.3} width="0.4" height="0.6" fill="#b8860b"/>
    </g>
  );
}

function renderResistor(x: number, y: number, rotation: number, value: string) {
  return (
    <g key={`res-${x}-${y}`} transform={`translate(${x}, ${y}) rotate(${rotation})`}>
      <rect x="-1.5" y="-0.4" width="3" height="0.8" fill="#1a1a1a" stroke="#333" strokeWidth="0.05" rx="0.1"/>
      <text x="0" y="-1" textAnchor="middle" fontSize="0.8" fill="#333">{value}</text>

      {/* Color bands for resistor value */}
      {value.includes('10k') && (
        <>
          <rect x="-1.2" y="-0.4" width="0.2" height="0.8" fill="#8B4513"/> {/* Brown */}
          <rect x="-0.8" y="-0.4" width="0.2" height="0.8" fill="#000"/> {/* Black */}
          <rect x="-0.4" y="-0.4" width="0.2" height="0.8" fill="#FF8C00"/> {/* Orange */}
        </>
      )}

      {/* Pads */}
      <rect x="-1.7" y="-0.3" width="0.4" height="0.6" fill="#b8860b"/>
      <rect x="1.3" y="-0.3" width="0.4" height="0.6" fill="#b8860b"/>
    </g>
  );
}

export function RealisticPCBViewer({
  pcbFile,
  schematicFile,
  allFiles = {},
  loading = false,
  error,
  className = ''
}: RealisticPCBViewerProps) {
  const [pcbZoom, setPcbZoom] = useState(DEFAULT_ZOOM_LAYOUT);
  const [schematicZoom, setSchematicZoom] = useState(DEFAULT_ZOOM_SCHEMATIC_TAB);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pcb' | 'schematic'>('pcb');

  // Determine which file to show based on active tab
  const activeFile = activeTab === 'schematic' && schematicFile ? schematicFile : pcbFile;

  const pcbData = useMemo(() => {
    return parsePCBData(activeFile?.content ?? "", activeFile?.metadata);
  }, [activeFile?.content, activeFile?.metadata]);

  // Get list of available files for download
  const availableFiles = useMemo(() => {
    const files: Array<{name: string; type: string; url: string; file: ProcessedFile}> = [];

    Object.entries(allFiles).forEach(([key, file]) => {
      if (file && file.processedPath) {
        const fileName = file.processedPath.split('/').pop() || key;
        files.push({
          name: fileName,
          type: file.type,
          url: downloadHrefForProcessedFile(file, fileName),
          file
        });
      }
    });

    // Add current files if not in allFiles
    if (pcbFile && !files.some(f => f.file === pcbFile)) {
      const fileName = pcbFile.processedPath.split('/').pop() || 'layout.kicad_pcb';
      files.push({
        name: fileName,
        type: pcbFile.type,
        url: downloadHrefForProcessedFile(pcbFile, fileName),
        file: pcbFile
      });
    }

    if (schematicFile && !files.some(f => f.file === schematicFile)) {
      const fileName = schematicFile.processedPath.split('/').pop() || 'schematic.sch';
      files.push({
        name: fileName,
        type: schematicFile.type,
        url: downloadHrefForProcessedFile(schematicFile, fileName),
        file: schematicFile
      });
    }

    return files;
  }, [allFiles, pcbFile, schematicFile]);

  const zoom =
    activeTab === "schematic" ? schematicZoom : pcbZoom;

  const setZoom = (value: number | ((prev: number) => number)) => {
    const prev = activeTab === "schematic" ? schematicZoom : pcbZoom;
    const next =
      typeof value === "function"
        ? (value as (p: number) => number)(prev)
        : value;
    const clamped = Math.min(Math.max(next, ZOOM_MIN), ZOOM_MAX);
    if (activeTab === "schematic") setSchematicZoom(clamped);
    else setPcbZoom(clamped);
  };

  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setPcbZoom(DEFAULT_ZOOM_LAYOUT);
    setSchematicZoom(DEFAULT_ZOOM_SCHEMATIC_TAB);
  }, [activeFile?.content]);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [activeTab]);

  const panDelta = (dx: number, dy: number) => {
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  const vectorSvgUid = useId().replace(/:/g, "");

  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-3 bg-[#08080a]",
          className,
        )}
      >
        <Loader2
          className="size-8 animate-spin text-white/35"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="text-sm text-zinc-500">Loading layout…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 px-6 bg-[#08080a]",
          className,
        )}
      >
        <p className="text-center text-sm font-medium text-red-300/95">
          Layout error
        </p>
        <p className="max-w-md text-center text-xs text-zinc-500">{error}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-1 flex-basis-0 flex-col overflow-hidden rounded-none border-0 bg-transparent",
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-[#070709]/80 px-3 py-2 backdrop-blur-md sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-xs font-medium tracking-wide text-zinc-400">
              Layout
            </h3>
            <span className="hidden text-[11px] text-zinc-600 sm:inline">
              {pcbData.width}×{pcbData.height} mm · {pcbData.layers}L
            </span>
          </div>

          {(pcbFile || schematicFile) && (
            <div className="flex items-center gap-1">
              {pcbFile && (
                <button
                  type="button"
                  onClick={() => setActiveTab("pcb")}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors",
                    activeTab === "pcb"
                      ? "bg-white/[0.1] text-zinc-100"
                      : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300",
                  )}
                >
                  Board
                </button>
              )}
              {schematicFile && (
                <button
                  type="button"
                  onClick={() => setActiveTab("schematic")}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors",
                    activeTab === "schematic"
                      ? "bg-white/[0.1] text-zinc-100"
                      : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300",
                  )}
                >
                  Schematic
                </button>
              )}
            </div>
          )}

          {availableFiles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {availableFiles.map((file) => (
                <a
                  key={file.name}
                  href={file.url}
                  download={file.name}
                  className="rounded-md border border-white/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-zinc-300"
                  title={`Download ${file.name}`}
                >
                  {file.type}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-0.5 border-l border-white/[0.08] pl-2">
            <button
              type="button"
              onClick={() => {
                setPan({ x: 0, y: 0 });
                if (activeTab === "schematic") {
                  setSchematicZoom(DEFAULT_ZOOM_SCHEMATIC_TAB);
                } else {
                  setPcbZoom(DEFAULT_ZOOM_LAYOUT);
                }
              }}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
              title="Reset pan & zoom"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() =>
                setZoom((prev) => Math.min(prev * 1.2, ZOOM_MAX))
              }
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
            >
              +
            </button>
            <span className="min-w-[2.5rem] text-center text-[11px] tabular-nums text-zinc-500">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.max(prev / 1.2, ZOOM_MIN))}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
            >
              −
            </button>
          </div>
        </div>
      </div>

      {/* PCB/Schematic Viewer */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-basis-0 flex-col overflow-hidden">
        {activeTab === "schematic" && activeFile?.content?.includes("<svg") ? (
          <BoardViewport
            pan={pan}
            zoom={zoom}
            onZoomChange={(z) => setZoom(z)}
            onPanDelta={panDelta}
          >
            <figure className="m-0 overflow-hidden border border-white/[0.1] bg-[#0c0c0e] shadow-[0_28px_72px_-14px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.05] [&_svg]:block [&_svg]:h-auto [&_svg]:w-auto [&_svg]:max-w-none [&_svg]:align-top">
              <div dangerouslySetInnerHTML={{ __html: activeFile.content }} />
            </figure>
          </BoardViewport>
        ) : activeTab === "schematic" && activeFile?.content ? (
          <div className="flex h-full w-full items-center justify-center bg-[#070709] p-4">
            <div className="max-h-full max-w-full overflow-auto border border-white/[0.08] bg-[#0c0c0e] p-4 shadow-inner">
              <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-400">
                {activeFile.content.substring(0, 5000)}
                {activeFile.content.length > 5000 ? "\n\n…" : ""}
              </pre>
            </div>
          </div>
        ) : activeTab === "pcb" &&
          pcbFile?.content?.includes("<svg") &&
          pcbFile.metadata?.sourceFormat === "svg_preview" &&
          !/^\(\s*kicad_pcb/m.test((pcbFile.content ?? "").trim()) ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-basis-0 flex-col overflow-hidden">
            <BoardViewport
              pan={pan}
              zoom={zoom}
              onZoomChange={(z) => setZoom(z)}
              onPanDelta={panDelta}
            >
              <figure className="m-0 overflow-hidden border border-emerald-500/20 bg-[#0c0c0f] shadow-[0_32px_88px_-18px_rgba(0,0,0,0.88),inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.07] [&_svg]:block [&_svg]:h-auto [&_svg]:w-auto [&_svg]:max-w-none [&_svg]:align-top">
                <div dangerouslySetInnerHTML={{ __html: pcbFile.content }} />
              </figure>
            </BoardViewport>
          </div>
        ) : (
          <BoardViewport
            pan={pan}
            zoom={zoom}
            onZoomChange={(z) => setZoom(z)}
            onPanDelta={panDelta}
          >
            <div className="border border-emerald-500/25 bg-gradient-to-br from-[#0c1814] to-[#060a09] p-[3px] shadow-[0_32px_96px_-20px_rgba(0,0,0,0.92)] ring-1 ring-white/[0.08]">
              <svg
                className="block"
                role="img"
                aria-label="PCB layout preview"
                width={pcbData.width * VECTOR_MM_TO_PX}
                height={pcbData.height * VECTOR_MM_TO_PX}
                viewBox={`0 0 ${pcbData.width} ${pcbData.height}`}
              >
                <defs>
                  <linearGradient
                    id={`${vectorSvgUid}-substrate`}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#134e2a" />
                    <stop offset="50%" stopColor="#166534" />
                    <stop offset="100%" stopColor="#0c301c" />
                  </linearGradient>
                </defs>
                <rect
                  x="0"
                  y="0"
                  width={pcbData.width}
                  height={pcbData.height}
                  fill={`url(#${vectorSvgUid}-substrate)`}
                  stroke="#052e16"
                  strokeWidth="0.22"
                  rx="1.8"
                />

            {/* Mounting holes */}
            {pcbData.drills.map((drill, i) => (
              <circle
                key={i}
                cx={drill.x}
                cy={drill.y}
                r={drill.diameter / 2}
                fill="#073d20"
                stroke="#b8860b"
                strokeWidth="0.3"
              />
            ))}

            {/* Copper traces */}
            {pcbData.nets.map((net, i) => (
              <g key={`net-${i}`}>
                <polyline
                  points={net.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#cd7f32"
                  strokeWidth={net.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Net name */}
                {net.points.length > 1 && (
                  <text
                    x={(net.points[0].x + net.points[net.points.length - 1].x) / 2}
                    y={(net.points[0].y + net.points[net.points.length - 1].y) / 2}
                    fontSize="0.8"
                    fill="#333"
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    {net.name}
                  </text>
                )}
              </g>
            ))}

            {/* Components */}
            {pcbData.components.map((comp) => {
              let componentElement: ReactNode;

              switch (comp.footprint) {
                case 'ESP32':
                  componentElement = renderESP32(comp.x, comp.y, comp.rotation);
                  break;
                case 'L298N':
                  componentElement = renderL298N(comp.x, comp.y, comp.rotation);
                  break;
                case 'USB-C':
                  componentElement = renderUSBC(comp.x, comp.y, comp.rotation);
                  break;
                case '1206':
                case '0805':
                  if (comp.name.includes('µF') || comp.name.includes('nF') || comp.name.includes('pF')) {
                    componentElement = renderCapacitor(comp.x, comp.y, comp.rotation, comp.name);
                  } else if (comp.name.includes('Ω') || comp.name.includes('k') || comp.name.includes('M')) {
                    componentElement = renderResistor(comp.x, comp.y, comp.rotation, comp.name);
                  } else {
                    componentElement = (
                      <g key={comp.ref} transform={`translate(${comp.x}, ${comp.y}) rotate(${comp.rotation})`}>
                        <rect x="-2" y="-1" width="4" height="2" fill="#333" stroke="#666" strokeWidth="0.1" rx="0.2"/>
                        <text x="0" y="-1.5" textAnchor="middle" fontSize="0.8" fill="#333">{comp.name}</text>
                      </g>
                    );
                  }
                  break;
                case 'GENERIC':
                default:
                  componentElement = (
                    <g key={comp.ref} transform={`translate(${comp.x}, ${comp.y}) rotate(${comp.rotation})`}>
                      <rect x="-2" y="-1" width="4" height="2" fill="#333" stroke="#666" strokeWidth="0.1" rx="0.2"/>
                      <text x="0" y="-1.5" textAnchor="middle" fontSize="0.8" fill="#333">{comp.name}</text>
                    </g>
                  );
              }

              return (
                <g
                  key={comp.ref}
                  onClick={() => setSelectedComponent(comp.ref)}
                  style={{ cursor: 'pointer' }}
                >
                  {componentElement}
                  {selectedComponent === comp.ref && (
                    <circle
                      cx={comp.x}
                      cy={comp.y}
                      r="3"
                      fill="none"
                      stroke="#ff0000"
                      strokeWidth="0.3"
                      strokeDasharray="0.5,0.3"
                    />
                  )}
                </g>
              );
            })}

            {/* Reference designators */}
            {pcbData.components.map((comp) => (
              <text
                key={`ref-${comp.ref}`}
                x={comp.x}
                y={comp.y + (comp.footprint === 'ESP32' ? 15 : comp.footprint === 'L298N' ? 10 : 5)}
                fontSize="1.5"
                fill="white"
                textAnchor="middle"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {comp.ref}
              </text>
            ))}
              </svg>
            </div>
          </BoardViewport>
        )}

        {/* Component info panel */}
        {selectedComponent && (
          <div className="absolute right-3 top-3 z-20 max-w-xs rounded-lg border border-white/[0.1] bg-[#070709]/95 p-3 text-zinc-300 shadow-xl backdrop-blur-md">
            {(() => {
              const comp = pcbData.components.find(
                (c) => c.ref === selectedComponent,
              );
              if (!comp) return null;

              return (
                <>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="font-mono text-sm font-semibold text-zinc-100">
                      {comp.ref}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setSelectedComponent(null)}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      ×
                    </button>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="text-zinc-600">Name</span>{" "}
                      <span className="text-zinc-400">{comp.name}</span>
                    </div>
                    <div>
                      <span className="text-zinc-600">Footprint</span>{" "}
                      <span className="text-zinc-400">{comp.footprint}</span>
                    </div>
                    <div>
                      <span className="text-zinc-600">mm</span>{" "}
                      <span className="font-mono text-zinc-400">
                        {comp.x.toFixed(1)}, {comp.y.toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-600">Rot</span>{" "}
                      <span className="text-zinc-400">{comp.rotation}°</span>
                    </div>
                    <div>
                      <span className="text-zinc-600">Layer</span>{" "}
                      <span className="text-zinc-400">{comp.layer}</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {pcbData.layoutNotice &&
        activeTab === "pcb" &&
        !(
          pcbFile?.content?.includes("<svg") &&
          pcbFile.metadata?.sourceFormat === "svg_preview"
        ) ? (
          <div className="absolute left-3 right-3 top-12 z-10 rounded-md border border-white/[0.08] bg-black/55 px-3 py-2 text-[11px] text-zinc-500 backdrop-blur-sm">
            {pcbData.layoutNotice}
          </div>
        ) : null}
      </div>
    </div>
  );
}