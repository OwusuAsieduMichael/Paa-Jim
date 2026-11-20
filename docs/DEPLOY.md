# Deploying Paa Jim

| Piece | Where | How people get it |
|---|---|---|
| Database, login, photos | Supabase (`wakqutehluzrwsiqncye`, Frankfurt) | already live |
| API (`apps/api`) | Render, Starter plan, Frankfurt | `render.yaml` in the repo root |
| Staff app (vendor, riders) | EAS Build → APK | download link / WhatsApp |
| Customer app | EAS Build → Play Store (`.aab`) and App Store | store listing |
| Public site (privacy, terms, account deletion) | Cloudflare Worker `paa-jim` → `apps/site` | https://paajim.app |
| Admin dashboard (`apps/admin`) | Cloudflare Worker `paa-jim-admin` | https://admin.paajim.app |

Live API: `https://paajim-api.onrender.com`. Expo project: `@banahene_mike70/paajim`. Google Cloud / Firebase project: `paa-jim`.

Secrets go only into the Render dashboard or EAS. Never into git or an `EXPO_PUBLIC_` variable.

## 1. API on Render

1. Render → **New → Blueprint** → connect GitHub → choose `Paa-Jim`. Render reads `render.yaml`.
2. Fill in the values marked "sync: false":
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project settings → API keys → secret key
   - `PAYSTACK_SECRET_KEY`: Paystack → Settings → API Keys. While testing use `sk_test_…` and set `ALLOW_TEST_PAYSTACK_KEY=true`; at launch switch to `sk_live_…` and set it back to `false`.
   - `SMS_API_KEY`: Arkesel → API keys
   - `SEND_SMS_HOOK_SECRET`: from step 3 below (`v1,whsec_…`)
   - `KITCHEN_ALERT_PHONE`: number that gets "new order" SMS, e.g. `233559776547`
   - `FCM_SERVICE_ACCOUNT_JSON`: Firebase → Project settings → Service accounts → **Generate new private key**, pasted as one line (can be left empty at first; push is then logged, not sent)
   - `REDIS_URL`: optional. Without it, timers run inside the API and reset on each deploy. Add a Render Key Value instance later and paste its internal URL.
3. Deploy, then open `https://<service>.onrender.com/health`. It should show `"db":"up"`.

## 2. Point Supabase and Paystack at the API

- **Supabase → Authentication → Hooks → Send SMS hook** → HTTPS → `https://<service>.onrender.com/hooks/send-sms`. Generate the secret and paste it into Render as `SEND_SMS_HOOK_SECRET`.
  - Arkesel only sends from an **approved sender ID**. Until `PaaJim` (`SMS_SENDER_ID`) is approved in Arkesel → Sender IDs, login fails with "Unexpected status code returned from hook: 500".
- **Paystack → Settings → API Keys & Webhooks → Webhook URL** → `https://<service>.onrender.com/webhooks/paystack` (test and live mode each have their own field).

## 3. App settings in EAS

Once per machine: `npm i -g eas-cli`, `eas login`, then in `apps/mobile`: `eas init` (puts the project ID in place).

Create the public app settings for the **production** and **preview** environments (they are not secrets, but `.env` is not uploaded to EAS). The `staff` and `production` build profiles both use `production`.

```sh
eas env:create --environment production --environment preview --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value https://wakqutehluzrwsiqncye.supabase.co
eas env:create --environment production --environment preview --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <publishable key>
eas env:create --environment production --environment preview --visibility plaintext --name EXPO_PUBLIC_API_URL --value https://paajim-api.onrender.com
eas env:create --environment production --environment preview --visibility plaintext --name EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY --value <maps key>
```

Push notifications in a built app need Firebase: create an Android app `com.paajim.app` in Firebase project `paa-jim`, download `google-services.json` (gitignored, keep it in `apps/mobile`), and upload it as a file variable:

```sh
eas env:create --environment production --environment preview --visibility secret --type file --name GOOGLE_SERVICES_JSON --value ./google-services.json
```

Check with `eas env:list --environment production`. You should see all five names.

### Google Maps key

In Google Cloud project `paa-jim`:

1. **Billing**: link a billing account. Accounts in Ghana must make a small **prepayment** first (kept as credit); maps stay blank until it's credited, which can take up to 24 hours. A $5 budget alert under Billing → Budgets & alerts is a sensible guard.
2. **APIs & Services → Library → Maps SDK for Android → Enable.**
3. **Credentials → Create credentials → API key**, named "Paa Jim Android maps".
   - **API restrictions:** Maps SDK for Android only.
   - **Application restrictions:** Android apps → package `com.paajim.app` + the SHA-1 of every key that signs the app (below).

The OAuth consent screen warning on the Credentials page can be ignored; Paa Jim doesn't use Google sign-in.

## 4. Build

From `apps/mobile`:

| Command | Gives | For |
|---|---|---|
| `eas build -p android --profile staff` | `.apk` link | vendor and riders |
| `eas build -p android --profile production` | `.aab` | Play Store upload |
| `eas build -p ios --profile production` | `.ipa` | App Store (needs Apple Developer account) |

`eas submit -p android` / `eas submit -p ios` uploads the store builds.

### Signing keys

The first Android build asks to generate a keystore: answer **Yes**. EAS keeps it in the Expo account. Every later build and update must be signed with it, so never delete it. `eas credentials -p android` shows it and can download a backup.

SHA-1 fingerprints that must be on the Maps key:

| Key | SHA-1 | Added |
|---|---|---|
| EAS keystore (staff APK and Play upload key) | `34:8C:1C:DC:69:3B:DD:F5:F3:DB:76:AC:79:51:F8:72:B8:BB:28:C1` | ✅ |
| Google Play app signing key | Play Console → Setup → App signing, after the first upload | not yet |

Play re-signs store downloads with its own key, so without the second entry the map is blank in the Play Store version.

## 5. Before the store release

- Restore the real kitchen: `update public.vendor set lat = 6.8426, lng = -1.3977 where id = 1;` and `update public.vendor_hours set opens = '10:00', closes = '19:00';`
- Remove test phone numbers from Supabase Auth.
- Replace watermarked food photos.
- Live Paystack key, `ALLOW_TEST_PAYSTACK_KEY=false`, and the live-mode webhook URL in Paystack.
- Add the Play app signing SHA-1 to the Maps key (see Signing keys).
- Privacy policy (https://paajim.app/privacy) and account deletion (https://paajim.app/delete-account) pages are live; give both URLs in the Play Console and App Store listings.
