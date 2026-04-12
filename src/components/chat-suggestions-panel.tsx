"use client";

import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import * as React from "react";

export interface ChatSuggestionsPanelProps {
  suggestions: string[];
  loading: boolean;
  error: string | null;
  disabled?: boolean;
  onPick: (text: string) => void;
  onRefresh: () => void;
  className?: string;
}

export function ChatSuggestionsPanel({
  suggestions,
  loading,
  error,
  disabled = false,
  onPick,
  onRefresh,
  className,
}: ChatSuggestionsPanelProps) {
  return (
    <div
      className={cn(
        "shrink-0 border-b border-zinc-800/90 bg-[#070709] px-3 py-3.5 sm:px-4 sm:py-4",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Try next
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={disabled || loading}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-900/80 text-zinc-400 transition-colors",
            "hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-200",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
          aria-label="Refresh suggestions"
        >
          <RefreshCw
            className={cn("size-3.5", loading && "animate-spin")}
            strokeWidth={1.75}
          />
        </button>
      </div>

      {error ? (
        <p className="mb-2 text-[11px] leading-snug text-red-400/90">{error}</p>
      ) : null}

      {loading && suggestions.length === 0 && !error ? (
        <div className="flex flex-wrap gap-2">
          <div className="h-8 w-36 max-w-[88%] animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-8 w-44 max-w-[92%] animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-8 w-40 max-w-[85%] animate-pulse rounded-full bg-white/[0.06]" />
        </div>
      ) : null}

      {!loading || suggestions.length > 0 ? (
        <div
          className={cn(
            "flex max-h-[6.5rem] flex-wrap gap-2 overflow-y-auto overflow-x-hidden pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.12)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15",
            loading && suggestions.length > 0 && "opacity-65",
          )}
        >
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              disabled={disabled}
              onClick={() => onPick(text)}
              className={cn(
                "max-w-full truncate rounded-full border border-sky-500/40 bg-sky-950/50 px-3 py-1.5 text-left text-[11px] leading-snug text-sky-100/95 transition-colors",
                "hover:border-sky-400/60 hover:bg-sky-900/55 hover:text-white",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}

      {!loading && !error && suggestions.length === 0 ? (
        <p className="text-[11px] text-zinc-600">
          No suggestions yet — tap refresh.
        </p>
      ) : null}
    </div>
  );
}
