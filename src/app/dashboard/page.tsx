import { Suspense } from "react";

import { DashboardClient } from "./dashboard-client";

function DashboardFallback() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#09090b] px-4"
      aria-busy
      aria-label="Loading dashboard"
    >
      <p className="text-sm text-zinc-400">Loading workspace…</p>
      <p className="text-center text-xs text-zinc-600">
        If you just paid with Stripe, hang on—we are signing you back in.
      </p>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardClient />
    </Suspense>
  );
}
