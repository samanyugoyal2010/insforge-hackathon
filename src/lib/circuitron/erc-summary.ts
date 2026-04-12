/**
 * Parse KiCad / SKiDL ERC-style reports into a compact summary for API + UI.
 */

export type DesignValidationLevel = "pass" | "warn" | "fail" | "unknown";

export interface DesignValidationSummary {
  level: DesignValidationLevel;
  /** True when report explicitly states no ERC issues */
  ercClean?: boolean;
  errorCount: number;
  warningCount: number;
  headline: string;
  /** Short excerpts for tooltips / expanded UI */
  snippets: string[];
}

const MAX_SNIPPETS = 8;

function pushSnippet(snippets: string[], line: string) {
  const t = line.trim();
  if (!t || snippets.length >= MAX_SNIPPETS) return;
  if (t.length > 280) snippets.push(`${t.slice(0, 277)}…`);
  else snippets.push(t);
}

/**
 * Heuristic ERC / electrical rules report parser (KiCad text reports vary by version).
 */
export function summarizeErcText(raw: string): DesignValidationSummary {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) {
    return {
      level: "unknown",
      errorCount: 0,
      warningCount: 0,
      headline: "No ERC report text was produced.",
      snippets: [],
    };
  }

  const lower = text.toLowerCase();
  if (
    lower.includes("no errors or warnings") ||
    (lower.includes("erc info") && lower.includes("no error"))
  ) {
    return {
      level: "pass",
      ercClean: true,
      errorCount: 0,
      warningCount: 0,
      headline: "Electrical rules check: no errors or warnings reported.",
      snippets: [],
    };
  }

  let errors = 0;
  let warnings = 0;
  const snippets: string[] = [];

  for (const line of text.split("\n")) {
    const L = line.trim();
    if (!L) continue;

    if (/^\s*error[\s*:]/i.test(L) || /\berror\s*\(/i.test(L)) {
      errors++;
      pushSnippet(snippets, L);
      continue;
    }
    if (/^\s*warning[\s*:]/i.test(L) || /\bwarning\s*\(/i.test(L)) {
      warnings++;
      pushSnippet(snippets, L);
      continue;
    }
    if (/\berrtype\b/i.test(L) && /\b(error|warning)\b/i.test(L)) {
      if (/\berror\b/i.test(L)) {
        errors++;
      } else {
        warnings++;
      }
      pushSnippet(snippets, L);
    }
  }

  if (errors > 0) {
    return {
      level: "fail",
      ercClean: false,
      errorCount: errors,
      warningCount: warnings,
      headline: `ERC reported ${errors} error(s)${warnings ? ` and ${warnings} warning(s)` : ""}.`,
      snippets,
    };
  }
  if (warnings > 0) {
    return {
      level: "warn",
      ercClean: false,
      errorCount: 0,
      warningCount: warnings,
      headline: `ERC reported ${warnings} warning(s) (no counted errors).`,
      snippets,
    };
  }

  const firstLine = text.split("\n").find((l) => l.trim()) ?? text;
  return {
    level: "unknown",
    errorCount: 0,
    warningCount: 0,
    headline: "ERC report present; could not classify automatically.",
    snippets: snippets.length > 0 ? snippets : [firstLine.slice(0, 280)],
  };
}

export function findErcContentInArtifacts(
  files: Record<string, string> | undefined | null,
): string | null {
  if (!files || typeof files !== "object") return null;
  for (const [key, value] of Object.entries(files)) {
    if (!value || typeof value !== "string") continue;
    if (key.toLowerCase().endsWith(".erc")) return value;
    if (key.toLowerCase().includes("erc") && key.toLowerCase().endsWith(".txt")) {
      return value;
    }
  }
  return null;
}

export function designValidationFromArtifacts(
  files: Record<string, string> | undefined | null,
): DesignValidationSummary | undefined {
  const erc = findErcContentInArtifacts(files);
  if (!erc) return undefined;
  return summarizeErcText(erc);
}
