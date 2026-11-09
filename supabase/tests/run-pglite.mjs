// Offline database test harness.
// Loads the real migrations + seed into an in-process Postgres (PGlite + PostGIS)
// with a minimal stand-in for Supabase's auth schema and API roles, then
// exercises the order lifecycle, RLS and the RPC guarantees.
//
//   node supabase/tests/run-pglite.mjs          (needs @electric-sql/pglite + pglite-postgis)
//
// The same assertions should also be run against `supabase start` once Docker
// is available; this harness exists so the schema can be checked without it.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const modPath = process.env.PGLITE_DIR ?? '';
const { PGlite } = await import(join(modPath, '@electric-sql/pglite/dist/index.js').replace(/^([A-Z]:)/i, 'file:///$1'));
const { postgis } = await import(join(modPath, '@electric-sql/pglite-postgis/dist/index.js').replace(/^([A-Z]:)/i, 'file:///$1'));
const { pgcrypto } = await import(join(modPath, '@electric-sql/pglite/dist/contrib/pgcrypto.js').replace(/^([A-Z]:)/i, 'file:///$1'));

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite({ extensions: { postgis, pgcrypto } });

const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role supabase_admin nologin;
grant usage on schema public to anon, authenticated, service_role;
create schema extensions; grant usage on schema extensions to anon, authenticated, service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, phone text unique,
  phone_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz);
create table auth.identities (
  id uuid primary key, user_id uuid references auth.users(id), provider_id text, provider text,
  identity_data jsonb, created_at timestamptz, updated_at timestamptz, last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
create publication supabase_realtime;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
`;

let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
};
const throwsLike = async (name, fn, re) => {
  try { await fn(); ok(name, false, '(did not throw)'); }
  catch (e) { ok(name, re.test(e.message), `(threw: ${e.message})`); }
};

const IDS = {
  customer: '11111111-1111-1111-1111-111111111111',
  vendor:   '22222222-2222-2222-2222-222222222222',
  rider:    '33333333-3333-3333-3333-333333333333',
  admin:    '44444444-4444-4444-4444-444444444444',
};

// Run statements as a given API user (role + JWT sub), like PostgREST does.
async function as(who, sql, params = []) {
  const sub = who === 'anon' ? '' : IDS[who];
  const role = who === 'anon' ? 'anon' : 'authenticated';
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub}', false); set role ${role};`);
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role;'); }
}
const rpc = async (who, fn, args) => {
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
  return (await as(who, sql, keys.map((k) => args[k]))).rows[0].r;
};
const sys = (sql, p) => db.query(sql, p); // service role / postgres

// ---------------------------------------------------------------------------
process.on('unhandledRejection', (e) => { console.log('FATAL:', e.message, e.query ? ' in: ' + e.query : ''); process.exit(1); });
console.log('Loading schema');
await db.exec(SUPABASE_STUB);
const migDir = join(root, 'migrations');
for (const f of readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(join(migDir, f), 'utf8')); console.log(`  ✓ ${f}`); }
  catch (e) { console.log(`  ✗ ${f}: ${e.message}`); process.exit(1); }
}
for (const f of ['catalogue.sql', 'seed.sql']) {
  try { await db.exec(readFileSync(join(root, f), 'utf8')); console.log(`  ✓ ${f}`); }
  catch (e) { console.log(`  ✗ ${f}: ${e.message}`); process.exit(1); }
}

// The kitchen must be "open" regardless of when tests run.
await sys(`update public.vendor_hours set opens = '00:00', closes = '23:59:59'`);

console.log('\nCatalogue & capacity');
const menu = await as('anon', 'select id, name, price, is_available from public.menu_items order by name');
ok('anon can read the menu (17 items)', menu.rows.length === 17);
const ks = await rpc('anon', 'kitchen_status', {});
ok('kitchen_status says accepting', ks.accepting === true, JSON.stringify(ks));
const item = (n) => menu.rows.find((r) => r.name === n).id;

console.log('\nCustomer places an order');
const addr = (await as('customer', 'select id from public.addresses')).rows[0].id;
const quote = await rpc('customer', 'quote_delivery', { p_address_id: addr });
ok('delivery quote is in the 2–5 km band at GH₵5', Number(quote.fee) === 5 && quote.band === '2.00–5.00 km', JSON.stringify(quote));
const orderId = randomUUID();
const items = JSON.stringify([
  { menu_item_id: item('Jollof & Chicken'), qty: 1, note: 'Extra shito' },
  { menu_item_id: item('Assorted Fried Rice'), qty: 1 },
  { menu_item_id: item('Fanta · can'), qty: 1 },
]);
const created = await rpc('customer', 'create_order', { p_order_id: orderId, p_address_id: addr, p_items: items, p_rider_note: 'Call at the junction' });
ok('server computes subtotal 117.00', created.subtotal === '117.00', created.subtotal);
ok('server computes total 122.00 (GH₵5 delivery)', created.total === '122.00', created.total);
ok('order number assigned', /^PJ-\d+$/.test(created.order_no), created.order_no);
const again = await rpc('customer', 'create_order', { p_order_id: orderId, p_address_id: addr, p_items: '[]' });
ok('create_order is idempotent on the client uuid', again.order_no === created.order_no);
await sys(`update public.menu_items set is_available = false where name = 'Malta Guinness · can'`);
await throwsLike('sold-out item is refused', () => rpc('customer', 'create_order', {
  p_order_id: randomUUID(), p_address_id: addr, p_items: JSON.stringify([{ menu_item_id: item('Malta Guinness · can'), qty: 1 }]) }), /sold out/);
await throwsLike('vendor cannot place orders', () => rpc('vendor', 'create_order', {
  p_order_id: randomUUID(), p_address_id: addr, p_items: items }), /only customers|address/);
const code = (await as('customer', 'select code from public.order_delivery_codes where order_id = $1', [orderId])).rows[0]?.code;
ok('customer can read their 4-digit delivery code', /^\d{4}$/.test(code ?? ''), code);

console.log('\nRLS: who can see what');
ok('vendor cannot see a pending_payment order', (await as('vendor', 'select 1 from public.orders where id = $1', [orderId])).rows.length === 0);
ok('rider cannot see an unassigned order', (await as('rider', 'select 1 from public.orders where id = $1', [orderId])).rows.length === 0);
ok('anon cannot see orders', await as('anon', 'select 1 from public.orders').then((r) => r.rows.length === 0, () => true));
ok('rider cannot read delivery codes', (await as('rider', 'select 1 from public.order_delivery_codes')).rows.length === 0);
await as('customer', `update public.orders set status = 'paid' where id = $1`, [orderId]).catch(() => {});
ok('customer cannot mark own order paid', (await sys('select status from public.orders where id = $1', [orderId])).rows[0].status === 'pending_payment');
await throwsLike('vendor cannot change a price', () => as('vendor', `update public.menu_items set price = 1 where id = $1`, [item('Jollof & Chicken')]), /permission denied/);
await throwsLike('vendor cannot change an order total', () => as('vendor', `update public.orders set total = 1 where id = $1`, [orderId]), /permission denied/);
await throwsLike('customer cannot promote self to admin', () => as('customer', `update public.profiles set role = 'admin' where id = $1`, [IDS.customer]), /permission denied/);
const stockUpd = await as('vendor', `update public.menu_items set is_available = false where id = $1 returning id`, [item('Bottled Water 1.5L')]);
ok('vendor CAN toggle stock', stockUpd.rows.length === 1);
await as('vendor', `update public.menu_items set is_available = true where id = $1`, [item('Bottled Water 1.5L')]);

console.log('\nPayment (Node, service role)');
await sys(`insert into public.payments (order_id, reference, network, phone, amount, status) values ($1, 'ref-1', 'mtn', '+233240000001', 122, 'success')`, [orderId]);
await sys(`update public.orders set status = 'paid', momo_network = 'mtn', momo_last4 = '0001' where id = $1`, [orderId]);
ok('vendor now sees the paid order', (await as('vendor', 'select 1 from public.orders where id = $1', [orderId])).rows.length === 1);

console.log('\nKitchen');
await throwsLike('vendor cannot skip to ready by UPDATE', () => as('vendor', `update public.orders set status = 'ready_for_pickup' where id = $1`, [orderId]), /illegal/);
await throwsLike('vendor reject needs a reason', () => as('vendor', `update public.orders set status = 'rejected' where id = $1`, [orderId]), /reason/);
await as('vendor', `update public.orders set status = 'accepted' where id = $1`, [orderId]);
const ready = await rpc('vendor', 'mark_ready', { p_order_id: orderId });
ok('mark_ready returns a 6-digit pickup id', /^\d{6}$/.test(ready.pickup_id), JSON.stringify(ready));
ok('customer cannot see the pickup id', (await as('customer', 'select 1 from public.order_pickup_codes')).rows.length === 0);
ok('rider cannot see the pickup id', (await as('rider', 'select 1 from public.order_pickup_codes')).rows.length === 0);

console.log('\nRider claims');
const wrongPid = ready.pickup_id === '000000' ? '000001' : '000000';
const bad = await rpc('rider', 'claim_order', { p_pickup_id: wrongPid });
ok('wrong pickup id → vague "invalid or already claimed"', bad.ok === false && bad.error === 'invalid');
ok('failed attempt is recorded (not rolled back)', (await sys(`select count(*)::int n from public.claim_attempts where not success`)).rows[0].n === 1);
const good = await rpc('rider', 'claim_order', { p_pickup_id: ready.pickup_id });
ok('right pickup id claims the order', good.ok === true && good.order_id === orderId, JSON.stringify(good));
const dup = await rpc('rider', 'claim_order', { p_pickup_id: ready.pickup_id });
ok('second claim with the same id fails (compare-and-set)', dup.ok === false);
const st = (await sys('select status, rider_id, claimed_at from public.orders where id = $1', [orderId])).rows[0];
ok('order is en_route with rider + claimed_at', st.status === 'en_route' && st.rider_id === IDS.rider && st.claimed_at);
ok('pickup id deleted once claimed', (await sys('select 1 from public.order_pickup_codes where order_id = $1', [orderId])).rows.length === 0);

console.log('\nLocation pings');
await as('rider', `insert into public.rider_locations (rider_id, order_id, location) values ($1, $2, 'SRID=4326;POINT(-0.1870 5.6100)')`, [IDS.rider, orderId]);
const rp = (await sys('select current_lat, current_lng from public.rider_profiles where user_id = $1', [IDS.rider])).rows[0];
ok('ping updates rider_profiles lat/lng', Math.abs(rp.current_lat - 5.61) < 1e-6 && Math.abs(rp.current_lng + 0.187) < 1e-6, JSON.stringify(rp));
const trk = await rpc('customer', 'order_tracking', { p_order_id: orderId });
ok('customer tracking shows the rider position', trk?.rider?.lat && Math.abs(trk.rider.lat - 5.61) < 1e-6, JSON.stringify(trk));

console.log('\nDelivery');
await throwsLike('rider cannot set delivered directly', () => as('rider', `update public.orders set status = 'delivered' where id = $1`, [orderId]), /illegal/);
await as('rider', `update public.orders set status = 'arrived' where id = $1`, [orderId]);
const wrongCode = code === '0000' ? '1111' : '0000';
const v1 = await rpc('rider', 'verify_delivery', { p_order_id: orderId, p_code: wrongCode });
ok('wrong delivery code counted', v1.ok === false && v1.tries_left === 4, JSON.stringify(v1));
const v2 = await rpc('rider', 'verify_delivery', { p_order_id: orderId, p_code: code });
ok('right delivery code delivers', v2.ok === true);
ok('order delivered with timestamp', (await sys('select status, delivered_at from public.orders where id = $1', [orderId])).rows[0].status === 'delivered');
const v3 = await rpc('rider', 'verify_delivery', { p_order_id: orderId, p_code: code });
ok('retried verify after success is a no-op', v3.ok === true && v3.already === true);

console.log('\nRating');
await as('customer', `insert into public.ratings (order_id, customer_id, food_stars, rider_thumb, tags) values ($1, $2, 5, true, '{Tasty,Hot}')`, [orderId, IDS.customer]);
ok('customer rated delivered order', (await sys('select food_stars from public.ratings where order_id = $1', [orderId])).rows[0].food_stars === 5);

console.log('\nRefund on reject + verify lockout');
const o2 = randomUUID();
await rpc('customer', 'create_order', { p_order_id: o2, p_address_id: addr, p_items: JSON.stringify([{ menu_item_id: item('Jollof & Beef'), qty: 2 }]) });
await sys(`insert into public.payments (order_id, reference, network, phone, amount, status) values ($1, 'ref-2', 'vod', '+233240000001', 75, 'success')`, [o2]);
await sys(`update public.orders set status = 'paid' where id = $1`, [o2]);
await as('vendor', `update public.orders set status = 'rejected', reject_reason = 'Out of beef' where id = $1`, [o2]);
const rf = (await sys('select amount, status, reason from public.refunds where order_id = $1', [o2])).rows[0];
ok('rejecting a paid order queues a refund for the full amount', rf && Number(rf.amount) === 75 && rf.status === 'pending', JSON.stringify(rf));

const o3 = randomUUID();
await rpc('customer', 'create_order', { p_order_id: o3, p_address_id: addr, p_items: JSON.stringify([{ menu_item_id: item('Jollof & Beef'), qty: 1 }]) });
await sys(`update public.orders set status = 'paid' where id = $1`, [o3]);
await as('vendor', `update public.orders set status = 'accepted' where id = $1`, [o3]);
const r3 = await rpc('vendor', 'mark_ready', { p_order_id: o3 });
await rpc('rider', 'claim_order', { p_pickup_id: r3.pickup_id });
const c3 = (await sys('select code from public.order_delivery_codes where order_id = $1', [o3])).rows[0].code;
const w3 = c3 === '9999' ? '8888' : '9999';
for (let i = 0; i < 5; i++) await rpc('rider', 'verify_delivery', { p_order_id: o3, p_code: w3 });
const locked = await rpc('rider', 'verify_delivery', { p_order_id: o3, p_code: c3 });
ok('5 wrong codes lock verification (even the right code)', locked.ok === false && locked.error === 'locked', JSON.stringify(locked));
await throwsLike('force-complete needs a 10+ char reason', () => rpc('vendor', 'vendor_force_complete', { p_order_id: o3, p_reason: 'short' }), /10 characters/);
await rpc('vendor', 'vendor_force_complete', { p_order_id: o3, p_reason: 'Customer confirmed by phone call' });
ok('vendor force-completes the stuck delivery', (await sys('select status from public.orders where id = $1', [o3])).rows[0].status === 'delivered');

console.log('\nClaim rate limit');
for (let i = 0; i < 5; i++) await rpc('rider', 'claim_order', { p_pickup_id: '999999' });
const rl = await rpc('rider', 'claim_order', { p_pickup_id: '999999' });
ok('5 failed claims in 10 min locks claiming', rl.error === 'locked', JSON.stringify(rl));

console.log('\nAdmin & metrics');
await throwsLike('admin action needs a 10+ char reason', () => sys(`insert into public.admin_actions (admin_id, action, target_type, reason) values ($1, 'x', 'y', 'short')`, [IDS.admin]), /check/);
await sys(`update public.menu_items set price = 58 where id = $1`, [item('Jollof & Chicken')]);
ok('price change is recorded in history', (await sys('select count(*)::int n from public.menu_price_history where menu_item_id = $1', [item('Jollof & Chicken')])).rows[0].n === 2);
const dm = (await sys('select * from public.daily_metrics limit 1')).rows[0];
ok('daily_metrics view computes', dm && dm.delivered >= 2, JSON.stringify(dm));
const ov = await rpc('vendor', 'vendor_overview', { p_range: 'today' });
ok('vendor_overview returns KPIs', ov && Number(ov.orders) >= 3 && Array.isArray(ov.top), JSON.stringify(ov).slice(0, 200));
const transitions = (await sys('select count(*)::int n from public.order_transitions')).rows[0].n;
ok('order_transitions has 20 rows', transitions === 20, String(transitions));

console.log('\nDelivery bands (Effiduase)');
const addAddr = async (gps, lat) => (await as('customer',
  `insert into public.addresses (user_id, label, gps_code, lat, lng) values (auth.uid(), 'Other', $1, $2, -1.3977) returning id`, [gps, lat])).rows[0].id;
const near = await addAddr('AS-100-1000', 6.8516);   // ~1 km
ok('under 2 km costs GH₵4', Number((await rpc('customer', 'quote_delivery', { p_address_id: near })).fee) === 4);
const far = await addAddr('AS-200-2000', 6.9056);    // ~7 km
ok('over 5 km costs GH₵7', Number((await rpc('customer', 'quote_delivery', { p_address_id: far })).fee) === 7);
const tooFar = await addAddr('AS-300-3000', 6.9506); // ~12 km
ok('over 10 km is not deliverable', (await rpc('customer', 'quote_delivery', { p_address_id: tooFar })).deliverable === false);
await throwsLike('ordering to an address over 10 km is refused', () => rpc('customer', 'create_order', {
  p_order_id: randomUUID(), p_address_id: tooFar, p_items: JSON.stringify([{ menu_item_id: item('Jollof & Beef'), qty: 1 }]) }), /outside our delivery area/);

console.log('\nSign-up & phone change (0004)');
const newId = randomUUID();
await sys(`insert into auth.users (id, phone, raw_user_meta_data) values ($1, '233559876543', $2)`, [newId, JSON.stringify({ full_name: '  Efua Owusu  ' })]);
const np = (await sys('select role, full_name, phone from public.profiles where id = $1', [newId])).rows[0];
ok('sign-up copies the trimmed name into the profile', np?.full_name === 'Efua Owusu', JSON.stringify(np));
ok('sign-up always makes a customer', np?.role === 'customer', JSON.stringify(np));
await sys(`insert into auth.users (id, phone, raw_user_meta_data) values ($1, '233559876544', $2)`, [randomUUID(), JSON.stringify({ full_name: '   ' })]);
ok('blank name is stored as null', (await sys(`select full_name from public.profiles p join auth.users u on u.id = p.id where u.phone = '233559876544'`)).rows[0].full_name === null);
await sys(`update auth.users set phone = '233201112222' where id = $1`, [newId]);
ok('confirmed phone change updates profiles.phone', (await sys('select phone from public.profiles where id = $1', [newId])).rows[0].phone === '233201112222');
await throwsLike('customer cannot edit their own phone column', () => as('customer', `update public.profiles set phone = '233200000000' where id = $1`, [IDS.customer]), /permission denied/);
await throwsLike('customer cannot make themselves admin', () => as('customer', `update public.profiles set role = 'admin' where id = $1`, [IDS.customer]), /permission denied/);
ok('customer CAN edit their own name', (await as('customer', `update public.profiles set full_name = 'Ama M.' where id = $1 returning id`, [IDS.customer])).rows.length === 1);

console.log('\nProfile photos (0006)');
const photo = (uid) => `https://x.supabase.co/storage/v1/object/public/avatars/${uid}/abc.jpg`;
ok('customer can set a photo in their own folder', (await as('customer', `update public.profiles set avatar_url = $2 where id = $1 returning id`, [IDS.customer, photo(IDS.customer)])).rows.length === 1);
await throwsLike('a photo from someone else\'s folder is refused', () => as('customer', `update public.profiles set avatar_url = $2 where id = $1`, [IDS.customer, photo(IDS.rider)]), /uploaded from the app/);
await throwsLike('an outside link is refused', () => as('customer', `update public.profiles set avatar_url = 'https://evil.example/x.jpg' where id = $1`, [IDS.customer]), /uploaded from the app/);
const withPhotos = (await sys('select customer_avatar_url, rider_avatar_url from public.orders where id = $1', [orderId])).rows[0];
ok('existing orders pick up the customer\'s new photo', withPhotos.customer_avatar_url === photo(IDS.customer), JSON.stringify(withPhotos));
await as('rider', `update public.profiles set avatar_url = $2 where id = $1`, [IDS.rider, photo(IDS.rider)]);
ok('the rider\'s photo shows on the orders they carried', (await sys('select rider_avatar_url from public.orders where id = $1', [orderId])).rows[0].rider_avatar_url === photo(IDS.rider));
const o6 = randomUUID();
await rpc('customer', 'create_order', { p_order_id: o6, p_address_id: addr, p_items: JSON.stringify([{ menu_item_id: item('Jollof & Beef'), qty: 1 }]) });
ok('a new order copies the customer\'s photo', (await sys('select customer_avatar_url from public.orders where id = $1', [o6])).rows[0].customer_avatar_url === photo(IDS.customer));
ok('customer can remove their photo', (await as('customer', `update public.profiles set avatar_url = null where id = $1 returning id`, [IDS.customer])).rows.length === 1);

console.log('\nSaved MoMo wallets (0007)');
const w1 = (await as('customer', `insert into public.momo_wallets (network, phone) values ('mtn', '233559776547') returning id, is_default`)).rows[0];
ok('first wallet becomes the default', w1?.is_default === true, JSON.stringify(w1));
const w2 = (await as('customer', `insert into public.momo_wallets (network, phone, label, is_default) values ('vod', '233201234567', 'Work', true) returning id`)).rows[0];
const defs = (await as('customer', `select id from public.momo_wallets where is_default`)).rows;
ok('choosing a new default clears the old one', defs.length === 1 && defs[0].id === w2.id, JSON.stringify(defs));
await throwsLike('a badly formed number is refused', () => as('customer', `insert into public.momo_wallets (network, phone) values ('mtn', '0559776547')`), /check constraint/);
await throwsLike('the same number twice is refused', () => as('customer', `insert into public.momo_wallets (network, phone) values ('mtn', '233559776547')`), /duplicate key|unique/);
ok('other users cannot see my wallets', (await as('rider', `select id from public.momo_wallets`)).rows.length === 0);
await throwsLike('cannot save a wallet onto someone else', () => as('rider', `insert into public.momo_wallets (user_id, network, phone) values ($1, 'mtn', '233541112222')`, [IDS.customer]), /row-level security/);
await as('customer', `delete from public.momo_wallets where id = $1`, [w2.id]);
ok('deleting the default promotes the remaining wallet', (await as('customer', `select is_default from public.momo_wallets where id = $1`, [w1.id])).rows[0].is_default === true);
for (const n of ['233241000001', '233241000002', '233241000003', '233241000004']) await as('customer', `insert into public.momo_wallets (network, phone) values ('mtn', $1)`, [n]);
await throwsLike('at most 5 wallets', () => as('customer', `insert into public.momo_wallets (network, phone) values ('mtn', '233241000005')`), /up to 5/);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
