-- =============================================================================
-- 000_init.sql — Ethio Mentor Group, THE complete database in one migration.
--
-- This file consolidates migrations 001–014 into their FINAL state: run it
-- once on an empty Supabase project and you have the current production
-- schema — tables, security, triggers, storage, and config seeds.
--
-- AFTER RUNNING:
--   1) notify pgrst, 'reload schema';
--   2) Sign in to the app once (creates your profile row), then:
--        update public.profiles set is_admin = true where email = 'you@example.com';
--   3) Optional email notifications: enable pg_net + pg_cron under
--      Database → Extensions, store a Resend key in Vault
--        select vault.create_secret('re_YOUR_KEY', 'resend_api_key');
--      and set the from-address:
--        insert into public.app_settings (key, value)
--        values ('email_from', 'Ethio Mentor Group <notify@yourdomain.com>')
--        on conflict (key) do update set value = excluded.value;
--      Everything works without this — emails are simply skipped.
-- =============================================================================

-- ── Extensions (best-effort: notifications degrade gracefully without them) ──
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net not enabled (%); emails will be skipped.', sqlerrm;
end $$;

do $$ begin
  create extension if not exists pg_cron with schema pg_catalog;
exception when others then
  raise notice 'pg_cron not enabled (%); session reminders will not run.', sqlerrm;
end $$;

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.user_role as enum ('mentee','mentor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.mentor_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pending','approved','declined','cancelled','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.app_status as enum ('planning','in_progress','submitted','accepted','rejected','declined');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.degree_level as enum ('bachelor','masters','phd','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_type as enum ('ielts_prep','toefl_prep','essay_review','sop_review','university_selection','visa_guidance','mock_interview','fee_payment','scholarship_advice','general');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.material_status as enum ('not_started','in_progress','done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_status as enum ('pending','approved','rejected','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_type as enum ('workshop','webinar','info_session','qa','other');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- TABLES (final column sets)
-- =============================================================================

-- ── profiles ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  first_name       text not null default '',
  last_name        text not null default '',
  role             public.user_role not null default 'mentee',
  is_admin         boolean not null default false,
  avatar_url       text,
  phone            text,
  country          text,
  hobbies          text[] not null default '{}',
  embassy_steps    int[]  not null default '{}',     -- completed visa steps (1..7)
  journey_stage    text,                              -- legacy; the UI computes the stage
  target_degree    text,
  target_countries text[] not null default '{}',
  about            text,
  goals            text,
  help_topics      text[] not null default '{}',
  languages        text[] not null default '{}',
  total_points     int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ── mentor_profiles ──────────────────────────────────────────────────────────
create table if not exists public.mentor_profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.profiles(id) on delete cascade,
  current_location text not null default '',
  current_job      text not null default '',
  university       text not null default '',
  graduation_year  int,
  linkedin_url     text,
  bio              text not null default '',
  areas            text[] not null default '{}',
  hobbies          text[] not null default '{}',
  resume_url       text,
  extra_doc_url    text,
  status           public.mentor_status not null default 'pending',
  status_note      text,
  reviewed_at      timestamptz,
  is_available     boolean not null default true,
  weekly_limit     int not null default 3 check (weekly_limit between 1 and 20),
  total_sessions   int not null default 0,
  avg_rating       numeric(3,2) not null default 0,
  total_points     int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.mentor_profiles enable row level security;

-- ── service_requests ─────────────────────────────────────────────────────────
create table if not exists public.service_requests (
  id               uuid primary key default gen_random_uuid(),
  mentee_id        uuid not null references public.profiles(id) on delete cascade,
  mentor_id        uuid references public.mentor_profiles(id) on delete set null,
  service_type     public.service_type not null default 'general',
  title            text not null,
  description      text not null default '',
  status           public.request_status not null default 'pending',
  topics           text[] not null default '{}',
  preferred_date   date,
  preferred_time   text,
  booked_day       int,
  booked_time      text,
  meet_link        text,
  scheduled_at     timestamptz,
  scheduled_for    timestamptz,        -- concrete session moment (expiry anchor)
  reminder_sent_at timestamptz,
  attachment_url   text,
  attachment_name  text,
  admin_note       text,
  responded_at     timestamptz,
  rating           int check (rating between 1 and 5),
  review           text,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.service_requests enable row level security;

-- ── applications + materials ─────────────────────────────────────────────────
create table if not exists public.applications (
  id              uuid primary key default gen_random_uuid(),
  mentee_id       uuid not null references public.profiles(id) on delete cascade,
  university_name text not null,
  country         text not null default '',
  program         text not null default '',
  degree_level    public.degree_level not null default 'masters',
  deadline        date,
  status          public.app_status not null default 'planning',
  notes           text,
  portal_url      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.applications enable row level security;

create table if not exists public.application_material_defaults (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text not null default '',
  degree_levels public.degree_level[] not null default '{bachelor,masters,phd,other}',
  sort_order    int not null default 0
);
alter table public.application_material_defaults enable row level security;

create table if not exists public.application_materials (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  name           text not null,
  description    text not null default '',
  status         public.material_status not null default 'not_started',
  notes          text,
  is_custom      boolean not null default false,
  sort_order     int not null default 0,
  file_url       text,
  file_name      text,
  uploaded_at    timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.application_materials enable row level security;

-- ── scholarships ─────────────────────────────────────────────────────────────
create table if not exists public.scholarships (
  id              uuid primary key default gen_random_uuid(),
  posted_by       uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  provider        text not null default '',
  type            text not null default 'full' check (type in ('full','partial','loan','grant','other')),
  amount          text,
  description     text not null default '',
  deadline        date,
  link            text,
  eligible_levels public.degree_level[] not null default '{bachelor,masters,phd}',
  is_active       boolean not null default true,
  is_verified     boolean not null default false,
  click_count     int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.scholarships enable row level security;

-- ── fee_requests ─────────────────────────────────────────────────────────────
create table if not exists public.fee_requests (
  id          uuid primary key default gen_random_uuid(),
  mentee_id   uuid not null references public.profiles(id) on delete cascade,
  fee_type    text not null,
  amount_usd  numeric(10,2) not null,
  amount_birr numeric(12,2),
  quoted_rate numeric(10,4),
  quoted_at   timestamptz,
  purpose        text not null default '',
  recipient_name text,
  recipient_ref  text,
  notes          text,
  status      text not null default 'pending'
              check (status in ('pending','approved','declined','cancelled','completed')),
  admin_note  text,
  paid_at     timestamptz,
  receipt_url text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint fee_amount_sane check (amount_usd > 0 and amount_usd < 100000)
);
alter table public.fee_requests enable row level security;

-- ── events + registrations ───────────────────────────────────────────────────
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  description   text not null default '',
  type          public.event_type not null default 'workshop',
  status        public.event_status not null default 'pending',
  scheduled_at  timestamptz,
  duration_min  int not null default 60,
  max_attendees int,
  meet_link     text,
  admin_note    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.events enable row level security;

create table if not exists public.event_registrations (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
alter table public.event_registrations enable row level security;

-- ── availability_slots ───────────────────────────────────────────────────────
create table if not exists public.availability_slots (
  id          uuid primary key default gen_random_uuid(),
  mentor_id   uuid not null references public.mentor_profiles(id) on delete cascade,
  day_of_week int  not null check (day_of_week between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  timezone    text not null default 'Africa/Addis_Ababa',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.availability_slots enable row level security;

-- ── points ledgers + milestone config ────────────────────────────────────────
-- Ledgers are written ONLY by database triggers. Clients read them.
create table if not exists public.mentor_points (
  id          uuid primary key default gen_random_uuid(),
  mentor_id   uuid not null references public.profiles(id) on delete cascade,
  points      int  not null,
  reason      text not null,
  source_id   uuid,
  source_type text,
  created_at  timestamptz not null default now()
);
alter table public.mentor_points enable row level security;

create table if not exists public.mentee_points (
  id          uuid primary key default gen_random_uuid(),
  mentee_id   uuid not null references public.profiles(id) on delete cascade,
  points      int  not null,
  reason      text not null,
  source_id   uuid,
  source_type text,
  created_at  timestamptz not null default now()
);
alter table public.mentee_points enable row level security;

create table if not exists public.point_milestones (
  id          uuid primary key default gen_random_uuid(),
  points      int  not null unique,
  title       text not null,
  description text not null default '',
  badge_color text not null default '#E3B23C'
);
alter table public.point_milestones enable row level security;

create table if not exists public.mentee_milestones (
  id          uuid primary key default gen_random_uuid(),
  points      int  not null unique,
  title       text not null,
  description text not null default '',
  badge_color text not null default '#0B1B3A'
);
alter table public.mentee_milestones enable row level security;

-- ── app settings (non-secret config; secrets live in Vault) ──────────────────
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
-- No policies on purpose: only SECURITY DEFINER functions read this.

-- =============================================================================
-- ADMIN HELPER + VIEW (needed by policies and joins below)
-- =============================================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- Public-safe projection for cards and joins (no email, no phone).
drop view if exists public.public_profiles;
create view public.public_profiles
with (security_invoker = false) as
  select id, first_name, last_name, avatar_url, country, role,
         journey_stage, target_degree, target_countries, about,
         goals, help_topics, languages
  from public.profiles;
grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to anon;

-- =============================================================================
-- ROW LEVEL SECURITY (final policy set)
-- =============================================================================

-- ── profiles ─────────────────────────────────────────────────────────────────
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "profiles_update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ── mentor_profiles ──────────────────────────────────────────────────────────
create policy "mp_select" on public.mentor_profiles for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy "mp_insert" on public.mentor_profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy "mp_update" on public.mentor_profiles for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "mp_delete_own_pending" on public.mentor_profiles for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- ── service_requests ─────────────────────────────────────────────────────────
create policy "sr_select" on public.service_requests for select to authenticated
  using (
    mentee_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.mentor_profiles mp
               where mp.user_id = auth.uid() and mp.status = 'approved'
                 and (mp.id = mentor_id or mentor_id is null))
  );
create policy "sr_insert" on public.service_requests for insert to authenticated
  with check (mentee_id = auth.uid());
create policy "sr_update_mentee" on public.service_requests for update to authenticated
  using (mentee_id = auth.uid())
  with check (mentee_id = auth.uid());
create policy "sr_update_mentor" on public.service_requests for update to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.mentor_profiles mp
               where mp.user_id = auth.uid() and mp.status = 'approved'
                 and (mp.id = mentor_id or mentor_id is null))
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.mentor_profiles mp
               where mp.user_id = auth.uid() and mp.status = 'approved'
                 and (mp.id = mentor_id or mentor_id is null))
  );

-- ── applications + materials ─────────────────────────────────────────────────
create policy "apps_all" on public.applications for all to authenticated
  using (mentee_id = auth.uid()) with check (mentee_id = auth.uid());

create policy "amd_select" on public.application_material_defaults
  for select to authenticated using (true);

create policy "mats_all" on public.application_materials for all to authenticated
  using (exists (select 1 from public.applications a
                 where a.id = application_id and a.mentee_id = auth.uid()))
  with check (exists (select 1 from public.applications a
                      where a.id = application_id and a.mentee_id = auth.uid()));

-- ── scholarships ─────────────────────────────────────────────────────────────
create policy "schol_select" on public.scholarships for select to authenticated
  using ((is_active = true and is_verified = true)
         or posted_by = auth.uid() or public.is_admin());
create policy "schol_select_anon" on public.scholarships for select to anon
  using (is_active = true and is_verified = true);
create policy "schol_insert" on public.scholarships for insert to authenticated
  with check (
    posted_by = auth.uid()
    and (public.is_admin()
         or exists (select 1 from public.mentor_profiles mp
                    where mp.user_id = auth.uid() and mp.status = 'approved'))
  );
create policy "schol_update" on public.scholarships for update to authenticated
  using (posted_by = auth.uid() or public.is_admin())
  with check (posted_by = auth.uid() or public.is_admin());
create policy "schol_delete" on public.scholarships for delete to authenticated
  using (posted_by = auth.uid() or public.is_admin());

-- ── fee_requests ─────────────────────────────────────────────────────────────
create policy "fees_select" on public.fee_requests for select to authenticated
  using (mentee_id = auth.uid() or public.is_admin());
create policy "fees_insert" on public.fee_requests for insert to authenticated
  with check (mentee_id = auth.uid());
create policy "fees_update_admin" on public.fee_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "fees_cancel_own" on public.fee_requests for update to authenticated
  using (mentee_id = auth.uid() and status = 'pending')
  with check (mentee_id = auth.uid() and status = 'cancelled');

-- ── events + registrations ───────────────────────────────────────────────────
create policy "ev_select" on public.events for select to authenticated
  using (status = 'approved' or host_id = auth.uid() or public.is_admin());
create policy "ev_insert" on public.events for insert to authenticated
  with check (host_id = auth.uid());
create policy "ev_update" on public.events for update to authenticated
  using (host_id = auth.uid() or public.is_admin())
  with check (host_id = auth.uid() or public.is_admin());
create policy "ev_delete" on public.events for delete to authenticated
  using (host_id = auth.uid());

create policy "reg_select" on public.event_registrations for select to authenticated using (true);
create policy "reg_insert" on public.event_registrations for insert to authenticated
  with check (user_id = auth.uid());
create policy "reg_delete" on public.event_registrations for delete to authenticated
  using (user_id = auth.uid());

-- ── availability + points + milestones ───────────────────────────────────────
create policy "slots_select" on public.availability_slots for select to authenticated using (true);
-- Slot writes happen only through replace_availability_slots() below.

create policy "mentor_points_select" on public.mentor_points for select to authenticated
  using (mentor_id = auth.uid() or public.is_admin());
create policy "mentee_points_select" on public.mentee_points for select to authenticated
  using (mentee_id = auth.uid() or public.is_admin());

create policy "milestones_select"  on public.point_milestones  for select to authenticated using (true);
create policy "mmilestones_select" on public.mentee_milestones for select to authenticated using (true);

-- =============================================================================
-- FUNCTIONS + TRIGGERS (final versions)
-- =============================================================================

-- ── updated_at maintenance ───────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','mentor_profiles','service_requests','applications',
                           'scholarships','fee_requests','events']
  loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ── signup: understand every provider's metadata shape ───────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_full  text  := coalesce(v_meta->>'full_name', v_meta->>'name', '');
  v_first text;
  v_last  text;
begin
  -- Email signup sends first_name/last_name; Google sends given_name/family_name
  -- (plus a combined `name`). Take whichever exists, then split as a last resort.
  v_first := coalesce(nullif(v_meta->>'first_name', ''), nullif(v_meta->>'given_name', ''));
  v_last  := coalesce(nullif(v_meta->>'last_name', ''),  nullif(v_meta->>'family_name', ''));

  if v_first is null and v_full <> '' then
    v_first := split_part(v_full, ' ', 1);
    v_last  := coalesce(v_last, nullif(trim(substring(v_full from position(' ' in v_full) + 1)), ''));
  end if;

  insert into public.profiles (id, email, first_name, last_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(v_first, ''),
    coalesce(v_last, ''),
    nullif(coalesce(v_meta->>'avatar_url', v_meta->>'picture'), ''),
    case when v_meta->>'role' in ('mentee','mentor')
         then (v_meta->>'role')::public.user_role
         else 'mentee' end
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── column guards ────────────────────────────────────────────────────────────
-- No auth.uid() => SQL editor / service key / our own triggers: trusted.
-- app.system_write flag => our own triggers marking their writes: trusted.
create or replace function public.guard_profiles_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or coalesce(current_setting('app.system_write', true), '') = 'on' then
    return new;
  end if;
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_admin is distinct from old.is_admin
       or new.email is distinct from old.email then
      raise exception 'You cannot change role, admin status, or email.';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists guard_profiles_columns on public.profiles;
create trigger guard_profiles_columns before update on public.profiles
  for each row execute function public.guard_profiles_columns();

create or replace function public.guard_mentor_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or coalesce(current_setting('app.system_write', true), '') = 'on' then
    return new;
  end if;
  if not public.is_admin() then
    if new.status            is distinct from old.status
       or new.status_note    is distinct from old.status_note
       or new.reviewed_at    is distinct from old.reviewed_at
       or new.avg_rating     is distinct from old.avg_rating
       or new.total_sessions is distinct from old.total_sessions then
      raise exception 'Verification status and stats can only be changed by an admin.';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists guard_mentor_profile_columns on public.mentor_profiles;
create trigger guard_mentor_profile_columns before update on public.mentor_profiles
  for each row execute function public.guard_mentor_profile_columns();

create or replace function public.guard_scholarship_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or coalesce(current_setting('app.system_write', true), '') = 'on' then
    return new;
  end if;
  if not public.is_admin() and new.is_verified is distinct from old.is_verified then
    raise exception 'Scholarship publishing is handled by an admin.';
  end if;
  return new;
end; $$;

drop trigger if exists guard_scholarship_columns on public.scholarships;
create trigger guard_scholarship_columns before update on public.scholarships
  for each row execute function public.guard_scholarship_columns();

create or replace function public.guard_event_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if (new.status is distinct from old.status and new.status <> 'cancelled')
       or new.admin_note is distinct from old.admin_note then
      raise exception 'Event approval is handled by an admin.';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists guard_event_columns on public.events;
create trigger guard_event_columns before update on public.events
  for each row execute function public.guard_event_columns();

-- Field-level request rules RLS cannot express:
--   mentee: may cancel while pending; may rate once after completion; cannot
--           touch status transitions, meet_link, scheduling, or reassignment.
--   mentor: may approve/decline/complete and set scheduling; cannot touch
--           rating/review; may claim unassigned requests only for themselves.
create or replace function public.guard_service_request_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller_is_mentee boolean := (old.mentee_id = auth.uid());
  caller_is_mentor boolean := exists (
    select 1 from public.mentor_profiles mp
    where mp.user_id = auth.uid() and (mp.id = old.mentor_id or old.mentor_id is null));
begin
  if public.is_admin() then return new; end if;

  if caller_is_mentee and not caller_is_mentor then
    if (new.rating is distinct from old.rating or new.review is distinct from old.review) then
      if old.status <> 'completed' then raise exception 'You can rate only completed sessions.'; end if;
      if old.rating is not null then raise exception 'This session was already rated.'; end if;
    end if;
    if new.status is distinct from old.status
       and not (old.status = 'pending' and new.status = 'cancelled') then
      raise exception 'Mentees can only cancel pending requests.';
    end if;
    if new.meet_link is distinct from old.meet_link
       or new.scheduled_at is distinct from old.scheduled_at
       or new.mentor_id is distinct from old.mentor_id then
      raise exception 'Only the mentor can set scheduling details.';
    end if;

  elsif caller_is_mentor then
    if new.rating is distinct from old.rating or new.review is distinct from old.review then
      raise exception 'Only the mentee can rate the session.';
    end if;
    if new.mentor_id is distinct from old.mentor_id then
      if old.mentor_id is not null
         or not exists (select 1 from public.mentor_profiles mp
                        where mp.id = new.mentor_id and mp.user_id = auth.uid()) then
        raise exception 'Requests can only be claimed, not reassigned.';
      end if;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists guard_service_request_columns on public.service_requests;
create trigger guard_service_request_columns before update on public.service_requests
  for each row execute function public.guard_service_request_columns();

-- ── stats + points: computed by the database, never the browser ──────────────
create or replace function public.on_service_request_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.system_write', 'on', true);  -- transaction-local

  -- Session counter + mentor points: exactly once per completion.
  if new.status = 'completed' and old.status is distinct from new.status then
    update public.mentor_profiles
      set total_sessions = total_sessions + 1
      where id = new.mentor_id;
    insert into public.mentor_points (mentor_id, points, reason, source_id, source_type)
    select mp.user_id, 10, 'Completed a mentorship session', new.id, 'session'
    from public.mentor_profiles mp where mp.id = new.mentor_id;
  end if;

  -- Rating: recompute the aggregate, award mentee points, and give the
  -- mentor impact points equal to the stars received (1-5).
  if new.rating is not null and old.rating is distinct from new.rating then
    update public.mentor_profiles m
      set avg_rating = sub.avg
      from (select mentor_id, round(avg(rating)::numeric, 2) as avg
            from public.service_requests
            where mentor_id = new.mentor_id and rating is not null
            group by mentor_id) sub
      where m.id = sub.mentor_id;
    insert into public.mentee_points (mentee_id, points, reason, source_id, source_type)
    values (new.mentee_id, 5, 'Rated a completed session', new.id, 'rating');
    insert into public.mentor_points (mentor_id, points, reason, source_id, source_type)
    select mp.user_id, new.rating,
           'Received a ' || new.rating || '-star rating', new.id, 'rating'
    from public.mentor_profiles mp where mp.id = new.mentor_id;
  end if;

  perform set_config('app.system_write', 'off', true);
  return new;
end; $$;

drop trigger if exists on_service_request_change on public.service_requests;
create trigger on_service_request_change after update on public.service_requests
  for each row execute function public.on_service_request_change();

-- ── welcome bonus when a mentor is approved ──────────────────────────────────
create or replace function public.on_mentor_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    insert into public.mentor_points (mentor_id, points, reason, source_type)
    select new.user_id, 5, 'Welcome aboard, approved as a mentor', 'bonus'
    where not exists (
      select 1 from public.mentor_points
      where mentor_id = new.user_id and source_type = 'bonus'
    );
  end if;
  return new;
end; $$;

drop trigger if exists on_mentor_approved on public.mentor_profiles;
create trigger on_mentor_approved after update on public.mentor_profiles
  for each row execute function public.on_mentor_approved();

-- ── scheduling: real session time + shared video link on approval ────────────
create or replace function public.next_slot_occurrence(p_day int, p_time text)
returns timestamptz language plpgsql stable as $$
declare
  v_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
  v_date  date := v_today + ((p_day - extract(dow from v_today)::int + 7) % 7);
  v_ts    timestamptz;
begin
  v_ts := (v_date::text || ' ' || p_time)::timestamp at time zone 'Africa/Addis_Ababa';
  if v_ts <= now() then
    v_ts := v_ts + interval '7 days';
  end if;
  return v_ts;
end; $$;

create or replace function public.on_request_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    -- Real session time from the booked slot (falls back to whatever was set).
    if new.booked_day is not null and new.booked_time is not null then
      new.scheduled_at  := public.next_slot_occurrence(new.booked_day, new.booked_time);
      new.scheduled_for := new.scheduled_at;   -- expiry anchor for the link
    end if;
    -- One shared link for both sides. Jitsi rooms work instantly with no
    -- account; a manually pasted Google Meet link is kept when provided.
    if new.meet_link is null or new.meet_link = '' then
      new.meet_link := 'https://meet.jit.si/EMG-' || substr(md5(new.id::text || now()::text), 1, 12);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists on_request_approval on public.service_requests;
create trigger on_request_approval before update on public.service_requests
  for each row execute function public.on_request_approval();

-- ── events: shared video link on approval too ────────────────────────────────
create or replace function public.on_event_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    if new.meet_link is null or new.meet_link = '' then
      new.meet_link := 'https://meet.jit.si/EMG-event-' || substr(md5(new.id::text || now()::text), 1, 12);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists on_event_approval on public.events;
create trigger on_event_approval before update on public.events
  for each row execute function public.on_event_approval();

-- ── fee requests: client amounts are estimates only ──────────────────────────
create or replace function public.sanitize_fee_request()
returns trigger language plpgsql as $$
begin
  new.amount_birr := null;
  new.quoted_rate := null;
  new.quoted_at   := null;
  new.status      := 'pending';
  new.paid_at     := null;
  new.receipt_url := null;
  return new;
end; $$;

drop trigger if exists sanitize_fee_request on public.fee_requests;
create trigger sanitize_fee_request before insert on public.fee_requests
  for each row execute function public.sanitize_fee_request();

-- ── checklist auto-population ────────────────────────────────────────────────
create or replace function public.populate_default_materials()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.application_materials (application_id, name, description, sort_order)
  select new.id, d.name, d.description, d.sort_order
  from public.application_material_defaults d
  where new.degree_level = any(d.degree_levels)
  order by d.sort_order;
  return new;
end; $$;

drop trigger if exists populate_default_materials on public.applications;
create trigger populate_default_materials after insert on public.applications
  for each row execute function public.populate_default_materials();

-- ── admin conveniences ───────────────────────────────────────────────────────
-- An admin's own scholarship / event needs no second review.
create or replace function public.autoverify_admin_scholarship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then new.is_verified := true; end if;
  return new;
end; $$;

drop trigger if exists autoverify_admin_scholarship on public.scholarships;
create trigger autoverify_admin_scholarship before insert on public.scholarships
  for each row execute function public.autoverify_admin_scholarship();

create or replace function public.autoapprove_admin_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then new.status := 'approved'; end if;
  return new;
end; $$;

drop trigger if exists autoapprove_admin_event on public.events;
create trigger autoapprove_admin_event before insert on public.events
  for each row execute function public.autoapprove_admin_event();

-- =============================================================================
-- RPCs (the client's safe entry points)
-- =============================================================================

-- Atomic availability save (no client table writes on slots).
create or replace function public.replace_availability_slots(p_slots jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_mentor_id uuid;
begin
  select id into v_mentor_id from public.mentor_profiles
    where user_id = auth.uid() and status = 'approved';
  if v_mentor_id is null then raise exception 'Not an approved mentor.'; end if;

  delete from public.availability_slots where mentor_id = v_mentor_id;
  insert into public.availability_slots (mentor_id, day_of_week, start_time, end_time, timezone, is_active)
  select v_mentor_id,
         (s->>'day_of_week')::int, (s->>'start_time')::time,
         (s->>'end_time')::time, coalesce(s->>'timezone','Africa/Addis_Ababa'), true
  from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) s;
end; $$;

-- Scholarship interest counter.
create or replace function public.increment_scholarship_click(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.scholarships set click_count = click_count + 1 where id = p_id;
$$;
grant execute on function public.increment_scholarship_click(uuid) to authenticated;
grant execute on function public.increment_scholarship_click(uuid) to anon;

-- Written reviews for a mentor's public profile (rating + words only).
create or replace function public.get_mentor_reviews(p_mentor_profile_id uuid)
returns table (rating int, feedback text, created_at timestamptz, reviewer text)
language sql stable security definer set search_path = public as $$
  select sr.rating, sr.review, sr.updated_at, p.first_name
  from public.service_requests sr
  join public.profiles p on p.id = sr.mentee_id
  where sr.mentor_id = p_mentor_profile_id
    and sr.rating is not null
  order by sr.updated_at desc
  limit 50;
$$;
grant execute on function public.get_mentor_reviews(uuid) to authenticated;

-- Student snapshot for a mentor who actually works with them (or an admin).
create or replace function public.get_student_snapshot(p_mentee_id uuid)
returns table (
  first_name       text,
  last_name        text,
  avatar_url       text,
  country          text,
  journey_stage    text,
  target_degree    text,
  target_countries text[],
  about            text,
  goals            text,
  help_topics      text[],
  languages        text[],
  applications     int,
  submitted        int,
  accepted         int,
  materials_total  int,
  materials_done   int,
  visa_steps_done  int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (
    public.is_admin()
    or exists (
      select 1 from public.service_requests sr
      join public.mentor_profiles mp on mp.id = sr.mentor_id
      where mp.user_id = auth.uid()
        and sr.mentee_id = p_mentee_id
        and sr.status in ('pending','approved','completed')
    )
  ) then
    raise exception 'You can only view students you are working with.';
  end if;

  return query
  select
    p.first_name, p.last_name, p.avatar_url, p.country,
    p.journey_stage, p.target_degree, p.target_countries, p.about,
    p.goals, p.help_topics, p.languages,
    (select count(*)::int from public.applications a where a.mentee_id = p.id),
    (select count(*)::int from public.applications a where a.mentee_id = p.id and a.status = 'submitted'),
    (select count(*)::int from public.applications a where a.mentee_id = p.id and a.status = 'accepted'),
    (select count(*)::int from public.application_materials m
       join public.applications a on a.id = m.application_id where a.mentee_id = p.id),
    (select count(*)::int from public.application_materials m
       join public.applications a on a.id = m.application_id
       where a.mentee_id = p.id and m.status = 'done'),
    coalesce(array_length(p.embassy_steps, 1), 0)
  from public.profiles p
  where p.id = p_mentee_id;
end; $$;

grant execute on function public.get_student_snapshot(uuid) to authenticated;

-- A mentor's total impact points, readable by anyone (the ledger stays private).
create or replace function public.get_mentor_impact(p_user_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(points), 0)::int
  from public.mentor_points
  where mentor_id = p_user_id;
$$;
grant execute on function public.get_mentor_impact(uuid) to authenticated;
grant execute on function public.get_mentor_impact(uuid) to anon;

-- Reapplying after a decline (7-day cooling-off, enforced server-side).
create or replace function public.reapply_as_mentor()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   public.mentor_status;
  v_reviewed timestamptz;
  v_cooldown interval := interval '7 days';
begin
  select status, reviewed_at into v_status, v_reviewed
  from public.mentor_profiles where user_id = auth.uid();

  if v_status is null then
    raise exception 'You do not have an application to replace.';
  end if;
  if v_status <> 'rejected' then
    raise exception 'Only a declined application can be replaced.';
  end if;
  if v_reviewed is not null and now() < v_reviewed + v_cooldown then
    raise exception 'You can reapply on %, take the time to strengthen your application first.',
      to_char((v_reviewed + v_cooldown) at time zone 'Africa/Addis_Ababa', 'Mon FMDD, YYYY');
  end if;

  delete from public.mentor_profiles where user_id = auth.uid();
end;
$$;

grant execute on function public.reapply_as_mentor() to authenticated;

-- Admin account deletion (auth schema is off-limits to the anon key).
create or replace function public.admin_delete_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete accounts.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account here.';
  end if;
  delete from auth.users where id = p_user_id;
end; $$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

-- =============================================================================
-- EMAIL NOTIFICATIONS (best-effort; skipped when pg_net / Resend not set up)
-- =============================================================================

create or replace function public.get_resend_key()
returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'resend_api_key' limit 1;
$$;

-- Fire-and-forget email. Never raises: an approval matters more than its email.
create or replace function public.send_email(p_to text, p_subject text, p_html text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_key  text := public.get_resend_key();
  v_from text := (select value from public.app_settings where key = 'email_from');
begin
  if v_key is null or v_from is null or p_to is null then
    raise notice 'send_email skipped (missing key/from/recipient)';
    return;
  end if;
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'from', v_from, 'to', p_to, 'subject', p_subject, 'html', p_html
    )
  );
exception when others then
  raise notice 'send_email failed: %', sqlerrm;
end; $$;

-- Approval emails to both parties.
create or replace function public.on_request_approval_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mentee record;
  v_mentor record;
  v_when   text;
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    select email, first_name into v_mentee from public.profiles where id = new.mentee_id;
    select p.email, p.first_name into v_mentor
      from public.mentor_profiles mp join public.profiles p on p.id = mp.user_id
      where mp.id = new.mentor_id;

    v_when := coalesce(
      to_char(new.scheduled_at at time zone 'Africa/Addis_Ababa',
              'Dy, Mon FMDD "at" HH24:MI') || ' (Addis Ababa time)',
      'the scheduled time');

    perform public.send_email(
      v_mentee.email,
      'Your mentorship session is confirmed',
      '<p>Hi ' || coalesce(v_mentee.first_name, 'there') || ',</p>'
      || '<p>Your session <strong>' || new.title || '</strong> is confirmed for <strong>'
      || v_when || '</strong>.</p>'
      || '<p><a href="' || new.meet_link || '">Join the video call</a>, the same link works for both of you.</p>'
      || '<p>Ethio Mentor Group</p>');

    if v_mentor.email is not null then
      perform public.send_email(
        v_mentor.email,
        'Session confirmed with your mentee',
        '<p>Hi ' || coalesce(v_mentor.first_name, 'there') || ',</p>'
        || '<p>You confirmed <strong>' || new.title || '</strong> for <strong>' || v_when || '</strong>.</p>'
        || '<p><a href="' || new.meet_link || '">Join the video call</a></p>'
        || '<p>Ethio Mentor Group</p>');
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists on_request_approval_notify on public.service_requests;
create trigger on_request_approval_notify after update on public.service_requests
  for each row execute function public.on_request_approval_notify();

-- Reminders ~30 minutes before the session (each session reminded once).
create or replace function public.send_session_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select sr.id, sr.title, sr.meet_link, sr.scheduled_at,
           me.email as mentee_email, me.first_name as mentee_name,
           mp_p.email as mentor_email, mp_p.first_name as mentor_name
    from public.service_requests sr
    join public.profiles me on me.id = sr.mentee_id
    left join public.mentor_profiles mp on mp.id = sr.mentor_id
    left join public.profiles mp_p on mp_p.id = mp.user_id
    where sr.status = 'approved'
      and sr.reminder_sent_at is null
      and sr.scheduled_at between now() and now() + interval '35 minutes'
  loop
    perform public.send_email(
      r.mentee_email,
      'Starting soon: ' || r.title,
      '<p>Hi ' || coalesce(r.mentee_name, 'there') || ', your session starts at <strong>'
      || to_char(r.scheduled_at at time zone 'Africa/Addis_Ababa', 'HH24:MI')
      || '</strong> (Addis Ababa time).</p><p><a href="' || r.meet_link || '">Join now</a></p>');
    if r.mentor_email is not null then
      perform public.send_email(
        r.mentor_email,
        'Starting soon: ' || r.title,
        '<p>Hi ' || coalesce(r.mentor_name, 'there') || ', your session starts at <strong>'
        || to_char(r.scheduled_at at time zone 'Africa/Addis_Ababa', 'HH24:MI')
        || '</strong> (Addis Ababa time).</p><p><a href="' || r.meet_link || '">Join now</a></p>');
    end if;
    update public.service_requests set reminder_sent_at = now() where id = r.id;
  end loop;
end; $$;

-- Every 10 minutes, when pg_cron is available.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'emg-session-reminders') then
      perform cron.schedule('emg-session-reminders', '*/10 * * * *',
                            'select public.send_session_reminders()');
    end if;
  end if;
exception when others then
  raise notice 'reminder cron not scheduled (%).', sqlerrm;
end $$;

-- =============================================================================
-- INDEXES
-- =============================================================================
create index if not exists idx_sr_mentee    on public.service_requests (mentee_id);
create index if not exists idx_sr_mentor    on public.service_requests (mentor_id);
create index if not exists idx_sr_status    on public.service_requests (status);
create index if not exists idx_apps_mentee  on public.applications (mentee_id);
create index if not exists idx_apps_deadln  on public.applications (deadline);
create index if not exists idx_mats_app     on public.application_materials (application_id);
create index if not exists idx_mp_user      on public.mentor_profiles (user_id);
create index if not exists idx_mp_status    on public.mentor_profiles (status);
create index if not exists idx_fees_mentee  on public.fee_requests (mentee_id);
create index if not exists idx_schol_deadl  on public.scholarships (deadline) where is_active;
create index if not exists idx_ev_status    on public.events (status);
create index if not exists idx_slots_mentor on public.availability_slots (mentor_id);

-- =============================================================================
-- STORAGE
-- =============================================================================

-- avatars: public bucket, users write only inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatars_read"   on storage.objects;
drop policy if exists "avatars_insert" on storage.objects;
drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_read"   on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- documents: private bucket. Path convention: {user_id}/{application_id}/{file}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "docs_insert" on storage.objects;
drop policy if exists "docs_update" on storage.objects;
drop policy if exists "docs_delete" on storage.objects;
drop policy if exists "docs_select" on storage.objects;

create policy "docs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs_update" on storage.objects for update to authenticated
  using (bucket_id = 'documents'
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- Readable by: the owner, any admin, and a mentor with a live request from
-- that student (so they can review the essay they were asked about).
create policy "docs_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1
        from public.service_requests sr
        join public.mentor_profiles mp on mp.id = sr.mentor_id
        where mp.user_id = auth.uid()
          and sr.mentee_id::text = (storage.foldername(name))[1]
          and sr.status in ('pending','approved','completed')
      )
    )
  );

-- =============================================================================
-- CONFIG SEEDS (not demo data)
-- =============================================================================

insert into public.point_milestones (points, title, description, badge_color) values
  (10,  'First Steps',    'Completed your first mentorship session.',         '#10b981'),
  (25,  'Rising Star',    'Helped five or more students on their journey.',   '#3b82f6'),
  (50,  'Pathfinder',     'Fifty points of guidance given to the community.', '#8b5cf6'),
  (100, 'Community Hero', 'One hundred points. You are shaping futures.',     '#E3B23C'),
  (200, 'Legend',         'Two hundred points of extraordinary impact.',      '#ef4444')
on conflict (points) do nothing;

insert into public.mentee_milestones (points, title, description, badge_color) values
  (5,   'Explorer',      'Completed your first mentorship session.',          '#10b981'),
  (15,  'Committed',     'Three or more sessions on your journey.',           '#3b82f6'),
  (30,  'Go-Getter',     'Consistent progress across sessions and events.',   '#8b5cf6'),
  (60,  'Trailblazer',   'Sixty points of dedicated preparation.',            '#E3B23C'),
  (100, 'Future Leader', 'Extraordinary dedication to your goals.',           '#ef4444')
on conflict (points) do nothing;

-- The default application checklist (final version, per 014).
insert into public.application_material_defaults (name, description, degree_levels, sort_order) values
  ('Personal essay',           'Your story: who you are beyond grades.',                        '{bachelor,masters,phd,other}', 1),
  ('Statement of Purpose',     'Why this program, why this university, why you.',               '{bachelor,masters,phd,other}', 2),
  ('English test result',      'IELTS / TOEFL / Duolingo score report, per program rules.',     '{bachelor,masters,phd,other}', 3),
  ('Transcripts',              'Official academic records from all institutions attended.',     '{bachelor,masters,phd,other}', 4),
  ('Resume',                   'One to two pages of education, work, and achievements.',        '{bachelor,masters,phd,other}', 5),
  ('Degree',                   'Degree certificate or diploma (or expected graduation proof).', '{bachelor,masters,phd,other}', 6),
  ('Letter of Recommendation', 'From professors or supervisors who know your work.',            '{bachelor,masters,phd,other}', 7),
  ('Financial Documents',      'Bank statements or sponsor letters, per the university.',       '{bachelor,masters,phd,other}', 8)
on conflict do nothing;

-- =============================================================================
-- Done. Next: notify pgrst, 'reload schema';  then sign in and promote admin.
-- =============================================================================
