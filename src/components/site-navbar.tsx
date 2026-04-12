"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Suspense, useEffect, useSyncExternalStore } from "react";

import { LogoWordmark } from "@/components/logo-wordmark";
import { clearWorkspaceStorage } from "@/lib/mock-workspace";
import {
  hasAuthSession,
  hydrateAuthSession,
  signOutAuth,
  subscribeAuthSession,
} from "@/lib/supabase-auth";
import { cn } from "@/lib/utils";

function useMockSession() {
  return useSyncExternalStore(
    subscribeAuthSession,
    hasAuthSession,
    () => false,
  );
}

function SiteNavbarInner() {
  const pathname = usePathname();
  const router = useRouter();
  const hasMockSession = useMockSession();

  useEffect(() => {
    void hydrateAuthSession();
  }, []);

  const onDashboard = pathname === "/dashboard";
  const workspaceMinimalNav = hasMockSession && onDashboard;

  async function signOut() {
    clearWorkspaceStorage();
    await signOutAuth();
    router.replace("/");
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.08] bg-[#070709]/95 pt-[env(safe-area-inset-top)]">
      <nav
        aria-label="Main"
        className={cn(
          "mx-auto flex h-14 items-center justify-between gap-3 md:h-16",
          workspaceMinimalNav
            ? "max-w-none px-3 sm:px-4 md:pl-5 md:pr-8"
            : "max-w-6xl px-4 sm:px-5 md:px-8",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center",
            workspaceMinimalNav ? "justify-start" : "flex-1 gap-2 sm:gap-3",
          )}
        >
          <Link
            href={hasMockSession ? "/dashboard" : "/"}
            className="shrink-0 text-[1.125rem] font-semibold text-white drop-shadow-sm md:text-xl"
          >
            <LogoWordmark priority />
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {!hasMockSession ? (
            <Dialog.Root>
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  className="rounded-full px-3 py-2 text-sm font-medium text-white/65 transition-colors hover:text-white sm:px-4"
                >
                  Product
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay
                  className={cn(
                    "fixed inset-0 z-[100] bg-black/70",
                    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                  )}
                />
                <Dialog.Content
                  className={cn(
                    "fixed left-1/2 top-1/2 z-[100] max-h-[min(85vh,640px)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-white/20 bg-zinc-900/98 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] md:max-w-lg md:p-8",
                    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                    "focus:outline-none",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <Dialog.Title className="font-heading text-xl font-semibold tracking-tight text-white md:text-2xl">
                      Product
                    </Dialog.Title>
                    <Dialog.Close
                      type="button"
                      className="shrink-0 rounded-full bg-white/[0.08] p-2 text-white/80 ring-1 ring-white/10 transition-colors hover:bg-white/[0.14] hover:text-white"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </Dialog.Close>
                  </div>
                  <Dialog.Description className="sr-only">
                  Node0 turns descriptions into real hardware work:
                    architecture options, BOMs, and layouts you can actually
                    use to build faster.
                  </Dialog.Description>
                  <div className="mt-5 space-y-4 text-left text-sm leading-relaxed text-white/75 md:text-[0.9375rem]">
                    <p>
                      <strong className="font-medium text-white/95">Node0</strong>{" "}
                      turns descriptions into real hardware work:
                      architecture options, BOMs, and layouts you can actually
                      use to build.
                    </p>
                    <ul className="list-inside list-disc space-y-2 text-white/70 marker:text-white/40">
                      <li>
                        Turn simple descriptions into concrete electronics
                        schematics
                      </li>
                      <li>
                        Actually understands your board, unlike generic AI tools
                      </li>
                      <li>
                        Built for teams that need to move fast without losing
                        rigor
                      </li>
                    </ul>
                    <p className="text-white/55">
                      Drop an idea in the prompt on the homepage to see how it
                      frames your build—or hit Join now to get started.
                    </p>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          ) : null}

          {hasMockSession ? (
            <button
              type="button"
              onClick={() => {
                void signOut();
              }}
              className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:border-white/25 hover:bg-white/[0.1] sm:px-4"
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/?join=1"
              className="shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:border-white/25 hover:bg-white/[0.1] sm:px-4"
            >
              Join now
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}

function SiteNavbarFallback() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.08] bg-[#070709]/95 pt-[env(safe-area-inset-top)]">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-5 md:h-16 md:px-8"
      >
        <Link
          href="/"
          className="text-[1.125rem] font-semibold text-white drop-shadow-sm md:text-xl"
        >
          <LogoWordmark priority />
        </Link>
        <div className="h-9 w-24 animate-pulse rounded-full bg-white/[0.06]" />
      </nav>
    </header>
  );
}

export function SiteNavbar() {
  return (
    <Suspense fallback={<SiteNavbarFallback />}>
      <SiteNavbarInner />
    </Suspense>
  );
}
