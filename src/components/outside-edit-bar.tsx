"use client";

import { Button } from "@/components/ui/button";
import { downloadJsonFile, sanitizeExportSlug } from "@/lib/download-json";
import { Download, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

type OutsideEditBarProps = {
  /** Used in filename: `node0-<kind>-<slug>.json` */
  slug: string | null;
  kind: "cad-shell" | "pcb-board" | "bom";
  value: unknown;
  /** Return true if file was applied; false to show a brief error. */
  onUpload: (rawJson: string) => boolean;
};

export function OutsideEditBar({
  slug,
  kind,
  value,
  onUpload,
}: OutsideEditBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadHint, setUploadHint] = useState<string | null>(null);

  const safeSlug = sanitizeExportSlug(slug);

  const onDownload = useCallback(() => {
    downloadJsonFile(`node0-${kind}-${safeSlug}`, value);
  }, [kind, safeSlug, value]);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      setUploadHint(null);
      if (!file) return;
      try {
        const text = await file.text();
        if (!onUpload(text.trim())) {
          setUploadHint("Could not read this file. Check JSON matches the schema.");
        }
      } catch {
        setUploadHint("Could not read the file.");
      }
    },
    [onUpload],
  );

  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950/30 px-3 py-3 sm:px-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
        Outside edit
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
        Export JSON for an external editor, then import a replacement.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-zinc-600/90 bg-zinc-900/80 text-[11px] text-zinc-200 hover:bg-zinc-800"
          onClick={onDownload}
        >
          <Download className="size-3.5" />
          Download
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-zinc-600/90 bg-zinc-900/80 text-[11px] text-zinc-200 hover:bg-zinc-800"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          Upload…
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
      {uploadHint ? (
        <p className="mt-2 text-[10px] text-zinc-400">{uploadHint}</p>
      ) : null}
    </div>
  );
}
