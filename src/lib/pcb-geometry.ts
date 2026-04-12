/** Collapse redundant vertices on axis-aligned (or near-axis) polylines. */
export function collapseCollinearTracePoints(
  points: Array<{ x: number; y: number }>,
  tol = 0.08,
): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;
  const out: Array<{ x: number; y: number }> = [points[0]];

  const sameX = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) <= tol;
  const sameY = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.y - b.y) <= tol;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    const next = points[i + 1];
    const collinearH = sameY(prev, cur) && sameY(cur, next);
    const collinearV = sameX(prev, cur) && sameX(cur, next);
    if (!collinearH && !collinearV) out.push(cur);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Rough footprint size in mm for obstacle math (shared with autorouter). */
export function footprintObstacleMm(footprint: string): { width: number; height: number } {
  const f = footprint.toLowerCase();
  if (f.includes("0603")) return { width: 1.6, height: 0.8 };
  if (f.includes("0805")) return { width: 2.0, height: 1.25 };
  if (f.includes("1206")) return { width: 3.2, height: 1.6 };
  if (f.includes("esp32") || f.includes("wroom") || f.includes("devkit"))
    return { width: 25, height: 18 };
  if (f.includes("qfn") || f.includes("qfp") || f.includes("tqfp"))
    return { width: 7, height: 7 };
  if (f.includes("hdr") || f.includes("pin") || f.includes("header"))
    return { width: 2.54, height: 10 };
  if (f.includes("usb")) return { width: 8, height: 7 };
  if (f.includes("soic") || f.includes("sop")) return { width: 5, height: 4 };
  return { width: 5, height: 4 };
}

/**
 * Exaggerated body size on the layout canvas (mm) so ICs/connectors read at a glance.
 */
export function footprintBodyDisplayMm(
  ref: string,
  footprint: string,
  value: string,
): { w: number; h: number } {
  const base = footprintObstacleMm(footprint);
  const v = `${ref} ${value} ${footprint}`.toLowerCase();
  let mulW = 2.2;
  let mulH = 2.2;
  if (v.includes("esp") || v.includes("mcu") || v.includes("wroom")) {
    mulW = 3.2;
    mulH = 3.0;
  }
  if (v.includes("usb")) {
    mulW = 3.4;
    mulH = 2.8;
  }
  if (v.includes("motor") || v.includes("drv") || v.includes("l293")) {
    mulW = 2.8;
    mulH = 2.6;
  }
  return {
    w: Math.min(32, Math.max(6, base.width * mulW)),
    h: Math.min(22, Math.max(4, base.height * mulH)),
  };
}
