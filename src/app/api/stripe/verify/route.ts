import { NextResponse } from "next/server";
import { z } from "zod";

import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { bearerFromRequest, createSupabaseForAccessToken } from "@/lib/supabase-user";

const bodySchema = z.object({
  sessionId: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const token = bearerFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseForAccessToken(token);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId, {
    expand: ["payment_intent"],
  });

  if (session.metadata?.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Payment not completed", status: session.payment_status },
      { status: 400 },
    );
  }

  const projectClientId = session.metadata?.project_client_id ?? "";
  if (!projectClientId) {
    return NextResponse.json({ error: "Invalid session metadata" }, { status: 400 });
  }

  const qty = Math.max(
    1,
    Math.min(1_000_000, Number.parseInt(session.metadata?.qty ?? "1", 10) || 1),
  );
  const label = (session.metadata?.label ?? "").trim() || "Paid fab run";

  const pi =
    typeof session.payment_intent === "object" && session.payment_intent
      ? session.payment_intent
      : null;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : pi && "id" in pi
        ? pi.id
        : null;

  const row = {
    user_id: user.id,
    project_client_id: projectClientId,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    label,
    qty,
    amount_total: session.amount_total,
    currency: session.currency,
    fulfillment_status: "placed" as const,
    paid_at: new Date().toISOString(),
  };

  const admin = createSupabaseServiceClient();
  const db = admin ?? supabase;
  const { data: saved, error: upErr } = await db
    .from("node0_fab_orders")
    .upsert(row, { onConflict: "stripe_checkout_session_id" })
    .select(
      "id,created_at,stripe_checkout_session_id,label,qty,fulfillment_status,amount_total,currency,project_client_id",
    )
    .single();

  if (upErr) {
    console.error("[stripe verify] fab_orders upsert:", upErr.message);
    return NextResponse.json(
      {
        error: upErr.message,
        hint:
          "Ensure migration 20260411140000_node0_fab_orders.sql is applied (node0_fab_orders table).",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ order: saved });
}
