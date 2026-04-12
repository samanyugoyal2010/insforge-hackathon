/**
 * Read-only SVG schematic (Circuitron / PCBFlow preview).
 */

"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Download, Loader2, Minus, Plus } from "lucide-react";
import { ProcessedFile } from "@/lib/circuitron";
import { cn } from "@/lib/utils";

interface SchematicViewerProps {
  schematicFile?: ProcessedFile;
  loading?: boolean;
  error?: string;
  className?: string;
}

export function SchematicViewer({
  schematicFile,
  loading = false,
  error,
  className = "",
}: SchematicViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(0.83);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });

  const svgDownloadHref = useMemo(() => {
    const c = schematicFile?.content;
    if (!c?.includes("<svg")) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c)}`;
  }, [schematicFile?.content]);

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev * 1.2, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev / 1.2, 0.1));
  };

  const handleZoomReset = () => {
    setZoomLevel(0.83);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const deltaX = e.clientX - lastPanPoint.x;
      const deltaY = e.clientY - lastPanPoint.y;
      setPanOffset((prev) => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsPanning(false);
    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  useEffect(() => {
    setZoomLevel(0.83);
    setPanOffset({ x: 0, y: 0 });
  }, [schematicFile?.content]);

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
        <p className="text-sm text-zinc-500">Loading schematic…</p>
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
          Schematic error
        </p>
        <p className="max-w-md text-center text-xs text-zinc-500">{error}</p>
      </div>
    );
  }

  if (!schematicFile || !schematicFile.content) {
    return (
      <div
        className={cn(
          "flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-1 px-6 bg-[#08080a]",
          className,
        )}
      >
        <p className="text-sm text-zinc-500">No schematic file</p>
        <p className="text-center text-xs text-zinc-600">
          Generate a board to populate this tab.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-[240px] flex-col overflow-hidden rounded-none border-0 bg-transparent",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-white/[0.06] bg-[#070709]/80 px-3 py-2 backdrop-blur-md sm:px-4">
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            className="rounded-md p-1.5 text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
            title="Zoom out"
          >
            <Minus className="size-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={handleZoomReset}
            className="min-w-[3rem] rounded-md px-2 py-1 text-center text-[11px] font-medium tabular-nums text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-300"
            title="Reset view"
          >
            {Math.round(zoomLevel * 100)}%
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="rounded-md p-1.5 text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
            title="Zoom in"
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </button>
          {svgDownloadHref ? (
            <a
              href={svgDownloadHref}
              download={
                schematicFile.originalPath.split("/").pop() ?? "schematic.svg"
              }
              className="ml-1 inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-zinc-200"
            >
              <Download className="size-3.5" strokeWidth={1.75} />
              SVG
            </a>
          ) : null}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 cursor-grab overflow-auto bg-[#0c0c0e] active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
      >
        <div
          className="flex min-h-full min-w-full items-center justify-center p-4"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            transformOrigin: "center center",
            transition: isPanning ? "none" : "transform 0.1s ease-out",
          }}
        >
          <div
            className="schematic-content inline-block border border-white/[0.08] shadow-lg"
            dangerouslySetInnerHTML={{ __html: schematicFile.content }}
          />
        </div>
      </div>

      <style jsx>{`
        .schematic-content svg {
          display: block;
          max-width: min(100%, 96vw);
          width: auto;
          height: auto;
        }

        .schematic-content text {
          user-select: none;
        }

        .schematic-content path,
        .schematic-content line,
        .schematic-content rect,
        .schematic-content circle {
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
