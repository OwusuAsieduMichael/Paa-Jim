-- =============================================================================
-- Paa Jim — 0004 auth: sign-up with a name, phone-number changes
-- Design: design/paajim-design/paajim-auth (passwordless, phone + SMS code).
--
--   * Sign-up sends { full_name } as user metadata with the first SMS code.
--     The profile trigger now copies it, so a new customer has a name the
--     moment they verify. Role stays 'customer'; staff roles are still set by
--     admin only (profiles.role has no client UPDATE grant).
--   * A confirmed phone change (verifyOtp type 'phone_change') updates
--     auth.users.phone; profiles.phone follows by trigger. Clients have no
--     UPDATE grant on profiles.phone, so the trigger is the only way it moves.
-- =============================================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (
    new.id,
    new.phone,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create function public.sync_profile_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set phone = new.phone where id = new.id and phone is distinct from new.phone;
  return new;
end $$;

create trigger on_auth_user_phone_changed
  after update of phone on auth.users
  for each row when (new.phone is distinct from old.phone)
  execute function public.sync_profile_phone();

revoke execute on function public.sync_profile_phone() from anon, authenticated, public;
