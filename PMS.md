# NomadGao PMS, booking engine and channel manager

The prototype is our own system for selling and running rooms. It is meant to replace Stayflexi.

| Part | What it is | Where |
| --- | --- | --- |
| **PMS** | Rooms, rates, availability, reservations, check-in and check-out, housekeeping, walk-ins | `/pms/` page, `supabase/pms.sql` |
| **Booking engine** | Guest search → room choice → details → payment → confirmation, on our own site | `/book/` page, `src/scripts/booking-engine.ts` |
| **Channel manager** | Keeps Booking.com, Airbnb, Agoda, Expedia, MakeMyTrip and others in sync | [Channex](https://channex.io) behind our PMS, `supabase/functions/channex-*` |
| **Payments** | UPI, cards, net banking | Razorpay, `supabase/functions/payments-*` |

Today the site runs in **demo mode**:
- Sample rooms, prices and bookings, kept in your own browser.
- Every screen works.
- No money moves, and nothing reaches an OTA.

## How it fits together

```
Guest on nomadgao.com ──► booking engine ──► Postgres (Supabase) ◄── PMS screens (staff)
                                  │                 │      ▲
                              Razorpay        outbox│      │ OTA bookings
                                                    ▼      │
                                                Channex (channel manager)
                                                    │      ▲
                                 Booking.com · Airbnb · Agoda · Expedia · MakeMyTrip …
```

- **The database is the single source of truth.** Availability is never stored as a number someone can get wrong. It is always worked out as rooms of that type, minus nights already held by live bookings, minus blocked rooms.
- **The last room can't be sold twice.** A booking locks its room type while it's being saved. In testing, 8 simultaneous bookings for 4 rooms produced exactly 4 holds.
- **Prices are worked out on the server.** The browser never sends a price.
- **Unpaid holds expire.** A guest gets 15 minutes to pay, after which the room is released automatically.
- **OTA bookings are never refused.** The guest has already paid the OTA. If one lands on a full night, it's flagged `overbooked` in the PMS so staff can move someone.
- **Every rate or availability change is queued in `channel_outbox`.** `channex-sync` pushes the queue to Channex, and Channex updates every OTA.

## Why Channex for the channel manager

Building direct connections to Booking.com, Airbnb, Expedia and MakeMyTrip yourself isn't realistic. Each OTA has its own certification programme and expects partners to keep up with frequent API changes. Channex is built for teams running their own PMS: one REST API, with the OTA connections maintained by them.

- **Cost:** $130/month platform fee plus about $7 per property, which comes to about $144/month for our two properties. There is no setup fee, no commission and no minimum term ([pricing](https://channex.io/pricing)).
- **Free testing:** a staging account at staging.channex.io, with no card or sales call needed.
- **Before going live:** Channex certification, and authorising Channex in each OTA's extranet.
- **To check first:** confirm with Channex that **MakeMyTrip and Goibibo** are supported for India. If they aren't, look at an India-focused API provider such as AxisRooms, eGlobe or SaasAro. The PMS only talks to the channel manager through two functions, so swapping providers is contained.

## Going live, step by step

1. **Supabase:**
   - Create a project.
   - Run `supabase/schema.sql`, then `supabase/pms.sql`.
   - Load your **real** rooms, room types and rates in place of `seed.sql`.
   - Add staff emails to the `staff` table.
2. **Site:** set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` as GitHub repository variables. The booking engine and PMS switch from demo to live on the next deploy.
3. **Razorpay:**
   - Set the function secrets `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`.
   - Point a Razorpay webhook (`payment.captured`) at `/functions/v1/payments-webhook`.
   - Test in Razorpay test mode first.
4. **Channex staging:**
   - Create the two properties, their room types and rate plans in Channex.
   - Put the Channex ids into the `channex_*` columns.
   - Set the secrets `CHANNEX_API_KEY`, `CHANNEX_WEBHOOK_SECRET` and `SYNC_SECRET`.
   - Schedule `channex-sync` every minute.
   - Point the Channex booking webhook at `channex-webhook`.
   - The request formats in these two functions follow Channex's docs, but **check them against docs.channex.io in staging** before trusting them.
5. **Parallel run:** run both systems for 2–4 weeks. Stayflexi stays live; mirror its bookings into our PMS and compare availability every day.
6. **Cutover, on a quiet day:**
   - Switch each OTA's connectivity provider from Stayflexi to Channex.
   - Set `bookingEngine = 'native'` in `src/data/site.ts`; it's already native on the preview.
   - Turn off Stayflexi's sync.
7. **Still to build before real guests:**
   - Confirmation emails and WhatsApp messages.
   - GST invoices.
   - Refunds through Razorpay.
   - Moving a guest between rooms, splitting stays, and group bookings.
   - Reports: occupancy, ADR (average daily rate), RevPAR (revenue per available room), and revenue by channel.
