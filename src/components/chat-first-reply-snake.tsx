"use client";

import * as React from "react";

/** Grid sized for the main workspace column (replaces CAD/PCB panel). */
const COLS = 24;
const ROWS = 14;
const TICK_MS = 115;
const MIN_CELL = 12;
const MAX_CELL = 56;

function randomFood(snake: { x: number; y: number }[]) {
  for (let n = 0; n < 600; n++) {
    const x = Math.floor(Math.random() * COLS);
    const y = Math.floor(Math.random() * ROWS);
    if (!snake.some((s) => s.x === x && s.y === y)) return { x, y };
  }
  return { x: 0, y: 0 };
}

/**
 * Fills the project tool column (same slot as CAD/PCB) while waiting for the first reply.
 */
export function ChatFirstReplySnake() {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const cellPxRef = React.useRef(MIN_CELL);
  const dirRef = React.useRef({ x: 1, y: 0 });
  const snakeRef = React.useRef<{ x: number; y: number }[]>([
    { x: 6, y: 7 },
    { x: 5, y: 7 },
    { x: 4, y: 7 },
  ]);
  const foodRef = React.useRef(randomFood(snakeRef.current));
  const drawRef = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const layout = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 24 || h < 24) return;
      const cellW = Math.floor(w / COLS);
      const cellH = Math.floor(h / ROWS);
      let cell = Math.min(cellW, cellH);
      cell = Math.max(MIN_CELL, Math.min(MAX_CELL, cell));
      const pixelW = COLS * cell;
      const pixelH = ROWS * cell;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${pixelW}px`;
      canvas.style.height = `${pixelH}px`;
      canvas.width = Math.round(pixelW * dpr);
      canvas.height = Math.round(pixelH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cellPxRef.current = cell;
      drawRef.current();
    };

    const draw = () => {
      const cell = cellPxRef.current;
      const cw = COLS * cell;
      const ch = ROWS * cell;
      ctx.fillStyle = "#070709";
      ctx.fillRect(0, 0, cw, ch);

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cell + 0.5, 0);
        ctx.lineTo(x * cell + 0.5, ch);
        ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cell + 0.5);
        ctx.lineTo(cw, y * cell + 0.5);
        ctx.stroke();
      }

      const pad = Math.max(1, Math.floor(cell * 0.1));
      const inner = cell - pad * 2;
      const cornerR = Math.max(2, inner * 0.12);
      ctx.fillStyle = "rgb(56,189,248)";
      for (const s of snakeRef.current) {
        ctx.beginPath();
        ctx.roundRect(
          s.x * cell + pad,
          s.y * cell + pad,
          inner,
          inner,
          cornerR,
        );
        ctx.fill();
      }

      const f = foodRef.current;
      ctx.fillStyle = "rgb(251,113,133)";
      const fp = pad + 1;
      const fs = Math.max(4, inner - 2);
      ctx.beginPath();
      ctx.roundRect(f.x * cell + fp, f.y * cell + fp, fs, fs, cornerR);
      ctx.fill();

      // Render arrow hints in bottom-left
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "white";
      const hintSize = Math.max(16, cell * 1.5);
      const hintX = 12;
      const hintY = ch - hintSize - 12;
      
      // Draw 4 arrows in a cross pattern
      const drawArrow = (ax: number, ay: number, rot: number) => {
        ctx.save();
        ctx.translate(ax + hintSize / 2, ay + hintSize / 2);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(-hintSize / 4, hintSize / 8);
        ctx.lineTo(0, -hintSize / 4);
        ctx.lineTo(hintSize / 4, hintSize / 8);
        ctx.stroke();
        ctx.restore();
      };

      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      drawArrow(hintX, hintY - hintSize / 2, 0); // Up
      drawArrow(hintX, hintY + hintSize / 2, Math.PI); // Down
      drawArrow(hintX - hintSize / 2, hintY, -Math.PI / 2); // Left
      drawArrow(hintX + hintSize / 2, hintY, Math.PI / 2); // Right
      ctx.restore();
    };

    drawRef.current = draw;

    const step = () => {
      const snake = snakeRef.current;
      const head = snake[0];
      const d = dirRef.current;
      const nx = (head.x + d.x + COLS) % COLS;
      const ny = (head.y + d.y + ROWS) % ROWS;
      if (snake.some((s) => s.x === nx && s.y === ny)) {
        snakeRef.current = [
          { x: 6, y: 7 },
          { x: 5, y: 7 },
          { x: 4, y: 7 },
        ];
        dirRef.current = { x: 1, y: 0 };
        foodRef.current = randomFood(snakeRef.current);
        drawRef.current();
        return;
      }
      snake.unshift({ x: nx, y: ny });
      if (nx === foodRef.current.x && ny === foodRef.current.y) {
        foodRef.current = randomFood(snakeRef.current);
      } else {
        snake.pop();
      }
      drawRef.current();
    };

    layout();
    draw();

    const ro = new ResizeObserver(() => layout());
    ro.observe(wrap);

    const id = window.setInterval(step, TICK_MS);

    const onKey = (e: KeyboardEvent) => {
      if (
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight"
      ) {
        return;
      }
      e.preventDefault();
      const d = dirRef.current;
      if (e.key === "ArrowUp" && d.y === 0) dirRef.current = { x: 0, y: -1 };
      else if (e.key === "ArrowDown" && d.y === 0)
        dirRef.current = { x: 0, y: 1 };
      else if (e.key === "ArrowLeft" && d.x === 0)
        dirRef.current = { x: -1, y: 0 };
      else if (e.key === "ArrowRight" && d.x === 0)
        dirRef.current = { x: 1, y: 0 };
    };
    window.addEventListener("keydown", onKey);
    return () => {
      ro.disconnect();
      window.clearInterval(id);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-[#070709]">
      <div className="shrink-0 border-b border-white/[0.06] px-3 py-2 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-zinc-400">
          Loading game
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Play while Node0 finishes the first reply — nothing’s frozen.
        </p>
      </div>
      <div
        ref={wrapRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          className="shrink-0"
          aria-label="Snake — use arrow keys while Node0 responds"
          title="Arrow keys to play"
        />
      </div>
      <p className="pointer-events-none shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 text-center text-[10px] text-zinc-600">
        Arrow keys
      </p>
    </div>
  );
}
