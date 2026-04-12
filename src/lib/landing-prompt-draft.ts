const KEY = "node0_landing_prompt_draft_v1";

/** Persist the latest landing prompt so it survives navigation / OAuth return. */
export function persistLandingPromptDraft(text: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ text }));
  } catch {
    /* quota */
  }
}

/** Read draft without removing (safe for React Strict Mode double mount). */
export function peekLandingPromptDraft(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { text?: string };
    const t = typeof o.text === "string" ? o.text.trim() : "";
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

export function clearLandingPromptDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
