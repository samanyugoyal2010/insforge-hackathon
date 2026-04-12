"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Info, QrCode, ScanLine, Smartphone } from "lucide-react";
import { useClientOrigin } from "@/hooks/use-client-origin";
import { CadThreeViewport } from "@/components/renderers/cad-three-viewport";
import { useCadShell } from "@/hooks/use-cad-shell";
import { loadCircuitronForProject } from "@/lib/circuitron-persist";
import {
  arPcbSceneFromWorkspaceFiles,
  buildArSolderRefSet,
  buildFullArTutorial,
  derivePcbSceneAssemblyProgress,
  filterArPcbSceneToRefSet,
} from "@/lib/ar-pcb";
import {
  cumulativeStageRefsForTutorialStep,
  getWorkspaceFileMapFromCircuitronSnap,
  listLayoutStageSvgKeys,
  pickLayoutSvgFromWorkspaceFiles,
} from "@/lib/ar-handoff-payload";
import {
  defaultCadDocument,
  parseCadDocumentUnknown,
} from "@/lib/cad-document";
import { cn } from "@/lib/utils";
import { HIRO_MARKER_IMAGE_URL } from "@/lib/ar-hiro-marker";
import { isLikelyIosClient } from "@/lib/is-ios-client";
import type { IosQuickLookUiControl } from "@/components/ar/ar-world-ar-view";

const ArJsMarkerView = dynamic(
  () =>
    import("@/components/ar/ar-js-marker-view").then((m) => ({
      default: m.ArJsMarkerView,
    })),
  { ssr: false },
);

const ArWorldArView = dynamic(
  () =>
    import("@/components/ar/ar-world-ar-view").then((m) => ({
      default: m.ArWorldArView,
    })),
  { ssr: false },
);

type ArViewQuery = "arjs" | "world" | "orbit";

function parseHandoffApiError(bodyText: string): string {
  try {
    const j = JSON.parse(bodyText) as { error?: string };
    const e = typeof j.error === "string" ? j.error.trim() : "";
    return e;
  } catch {
    return "";
  }
}

function describeHandoffFetchFailure(status: number, bodyText: string): string {
  const api = parseHandoffApiError(bodyText);
  if (status === 404) {
    return (
      api ||
      "Not found or expired — handoff links last about one hour. Generate a new QR from the dashboard."
    );
  }
  if (status === 503) {
    return (
      api ||
      "Service unavailable — apply Supabase migrations for AR handoffs or check server environment variables."
    );
  }
  if (status === 502) {
    return (
      api ||
      "Handoff file missing in storage — the snapshot could not be downloaded."
    );
  }
  if (status === 400) {
    return api || "Invalid handoff request.";
  }
  if (status >= 500) {
    return api || "Server error while loading this handoff.";
  }
  return api || `Could not load handoff (HTTP ${status}).`;
}

function buildArQuery(parts: {
  slug: string;
  handoffId: string | null;
  enter?: boolean;
  view?: ArViewQuery;
}) {
  const p = new URLSearchParams();
  if (parts.handoffId) p.set("h", parts.handoffId);
  else p.set("slug", parts.slug);
  if (parts.enter) p.set("enter", "1");
  if (parts.view === "arjs") p.set("view", "arjs");
  else if (parts.view === "world") p.set("view", "world");
  else if (parts.view === "orbit") p.set("view", "orbit");
  return p.toString();
}

function useIsMobileAr() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

function ArInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") ?? "demo";
  const handoffId = searchParams.get("h")?.trim() || null;
  const viewParam = searchParams.get("view");
  const viewArjs = viewParam === "arjs";
  const viewOrbit = viewParam === "orbit";
  const viewWorld =
    viewParam === "world" ||
    (handoffId != null && !viewArjs && !viewOrbit);
  const enterParam = searchParams.get("enter") === "1";

  const toggledView: ArViewQuery = viewArjs
    ? handoffId
      ? "world"
      : "orbit"
    : "arjs";

  const origin = useClientOrigin();
  const isMobile = useIsMobileAr();
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [iosArUi, setIosArUi] = useState<IosQuickLookUiControl | null>(null);

  useEffect(() => {
    setIsIosDevice(isLikelyIosClient());
  }, []);

  useEffect(() => {
    if (!viewWorld || !isIosDevice) setIosArUi(null);
  }, [viewWorld, isIosDevice]);
  const [localEntered, setLocalEntered] = useState(false);
  const isEntered = enterParam || localEntered;

  const [handoffStatus, setHandoffStatus] = useState<
    "idle" | "loading" | "ok" | "err"
  >("idle");
  const [handoffCad, setHandoffCad] = useState<ReturnType<
    typeof defaultCadDocument
  > | null>(null);
  const [handoffCircuitron, setHandoffCircuitron] = useState<unknown | null>(
    null,
  );
  const [handoffErrDetail, setHandoffErrDetail] = useState<string | null>(null);
  const [preRenderedStlBase64, setPreRenderedStlBase64] = useState<string | null>(null);

  const { cad: storedCad } = useCadShell(handoffId ? null : slug);

  const [activeStep, setActiveStep] = useState(0);
  const [markerHelpOpen, setMarkerHelpOpen] = useState(false);

  useEffect(() => {
    if (!viewArjs) setMarkerHelpOpen(false);
  }, [viewArjs]);

  useEffect(() => {
    if (!markerHelpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMarkerHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [markerHelpOpen]);

  useEffect(() => {
    if (!handoffId) {
      setHandoffStatus("idle");
      setHandoffCad(null);
      setHandoffCircuitron(null);
      setHandoffErrDetail(null);
      setPreRenderedStlBase64(null);
      return;
    }
    let cancelled = false;
    setHandoffStatus("loading");
    setHandoffCad(null);
    setHandoffCircuitron(null);
    setHandoffErrDetail(null);
    setPreRenderedStlBase64(null);
    void fetch(`/api/ar-handoff?id=${encodeURIComponent(handoffId)}`)
      .then(async (r) => {
        const text = await r.text().catch(() => "");
        if (!r.ok) {
          if (!cancelled) {
            setHandoffErrDetail(describeHandoffFetchFailure(r.status, text));
            setHandoffStatus("err");
            setHandoffCad(null);
            setHandoffCircuitron(null);
          }
          return null;
        }
        try {
          return JSON.parse(text) as { cad: unknown; circuitron: unknown; preRenderedStlBase64?: string };
        } catch {
          if (!cancelled) {
            setHandoffErrDetail("Invalid JSON from handoff server.");
            setHandoffStatus("err");
            setHandoffCad(null);
            setHandoffCircuitron(null);
          }
          return null;
        }
      })
      .then((data) => {
        if (cancelled || !data) return;
        const cad =
          parseCadDocumentUnknown(data.cad) ?? defaultCadDocument();
        setHandoffCad(cad);
        setHandoffCircuitron(data.circuitron ?? {});
        if (typeof data.preRenderedStlBase64 === "string") {
          setPreRenderedStlBase64(data.preRenderedStlBase64);
        }
        setHandoffStatus("ok");
        setHandoffErrDetail(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setHandoffErrDetail(
          e instanceof Error
            ? e.message
            : "Network error while loading handoff.",
        );
        setHandoffStatus("err");
        setHandoffCad(null);
        setHandoffCircuitron(null);
      });
    return () => {
      cancelled = true;
    };
  }, [handoffId]);

  const cad = useMemo(() => {
    if (handoffId && handoffStatus === "ok" && handoffCad) return handoffCad;
    return storedCad;
  }, [handoffId, handoffStatus, handoffCad, storedCad]);

  const pcbWorkspace = useMemo((): Record<string, string> | null => {
    if (handoffId) {
      if (handoffStatus === "err") return null;
      if (handoffStatus !== "ok" || handoffCircuitron == null) return null;
      return getWorkspaceFileMapFromCircuitronSnap(handoffCircuitron);
    }
    return getWorkspaceFileMapFromCircuitronSnap(
      loadCircuitronForProject(slug),
    );
  }, [slug, handoffId, handoffStatus, handoffCircuitron]);

  useEffect(() => {
    setActiveStep(0);
  }, [slug, handoffId]);

  const pcbFullSvg = useMemo(
    () =>
      pcbWorkspace ? pickLayoutSvgFromWorkspaceFiles(pcbWorkspace) : undefined,
    [pcbWorkspace],
  );

  const pcbTutorial = useMemo(
    () =>
      pcbWorkspace && pcbFullSvg
        ? arPcbSceneFromWorkspaceFiles(pcbWorkspace, pcbFullSvg)
        : null,
    [pcbWorkspace, pcbFullSvg],
  );

  const steps = useMemo(
    () => buildFullArTutorial(pcbTutorial, { projectKey: slug }),
    [pcbTutorial, slug],
  );
  const solderRefSet = useMemo(
    () => buildArSolderRefSet(pcbTutorial),
    [pcbTutorial],
  );

  const hasStagedLayouts = useMemo(
    () =>
      pcbWorkspace ? listLayoutStageSvgKeys(pcbWorkspace).length >= 2 : false,
    [pcbWorkspace],
  );

  const stageRefList = useMemo(() => {
    if (!pcbWorkspace || !hasStagedLayouts) return null;
    return cumulativeStageRefsForTutorialStep({
      wf: pcbWorkspace,
      activeStep,
      steps,
    });
  }, [pcbWorkspace, hasStagedLayouts, activeStep, steps]);

  const pcbScene = useMemo(() => {
    if (!pcbTutorial) return null;
    if (hasStagedLayouts && stageRefList != null) {
      return filterArPcbSceneToRefSet(
        pcbTutorial,
        new Set(stageRefList.map((r) => r.trim().toUpperCase()).filter(Boolean)),
      );
    }
    return pcbTutorial;
  }, [pcbTutorial, hasStagedLayouts, stageRefList]);

  const pcbProgressive = useMemo(() => {
    if (!pcbScene) return null;
    if (hasStagedLayouts) return pcbScene;
    return derivePcbSceneAssemblyProgress(pcbScene, steps, activeStep);
  }, [pcbScene, hasStagedLayouts, steps, activeStep]);

  const pcbNotice = pcbScene?.notice ?? pcbTutorial?.notice ?? null;

  const current = steps[activeStep] ?? null;
  const highlightRef = current?.ref?.trim() ? current.ref.trim() : null;
  const isLastStep = steps.length > 0 && activeStep >= steps.length - 1;

  const openCurrentStepInQuickLook = useCallback(() => {
    if (!iosArUi) return;
    const cur = steps[activeStep];
    const ref = cur?.ref?.trim() || null;
    const isSolderStep = Boolean(ref && solderRefSet.has(ref));
    void iosArUi.openAppleAr({
      banner: {
        checkoutTitle: cur?.title ?? "Assembly step",
        checkoutSubtitle: (cur?.instruction ?? "").slice(0, 115),
        callToAction: "Done — Next/Prev",
      },
      exportHighlightRef: isSolderStep ? ref : null,
      exportShowInner: isSolderStep,
    });
  }, [iosArUi, steps, activeStep, solderRefSet]);

  const urlForQr = useMemo(() => {
    if (!origin) return "";
    const q = buildArQuery({
      slug,
      handoffId,
      enter: true,
      view: viewArjs ? "arjs" : viewWorld ? "world" : "orbit",
    });
    return `${origin}/ar?${q}`;
  }, [origin, slug, handoffId, viewArjs, viewWorld]);

  const qrSrc = useMemo(() => {
    if (!urlForQr) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      urlForQr,
    )}`;
  }, [urlForQr]);

  const sceneLabel = handoffId ? "Shared handoff" : `“${slug}”`;

  const onEnter = () => {
    setLocalEntered(true);
    router.replace(
      `/ar?${buildArQuery({
        slug,
        handoffId,
        enter: true,
        view: viewArjs ? "arjs" : viewWorld ? "world" : "orbit",
      })}`,
      { scroll: false },
    );
  };

  const onPickRef = useCallback(
    (ref: string) => {
      const idx = steps.findIndex((s) => s.ref === ref);
      if (idx < 0) return;
      setActiveStep((prev) => {
        if (idx === prev) return Math.min(steps.length - 1, prev + 1);
        return idx;
      });
    },
    [steps],
  );

  const goNextStep = useCallback(() => {
    if (steps.length === 0) return;
    setActiveStep((i) => (i >= steps.length - 1 ? 0 : i + 1));
  }, [steps.length]);

  const exitPreview = useCallback(() => {
    setLocalEntered(false);
    router.replace(
      `/ar?${buildArQuery({
        slug,
        handoffId,
        view: viewArjs ? "arjs" : viewWorld ? "world" : "orbit",
      })}`,
      { scroll: false },
    );
  }, [router, slug, handoffId, viewArjs, viewWorld]);

  if (isEntered && isMobile && handoffId && handoffStatus === "loading") {
    return (
      <main className="fixed inset-0 z-[60] flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-zinc-100">
        <div className="text-sm font-medium text-zinc-200">Loading project…</div>
        <p className="mt-2 max-w-xs text-xs text-zinc-500">
          Fetching CAD and PCB snapshot for this link.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/dashboard")}
          className="mt-6 rounded-full border border-white/15 px-4 py-2 text-xs text-zinc-300"
        >
          Back to dashboard
        </button>
      </main>
    );
  }

  if (isEntered && isMobile && handoffId && handoffStatus === "err") {
    return (
      <main className="fixed inset-0 z-[60] flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center text-zinc-100">
        <div className="text-sm font-medium text-rose-300">
          Could not open this handoff
        </div>
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-400">
          {handoffErrDetail ??
            "Generate a new QR from the dashboard AR tab (sign in required). Handoffs expire after about an hour."}
        </p>
        <button
          type="button"
          onClick={() => router.replace("/dashboard")}
          className="mt-6 rounded-full bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-950"
        >
          Open dashboard
        </button>
      </main>
    );
  }

  if (isEntered && isMobile) {
    return (
      <main className="fixed inset-0 z-[60] min-h-dvh bg-black text-zinc-100">
        {/* Keep WebGL/video above the sheet — full-screen canvas steals taps on some mobile browsers */}
        <div className="absolute inset-x-0 top-0 z-0 bottom-[max(13.5rem,min(46vh,27rem))]">
          {viewArjs ? (
            <ArJsMarkerView
              cad={cad}
              pcb={pcbProgressive}
              highlightRef={highlightRef}
              className="h-full w-full"
            />
          ) : viewWorld ? (
            <ArWorldArView
              cad={cad}
              pcb={pcbProgressive}
              highlightRef={highlightRef}
              onPickRef={onPickRef}
              className="h-full w-full"
              preRenderedStlBase64={preRenderedStlBase64}
              onIosArUi={
                isIosDevice ? setIosArUi : undefined
              }
              onIosQuickLookCta={
                isIosDevice ? goNextStep : undefined
              }
            />
          ) : (
            <CadThreeViewport
              cad={cad}
              showInner
              pcb={pcbProgressive}
              highlightRef={highlightRef}
              onPickRef={onPickRef}
              pcbBoardDetailed
              preRenderedStlBase64={preRenderedStlBase64}
            />
          )}
        </div>

        {/* Viewfinder corners (non-interactive) */}
        <div
          className="pointer-events-none absolute inset-3 z-10 rounded-[1.25rem] border border-white/20 sm:inset-4"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-5 z-10 rounded-[1rem] border border-white/10 sm:inset-6"
          aria-hidden
        />

        {/* Top HUD: exit + how to connect / use */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-center justify-between gap-2 px-3">
            <button
              type="button"
              onClick={exitPreview}
              className="rounded-full border border-white/15 bg-black/55 px-3 py-2 text-xs font-medium text-zinc-100 backdrop-blur-md active:bg-white/10"
            >
              Exit
            </button>
            <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400 backdrop-blur-md">
              {viewArjs
                ? "Marker AR"
                : viewWorld && isIosDevice
                  ? "iPhone AR"
                  : viewWorld
                    ? "World AR"
                    : "Live preview"}
            </span>
            {viewArjs ? (
              <button
                type="button"
                onClick={() => setMarkerHelpOpen(true)}
                className="rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-1.5 text-[10px] font-medium text-sky-200 backdrop-blur-md active:bg-sky-500/25"
              >
                Marker
              </button>
            ) : (
              <span className="w-[52px]" aria-hidden />
            )}
          </div>

          <div className="pointer-events-auto mx-3 flex gap-2 rounded-2xl border border-white/12 bg-black/55 p-3 backdrop-blur-xl">
            <Info className="mt-0.5 size-4 shrink-0 text-sky-300/90" aria-hidden />
            <div className="min-w-0 text-[11px] leading-snug text-zinc-300">
              <p className="font-medium text-zinc-100">
                {viewArjs
                  ? "Marker-tracked (Hiro)"
                  : viewWorld && isIosDevice
                    ? "ARKit + steps here"
                    : viewWorld
                      ? "World AR"
                      : "Connect & navigate"}
              </p>
              <p className="mt-1 text-zinc-400">
                {viewArjs ? (
                  <>
                    Point this phone at a{" "}
                    <span className="text-zinc-200">Hiro</span> pattern (printed
                    or fullscreen on another screen—tap{" "}
                    <span className="text-zinc-200">Marker</span> above). When it
                    locks on, your board tracks in the real world. Use{" "}
                    <span className="text-zinc-200">Next</span> for assembly steps.
                  </>
                ) : viewWorld && isIosDevice ? (
                  <>
                    Use <span className="text-zinc-200">Next / Back</span> for the
                    real assembly order.{" "}
                    <span className="text-zinc-200">View this step in AR</span>{" "}
                    exports only the current step. The board fills in as you move
                    forward.
                  </>
                ) : viewWorld ? (
                  <>
                    WebXR or camera preview on this device. For{" "}
                    <span className="text-zinc-200">iPhone</span>, open this same
                    link in Safari to get ARKit + the assembly card.
                  </>
                ) : (
                  <>
                    Use the <span className="text-zinc-200">same HTTPS URL</span>{" "}
                    as your dashboard (or tunnel). One finger drags to orbit;
                    pinch to zoom. When a part glows, tap it to sync the step or
                    use <span className="text-zinc-200">Next</span> below.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom overlay: assembly guide only in this session (mobile) */}
        {steps.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[40] max-h-[52vh] pb-[max(1rem,env(safe-area-inset-bottom))] px-3">
            <div className="pointer-events-auto overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-[#070709]/80 shadow-[0_-8px_50px_rgba(0,0,0,0.7)] backdrop-blur-3xl ring-1 ring-white/[0.02]">
              <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading text-[11px] font-semibold tracking-[0.14em] text-zinc-400 uppercase">
                    Assembly guide
                  </span>
                  <span
                    className="text-[11px] font-medium tabular-nums text-sky-400"
                    key={activeStep}
                  >
                    Step {activeStep + 1} / {steps.length}
                  </span>
                </div>
                <div className="mt-2 flex gap-1">
                  {steps.map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1 flex-1 rounded-full transition-colors",
                        i === activeStep ? "bg-sky-400" : "bg-zinc-700",
                      )}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
              <div className="max-h-[min(32vh,280px)] overflow-y-auto px-5 py-4">
                <h2 className="font-heading text-base font-semibold leading-snug text-zinc-50">
                  {current?.title ?? "Assembly"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {current?.instruction ??
                    "Use Next for bench steps; tap highlighted parts when shown."}
                </p>
                {highlightRef ? (
                  <div className="mt-3 inline-flex items-center rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 font-mono text-xs font-semibold text-sky-400">
                    {highlightRef}
                  </div>
                ) : null}
                {pcbNotice ? (
                  <p className="mt-3 text-[11px] leading-snug text-zinc-500">{pcbNotice}</p>
                ) : null}
              </div>
              {viewWorld && isIosDevice && iosArUi ? (
                <div className="border-t border-white/[0.08] bg-emerald-500/10 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300/95">
                    Quick Look — this step only
                  </p>
                  <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                    Matches step {activeStep + 1}: placed parts + highlight. Leave
                    AR, then Next/Prev, then open again.
                  </p>
                  <button
                    type="button"
                    disabled={iosArUi.busy}
                    onClick={() => void openCurrentStepInQuickLook()}
                    className="mt-2 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-emerald-950 shadow-[0_8px_28px_rgba(16,185,129,0.35)] active:bg-emerald-400 disabled:opacity-45"
                  >
                    {iosArUi.busy ? "Preparing AR…" : "View this step in AR"}
                  </button>
                  {iosArUi.quickLookHostWarning ? (
                    <p className="mt-2 text-center text-[11px] leading-snug text-amber-200/90">
                      {iosArUi.quickLookHostWarning}
                    </p>
                  ) : null}
                  {iosArUi.error ? (
                    <p className="mt-2 text-center text-[11px] leading-snug text-rose-300">
                      {iosArUi.error}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-center gap-3 border-t border-white/[0.06] bg-white/[0.01] px-4 py-4">
                <button
                  type="button"
                  onClick={() => setActiveStep((i) => Math.max(0, i - 1))}
                  disabled={activeStep <= 0}
                  className="min-h-[48px] min-w-[88px] rounded-[1rem] border border-white/[0.1] bg-white/[0.03] text-sm font-medium text-zinc-200 transition-colors active:bg-white/[0.08] disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={goNextStep}
                  className="min-h-[48px] flex-1 rounded-[1rem] bg-zinc-100 text-sm font-bold text-zinc-900 shadow-[0_4px_16px_rgba(255,255,255,0.15)] transition-transform active:scale-[0.98] active:bg-white"
                >
                  {isLastStep ? "Start over" : "Next"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {viewArjs && markerHelpOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Fullscreen Hiro marker"
            className="fixed inset-0 z-[80] flex cursor-pointer flex-col items-center justify-center gap-4 bg-white p-6 text-center text-zinc-900"
            onClick={() => setMarkerHelpOpen(false)}
          >
            <p className="max-w-xs text-xs font-medium leading-snug">
              Tap to close — point the AR phone here. Turn screen brightness up.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={HIRO_MARKER_IMAGE_URL}
              alt=""
              className="pointer-events-none max-h-[min(78vh,520px)] w-auto max-w-full object-contain"
            />
          </div>
        ) : null}
      </main>
    );
  }

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
            AR preview
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
                  AR bring-up preview
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  Use Web 3D to preview your current enclosure live. Scan from
                  the dashboard or open this URL directly on your device.
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
                      {sceneLabel} scene
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                      When you enter, we’ll show a live 3D view of your
                      enclosure in a phone-style viewport.
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
                    <p className="mt-3 text-xs text-zinc-500">
                      <Link
                        href={`/ar?${buildArQuery({
                          slug,
                          handoffId,
                          view: toggledView,
                        })}`}
                        className="text-sky-400 underline-offset-2 hover:underline"
                      >
                        {viewArjs
                          ? handoffId
                            ? "Switch to markerless camera + gyro AR"
                            : "Switch to WebGL orbit preview"
                          : "Switch to Hiro marker AR mode"}
                      </Link>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <div className="flex size-11 items-center justify-center rounded-2xl border border-white/[0.10] bg-white/[0.04] text-zinc-200">
                    <QrCode className="size-5" />
                  </div>
                  <div className="text-center text-xs leading-relaxed text-zinc-500">
                    QR opens this page.
                    <br />
                    Enter preview inside for Web 3D.
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
                      Camera-style 3D view
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-zinc-100">
                      AR previewing: {sceneLabel}
                    </h2>
                    <p className="mt-2 hidden text-sm text-zinc-500 md:block">
                      Step-by-step assembly with Next/Back lives on{" "}
                      <span className="text-zinc-300">phones</span> in this preview.
                      Open the same URL on your device and tap Enter AR preview.
                    </p>

                    <motion.div
                      initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="mt-4 aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/[0.10] bg-black/60"
                    >
                      <div className="relative h-full w-full">
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:28px_28px]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.18),transparent_65%)]" />
                        <div className="absolute inset-[10%] rounded-[1.4rem] border border-white/15 bg-black/60 shadow-[0_30px_80px_rgba(0,0,0,0.75)]">
                          <div className="absolute inset-2 rounded-[1.1rem] border border-white/8" />
                          <div className="relative h-full w-full overflow-hidden rounded-[1.4rem]">
                            <CadThreeViewport
                              cad={cad}
                              showInner
                              pcb={pcbProgressive}
                              highlightRef={highlightRef}
                              onPickRef={onPickRef}
                              preRenderedStlBase64={preRenderedStlBase64}
                            />
                          </div>
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-[1.4rem] bg-gradient-to-t from-black/65 to-transparent" />
                        </div>
                        <div className="pointer-events-none absolute inset-0">
                          <div className="absolute inset-x-10 top-8 flex justify-between text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">
                            <span>3D shell</span>
                            <span>Web 3D preview</span>
                          </div>
                          <div className="absolute inset-x-[18%] top-[18%] h-[2px] rounded-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-80" />
                        </div>
                      </div>
                    </motion.div>

                    <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-[11px] text-zinc-400">
                      Orbit to inspect the enclosure and board. Tap highlighted
                      parts when the guide is on mobile.
                      {pcbNotice ? (
                        <span className="ml-2 text-zinc-500">{pcbNotice}</span>
                      ) : null}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={exitPreview}
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

function ArFallback() {
  return (
    <main className="min-h-screen bg-[#070709] text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 pt-[calc(3.5rem+env(safe-area-inset-top)+2rem)] pb-16 sm:px-6 md:pb-20">
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-6 backdrop-blur-md sm:p-7">
          <p className="text-sm text-zinc-500">Loading AR preview…</p>
        </div>
      </div>
    </main>
  );
}

export default function ArPage() {
  return (
    <Suspense fallback={<ArFallback />}>
      <ArInner />
    </Suspense>
  );
}

