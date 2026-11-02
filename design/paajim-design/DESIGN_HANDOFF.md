# Paa Jim — Design Handoff

Reference designs for the Paa Jim React Native (Expo) app. Built on the GoXpress blueprint: one codebase, role-gated navigators (customer, vendor, rider), plus a web admin dashboard.

The files in `screens/` are **design references**, not runnable app code. Each `.dc.html` file is one screen written in HTML + inline styles. Read the markup for layout, spacing, colours and copy, and read the `<script>` block at the bottom for sample data and interactions. Rebuild each one as a React Native screen.

## Design tokens

| Token | Value | Use |
|---|---|---|
| `primary` | `#C1121F` | Buttons, active tabs, prices, brand |
| `primaryDark` | `#8E0D17` | Pressed state, link hover |
| `primaryText` | `#A00F1A` | Red text on light-red backgrounds |
| `primaryTint` | `#FDECEC` | Chips, icon backgrounds, badges |
| `ink` | `#1A1A1A` | Body text, dark headers (vendor/admin) |
| `inkMuted` | `#5B5B5B` | Secondary text |
| `surface` | `#FFFFFF` | Cards, screens |
| `canvas` | `#F7F4F2` | Grey screen backgrounds, inputs |
| `border` | `#ECE7E4` | Dividers, outlines |
| `success` | `#1E8E3E` / text `#146C2E` on `#E8F5EC` | Open, delivered, ready |
| `warning` | `#E09A00` / text `#5A4300` on `#FFF6E0` | Cooking, pending, alerts |
| `info` | `#1F6FB2` | Drinks in charts |

- **Font:** Plus Jakarta Sans (400, 500, 600, 700, 800). Load it with `@expo-google-fonts/plus-jakarta-sans`.
- **Type scale:** screen title 22–30 / 800 · section 15–18 / 800 · body 14–15 / 400–600 · caption 11–13 / 600
- **Radii:** buttons 16 · cards 16–22 · chips fully rounded · small icon tiles 10–14
- **Spacing:** 20 px screen gutter · 12–16 px between cards · 8 px between chips
- **Touch targets:** at least 44 × 44 px
- **Primary button:** height 56, radius 16, `primary` background, white 16/700 text

## Screen map → expo-router routes

| # | File | Suggested route | Role |
|---|---|---|---|
| 01 | `Main.dc.html` (splash) | native splash / `app/index.tsx` | all |
| 02 | `Onboarding.dc.html` | `(auth)/welcome` | all |
| 03 | `Login.dc.html` | `(auth)/phone` | all |
| 04 | `Verify.dc.html` | `(auth)/verify` | all |
| 05 | `ProfileSetup.dc.html` | `(auth)/profile` | customer |
| 06 | `Home.dc.html` | `(customer)/(tabs)/index` | customer |
| 07 | `Search.dc.html` | `(customer)/search` | customer |
| 08 | `Menu.dc.html` | `(customer)/(tabs)/menu` | customer |
| 09 | `ItemDetail.dc.html` | `(customer)/item/[id]` | customer |
| 10 | `Cart.dc.html` | `(customer)/cart` | customer |
| 11 | `Checkout.dc.html` | `(customer)/checkout` | customer |
| 12 | `Payment.dc.html` | `(customer)/payment/[orderId]` | customer |
| 13 | `OrderPlaced.dc.html` | `(customer)/order/[id]/confirmed` | customer |
| 14 | `Tracking.dc.html` | `(customer)/order/[id]/track` | customer |
| 15 | `Rate.dc.html` | `(customer)/order/[id]/rate` | customer |
| 16 | `Orders.dc.html` | `(customer)/(tabs)/orders` | customer |
| 17 | `Profile.dc.html` | `(customer)/(tabs)/account` | customer |
| 18 | `VendorQueue.dc.html` | `(vendor)/(tabs)/index` | vendor |
| 18b | `VendorOverview.dc.html` | `(vendor)/(tabs)/overview` | vendor |
| 19 | `VendorOrder.dc.html` | `(vendor)/order/[id]` | vendor |
| 20 | `RiderClaim.dc.html` | `(rider)/index` | rider |
| 21 | `RiderDelivery.dc.html` | `(rider)/delivery/[id]` | rider |
| 22–26 | `Admin*.dc.html` | separate web app (not in the mobile app) | admin |

Customer tab bar: Home · Menu · Orders · Account. Vendor tab bar: Orders · Overview.

## Menu (sample — replace with real prices)

- **Jollof:** & Chicken 55 · & Beef 50 · & Fried Fish 60 · Assorted 70
- **Fried rice:** & Chicken 55 · & Beef 50 · & Fried Fish 60 · Assorted 70
- **Drinks:** Water 500ml 5 · Water 1.5L 10 · Soft drink can 10 · Soft drink glass bottle 8 · Malt glass bottle 10

## Behaviour to keep

- Phone OTP sign-in (+233), 6 digits.
- Prices and totals always come from the server (`create_order` RPC). The app displays the server total.
- MoMo networks: MTN (`mtn`), Telecel (`vod`, with an extra OTP step), AirtelTigo (`atl`).
- The customer sees a 4-digit **delivery code** and gives it to the rider on arrival.
- The vendor taps **Mark ready** to get a 6-digit **Pickup ID**, and the rider types it in to claim the order.
- Orders not accepted within 8 minutes are cancelled and refunded automatically.
- Only the rider role requests background location.

## Placeholders to replace

Food photos are labelled boxes such as `[Photo]`. Names, phone numbers, order numbers, addresses and dashboard figures are all sample data.
