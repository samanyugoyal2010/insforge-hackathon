"use client";

import { RetrowaveWorkspace } from "@/components/retrowave-workspace";
import {
  hasAuthSession,
  hydrateAuthSession,
  subscribeAuthSession,
} from "@/lib/supabase-auth";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

function useMockAuthed() {
  return useSyncExternalStore(
    subscribeAuthSession,
    hasAuthSession,
    () => false,
  );
}

export function DashboardClient() {
  const router = useRouter();
  const authed = useMockAuthed();
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    void (async () => {
      await hydrateAuthSession();
      setSessionReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (!authed) router.replace("/");
  }, [sessionReady, authed, router]);

  if (!sessionReady || !authed) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#09090b] px-4"
        aria-busy
        aria-label={sessionReady ? "Redirecting" : "Checking session"}
      >
        <p className="text-sm text-zinc-400">
          {!sessionReady ? "Signing you in…" : "Redirecting…"}
        </p>
        {!sessionReady ? (
          <p className="max-w-sm text-center text-xs text-zinc-600">
            Returning from checkout can take a second. Do not close this tab.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <motion.div
      className="flex h-dvh flex-col overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      <RetrowaveWorkspace />
    </motion.div>
  );
}
