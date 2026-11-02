-- =============================================================================
-- Paa Jim — 0001 core schema
-- Single vendor, four roles: customer, vendor_staff, rider, admin.
--
-- Rules this file encodes (Build & Launch Handbook §1.3):
--   * Vendor controls food, admin controls money. Vendor staff can flip order
--     status and item availability; they cannot touch prices or totals.
--   * Anything safe under RLS is done by the client directly. Anything that
--     needs a secret, touches money or runs with no user goes to Node, which
--     uses the service role and bypasses RLS.
-- =============================================================================

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('customer', 'vendor_staff', 'rider', 'admin');

create type public.order_status as enum (
  'pending_payment',   -- created by create_order(), waiting on MoMo
  'payment_failed',    -- charge declined / abandoned
  'paid',              -- money captured, waiting on the kitchen
  'accepted',          -- kitchen is cooking
  'rejected',          -- kitchen said no -> refund
  'ready_for_pickup',  -- mark_ready() issued a Pickup ID
  'en_route',          -- claim_order() succeeded
  'arrived',           -- rider at the door
  'delivered',         -- verify_delivery() or force-complete
  'delivery_failed',   -- customer absent etc.
  'cancelled'          -- auto-cancel (8 min), admin, or abandoned payment
);

create type public.momo_network as enum ('mtn', 'vod', 'atl'); -- vod = Telecel Cash. Do not "fix" to tlc.
create type public.payment_status as enum ('pending', 'success', 'failed', 'abandoned');
create type public.refund_status as enum ('pending', 'processing', 'success', 'failed');

-- -----------------------------------------------------------------------------
-- People
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.app_role not null default 'customer',
  full_name   text check (char_length(full_name) <= 80),
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Every auth user gets a profile. Role is always customer here; staff roles are
-- assigned by admin endpoints (service role) only.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role helpers. SECURITY DEFINER so they can be used inside RLS policies on
-- profiles without recursion. STABLE so Postgres caches per statement.
create function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create function public.is_vendor_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'vendor_staff', false)
$$;

create function public.is_rider() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'rider', false)
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create table public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  label       text not null default 'Home' check (label in ('Home', 'Work', 'Other')),
  gps_code    text not null check (gps_code ~ '^[A-Z]{2}-?[0-9]{3,4}-?[0-9]{3,4}$'), -- Ghana Post GPS
  landmark    text check (char_length(landmark) <= 200),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  location    extensions.geography(point, 4326) not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.addresses (user_id);

create table public.rider_profiles (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  vehicle              text not null default 'Motorbike',
  on_shift             boolean not null default false,
  current_location     extensions.geography(point, 4326),
  current_lat          double precision,  -- plain copies so Realtime payloads are readable
  current_lng          double precision,
  current_heading      real,
  location_updated_at  timestamptz
);

create table public.device_tokens (
  token       text primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  platform    text not null check (platform in ('android', 'ios')),
  last_seen   timestamptz not null default now()
);
create index on public.device_tokens (user_id);

-- -----------------------------------------------------------------------------
-- The kitchen (single row) and its menu
-- -----------------------------------------------------------------------------
create table public.vendor (
  id                     smallint primary key default 1 check (id = 1), -- single vendor MVP
  name                   text not null,
  is_open                boolean not null default false,  -- vendor toggles
  is_suspended           boolean not null default false,  -- admin kill switch
  ordering_enabled       boolean not null default true,   -- admin kill switch (whole app)
  max_concurrent_orders  int not null default 6 check (max_concurrent_orders between 1 and 100),
  prep_minutes           int not null default 20,
  max_delivery_km        numeric(5,2) not null default 8,
  lat                    double precision not null,
  lng                    double precision not null,
  location               extensions.geography(point, 4326) not null,
  phone                  text,
  updated_at             timestamptz not null default now()
);

create table public.vendor_hours (
  dow     smallint primary key check (dow between 0 and 6), -- 0 = Sunday
  opens   time not null,
  closes  time not null check (closes > opens)
);

create table public.menu_categories (
  id     smallint generated always as identity primary key,
  name   text not null unique,
  sort   smallint not null default 0
);

create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  category_id   smallint not null references public.menu_categories (id),
  name          text not null,
  description   text not null default '',
  price         numeric(10,2) not null check (price > 0),
  is_available  boolean not null default true,  -- vendor: "sold out today"
  is_active     boolean not null default true,  -- admin: soft delete
  is_popular    boolean not null default false,
  image_url     text,
  tint          text not null default '#F9DCCB', -- placeholder tile colour until real photos
  sort          smallint not null default 0,
  updated_at    timestamptz not null default now()
);
create index on public.menu_items (category_id, sort);

create table public.delivery_fee_bands (
  id      smallint generated always as identity primary key,
  min_km  numeric(5,2) not null,
  max_km  numeric(5,2) not null check (max_km > min_km),
  fee     numeric(10,2) not null check (fee >= 0)
);

-- -----------------------------------------------------------------------------
-- Orders
-- -----------------------------------------------------------------------------
create sequence public.order_no_seq start 1001;

create table public.orders (
  id                uuid primary key,  -- client-generated uuidv4 = idempotency key
  order_no          text not null unique default ('PJ-' || nextval('public.order_no_seq')),
  customer_id       uuid not null references public.profiles (id),
  status            public.order_status not null default 'pending_payment',

  -- money (server computed, never from the client)
  subtotal          numeric(10,2) not null,
  delivery_fee      numeric(10,2) not null,
  total             numeric(10,2) not null check (total = subtotal + delivery_fee),

  -- delivery snapshot (addresses can change after the order is placed)
  address_id        uuid references public.addresses (id) on delete set null,
  address_label     text not null,
  gps_code          text not null,
  landmark          text,
  location          extensions.geography(point, 4326) not null,
  dest_lat          double precision not null,
  dest_lng          double precision not null,
  distance_km       numeric(5,2) not null,
  rider_note        text check (char_length(rider_note) <= 200),
  customer_name     text,
  customer_phone    text,

  -- rider
  rider_id          uuid references public.profiles (id),
  rider_name        text,
  rider_phone       text,

  -- payment snapshot for display
  momo_network      public.momo_network,
  momo_last4        text,

  -- outcomes
  reject_reason     text,
  failure_reason    text,
  cancel_reason     text,
  verify_attempts   smallint not null default 0,

  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  accepted_at       timestamptz,
  ready_at          timestamptz,
  claimed_at        timestamptz,
  arrived_at        timestamptz,
  delivered_at      timestamptz,
  closed_at         timestamptz,
  updated_at        timestamptz not null default now()
);
create index on public.orders (customer_id, created_at desc);
create index on public.orders (status) where status in ('paid', 'accepted', 'ready_for_pickup', 'en_route', 'arrived');
create index on public.orders (rider_id) where rider_id is not null;

create table public.order_items (
  id            bigint generated always as identity primary key,
  order_id      uuid not null references public.orders (id) on delete cascade,
  menu_item_id  uuid not null references public.menu_items (id),
  name          text not null,            -- snapshot
  unit_price    numeric(10,2) not null,   -- snapshot
  qty           smallint not null check (qty between 1 and 20),
  line_total    numeric(10,2) not null,
  note          text check (char_length(note) <= 120)
);
create index on public.order_items (order_id);

-- Secrets live in their own tables so column visibility can't leak them:
-- the customer can read their delivery code; only vendor staff read pickup IDs;
-- riders read neither and must go through RPCs.
create table public.order_delivery_codes (
  order_id  uuid primary key references public.orders (id) on delete cascade,
  code      char(4) not null
);

create table public.order_pickup_codes (
  order_id    uuid primary key references public.orders (id) on delete cascade,
  pickup_id   char(6) not null,
  expires_at  timestamptz not null
);
create index on public.order_pickup_codes (pickup_id);

create table public.claim_attempts (
  id            bigint generated always as identity primary key,
  rider_id      uuid not null references public.profiles (id),
  success       boolean not null,
  attempted_at  timestamptz not null default now()
);
create index on public.claim_attempts (rider_id, attempted_at desc);

create table public.ratings (
  order_id     uuid primary key references public.orders (id) on delete cascade,
  customer_id  uuid not null references public.profiles (id),
  food_stars   smallint not null check (food_stars between 1 and 5),
  rider_thumb  boolean,
  tags         text[] not null default '{}',
  comment      text check (char_length(comment) <= 500),
  created_at   timestamptz not null default now()
);

create table public.rider_locations (
  id           bigint generated always as identity primary key,
  rider_id     uuid not null references public.profiles (id),
  order_id     uuid references public.orders (id) on delete set null,
  location     extensions.geography(point, 4326) not null,
  heading      real,
  speed        real,
  recorded_at  timestamptz not null default now()
);
create index on public.rider_locations (recorded_at);
create index on public.rider_locations (order_id, recorded_at desc);

-- -----------------------------------------------------------------------------
-- Money (Node service only — no client policies at all except read-own)
-- -----------------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id),
  reference    text not null unique,
  network      public.momo_network not null,
  phone        text not null,
  amount       numeric(10,2) not null,
  status       public.payment_status not null default 'pending',
  gateway_response text,
  created_at   timestamptz not null default now(),
  verified_at  timestamptz
);
create index on public.payments (order_id);
create index on public.payments (status, created_at) where status = 'pending';

create table public.webhook_events (
  id           text primary key,  -- unique per Paystack event: conflict = already handled
  event        text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

create table public.refunds (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id),
  payment_id   uuid not null references public.payments (id),
  amount       numeric(10,2) not null check (amount > 0),
  status       public.refund_status not null default 'pending',
  reason       text not null,
  attempts     smallint not null default 0,
  last_error   text,
  gateway_ref  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (payment_id)  -- one refund per payment
);

-- -----------------------------------------------------------------------------
-- The order state machine
-- -----------------------------------------------------------------------------
-- actor:
--   'vendor'  vendor staff may make this move with a direct UPDATE
--   'rider'   the assigned rider may make this move with a direct UPDATE
--   'system'  only privileged code (RPCs, Node service role) may make it
create table public.order_transitions (
  from_status  public.order_status not null,
  to_status    public.order_status not null,
  actor        text not null check (actor in ('vendor', 'rider', 'system')),
  primary key (from_status, to_status, actor)
);

insert into public.order_transitions (from_status, to_status, actor) values
  ('pending_payment',  'paid',             'system'),  -- webhook / reconciliation
  ('pending_payment',  'payment_failed',   'system'),
  ('pending_payment',  'cancelled',        'system'),  -- abandoned
  ('payment_failed',   'cancelled',        'system'),
  ('paid',             'accepted',         'vendor'),
  ('paid',             'rejected',         'vendor'),
  ('paid',             'cancelled',        'system'),  -- auto-cancel at 8 min, admin
  ('accepted',         'ready_for_pickup', 'system'),  -- mark_ready()
  ('accepted',         'cancelled',        'system'),  -- admin
  ('ready_for_pickup', 'en_route',         'system'),  -- claim_order()
  ('ready_for_pickup', 'accepted',         'system'),  -- pickup id expired, re-issue
  ('ready_for_pickup', 'cancelled',        'system'),  -- admin
  ('en_route',         'arrived',          'rider'),
  ('en_route',         'delivery_failed',  'rider'),
  ('en_route',         'delivered',        'system'),  -- vendor/admin force-complete
  ('arrived',          'delivered',        'system'),  -- verify_delivery(), force-complete
  ('arrived',          'delivery_failed',  'rider'),
  ('arrived',          'en_route',         'rider'),   -- "wrong house", keep driving
  ('delivery_failed',  'delivered',        'system'),  -- vendor/admin force-complete
  ('delivery_failed',  'cancelled',        'system');  -- admin, refund

-- Lookup runs as owner (clients have no grant on order_transitions).
create function public.transition_allowed(p_from public.order_status, p_to public.order_status, p_actor text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.order_transitions
                 where from_status = p_from and to_status = p_to
                   and (p_actor is null or actor = p_actor))
$$;

-- SECURITY INVOKER on purpose: current_user must be the real caller so we can
-- tell a direct client UPDATE ('authenticated') from an RPC running as owner
-- ('postgres') or the Node service ('service_role'). A DEFINER trigger would
-- always see the owner and wave every client update through.
create function public.enforce_order_transition() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_privileged boolean := current_user in ('postgres', 'service_role', 'supabase_admin');
  v_actor text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if v_privileged then
    -- RPCs (SECURITY DEFINER, run as postgres) and the Node service.
    if not public.transition_allowed(old.status, new.status, null) then
      raise exception 'illegal transition % -> %', old.status, new.status using errcode = 'P0001';
    end if;
  else
    v_actor := case public.my_role()
                 when 'vendor_staff' then 'vendor'
                 when 'rider' then 'rider'
                 else null end;
    if v_actor is null or not public.transition_allowed(old.status, new.status, v_actor) then
      raise exception 'illegal transition % -> % for this role', old.status, new.status using errcode = 'P0001';
    end if;
    if new.status = 'rejected' and coalesce(trim(new.reject_reason), '') = '' then
      raise exception 'a reject reason is required' using errcode = 'P0001';
    end if;
    if new.status = 'delivery_failed' and coalesce(trim(new.failure_reason), '') = '' then
      raise exception 'a failure reason is required' using errcode = 'P0001';
    end if;
  end if;

  -- Timestamps
  case new.status
    when 'paid'             then new.paid_at      := coalesce(new.paid_at, now());
    when 'accepted'         then new.accepted_at  := coalesce(new.accepted_at, now());
    when 'ready_for_pickup' then new.ready_at     := now();
    when 'en_route'         then new.claimed_at   := coalesce(new.claimed_at, now());
    when 'arrived'          then new.arrived_at   := now();
    when 'delivered'        then new.delivered_at := now(); new.closed_at := now();
    when 'rejected', 'cancelled', 'payment_failed' then new.closed_at := now();
    else null;
  end case;
  new.updated_at := now();
  return new;
end $$;

create trigger orders_enforce_transition
  before update on public.orders
  for each row execute function public.enforce_order_transition();

-- Any paid order that ends rejected/cancelled queues a refund. The Node
-- dispatch-refund worker picks up 'pending' rows.
create function public.queue_refund_on_close() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments%rowtype;
begin
  if new.status in ('rejected', 'cancelled') and old.status <> new.status and old.paid_at is not null then
    select * into v_payment from public.payments
      where order_id = new.id and status = 'success'
      order by created_at desc limit 1;
    if found then
      insert into public.refunds (order_id, payment_id, amount, reason)
      values (new.id, v_payment.id, v_payment.amount,
              coalesce(new.reject_reason, new.cancel_reason, new.status::text))
      on conflict (payment_id) do nothing;
    end if;
  end if;
  return new;
end $$;

create trigger orders_queue_refund
  after update of status on public.orders
  for each row execute function public.queue_refund_on_close();

-- Pickup IDs die once the order leaves ready_for_pickup.
create function public.clear_pickup_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'ready_for_pickup' and new.status <> 'ready_for_pickup' then
    delete from public.order_pickup_codes where order_id = new.id;
  end if;
  return new;
end $$;

create trigger orders_clear_pickup_code
  after update of status on public.orders
  for each row execute function public.clear_pickup_code();

-- Rider location: a ping is one insert; the trigger keeps the fast-read column
-- on rider_profiles current. Realtime broadcasts the profile, not the log.
create function public.apply_rider_location() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.rider_profiles
     set current_location = new.location,
         current_lat = extensions.st_y(new.location::extensions.geometry),
         current_lng = extensions.st_x(new.location::extensions.geometry),
         current_heading = new.heading,
         location_updated_at = new.recorded_at
   where user_id = new.rider_id;
  return new;
end $$;

create trigger rider_locations_apply
  after insert on public.rider_locations
  for each row execute function public.apply_rider_location();

-- updated_at bookkeeping
create function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger menu_items_touch before update on public.menu_items for each row execute function public.touch_updated_at();
create trigger vendor_touch before update on public.vendor for each row execute function public.touch_updated_at();
create trigger refunds_touch before update on public.refunds for each row execute function public.touch_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles             enable row level security;
alter table public.addresses            enable row level security;
alter table public.rider_profiles       enable row level security;
alter table public.device_tokens        enable row level security;
alter table public.vendor               enable row level security;
alter table public.vendor_hours         enable row level security;
alter table public.menu_categories      enable row level security;
alter table public.menu_items           enable row level security;
alter table public.delivery_fee_bands   enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_delivery_codes enable row level security;
alter table public.order_pickup_codes   enable row level security;
alter table public.claim_attempts       enable row level security;
alter table public.ratings              enable row level security;
alter table public.rider_locations      enable row level security;
alter table public.payments             enable row level security;
alter table public.webhook_events       enable row level security;
alter table public.refunds              enable row level security;
alter table public.order_transitions    enable row level security;

-- Column-level privileges: start from nothing for API roles, grant back only
-- what each client path needs. RLS then narrows the rows.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Public catalogue
grant select on public.vendor, public.vendor_hours, public.menu_categories,
                public.menu_items, public.delivery_fee_bands to anon, authenticated;
create policy "catalogue readable" on public.vendor for select using (true);
create policy "catalogue readable" on public.vendor_hours for select using (true);
create policy "catalogue readable" on public.menu_categories for select using (true);
create policy "active items readable" on public.menu_items for select using (is_active or public.is_vendor_staff());
create policy "catalogue readable" on public.delivery_fee_bands for select using (true);

-- Vendor staff: availability toggles only. Prices are admin/Node.
grant update (is_open) on public.vendor to authenticated;
create policy "vendor toggles open" on public.vendor for update
  using (public.is_vendor_staff()) with check (public.is_vendor_staff());
grant update (is_available) on public.menu_items to authenticated;
create policy "vendor toggles stock" on public.menu_items for update
  using (public.is_vendor_staff()) with check (public.is_vendor_staff());

-- Profiles: read/update own name. Role is never client-writable.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Addresses: owner only.
grant select, insert, update, delete on public.addresses to authenticated;
create policy "own addresses" on public.addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Device tokens: owner only.
grant select, insert, update, delete on public.device_tokens to authenticated;
create policy "own tokens" on public.device_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Orders
grant select on public.orders to authenticated;
grant update (status, reject_reason, failure_reason) on public.orders to authenticated;
create policy "customer reads own orders" on public.orders for select
  using (customer_id = auth.uid());
create policy "vendor reads live orders" on public.orders for select
  using (public.is_vendor_staff() and status <> 'pending_payment');
create policy "rider reads assigned orders" on public.orders for select
  using (rider_id = auth.uid());
create policy "vendor moves orders" on public.orders for update
  using (public.is_vendor_staff()) with check (public.is_vendor_staff());
create policy "rider moves assigned orders" on public.orders for update
  using (rider_id = auth.uid() and public.is_rider()) with check (rider_id = auth.uid());

grant select on public.order_items to authenticated;
create policy "items follow order visibility" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id));

grant select on public.order_delivery_codes to authenticated;
create policy "customer reads own delivery code" on public.order_delivery_codes for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

grant select on public.order_pickup_codes to authenticated;
create policy "vendor reads pickup ids" on public.order_pickup_codes for select
  using (public.is_vendor_staff());

-- Ratings: customer writes once for own delivered order.
grant select, insert on public.ratings to authenticated;
create policy "customer rates own delivered order" on public.ratings for insert
  with check (customer_id = auth.uid() and exists (
    select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid() and o.status = 'delivered'));
create policy "read own or vendor" on public.ratings for select
  using (customer_id = auth.uid() or public.is_vendor_staff());

-- Rider profiles
grant select on public.rider_profiles to authenticated;
grant update (on_shift) on public.rider_profiles to authenticated;
create policy "rider reads self" on public.rider_profiles for select using (user_id = auth.uid());
create policy "vendor reads riders" on public.rider_profiles for select using (public.is_vendor_staff());
create policy "customer reads their active rider" on public.rider_profiles for select
  using (exists (select 1 from public.orders o
                 where o.rider_id = rider_profiles.user_id and o.customer_id = auth.uid()
                   and o.status in ('en_route', 'arrived')));
create policy "rider toggles shift" on public.rider_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Rider location pings: insert own, only while en_route on that order.
grant insert on public.rider_locations to authenticated;
create policy "rider pings while en route" on public.rider_locations for insert
  with check (rider_id = auth.uid() and exists (
    select 1 from public.orders o where o.id = order_id and o.rider_id = auth.uid() and o.status = 'en_route'));

-- Payments: customer may read their own (status screen). Writes = Node only.
grant select on public.payments to authenticated;
create policy "customer reads own payments" on public.payments for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

grant select on public.refunds to authenticated;
create policy "customer reads own refunds" on public.refunds for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

-- webhook_events, claim_attempts, order_transitions: no client policies (service role only).

-- =============================================================================
-- Realtime
-- =============================================================================
alter publication supabase_realtime add table public.orders, public.rider_profiles, public.vendor, public.menu_items;
