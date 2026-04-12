#!/usr/bin/env node
/**
 * Probes Circuitron's HTTP MCP server (same checks as Python is_mcp_server_available).
 * Usage: node scripts/check-circuitron-mcp.mjs
 * Env: MCP_URL or CIRCUITRON_MCP_URL (base URL, no /sse suffix required)
 */

function baseUrl() {
  const raw = (
    process.env.CIRCUITRON_MCP_URL ||
    process.env.MCP_URL ||
    "http://localhost:8051"
  )
    .trim()
    .replace(/\/+$/, "");
  if (raw.endsWith("/sse")) {
    return raw.slice(0, -4).replace(/\/+$/, "");
  }
  return raw || "http://localhost:8051";
}

async function probeHealth(base, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}/health`, {
      method: "GET",
      signal: ac.signal,
    });
    clearTimeout(t);
    return { ok: r.status > 0 && r.status < 500, status: r.status };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, err: e };
  }
}

async function probeSse(base, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}/sse`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal: ac.signal,
    });
    clearTimeout(t);
    return { ok: r.status > 0 && r.status < 500, status: r.status };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, err: e };
  }
}

async function main() {
  const base = baseUrl();
  console.log(`Checking Circuitron MCP at ${base} (/health, then /sse)…`);

  const health = await probeHealth(base, 5000);
  if (health.ok) {
    console.log(`OK: GET /health → HTTP ${health.status}`);
    process.exit(0);
  }

  const sse = await probeSse(base, 5000);
  if (sse.ok) {
    console.log(`OK: GET /sse → HTTP ${sse.status}`);
    process.exit(0);
  }

  const hErr = health.err instanceof Error ? health.err.message : String(health.err);
  const sErr = sse.err instanceof Error ? sse.err.message : String(sse.err);
  console.error(`FAIL: MCP not responding at ${base}`);
  console.error(`  /health: ${hErr}`);
  console.error(`  /sse:    ${sErr}`);
  console.error("");
  console.error("Fix: create circuitron-integration/mcp.env (see mcp.env.example), then:");
  console.error(
    "  docker run -d --name circuitron-mcp --restart unless-stopped -p 8051:8051 \\",
  );
  console.error(
    "    --env-file mcp.env ghcr.io/shaurya-sethi/circuitron-mcp:latest",
  );
  console.error("");
  console.error("Node0 / Next.js: set OPENAI_API_KEY in .env.local; optional CIRCUITRON_MCP_URL if not localhost:8051.");
  process.exit(1);
}

main();
