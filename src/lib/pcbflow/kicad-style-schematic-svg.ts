import { isRecord } from "@/lib/agent/contracts";

/** KiCad-like preview schematic from tool args (components + nets). Not a SPICE netlist. */
export function buildKicadStyleSchematicSvg(
  args: {
    components: unknown[];
    nets: unknown[];
  },
  projectName: string,
  opts?: { footerNote?: string },
): string {
  const components = args.components;
  const netsRaw = args.nets;
  const footer =
    opts?.footerNote ??
    "Connectivity from design args — export to KiCad for symbols, ERC, and fabrication data.";

  const refsOrdered = collectRefs(components, netsRaw);
  if (refsOrdered.length === 0) {
    return emptySheetSvg(projectName, footer);
  }
  const refMeta = new Map<string, { value: string; footprint: string }>();
  components.forEach((c, i) => {
    if (!isRecord(c)) return;
    const ref = typeof c.ref === "string" ? c.ref : `U${i + 1}`;
    refMeta.set(ref, {
      value: typeof c.value === "string" ? c.value : typeof c.description === "string" ? c.description : "Part",
      footprint: typeof c.footprint === "string" ? c.footprint : "",
    });
  });
  for (const r of refsOrdered) {
    if (!refMeta.has(r)) refMeta.set(r, { value: r, footprint: "" });
  }

  const colW = 200;
  const rowH = 140;
  const margin = 48;
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(refsOrdered.length, 1)))));
  const positions = new Map<string, { x: number; y: number }>();
  refsOrdered.forEach((ref, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    positions.set(ref, { x: margin + col * colW, y: margin + 56 + row * rowH });
  });

  const layouts = new Map<
    string,
    { x: number; y: number; w: number; h: number; svg: string; pins: Map<string, { x: number; y: number }> }
  >();

  refsOrdered.forEach((ref) => {
    const meta = refMeta.get(ref) ?? { value: "?", footprint: "" };
    const pinsOnRef = pinsForRef(ref, netsRaw);
    const pos = positions.get(ref)!;
    const sym = buildSymbolForRef(ref, meta.value, meta.footprint, pinsOnRef);
    layouts.set(ref, {
      x: pos.x,
      y: pos.y,
      w: sym.w,
      h: sym.h,
      svg: sym.svg,
      pins: sym.pins,
    });
  });

  let maxX = margin + cols * colW + 80;
  let maxY = margin + 56 + Math.ceil(Math.max(refsOrdered.length, 1) / cols) * rowH + 80;
  layouts.forEach((L) => {
    maxX = Math.max(maxX, L.x + L.w + 100);
    maxY = Math.max(maxY, L.y + L.h + 100);
  });

  const schW = Math.min(Math.max(maxX, 720), 1600);
  const schH = Math.min(Math.max(maxY, 480), 1200);

  const wirePaths: string[] = [];
  const netLabels: string[] = [];
  const junctions = new Set<string>();

  for (const net of netsRaw) {
    if (!isRecord(net) || !Array.isArray(net.nodes)) continue;
    const name = typeof net.name === "string" ? net.name : "NET";
    const pts: { x: number; y: number }[] = [];
    for (const node of net.nodes) {
      const p = pinWorldFromNode(node, layouts);
      if (p) pts.push(p);
    }
    const uniq = dedupePoints(pts);
    if (uniq.length < 2) continue;

    const isPower = powerClass(name);
    if (uniq.length === 2) {
      const [a, b] = uniq;
      wirePaths.push(wireD(a.x, a.y, b.x, b.y, isPower));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      netLabels.push(netLabelSvg(mid.x, mid.y - 10, name, isPower));
    } else {
      uniq.sort((p, q) => p.x - q.x);
      const hub = uniq[Math.floor(uniq.length / 2)]!;
      junctions.add(`${round(hub.x)},${round(hub.y)}`);
      for (const p of uniq) {
        if (p === hub) continue;
        wirePaths.push(wireD(hub.x, hub.y, p.x, p.y, isPower));
      }
      netLabels.push(netLabelSvg(hub.x, hub.y - 12, name, isPower));
    }
  }

  const junctionSvg = [...junctions]
    .map((k) => {
      const [x, y] = k.split(",").map(Number);
      return `<circle cx="${x}" cy="${y}" r="3.2" fill="#00a651" stroke="#008f47" stroke-width="0.6"/>`;
    })
    .join("\n    ");

  const symbolsSvg = refsOrdered
    .map((ref) => {
      const L = layouts.get(ref)!;
      return `<g transform="translate(${L.x},${L.y})">${L.svg}</g>`;
    })
    .join("\n  ");

  const powerDecor = buildPowerDecorations(netsRaw, layouts);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${schW}" height="${schH}" viewBox="0 0 ${schW} ${schH}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <pattern id="kdot" width="10" height="10" patternUnits="userSpaceOnUse">
      <circle cx="1.2" cy="1.2" r="0.55" fill="#c8c4bc" opacity="0.55"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="#f4f1eb"/>
  <rect width="100%" height="100%" fill="url(#kdot)"/>
  <style>
    .sch-title { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 15px; font-weight: 600; fill: #1a1a1a; }
    .sch-sub { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 10px; fill: #5c5c5c; }
    .ref-t { font-family: ui-monospace, monospace; font-size: 11px; font-weight: 700; fill: #0d0d0d; }
    .val-t { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 9px; fill: #2a2a2a; }
    .pin-t { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 8px; fill: #1a5276; }
    .sym { stroke: #8b2942; stroke-width: 1.35; fill: none; stroke-linecap: square; stroke-linejoin: miter; }
    .wire-sig { stroke: #00a651; stroke-width: 1.65; fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .wire-pwr { stroke: #c62828; stroke-width: 2.1; fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .net-lbl { font-family: ui-monospace, monospace; font-size: 9px; font-weight: 600; }
  </style>

  <text x="${schW / 2}" y="32" text-anchor="middle" class="sch-title">${escapeXml(projectName)}</text>
  <text x="${schW / 2}" y="48" text-anchor="middle" class="sch-sub">Schematic preview (KiCad-style) · logical connectivity</text>

  <g id="symbols">
  ${symbolsSvg}
  </g>
  <g id="wires">
    ${wirePaths.join("\n    ")}
  </g>
  <g id="junctions">${junctionSvg ? `\n    ${junctionSvg}\n  ` : ""}</g>
  <g id="netnames">
    ${netLabels.join("\n    ")}
  </g>
  ${powerDecor}

  <text x="20" y="${schH - 16}" class="sch-sub">${escapeXml(footer)}</text>
</svg>`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function dedupePoints(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const seen = new Set<string>();
  const out: { x: number; y: number }[] = [];
  for (const p of pts) {
    const k = `${round(p.x)},${round(p.y)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function powerClass(name: string): boolean {
  return /gnd|ground|vss|vee|vcc|vdd|vbat|\+5v|\+3v3|3v3|3\.3|usb_?vbus|vin|vout|\+1v2|\+1\.2/i.test(
    name,
  );
}

function wireD(sx: number, sy: number, ex: number, ey: number, power: boolean): string {
  const tol = 0.5;
  let d: string;
  if (Math.abs(sx - ex) < tol) d = `M${sx} ${sy} L${ex} ${ey}`;
  else if (Math.abs(sy - ey) < tol) d = `M${sx} ${sy} L${ex} ${ey}`;
  else {
    const midX = (sx + ex) / 2;
    d = `M${sx} ${sy} L${midX} ${sy} L${midX} ${ey} L${ex} ${ey}`;
  }
  const cls = power ? "wire-pwr" : "wire-sig";
  return `<path d="${d}" class="${cls}"/>`;
}

function netLabelSvg(x: number, y: number, name: string, power: boolean): string {
  const fill = power ? "#c62828" : "#00a651";
  return `<text x="${x}" y="${y}" text-anchor="middle" class="net-lbl" fill="${fill}">${escapeXml(name)}</text>`;
}

function parseNetNode(node: unknown): { ref: string; pin: string } | null {
  if (typeof node !== "string") return null;
  const s = node.trim();
  if (!s) return null;
  const i = s.indexOf(".");
  if (i >= 0) {
    const ref = s.slice(0, i).trim();
    const pin = s.slice(i + 1).trim() || "?";
    return { ref: ref.replace(/[+-]+$/u, "").trim(), pin };
  }
  const ref = s.replace(/[+-]+$/u, "").trim();
  return ref ? { ref, pin: "" } : null;
}

function collectRefs(components: unknown[], nets: unknown[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const push = (r: string) => {
    if (!r || seen.has(r)) return;
    seen.add(r);
    order.push(r);
  };
  components.forEach((c, i) => {
    if (!isRecord(c)) return;
    push(typeof c.ref === "string" ? c.ref : `U${i + 1}`);
  });
  for (const net of nets) {
    if (!isRecord(net) || !Array.isArray(net.nodes)) continue;
    for (const n of net.nodes) {
      const p = parseNetNode(n);
      if (p) push(p.ref);
    }
  }
  return order;
}

function pinsForRef(ref: string, nets: unknown[]): string[] {
  const pins = new Set<string>();
  for (const net of nets) {
    if (!isRecord(net) || !Array.isArray(net.nodes)) continue;
    for (const n of net.nodes) {
      const p = parseNetNode(n);
      if (!p || p.ref !== ref) continue;
      pins.add(p.pin || "1");
    }
  }
  return [...pins];
}

function pinWorldFromNode(
  node: unknown,
  layouts: Map<string, { x: number; y: number; w: number; h: number; pins: Map<string, { x: number; y: number }> }>,
): { x: number; y: number } | null {
  const p = parseNetNode(node);
  if (!p) return null;
  const L = layouts.get(p.ref);
  if (!L) return null;
  if (!p.pin) {
    return { x: L.x + L.w / 2, y: L.y + L.h / 2 };
  }
  const local = L.pins.get(p.pin) ?? L.pins.get("?") ?? { x: L.w / 2, y: L.h / 2 };
  return { x: L.x + local.x, y: L.y + local.y };
}

function refKind(ref: string): string {
  const m = /^([A-Za-z]+)\d*/.exec(ref.trim());
  return (m?.[1] ?? "U").toUpperCase();
}

function buildSymbolForRef(
  ref: string,
  value: string,
  footprint: string,
  pinNames: string[],
): { w: number; h: number; svg: string; pins: Map<string, { x: number; y: number }> } {
  const kind = refKind(ref);
  const pins = new Map<string, { x: number; y: number }>();

  if (kind === "R") {
    const w = 72;
    const h = 28;
    pins.set(pinNames[0] || "1", { x: 0, y: h / 2 });
    pins.set(pinNames[1] || "2", { x: w, y: h / 2 });
    const body = `
    <line x1="0" y1="${h / 2}" x2="10" y2="${h / 2}" class="sym"/>
    <rect x="10" y="${h / 2 - 8}" width="52" height="16" class="sym" fill="#f8f6f2"/>
    <line x1="62" y1="${h / 2}" x2="${w}" y2="${h / 2}" class="sym"/>
    <text x="${w / 2}" y="${h / 2 - 12}" text-anchor="middle" class="ref-t">${escapeXml(ref)}</text>
    <text x="${w / 2}" y="${h + 6}" text-anchor="middle" class="val-t">${escapeXml(value)}</text>`;
    return { w, h, svg: body, pins };
  }

  if (kind === "C" || kind === "L") {
    const w = 36;
    const h = 56;
    pins.set(pinNames[0] || "1", { x: w / 2, y: 0 });
    pins.set(pinNames[1] || "2", { x: w / 2, y: h });
    const isC = kind === "C";
    const mid = `
    <line x1="${w / 2}" y1="0" x2="${w / 2}" y2="14" class="sym"/>
    ${
      isC
        ? `<line x1="${w / 2 - 10}" y1="18" x2="${w / 2 + 10}" y2="18" class="sym"/>
    <line x1="${w / 2 - 10}" y1="26" x2="${w / 2 + 10}" y2="26" class="sym"/>`
        : `<path d="M${w / 2 - 12} 18 Q${w / 2} 22 ${w / 2 + 12} 18 Q${w / 2} 14 ${w / 2 - 12} 18" class="sym"/>
    <path d="M${w / 2 - 12} 26 Q${w / 2} 30 ${w / 2 + 12} 26 Q${w / 2} 22 ${w / 2 - 12} 26" class="sym"/>`
    }
    <line x1="${w / 2}" y1="30" x2="${w / 2}" y2="${h}" class="sym"/>`;
    const body = `${mid}
    <text x="${w + 4}" y="22" class="ref-t">${escapeXml(ref)}</text>
    <text x="${w + 4}" y="36" class="val-t">${escapeXml(value)}</text>`;
    return { w, h, svg: body, pins };
  }

  if (kind === "D") {
    const w = 64;
    const h = 28;
    pins.set(pinNames[0] || "A", { x: 0, y: h / 2 });
    pins.set(pinNames[1] || "K", { x: w, y: h / 2 });
    const body = `
    <line x1="0" y1="${h / 2}" x2="14" y2="${h / 2}" class="sym"/>
    <polygon points="14,${h / 2 - 10} 14,${h / 2 + 10} 44,${h / 2}" class="sym" fill="#f8f6f2"/>
    <line x1="44" y1="${h / 2 - 10}" x2="44" y2="${h / 2 + 10}" class="sym"/>
    <line x1="44" y1="${h / 2}" x2="${w}" y2="${h / 2}" class="sym"/>
    <text x="26" y="${h / 2 - 14}" text-anchor="middle" class="ref-t">${escapeXml(ref)}</text>
    <text x="26" y="${h + 8}" text-anchor="middle" class="val-t">${escapeXml(value)}</text>`;
    return { w, h, svg: body, pins };
  }

  if (kind === "Q") {
    const w = 56;
    const h = 64;
    const g = pinNames.find((p) => /gate|g/i.test(p)) ?? pinNames[0] ?? "G";
    const d = pinNames.find((p) => /drain|d/i.test(p)) ?? pinNames[1] ?? "D";
    const s = pinNames.find((p) => /source|s/i.test(p)) ?? pinNames[2] ?? "S";
    pins.set(g, { x: w / 2, y: 0 });
    pins.set(d, { x: w, y: 22 });
    pins.set(s, { x: w, y: h - 10 });
    const body = `
    <line x1="${w / 2}" y1="0" x2="${w / 2}" y2="16" class="sym"/>
    <line x1="${w / 2}" y1="16" x2="${w - 6}" y2="16" class="sym"/>
    <line x1="${w - 6}" y1="10" x2="${w - 6}" y2="46" class="sym"/>
    <line x1="${w - 6}" y1="28" x2="${w}" y2="28" class="sym"/>
    <line x1="${w - 6}" y1="36" x2="${w}" y2="36" class="sym"/>
    <polygon points="${w - 14},24 ${w - 6},28 ${w - 14},32" fill="#1a5276" stroke="#8b2942" stroke-width="1"/>
    <text x="6" y="20" class="ref-t">${escapeXml(ref)}</text>
    <text x="6" y="34" class="val-t">${escapeXml(value)}</text>
    <text x="${w - 18}" y="26" class="pin-t" text-anchor="end">${escapeXml(d)}</text>
    <text x="${w - 18}" y="40" class="pin-t" text-anchor="end">${escapeXml(s)}</text>
    <text x="${w / 2}" y="12" text-anchor="middle" class="pin-t">${escapeXml(g)}</text>`;
    return { w, h, svg: body, pins };
  }

  if (kind === "J" || kind === "P" || kind === "CN") {
    const n = Math.max(2, pinNames.length, 4);
    const pitch = 11;
    const h = 20 + n * pitch;
    const w = 40;
    for (let i = 0; i < n; i++) {
      const pn = pinNames[i] ?? String(i + 1);
      pins.set(pn, { x: 0, y: 16 + i * pitch });
    }
    let rects = "";
    for (let i = 0; i < n; i++) {
      rects += `<rect x="4" y="${12 + i * pitch}" width="14" height="8" fill="#f4e8a8" stroke="#8b2942" stroke-width="1"/>`;
    }
    const body = `
    ${rects}
    <text x="${w + 2}" y="18" class="ref-t">${escapeXml(ref)}</text>
    <text x="${w + 2}" y="32" class="val-t">${escapeXml(value)}</text>
    <text x="${w + 2}" y="46" class="sch-sub" font-size="7">${escapeXml(footprint)}</text>`;
    return { w: w + 60, h, svg: body, pins };
  }

  /* IC / default (U, U1, IC, M, etc.) */
  const labels = pinNames.length > 0 ? pinNames : ["1", "2"];
  const pinPitch = 14;
  const left = labels.slice(0, Math.ceil(labels.length / 2));
  const right = labels.slice(Math.ceil(labels.length / 2));
  const perSide = Math.max(left.length, right.length, 3);
  const bodyW = Math.max(120, Math.min(220, 56 + String(value).length * 5));
  const bodyH = Math.max(72, 24 + perSide * pinPitch + 20);
  left.forEach((label, i) => {
    pins.set(label, { x: 0, y: 20 + i * pinPitch });
  });
  right.forEach((label, i) => {
    pins.set(label, { x: bodyW, y: 20 + i * pinPitch });
  });

  let pinLines = "";
  left.forEach((label, i) => {
    const y = 20 + i * pinPitch;
    pinLines += `<line x1="0" y1="${y}" x2="16" y2="${y}" class="sym"/>
    <text x="20" y="${y + 3}" class="pin-t">${escapeXml(label)}</text>`;
  });
  right.forEach((label, i) => {
    const y = 20 + i * pinPitch;
    pinLines += `<line x1="${bodyW - 16}" y1="${y}" x2="${bodyW}" y2="${y}" class="sym"/>
    <text x="${bodyW - 20}" y="${y + 3}" text-anchor="end" class="pin-t">${escapeXml(label)}</text>`;
  });

  const body = `
  <rect x="16" y="12" width="${bodyW - 32}" height="${bodyH - 24}" class="sym" fill="#faf8f5"/>
  <text x="${bodyW / 2}" y="26" text-anchor="middle" class="ref-t">${escapeXml(ref)}</text>
  <text x="${bodyW / 2}" y="${bodyH / 2 + 4}" text-anchor="middle" class="val-t">${escapeXml(value)}</text>
  <text x="${bodyW / 2}" y="${bodyH - 14}" text-anchor="middle" class="sch-sub" font-size="7">${escapeXml(footprint)}</text>
  ${pinLines}`;
  return { w: bodyW, h: bodyH, svg: body, pins };
}

function buildPowerDecorations(
  nets: unknown[],
  layouts: Map<string, { x: number; y: number; w: number; h: number; pins: Map<string, { x: number; y: number }> }>,
): string {
  const parts: string[] = [];
  for (const net of nets) {
    if (!isRecord(net) || !Array.isArray(net.nodes)) continue;
    const name = typeof net.name === "string" ? net.name : "";
    if (!/gnd|ground|vss/i.test(name) && !/vcc|vdd|\+3v3|3v3|\+5v|vbat|vin/i.test(name)) continue;
    const first = net.nodes[0];
    const wp = pinWorldFromNode(first, layouts);
    if (!wp) continue;
    const x = wp.x;
    const y = wp.y + (/gnd|ground|vss/i.test(name) ? 28 : -28);
    if (/gnd|ground|vss/i.test(name)) {
      parts.push(`<g transform="translate(${x - 14},${y})">
        <polyline points="0,0 0,10 14,10 14,0 0,0" class="sym" fill="none"/>
        <text x="7" y="24" text-anchor="middle" class="val-t" fill="#1a1a1a">GND</text>
      </g>`);
    } else {
      parts.push(`<g transform="translate(${x - 10},${y})">
        <polyline points="10,18 10,6 4,12 16,12 10,6" class="sym" fill="none"/>
        <text x="10" y="0" text-anchor="middle" class="val-t" fill="#c62828">${escapeXml(name)}</text>
      </g>`);
    }
  }
  return parts.length ? `<g id="power-symbols">\n    ${parts.join("\n    ")}\n  </g>` : "";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emptySheetSvg(projectName: string, footer: string): string {
  const w = 640;
  const h = 400;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <pattern id="kdot0" width="10" height="10" patternUnits="userSpaceOnUse">
      <circle cx="1.2" cy="1.2" r="0.55" fill="#c8c4bc" opacity="0.55"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="#f4f1eb"/>
  <rect width="100%" height="100%" fill="url(#kdot0)"/>
  <text x="${w / 2}" y="160" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="#1a1a1a">${escapeXml(projectName)}</text>
  <text x="${w / 2}" y="196" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#666">No components in design args — add parts and nets, then regenerate.</text>
  <text x="20" y="${h - 20}" font-family="system-ui,sans-serif" font-size="10" fill="#888">${escapeXml(footer)}</text>
</svg>`;
}
