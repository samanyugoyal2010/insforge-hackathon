import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return { url, key };
}

export function createSupabaseForAccessToken(accessToken: string): SupabaseClient {
  const { url, key } = getSupabaseEnv();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  return createClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export function bearerFromRequest(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t.length > 0 ? t : null;
}
