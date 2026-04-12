/**
 * Collapse consecutive identical paragraphs (e.g. model repeats the same line after a blank line).
 */
export function dedupeAdjacentRepeatedParagraphs(text: string): string {
  const parts = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length <= 1) return text.trim();
  const out: string[] = [];
  for (const p of parts) {
    if (out.length > 0 && out[out.length - 1] === p) continue;
    out.push(p);
  }
  return out.join("\n\n");
}

/**
 * Models sometimes emit the same block twice (copy-paste in one reply).
 * Collapse exact full-string duplication and repeated paragraph runs.
 */
export function dedupeRepeatedAssistantReply(text: string): string {
  let t = dedupeAdjacentRepeatedParagraphs(text.trim());
  if (t.length < 12) return t;

  // Exact double: "AAAA" where A is half the string (lower min length for short replies)
  const half = Math.floor(t.length / 2);
  const a = t.slice(0, half).trim();
  const b = t.slice(half).trim();
  if (a.length >= 12 && a === b) return a;

  // Paragraph-level: if message is two identical halves split by blank lines
  const paras = t.split(/\n\s*\n/);
  if (paras.length >= 2) {
    const mid = Math.floor(paras.length / 2);
    if (mid >= 1 && paras.length % 2 === 0) {
      const first = paras.slice(0, mid).join("\n\n").trim();
      const second = paras.slice(mid).join("\n\n").trim();
      if (first.length >= 12 && first === second) return first;
    }
  }

  // Line-level: collapse consecutive duplicate lines (common with bullet lists)
  const lines = t.split("\n");
  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped.length > 0 && deduped[deduped.length - 1] === line) continue;
    deduped.push(line);
  }
  const lineJoined = deduped.join("\n");
  const midL = Math.floor(deduped.length / 2);
  if (midL >= 1 && deduped.length >= 2 && deduped.length % 2 === 0) {
    const firstHalf = deduped.slice(0, midL).join("\n").trim();
    const secondHalf = deduped.slice(midL).join("\n").trim();
    if (firstHalf.length >= 12 && firstHalf === secondHalf) return firstHalf;
  }

  return lineJoined;
}
