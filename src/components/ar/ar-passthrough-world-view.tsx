"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CadThreeViewport } from "@/components/renderers/cad-three-viewport";
import type { CadDocument } from "@/lib/cad-document";
import type { ArPcbScene } from "@/lib/ar-pcb";
import { cn } from "@/lib/utils";

type ArPassthroughWorldViewProps = {
  cad: CadDocument;
  pcb: ArPcbScene | null;
  highlightRef: string | null;
  onPickRef?: (ref: string) => void;
  className?: string;
  preRenderedStlBase64?: string | null;
};

function iosMotionPermissionNeeded() {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  const DO = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  return typeof DO.requestPermission === "function";
}

export function ArPassthroughWorldView({
  cad,
  pcb,
  highlightRef,
  onPickRef,
  className,
  preRenderedStlBase64,
}: ArPassthroughWorldViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [gyroEnabled, setGyroEnabled] = useState(() => !iosMotionPermissionNeeded());
  const [needsMotionTap, setNeedsMotionTap] = useState(iosMotionPermissionNeeded);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let stream: MediaStream | null = null;
    setCamError(null);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        v.srcObject = stream;
        await v.play().catch(() => {});
      } catch {
        setCamError("Camera unavailable — check permissions and HTTPS.");
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    };
  }, []);

  const enableMotion = useCallback(async () => {
    try {
      const DO = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (typeof DO.requestPermission === "function") {
        const r = await DO.requestPermission();
        setGyroEnabled(r === "granted");
      } else {
        setGyroEnabled(true);
      }
    } catch {
      setGyroEnabled(false);
    }
    setNeedsMotionTap(false);
  }, []);

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-black", className)}>
      <video
        ref={videoRef}
        className="absolute inset-0 z-0 h-full w-full object-cover"
        playsInline
        muted
        autoPlay
        aria-hidden
      />
      <div className="absolute inset-0 z-[1]">
        <CadThreeViewport
          cad={cad}
          showInner
          pcb={pcb}
          highlightRef={highlightRef}
          onPickRef={onPickRef}
          variant="arPassthrough"
          useDeviceOrientation={gyroEnabled}
          preRenderedStlBase64={preRenderedStlBase64}
        />
      </div>

      {camError ? (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center px-4">
          <p className="rounded-full border border-amber-500/30 bg-black/70 px-3 py-1.5 text-center text-[11px] text-amber-100/90 backdrop-blur-md">
            {camError}
          </p>
        </div>
      ) : null}

      {needsMotionTap && !gyroEnabled ? (
        <div className="absolute inset-x-0 top-[min(32%,220px)] z-[35] flex justify-center px-4">
          <button
            type="button"
            onClick={() => void enableMotion()}
            className="rounded-full border border-sky-500/50 bg-sky-500/20 px-4 py-2.5 text-xs font-semibold text-sky-100 shadow-lg backdrop-blur-md active:bg-sky-500/35"
          >
            Enable motion (gyro) for markerless AR
          </button>
        </div>
      ) : null}
    </div>
  );
}
