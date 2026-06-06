import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const insforgeConfigured =
    typeof process.env.NEXT_PUBLIC_INSFORGE_URL === "string" &&
    process.env.NEXT_PUBLIC_INSFORGE_URL.length > 0 &&
    typeof process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY === "string" &&
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY.length > 0;

  return NextResponse.json({
    ok: true,
    app: "virtualstage",
    version: "0.1.0",
    checks: {
      insforgeConfigured,
    },
    timestamp: new Date().toISOString(),
  });
}
