"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Smartphone, QrCode, ScanLine } from "lucide-react";
import { useClientOrigin } from "@/hooks/use-client-origin";

export default function ArClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") ?? "demo";
  const enterParam = searchParams.get("enter") === "1";

  const origin = useClientOrigin();
  const [localEntered, setLocalEntered] = useState(false);
  const isEntered = enterParam || localEntered;

  const urlForQr = useMemo(() => {
    if (!origin) return "";
    return `${origin}/ar?slug=${encodeURIComponent(slug)}&enter=1`;
  }, [origin, slug]);

  const qrSrc = useMemo(() => {
    if (!urlForQr) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      urlForQr,
    )}`;
  }, [urlForQr]);

  const onEnter = () => {
    setLocalEntered(true);
    router.replace(`/ar?slug=${encodeURIComponent(slug)}&enter=1`, {
      scroll: false,
    });
  };

  return (
    <main className="min-h-screen bg-[#070709] text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 pt-[calc(3.5rem+env(safe-area-inset-top)+2rem)] pb-16 sm:px-6 md:pb-20">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-200"
          >
            ← Dashboard
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-zinc-500 sm:flex">
            <Smartphone className="size-3.5" />
            AR demo
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6"
        >
          <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-6 backdrop-blur-md sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  AR preview (demo)
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  This is a static AR mock. Click the button to switch into the
                  preview view and see what the experience would feel like on
                  mobile.
                </p>
              </div>
            </div>

            {!isEntered ? (
              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
                <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.16),transparent_55%)]" />
                  <div className="relative">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <ScanLine className="size-4" />
                      Ready to enter AR preview
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-zinc-100">
                      “{slug}” scene
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                      When you enter, we’ll show a demo “camera” view. QR
                      links from the dashboard open this page.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={onEnter}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-sky-950 shadow-[0_14px_40px_rgba(14,165,233,0.25)] transition hover:bg-sky-400"
                      >
                        Enter AR preview
                      </button>
                      {qrSrc ? (
                        <a
                          href={urlForQr}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
                        >
                          Open on this device
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <div className="flex size-11 items-center justify-center rounded-2xl border border-white/[0.10] bg-white/[0.04] text-zinc-200">
                    <QrCode className="size-5" />
                  </div>
                  <div className="text-center text-xs leading-relaxed text-zinc-500">
                    QR opens this page.
                    <br />
                    Enter preview inside.
                  </div>
                  {qrSrc ? (
                    <Image
                      src={qrSrc}
                      alt="AR preview QR code"
                      width={176}
                      height={176}
                      className="h-44 w-44 rounded-xl bg-white p-1"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-44 w-44 items-center justify-center rounded-xl bg-white/5 text-xs text-zinc-500">
                      Loading…
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.16),transparent_55%)]" />
                  <div className="relative">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Smartphone className="size-4" />
                      Camera view (demo)
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-zinc-100">
                      AR previewing: “{slug}”
                    </h2>

                    <motion.div
                      initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        filter: "blur(0px)",
                      }}
                      transition={{
                        duration: 0.35,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="mt-4 aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/[0.10] bg-black/30"
                    >
                      <div className="relative h-full w-full">
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:28px_28px]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.22),transparent_60%)]" />
                        <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-sky-400/30 bg-sky-500/10 shadow-[0_30px_90px_rgba(56,189,248,0.18)] backdrop-blur-sm" />
                        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/40 to-transparent" />
                        <div className="absolute left-4 bottom-3 rounded-xl border border-white/[0.10] bg-black/40 px-3 py-2 text-xs text-zinc-200">
                          Static AR mock. Hook up WebXR later.
                        </div>
                      </div>
                    </motion.div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLocalEntered(false);
                          router.replace(`/ar?slug=${encodeURIComponent(slug)}`, {
                            scroll: false,
                          });
                        }}
                        className="inline-flex items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
                      >
                        Back to preview entry
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </main>
  );
}

