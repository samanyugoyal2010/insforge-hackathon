import { NextResponse } from "next/server";
import { circuitronSubprocess } from "@/lib/circuitron";
import { validateCircuitronEnvironment } from "@/lib/circuitron/config";

export const dynamic = "force-dynamic";

/**
 * Lightweight readiness probe for deploys and hackathon judges / tooling.
 * Never echoes secret values — only booleans and safe hints.
 */
export async function GET() {
  const env = validateCircuitronEnvironment();
  let circuitronCli: "unknown" | "ok" | "error" = "unknown";
  let circuitronError: string | undefined;

  try {
    const health = await circuitronSubprocess.healthCheck();
    circuitronCli = health.healthy ? "ok" : "error";
    circuitronError = health.error;
  } catch (e) {
    circuitronCli = "error";
    circuitronError = e instanceof Error ? e.message : "Health check failed";
  }

  const stripe =
    typeof process.env.STRIPE_SECRET_KEY === "string" &&
    process.env.STRIPE_SECRET_KEY.length > 0;

  const supabaseKey =
    (typeof process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === "string" &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.length > 0) ||
    (typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0);
  const supabase =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
    supabaseKey;

  const openai =
    typeof process.env.OPENAI_API_KEY === "string" &&
    process.env.OPENAI_API_KEY.length > 0;

  /** Full stack for on-device PCB generation + agent */
  const ready = env.valid && circuitronCli === "ok" && openai;

  return NextResponse.json({
    ok: true,
    ready,
    app: "node0",
    version: "0.1.0",
    checks: {
      openaiConfigured: openai,
      circuitronEnv: env.valid,
      circuitronMissingEnv: env.valid ? [] : env.missing,
      circuitronCli,
      circuitronCliHint: circuitronError,
      stripeConfigured: stripe,
      supabaseConfigured: supabase,
      pcbEngine: "pcbflow",
    },
    timestamp: new Date().toISOString(),
  });
}
