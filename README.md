# GODA Epic Trail Run

Registration and event site for the GODA Epic Trail Run, organised by Godavari
Expedition and G5 Foundation in the Gangapur Backwaters near Nashik.

React 19 + Vite on the front, Supabase (PostgreSQL, Auth, Storage, Edge
Functions) behind it. Deployed on Vercel.

---

## Read this before deploying

**The frontend and the database migrations must go out together.** This build
calls database functions that migrations 0006 to 0008 create. Deploying the
site without running them first breaks registration completely, and the admin
dashboard will refuse every sign-in.

Order:

1. Run the migrations (below).
2. Create an admin account (below).
3. Deploy the frontend.

---

## Local setup

```bash
npm install
cp .env.example .env     # then fill in the two Supabase values
npm run dev
```

Anything prefixed `VITE_` is **inlined into the public JavaScript bundle** by
Vite at build time. Never put a secret there. The Supabase anon key belongs
there and is public by design; the `service_role` key must never appear in this
project at all.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm run supabase -- <args>` | Supabase CLI (see below) |

### Supabase CLI

The CLI is a dev dependency (`supabase` in `package.json`), so there is **nothing
to install and no global binary to keep in sync**. Call it through the script and
pass the CLI arguments after `--`:

```bash
npm run supabase -- --version         # works straight after npm install
npm run supabase -- secrets list
npm run supabase -- functions deploy send-bulk-email
```

A bare `supabase ...` only works if the CLI is also installed globally
(`npm install -g supabase`, or `npx supabase ...` for a one-off). Using the
project-local copy means everyone gets version 2.117.0, the version pinned in
`package-lock.json`, rather than whatever happens to be on their machine.

> A fresh clone is not linked to any Supabase project yet, so commands such as
> `secrets`, `functions` and `db push` stop with `Cannot find project ref`. Link
> once first — the ref is the `xxxxxxxx` part of
> `https://xxxxxxxx.supabase.co`, and the CLI asks for the database password:
>
> ```bash
> npm run supabase -- login
> npm run supabase -- link --project-ref xxxxxxxx
> ```
>
> The link target is stored in `supabase/.temp/`, which is gitignored: it is
> per-machine state, not project config.

---

## Database

Migrations are plain SQL in `supabase/migrations/`, numbered and safe to re-run.
Apply them **in order** in the Supabase SQL editor, or with
`npm run supabase -- db push`.

| File | What it does |
| --- | --- |
| `0001_registration_participant_details.sql` | Participant and safety columns |
| `0002_homepage_configurable_content.sql` | Editable hero copy and category perks |
| `0003_past_events.sql` | Past editions table and the media storage bucket |
| `0004_multiple_editions_per_year.sql` | Real foreign key from media to edition |
| `0005_faqs_and_testimonials.sql` | FAQ and testimonial tables |
| `0006_security_lockdown.sql` | **Row Level Security. Not optional.** |
| `0007_registration_rpc.sql` | Server-side registration, pricing and bib numbers |
| `0008_results_and_newsletter.sql` | Real finish times, results switch, newsletter |
| `0009_policy_rebuild.sql` | **Required.** Rebuilds every policy and verifies the result |
| `0010_group_registrations_and_coupons.sql` | Bulk (group) entries and real discount codes |
| `0011_razorpay_payments.sql` | Online payment: reservations with a deadline, `payments` table, settlement functions |
| `0012_cancel_reservation.sql` | Lets a runner release their own unpaid reservation from the payment step |
| `0015_sponsors.sql` | Sponsor logos for the homepage strip and hero partner credit (Admin → Content → Sponsors) |
| `0017_category_bib_series.sql` | A bib number series per category (21 km → 21001–21999), issued by the database; renumbers live entries of upcoming events |
| `0019_category_course_maps.sql` | A GPX course map per category (`event_categories.route_gpx`); lets the media bucket accept GPX files |

0009 is not optional. 0006 removed the old permissive policies by name, which
missed allow-all policies that had been created outside these migrations. It
reported success while `events`, `event_categories` and `event_schedule` were
still writable with the public key. 0009 drops every policy on the managed
tables, rebuilds them from one known state, revokes the write grants from the
`anon` role as a second independent layer, and then refuses to finish unless no
anonymous write path remains.

### What 0006 and 0009 fix

Before it, every table was readable and writable with the anon key — the key
that ships inside the JavaScript bundle. Demonstrated against the live project
with nothing but that key: reading every participant record (names, emails,
dates of birth, phone numbers, blood groups, emergency contacts, medical notes,
addresses), and updating and deleting those rows.

After it: content tables are world-readable and admin-writable, registrations
are admin-only, and the public writes them through a validating function.

### Create the first admin

1. Supabase dashboard → **Authentication → Users → Add user**. Real address,
   strong password, tick **Auto Confirm User**.
2. Copy the new user's UUID.
3. In the SQL editor:

   ```sql
   insert into public.admin_users (user_id, email, note)
   values ('<uuid>', 'you@example.com', 'primary admin');
   ```

4. Sign in at `/admin`.

While you are in Authentication settings, turn **off** public sign-ups
(Providers → Email). Nothing here needs them, and leaving them on lets strangers
create accounts on your project.

---

## Email

The admin Email tab calls an edge function that previously did not exist, so
every send was logged as failed and no participant ever received anything. It
now lives in `supabase/functions/send-bulk-email/`.

```bash
npm run supabase -- secrets set RESEND_API_KEY=re_xxx MAIL_FROM="GODA Trail Run <noreply@yourdomain.com>"
npm run supabase -- functions deploy send-bulk-email
```

Verify the sending domain with your mail provider first, or everything lands in
spam. Until the secrets are set, the function returns a clear error and the
admin panel shows it.

On Windows, do not pass `MAIL_FROM` on the command line if it contains a display
name: PowerShell hands the argument to `cmd.exe`, which reads the `<` in
`GODA Trail Run <noreply@yourdomain.com>` as a redirect and silently creates a
file instead. Put the values in `supabase/.env` (gitignored) and use `--env-file`:

```dotenv
RESEND_API_KEY=re_xxx
MAIL_FROM=GODA Trail Run <noreply@yourdomain.com>
```

```bash
npm run supabase -- secrets set --env-file supabase/.env
```

---

## Payments (Razorpay)

Razorpay Standard Checkout, confirmed on the server. **Nothing changes for
runners until an admin switches on Admin → Settings → Online payment**, so
everything below can be deployed and tested before the public sees it. The
frontend works with or without migration 0011 applied; without it the switch
simply does not appear.

### How it works

1. Submitting the form **reserves** the entry: place and coupon are held for
   30 minutes (adjustable in Settings) and the row is `PENDING` with a
   `payment_due_at` deadline. The bib number is issued when the payment is
   confirmed, so abandoned checkouts do not use up numbers (0017).
2. The `razorpay-order` edge function reads what is owed **from the database**
   and creates a Razorpay order. The browser sends only the reservation's id.
3. Checkout opens in the page. The runner pays by UPI, card, net banking, etc.
4. `razorpay-verify` checks Razorpay's signature, re-fetches the payment from
   Razorpay's API, captures it if needed, and marks the entry `PAID`.
   `razorpay-webhook` does the same server to server, so the entry is
   confirmed even if the runner closes the tab the moment they pay.
5. A reservation nobody pays for is released at its deadline: it becomes
   `CANCELLED` with `cancelled_reason = PAYMENT_TIMEOUT`, and its place, email
   address and coupon use are freed.
6. Money that arrives for an entry that can no longer take it (paid after the
   deadline once the email re-entered, a second payment, an entry an admin
   cancelled) is **never kept silently**. It is recorded as `REFUND_REQUIRED`
   and listed at the top of Admin → Registrations until refunded.

A group pays once, by the coordinator; the group and all its members are
settled together. An entry with nothing to pay (a 100% code) is confirmed
outright.

### Setup — test mode first

Everything in the Razorpay dashboard below is done with the **Test Mode**
toggle on. Test and live mode have separate keys and separate webhooks.

1. **Apply migration 0011** (SQL editor, or `npm run supabase -- db push`). It
   ends with `0011 OK` when the lockdown checks pass.

2. **API keys.** Razorpay dashboard → Account & Settings → API Keys → Generate
   Key. Copy the key id (`rzp_test_...`) and the secret — the secret is shown
   once.

3. **Payment capture.** In Account & Settings, set payment capture to
   **automatic**. The code captures authorised payments itself as a safety net,
   but with manual capture an uncaptured payment is refunded by Razorpay after
   a few days and the entry would quietly revert.

4. **Webhook.** Account & Settings → Webhooks → Add New Webhook:
   - URL: `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`
   - Secret: a long random string you make up (e.g. `openssl rand -hex 32`).
     Keep it for the next step.
   - Active events: `payment.authorized`, `payment.captured`, `payment.failed`,
     `order.paid`, `refund.processed`

5. **Secrets.** Add the three values to `supabase/.env` (gitignored, next to the
   email secrets) and push them:

   ```dotenv
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   RAZORPAY_WEBHOOK_SECRET=the-random-string-from-step-4
   ```

   ```bash
   npm run supabase -- secrets set --env-file supabase/.env
   ```

   None of these go in the root `.env`. The key id reaches the browser from the
   edge function with each order, so switching test → live never needs a site
   rebuild.

6. **Deploy the functions.** `--no-verify-jwt` is required: visitors and
   Razorpay have no Supabase login. Each function authenticates its caller
   itself (a reservation UUID, the checkout signature, the webhook signature).

   ```bash
   npm run supabase -- functions deploy razorpay-order --no-verify-jwt
   npm run supabase -- functions deploy razorpay-verify --no-verify-jwt
   npm run supabase -- functions deploy razorpay-webhook --no-verify-jwt
   ```

7. **Deploy the frontend.** `vercel.json`'s Content-Security-Policy now allows
   Razorpay's script and iframe; without that update Checkout opens blank.

8. **Switch it on:** Admin → Settings → Online payment → On → Save.

9. **Test, end to end:**
   - Pay with UPI ID `success@razorpay` (or a test card from Razorpay's test
     card docs). The success screen says *Entry confirmed*; Admin shows the
     entry `PAID` with a Payment ID; Razorpay → Webhooks shows deliveries with
     200 responses.
   - Pay with `failure@razorpay`: the page offers a retry, the entry stays
     reserved.
   - Close Checkout without paying, reload the page: it returns to the payment
     step with the countdown.
   - Press *Cancel reservation*: you land on the form with everything filled
     in, the entry shows `CANCELLED` / `RUNNER_CANCELLED` in Admin, and
     resubmitting with the same email works straight away. *Clear form* empties
     it.
   - Let one reservation lapse (set the hold to 10 minutes to speed this up):
     it turns `CANCELLED` / `PAYMENT_TIMEOUT` and the same email can register
     again.
   - Do the same for a group entry.
   - Delete the test entries afterwards.

### Going live

1. Finish Razorpay account activation (KYC, website review — they check the
   policy pages; see the checklist below).
2. With Test Mode **off**: generate live API keys, and create a **second**
   webhook with the same URL and events and a new secret.
3. Replace the three values in `supabase/.env` with the live ones, run
   `secrets set` again, and redeploy the three functions.
4. Make one real payment yourself and refund it from the dashboard; the entry
   should turn `REFUNDED`. Then cancel it in Admin.

### Running it

- **Refunds** are issued from the Razorpay dashboard. The webhook marks the
  payment (and the entry, if that payment settled it) `REFUNDED`.
- **Offline payments** still work: an admin can mark any entry paid by hand.
- **Switching online payment off** keeps reservations already waiting; they
  become ordinary `PENDING` entries for you to collect.
- **Optional timer.** Lapsed reservations are released whenever the next
  registration arrives, and hidden from the "places left" figure the moment
  they lapse. To also sweep every five minutes on quiet days, enable the
  `pg_cron` extension (Database → Extensions) and re-run 0011.
- **In-app browsers.** Razorpay notes that some in-app browsers (Instagram,
  Facebook Messenger) handle Checkout's iframe poorly. Any payment that does go
  through is still confirmed by the webhook. If social traffic shows drop-off
  at the payment step, the next improvement is Razorpay's redirect mode
  (`callback_url`), which is not built yet.

---

## Go-live checklist

### Blocking

- [ ] Migrations 0006 through 0011 applied to the production project
- [ ] First admin account created and sign-in tested at `/admin`
- [ ] Public sign-ups disabled in Supabase Auth
- [ ] Test the full registration flow end to end, then delete the test entry
- [ ] Confirm the anon key can no longer read `registrations` (see below)
- [x] Replace `https://goda-marathon-app.vercel.app` with the real domain in `index.html`,
      `public/robots.txt` and `public/sitemap.xml`
- [ ] `godavariexpedition.in` off GoDaddy hold, DNS pointed at Vercel, and Supabase
      Auth Site URL set to it
- [ ] Fill in the entity details marked `TODO` in `src/utils/constants.js`
- [ ] Have a lawyer review `/privacy-policy`, `/terms` and `/refund-policy`

Verifying the lockdown, replacing the two values:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/rest/v1/registrations?select=email&limit=1"
```

Anything other than an empty result or a permission error means 0006 did not
apply.

### Content

- [ ] Only one race category exists in the database; the site advertises more.
      Add the rest under **Admin → Categories**.
- [ ] Two FAQ entries are seeded **unpublished** because their answers are
      factually wrong (one cites 15km and 10km categories that do not exist,
      the other gives August bib collection for a December race). Fix and
      publish them, or delete them.
- [ ] The seeded FAQ says a bib can be transferred up to 14 days before the
      event. The declaration runners actually accept, and `/refund-policy`,
      both say entries are non-transferable. **These contradict each other.**
      Decide which is true and make all three agree.
- [ ] Set contact email and phone under **Admin → Settings**; the policy pages
      and contact page read them from there.
- [ ] Delete the test registrations still in the table.

### Before switching on payment

- [ ] Registered entity name and address match across the policy pages and your
      gateway application
- [ ] `/contact`, `/terms`, `/privacy-policy` and `/refund-policy` reachable
      from every page — they are, via the footer
- [x] Price is read from the database, never from the browser — `razorpay-order`
      takes the amount from the stored entry via `prepare_payment()`
- [ ] `/refund-policy` states how long an approved refund takes to reach the
      original payment method (Razorpay's website review commonly asks for a
      timeline)
- [ ] Full test-mode run from *Payments → Setup* step 9 passed, solo and group
- [ ] Live keys and a live-mode webhook set up, secrets replaced, functions
      redeployed
- [ ] One real payment made and refunded

---

## Notable behaviour

**Payment is online when switched on.** With Admin → Settings → Online
payment on, an entry is a reservation until paid through Razorpay and is
released if unpaid by its deadline (see *Payments*). With it off, submitting
reserves an entry as `PENDING` with no deadline and says so plainly; an admin
marks it paid.

**Results stay hidden** until `events.results_published` is set. The page
previously mixed five hardcoded finishers with randomly generated finish times
assigned at sign-up, so anyone who had merely registered could look up their bib
and find a time and a rank waiting for them.

**Bib numbers** come from a series per category, so the number shows the
race: by default the distance in thousands (5 km → 5001–5999, 21 km →
21001–21999), editable under Admin → Categories, which also has a lookup for
"which race is bib N?". A trigger on `registrations` issues them (0017): when
the entry holds its place for good (paid, free, or offline pending), never
twice in an event, and afresh after a category change. The database refuses a
series that overlaps another, is smaller than the category's capacity, or
would strand bibs already issued, and refuses a typed bib outside the runner's
series. Bibs were once `Math.random()` over 9000 values, where a collision
becomes more likely than not by about the 112th entry; 0007 replaced that with
a per-event counter, which 0017 replaces in turn.

**Entry prices** are read from `event_categories` inside the database. The
browser used to send the price, so anyone could enter any category for zero.

**Course maps** come from a GPX file per category (Admin → Categories → Course
map). The browser checks the file and trims it, keeping every bend over 4 m and
every rise over 3 m, so a one-second watch recording of a 17 km course drops
from 1.2 MB to about 11 KB. It is uploaded to the media bucket under `courses/`
when the category is saved. Waypoints in the file that lie within 150 m of the
course are listed as stops with their distance. The event page draws the course
with Leaflet on OpenStreetMap tiles (OpenTopoMap as the Terrain layer), adds an
elevation profile, and offers the same file as a download for runners' watches;
categories without a file show no map. Both tile services are free with
attribution at this site's traffic. Their hosts are listed under `img-src` in
`vercel.json`, so a different tile provider needs its host added there as well,
or production blocks its tiles.

---

## Project layout

```
src/
  components/         Shared UI, error boundary, SEO, scroll restoration
  components/admin/   Dashboard panels, one per tab
  pages/              One folder or file per route
  pages/legal/        Privacy, terms, refunds, contact
  utils/services/     Every Supabase call lives here, nowhere else
supabase/
  migrations/         Numbered SQL, applied in order
  functions/          Edge functions
```

Components never call Supabase directly. If you need data, add it to a service.
