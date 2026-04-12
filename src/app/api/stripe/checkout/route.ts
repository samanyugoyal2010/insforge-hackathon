import { NextResponse } from "next/server";
import { z } from "zod";

import { computeFabQuote } from "@/lib/fab-quote";
import {
  appUrlFromRequest,
  getOrCreateStripeCustomer,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe-server";
import { bearerFromRequest, createSupabaseForAccessToken } from "@/lib/supabase-user";

const bodySchema = z.object({
  projectClientId: z.string().min(1).max(128),
  qty: z.number().int().min(1).max(1_000_000),
  label: z.string().max(400).optional(),
});

function stripeSafeDescription(s: string, max = 450): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured (STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
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

  const { projectClientId, qty, label } = parsed.data;
  const base = appUrlFromRequest(request);
  const stripe = getStripe();

  const { data: row, error: rowErr } = await supabase
    .from("node0_workspace_projects")
    .select("pcb_snapshot, cad_document")
    .eq("client_id", projectClientId)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }

  const quote = computeFabQuote({
    pcbSnapshot: row?.pcb_snapshot ?? null,
    cadDocument: row?.cad_document ?? null,
    qty,
  });

  if (quote.totalCents < 50) {
    return NextResponse.json(
      { error: "Quoted amount is below Stripe minimum; adjust FAB_* env or quantity." },
      { status: 400 },
    );
  }

  const pcbLine = quote.lines.find((l) => l.key === "pcb")!;
  const cadLine = quote.lines.find((l) => l.key === "cad")!;
  const platformLine = quote.lines.find((l) => l.key === "platform")!;

  const labelTrim = (label ?? "").trim().slice(0, 400);
  const meta = {
    user_id: user.id,
    project_client_id: projectClientId,
    qty: String(qty),
    label: labelTrim,
    quote_v: "1",
    pcb_w_mm: String(quote.pcbWidthMm),
    pcb_h_mm: String(quote.pcbHeightMm),
    pcb_line_cents: String(pcbLine.unitAmountCents),
    cad_line_cents: String(cadLine.unitAmountCents),
    platform_cents: String(platformLine.unitAmountCents),
    pcb_default_outline: quote.pcbUsedDefaultOutline ? "1" : "0",
  } as Record<string, string>;

  const email =
    typeof user.email === "string" && user.email.includes("@")
      ? user.email.trim()
      : null;

  let customerId: string | undefined;
  if (email) {
    try {
      customerId = await getOrCreateStripeCustomer(stripe, {
        userId: user.id,
        email,
      });
    } catch (e) {
      console.warn("[stripe] getOrCreateStripeCustomer failed:", e);
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: quote.lines.map((l) => ({
      price_data: {
        currency: "usd",
        unit_amount: l.unitAmountCents,
        product_data: {
          name: l.name,
          description: stripeSafeDescription(l.description),
        },
      },
      quantity: l.quantity,
    })),
    success_url: `${base}/dashboard?project=${encodeURIComponent(projectClientId)}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/dashboard?project=${encodeURIComponent(projectClientId)}&checkout=cancelled`,
    client_reference_id: user.id,
    ...(customerId
      ? { customer: customerId, customer_update: { address: "auto" } }
      : email
        ? { customer_email: email }
        : {}),
    metadata: meta,
    custom_text: {
      submit: {
        message: "You will receive fabrication updates in Node0 once the run is queued.",
      },
    },
    payment_intent_data: {
      metadata: meta,
    },
  });

  return NextResponse.json({ url: session.url });
}
