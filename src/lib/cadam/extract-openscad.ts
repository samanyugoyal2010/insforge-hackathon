/**
 * Heuristics to recover OpenSCAD from LLM output.
 * Derived from CADAM (GPL-3.0) parametric-chat/index.ts
 */

export function scoreOpenSCADCode(code: string): number {
  if (!code || code.length < 20) return 0;

  let score = 0;
  const patterns = [
    /\b(cube|sphere|cylinder|polyhedron)\s*\(/gi,
    /\b(union|difference|intersection)\s*\(\s*\)/gi,
    /\b(translate|rotate|scale|mirror)\s*\(/gi,
    /\b(linear_extrude|rotate_extrude)\s*\(/gi,
    /\b(module|function)\s+\w+\s*\(/gi,
    /\$fn\s*=/gi,
    /\bfor\s*\(\s*\w+\s*=\s*\[/gi,
    /\bimport\s*\(\s*"/gi,
    /;\s*$/gm,
    /\/\/.*$/gm,
  ];

  for (const pattern of patterns) {
    const matches = code.match(pattern);
    if (matches) score += matches.length;
  }

  const varDeclarations = code.match(/^\s*\w+\s*=\s*[^;]+;/gm);
  if (varDeclarations) {
    score += Math.min(varDeclarations.length, 5);
  }

  return score;
}

export function extractOpenSCADCodeFromText(text: string): string | null {
  if (!text) return null;

  const codeBlockRegex = /```(?:openscad)?\s*\n?([\s\S]*?)\n?```/g;
  let match;
  let bestCode: string | null = null;
  let bestScore = 0;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const code = match[1].trim();
    const s = scoreOpenSCADCode(code);
    if (s > bestScore) {
      bestScore = s;
      bestCode = code;
    }
  }

  if (bestCode && bestScore >= 3) {
    return bestCode;
  }

  const rawScore = scoreOpenSCADCode(text);
  if (rawScore >= 5) {
    return text.trim();
  }

  return null;
}
