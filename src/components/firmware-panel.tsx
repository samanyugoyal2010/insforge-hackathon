"use client";

import CodeMirror from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { oneDark } from "@codemirror/theme-one-dark";
import { Button } from "@/components/ui/button";
import { downloadTextFile, sanitizeExportSlug } from "@/lib/download-json";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { useMemo } from "react";

type FirmwarePanelProps = {
  code: string;
  onChange: (next: string) => void;
  projectName?: string | null;
  className?: string;
};

export function FirmwarePanel({
  code,
  onChange,
  projectName,
  className,
}: FirmwarePanelProps) {
  const slug = sanitizeExportSlug(projectName ?? "firmware");
  const extensions = useMemo(() => [cpp(), oneDark], []);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-[#070709]", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-6">
        <div>
          <h2 className="font-heading text-base font-semibold text-zinc-100 sm:text-lg">
            Firmware
          </h2>
          <p className="text-xs text-zinc-500">
            AI-generated embedded code for this project.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-zinc-600/90 bg-zinc-900 text-[11px] text-zinc-200 hover:bg-zinc-800"
          onClick={() =>
            downloadTextFile(`node0-firmware-${slug}.cpp`, code || "// No firmware yet\n")
          }
        >
          <Download className="size-3.5" />
          Download code
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-4 sm:p-6">
        <div className="h-full min-h-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#282c34]">
          <CodeMirror
            value={code}
            height="100%"
            className="h-full min-h-0 text-xs [&_.cm-editor]:h-full [&_.cm-editor]:min-h-0 [&_.cm-scroller]:font-mono"
            theme={oneDark}
            extensions={extensions}
            onChange={onChange}
            placeholder="Firmware will appear here after generation..."
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              dropCursor: false,
              allowMultipleSelections: false,
            }}
          />
        </div>
      </div>
    </div>
  );
}
