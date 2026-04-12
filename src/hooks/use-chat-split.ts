"use client";

import * as React from "react";

const STORAGE_KEY = "node0-chat-width-pct";

type Options = {
  defaultPct?: number;
  minPct?: number;
  maxPct?: number;
};

export function useChatSplitWidth({
  defaultPct = 28,
  minPct = 18,
  maxPct = 52,
}: Options = {}) {
  const [pct, setPct] = React.useState(defaultPct);
  const [dragging, setDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const startX = React.useRef(0);
  const startPct = React.useRef(defaultPct);
  const pctRef = React.useRef(pct);
  React.useEffect(() => {
    pctRef.current = pct;
  }, [pct]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const n = raw ? parseFloat(raw) : NaN;
      if (!Number.isNaN(n) && n >= minPct && n <= maxPct) {
        setPct(n);
        startPct.current = n;
      }
    } catch {
      /* ignore */
    }
  }, [minPct, maxPct]);

  const persist = React.useCallback((p: number) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, String(Math.round(p * 10) / 10));
    } catch {
      /* ignore */
    }
  }, []);

  const setChatWidthPct = React.useCallback(
    (nextPct: number) => {
      const clamped = Math.min(maxPct, Math.max(minPct, nextPct));
      setPct(clamped);
      persist(clamped);
    },
    [maxPct, minPct, persist],
  );

  const onResizeKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (dragging) return;
      const isLeft = e.key === "ArrowLeft";
      const isRight = e.key === "ArrowRight";
      if (!isLeft && !isRight && e.key !== "Home" && e.key !== "End") return;

      e.preventDefault();

      if (e.key === "Home") {
        setChatWidthPct(minPct);
        return;
      }
      if (e.key === "End") {
        setChatWidthPct(maxPct);
        return;
      }

      const step = e.shiftKey ? 4 : 2;
      const base = pctRef.current;
      setChatWidthPct(base + (isRight ? step : -step));
    },
    [dragging, maxPct, minPct, setChatWidthPct],
  );

  React.useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      if (w < 1) return;
      const deltaPct = ((e.clientX - startX.current) / w) * 100;
      const next = Math.min(
        maxPct,
        Math.max(minPct, startPct.current + deltaPct),
      );
      setPct(next);
    };

    const onUp = () => {
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persist(pctRef.current);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, maxPct, minPct, persist]);

  const onResizePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startX.current = e.clientX;
      startPct.current = pctRef.current;
      setDragging(true);
    },
    [],
  );

  return {
    containerRef,
    chatWidthPct: pct,
    onResizePointerDown,
    isDragging: dragging,
    onResizeKeyDown,
    setChatWidthPct,
  };
}
