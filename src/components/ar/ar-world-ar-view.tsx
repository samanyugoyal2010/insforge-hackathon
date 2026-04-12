"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { flushSync } from "react-dom";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import {
  XR,
  createXRStore,
  useXRHitTest,
  IfInSessionMode,
  XRDomOverlay,
  useXR,
  useXRSessionModeSupported,
} from "@react-three/xr";
import type { CadDocument } from "@/lib/cad-document";
import { documentToSyntheticShell } from "@/lib/cad-document";
import type { ArPcbScene } from "@/lib/ar-pcb";
import {
  CadArWorkspaceContent,
  CadArWorkspaceLights,
  CadThreeViewport,
} from "@/components/renderers/cad-three-viewport";
import { ArPassthroughWorldView } from "@/components/ar/ar-passthrough-world-view";
import { cn } from "@/lib/utils";
import { isLikelyIosClient } from "@/lib/is-ios-client";

const MM = 0.001;

const PIXEL_IMG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Native AR Quick Look bottom banner (URL hash on the .usdz link). See Apple’s “Adding an Apple Pay Button or a Custom Action in AR Quick Look”. */
export type IosQuickLookBanner = {
  checkoutTitle?: string;
  checkoutSubtitle?: string;
  /** Single native action button label (e.g. “Next step”). */
  callToAction?: string;
};

export type OpenAppleArOptions = {
  banner?: IosQuickLookBanner | null;
  /** PCB ref emissive highlight in this USDZ export. */
  exportHighlightRef?: string | null;
  /** Cutaway / inner subtract ghosts on the enclosure mesh (off = shell-only look). */
  exportShowInner?: boolean;
};

export type IosQuickLookUiControl = {
  openAppleAr: (options?: OpenAppleArOptions | null) => Promise<void>;
  busy: boolean;
  error: string | null;
  /** Set when hosted .usdz upload failed but Quick Look still opened via blob fallback. */
  quickLookHostWarning?: string | null;
};

const QUICKLOOK_TAP = "_apple_ar_quicklook_button_tapped";

function modelHrefWithQuickLookBanner(
  blobUrl: string,
  banner?: IosQuickLookBanner | null,
) {
  if (!banner) return blobUrl;
  const parts: string[] = [];
  if (banner.callToAction?.trim()) {
    parts.push(`callToAction=${encodeURIComponent(banner.callToAction.trim())}`);
  }
  if (banner.checkoutTitle?.trim()) {
    parts.push(`checkoutTitle=${encodeURIComponent(banner.checkoutTitle.trim())}`);
  }
  if (banner.checkoutSubtitle?.trim()) {
    parts.push(
      `checkoutSubtitle=${encodeURIComponent(banner.checkoutSubtitle.trim())}`,
    );
  }
  if (parts.length === 0) return blobUrl;
  return `${blobUrl}#${parts.join("&")}`;
}

/** USDZExporter chokes on drei `<Edges />` line geometry — strip before export. */
function stripLineObjects(root: THREE.Object3D) {
  const remove: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (
      o instanceof THREE.Line ||
      o instanceof THREE.LineSegments ||
      o instanceof THREE.LineLoop
    ) {
      remove.push(o);
    }
  });
  for (const o of remove) {
    o.parent?.remove(o);
  }
  return root;
}

function UsdzExportCanvas({
  cad,
  pcb,
  rootRef,
  highlightRef,
  showInner,
}: {
  cad: CadDocument;
  pcb: ArPcbScene | null;
  rootRef: MutableRefObject<THREE.Group | null>;
  highlightRef: string | null;
  showInner: boolean;
}) {
  // Assign from inside the R3F reconciler: parent useLayoutEffect runs before the
  // Canvas commits the THREE.Group, so exportRootRef stayed null and AR never worked.
  const onExportRootRef = useCallback(
    (node: THREE.Group | null) => {
      rootRef.current = node;
    },
    [rootRef],
  );

  return (
    <Canvas
      className="pointer-events-none touch-none"
      style={{
        position: "absolute",
        width: 320,
        height: 320,
        left: -9999,
        top: 0,
        opacity: 0,
      }}
      gl={{ antialias: true, localClippingEnabled: true }}
      camera={{ position: [0.28, 0.22, 0.28], fov: 42 }}
      dpr={1}
    >
      <Suspense fallback={null}>
        <CadArWorkspaceLights forWebXr />
      </Suspense>
      <group ref={onExportRootRef}>
        <Suspense fallback={null}>
          <CadArWorkspaceContent
            cad={cad}
            showInner={showInner}
            pcb={pcb}
            highlightRef={highlightRef}
            pcbBoardDetailed
          />
        </Suspense>
      </group>
    </Canvas>
  );
}

/** iPhone/iPad: ARKit via Quick Look (USDZ). Instructions stay on this page (assembly sheet). */
function ArIosQuickLookView({
  cad,
  pcb,
  highlightRef,
  onPickRef,
  className,
  preRenderedStlBase64,
  onIosArUi,
  hideFloatingArButton,
  onQuickLookCtaTap,
}: {
  cad: CadDocument;
  pcb: ArPcbScene | null;
  highlightRef: string | null;
  onPickRef?: (ref: string) => void;
  className?: string;
  preRenderedStlBase64?: string | null;
  onIosArUi?: (api: IosQuickLookUiControl | null) => void;
  hideFloatingArButton?: boolean;
  /** Fired when the user taps Apple’s native banner button in Quick Look (iOS 13.3+). */
  onQuickLookCtaTap?: () => void;
}) {
  const exportRootRef = useRef<THREE.Group | null>(null);
  const [usdExportHighlight, setUsdExportHighlight] = useState<string | null>(null);
  const [usdExportShowInner, setUsdExportShowInner] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [quickLookHostWarning, setQuickLookHostWarning] = useState<
    string | null
  >(null);

  const waitForExportFrame = useCallback(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
    [],
  );

  const openAppleAr = useCallback(
    async (options?: OpenAppleArOptions | null) => {
      const banner = options?.banner ?? undefined;
      const exportHighlightRef = options?.exportHighlightRef ?? null;
      const exportShowInner = options?.exportShowInner ?? true;
      setErr(null);
      setQuickLookHostWarning(null);
      setBusy(true);
      flushSync(() => {
        setUsdExportHighlight(exportHighlightRef);
        setUsdExportShowInner(exportShowInner);
      });
      await waitForExportFrame();
      const src = exportRootRef.current;
      if (!src) {
        setUsdExportHighlight(null);
        setUsdExportShowInner(true);
        setErr("Model is still loading — try again in a second.");
        setBusy(false);
        return;
      }
      try {
        const clone = stripLineObjects(src.clone(true));
        const exporter = new USDZExporter();
        const buffer = await exporter.parseAsync(clone, {
          quickLookCompatible: true,
          includeAnchoringProperties: true,
          ar: {
            anchoring: { type: "plane" },
            planeAnchoring: { alignment: "horizontal" },
          },
        });
        const blob = new Blob([buffer], { type: "model/vnd.usdz+zip" });

        // iOS often ignores #callToAction / checkout banner on blob: URLs (no “.usdz” path).
        // Hosting on Supabase public storage yields a real https://…/file.usdz URL Apple parses.
        let modelUrl: string | undefined;
        let blobUrlToRevoke: string | null = null;
        let hostWarning: string | null = null;
        try {
          const uploadRes = await fetch(
            new URL("/api/ar-quicklook-usdz", window.location.origin).href,
            {
              method: "POST",
              headers: { "Content-Type": "model/vnd.usdz+zip" },
              body: blob,
            },
          );
          const raw = await uploadRes.text().catch(() => "");
          type UploadJson = { url?: string; error?: string; code?: string };
          let parsed: UploadJson | null = null;
          try {
            parsed = raw ? (JSON.parse(raw) as UploadJson) : null;
          } catch {
            parsed = null;
          }
          if (uploadRes.ok && parsed?.url && /^https?:\/\//i.test(parsed.url)) {
            modelUrl = parsed.url;
          }
          // Blob URL fallback works fine — no need to warn the user about hosting.
        } catch {
          // Network error on hosting upload is fine — blob URL fallback handles it.
        }
        setQuickLookHostWarning(hostWarning);
        if (!modelUrl) {
          blobUrlToRevoke = URL.createObjectURL(blob);
          modelUrl = blobUrlToRevoke;
        }

        const href = modelHrefWithQuickLookBanner(modelUrl, banner);
        const a = document.createElement("a");
        a.setAttribute("rel", "ar");
        a.href = href;
        const img = document.createElement("img");
        img.width = 1;
        img.height = 1;
        img.src = PIXEL_IMG;
        img.alt = "";
        a.appendChild(img);

        const onAnchorMessage = (ev: Event) => {
          const msg = ev as MessageEvent;
          if (msg.data === QUICKLOOK_TAP) onQuickLookCtaTap?.();
        };
        a.addEventListener("message", onAnchorMessage as EventListener, false);

        document.body.appendChild(a);
        a.click();
        window.setTimeout(() => {
          a.removeEventListener("message", onAnchorMessage as EventListener, false);
          document.body.removeChild(a);
          if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
        }, 180_000);
      } catch (e) {
        setErr(
          e instanceof Error
            ? e.message
            : "Could not build AR file. Try a simpler enclosure.",
        );
      } finally {
        setUsdExportHighlight(null);
        setUsdExportShowInner(true);
        setBusy(false);
      }
    },
    [onQuickLookCtaTap, waitForExportFrame],
  );

  useEffect(() => {
    if (!onIosArUi) return;
    onIosArUi({
      openAppleAr,
      busy,
      error: err,
      quickLookHostWarning,
    });
  }, [onIosArUi, openAppleAr, busy, err, quickLookHostWarning]);

  useEffect(() => {
    return () => {
      onIosArUi?.(null);
    };
  }, [onIosArUi]);

  return (
    <div className={cn("relative h-full w-full bg-black", className)}>
      <CadThreeViewport
        cad={cad}
        showInner
        pcb={pcb}
        highlightRef={highlightRef}
        onPickRef={onPickRef}
        pcbBoardDetailed
        preRenderedStlBase64={preRenderedStlBase64}
      />
      <UsdzExportCanvas
        cad={cad}
        pcb={pcb}
        rootRef={exportRootRef}
        highlightRef={usdExportHighlight}
        showInner={usdExportShowInner}
      />
      {!hideFloatingArButton ? (
        <div className="pointer-events-auto absolute right-3 top-[min(22%,160px)] z-[35] flex max-w-[11rem] flex-col items-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void openAppleAr()}
            className="rounded-full bg-sky-500 px-3 py-2 text-center text-[11px] font-bold leading-tight text-sky-950 shadow-lg disabled:opacity-50"
          >
            {busy ? "Preparing AR…" : "Open in Apple AR"}
          </button>
          <p className="rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[9px] leading-snug text-zinc-400 backdrop-blur-sm">
            ARKit Quick Look — then return here for steps.
          </p>
        </div>
      ) : null}
      {!hideFloatingArButton && err ? (
        <div className="pointer-events-auto absolute left-3 right-3 top-[min(38%,200px)] z-[35] rounded-lg border border-rose-500/30 bg-black/80 px-2 py-1.5 text-center text-[10px] text-rose-200">
          {err}
        </div>
      ) : null}
    </div>
  );
}

function SessionSync({
  onChange,
}: {
  onChange: (s: XRSession | undefined) => void;
}) {
  const session = useXR((x) => x.session);
  useEffect(() => {
    onChange(session);
  }, [session, onChange]);
  return null;
}

function HitAnchoredModel({
  cad,
  showInner,
  pcb,
  highlightRef,
  onPickRef,
  placed,
  arScale,
  onHasSurfaceHit,
  sessionActive,
  preRenderedStlBase64,
}: {
  cad: CadDocument;
  showInner: boolean;
  pcb: ArPcbScene | null;
  highlightRef: string | null;
  onPickRef?: (ref: string) => void;
  placed: boolean;
  arScale: number;
  onHasSurfaceHit: (v: boolean) => void;
  sessionActive: boolean;
  preRenderedStlBase64?: string | null;
}) {
  const anchorRef = useRef<THREE.Group>(null);
  const mat = useRef(new THREE.Matrix4());
  const pos = useRef(new THREE.Vector3());
  const quat = useRef(new THREE.Quaternion());
  const scl = useRef(new THREE.Vector3());
  const [hasHit, setHasHit] = useState(false);
  const hitReportedRef = useRef(false);

  useEffect(() => {
    if (!sessionActive) {
      setHasHit(false);
      hitReportedRef.current = false;
    }
  }, [sessionActive]);

  useXRHitTest(
    (results, getWorldMatrix) => {
      if (placed) return;
      const g = anchorRef.current;
      if (!g || results.length === 0) {
        return;
      }
      if (!hitReportedRef.current) {
        hitReportedRef.current = true;
        setHasHit(true);
        onHasSurfaceHit(true);
      }
      getWorldMatrix(mat.current, results[0]);
      mat.current.decompose(pos.current, quat.current, scl.current);
      g.position.copy(pos.current);
      g.quaternion.copy(quat.current);
      g.scale.setScalar(arScale);
    },
    "viewer",
    ["plane", "point"],
  );

  return (
    <group ref={anchorRef} visible={hasHit || placed}>
      <CadArWorkspaceContent
        cad={cad}
        showInner={showInner}
        pcb={pcb}
        highlightRef={highlightRef}
        onPickRef={onPickRef}
        pcbBoardDetailed
        preRenderedStlBase64={preRenderedStlBase64}
      />
    </group>
  );
}

function WebXrArHud({
  placed,
  setPlaced,
  hasHit,
}: {
  placed: boolean;
  setPlaced: (v: boolean) => void;
  hasHit: boolean;
}) {
  const session = useXR((x) => x.session);

  return (
    <XRDomOverlay
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-[100] flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white"
      style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}
    >
      <p className="text-center text-[11px] leading-snug text-zinc-300">
        {!hasHit
          ? "Aim at a table or floor and move slowly — a surface lock appears when tracking is ready."
          : placed
            ? "Model is pinned in the world. Use the system pointer to tap glowing parts."
            : "When the model lines up with your surface, tap Pin model."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          disabled={!hasHit}
          onClick={() => setPlaced(true)}
          className="rounded-full bg-sky-500 px-4 py-2.5 text-sm font-semibold text-sky-950 disabled:opacity-40"
        >
          Pin model
        </button>
        <button
          type="button"
          onClick={() => setPlaced(false)}
          className="rounded-full border border-white/25 bg-black/40 px-4 py-2.5 text-sm text-zinc-100"
        >
          Track surface
        </button>
        <button
          type="button"
          onClick={() => session?.end()}
          className="rounded-full border border-white/20 px-4 py-2.5 text-sm text-zinc-300"
        >
          Exit AR
        </button>
      </div>
    </XRDomOverlay>
  );
}

function WebXrCanvasInner({
  store,
  cad,
  pcb,
  highlightRef,
  onPickRef,
  onSession,
  sessionActive,
  preRenderedStlBase64,
}: {
  store: ReturnType<typeof createXRStore>;
  cad: CadDocument;
  pcb: ArPcbScene | null;
  highlightRef: string | null;
  onPickRef?: (ref: string) => void;
  onSession: (s: XRSession | undefined) => void;
  sessionActive: boolean;
  preRenderedStlBase64?: string | null;
}) {
  const [placed, setPlaced] = useState(false);
  const [hasSurfaceHit, setHasSurfaceHit] = useState(false);
  const arScale = useMemo(() => {
    const s = documentToSyntheticShell(cad);
    const maxMm = Math.max(12, s.widthMm, s.heightMm, s.lengthMm);
    const maxM = maxMm * MM;
    return Math.max(0.75, Math.min(2.5, 1.15 / Math.max(maxM, 0.04)));
  }, [cad]);

  useEffect(() => {
    if (!sessionActive) {
      setPlaced(false);
      setHasSurfaceHit(false);
    }
  }, [sessionActive]);

  return (
    <XR store={store}>
      <SessionSync onChange={onSession} />
      <CadArWorkspaceLights forWebXr />
      <IfInSessionMode allow="immersive-ar">
        <HitAnchoredModel
          cad={cad}
          showInner
          pcb={pcb}
          highlightRef={highlightRef}
          onPickRef={onPickRef}
          placed={placed}
          arScale={arScale}
          onHasSurfaceHit={setHasSurfaceHit}
          sessionActive={sessionActive}
          preRenderedStlBase64={preRenderedStlBase64}
        />
        <WebXrArHud
          placed={placed}
          setPlaced={setPlaced}
          hasHit={hasSurfaceHit}
        />
      </IfInSessionMode>
    </XR>
  );
}

function ArWebXrPlatformInner({
  cad,
  pcb,
  highlightRef,
  onPickRef,
  className,
  preRenderedStlBase64,
}: {
  cad: CadDocument;
  pcb: ArPcbScene | null;
  highlightRef: string | null;
  onPickRef?: (ref: string) => void;
  className?: string;
  preRenderedStlBase64?: string | null;
}) {
  const store = useMemo(
    () =>
      createXRStore({
        emulate: false,
        hand: false,
        controller: false,
        gaze: false,
        hitTest: true,
        planeDetection: true,
        anchors: false,
        meshDetection: false,
        depthSensing: false,
        domOverlay: true,
      }),
    [],
  );

  const [session, setSession] = useState<XRSession | undefined>();
  const onSession = useCallback((s: XRSession | undefined) => setSession(s), []);
  const [enterErr, setEnterErr] = useState<string | null>(null);

  const onEnter = useCallback(async () => {
    setEnterErr(null);
    try {
      await store.enterAR();
    } catch (e) {
      setEnterErr(e instanceof Error ? e.message : "Could not start AR");
    }
  }, [store]);

  return (
    <div className={cn("relative h-full w-full bg-black", className)}>
      <Canvas
        className="absolute inset-0"
        gl={{
          antialias: true,
          alpha: true,
          localClippingEnabled: true,
        }}
        camera={{ position: [0, 1.4, 0.6], fov: 50 }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <WebXrCanvasInner
            store={store}
            cad={cad}
            pcb={pcb}
            highlightRef={highlightRef}
            onPickRef={onPickRef}
            onSession={onSession}
            sessionActive={!!session}
            preRenderedStlBase64={preRenderedStlBase64}
          />
        </Suspense>
      </Canvas>
      {!session ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/75 px-6 text-center">
          <p className="max-w-xs text-sm font-medium text-zinc-100">
            Platform AR (WebXR)
          </p>
          <p className="max-w-xs text-xs text-zinc-400">
            Uses iPhone Safari ARKit via WebXR (HTTPS required). After entering,
            scan the room briefly, then pin the model to a surface.
          </p>
          {enterErr ? (
            <p className="max-w-xs text-xs text-rose-300">{enterErr}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void onEnter()}
            className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-sky-950"
          >
            Enter AR
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * iPhone/iPad first: AR Quick Look (no WebXR on Safari).
 * Else WebXR immersive-ar, else camera overlay.
 */
export function ArWorldArView({
  cad,
  pcb,
  highlightRef,
  onPickRef,
  className,
  preRenderedStlBase64,
  onIosArUi,
  onIosQuickLookCta,
}: {
  cad: CadDocument;
  pcb: ArPcbScene | null;
  highlightRef: string | null;
  onPickRef?: (ref: string) => void;
  className?: string;
  preRenderedStlBase64?: string | null;
  onIosArUi?: (api: IosQuickLookUiControl | null) => void;
  /** Called when the user taps the native Quick Look banner action (if `callToAction` was set on open). */
  onIosQuickLookCta?: () => void;
}) {
  const ios = useMemo(() => isLikelyIosClient(), []);
  const supported = useXRSessionModeSupported("immersive-ar");

  useEffect(() => {
    if (!ios && onIosArUi) onIosArUi(null);
  }, [ios, onIosArUi]);

  if (ios) {
    return (
      <ArIosQuickLookView
        cad={cad}
        pcb={pcb}
        highlightRef={highlightRef}
        onPickRef={onPickRef}
        className={className}
        preRenderedStlBase64={preRenderedStlBase64}
        onIosArUi={onIosArUi}
        hideFloatingArButton={Boolean(onIosArUi)}
        onQuickLookCtaTap={onIosQuickLookCta}
      />
    );
  }

  if (supported === undefined) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-black text-zinc-400",
          className,
        )}
      >
        <p className="text-xs">Checking AR support…</p>
      </div>
    );
  }

  if (supported) {
    return (
      <ArWebXrPlatformInner
        cad={cad}
        pcb={pcb}
        highlightRef={highlightRef}
        onPickRef={onPickRef}
        className={className}
        preRenderedStlBase64={preRenderedStlBase64}
      />
    );
  }

  return (
    <ArPassthroughWorldView
      cad={cad}
      pcb={pcb}
      highlightRef={highlightRef}
      onPickRef={onPickRef}
      className={className}
      preRenderedStlBase64={preRenderedStlBase64}
    />
  );
}
