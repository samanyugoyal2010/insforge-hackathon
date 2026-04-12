-- Ephemeral payloads for cross-device AR QR (minted via API + service role only)
create table if not exists public.node0_ar_handoffs (
  id text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users (id) on delete set null
);

create index if not exists idx_node0_ar_handoffs_expires
  on public.node0_ar_handoffs (expires_at);

comment on table public.node0_ar_handoffs is 'Short-lived CAD+PCB snapshots for mobile AR; no RLS policies — access only via service role in Next API';

alter table public.node0_ar_handoffs enable row level security;
