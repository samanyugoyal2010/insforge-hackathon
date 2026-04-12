"use client";

import { Button } from "@/components/ui/button";
import { dualStorageGet, dualStorageSet } from "@/lib/dual-storage";
import { sanitizeExportSlug } from "@/lib/download-json";
import { flushPcbToDualStorage } from "@/lib/pcb-persist-bridge";
import {
  clearStripeReturnExpectedFlag,
  saveStripeCheckoutLocalSnapshot,
  setStripeReturnExpectedFlag,
} from "@/lib/stripe-checkout-local-snapshot";
import { pushWorkspaceToCloud } from "@/lib/workspace-sync";
import { getSession, hydrateAuthSession } from "@/lib/supabase-auth";
import { cn } from "@/lib/utils";
import {
  Clock,
  CreditCard,
  Loader2,
  PackageCheck,
  PackageOpen,
  ShoppingBag,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type OrderStatus = "waiting" | "placed" | "shipped" | "delivered";

type OrderSource = "mock" | "stripe";

type Order = {
  id: string;
  createdAt: number;
  qty: number;
  label: string;
  status: OrderStatus;
  source: OrderSource;
  /** Supabase row id for paid fab orders */
  fabOrderId?: string;
  stripeSessionId?: string;
  paidCents?: number | null;
  currency?: string | null;
};

type FabOrderRow = {
  id: string;
  created_at: string;
  stripe_checkout_session_id: string;
  label: string;
  qty: number;
  fulfillment_status: string;
  amount_total: number | null;
  currency: string | null;
};

type OrderPanelProps = {
  projectId: string | null;
  className?: string;
};

const STATUS_STEPS: {
  id: OrderStatus;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  blurb: string;
}[] = [
  {
    id: "waiting",
    label: "Waiting",
    Icon: Clock,
    blurb: "Waiting for team member to place order.",
  },
  {
    id: "placed",
    label: "Placed",
    Icon: ShoppingBag,
    blurb: "Order placed with vendor.",
  },
  {
    id: "shipped",
    label: "Shipped",
    Icon: Truck,
    blurb: "Box left the factory.",
  },
  {
    id: "delivered",
    label: "Delivered",
    Icon: PackageCheck,
    blurb: "On your bench.",
  },
];

function nextStatus(s: OrderStatus): OrderStatus {
  if (s === "waiting") return "placed";
  if (s === "placed") return "shipped";
  if (s === "shipped") return "delivered";
  return "delivered";
}

function fabStatusToOrderStatus(s: string): OrderStatus {
  if (s === "placed" || s === "shipped" || s === "delivered") return s;
  return "placed";
}

function rowToStripeOrder(row: FabOrderRow): Order {
  return {
    id: row.id,
    fabOrderId: row.id,
    stripeSessionId: row.stripe_checkout_session_id,
    createdAt: new Date(row.created_at).getTime(),
    qty: row.qty,
    label: row.label || "Paid fab run",
    status: fabStatusToOrderStatus(row.fulfillment_status),
    source: "stripe",
    paidCents: row.amount_total,
    currency: row.currency,
  };
}

const STORAGE_PREFIX = "node0-orders:";

function readMockOrdersFromSession(projectId: string | null): Order[] {
  if (!projectId || typeof window === "undefined") return [];
  try {
    const raw = dualStorageGet(STORAGE_PREFIX + projectId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((o) => (o && typeof o === "object" ? (o as Order) : null))
      .filter(
        (o): o is Order =>
          Boolean(
            o &&
              typeof o.id === "string" &&
              (o.source === "mock" || o.source === undefined),
          ),
      )
      .map((o) => ({ ...o, source: "mock" as const }));
  } catch {
    return [];
  }
}

function OrderPanelContent({ projectId, className }: OrderPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mockOrders, setMockOrders] = useState<Order[]>(() =>
    readMockOrdersFromSession(projectId),
  );
  const [stripeOrders, setStripeOrders] = useState<Order[]>([]);
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [fabLoading, setFabLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  /** Only sessions that finished verify successfully (avoids Strict Mode skipping verify). */
  const stripeVerifyCompletedRef = useRef<Set<string>>(new Set());
  /** Skip first `mockOrders` write per project so we do not PUT empty orders before cloud pull. */
  const skipOrdersCloudPush = useRef(true);

  const [qty, setQty] = useState(10);
  const [label, setLabel] = useState("");

  const orders = useMemo(() => {
    const merged = [...stripeOrders, ...mockOrders];
    merged.sort((a, b) => b.createdAt - a.createdAt);
    return merged;
  }, [stripeOrders, mockOrders]);

  const refreshFabOrders = useCallback(async () => {
    if (!projectId) {
      setStripeOrders([]);
      return;
    }
    await hydrateAuthSession();
    const session = await getSession();
    if (!session?.access_token) {
      setStripeOrders([]);
      return;
    }
    setFabLoading(true);
    try {
      const res = await fetch(
        `/api/fab-orders?project=${encodeURIComponent(projectId)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!res.ok) {
        setStripeOrders([]);
        return;
      }
      const data = (await res.json()) as { orders?: FabOrderRow[] };
      const rows = Array.isArray(data.orders) ? data.orders : [];
      setStripeOrders(rows.map(rowToStripeOrder));
    } finally {
      setFabLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    skipOrdersCloudPush.current = true;
  }, [projectId]);

  useEffect(() => {
    setMockOrders(readMockOrdersFromSession(projectId));
    void refreshFabOrders();
  }, [projectId, refreshFabOrders]);

  useEffect(() => {
    const onExtras = () => {
      setMockOrders(readMockOrdersFromSession(projectId));
    };
    window.addEventListener("node0-extras-hydrated", onExtras);
    return () => window.removeEventListener("node0-extras-hydrated", onExtras);
  }, [projectId]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/stripe/status");
        const data = (await res.json()) as { checkoutEnabled?: boolean };
        setCheckoutEnabled(Boolean(data.checkoutEnabled));
      } catch {
        setCheckoutEnabled(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    try {
      dualStorageSet(STORAGE_PREFIX + projectId, JSON.stringify(mockOrders));
    } catch {
      // ignore
    }
  }, [mockOrders, projectId]);

  useEffect(() => {
    if (!projectId) return;
    if (skipOrdersCloudPush.current) {
      skipOrdersCloudPush.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void pushWorkspaceToCloud();
    }, 900);
    return () => window.clearTimeout(t);
  }, [mockOrders, projectId]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && projectId) {
        void refreshFabOrders();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [projectId, refreshFabOrders]);

  const clearCheckoutQuery = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("checkout");
    p.delete("session_id");
    const q = p.toString();
    router.replace(q ? `/dashboard?${q}` : "/dashboard", { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");
    if (checkout !== "success" || !sessionId || !projectId) return;
    if (stripeVerifyCompletedRef.current.has(sessionId)) {
      clearCheckoutQuery();
      return;
    }

    let cancelled = false;
    void (async () => {
      await hydrateAuthSession();
      const session = await getSession();
      if (!session?.access_token || cancelled) return;
      const res = await fetch("/api/stripe/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });
      if (!cancelled) {
        if (res.ok) {
          stripeVerifyCompletedRef.current.add(sessionId);
          setBanner("Payment confirmed — fab run saved to your account.");
          const data = (await res.json().catch(() => ({}))) as {
            order?: FabOrderRow;
          };
          if (data.order) {
            setStripeOrders((prev) => {
              const mapped = rowToStripeOrder(data.order!);
              if (prev.some((x) => x.id === mapped.id)) return prev;
              return [mapped, ...prev];
            });
          }
          await refreshFabOrders();
        } else {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setBanner(
            err.error
              ? `Could not confirm payment: ${err.error}`
              : "Could not confirm payment.",
          );
        }
        clearCheckoutQuery();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, projectId, refreshFabOrders, clearCheckoutQuery]);

  useEffect(() => {
    if (searchParams.get("checkout") === "cancelled") {
      clearStripeReturnExpectedFlag();
      setBanner("Checkout cancelled — nothing was charged.");
      clearCheckoutQuery();
    }
  }, [searchParams, clearCheckoutQuery]);

  const placeMockOrder = () => {
    if (!projectId) return;
    const trimmed = label.trim();
    const id = `${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const order: Order = {
      id,
      createdAt: Date.now(),
      qty: Math.max(1, Math.min(1000000, Math.floor(qty || 1))),
      label: trimmed || "Unlabeled build",
      status: "waiting",
      source: "mock",
    };
    setMockOrders((cur) => [order, ...cur]);
    setLabel("");
  };

  const startStripeCheckout = async () => {
    if (!projectId || stripeLoading) return;
    await hydrateAuthSession();
    const session = await getSession();
    if (!session?.access_token) {
      setBanner("Sign in required to pay with Stripe.");
      return;
    }
    setStripeLoading(true);
    setBanner(null);
    try {
      flushPcbToDualStorage();
      const snapOk = saveStripeCheckoutLocalSnapshot(projectId);
      if (!snapOk) {
        console.warn("Could not save a local backup of your board. Proceeding anyway.");
      }
      setStripeReturnExpectedFlag();
      const synced = await pushWorkspaceToCloud();
      if (!synced) {
        setBanner(
          "Cloud sync failed—your work is saved in this browser and will reload when you return from payment.",
        );
      }
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectClientId: projectId,
          qty: Math.max(1, Math.min(1000000, Math.floor(qty || 1))),
          label: label.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok) {
        clearStripeReturnExpectedFlag();
        setBanner(data.error ?? "Could not start checkout.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      clearStripeReturnExpectedFlag();
      setBanner("Checkout did not return a URL.");
    } finally {
      setStripeLoading(false);
    }
  };

  const advanceOrder = (o: Order) => {
    if (o.source !== "mock") return;
    setMockOrders((cur) =>
      cur.map((x) =>
        x.id === o.id
          ? {
              ...x,
              status: nextStatus(x.status),
            }
          : x,
      ),
    );
  };

  const safeSlug = sanitizeExportSlug(projectId ?? "draft");

  const summary = useMemo(() => {
    const totalQty = orders.reduce((acc, o) => acc + o.qty, 0);
    return { count: orders.length, totalQty };
  }, [orders]);

  const formatMoney = (cents: number | null | undefined, cur: string | null | undefined) => {
    if (cents == null || !cur) return null;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur.toUpperCase(),
      }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${cur}`;
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-[#070709]",
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
            <PackageOpen className="size-4" />
          </div>
          <div>
            <h2 className="font-heading text-base font-semibold text-zinc-100 sm:text-lg">
              Ordering
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {fabLoading ? "Loading paid runs…" : null}
              {summary.count} run{summary.count === 1 ? "" : "s"} tracked ·
              {" "}
              {summary.totalQty} board{summary.totalQty === 1 ? "" : "s"} total
            </p>
          </div>
        </div>
      </div>

      {banner ? (
        <div className="border-b border-white/[0.06] bg-zinc-900/80 px-4 py-2 text-center text-xs text-zinc-300 sm:px-6">
          {banner}
        </div>
      ) : null}

      <div className="border-b border-white/[0.06] bg-zinc-950/40 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
              Build label
            </label>
            <input
              placeholder="EVT bring-up, batch 01"
              className="w-full rounded border border-zinc-700/90 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-500/40"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-40">
            <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
              Quantity
            </label>
            <select
              value={qty}
              onChange={(e) => setQty(Number(e.target.value) || 1)}
              className="w-full rounded border border-zinc-700/90 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-500/40"
            >
              {[5, 10, 25, 50, 100, 250].map((n) => (
                <option key={n} value={n}>{`${n} pcs`}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-none flex-col gap-2 sm:flex-row sm:items-end">
            {checkoutEnabled ? (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-transparent">
                  Pay
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 gap-1.5 bg-[#635bff] text-white hover:bg-[#5647e0]"
                  onClick={() => void startStripeCheckout()}
                  disabled={!projectId || stripeLoading}
                >
                  {stripeLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CreditCard className="size-3.5" />
                  )}
                  Pay with Stripe
                </Button>
              </div>
            ) : null}
            {!checkoutEnabled ? (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-transparent">
                  Order
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 gap-1.5 bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                  onClick={placeMockOrder}
                  disabled={!projectId}
                >
                  <ShoppingBag className="size-3.5" />
                  Order here
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-500">
          {checkoutEnabled ? (
            <>
              Indicative quote: PCB area × qty, enclosure volume × qty, plus a
              platform fee (tune FAB_* env vars). Not a live fab API—verify with
              your manufacturer. Webhook + optional Supabase service role persist
              paid runs server-side.{" "}
              <Link
                href="/advance-orders"
                className="text-violet-300/90 underline decoration-violet-500/40 underline-offset-2 hover:text-violet-200"
              >
                Fulfillment hub
              </Link>{" "}
              (advance paid runs there only)
            </>
          ) : (
            "Add STRIPE_SECRET_KEY (test: sk_test_…) to enable Stripe checkout."
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {orders.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No orders yet. Pay with Stripe or create a tracked run above. Paid
            Stripe runs also appear under{" "}
            <Link
              href="/advance-orders"
              className="text-violet-300/90 underline decoration-violet-500/40 underline-offset-2 hover:text-violet-200"
            >
              Fulfillment hub
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {orders.map((o) => {
              const idx = STATUS_STEPS.findIndex((s) => s.id === o.status);
              const step = STATUS_STEPS[Math.max(0, idx)];
              const paidLabel = formatMoney(o.paidCents, o.currency);
              return (
                <li
                  key={`${o.source}-${o.id}`}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex size-8 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-200">
                        <step.Icon className="size-4" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                          {safeSlug} · {o.qty} pcs
                          {o.source === "stripe" ? (
                            <span className="ml-2 rounded border border-[#635bff]/40 bg-[#635bff]/15 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-violet-200">
                              Stripe
                            </span>
                          ) : null}
                          {paidLabel ? (
                            <span className="ml-2 normal-case tracking-normal text-zinc-400">
                              · {paidLabel}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-zinc-100">
                          {o.label || "Unlabeled build"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {o.source === "stripe" && o.status === "placed"
                            ? "Paid — awaiting fabrication updates."
                            : step.blurb}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-right">
                      <div className="flex gap-1.5 text-[10px]">
                        {STATUS_STEPS.map((s, i) => (
                          <span
                            key={s.id}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-1",
                              i <= idx
                                ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                                : "border border-white/[0.04] bg-zinc-900/80 text-zinc-500",
                            )}
                          >
                            <span className="size-1.5 rounded-full bg-current" />
                            {s.label}
                          </span>
                        ))}
                      </div>
                      {o.source === "mock" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="h-7 border-zinc-600/90 bg-zinc-950/80 text-[11px] text-zinc-200 hover:bg-zinc-800"
                          onClick={() => advanceOrder(o)}
                          disabled={o.status === "delivered"}
                        >
                          {o.status === "delivered"
                            ? "Delivered"
                            : "Advance status"}
                        </Button>
                      ) : (
                        <Link
                          href="/advance-orders"
                          className="inline-flex h-7 items-center rounded-md border border-zinc-600/90 bg-zinc-950/80 px-2 text-[11px] text-zinc-300 hover:bg-zinc-800"
                        >
                          Update on hub →
                        </Link>
                      )}
                    </div>
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

export function OrderPanel(props: OrderPanelProps) {
  return (
    <Suspense
      fallback={
        <div
          className={cn(
            "flex min-h-0 flex-1 items-center justify-center bg-[#070709] text-sm text-zinc-500",
            props.className,
          )}
        >
          Loading orders…
        </div>
      }
    >
      <OrderPanelContent {...props} />
    </Suspense>
  );
}
