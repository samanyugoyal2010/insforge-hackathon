import { isRecord } from "@/lib/agent/contracts";

function toNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Same normalization as tool-executor `normalizePcbToolArgs` for PCB spec text. */
export function normalizePcbArgsForPcbflow(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const bd = isRecord(raw.boardDimensions) ? raw.boardDimensions : null;
  const w =
    toNumber(raw.widthMm) ??
    toNumber(raw.width) ??
    toNumber(bd?.width) ??
    toNumber(bd?.w);
  const h =
    toNumber(raw.heightMm) ??
    toNumber(raw.height) ??
    toNumber(bd?.height) ??
    toNumber(bd?.h);
  const netsIn = Array.isArray(raw.nets) ? raw.nets : [];
  const nets = netsIn.map((n) => {
    if (!isRecord(n)) return n;
    const nodesRaw = n.nodes ?? n.connectedNodes ?? n.connectedPins ?? n.pins;
    const nodes = Array.isArray(nodesRaw)
      ? nodesRaw.map((x) => (typeof x === "string" ? x : String(x)))
      : [];
    return { ...n, nodes };
  });
  const next: Record<string, unknown> = { ...raw, nets };
  if (w != null) next.widthMm = w;
  if (h != null) next.heightMm = h;
  return next;
}

export function buildPcbSpecificationText(
  args: Record<string, unknown>,
  projectName: string,
  conversationContext?: string,
): string {
  const components = Array.isArray(args.components) ? args.components : [];
  const nets = Array.isArray(args.nets) ? args.nets : [];
  const widthMm = toNumber(args.widthMm) || 80;
  const heightMm = toNumber(args.heightMm) || 50;
  const layerCount = toNumber(args.layerCount) || 2;

  let prompt = `Project name: ${projectName}

Board: ${widthMm}mm x ${heightMm}mm, ${layerCount} copper layers (use 2 unless inner layers are required).

Components:`;

  if (components.length > 0) {
    components.forEach((comp: unknown, i: number) => {
      if (isRecord(comp)) {
        prompt += `
- ${comp.ref || `U${i + 1}`}: ${comp.value || "Component"} (footprint: ${comp.footprint || "TBD"})`;
      }
    });
  } else {
    prompt += `
- Infer sensible parts from the conversation.`;
  }

  if (nets.length > 0) {
    prompt += `

Nets / connectivity:`;
    nets.forEach((net: unknown) => {
      if (isRecord(net) && Array.isArray(net.nodes)) {
        prompt += `
- ${net.name}: ${(net.nodes as string[]).join(", ")}`;
      }
    });
  }

  if (args.autoroute) {
    prompt += `

Prefer routed copper (turtle-style traces or pours) where feasible in pcbflow.`;
  }

  if (conversationContext?.trim()) {
    prompt = `Conversation context:\n${conversationContext.trim()}\n\n${prompt}`;
  }

  return prompt;
}
