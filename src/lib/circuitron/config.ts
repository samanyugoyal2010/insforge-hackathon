/**
 * Circuitron configuration and environment setup
 */

import { CircuitronConfig } from './types';
import path from 'path';
import os from 'os';

/** Base URL only — Circuitron probes `${MCP_URL}/health` and `${MCP_URL}/sse`. */
export function resolveCircuitronMcpBaseUrl(): string {
  const raw = (
    process.env.CIRCUITRON_MCP_URL?.trim() ||
    process.env.MCP_URL?.trim() ||
    "http://localhost:8051"
  )
    .replace(/\/+$/, "");
  if (raw.endsWith("/sse")) {
    return raw.slice(0, -4).replace(/\/+$/, "") || "http://localhost:8051";
  }
  return raw || "http://localhost:8051";
}

/**
 * Same probes as Circuitron Python `is_mcp_server_available` (health, then SSE).
 */
export async function probeCircuitronMcpServer(
  baseUrl = resolveCircuitronMcpBaseUrl(),
): Promise<{ ok: boolean; error?: string }> {
  const base = baseUrl.replace(/\/+$/, "");
  const timeoutMs = 5000;

  const tryHealth = async (): Promise<boolean> => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(`${base}/health`, { method: "GET", signal: ac.signal });
      clearTimeout(t);
      return r.status > 0 && r.status < 500;
    } catch {
      clearTimeout(t);
      return false;
    }
  };

  if (await tryHealth()) {
    return { ok: true };
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}/sse`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal: ac.signal,
    });
    clearTimeout(t);
    if (r.status > 0 && r.status < 500) {
      return { ok: true };
    }
    return {
      ok: false,
      error: `MCP at ${base} returned HTTP ${r.status} on /sse`,
    };
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Circuitron MCP not reachable at ${base} (${msg}). Start: cd circuitron-integration && docker run -d --name circuitron-mcp --restart unless-stopped -p 8051:8051 --env-file mcp.env ghcr.io/shaurya-sethi/circuitron-mcp:latest`,
    };
  }
}

// Default environment variables for Circuitron
const DEFAULT_CIRCUITRON_ENV = {
  MCP_URL: resolveCircuitronMcpBaseUrl(),

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // KiCad Docker image
  KICAD_IMAGE: 'ghcr.io/shaurya-sethi/circuitron-kicad:latest',

  // Other Circuitron settings
  CIRCUITRON_DISABLE_BUILTIN_PRICES: '0',

  // Model settings
  CIRCUITRON_DEFAULT_MODEL: 'gpt-4o-mini',
};

/**
 * Get the default Circuitron configuration
 */
export function getDefaultCircuitronConfig(): CircuitronConfig {
  return {
    circuitronPath: path.join(process.cwd(), 'circuitron-integration'),
    defaultOutputDir: path.join(os.tmpdir(), 'circuitron-output'),
    defaultOptions: {
      noFootprintSearch: true, // Recommended for stability
      keepSkidl: true,
      dev: false
    },
    /** LLM + Docker KiCad runs need minutes; override with CIRCUITRON_TIMEOUT_MS */
    timeout: Math.min(
      Math.max(parseInt(process.env.CIRCUITRON_TIMEOUT_MS || "1800000", 10), 15000),
      3600000,
    ),
    mcpUrl: resolveCircuitronMcpBaseUrl(),
    kicadImage: DEFAULT_CIRCUITRON_ENV.KICAD_IMAGE
  };
}

/**
 * Get environment variables for Circuitron subprocess
 */
export function getCircuitronEnvironment(): Record<string, string> {
  const mcp = resolveCircuitronMcpBaseUrl();
  return {
    ...DEFAULT_CIRCUITRON_ENV,
    MCP_URL: mcp,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    ...(process.env.CIRCUITRON_KICAD_IMAGE && {
      KICAD_IMAGE: process.env.CIRCUITRON_KICAD_IMAGE,
    }),
  };
}

/**
 * Full env for the Circuitron child process. Sanitizes Logfire placeholders
 * (`LOGFIRE_BASE_URL=disabled`) that break URL parsing and optionally disables
 * remote Logfire when not explicitly enabled.
 */
export function buildCircuitronProcessEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(getCircuitronEnvironment())) {
    out[k] = v;
  }

  // Add environment variables to make Circuitron run non-interactively
  out.CIRCUITRON_SKIP_MCP_CHECK = "1";
  out.CI = "true"; // Indicates non-interactive environment
  out.TERM = "dumb"; // Disable terminal features that require interaction

  const base = out.LOGFIRE_BASE_URL;
  if (
    base === "disabled" ||
    base === "" ||
    (typeof base === "string" && !/^https?:\/\//i.test(base.trim()))
  ) {
    delete out.LOGFIRE_BASE_URL;
  }
  if (out.LOGFIRE_TOKEN === "disabled") {
    delete out.LOGFIRE_TOKEN;
  }
  if (out.LOGFIRE_PROJECT_NAME === "disabled") {
    delete out.LOGFIRE_PROJECT_NAME;
  }
  if (!process.env.LOGFIRE_SEND_TO_LOGFIRE) {
    out.LOGFIRE_SEND_TO_LOGFIRE = "false";
  }

  return out;
}

/**
 * Check if Circuitron environment is properly configured
 */
export function validateCircuitronEnvironment(): { valid: boolean; missing: string[] } {
  const required = ['OPENAI_API_KEY'];
  const missing: string[] = [];

  const env = getCircuitronEnvironment();

  for (const key of required) {
    if (!env[key]) {
      missing.push(key);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}