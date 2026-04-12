"use client";

import {
  BOARD_TEMPLATES,
  BOARD_TEMPLATE_CATEGORIES,
  type BoardTemplate,
  type BoardTemplateCategory,
} from "@/lib/board-templates";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { TemplateCardVisual } from "@/components/template-card-visual";
import { ArrowRight, Search, X } from "lucide-react";
import * as React from "react";

const templateDialogSurface = cn(
  "rounded-2xl border border-zinc-800 bg-zinc-900 p-0 shadow-xl",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
);

function templateMatchesQuery(t: BoardTemplate, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const hay = `${t.title} ${t.tagline} ${t.category} ${t.id} ${t.description}`
    .toLowerCase()
    .replace(/\s+/g, " ");
  const words = q.split(/\s+/).filter(Boolean);
  return words.every((w) => hay.includes(w));
}

export interface WorkspaceTemplatesPageProps {
  onUseTemplate: (prompt: string) => void;
}

export function WorkspaceTemplatesPage({
  onUseTemplate,
}: WorkspaceTemplatesPageProps) {
  const [category, setCategory] =
    React.useState<BoardTemplateCategory>("All");
  const [search, setSearch] = React.useState("");
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [templateDetail, setTemplateDetail] =
    React.useState<BoardTemplate | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const filtered = React.useMemo(() => {
    const byCat =
      category === "All"
        ? BOARD_TEMPLATES
        : BOARD_TEMPLATES.filter((t) => t.category === category);
    return byCat.filter((t) => templateMatchesQuery(t, search));
  }, [category, search]);

  const openTemplateDetail = (t: BoardTemplate) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setTemplateDetail(t);
    setTemplateOpen(true);
  };

  const onTemplateDialogOpenChange = (open: boolean) => {
    setTemplateOpen(open);
    if (!open) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setTemplateDetail(null), 220);
    }
  };

  const applyBoardTemplate = (t: BoardTemplate) => {
    onUseTemplate(t.prompt);
    setTemplateOpen(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setTemplateDetail(null), 220);
  };

  return (
    <>
      <div className="px-4 py-6 sm:px-6 md:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
            Starter ideas in everyday language—open one for detail, then use it
            on Home as your first prompt. Later we&apos;ll tie this to PCB,
            BOM, ordering, and guided help end-to-end.
          </p>

          <div className="mt-5 max-w-md">
            <label htmlFor="template-search" className="sr-only">
              Search templates
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
                strokeWidth={1.75}
              />
              <input
                id="template-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, topic, or keyword…"
                autoComplete="off"
                className={cn(
                  "w-full rounded-xl border border-white/[0.1] bg-white/[0.04] py-2 pl-9 pr-3",
                  "text-sm text-zinc-100 placeholder:text-zinc-600",
                  "outline-none ring-0 backdrop-blur-md",
                  "transition-colors focus:border-white/[0.18] focus:bg-white/[0.06]",
                )}
              />
            </div>
          </div>

          <div
            className="mt-4 flex flex-wrap gap-1.5"
            role="tablist"
            aria-label="Filter by category"
          >
            {BOARD_TEMPLATE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  category === c
                    ? "border-white/[0.2] bg-white/[0.12] text-zinc-100"
                    : "border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:border-white/[0.14] hover:text-zinc-300",
                )}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((t) => (
              <article
                key={t.id}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-xl border border-white/[0.1]",
                  "bg-white/[0.04] shadow-[0_6px_28px_rgba(0,0,0,0.28)] backdrop-blur-md",
                  "ring-1 ring-inset ring-white/[0.05] transition-[border-color] hover:border-white/[0.14]",
                )}
              >
                <div className="relative w-full overflow-hidden">
                  <TemplateCardVisual
                    accent={t.accent}
                    category={t.category}
                    className="h-[4.75rem] w-full sm:h-[5.25rem]"
                  />
                  <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded border border-white/10 bg-black/50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-300 backdrop-blur-sm">
                    {t.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col px-2.5 pb-2 pt-1.5">
                  <h2 className="font-heading text-left text-[13px] font-semibold leading-snug tracking-tight text-zinc-100">
                    {t.title}
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-left text-[11px] leading-relaxed text-zinc-500">
                    {t.tagline}
                  </p>
                  <button
                    type="button"
                    onClick={() => openTemplateDetail(t)}
                    className="mt-2 inline-flex items-center gap-0.5 text-left text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-100"
                  >
                    See more
                    <ArrowRight className="size-3 opacity-70 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="mt-8 text-center text-sm text-zinc-500">
              No templates match that search—try different words or clear the
              filter.
            </p>
          ) : null}
        </div>
      </div>

      <Dialog.Root
        open={templateOpen}
        onOpenChange={onTemplateDialogOpenChange}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/65 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              "fixed left-1/2 top-1/2 z-[201] max-h-[min(90vh,720px)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto focus:outline-none",
              templateDialogSurface,
            )}
          >
            {templateDetail && (
              <>
                <div className="relative w-full overflow-hidden bg-zinc-950">
                  <TemplateCardVisual
                    accent={templateDetail.accent}
                    category={templateDetail.category}
                    size="lg"
                    className="h-36 w-full sm:h-40"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-transparent to-transparent" />
                  <Dialog.Close className="absolute right-3 top-3 rounded-lg bg-black/45 p-2 text-zinc-200 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white">
                    <X className="size-4" />
                    <span className="sr-only">Close</span>
                  </Dialog.Close>
                </div>
                <div className="p-5 md:p-6">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    {templateDetail.category}
                  </p>
                  <Dialog.Title className="mt-1 font-heading text-lg font-semibold text-zinc-100">
                    {templateDetail.title}
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {templateDetail.description}
                  </Dialog.Description>
                  <ul className="mt-4 list-inside list-disc space-y-1.5 text-sm text-zinc-500">
                    {templateDetail.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-800/90 hover:text-zinc-300"
                      >
                        Close
                      </button>
                    </Dialog.Close>
                    <button
                      type="button"
                      onClick={() => applyBoardTemplate(templateDetail)}
                      className="rounded-lg bg-zinc-100 px-3.5 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
                    >
                      Use template
                    </button>
                  </div>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
