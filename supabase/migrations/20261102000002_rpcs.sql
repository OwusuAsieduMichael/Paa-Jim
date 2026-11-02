-- =============================================================================
-- Paa Jim — 0002 RPCs
-- The operations that must be atomic, server-computed, or rate-limited.
-- All SECURITY DEFINER with an empty search_path; every one checks the caller.
-- =============================================================================

-- Keep geography columns in sync with the plain lat/lng the client writes.
create function public.sync_point_from_latlng() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.location := extensions.st_setsrid(extensions.st_makepoint(new.lng, new.lat), 4326)::extensions.geography;
  return new;
end $$;

create trigger addresses_sync_point before insert or update of lat, lng on public.addresses
  for each row execute function public.sync_point_from_latlng();
create trigger vendor_sync_point before insert or update of lat, lng on public.vendor
  for each row execute function public.sync_point_from_latlng();

-- One default address per user.
create function public.single_default_address() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_default then
    update public.addresses set is_default = false
     where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end $$;

create trigger addresses_single_default after insert or update of is_default on public.addresses
  for each row when (new.is_default) execute function public.single_default_address();

-- -----------------------------------------------------------------------------
-- kitchen_status(): one call for the customer home banner + capacity gate
-- -----------------------------------------------------------------------------
create function public.kitchen_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.vendor%rowtype;
  v_now timestamp := (now() at time zone 'Africa/Accra');
  v_hours public.vendor_hours%rowtype;
  v_active int;
  v_reason text;
begin
  select * into v from public.vendor where id = 1;
  select * into v_hours from public.vendor_hours where dow = extract(dow from v_now)::smallint;
  select count(*) into v_active from public.orders
   where status in ('paid', 'accepted', 'ready_for_pickup');

  v_reason := case
    when not v.ordering_enabled then 'Ordering is paused right now'
    when v.is_suspended then 'The kitchen is unavailable right now'
    when v_hours.dow is null then 'Closed today'
    when v_now::time < v_hours.opens then 'Opens at ' || to_char(v_hours.opens, 'FMHH12:MI AM')
    when v_now::time >= v_hours.closes then 'Closed for today'
    when not v.is_open then 'The kitchen is taking a short break'
    when v_active >= v.max_concurrent_orders then 'The kitchen is very busy — try again in a few minutes'
    else null end;

  return jsonb_build_object(
    'accepting', v_reason is null,
    'reason', v_reason,
    'is_open', v.is_open,
    'closes', to_char(v_hours.closes, 'FMHH12 AM'),
    'prep_minutes', v.prep_minutes,
    'eta_min', v.prep_minutes + 5,
    'eta_max', v.prep_minutes + 15,
    'vendor_name', v.name,
    'vendor_lat', v.lat,
    'vendor_lng', v.lng,
    'vendor_phone', v.phone
  );
end $$;

-- -----------------------------------------------------------------------------
-- quote_delivery(): fee for an address before ordering (checkout screen)
-- -----------------------------------------------------------------------------
create function public.quote_delivery(p_address_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_km numeric;
  v_fee numeric;
  v_band public.delivery_fee_bands%rowtype;
begin
  select round((extensions.st_distance(a.location, v.location) / 1000)::numeric, 2)
    into v_km
    from public.addresses a, public.vendor v
   where a.id = p_address_id and a.user_id = auth.uid() and v.id = 1;
  if v_km is null then
    raise exception 'address not found' using errcode = 'P0002';
  end if;
  select * into v_band from public.delivery_fee_bands
   where v_km >= min_km and v_km < max_km order by min_km limit 1;
  return jsonb_build_object(
    'distance_km', v_km,
    'deliverable', v_band.id is not null,
    'fee', v_band.fee,
    'band', case when v_band.id is null then null else v_band.min_km || '–' || v_band.max_km || ' km' end
  );
end $$;

-- -----------------------------------------------------------------------------
-- create_order(): the only way an order comes into existence
-- -----------------------------------------------------------------------------
-- p_items: [{ "menu_item_id": uuid, "qty": int, "note": text? }, ...]
-- Idempotent on p_order_id: a retry returns the existing order unchanged.
create function public.create_order(
  p_order_id   uuid,
  p_address_id uuid,
  p_items      jsonb,
  p_rider_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := auth.uid();
  v_profile   public.profiles%rowtype;
  v_addr      public.addresses%rowtype;
  v_vendor    public.vendor%rowtype;
  v_status    jsonb;
  v_km        numeric;
  v_fee       numeric;
  v_subtotal  numeric := 0;
  v_line      jsonb;
  v_item      public.menu_items%rowtype;
  v_qty       int;
  v_existing  public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select * into v_existing from public.orders where id = p_order_id;
  if found then
    if v_existing.customer_id <> v_uid then
      raise exception 'order id already used' using errcode = 'P0001';
    end if;
    return public.order_summary(p_order_id);
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.role <> 'customer' or not v_profile.is_active then
    raise exception 'only customers can place orders' using errcode = '42501';
  end if;

  -- Capacity gate: open? within hours? under concurrency?
  v_status := public.kitchen_status();
  if not (v_status ->> 'accepting')::boolean then
    raise exception '%', v_status ->> 'reason' using errcode = 'P0003';
  end if;

  -- In range?
  select * into v_addr from public.addresses where id = p_address_id and user_id = v_uid;
  if not found then
    raise exception 'choose a delivery address' using errcode = 'P0002';
  end if;
  select * into v_vendor from public.vendor where id = 1;
  v_km := round((extensions.st_distance(v_addr.location, v_vendor.location) / 1000)::numeric, 2);
  select fee into v_fee from public.delivery_fee_bands
   where v_km >= min_km and v_km < max_km order by min_km limit 1;
  if v_fee is null or v_km > v_vendor.max_delivery_km then
    raise exception 'that address is outside our delivery area (% km)', v_km using errcode = 'P0003';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'your cart is empty' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'too many lines in one order' using errcode = '22023';
  end if;

  insert into public.orders (
    id, customer_id, subtotal, delivery_fee, total,
    address_id, address_label, gps_code, landmark, location, dest_lat, dest_lng, distance_km,
    rider_note, customer_name, customer_phone
  ) values (
    p_order_id, v_uid, 0, v_fee, v_fee,
    v_addr.id, v_addr.label, v_addr.gps_code, v_addr.landmark, v_addr.location, v_addr.lat, v_addr.lng, v_km,
    nullif(trim(p_rider_note), ''), v_profile.full_name, v_profile.phone
  );

  -- Prices come from menu_items. Never from the request.
  for v_line in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_line ->> 'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 20 then
      raise exception 'invalid quantity' using errcode = '22023';
    end if;
    select * into v_item from public.menu_items
     where id = (v_line ->> 'menu_item_id')::uuid and is_active;
    if not found then
      raise exception 'an item in your cart is no longer on the menu' using errcode = 'P0004';
    end if;
    if not v_item.is_available then
      raise exception '% is sold out', v_item.name using errcode = 'P0004';
    end if;
    insert into public.order_items (order_id, menu_item_id, name, unit_price, qty, line_total, note)
    values (p_order_id, v_item.id, v_item.name, v_item.price, v_qty, v_item.price * v_qty,
            nullif(left(trim(v_line ->> 'note'), 120), ''));
    v_subtotal := v_subtotal + v_item.price * v_qty;
  end loop;

  update public.orders set subtotal = v_subtotal, total = v_subtotal + v_fee where id = p_order_id;

  insert into public.order_delivery_codes (order_id, code)
  values (p_order_id, lpad((floor(random() * 10000))::int::text, 4, '0'));

  return public.order_summary(p_order_id);
end $$;

-- Shared shape returned to the client after create_order.
create function public.order_summary(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'status', o.status,
    'subtotal', o.subtotal::text, 'delivery_fee', o.delivery_fee::text, 'total', o.total::text,
    'distance_km', o.distance_km,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'name', i.name, 'qty', i.qty, 'unit_price', i.unit_price::text, 'line_total', i.line_total::text)
              order by i.id) from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id and (o.customer_id = auth.uid() or auth.uid() is null)
$$;

-- -----------------------------------------------------------------------------
-- mark_ready(): vendor -> 6-digit Pickup ID, unique among unclaimed, 60 min
-- -----------------------------------------------------------------------------
create function public.mark_ready(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code char(6);
  v_expires timestamptz := now() + interval '60 minutes';
  v_tries int := 0;
begin
  if not public.is_vendor_staff() then
    raise exception 'vendor staff only' using errcode = '42501';
  end if;

  perform 1 from public.orders where id = p_order_id and status in ('accepted', 'ready_for_pickup') for update;
  if not found then
    raise exception 'order is not being prepared' using errcode = 'P0001';
  end if;

  -- Expired codes don't block reuse.
  delete from public.order_pickup_codes where expires_at < now();

  loop
    v_tries := v_tries + 1;
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.order_pickup_codes where pickup_id = v_code);
    if v_tries > 50 then
      raise exception 'could not allocate a pickup id' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.order_pickup_codes (order_id, pickup_id, expires_at)
  values (p_order_id, v_code, v_expires)
  on conflict (order_id) do update set pickup_id = excluded.pickup_id, expires_at = excluded.expires_at;

  update public.orders set status = 'ready_for_pickup'
   where id = p_order_id and status = 'accepted';

  return jsonb_build_object('pickup_id', v_code, 'expires_at', v_expires);
end $$;

-- -----------------------------------------------------------------------------
-- claim_order(): rider types the Pickup ID. Atomic; rate limited.
-- Returns {ok, error?, order_id?}. Never raises on a wrong code, so the failed
-- attempt row survives (an exception would roll it back).
-- -----------------------------------------------------------------------------
create function public.claim_order(p_pickup_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_failed int;
  v_order_id uuid;
begin
  if not public.is_rider() then
    raise exception 'riders only' using errcode = '42501';
  end if;

  select count(*) into v_failed from public.claim_attempts
   where rider_id = v_uid and not success and attempted_at > now() - interval '10 minutes';
  if v_failed >= 5 then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'message', 'Too many wrong tries. Claiming is locked for 10 minutes.');
  end if;

  select * into v_profile from public.profiles where id = v_uid;

  -- The WHERE rider_id IS NULL makes this a compare-and-set: of two riders
  -- racing on the same code, exactly one UPDATE returns a row.
  update public.orders o
     set rider_id = v_uid,
         rider_name = v_profile.full_name,
         rider_phone = v_profile.phone,
         status = 'en_route'
    from public.order_pickup_codes c
   where c.order_id = o.id
     and c.pickup_id = p_pickup_id
     and c.expires_at > now()
     and o.status = 'ready_for_pickup'
     and o.rider_id is null
  returning o.id into v_order_id;

  insert into public.claim_attempts (rider_id, success) values (v_uid, v_order_id is not null);

  if v_order_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid',
      'message', 'Invalid or already claimed.', 'tries_left', greatest(0, 4 - v_failed));
  end if;
  return jsonb_build_object('ok', true, 'order_id', v_order_id);
end $$;

-- -----------------------------------------------------------------------------
-- verify_delivery(): rider types the customer's 4-digit code. Atomic counting.
-- -----------------------------------------------------------------------------
create function public.verify_delivery(p_order_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_code char(4);
begin
  select * into v_order from public.orders
   where id = p_order_id and rider_id = auth.uid() for update;
  if not found then
    raise exception 'not your delivery' using errcode = '42501';
  end if;
  if v_order.status = 'delivered' then
    return jsonb_build_object('ok', true, 'already', true);  -- a retried request after success
  end if;
  if v_order.status not in ('en_route', 'arrived') then
    raise exception 'order is %', v_order.status using errcode = 'P0001';
  end if;
  if v_order.verify_attempts >= 5 then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'message', 'Too many wrong codes. Contact the vendor to complete this delivery.');
  end if;

  select code into v_code from public.order_delivery_codes where order_id = p_order_id;

  if v_code is distinct from p_code then
    update public.orders set verify_attempts = verify_attempts + 1 where id = p_order_id;
    return jsonb_build_object('ok', false, 'error', 'wrong',
      'message', 'That code is not right.', 'tries_left', 4 - v_order.verify_attempts);
  end if;

  if v_order.status = 'en_route' then
    update public.orders set status = 'arrived' where id = p_order_id;
  end if;
  update public.orders set status = 'delivered' where id = p_order_id;
  return jsonb_build_object('ok', true);
end $$;

-- -----------------------------------------------------------------------------
-- vendor_force_complete(): the escape hatch for a stuck delivery
-- -----------------------------------------------------------------------------
create function public.vendor_force_complete(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_vendor_staff() then
    raise exception 'vendor staff only' using errcode = '42501';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 10 then
    raise exception 'give a reason of at least 10 characters' using errcode = '22023';
  end if;
  update public.orders
     set status = 'delivered', failure_reason = coalesce(failure_reason, '') || ' [force-completed: ' || p_reason || ']'
   where id = p_order_id and status in ('en_route', 'arrived', 'delivery_failed');
  if not found then
    raise exception 'only an out-for-delivery order can be force-completed' using errcode = 'P0001';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Tracking: one read for the customer map
-- -----------------------------------------------------------------------------
create function public.order_tracking(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order_id', o.id,
    'status', o.status,
    'dest', jsonb_build_object('lat', o.dest_lat, 'lng', o.dest_lng),
    'kitchen', jsonb_build_object('lat', v.lat, 'lng', v.lng),
    'rider', case when o.status in ('en_route', 'arrived') and r.current_lat is not null
                  then jsonb_build_object('id', r.user_id, 'lat', r.current_lat, 'lng', r.current_lng,
                                          'heading', r.current_heading, 'at', r.location_updated_at,
                                          'vehicle', r.vehicle) end
  )
  from public.orders o
  cross join public.vendor v
  left join public.rider_profiles r on r.user_id = o.rider_id
  where o.id = p_order_id
    and (o.customer_id = auth.uid() or o.rider_id = auth.uid() or public.is_vendor_staff())
$$;

-- -----------------------------------------------------------------------------
-- Rider dashboard numbers
-- -----------------------------------------------------------------------------
create function public.rider_today() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'delivered_today', (select count(*) from public.orders
                         where rider_id = auth.uid() and status = 'delivered'
                           and delivered_at >= date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra'),
    'waiting_at_kitchen', (select count(*) from public.orders where status = 'ready_for_pickup'),
    'active_order_id', (select id from public.orders
                         where rider_id = auth.uid() and status in ('en_route', 'arrived')
                         order by claimed_at desc limit 1)
  )
  where public.is_rider()
$$;

-- -----------------------------------------------------------------------------
-- Vendor overview numbers (Today / This week)
-- -----------------------------------------------------------------------------
create function public.vendor_overview(p_range text default 'today') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_local_now timestamp := now() at time zone 'Africa/Accra';
  v_from timestamptz;
  v_prev_from timestamptz;
  v_result jsonb;
begin
  if not (public.is_vendor_staff() or public.is_admin()) then
    raise exception 'vendor staff only' using errcode = '42501';
  end if;
  if p_range = 'week' then
    v_from := date_trunc('week', v_local_now) at time zone 'Africa/Accra';
  else
    v_from := date_trunc('day', v_local_now) at time zone 'Africa/Accra';
  end if;
  v_prev_from := v_from - case when p_range = 'week' then interval '7 days' else interval '7 days' end;

  with o as (
    select * from public.orders where paid_at >= v_from
  ), prev as (
    select * from public.orders where paid_at >= v_prev_from and paid_at < v_prev_from + (now() - v_from)
  )
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'orders_prev', (select count(*) from prev),
    'sales', (select coalesce(sum(total), 0)::text from o where status not in ('rejected', 'cancelled')),
    'sales_prev', (select coalesce(sum(total), 0)::text from prev where status not in ('rejected', 'cancelled')),
    'rejected', (select count(*) from o where status = 'rejected'),
    'avg_cook_min', (select round(avg(extract(epoch from ready_at - accepted_at) / 60)) from o where ready_at is not null),
    'buckets', (
      select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by k), '[]'::jsonb) from (
        select case when p_range = 'week'
                    then extract(isodow from paid_at at time zone 'Africa/Accra')::int
                    else extract(hour from paid_at at time zone 'Africa/Accra')::int end as k,
               count(*) as n
          from o group by 1
      ) b
    ),
    'top', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'n', n) order by n desc), '[]'::jsonb) from (
        select i.name, sum(i.qty) as n
          from public.order_items i join o on o.id = i.order_id
         where o.status not in ('rejected', 'cancelled')
         group by i.name order by 2 desc limit 4
      ) t
    )
  ) into v_result;
  return v_result;
end $$;

-- -----------------------------------------------------------------------------
-- Grants: only these functions are callable by signed-in users.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from anon, authenticated, public;
grant execute on function
  public.my_role(), public.is_vendor_staff(), public.is_rider(), public.is_admin(),
  public.transition_allowed(public.order_status, public.order_status, text),
  public.kitchen_status(), public.quote_delivery(uuid),
  public.create_order(uuid, uuid, jsonb, text), public.order_summary(uuid),
  public.mark_ready(uuid), public.claim_order(text), public.verify_delivery(uuid, text),
  public.vendor_force_complete(uuid, text), public.order_tracking(uuid),
  public.rider_today(), public.vendor_overview(text)
to authenticated;
-- Policies on public tables call the role helpers, so anon needs them too
-- (they simply return false without a session).
grant execute on function public.kitchen_status(), public.my_role(), public.is_vendor_staff(),
  public.is_rider(), public.is_admin() to anon;
