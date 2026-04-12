-- Store large AR handoff JSON in Supabase Storage; DB row holds metadata + optional inline jsonb.

alter table public.node0_ar_handoffs
  add column if not exists storage_path text null;

alter table public.node0_ar_handoffs
  alter column payload drop not null;

alter table public.node0_ar_handoffs
  drop constraint if exists node0_ar_handoffs_payload_or_storage;

alter table public.node0_ar_handoffs
  add constraint node0_ar_handoffs_payload_or_storage
  check (payload is not null or storage_path is not null);

comment on column public.node0_ar_handoffs.storage_path is 'Private bucket object path (gzip JSON); when set, payload is null';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'node0_ar_handoffs',
  'node0_ar_handoffs',
  false,
  52428800,
  array['application/gzip']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies: only the service role (Next.js API) reads/writes this bucket.

create or replace function public.node0_fetch_ar_handoff(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_expires timestamptz;
begin
  if p_id is null or length(p_id) > 128 then
    return null;
  end if;

  select payload, expires_at into v_payload, v_expires
  from public.node0_ar_handoffs
  where id = p_id;

  if not found then
    return null;
  end if;

  if v_expires < now() then
    delete from public.node0_ar_handoffs where id = p_id;
    return null;
  end if;

  if v_payload is null then
    return null;
  end if;

  return v_payload;
end;
$$;

revoke all on function public.node0_fetch_ar_handoff(text) from public;
grant execute on function public.node0_fetch_ar_handoff(text) to anon, authenticated;

comment on function public.node0_fetch_ar_handoff(text) is 'Read inline jsonb handoff only; storage-backed rows return null — use API with service role';
