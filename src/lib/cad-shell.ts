export type ShellParams = {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  wallMm: number;
  cornerRadiusMm: number;
};

export const DEFAULT_SHELL: ShellParams = {
  lengthMm: 118,
  widthMm: 76,
  heightMm: 24,
  wallMm: 2.4,
  cornerRadiusMm: 3,
};

export function clampShell(p: ShellParams): ShellParams {
  return {
    lengthMm: Math.min(500, Math.max(8, p.lengthMm)),
    widthMm: Math.min(500, Math.max(8, p.widthMm)),
    heightMm: Math.min(200, Math.max(4, p.heightMm)),
    wallMm: Math.min(20, Math.max(0.4, p.wallMm)),
    cornerRadiusMm: Math.min(24, Math.max(0, p.cornerRadiusMm)),
  };
}

export function parseShellJson(raw: string): ShellParams | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const n = (k: string) => {
      const v = o[k];
      return typeof v === "number" && Number.isFinite(v) ? v : NaN;
    };
    const p: ShellParams = {
      lengthMm: n("lengthMm"),
      widthMm: n("widthMm"),
      heightMm: n("heightMm"),
      wallMm: n("wallMm"),
      cornerRadiusMm: n("cornerRadiusMm"),
    };
    if (Object.values(p).some((x) => Number.isNaN(x))) return null;
    return clampShell(p);
  } catch {
    return null;
  }
}
