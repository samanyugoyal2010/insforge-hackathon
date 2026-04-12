import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  if (process.env.NODE_ENV !== "production" && key.startsWith("sk_live")) {
    console.warn("[stripe] STRIPE_SECRET_KEY is a live key in a non-production build.");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, { typescript: true });
  }
  return stripeSingleton;
}

/**
 * Reuse a Stripe Customer so Checkout shows a fixed email (not editable).
 * See https://docs.stripe.com/payments/checkout/customization#customer-email
 */
export async function getOrCreateStripeCustomer(
  stripe: Stripe,
  params: { userId: string; email: string },
): Promise<string> {
  const { userId, email } = params;
  const existing = await stripe.customers.list({ email, limit: 5 });
  const match = existing.data.find(
    (c) => c.metadata?.supabase_user_id === userId,
  );
  if (match) return match.id;
  const loose = existing.data[0];
  if (loose) {
    await stripe.customers.update(loose.id, {
      metadata: { ...loose.metadata, supabase_user_id: userId },
    });
    return loose.id;
  }
  const created = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });
  return created.id;
}

export function appUrlFromRequest(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`.replace(/\/$/, "");
  const fallback = process.env.NEXT_PUBLIC_APP_URL;
  if (fallback) return fallback.replace(/\/$/, "");
  return "http://localhost:3000";
}
