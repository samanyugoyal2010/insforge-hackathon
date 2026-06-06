import { createAdminClient } from "@insforge/sdk";

/** Admin client for API routes — full project access, server-only. */
export function createInsforgeServerClient() {
  return createAdminClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    apiKey: process.env.INSFORGE_API_KEY!,
  });
}
