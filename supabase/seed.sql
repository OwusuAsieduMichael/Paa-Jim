-- =============================================================================
-- Paa Jim — local seed. Runs on `supabase db reset` (local only, never prod).
-- Kitchen location and prices are SAMPLES from the design handoff: replace.
-- =============================================================================

-- The kitchen (sample coordinates: central Accra — replace with the real site)
insert into public.vendor (id, name, is_open, lat, lng, phone, max_concurrent_orders, prep_minutes, max_delivery_km)
values (1, 'Paa Jim’s Kitchen', true, 5.6037, -0.1870, '+233240000002', 6, 20, 8);

-- 10 AM – 10 PM every day
insert into public.vendor_hours (dow, opens, closes)
select d, '10:00', '22:00' from generate_series(0, 6) d;

insert into public.delivery_fee_bands (min_km, max_km, fee) values
  (0, 2, 10.00), (2, 4, 15.00), (4, 6, 20.00), (6, 8, 25.00);

insert into public.menu_categories (name, sort) values ('Jollof', 1), ('Fried rice', 2), ('Drinks', 3);

insert into public.menu_items (category_id, name, description, price, is_popular, tint, sort, is_available)
select c.id, v.name, v.descr, v.price, v.popular, v.tint, v.sort, v.avail
from (values
  ('Jollof',     'Jollof & Chicken',        'Smoky party jollof, grilled chicken, coleslaw and shito', 55.00, true,  '#F9DCCB', 1, true),
  ('Jollof',     'Jollof & Beef',           'Stewed beef, coleslaw and shito',                         50.00, false, '#F3D3C2', 2, true),
  ('Jollof',     'Jollof & Fried Fish',     'Fried fish, coleslaw and shito',                          60.00, false, '#F7D5B8', 3, true),
  ('Jollof',     'Assorted Jollof',         'Chicken, beef, sausage and boiled egg',                   70.00, true,  '#F5C9B3', 4, true),
  ('Fried rice', 'Fried Rice & Chicken',    'Veggie fried rice, grilled chicken, shito',               55.00, false, '#F6E5C2', 1, true),
  ('Fried rice', 'Fried Rice & Beef',       'Stewed beef, coleslaw and shito',                         50.00, false, '#F3E1C0', 2, true),
  ('Fried rice', 'Fried Rice & Fried Fish', 'Fried fish, coleslaw and shito',                          60.00, false, '#EFE2C8', 3, true),
  ('Fried rice', 'Assorted Fried Rice',     'Chicken, beef, sausage and boiled egg',                   70.00, true,  '#F1DDB0', 4, true),
  ('Drinks',     'Bottled Water 500ml',     'Chilled',                                                  5.00, true,  '#DCEBF5', 1, true),
  ('Drinks',     'Bottled Water 1.5L',      'Chilled',                                                 10.00, false, '#CFE3F0', 2, true),
  ('Drinks',     'Soft drink · can',        'Cola, orange or lemon-lime, 330ml',                       10.00, false, '#F3D0DA', 3, true),
  ('Drinks',     'Soft drink · glass bottle','Cola, orange or lemon-lime, 300ml',                       8.00, false, '#E3EAD5', 4, true),
  ('Drinks',     'Malt · glass bottle',     'Chilled, 330ml',                                          10.00, false, '#EFEAE6', 5, false)
) as v(cat, name, descr, price, popular, tint, sort, avail)
join public.menu_categories c on c.name = v.cat;

-- -----------------------------------------------------------------------------
-- Four local test accounts, one per role. OTP for all is 123456
-- (see [auth.sms.test_otp] in config.toml).
-- -----------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', '233240000001', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', '233240000002', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', '233240000003', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', '233240000004', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text, 'phone',
       jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'phone_verified', true), now(), now(), now()
from auth.users u where u.phone like '23324000000_';

update public.profiles set role = 'customer',     full_name = 'Ama Mensah'     where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set role = 'vendor_staff', full_name = 'Kitchen Tablet'  where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set role = 'rider',        full_name = 'Kwame Asante'    where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set role = 'admin',        full_name = 'Admin One'       where id = '44444444-4444-4444-4444-444444444444';

insert into public.rider_profiles (user_id, vehicle, on_shift) values ('33333333-3333-3333-3333-333333333333', 'Motorbike', true);

-- The customer's home: ~2.8 km from the kitchen (falls in the 2–4 km band)
insert into public.addresses (user_id, label, gps_code, landmark, lat, lng, is_default)
values ('11111111-1111-1111-1111-111111111111', 'Home', 'AK-485-9302', 'Blue gate opposite the church', 5.6290, -0.1870, true);
