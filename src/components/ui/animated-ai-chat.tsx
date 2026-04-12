"use client";

import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import {
  getHomeFeaturedTemplates,
  type BoardTemplate,
} from "@/lib/board-templates";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { TemplateCardVisual } from "@/components/template-card-visual";
import {
  ArrowRight,
  X,
} from "lucide-react";
import * as React from "react";

export interface AnimatedAIChatProps {
  onSend: (message: string, files?: File[]) => void;
  placeholder?: string;
  className?: string;
  /** When set (e.g. after “Use template” from the Templates tab), prefills the prompt. */
  homeInjectKey?: number;
  homeInjectText?: string;
}

const QUICK_STARTS: { label: string; text: string; icon: React.ReactNode }[] =
  [];

const HOME_FEATURED = getHomeFeaturedTemplates();

const templateDialogSurface = cn(
  "rounded-2xl border border-zinc-800 bg-zinc-900 p-0 shadow-xl",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
);

/**
 * Dark hero + glass prompt region using the shared {@link PromptInputBox}.
 * Orbs and motion are subtle (zinc / white), on-brand for the dashboard.
 */
export function AnimatedAIChat({
  onSend,
  placeholder = "Describe something you want to build…",
  className,
  homeInjectKey = 0,
  homeInjectText = "",
}: AnimatedAIChatProps) {
  const [promptKey, setPromptKey] = React.useState(0);
  const [prefill, setPrefill] = React.useState("");
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [templateDetail, setTemplateDetail] = React.useState<BoardTemplate | null>(
    null,
  );
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHomeInjectKey = React.useRef(0);

  React.useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  React.useEffect(() => {
    if (!homeInjectKey || homeInjectKey === lastHomeInjectKey.current) return;
    if (!homeInjectText) return;
    lastHomeInjectKey.current = homeInjectKey;
    setPrefill(homeInjectText);
    setPromptKey((k) => k + 1);
  }, [homeInjectKey, homeInjectText]);

  const applyChip = (text: string) => {
    setPrefill(text);
    setPromptKey((k) => k + 1);
  };

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
    applyChip(t.prompt);
    setTemplateOpen(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setTemplateDetail(null), 220);
  };

  return (
    <div
      className={cn(
        "relative flex w-full flex-col overflow-x-hidden",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute -left-20 top-0 h-72 w-72 rounded-full bg-zinc-500/[0.07] blur-[100px]" />
        <div className="absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-white/[0.04] blur-[110px]" />
        <div className="absolute left-1/3 top-1/4 h-48 w-48 rounded-full bg-zinc-400/[0.05] blur-[80px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 md:px-0">
        <motion.div
          className="flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <h1 className="font-heading max-w-lg text-balance text-2xl font-semibold tracking-[-0.03em] text-zinc-100 sm:text-3xl">
            What are we building?
          </h1>
          <motion.div
            className="mt-3 h-px w-[min(100%,12rem)] bg-white/10"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          />
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-zinc-400">
            Say what you&apos;re building—we&apos;ll help you get to a board,
            BOM, and ordering. Full CAD and guided help are next.
          </p>
        </motion.div>

        <motion.div
          className="relative mt-8 w-full sm:mt-10"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div
            className="pointer-events-none absolute -inset-3 rounded-[1.55rem] bg-gradient-to-b from-white/[0.12] via-white/[0.03] to-transparent opacity-90 blur-2xl"
            aria-hidden
          />
          <div
            className={cn(
              "relative rounded-[1.35rem] p-[1px]",
              "bg-gradient-to-b from-white/[0.22] via-white/[0.08] to-white/[0.03]",
              "shadow-[0_28px_100px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.12)]",
            )}
          >
            <PromptInputBox
              key={promptKey}
              defaultInput={prefill}
              placeholder={placeholder}
              onSend={onSend}
            />
          </div>
        </motion.div>

        {QUICK_STARTS.length > 0 ? (
          <motion.div
            className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:mt-7"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
          >
            {QUICK_STARTS.map((chip, i) => (
              <motion.button
                key={chip.label}
                type="button"
                onClick={() => applyChip(chip.text)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05, duration: 0.35 }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-white/[0.12]",
                  "bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-zinc-300 backdrop-blur-md",
                  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]",
                  "transition-colors hover:border-white/[0.18] hover:bg-white/[0.1] hover:text-zinc-100",
                )}
              >
                {chip.icon}
                {chip.label}
              </motion.button>
            ))}
          </motion.div>
        ) : null}

        <motion.div
          className="mt-10 w-full sm:mt-12"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.45 }}
        >
          <p className="text-center text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
            Or, get started with a template
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
            {HOME_FEATURED.map((t, i) => (
              <motion.article
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.06, duration: 0.4 }}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-xl border border-white/[0.1]",
                  "bg-white/[0.04] shadow-[0_8px_32px_rgba(0,0,0,0.28)] backdrop-blur-md",
                  "ring-1 ring-inset ring-white/[0.05] transition-[border-color,box-shadow] hover:border-white/[0.15]",
                )}
              >
                <TemplateCardVisual
                  accent={t.accent}
                  category={t.category}
                  className="h-[4.5rem] w-full sm:h-[5rem]"
                />
                <div className="flex flex-1 flex-col px-2.5 pb-2.5 pt-2">
                  <h2 className="font-heading text-left text-[13px] font-semibold leading-snug tracking-tight text-zinc-100">
                    {t.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-left text-[11px] leading-relaxed text-zinc-500">
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
              </motion.article>
            ))}
          </div>
        </motion.div>
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
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent pointer-events-none" />
                  <Dialog.Close className="absolute right-3 top-3 rounded-lg bg-black/45 p-2 text-zinc-200 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white">
                    <X className="size-4" />
                    <span className="sr-only">Close</span>
                  </Dialog.Close>
                </div>
                <div className="p-5 md:p-6">
                  <Dialog.Title className="font-heading text-lg font-semibold text-zinc-100">
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
    </div>
  );
}
