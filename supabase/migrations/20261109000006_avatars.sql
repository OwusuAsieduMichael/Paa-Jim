-- =============================================================================
-- Paa Jim — 0006 profile photos
--
--   * profiles.avatar_url: a photo the user takes or picks in the app. Clients
--     may set it, but only to a file in their OWN folder of the `avatars`
--     bucket (checked below), so nobody can point their photo at another
--     user's file or an outside website.
--   * Orders carry a copy of the customer's and rider's photo, like they
--     already carry names and phones, so each side sees the other on the
--     order without being able to read the other's profile row.
--     The copies follow photo changes on live and past orders.
--   * Storage: public-read `avatars` bucket (paths are <user id>/<random>.jpg,
--     not guessable), max 2 MB, images only; writes only into your own folder.
-- =============================================================================

alter table public.profiles add column avatar_url text check (char_length(avatar_url) <= 500);
alter table public.orders
  add column customer_avatar_url text,
  add column rider_avatar_url text;

grant update (avatar_url) on public.profiles to authenticated;

create function public.check_avatar_url() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.avatar_url is not null
     and strpos(new.avatar_url, '/storage/v1/object/public/avatars/' || new.id::text || '/') = 0 then
    raise exception 'a profile photo must be uploaded from the app' using errcode = '22023';
  end if;
  return new;
end $$;

create trigger profiles_avatar_check
  before insert or update of avatar_url on public.profiles
  for each row execute function public.check_avatar_url();

-- New order: copy the customer's photo. Rider claims it: copy the rider's.
create function public.orders_fill_avatars() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select avatar_url into new.customer_avatar_url from public.profiles where id = new.customer_id;
  end if;
  if new.rider_id is distinct from (case when tg_op = 'UPDATE' then old.rider_id end) then
    select avatar_url into new.rider_avatar_url from public.profiles where id = new.rider_id;
  end if;
  return new;
end $$;

create trigger orders_fill_avatars
  before insert or update of rider_id on public.orders
  for each row execute function public.orders_fill_avatars();

-- Photo changed: refresh the copies on that person's orders.
create function public.sync_order_avatars() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set customer_avatar_url = new.avatar_url
   where customer_id = new.id and customer_avatar_url is distinct from new.avatar_url;
  update public.orders set rider_avatar_url = new.avatar_url
   where rider_id = new.id and rider_avatar_url is distinct from new.avatar_url;
  return new;
end $$;

create trigger profiles_avatar_sync
  after update of avatar_url on public.profiles
  for each row when (new.avatar_url is distinct from old.avatar_url)
  execute function public.sync_order_avatars();

revoke execute on function public.check_avatar_url() from public, anon, authenticated;
revoke execute on function public.orders_fill_avatars() from public, anon, authenticated;
revoke execute on function public.sync_order_avatars() from public, anon, authenticated;

-- Storage (skipped where there is no storage schema, e.g. the offline test harness)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    execute $p$create policy "avatars: read own" on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "avatars: upload own" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "avatars: delete own" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  end if;
end $$;
