-- =============================================================================
-- Paa Jim — 0003 admin
-- Every admin action is audited with a reason (>= 10 chars), enforced here and
-- in the Node handler. Admin work happens through Node (service role) or
-- Supabase Studio; there are no client policies on these tables.
-- =============================================================================

create table public.admin_actions (
  id          bigint generated always as identity primary key,
  admin_id    uuid not null references public.profiles (id),
  action      text not null,
  target_type text not null,
  target_id   text,
  reason      text not null check (char_length(trim(reason)) >= 10),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index on public.admin_actions (created_at desc);
alter table public.admin_actions enable row level security;

-- Price history: who changed what, when. Written by trigger so it can't be skipped.
create table public.menu_price_history (
  id            bigint generated always as identity primary key,
  menu_item_id  uuid not null references public.menu_items (id),
  old_price     numeric(10,2),
  new_price     numeric(10,2) not null,
  changed_at    timestamptz not null default now()
);
alter table public.menu_price_history enable row level security;

create function public.log_price_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price then
    insert into public.menu_price_history (menu_item_id, old_price, new_price)
    values (new.id, case when tg_op = 'UPDATE' then old.price end, new.price);
  end if;
  return new;
end $$;

create trigger menu_items_price_history after insert or update of price on public.menu_items
  for each row execute function public.log_price_change();

-- -----------------------------------------------------------------------------
-- daily_metrics: the four numbers to watch during the pilot (Handbook §7.2)
-- -----------------------------------------------------------------------------
create view public.daily_metrics with (security_invoker = true) as
select
  (o.created_at at time zone 'Africa/Accra')::date                                   as day,
  count(*) filter (where o.paid_at is not null)                                     as orders_paid,
  count(*) filter (where o.status = 'delivered')                                    as delivered,
  count(*) filter (where o.status = 'rejected')                                     as rejected,
  round(100.0 * count(*) filter (where o.status = 'rejected')
        / nullif(count(*) filter (where o.paid_at is not null), 0), 1)              as rejection_rate_pct,
  count(*) filter (where o.status = 'payment_failed')                               as payment_failed,
  round(100.0 * count(*) filter (where o.status = 'payment_failed')
        / nullif(count(*), 0), 1)                                                   as payment_failure_pct,
  coalesce(sum(o.total) filter (where o.status = 'delivered'), 0)                   as revenue,
  percentile_cont(0.5) within group (order by extract(epoch from o.claimed_at - o.ready_at) / 60)
    filter (where o.claimed_at is not null)                                         as ready_to_claim_p50_min,
  percentile_cont(0.5) within group (order by extract(epoch from o.delivered_at - o.paid_at) / 60)
    filter (where o.delivered_at is not null)                                       as paid_to_delivered_p50_min
from public.orders o
group by 1
order by 1 desc;

revoke all on public.daily_metrics from anon, authenticated;
revoke all on public.admin_actions, public.menu_price_history from anon, authenticated;
