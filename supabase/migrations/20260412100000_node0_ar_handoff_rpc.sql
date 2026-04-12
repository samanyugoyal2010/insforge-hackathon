-- AR handoffs without service role: RPCs run as definer and touch the table; clients use anon + JWT (POST) or anon (GET).

create or replace function public.node0_create_ar_handoff(p_cad jsonb, p_circuit jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_expires timestamptz := now() + interval '1 hour';
  built jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  built := jsonb_build_object(
    'cad', p_cad,
    'circuitron', coalesce(p_circuit, '{}'::jsonb)
  );

  if octet_length(built::text) > 900000 then
    raise exception 'payload too large';
  end if;

  -- gen_random_uuid() is built-in on Postgres 13+; avoids pgcrypto gen_random_bytes
  v_id := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.node0_ar_handoffs (id, payload, expires_at, created_by)
  values (v_id, built, v_expires, auth.uid());

  return jsonb_build_object(
    'id', v_id,
    'expiresAt', to_jsonb(v_expires)
  );
end;
$$;

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

  return v_payload;
end;
$$;

revoke all on function public.node0_create_ar_handoff(jsonb, jsonb) from public;
revoke all on function public.node0_fetch_ar_handoff(text) from public;

grant execute on function public.node0_create_ar_handoff(jsonb, jsonb) to authenticated;
grant execute on function public.node0_fetch_ar_handoff(text) to anon, authenticated;

comment on function public.node0_create_ar_handoff(jsonb, jsonb) is 'Mint AR handoff row; requires JWT; no service role';
comment on function public.node0_fetch_ar_handoff(text) is 'Read non-expired handoff by opaque id; callable without login';
