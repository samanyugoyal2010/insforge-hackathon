"use client";

import { Button } from "@/components/ui/button";
import {
  getSession,
  hasAuthSession,
  hydrateAuthSession,
  subscribeAuthSession,
} from "@/lib/supabase-auth";
import { cn } from "@/lib/utils";
import { Loader2, PackageOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

type FabOrderRow = {
  id: string;
  created_at: string;
  stripe_checkout_session_id: string;
  label: string;
  qty: number;
  fulfillment_status: string;
  amount_total: number | null;
  currency: string | null;
  project_client_id: string;
};

function useAuthed() {
  return useSyncExternalStore(
    subscribeAuthSession,
    hasAuthSession,
    () => false,
  );
}

export function AdvanceOrdersClient() {
  const router = useRouter();
  const authed = useAuthed();
  const [sessionReady, setSessionReady] = useState(false);
  const [orders, setOrders] = useState<FabOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    await hydrateAuthSession();
    const session = await getSession();
    if (!session?.access_token) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fab-orders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        orders?: FabOrderRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load orders.");
        setOrders([]);
        return;
      }
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (sessionReady && authed) void load();
  }, [sessionReady, authed, load]);

  const advance = async (id: string) => {
    await hydrateAuthSession();
    const session = await getSession();
    if (!session?.access_token) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/fab-orders", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        await load();
      } else {
        setError(data.error ?? `Could not advance order (${res.status}).`);
      }
    } finally {
      setBusyId(null);
    }
  };

  const formatMoney = (cents: number | null | undefined, cur: string | null | undefined) => {
    if (cents == null || !cur) return "—";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur.toUpperCase(),
      }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${cur}`;
    }
  };

  if (!sessionReady || !authed) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#09090b] px-4"
        aria-busy
        aria-label="Checking session"
      >
        <p className="text-sm text-zinc-500">
          {!sessionReady ? "Signing you in…" : "Redirecting…"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100">
      <div className="border-b border-white/[0.06] bg-[#09090b]/90 px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
              <PackageOpen className="size-4" />
            </div>
            <div>
              <h1 className="font-heading text-lg font-semibold tracking-tight">
                Fulfillment hub
              </h1>
              <p className="text-xs text-zinc-500">
                Paid Stripe runs · advance status here (not from the project
                Ordering tab)
              </p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md,0.5rem),12px)] border border-zinc-600/90 bg-zinc-950/80 px-2.5 text-[0.8rem] font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Back to dashboard
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
        {error ? (
          <p className="text-sm text-red-400/90">{error}</p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="size-4 animate-spin" />
            Loading orders…
          </div>
        ) : orders.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No paid orders yet. Complete a Stripe checkout from a project’s
            Ordering tab.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {orders.map((o) => {
              const final = o.fulfillment_status === "delivered";
              return (
                <li
                  key={o.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                        {new Date(o.created_at).toLocaleString()} ·{" "}
                        {o.project_client_id.slice(0, 12)}… · {o.qty} pcs
                      </p>
                      <p className="mt-1 text-sm font-medium text-zinc-100">
                        {o.label || "Paid fab run"}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {formatMoney(o.amount_total, o.currency)} · status:{" "}
                        <span className="text-zinc-300">
                          {o.fulfillment_status}
                        </span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={final || busyId === o.id}
                      className={cn(
                        "border-zinc-600/90 bg-zinc-950/80 text-zinc-200 hover:bg-zinc-800",
                        final && "opacity-50",
                      )}
                      onClick={() => void advance(o.id)}
                    >
                      {busyId === o.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : final ? (
                        "Delivered"
                      ) : (
                        "Advance status"
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
