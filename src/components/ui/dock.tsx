"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface DockItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}

interface DockProps {
  className?: string;
  activeLabel?: string | null;
  items: DockItem[];
}

export default function Dock({ items, className, activeLabel }: DockProps) {
  const [internalActive, setInternalActive] = React.useState<string | null>(
    items[0]?.label ?? null,
  );

  const resolvedActive =
    activeLabel !== undefined ? activeLabel : internalActive;

  return (
    <div
      className={cn(
        "flex w-full justify-center px-2",
        className,
      )}
    >
      <div
        className={cn(
          "relative w-fit max-w-full rounded-full p-px",
          "bg-gradient-to-b from-white/[0.14] to-white/[0.04]",
          "shadow-[0_12px_48px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.08)]",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center gap-1 rounded-full px-1 py-1 sm:gap-1.5 sm:px-1.5 sm:py-1",
            "border border-white/[0.06] bg-zinc-950/35",
            "backdrop-blur-[32px] backdrop-saturate-150",
            "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
          )}
        >
          <TooltipProvider delayDuration={80}>
            {items.map((item) => {
              const isActive = resolvedActive === item.label;
              const Icon = item.icon;

              return (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>
                    <div className="relative shrink-0">
                      <Button
                        variant="ghost"
                        type="button"
                        aria-label={item.label}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => {
                          if (activeLabel === undefined) {
                            setInternalActive(item.label);
                          }
                          item.onClick?.();
                        }}
                        className={cn(
                          "relative flex size-10 shrink-0 items-center justify-center rounded-full sm:size-11",
                          "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200",
                          isActive &&
                            "text-zinc-50 hover:bg-transparent hover:text-zinc-50",
                        )}
                      >
                        {isActive ? (
                          <motion.div
                            layoutId="dock-active-pill"
                            className="absolute inset-0 rounded-full bg-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] ring-1 ring-white/[0.1]"
                            transition={{
                              type: "spring",
                              stiffness: 460,
                              damping: 38,
                            }}
                          />
                        ) : null}
                        <Icon
                          className={cn(
                            "relative z-10 size-[18px] opacity-90 sm:size-[19px]",
                            isActive && "opacity-100",
                          )}
                        />
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    className="border-white/10 bg-zinc-950/90 px-2.5 py-1 text-[11px] text-zinc-300 backdrop-blur-md"
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
