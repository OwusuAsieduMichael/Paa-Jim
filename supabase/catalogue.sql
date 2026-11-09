-- =============================================================================
-- Paa Jim — catalogue: kitchen, hours, delivery fees, menu.
-- Safe for ANY environment (local, staging, production): no users, no secrets.
-- Run ONCE on a new, empty project: `npx supabase db query --linked -f supabase/catalogue.sql`
-- (or paste it into the SQL Editor). Running it twice fails on the vendor row.
-- Local `supabase db reset` runs it before seed.sql (config.toml [db.seed]).
--
-- Kitchen: Effiduase, Ashanti (town centre: 6.8426, -1.3977). Replace with the
-- exact pin once the kitchen site is fixed: right-click the spot in Google Maps
-- and copy the two numbers.
-- Prices from the owner's list: meals GH₵35–60; water GH₵7/10; Coke, Fanta, Sprite
-- GH₵17; Pepsi, Malta GH₵20. Rice & stew prices are placeholders to confirm.
-- Photos are bundled in the app (apps/mobile/src/lib/menuImages.ts), matched by name.
-- =============================================================================

insert into public.vendor (id, name, is_open, lat, lng, phone, max_concurrent_orders, prep_minutes, max_delivery_km)
values (1, 'Paa Jim’s Kitchen', true, 6.8426, -1.3977, '+233240000002', 6, 20, 10);

-- 10 AM – 7 PM every day (0 = Sunday)
insert into public.vendor_hours (dow, opens, closes)
select d, '10:00', '19:00' from generate_series(0, 6) d;

-- 0–2 km GH₵4 · 2–5 km GH₵5 · over 5 km GH₵7 (up to max_delivery_km above)
insert into public.delivery_fee_bands (min_km, max_km, fee) values
  (0, 2, 4.00), (2, 5, 5.00), (5, 10, 7.00);

-- Drinks keeps id 3 (the app treats category 3 as drinks); Rice & stew is added after it but sorts before it.
insert into public.menu_categories (name, sort) values ('Jollof', 1), ('Fried rice', 2), ('Drinks', 4);
insert into public.menu_categories (name, sort) values ('Rice & stew', 3);

insert into public.menu_items (category_id, name, description, price, is_popular, tint, sort, is_available)
select c.id, v.name, v.descr, v.price, v.popular, v.tint, v.sort, v.avail
from (values
  ('Jollof',     'Jollof & Chicken',        'Smoky party jollof, grilled chicken, coleslaw and shito', 40.00, true,  '#F9DCCB', 1, true),
  ('Jollof',     'Jollof & Beef',           'Stewed beef, coleslaw and shito',                         35.00, false, '#F3D3C2', 2, true),
  ('Jollof',     'Jollof & Fried Fish',     'Fried fish, coleslaw and shito',                          45.00, false, '#F7D5B8', 3, true),
  ('Jollof',     'Assorted Jollof',         'Chicken, beef, sausage and boiled egg',                   55.00, true,  '#F5C9B3', 4, true),
  ('Fried rice', 'Fried Rice & Chicken',    'Veggie fried rice, grilled chicken, shito',               45.00, false, '#F6E5C2', 1, true),
  ('Fried rice', 'Fried Rice & Beef',       'Stewed beef, coleslaw and shito',                         40.00, false, '#F3E1C0', 2, true),
  ('Fried rice', 'Fried Rice & Fried Fish', 'Fried fish, coleslaw and shito',                          50.00, false, '#EFE2C8', 3, true),
  ('Fried rice', 'Assorted Fried Rice',     'Chicken, beef, sausage and boiled egg',                   60.00, true,  '#F1DDB0', 4, true),
  ('Rice & stew','Plain Rice & Fish Stew',  'Grilled tilapia, rich tomato stew, veggie rice',           45.00, false, '#F3D3C2', 1, true),
  ('Rice & stew','Plain Rice, Stew & Plantain','Fried plantain, boiled egg, stew and fresh salad',       40.00, false, '#F6E0C8', 2, true),
  ('Drinks',     'Bottled Water 500ml',     'Awake, chilled',                                          7.00, true,  '#DCEBF5', 1, true),
  ('Drinks',     'Bottled Water 1.5L',      'Awake, chilled',                                         10.00, false, '#CFE3F0', 2, true),
  ('Drinks',     'Coca-Cola · can',         'Ice-cold, 330ml',                                        17.00, true,  '#F3D0DA', 3, true),
  ('Drinks',     'Fanta · can',             'Orange, ice-cold, 330ml',                                17.00, false, '#F9E0C4', 4, true),
  ('Drinks',     'Sprite · can',            'Lemon-lime, ice-cold, 330ml',                            17.00, false, '#E3EAD5', 5, true),
  ('Drinks',     'Pepsi · can',             'Ice-cold, 330ml',                                        20.00, false, '#D6E0F3', 6, true),
  ('Drinks',     'Malta Guinness · can',    'Non-alcoholic malt, chilled, 330ml',                     20.00, false, '#F5EBC4', 7, true)
) as v(cat, name, descr, price, popular, tint, sort, avail)
join public.menu_categories c on c.name = v.cat;
