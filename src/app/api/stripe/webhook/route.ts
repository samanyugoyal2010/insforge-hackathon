import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const projectClientId = session.metadata?.project_client_id;
    if (userId && projectClientId && session.payment_status === "paid") {
      const qty = Math.max(
        1,
        Math.min(1_000_000, Number.parseInt(session.metadata?.qty ?? "1", 10) || 1),
      );
      const label =
        (session.metadata?.label ?? "").trim().slice(0, 400) || "Paid fab run";

      const pi = session.payment_intent;
      const paymentIntentId = typeof pi === "string" ? pi : pi?.id ?? null;

      const admin = createSupabaseServiceClient();
      if (admin) {
        const { error } = await admin.from("node0_fab_orders").upsert(
          {
            user_id: userId,
            project_client_id: projectClientId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId,
            label,
            qty,
            amount_total: session.amount_total,
            currency: session.currency,
            fulfillment_status: "placed",
            paid_at: new Date().toISOString(),
          },
          { onConflict: "stripe_checkout_session_id" },
        );
        if (error) {
          console.error("[stripe webhook] supabase upsert:", error.message);
        }
      } else {
        console.warn(
          "[stripe webhook] SUPABASE_SERVICE_ROLE_KEY missing — order row not persisted server-side until /api/stripe/verify runs.",
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
