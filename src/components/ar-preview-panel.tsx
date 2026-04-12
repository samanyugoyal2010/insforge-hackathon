"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { sanitizeExportSlug } from "@/lib/download-json";
import { cn } from "@/lib/utils";
import { useClientOrigin } from "@/hooks/use-client-origin";
import type { CadDocument } from "@/lib/cad-document";
import Image from "next/image";
import { ExternalLink, RefreshCw, Smartphone } from "lucide-react";
import {
  getSession,
  hydrateAuthSession,
  refreshAuthSession,
} from "@/lib/supabase-auth";
import {
  gzipHandoffPayload,
  HANDOFF_GZIP_CONTENT_TYPE,
} from "@/lib/ar-handoff-transport";
import { HIRO_MARKER_IMAGE_URL } from "@/lib/ar-hiro-marker";

type ArPreviewPanelProps = {
  projectId: string | null;
  projectName?: string | null;
  cad: CadDocument;
  circuitron: unknown | null;
  /** When true, QR opens Hiro marker AR (`view=arjs`). Default: markerless world AR (`view=world`). */
  qrDefaultMarkerAr?: boolean;
  className?: string;
};

type ArHandoffLinkMode = "marker" | "world" | "orbit";

function buildArUrl(
  origin: string,
  handoffId: string,
  mode: ArHandoffLinkMode,
): string {
  const p = new URLSearchParams();
  p.set("h", handoffId);
  p.set("enter", "1");
  if (mode === "marker") p.set("view", "arjs");
  else if (mode === "world") p.set("view", "world");
  else p.set("view", "orbit");
  return `${origin}/ar?${p.toString()}`;
}

function qrImageSrc(targetUrl: string, px: number): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${px}x${px}&data=${encodeURIComponent(
    targetUrl,
  )}`;
}

type HandoffErrBody = { error?: string; error_code?: string } | null;

function mintFailureMessage(status: number, body: HandoffErrBody): string {
  if (status === 401) {
    if (body?.error_code === "no_token") {
      return "No login token was sent. Sign in from the home page, return to this tab, then tap Refresh QR.";
    }
    return "Session expired or not accepted by the server. Sign out and sign in again from the home page, then tap Refresh QR. If this persists, check that this app and the server use the same Supabase project (NEXT_PUBLIC_SUPABASE_URL / key).";
  }
  if (status === 413) {
    return (
      body?.error ??
      "Snapshot still too large for the server (even compressed)."
    );
  }
  return body?.error?.trim() || `Could not create handoff (HTTP ${status}).`;
}

type ArQrCardProps = {
  title: string;
  tag: string;
  linkUrl: string;
  qrPx: number;
  imageClass: string;
  shellClass: string;
  titleClass: string;
  tagClass: string;
  gapClass: string;
  imageAlt: string;
};

function ArQrCard({
  title,
  tag,
  linkUrl,
  qrPx,
  imageClass,
  shellClass,
  titleClass,
  tagClass,
  gapClass,
  imageAlt,
}: ArQrCardProps) {
  const src = linkUrl ? qrImageSrc(linkUrl, qrPx) : "";
  return (
    <div
      className={cn(
        "flex flex-col items-center border bg-black/25 shadow-lg backdrop-blur-sm",
        gapClass,
        shellClass,
      )}
    >
      <div className="w-full text-center">
        <p className={cn("font-heading font-semibold tracking-tight", titleClass)}>
          {title}
        </p>
        <p className={cn("mt-1 font-medium uppercase tracking-wider", tagClass)}>
          {tag}
        </p>
      </div>
      <div
        className={cn(
          "flex items-center justify-center rounded-lg bg-white p-1.5 shadow-inner",
          imageClass,
        )}
      >
        {src ? (
          <Image
            src={src}
            alt={imageAlt}
            width={qrPx}
            height={qrPx}
            className="rounded-md bg-white"
            unoptimized
          />
        ) : (
          <div
            className="flex items-center justify-center rounded-md bg-zinc-100 text-[10px] text-zinc-400"
            style={{ width: qrPx, height: qrPx }}
          >
            —
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 border-white/20 bg-white/5 text-[11px] text-zinc-200 hover:bg-white/10"
        disabled={!linkUrl}
        onClick={() => {
          if (linkUrl && navigator.clipboard) {
            navigator.clipboard.writeText(linkUrl).catch(() => {});
          }
        }}
      >
        <ExternalLink className="mr-1.5 size-3.5 opacity-80" />
        Copy URL
      </Button>
    </div>
  );
}

export function ArPreviewPanel({
  projectId,
  projectName,
  cad,
  circuitron,
  qrDefaultMarkerAr = false,
  className,
}: ArPreviewPanelProps) {
  const slug = sanitizeExportSlug(projectId ?? projectName ?? "demo");
  const origin = useClientOrigin();

  const [handoffId, setHandoffId] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const cadRef = useRef(cad);
  const circuitronRef = useRef(circuitron);
  cadRef.current = cad;
  circuitronRef.current = circuitron;

  const mint = useCallback(async () => {
    if (!projectId) return;
    setMinting(true);
    setMintError(null);
    try {
      await hydrateAuthSession();
      let session = await getSession();
      if (session?.refresh_token) {
        const refreshed = await refreshAuthSession();
        if (refreshed?.access_token) session = refreshed;
      }

      if (!session?.access_token) {
        setHandoffId(null);
        setMintError(
          "Sign in to generate QR codes, then tap Refresh QR.",
        );
        return;
      }
      const accessToken = session.access_token;
      const payload = {
        cad: cadRef.current,
        circuitron: circuitronRef.current ?? {},
      };
      let res: Response;
      try {
        const gz = await gzipHandoffPayload(payload);
        res = await fetch("/api/ar-handoff", {
          method: "POST",
          headers: {
            "Content-Type": HANDOFF_GZIP_CONTENT_TYPE,
            Authorization: `Bearer ${accessToken}`,
          },
          body: gz,
        });
      } catch {
        res = await fetch("/api/ar-handoff", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as HandoffErrBody;
        throw new Error(mintFailureMessage(res.status, j));
      }
      const data = (await res.json()) as { id?: string };
      if (!data.id) throw new Error("No handoff id returned");
      setHandoffId(data.id);
    } catch (e) {
      setHandoffId(null);
      setMintError(e instanceof Error ? e.message : "Could not create handoff");
    } finally {
      setMinting(false);
    }
  }, [projectId]);

  useEffect(() => {
    void mint();
  }, [mint]);

  const worldUrl = useMemo(() => {
    if (!origin || !handoffId) return "";
    return buildArUrl(origin, handoffId, "world");
  }, [origin, handoffId]);

  const orbitUrl = useMemo(() => {
    if (!origin || !handoffId) return "";
    return buildArUrl(origin, handoffId, "orbit");
  }, [origin, handoffId]);

  const markerUrl = useMemo(() => {
    if (!origin || !handoffId) return "";
    return buildArUrl(origin, handoffId, "marker");
  }, [origin, handoffId]);

  /** Featured = default entry; others ordered by visual size (large → medium → compact). */
  const primaryUrl = qrDefaultMarkerAr ? markerUrl : worldUrl;
  const mediumAltUrl = qrDefaultMarkerAr ? worldUrl : markerUrl;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto bg-[#070709] px-4 py-6 sm:px-6",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-2 text-center">
        <div className="flex size-10 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.04] text-zinc-200">
          <Smartphone className="size-5" />
        </div>
        <h2 className="font-heading text-base font-semibold text-zinc-100 sm:text-lg">
          AR handoff
        </h2>
        <p className="max-w-md text-xs leading-relaxed text-zinc-500">
          Scan the QR code to preview in AR.
        </p>
      </div>

      {qrDefaultMarkerAr ? (
        <div className="mx-auto w-full max-w-md rounded-xl border border-white/[0.1] bg-white p-3 shadow-lg">
          <p className="mb-2 text-center text-[11px] font-medium text-zinc-800">
            Hiro target — aim the AR phone here
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- external AR pattern */}
          <img
            src={HIRO_MARKER_IMAGE_URL}
            alt="Hiro marker pattern for AR.js"
            className="mx-auto h-auto w-full max-w-[280px] rounded-md border border-zinc-200"
          />
        </div>
      ) : null}

      {mintError ? (
        <div className="mx-auto w-full max-w-2xl rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-100/90">
          {mintError}{" "}
          <Link
            href="/"
            className="text-amber-200 underline decoration-amber-400/50 underline-offset-2"
          >
            Home
          </Link>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-2xl justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={minting || !projectId}
          onClick={() => void mint()}
          className="h-9 gap-2 border-zinc-600/90 bg-zinc-900 px-4 text-xs text-zinc-200"
        >
          <RefreshCw className={cn("size-3.5", minting && "animate-spin")} />
          {minting ? "Minting…" : "Refresh QR"}
        </Button>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-12 pb-6">
        <ArQrCard
          title={qrDefaultMarkerAr ? "Hiro marker AR" : "Markerless world AR"}
          tag="Primary"
          linkUrl={primaryUrl}
          qrPx={260}
          gapClass="gap-5 px-8 py-10 sm:px-10"
          shellClass="rounded-[1.75rem] border-2 border-emerald-500/40 ring-1 ring-emerald-400/15"
          titleClass="text-lg text-emerald-100 sm:text-xl"
          tagClass="text-[10px] text-emerald-400/90"
          imageClass="min-h-[268px] min-w-[268px]"
          imageAlt={`QR code: ${qrDefaultMarkerAr ? "Hiro marker AR" : "markerless world AR"}`}
        />
      </div>

      <p className="mx-auto max-w-md pb-4 text-center text-[10px] leading-relaxed text-zinc-600">
        Links expire in about an hour · same HTTPS host on phone · {slug}
      </p>
    </div>
  );
}
