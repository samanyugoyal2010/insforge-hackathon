"use client";

import { Button } from "@/components/ui/button";
import { OutsideEditBar } from "@/components/outside-edit-bar";
import {
  createBomLine,
  parseBomDocumentJson,
  downloadBomCsv,
  type BomDocument,
  type BomLine,
} from "@/lib/bom";
import { sanitizeExportSlug } from "@/lib/download-json";
import { cn } from "@/lib/utils";
import { FileDown, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo } from "react";

type BomPanelProps = {
  document: BomDocument;
  onChange: (next: BomDocument) => void;
  exportSlug: string | null;
  className?: string;
};

const th =
  "sticky top-0 z-10 border-b border-white/[0.08] bg-zinc-950/95 px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 backdrop-blur-sm";
const td = "border-b border-white/[0.05] p-1 align-top";

export function BomPanel({
  document,
  onChange,
  exportSlug,
  className,
}: BomPanelProps) {
  const safeSlug = sanitizeExportSlug(exportSlug);

  const totalQty = useMemo(
    () => document.lines.reduce((acc, l) => acc + l.qty, 0),
    [document.lines],
  );
  const validation = useMemo(() => {
    let missingMpn = 0;
    let missingFootprint = 0;
    for (const line of document.lines) {
      if (!line.mpn.trim()) missingMpn += 1;
      if (!line.footprint.trim()) missingFootprint += 1;
    }
    return { missingMpn, missingFootprint };
  }, [document.lines]);

  const patchLine = useCallback(
    (id: string, patch: Partial<BomLine>) => {
      onChange({
        lines: document.lines.map((l) =>
          l.id === id ? { ...l, ...patch } : l,
        ),
      });
    },
    [document.lines, onChange],
  );

  const removeLine = useCallback(
    (id: string) => {
      onChange({
        lines: document.lines.filter((l) => l.id !== id),
      });
    },
    [document.lines, onChange],
  );

  const addLine = useCallback(() => {
    onChange({
      lines: [...document.lines, createBomLine()],
    });
  }, [document.lines, onChange]);

  const inputClass =
    "w-full min-w-[4rem] rounded border border-zinc-800/90 bg-zinc-950/90 px-2 py-1.5 text-[13px] text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500/30";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-[#070709]",
        className,
      )}
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="font-heading text-base font-semibold text-zinc-100 sm:text-lg">
            Bill of materials
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {document.lines.length} line{document.lines.length === 1 ? "" : "s"}{" "}
            · {totalQty} unit{totalQty === 1 ? "" : "s"} total
          </p>
          {document.lines.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
              <span className="rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-zinc-400">
                Rows without MPN: {validation.missingMpn}
              </span>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-zinc-400">
                Rows without footprint: {validation.missingFootprint}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-zinc-600/90 bg-zinc-900 text-zinc-200"
            onClick={addLine}
          >
            <Plus className="size-3.5" />
            Add line
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-zinc-600/90 bg-zinc-900 text-zinc-200"
            onClick={() =>
              downloadBomCsv(`node0-bom-${safeSlug}`, document)
            }
            disabled={document.lines.length === 0}
          >
            <FileDown className="size-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {document.lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <p className="max-w-md text-sm text-zinc-500">
              Send a message in the project chat—the assistant drafts a BOM from
              your board. You can also add lines here or import JSON from{" "}
              <span className="text-zinc-400">Outside edit</span> below.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addLine}
            >
              <Plus className="size-3.5" />
              Add first line
            </Button>
          </div>
        ) : (
          <div className="min-w-[56rem]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <th className={cn(th, "w-10 text-center")}>#</th>
                  <th className={th}>Designators</th>
                  <th className={th}>Description</th>
                  <th className={th}>MPN</th>
                  <th className={th}>Mfr</th>
                  <th className={cn(th, "w-20")}>Qty</th>
                  <th className={th}>Footprint</th>
                  <th className={th}>Notes</th>
                  <th className={cn(th, "w-12")} />
                </tr>
              </thead>
              <tbody>
                {document.lines.map((line, idx) => (
                  <tr
                    key={line.id}
                    className={cn(
                      "hover:bg-white/[0.02]",
                      line.id.startsWith("ai-") && "bg-blue-950/10",
                    )}
                  >
                    <td className={cn(td, "text-center text-xs text-zinc-600")}>
                      {idx + 1}
                    </td>
                    <td className={td}>
                      <input
                        aria-label={`Designators row ${idx + 1}`}
                        className={inputClass}
                        value={line.designators}
                        onChange={(e) =>
                          patchLine(line.id, { designators: e.target.value })
                        }
                      />
                    </td>
                    <td className={td}>
                      <input
                        aria-label={`Description row ${idx + 1}`}
                        className={inputClass}
                        value={line.description}
                        onChange={(e) =>
                          patchLine(line.id, { description: e.target.value })
                        }
                      />
                    </td>
                    <td className={td}>
                      <input
                        aria-label={`MPN row ${idx + 1}`}
                        className={inputClass}
                        value={line.mpn}
                        onChange={(e) =>
                          patchLine(line.id, { mpn: e.target.value })
                        }
                      />
                    </td>
                    <td className={td}>
                      <input
                        aria-label={`Manufacturer row ${idx + 1}`}
                        className={inputClass}
                        value={line.manufacturer}
                        onChange={(e) =>
                          patchLine(line.id, { manufacturer: e.target.value })
                        }
                      />
                    </td>
                    <td className={td}>
                      <input
                        aria-label={`Quantity row ${idx + 1}`}
                        type="number"
                        min={1}
                        className={cn(inputClass, "tabular-nums")}
                        value={line.qty}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n >= 1) {
                            patchLine(line.id, {
                              qty: Math.min(1_000_000, Math.floor(n)),
                            });
                          }
                        }}
                      />
                    </td>
                    <td className={td}>
                      <input
                        aria-label={`Footprint row ${idx + 1}`}
                        className={inputClass}
                        value={line.footprint}
                        onChange={(e) =>
                          patchLine(line.id, { footprint: e.target.value })
                        }
                      />
                    </td>
                    <td className={td}>
                      <input
                        aria-label={`Notes row ${idx + 1}`}
                        className={inputClass}
                        value={line.notes}
                        onChange={(e) =>
                          patchLine(line.id, { notes: e.target.value })
                        }
                      />
                    </td>
                    <td className={cn(td, "text-center")}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-zinc-500 hover:bg-red-950/40 hover:text-red-400"
                        aria-label={`Remove row ${idx + 1}`}
                        onClick={() => removeLine(line.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OutsideEditBar
        slug={exportSlug}
        kind="bom"
        value={document}
        onUpload={(raw) => {
          const p = parseBomDocumentJson(raw);
          if (!p) return false;
          onChange(p);
          return true;
        }}
      />
    </div>
  );
}
