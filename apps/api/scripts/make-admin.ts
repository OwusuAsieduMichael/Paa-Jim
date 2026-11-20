// Creates (or promotes) an admin account from the command line.
// Use it once to create the first admin, or as a break-glass if nobody can sign in.
// After that, add and remove admins in the dashboard (Team → Admins).
//
//   npm run make-admin -w api -- 0509686253 "Michael Asiedu"
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/api/.env (never commit it).
import { createClient } from '@supabase/supabase-js';
import { ensureTotpLabel } from '../src/lib/totp-label.js';

const [rawPhone, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(' ').trim();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!url || !key) fail('Put SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/api/.env first.');
if (!rawPhone || fullName.length < 2) fail('Usage: npm run make-admin -w api -- 0509686253 "Full Name"');

const d = rawPhone.replace(/\D/g, '');
const phone = d.startsWith('233') && d.length === 12 ? d : d.startsWith('0') && d.length === 10 ? '233' + d.slice(1) : d.length === 9 ? '233' + d : null;
if (!phone) fail(`“${rawPhone}” isn’t a Ghana mobile number.`);

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: existing, error: findErr } = await db.from('profiles').select('id, role').eq('phone', phone).maybeSingle();
if (findErr) fail(`Couldn’t look up the number: ${findErr.message}`);

let id: string;
if (existing) {
  if (existing.role === 'rider' || existing.role === 'vendor_staff') fail(`This number is a ${existing.role === 'rider' ? 'rider' : 'kitchen staff'} account. Use a different number for admin.`);
  id = existing.id;
} else {
  const { data, error } = await db.auth.admin.createUser({ phone, phone_confirm: true });
  if (error || !data.user) fail(`Couldn’t create the login: ${error?.message ?? 'unknown error'}`);
  id = data.user.id;
}

const { error: upErr } = await db.from('profiles').update({ role: 'admin', full_name: fullName, is_active: true }).eq('id', id);
if (upErr) fail(`Couldn’t set the admin role: ${upErr.message}`);
try { await ensureTotpLabel(db, id, phone); } catch (e) { fail((e as Error).message); }
if (existing) await db.auth.admin.signOut(id).catch(() => undefined);

await db.from('admin_actions').insert({
  admin_id: id, action: 'admin.create', target_type: 'profile', target_id: id,
  reason: 'Admin created from the command line (make-admin script)', payload: { phone, promoted: Boolean(existing) },
});

const local = '0' + phone.slice(3);
console.log(`\n✓ ${fullName} (${local}) is now an admin${existing ? ' (existing account upgraded)' : ''}.`);
console.log('  Sign in at https://admin.paajim.app with this number, then set up your authenticator app.\n');
