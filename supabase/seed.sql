-- =============================================================================
-- Paa Jim — local test accounts. Runs on `supabase db reset` AFTER catalogue.sql.
-- LOCAL ONLY: never run this on a hosted project (it writes straight into auth.users).
-- =============================================================================

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

-- The customer's home: ~2.8 km north of the Effiduase kitchen (2–5 km band, GH₵5)
insert into public.addresses (user_id, label, gps_code, landmark, lat, lng, is_default)
values ('11111111-1111-1111-1111-111111111111', 'Home', 'AS-485-9302', 'Blue gate opposite the church', 6.8678, -1.3977, true);
