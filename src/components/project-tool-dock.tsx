"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ProjectToolId =
  | "cad"
  | "pcb"
  | "bom"
  | "order"
  | "ar"
  | "code";

export interface ProjectToolItem {
  id: ProjectToolId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ProjectToolDockProps {
  items: ProjectToolItem[];
  activeId: ProjectToolId;
  onSelect: (id: ProjectToolId) => void;
  className?: string;
}

/**
 * Horizontal tool rail for the project workspace (CAD, PCB, BOM, Code, AR, Order).
 * Styled like the main Dock but sized for the tools panel.
 */
export function ProjectToolDock({
  items,
  activeId,
  onSelect,
  className,
}: ProjectToolDockProps) {
  const tabRefs = React.useRef<
    Partial<Record<ProjectToolId, HTMLButtonElement | null>>
  >({});

  const onKeyDownTabList = (e: React.KeyboardEvent) => {
    const isLeft = e.key === "ArrowLeft";
    const isRight = e.key === "ArrowRight";
    const isHome = e.key === "Home";
    const isEnd = e.key === "End";
    if (!isLeft && !isRight && !isHome && !isEnd) return;

    e.preventDefault();

    const currentIndexRaw = items.findIndex((it) => it.id === activeId);
    const currentIndex = currentIndexRaw >= 0 ? currentIndexRaw : 0;
    const len = items.length;
    if (len === 0) return;

    let nextId: ProjectToolId = activeId;
    if (isHome) {
      nextId = items[0].id;
    } else if (isEnd) {
      nextId = items[len - 1].id;
    } else if (isRight) {
      nextId = items[(currentIndex + 1 + len) % len].id;
    } else if (isLeft) {
      nextId = items[(currentIndex - 1 + len) % len].id;
    }

    onSelect(nextId);
    requestAnimationFrame(() => tabRefs.current[nextId]?.focus());
  };

  return (
    <div
      className={cn(
        "flex w-full justify-start overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="tablist"
      aria-label="Project tools"
      aria-orientation="horizontal"
      onKeyDown={onKeyDownTabList}
    >
      <div
        className={cn(
          "relative w-full min-w-0 rounded-2xl p-px sm:w-fit sm:max-w-full",
          "bg-gradient-to-b from-white/[0.12] to-white/[0.04]",
          "shadow-[0_10px_40px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.07)]",
        )}
      >
        <div
          className={cn(
            "flex flex-wrap items-center gap-0.5 rounded-[0.95rem] px-1 py-1 sm:gap-1 sm:px-1.5 sm:py-1",
            "border border-white/[0.06] bg-zinc-950/88",
            "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]",
          )}
        >
          <TooltipProvider delayDuration={80}>
            {items.map((item) => {
              const isActive = activeId === item.id;
              const Icon = item.icon;

              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <div className="relative shrink-0">
                      <Button
                        variant="ghost"
                        type="button"
                        aria-label={item.label}
                        role="tab"
                        id={`project-tool-tab-${item.id}`}
                        aria-selected={isActive}
                        aria-controls={`project-tool-panel-${item.id}`}
                        tabIndex={isActive ? 0 : -1}
                        aria-current={isActive ? "true" : undefined}
                        ref={(el) => {
                          tabRefs.current[item.id] = el;
                        }}
                        onClick={() => onSelect(item.id)}
                        className={cn(
                          "relative flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 transition-[color,background-color,box-shadow] duration-200 ease-out sm:h-10 sm:px-3",
                          "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200",
                          isActive &&
                            "bg-white/[0.11] text-zinc-50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] ring-1 ring-white/[0.12] hover:bg-white/[0.11] hover:text-zinc-50",
                        )}
                      >
                        <Icon
                          className={cn(
                            "relative z-10 size-[17px] opacity-90 sm:size-[18px]",
                            isActive && "opacity-100",
                          )}
                        />
                        <span
                          className={cn(
                            "relative z-10 hidden text-xs font-medium sm:inline",
                            isActive ? "text-zinc-100" : "text-zinc-500",
                          )}
                        >
                          {item.label}
                        </span>
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    sideOffset={8}
                    className="border-white/10 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-300 sm:hidden"
                  >
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
