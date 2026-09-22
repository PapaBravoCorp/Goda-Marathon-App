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

## Go-live checklist

### Blocking

- [ ] Migrations 0006 through 0009 applied to the production project
- [ ] First admin account created and sign-in tested at `/admin`
- [ ] Public sign-ups disabled in Supabase Auth
- [ ] Test the full registration flow end to end, then delete the test entry
- [ ] Confirm the anon key can no longer read `registrations` (see below)
- [ ] Replace `https://godatrailrun.com` with the real domain in `index.html`,
      `public/robots.txt` and `public/sitemap.xml`
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
- [ ] Price is read from the database, never from the browser — `create_registration`
      already enforces this, so a gateway amount can be derived from the same source

---

## Notable behaviour

**Payment is not integrated.** Submitting the form reserves an entry with
`payment_status = 'PENDING'` and says so plainly. Only an admin can move an
entry off PENDING.

**Results stay hidden** until `events.results_published` is set. The page
previously mixed five hardcoded finishers with randomly generated finish times
assigned at sign-up, so anyone who had merely registered could look up their bib
and find a time and a rank waiting for them.

**Bib numbers** come from a per-event counter with a unique index behind it.
They were `Math.random()` over 9000 values, where a collision becomes more
likely than not by about the 112th entry.

**Entry prices** are read from `event_categories` inside the database. The
browser used to send the price, so anyone could enter any category for zero.

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
