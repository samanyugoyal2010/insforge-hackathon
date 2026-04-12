import { NextResponse } from "next/server";

import { isStripeConfigured } from "@/lib/stripe-server";

export async function GET() {
  return NextResponse.json({ checkoutEnabled: isStripeConfigured() });
}
