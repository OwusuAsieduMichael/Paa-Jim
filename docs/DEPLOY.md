# Deploying Paa Jim

| Piece | Where | How people get it |
|---|---|---|
| Database, login, photos | Supabase (`wakqutehluzrwsiqncye`, Frankfurt) | already live |
| API (`apps/api`) | Render, Starter plan, Frankfurt | `render.yaml` in the repo root |
| Staff app (vendor, riders) | EAS Build → APK | download link / WhatsApp |
| Customer app | EAS Build → Play Store (`.aab`) and App Store | store listing |

Secrets go only into the Render dashboard or EAS. Never into git or an `EXPO_PUBLIC_` variable.

## 1. API on Render

1. Render → **New → Blueprint** → connect GitHub → choose `Paa-Jim`. Render reads `render.yaml`.
2. Fill in the values marked "sync: false":
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project settings → API keys → secret key
   - `PAYSTACK_SECRET_KEY`: Paystack → Settings → API Keys. While testing use `sk_test_…` and set `ALLOW_TEST_PAYSTACK_KEY=true`; at launch switch to `sk_live_…` and set it back to `false`.
   - `SMS_API_KEY`: Arkesel → API keys
   - `SEND_SMS_HOOK_SECRET`: from step 3 below (`v1,whsec_…`)
   - `KITCHEN_ALERT_PHONE`: number that gets "new order" SMS, e.g. `233559776547`
   - `FCM_SERVICE_ACCOUNT_JSON`: Firebase service-account JSON on one line (can be left empty at first; push is then logged, not sent)
   - `REDIS_URL`: optional. Without it, timers run inside the API and reset on each deploy. Add a Render Key Value instance later and paste its internal URL.
3. Deploy, then open `https://<service>.onrender.com/health`. It should show `"db":"up"`.

## 2. Point Supabase and Paystack at the API

- **Supabase → Authentication → Hooks → Send SMS hook** → HTTPS → `https://<service>.onrender.com/hooks/send-sms`. Generate the secret and paste it into Render as `SEND_SMS_HOOK_SECRET`.
- **Paystack → Settings → API Keys & Webhooks → Webhook URL** → `https://<service>.onrender.com/webhooks/paystack` (test and live mode each have their own field).

## 3. App settings in EAS

Once per machine: `npm i -g eas-cli`, `eas login`, then in `apps/mobile`: `eas init` (puts the project ID in place).

Create the public app settings for the **production** environment (they are not secrets, but `.env` is not uploaded to EAS):

```sh
eas env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value https://wakqutehluzrwsiqncye.supabase.co
eas env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <publishable key>
eas env:create --environment production --visibility plaintext --name EXPO_PUBLIC_API_URL --value https://<service>.onrender.com
eas env:create --environment production --visibility plaintext --name EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY --value <maps key>
```

Push notifications in a built app need Firebase: create an Android app `com.paajim.app` in Firebase, download `google-services.json`, and upload it as a file variable:

```sh
eas env:create --environment production --visibility secret --type file --name GOOGLE_SERVICES_JSON --value ./google-services.json
```

## 4. Build

From `apps/mobile`:

| Command | Gives | For |
|---|---|---|
| `eas build -p android --profile staff` | `.apk` link | vendor and riders |
| `eas build -p android --profile production` | `.aab` | Play Store upload |
| `eas build -p ios --profile production` | `.ipa` | App Store (needs Apple Developer account) |

`eas submit -p android` / `eas submit -p ios` uploads the store builds.

## 5. Before the store release

- Restore the real kitchen: `update public.vendor set lat = 6.8426, lng = -1.3977 where id = 1;` and `update public.vendor_hours set opens = '10:00', closes = '19:00';`
- Remove test phone numbers from Supabase Auth.
- Replace watermarked food photos.
- Live Paystack key, `ALLOW_TEST_PAYSTACK_KEY=false`.
- Privacy policy page online at `LEGAL_URL` (Play Store and App Store both require it).
