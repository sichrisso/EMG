# Ethio Mentor Group (EMG)

Applications, scholarships, and mentors for Ethiopian students going abroad —
in one place. React + Vite + TypeScript on the front, Supabase (Postgres,
Auth, Storage, RLS) behind it.

## Architecture

| Layer     | Choice                          |
|-----------|---------------------------------|
| Frontend  | React 18 + Vite, deployed on Vercel |
| Backend   | Supabase: Postgres + Auth + Storage, all access governed by RLS |
| Future    | A small server (Fastify/Django) is added only when payment webhooks/SMS arrive |

Five sections: **Home** (action dashboard) · **Journey** (application tracker)
· **Mentors** (find / my requests) · **Resources** (scholarships, IELTS,
visa & embassy) · **Services** (request help, fee payment). Plus `/events`,
`/profile` (with "Become a mentor"), and `/admin` for moderation.

## Local setup

```bash
npm ci
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

Scripts: `dev` · `build` · `typecheck` (tsc -b) · `lint` (eslint).

## Database

Migrations live in `supabase/migrations/` and are the only way schema
changes happen — never edit schema in the dashboard.

1. `001_full_schema.sql` — every table, policy, trigger, the avatars bucket,
   and config seeds (milestones, application material defaults). No demo data.
2. `002_fixes.sql` — the security patch: admin support, PII-safe
   `public_profiles` view, column guards (no self-approval, no role
   escalation), mentor request policies, server-side points/ratings/counters,
   fee sanitization, atomic slot RPC, indexes.
3. `003_admin_support.sql` — policies the `/admin` panel and entry page need.

Fresh project: run 1 → 2 → 3 in the SQL editor. Existing project whose live
schema already matches 001: run 2 → 3 only. Then make yourself admin:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

### Invariants the database enforces (do not re-implement in the client)

- Points, `total_sessions`, and `avg_rating` are written **only** by triggers.
- `profiles.role`, `is_admin`, `email` and mentor `status`/stats are
  admin-only columns.
- `fee_requests.amount_birr` from a client is discarded; admins set quotes.
- Mentees can rate once, only on completed sessions; only mentors schedule.
- Every client mutation chains `.select('id')` through `assertUpdated()` so
  an RLS-blocked write raises instead of silently doing nothing.

## Supabase dashboard settings

- Auth → Providers → Email: **Confirm email OFF** (instant accounts).
- Auth → Providers → Google: enable; redirect URI
  `https://<project>.supabase.co/auth/v1/callback`.
- Auth → Bot and Abuse Protection: **enable CAPTCHA** and keep rate limits
  (this compensates for removing email verification).
- Auth → URL Configuration: Site URL = your Vercel domain;
  allow `http://localhost:5173` for dev.

## Deployment (Vercel)

Import the repo, framework preset Vite, set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. `vercel.json` already rewrites all routes to the
SPA. Point the Google OAuth authorized origins at the Vercel domain.

## Launch checklist

1. Run migrations on a **staging** Supabase project first; walk every flow
   as mentee, mentor, and admin.
2. Configure the dashboard settings above (both projects).
3. Seed real content: 15–25 scholarships with live deadlines, and one first
   event, so no page is born empty.
4. Deploy to Vercel; smoke-test Google sign-in on the production domain.
5. Soft-launch to 10–20 real students; watch Supabase logs for a week.
