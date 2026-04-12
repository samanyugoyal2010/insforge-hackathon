-- Paid Stripe fab runs (verify + webhook upsert here; order panel + fulfillment hub read)
create table if not exists public.node0_fab_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_client_id text not null,
  stripe_checkout_session_id text not null,
  stripe_payment_intent_id text null,
  label text not null default '',
  qty integer not null default 1,
  amount_total integer null,
  currency text null,
  fulfillment_status text not null default 'placed'
    constraint node0_fab_orders_fulfillment_chk
      check (fulfillment_status in ('placed', 'shipped', 'delivered')),
  paid_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint node0_fab_orders_stripe_session_uniq unique (stripe_checkout_session_id)
);

create index if not exists idx_node0_fab_orders_user_project
  on public.node0_fab_orders (user_id, project_client_id, created_at desc);

create index if not exists idx_node0_fab_orders_user_created
  on public.node0_fab_orders (user_id, created_at desc);

alter table public.node0_fab_orders enable row level security;

drop policy if exists node0_fab_orders_select_own on public.node0_fab_orders;
create policy node0_fab_orders_select_own
on public.node0_fab_orders
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists node0_fab_orders_insert_own on public.node0_fab_orders;
create policy node0_fab_orders_insert_own
on public.node0_fab_orders
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists node0_fab_orders_update_own on public.node0_fab_orders;
create policy node0_fab_orders_update_own
on public.node0_fab_orders
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

comment on table public.node0_fab_orders is 'Stripe checkout fab orders; RLS: owner read/write';
