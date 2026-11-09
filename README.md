# Paa Jim

Single-vendor community food delivery for Ghana: customers order jollof, fried rice and drinks and pay by mobile money. The kitchen accepts and cooks, and Paa Jim's own riders deliver. Built on the GoXpress Build & Launch Handbook.

| Path | What |
|---|---|
| `apps/mobile` | React Native (Expo SDK 58, expo-router). One app; customer, vendor and rider see different screens by role |
| `apps/api` | Node.js + Fastify. Paystack MoMo, webhooks, reconciliation, refunds, push/SMS, admin endpoints |
| `supabase/` | Postgres + PostGIS schema, RLS, order state machine, RPCs, seed, offline DB tests |
| `design/` | The HTML design references the screens were built from |

## Try the app now (demo mode, no backend)

You need Node 20+ and an Android phone with **Expo Go**.

```bash
npm install
npm run mobile          # scan the QR code with Expo Go
```

With no Supabase keys configured, the app runs on an in-memory demo backend, and any 6-digit code works. There are no passwords: **Create account** takes a name and phone number, and **I already have an account** logs in with just the phone number. These numbers already have accounts:

| Number | Role |
|---|---|
| `24 000 0001` | Customer (Ama Mensah) |
| `24 000 0002` | Vendor (kitchen tablet) |
| `24 000 0003` | Rider |

Logging in with any other number shows "No account with this number". Create an account first. Demo accounts reset when the app reloads.

In demo mode a customer's order moves through the kitchen and rider stages on timers, so you can watch live tracking. The vendor and rider accounts have sample orders to work. Pickup ID `284615` is ready to claim.

> Expo Go can't receive push notifications, and on Android it can't run background location. Both need a development build (below).

## Full local stack

1. **Docker Desktop**. It needs WSL2: in an *admin* PowerShell run `wsl --install`, reboot, then start Docker Desktop.
2. **Supabase**:
   ```bash
   npx supabase start        # Postgres+PostGIS, Auth, Realtime, Studio
   npx supabase db reset     # applies migrations + seed.sql
   npx supabase status       # prints the API URL, anon key, service-role key
   ```
   > On this PC, executables can't run from the D: drive. Copy `node_modules/@supabase/cli-windows-x64/bin/supabase.exe` to `%LOCALAPPDATA%\supabase-cli\` and set `SUPABASE_CLI_BINARY_OVERRIDE` to that path.
3. **API**: copy `apps/api/.env.example` to `apps/api/.env`, fill in the service-role key and Paystack **test** key, then `npm run api`. For webhooks, run `ngrok http 3000` and register `https://<id>.ngrok-free.app/webhooks/paystack` in the Paystack dashboard (test mode).
4. **App**: copy `apps/mobile/.env.example` to `apps/mobile/.env`, fill in the Supabase URL, anon key and your PC's LAN IP for the API, then `npm run mobile`.

Local test accounts (OTP `123456`, see `supabase/config.toml`): `+233 24 000 0001` customer · `…0002` vendor · `…0003` rider · `…0004` admin.

## Development build (push, background location, maps key)

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init                       # creates the EAS project
npx eas-cli@latest build --profile development --platform android
```

Install the APK on your phone. From then on, `npm run mobile` hot-reloads into it. `google-services.json` (Firebase) goes in as an EAS file secret named `GOOGLE_SERVICES_JSON`, never in git.

## Tests

```bash
npm run typecheck                 # mobile + api
npm test -w api                   # 10 API tests (signatures, duplicate webhooks, ownership, money)
# database: 49 checks on the real migrations (in-process Postgres + PostGIS)
mkdir -p /tmp/pg && (cd /tmp/pg && npm i @electric-sql/pglite @electric-sql/pglite-postgis)
PGLITE_DIR=/tmp/pg/node_modules node supabase/tests/run-pglite.mjs
```

## Rules the code follows (Handbook §1.3)

- **Vendor controls food, admin controls money.** Vendor staff can only change order status (through the transition trigger) and item availability. Prices, refunds, riders and kill switches go through the admin API.
- **If it's safe under RLS, the client talks to Supabase directly.** Anything that needs a secret, touches money or runs with no user present goes through the Node service.
- **The Node service bypasses RLS**, so every handler checks ownership or role itself (`apps/api/src/auth.ts`).
- Money is `numeric(10,2)` in Postgres and integer pesewas in the app (`src/lib/money.ts`). Totals shown at checkout and payment always come from the server.
