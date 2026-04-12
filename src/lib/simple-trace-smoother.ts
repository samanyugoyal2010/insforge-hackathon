/**
 * Simple Trace Smoother
 * Quick smoothing for legacy traces while professional routing loads
 */

export interface Point {
  x: number;
  y: number;
}

export function smoothTracePath(points: Point[]): string {
  if (points.length < 2) return '';

  let path = `M ${points[0].x} ${points[0].y}`;

  if (points.length === 2) {
    // Simple line
    path += ` L ${points[1].x} ${points[1].y}`;
  } else {
    // Use quadratic curves for smoothing
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const current = points[i];
      const next = points[i + 1];

      // Calculate control point
      const cp = {
        x: current.x,
        y: current.y
      };

      // Smooth the corner with a quadratic curve
      const midPrev = {
        x: (prev.x + current.x) / 2,
        y: (prev.y + current.y) / 2
      };

      const midNext = {
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2
      };

      if (i === 1) {
        path += ` L ${midPrev.x} ${midPrev.y}`;
      }

      path += ` Q ${cp.x} ${cp.y} ${midNext.x} ${midNext.y}`;
    }

    // Add final line to last point
    path += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  }

  return path;
}

export function createSmoothTraceElement(
  points: Point[],
  width: number,
  color: string,
  opacity: number = 0.9
): string {
  return smoothTracePath(points);
}

export function addGlowFilter(): string {
  return `
    <defs>
      <filter id="smooth-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
  `;
}