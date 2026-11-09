Build the Paa Jim onboarding, sign-up and log-in flow for our Expo (React Native, TypeScript, expo-router) app with Supabase.

## Design references
The screens are in `design/auth/screens/` as `.dc.html` files. These are designs, not runnable code: read their layout, colours, spacing and wording, then rebuild them with React Native components (`View`, `Text`, `TextInput`, `Pressable`). Do not render HTML.

| Design file | Route |
|---|---|
| `Main.dc.html` | native splash (expo-splash-screen), then `app/index.tsx` decides where to go |
| `Onboarding.dc.html` | `app/(auth)/welcome.tsx` |
| `Signup.dc.html` | `app/(auth)/signup.tsx` |
| `Login.dc.html` | `app/(auth)/login.tsx` |
| `Verify.dc.html` | `app/(auth)/verify.tsx` (shared by sign-up and log-in) |
| `ChangePhone.dc.html` | `app/(customer)/account/change-phone.tsx` |

Theme: primary `#C1121F`, primary dark `#8E0D17`, tint `#FDECEC`, ink `#1A1A1A`, muted `#5B5B5B`, canvas `#F7F4F2`, border `#ECE7E4`. Font: Plus Jakarta Sans (`@expo-google-fonts/plus-jakarta-sans`). Primary button: height 56, radius 16. Touch targets at least 44 px. Put these in a shared `theme.ts`.

## Sign-in strategy (no passwords)
Customers, vendors and riders sign in with **phone number + 6-digit SMS code**. There are no passwords anywhere in the mobile app.

1. **Phone numbers:** the user types the local number; normalise it to E.164 (`+233` + number without the leading 0) before calling Supabase. Validate it is a 9-digit Ghana mobile number after the prefix.
2. **Sign up** (`signup.tsx`): full name + phone + terms checkbox → `supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true, data: { full_name } } })` → go to `verify` with `{ phone, mode: 'signup' }`.
3. **Log in** (`login.tsx`): phone only → `signInWithOtp({ phone, options: { shouldCreateUser: false } })`. If the number has no account, show "No account with this number — create one?" with a link to sign up. Otherwise go to `verify` with `{ phone, mode: 'login' }`.
4. **Verify** (`verify.tsx`): 6-digit code input (one field per digit, numeric keyboard, SMS autofill: `textContentType="oneTimeCode"` on iOS, `autoComplete="sms-otp"` on Android) → `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`. Show "Resend in 0:60" and only allow resend after 60 seconds. Show "Wrong number? Change it" going back. Show clear errors for a wrong or expired code.
5. **Profiles:** create a `profiles` table (`id` = `auth.users.id`, `full_name`, `phone`, `role` with values `customer` | `vendor` | `rider` | `admin`, default `customer`, `created_at`). Fill it with a database trigger on `auth.users` insert that copies `full_name` from user metadata. Users may update only their own `full_name`; they can never change their own `role` (enforce with RLS plus a column-level check or trigger).
6. **After verify**, read `profiles.role` and route: `customer` → `(customer)` tabs, `vendor` → `(vendor)` tabs, `rider` → `(rider)`. Vendor and rider accounts are created by admin only; sign-up always makes a customer.
7. **Stay logged in:** persist the Supabase session on the device so users stay logged in until they tap Log out. Use the storage approach Supabase recommends for React Native (encrypted storage, since SecureStore alone has a size limit). `app/index.tsx` checks for a session on launch and skips the welcome screen if there is one.
8. **Change phone number** (`change-phone.tsx`): new number → `supabase.auth.updateUser({ phone: newPhone })` → code sent to the new number → `verifyOtp({ phone: newPhone, token, type: 'phone_change' })` → update `profiles.phone`. The account and order history stay the same.
9. **One account per phone number.** A customer who lost their number can simply sign up again with a new number (a new, empty account).
10. **Delete account** must be available from Account (Google Play requires it). Build it later with the Account screen, but keep it in mind.

## SMS provider
Supabase sends the codes, but we use a **Ghana SMS provider** through Supabase's **Send SMS hook**:
- Write a Supabase Edge Function that receives the hook payload (phone + code) and calls the provider's SMS API. Verify the hook signature.
- Before writing it, **ask me which provider we're using** (Arkesel, Hubtel, mNotify or another), and list what you need from me (API key, sender ID). Read keys from environment variables or Supabase secrets — never hard-code or commit them.
- Message text: `Your Paa Jim code is 123456. It expires in 5 minutes. Don't share it.`
- In Supabase Auth settings: enable the Phone provider, set the OTP expiry to 5 minutes, and add **test phone numbers with fixed codes** so we can develop without paying for SMS. Tell me which settings to change in the dashboard if you can't change them from code.

## How to work
- First, read the design files and show me a short plan: the files you'll create, the database migration, and anything you're unsure about. Wait for my OK before writing code.
- Build in this order: theme → routes and navigation guard → welcome → sign up → log in → verify → profiles migration and trigger → change phone → SMS hook.
- After each screen, tell me how to test it in Expo Go or a dev build.
- Food images and other placeholders in the designs stay as placeholders for now.
