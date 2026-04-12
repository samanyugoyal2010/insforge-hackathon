-- Ephemeral public USDZ for iOS AR Quick Look. Apple reads #callToAction / #checkoutTitle from
-- https URLs ending in .usdz; blob: URLs often omit the native banner (iOS 17+ regressions).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'node0_quicklook',
  'node0_quicklook',
  true,
  20971520,
  array['model/vnd.usdz+zip', 'application/octet-stream']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "node0_quicklook_select_public" on storage.objects;

create policy "node0_quicklook_select_public"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'node0_quicklook');
