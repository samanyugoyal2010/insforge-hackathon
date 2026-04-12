-- Raise AR handoff JSON cap to 48 MiB (gzip upload recommended from the app).

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

  if octet_length(built::text) > 50331648 then
    raise exception 'payload too large';
  end if;

  v_id := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.node0_ar_handoffs (id, payload, expires_at, created_by)
  values (v_id, built, v_expires, auth.uid());

  return jsonb_build_object(
    'id', v_id,
    'expiresAt', to_jsonb(v_expires)
  );
end;
$$;

revoke all on function public.node0_create_ar_handoff(jsonb, jsonb) from public;
grant execute on function public.node0_create_ar_handoff(jsonb, jsonb) to authenticated;
