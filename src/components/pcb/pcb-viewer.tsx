/**
 * Combined PCB viewer: schematic + layout tabs (Circuitron / PCBFlow / mock).
 */

"use client";

import { useState } from "react";
import { CircuitBoard, Cpu, Loader2 } from "lucide-react";
import { ProcessedFile } from "@/lib/circuitron";
import { cn } from "@/lib/utils";
import { PCB3DViewer } from "./3d-viewer";
import { SchematicViewer } from "./schematic-viewer";

interface PCBViewerProps {
  files?: {
    schematic?: ProcessedFile;
    pcb?: ProcessedFile;
    netlist?: ProcessedFile;
    skidl?: ProcessedFile;
  };
  loading?: boolean;
  error?: string;
  className?: string;
}

type TabType = "layout" | "schematic";

export function PCBViewer({
  files,
  loading = false,
  error,
  className = "",
}: PCBViewerProps) {
  const [activeTab, setActiveTab] = useState<TabType>("schematic");

  const tabs = [
    {
      id: "schematic" as const,
      label: "Schematic",
      Icon: Cpu,
      available: !!files?.schematic,
    },
    {
      id: "layout" as const,
      label: "Layout",
      Icon: CircuitBoard,
      available: !!files?.pcb,
    },
  ];

  const availableTabs = tabs.filter((t) => t.available);
  const currentTab =
    availableTabs.find((t) => t.id === activeTab) ?? availableTabs[0];

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-3 bg-[#08080a]">
          <Loader2
            className="size-8 animate-spin text-white/35"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-sm text-zinc-500">Generating PCB…</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 px-6 bg-[#08080a]">
          <p className="text-center text-sm font-medium text-red-300/95">
            PCB generation failed
          </p>
          <p className="max-w-md text-center text-xs leading-relaxed text-zinc-500">
            {error}
          </p>
        </div>
      );
    }

    if (!currentTab) {
      return (
        <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 px-6 bg-[#08080a]">
          <p className="text-sm text-zinc-500">No PCB data yet</p>
          <p className="text-center text-xs text-zinc-600">
            Describe a board in chat to generate layout and schematic.
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case "layout":
        return (
          <PCB3DViewer
            pcbFile={files?.pcb}
            loading={loading}
            error={error}
            className="border-0"
          />
        );
      case "schematic":
        return (
          <SchematicViewer
            schematicFile={files?.schematic}
            loading={loading}
            error={error}
            className="border-0"
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-none border border-white/[0.08]",
        "bg-white/[0.03] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-md",
        className,
      )}
    >
      <div className="shrink-0 border-b border-white/[0.06] bg-[#070709]/80 px-3 py-2 backdrop-blur-md sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const Icon = tab.Icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                disabled={!tab.available}
                title={tab.available ? tab.label : "Not available"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  tab.available
                    ? activeTab === tab.id
                      ? "bg-white/[0.1] text-zinc-100"
                      : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
                    : "cursor-not-allowed text-zinc-600 opacity-50",
                )}
              >
                <Icon className="size-3.5 opacity-80" strokeWidth={1.75} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 max-h-[min(72vh,44rem)] flex-1 flex-basis-0 flex-col">
        <div className="min-h-0 flex-1 flex-basis-0">{renderTabContent()}</div>
      </div>
    </div>
  );
}
