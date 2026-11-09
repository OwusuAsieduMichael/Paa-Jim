-- =============================================================================
-- Paa Jim — 0007 saved MoMo wallets
--
-- A customer can save up to 5 mobile-money numbers and pick a default. The
-- payment screen pre-selects the default, so that wallet gets the Paystack
-- prompt. Only the network and number are stored — never a PIN.
-- =============================================================================

create table public.momo_wallets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  network     public.momo_network not null,
  phone       text not null check (phone ~ '^233[0-9]{9}$'),
  label       text check (char_length(label) <= 30),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, phone)
);
create index on public.momo_wallets (user_id);

alter table public.momo_wallets enable row level security;
grant select, insert, update, delete on public.momo_wallets to authenticated;
create policy "own wallets" on public.momo_wallets for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- One default per customer; the first wallet saved becomes the default.
create function public.momo_wallet_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.momo_wallets where user_id = new.user_id) >= 5 then
      raise exception 'you can save up to 5 MoMo wallets' using errcode = '22023';
    end if;
    if not exists (select 1 from public.momo_wallets where user_id = new.user_id) then
      new.is_default := true;
    end if;
  end if;
  return new;
end $$;

create trigger momo_wallets_rules before insert on public.momo_wallets
  for each row execute function public.momo_wallet_rules();

create function public.single_default_wallet() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.momo_wallets set is_default = false
   where user_id = new.user_id and id <> new.id and is_default;
  return new;
end $$;

create trigger momo_wallets_single_default after insert or update of is_default on public.momo_wallets
  for each row when (new.is_default) execute function public.single_default_wallet();

-- Deleting the default hands it to the newest remaining wallet.
create function public.promote_wallet_default() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.is_default then
    update public.momo_wallets set is_default = true
     where id = (select id from public.momo_wallets where user_id = old.user_id order by created_at desc limit 1);
  end if;
  return old;
end $$;

create trigger momo_wallets_promote_default after delete on public.momo_wallets
  for each row execute function public.promote_wallet_default();

revoke execute on function public.momo_wallet_rules() from public, anon, authenticated;
revoke execute on function public.single_default_wallet() from public, anon, authenticated;
revoke execute on function public.promote_wallet_default() from public, anon, authenticated;
