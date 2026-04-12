"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getSession } from "@/lib/supabase-auth";

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function resolveCallback() {
      const next = searchParams.get("next") ?? "/dashboard";
      const session = await getSession();

      if (session) {
        router.replace(next.startsWith("/") ? next : "/dashboard");
      } else {
        router.replace("/?join=1");
      }
    }

    void resolveCallback();
  }, [router, searchParams]);

  return (
    <div
      className="min-h-screen bg-[#06060a]"
      aria-busy
      aria-label="Signing in"
    />
  );
}
