-- The delivery pin (lat/lng from the phone's live location or a tap on the map)
-- is what the fee and the rider's navigation use. The Ghana Post GPS code is
-- now an optional extra for the rider; when given it must still look valid.
alter table public.addresses alter column gps_code drop not null;
alter table public.orders alter column gps_code drop not null;
