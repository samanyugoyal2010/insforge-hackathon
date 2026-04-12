"use client";

import { LogoWordmark } from "@/components/logo-wordmark";
import AnimatedGradientBackground from "@/components/ui/animated-gradient-background";
import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import { GithubGlyph, GoogleGlyph } from "@/components/oauth-icons";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { persistLandingPromptDraft } from "@/lib/landing-prompt-draft";
import {
  hasAuthSession,
  hydrateAuthSession,
  signInWithProvider,
  subscribeAuthSession,
} from "@/lib/supabase-auth";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

function useMockAuthSession() {
  return useSyncExternalStore(
    subscribeAuthSession,
    hasAuthSession,
    () => false,
  );
}

type JoinPhase = "home" | "exit" | "split" | "settle";

const EXIT_MS = 560;
const SPLIT_MS = 580;

/** Extra radial size (percentage points) — real gradient breathe, not CSS zoom. */
const BREATHE_OUT_OVERSHOOT = 58;

export function HomeExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinOpen = searchParams.get("join") === "1";
  const isAuthed = useMockAuthSession();

  useEffect(() => {
    void hydrateAuthSession();
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    const project = searchParams.get("project");
    if (project) {
      router.replace(
        `/dashboard?project=${encodeURIComponent(project)}`,
      );
    } else {
      router.replace("/dashboard");
    }
  }, [isAuthed, router, searchParams]);

  const [phase, setPhase] = useState<JoinPhase>("home");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useLayoutEffect(() => {
    if (isAuthed) return;
    clearTimers();
    queueMicrotask(() => {
      if (!joinOpen) {
        setPhase("home");
        return;
      }
      const narrow =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 767px)").matches;
      // Tunnel / in-app browsers often throttle timers and break blur-heavy
      // motion—on phones go straight to the join panel so OAuth is never invisible.
      if (narrow) {
        setPhase("settle");
        return;
      }
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        setPhase("settle");
        return;
      }
      setPhase("exit");
      timersRef.current.push(
        setTimeout(() => setPhase("split"), EXIT_MS),
        setTimeout(() => setPhase("settle"), EXIT_MS + SPLIT_MS),
      );
    });
    return clearTimers;
  }, [isAuthed, joinOpen, clearTimers]);

  /** Ensures OAuth targets are never stuck invisible if timers or motion fail (e.g. throttled tab). */
  useEffect(() => {
    if (!joinOpen || isAuthed) return;
    const maxMs = EXIT_MS + SPLIT_MS + 900;
    const id = window.setTimeout(() => {
      setPhase((p) => (p === "settle" ? p : "settle"));
    }, maxMs);
    return () => window.clearTimeout(id);
  }, [joinOpen, isAuthed]);

  const breathOvershoot =
    joinOpen && (phase === "exit" || phase === "split")
      ? BREATHE_OUT_OVERSHOOT
      : 0;

  const openJoinForAuth = useCallback(() => {
    if (!joinOpen) {
      router.push("/?join=1");
    }
  }, [joinOpen, router]);

  const onLandingDraftChange = useCallback(
    (value: string) => {
      persistLandingPromptDraft(value);
      if (value.trim()) {
        openJoinForAuth();
      }
    },
    [openJoinForAuth],
  );

  const onLandingAttachmentAdded = useCallback(() => {
    openJoinForAuth();
  }, [openJoinForAuth]);

  const showLanding =
    !joinOpen ||
    phase === "exit" ||
    (joinOpen && phase === "home");
  const showSplit = joinOpen && (phase === "split" || phase === "settle");
  const showOAuthCopy =
    joinOpen && (phase === "split" || phase === "settle");
  const showJoinDivider = phase === "split" || phase === "settle";

  if (isAuthed) {
    return (
      <div
        className="min-h-screen bg-[#06060a]"
        aria-busy
        aria-label="Opening workspace"
      />
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#06060a]">
      <div className="absolute inset-0">
        <AnimatedGradientBackground breathOvershoot={breathOvershoot} />
      </div>

      {showLanding ? (
        <motion.div
          key="landing"
          className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 pb-[max(7rem,env(safe-area-inset-bottom,0px)+4rem)] pt-[calc(3.5rem+env(safe-area-inset-top,0px)+1.5rem)] text-center font-sans sm:px-5 md:px-8 md:pt-[calc(4rem+env(safe-area-inset-top,0px)+1.5rem)]"
          initial="initial"
          animate={
            joinOpen && phase === "exit"
              ? "exit"
              : "animate"
          }
          variants={{
            initial: { opacity: 0 },
            animate: {
              opacity: 1,
              transition: {
                staggerChildren: 0.12,
                delayChildren: 0.1,
              },
            },
            exit: {
              opacity: 0,
              y: 18,
              scale: 0.96,
              transition: {
                duration: EXIT_MS / 1000,
                ease: [0.28, 0, 0.18, 1],
              },
            },
          }}
        >
          <motion.h1
            variants={{
              initial: { opacity: 0, y: 24 },
              animate: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="font-heading max-w-[min(100%,42rem)] text-balance text-[clamp(1.75rem,5.5vw+0.6rem,2.5rem)] font-bold leading-[1.12] tracking-[-0.02em] text-white drop-shadow-[0_2px_28px_rgba(0,0,0,0.4)] sm:text-4xl md:text-6xl md:leading-[1.02] md:tracking-[-0.03em] lg:text-7xl"
          >
            Go from idea to hardware, fast.
          </motion.h1>
          <motion.p
            variants={{
              initial: { opacity: 0, y: 20 },
              animate: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 max-w-xl text-pretty text-base font-normal leading-relaxed tracking-wide text-white/72 drop-shadow-[0_1px_12px_rgba(0,0,0,0.3)] md:mt-7 md:text-lg md:leading-relaxed"
          >
            The direct path from idea to electronics.
          </motion.p>

            <motion.div
              id="get-started"
              className="mt-8 w-full max-w-2xl scroll-mt-28 text-left sm:mt-10"
              style={{ willChange: "transform" }}
              initial="initial"
              variants={{
                initial: { opacity: 0, y: 32 },
                animate: { opacity: 1, y: 0 },
              }}
              animate={
                joinOpen && phase === "exit"
                  ? { clipPath: "inset(0 0 100% 0 round 1.5rem)", y: 12, opacity: 0 }
                  : "animate"
              }
              transition={{
                delay: joinOpen && phase === "exit" ? 0 : 0.1,
                clipPath: {
                  duration: 0.55,
                  ease: [0.22, 1, 0.28, 1],
                },
                y: {
                  type: "spring",
                  stiffness: 260,
                  damping: 30,
                  mass: 1,
                },
                opacity: { duration: 0.4 },
              }}
            >
              <PromptInputBox
                placeholder="Describe your hardware idea…"
                onDraftChange={onLandingDraftChange}
                onAttachmentAdded={onLandingAttachmentAdded}
                onSend={(message, fileList) => {
                  persistLandingPromptDraft(message);
                  openJoinForAuth();
                  if (process.env.NODE_ENV === "development") {
                    console.log("Idea:", message, fileList);
                  }
                }}
              />
            </motion.div>
        </motion.div>
      ) : null}

      <AnimatePresence>
        {showSplit ? (
          <motion.div
            key="join-split"
            className="fixed inset-0 z-[40] flex flex-col md:flex-row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute bottom-10 left-1/2 top-10 z-[1] hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/22 to-transparent md:bottom-16 md:block md:top-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: showJoinDivider ? 1 : 0 }}
              transition={{
                duration: 0.5,
                ease: [0.22, 1, 0.32, 1],
              }}
            />

            <div className="relative hidden h-full min-h-0 w-full flex-col justify-center overflow-y-auto overflow-x-hidden px-4 py-12 sm:px-8 md:flex md:w-1/2 md:min-w-0 md:max-w-none md:shrink-0 md:px-14 lg:px-16">
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] to-transparent transition-opacity duration-500",
                  showOAuthCopy ? "opacity-100" : "opacity-0",
                )}
              />
              <div
                className={cn(
                  "relative z-10 mx-auto w-full max-w-md text-left transition-opacity duration-300",
                  showOAuthCopy ? "opacity-100" : "opacity-0",
                )}
              >
                <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-white/45">
                  Welcome
                </p>
                <h2 className="font-heading mt-3 text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-white md:text-4xl">
                  Describe your board. We'll build the rest.
                </h2>
                <p className="mt-4 max-w-[36ch] text-[15px] leading-relaxed text-white/65 md:text-base">
                  Node0 turns descriptions into schematics, BOMs, and layouts
                  in minutes—helping your team move from sketch to prototype
                  faster.
                </p>
                <ul className="mt-8 space-y-3 text-sm text-white/55 md:text-[15px]">
                  <li className="flex gap-3">
                    <span
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35"
                      aria-hidden
                    />
                    Actually understands your board, unlike generic AI tools
                  </li>
                  <li className="flex gap-3">
                    <span
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35"
                      aria-hidden
                    />
                    Generates real BOMs and layouts ready for production
                  </li>
                  <li className="flex gap-3">
                    <span
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35"
                      aria-hidden
                    />
                    Built for teams that need to move fast without breaking
                    things
                  </li>
                </ul>
              </div>
            </div>

            <div className="relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-y-auto overflow-x-hidden px-4 py-12 sm:px-6 md:w-1/2 md:min-w-0 md:shrink-0 md:px-10 md:py-24">
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 bg-black/55 transition-opacity duration-500",
                  showOAuthCopy ? "opacity-100" : "opacity-0",
                )}
              />
              <div
                className={cn(
                  "relative z-10 flex w-full max-w-[320px] flex-col gap-6 transition-[opacity,transform] duration-300 ease-out",
                  showOAuthCopy
                    ? "translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none translate-y-3 scale-[0.98] opacity-0",
                )}
              >
                <div className="text-center">
                  <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-xl font-semibold text-white md:text-2xl">
                    <span className="font-heading font-semibold">Join</span>
                    <LogoWordmark />
                  </p>
                  <p className="mt-2 text-[13px] leading-snug text-white/50 md:text-sm">
                    Use Google or GitHub—the same account you already use for
                    work.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void signInWithProvider("google", "/dashboard");
                    }}
                    className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-white/25 bg-white/[0.1] text-sm font-semibold text-white shadow-md transition-colors hover:border-white/40 hover:bg-white/[0.16]"
                  >
                    <GoogleGlyph className="size-5" />
                    Continue with Google
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void signInWithProvider("github", "/dashboard");
                    }}
                    className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-white/25 bg-white/[0.1] text-sm font-semibold text-white shadow-md transition-colors hover:border-white/40 hover:bg-white/[0.16]"
                  >
                    <GithubGlyph className="size-5 text-white" />
                    Continue with GitHub
                  </button>
                </div>
                <p className="text-center text-[11px] leading-relaxed text-white/40 md:text-xs">
                  By continuing, you agree to our{" "}
                  <Link
                    href="/terms"
                    className="text-white/55 underline decoration-white/25 underline-offset-2 transition-colors hover:text-white/80"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="text-white/55 underline decoration-white/25 underline-offset-2 transition-colors hover:text-white/80"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
