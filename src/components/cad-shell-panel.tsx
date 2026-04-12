"use client";

import { Button } from "@/components/ui/button";
import { OutsideEditBar } from "@/components/outside-edit-bar";
import { CadThreeViewport, type CadThreeViewportRef } from "@/components/renderers/cad-three-viewport";
import {
  applyLegacyShellPatch,
  cadTopologyWarnings,
  documentToSyntheticShell,
  parseCadDocumentJson,
  type CadDocument,
} from "@/lib/cad-document";
import type { ShellParams } from "@/lib/cad-shell";
import { downloadTextFile, sanitizeExportSlug } from "@/lib/download-json";
import { cn } from "@/lib/utils";
import { Download, Move3d, RotateCcw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useRef,
} from "react";

type CadShellPanelProps = {
  cad: CadDocument;
  onCadChange: (next: CadDocument) => void;
  /** When true, show inspector + JSON. Off = viewport preview only. */
  technicalMode?: boolean;
  /** Used in download filename (project id). */
  exportSlug?: string | null;
  /** Warnings from the last agent `update_cad` tool (e.g. OpenSCAD gen, topology hints). */
  agentToolWarnings?: string[];
  className?: string;
};

function DimRow({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  id,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  id: string;
}) {
  const str =
    Number.isInteger(step) && step >= 1
      ? String(Math.round(value))
      : String(value);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.75rem] items-center gap-x-2 gap-y-0.5 border-b border-white/[0.05] px-3 py-2.5 sm:px-3.5">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="block text-[12px] leading-snug text-zinc-400"
        >
          {label}
        </label>
        {hint ? (
          <span className="block text-[10px] text-zinc-600">{hint}</span>
        ) : null}
      </div>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={str}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full min-w-0 rounded border border-zinc-700/90 bg-zinc-950/90 px-2 py-1.5 text-right font-mono text-[13px] tabular-nums text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500/40"
      />
      <span className="text-right text-[11px] tabular-nums text-zinc-500">
        mm
      </span>
    </div>
  );
}

export function CadShellPanel({
  cad,
  onCadChange,
  technicalMode = false,
  exportSlug = null,
  agentToolWarnings = [],
  className,
}: CadShellPanelProps) {
  const viewportRef = useRef<CadThreeViewportRef>(null);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(cad, null, 2));
  const [openscadPreviewIssue, setOpenscadPreviewIssue] = useState<
    string | null
  >(null);
  const jsonId = useId();
  const prefix = useId();

  const shell = documentToSyntheticShell(cad);

  const cadBannerLines = useMemo(() => {
    const topo = cadTopologyWarnings(cad);
    const parts = [...agentToolWarnings, ...topo];
    if (openscadPreviewIssue) parts.push(openscadPreviewIssue);
    return [...new Set(parts.filter(Boolean))];
  }, [agentToolWarnings, cad, openscadPreviewIssue]);

  const onOpenscadPreviewIssue = useCallback((msg: string | null) => {
    setOpenscadPreviewIssue(msg);
  }, []);
  const safeSlug = sanitizeExportSlug(exportSlug);

  useEffect(() => {
    setJsonText(JSON.stringify(cad, null, 2));
  }, [cad]);

  const applyField = useCallback(
    (patch: Partial<ShellParams>) => {
      onCadChange(applyLegacyShellPatch(cad, patch));
    },
    [onCadChange, cad],
  );

  const applyJson = useCallback(() => {
    const parsed = parseCadDocumentJson(jsonText);
    if (parsed) onCadChange(parsed);
  }, [jsonText, onCadChange]);

  const fieldId = (k: string) => `${prefix}-${k}`;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-0 md:min-h-[min(70vh,40rem)]",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col border-b border-white/[0.06] lg:min-h-[min(24rem,50vh)]",
            technicalMode && "lg:border-b-0 lg:border-r lg:border-white/[0.06]",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] bg-zinc-950/50 px-3 py-2">
            <div className="flex items-center gap-2 text-zinc-500">
              <Move3d className="size-3.5" strokeWidth={1.75} />
              <span className="text-[11px] font-medium uppercase tracking-[0.08em]">
                Viewport
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[11px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
              onClick={() => viewportRef.current?.resetCamera()}
            >
              <RotateCcw className="size-3" />
              Reset camera
            </Button>
            {cad.openscad?.code?.trim() ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-[11px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                onClick={() =>
                  downloadTextFile(
                    `node0-cad-${safeSlug}.scad`,
                    cad.openscad?.code ?? "",
                    "text/plain;charset=utf-8",
                  )
                }
              >
                <Download className="size-3" />
                Download SCAD
              </Button>
            ) : null}
          </div>

          {cadBannerLines.length > 0 ? (
            <div
              className="shrink-0 border-b border-amber-500/30 bg-amber-500/[0.09] px-3 py-2 text-[11px] leading-snug text-amber-100/95"
              role="status"
            >
              {cadBannerLines.map((line, i) => (
                <p key={`${i}-${line.slice(0, 24)}`} className="mb-1 last:mb-0">
                  {line}
                </p>
              ))}
            </div>
          ) : null}

          <div
            className="relative flex min-h-[240px] flex-1 flex-col items-stretch justify-center bg-[#070709]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
              `,
              backgroundSize: "28px 28px",
            }}
          >
            <CadThreeViewport
              ref={viewportRef}
              cad={cad}
              showInner={
                technicalMode &&
                shell.wallMm > 0.05 &&
                cad.features.some((f) => f.op === "subtract")
              }
              onOpenscadPreviewIssue={onOpenscadPreviewIssue}
            />
          </div>

          <p className="shrink-0 border-t border-white/[0.05] px-3 py-2 text-[10px] leading-relaxed text-zinc-600">
            {technicalMode
              ? "CSG from features. Default view is open-front (presentation.openFace) so the interior reads; set openFace:\"none\" in JSON to close the shell. Orange wireframe = subtract helpers in inspector."
              : "Enclosure uses an open-front cutaway by default so you can see the board and cavity—orbit to look inside."}
          </p>
        </div>

        {technicalMode ? (
        <aside className="flex w-full shrink-0 flex-col border-white/[0.06] bg-zinc-950/25 lg:w-[min(100%,22rem)] lg:max-w-md">
          <div className="shrink-0 border-b border-white/[0.06] px-3 py-2.5 sm:px-3.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
              Inspector
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              Quick shell (rebuilds outer + cavity features)
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.12)_transparent]">
            <DimRow
              id={fieldId("L")}
              label="Depth"
              hint="Front-to-back"
              value={shell.lengthMm}
              onChange={(n) => applyField({ lengthMm: n })}
              min={8}
              max={500}
              step={1}
            />
            <DimRow
              id={fieldId("W")}
              label="Width"
              value={shell.widthMm}
              onChange={(n) => applyField({ widthMm: n })}
              min={8}
              max={500}
              step={1}
            />
            <DimRow
              id={fieldId("H")}
              label="Height"
              value={shell.heightMm}
              onChange={(n) => applyField({ heightMm: n })}
              min={4}
              max={200}
              step={1}
            />
            <DimRow
              id={fieldId("wall")}
              label="Wall"
              hint="Shell thickness"
              value={shell.wallMm}
              onChange={(n) => applyField({ wallMm: n })}
              min={0.4}
              max={20}
              step={0.1}
            />
            <DimRow
              id={fieldId("r")}
              label="Fillet"
              hint="Corner radius"
              value={shell.cornerRadiusMm}
              onChange={(n) => applyField({ cornerRadiusMm: n })}
              min={0}
              max={24}
              step={0.5}
            />
          </div>

          <OutsideEditBar
            slug={exportSlug}
            kind="cad-shell"
            value={cad}
            onUpload={(raw) => {
              const p = parseCadDocumentJson(raw);
              if (!p) return false;
              onCadChange(p);
              return true;
            }}
          />

          <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950/40">
              <div className="border-b border-white/[0.05] px-3 py-2 sm:px-3.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                  Definition
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-600">
                  JSON · blur or ⌘/Ctrl+Enter to apply
                </p>
              </div>
              <textarea
                id={jsonId}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                onBlur={applyJson}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    applyJson();
                  }
                }}
                spellCheck={false}
                className="min-h-[7.5rem] w-full resize-y border-0 bg-transparent px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-300 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-600/50 sm:px-3.5"
              />
              <div className="border-t border-white/[0.05] px-3 py-2 sm:px-3.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 border-zinc-700/90 text-[11px] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                  onClick={applyJson}
                >
                  Apply definition
                </Button>
              </div>
            </div>
        </aside>
        ) : null}
      </div>
    </div>
  );
}
