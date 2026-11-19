-- =============================================================================
-- Paa Jim — 0008 admin dashboard
--  * menu-photos bucket: public to read, only admins (with their second factor)
--    can upload, replace or delete.
--  * nightly clean-up in the database (pg_cron), as the privacy policy promises:
--    rider location points after 30 days, unused device tokens after 90 days.
--    The API's own scheduler only runs these when Redis is configured.
-- =============================================================================

-- Storage (skipped where there is no storage schema, e.g. the offline test harness)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('menu-photos', 'menu-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    execute $p$create policy "menu-photos: admins read" on storage.objects for select to authenticated
      using (bucket_id = 'menu-photos' and public.is_admin() and (select auth.jwt() ->> 'aal') = 'aal2')$p$;
    execute $p$create policy "menu-photos: admins upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'menu-photos' and public.is_admin() and (select auth.jwt() ->> 'aal') = 'aal2')$p$;
    execute $p$create policy "menu-photos: admins replace" on storage.objects for update to authenticated
      using (bucket_id = 'menu-photos' and public.is_admin() and (select auth.jwt() ->> 'aal') = 'aal2')$p$;
    execute $p$create policy "menu-photos: admins delete" on storage.objects for delete to authenticated
      using (bucket_id = 'menu-photos' and public.is_admin() and (select auth.jwt() ->> 'aal') = 'aal2')$p$;
  end if;
end $$;

-- Scheduled clean-up (skipped where pg_cron isn't available, e.g. the offline test harness)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('prune-rider-locations', '0 3 * * *',
      $c$delete from public.rider_locations where recorded_at < now() - interval '30 days'$c$);
    perform cron.schedule('prune-device-tokens', '0 4 * * 0',
      $c$delete from public.device_tokens where last_seen < now() - interval '90 days'$c$);
  end if;
end $$;
