-- =============================================================================
-- 001_full_schema.sql — Ethio Mentor Group: complete database schema
-- Rebuilds the entire database from scratch (fresh project / staging / DR).
-- If your live project already has these objects, skip to 002_fixes.sql.
-- Contains: tables, enums, RLS, storage bucket, triggers, and CONFIG seeds
-- (milestones + application material defaults). No demo/dummy data.
-- =============================================================================

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

-- ── profiles ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  first_name   text not null default '',
  last_name    text not null default '',
  role         public.user_role not null default 'mentee',
  avatar_url   text,
  phone        text,
  country      text,
  hobbies      text[] not null default '{}',
  total_points int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
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
  id             uuid primary key default gen_random_uuid(),
  mentee_id      uuid not null references public.profiles(id) on delete cascade,
  mentor_id      uuid references public.mentor_profiles(id) on delete set null,
  service_type   public.service_type not null default 'general',
  title          text not null,
  description    text not null default '',
  status         public.request_status not null default 'pending',
  topics         text[] not null default '{}',
  preferred_date date,
  preferred_time text,
  booked_day     int,
  booked_time    text,
  meet_link      text,
  scheduled_at   timestamptz,
  admin_note     text,
  responded_at   timestamptz,
  rating         int check (rating between 1 and 5),
  review         text,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
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
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text not null default '',
  degree_levels public.degree_level[] not null default '{bachelor,masters,phd,other}',
  sort_order   int not null default 0
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
  updated_at  timestamptz not null default now()
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
-- Ledgers are written ONLY by database triggers (002). Clients read them.
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

-- ── Baseline RLS policies (001 era — tightened further by 002) ──────────────
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_update" on public.profiles for update to authenticated using (auth.uid() = id);

create policy "mp_select" on public.mentor_profiles for select to authenticated
  using (status = 'approved' or user_id = auth.uid());
create policy "mp_insert" on public.mentor_profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy "mp_update" on public.mentor_profiles for update to authenticated
  using (user_id = auth.uid());

create policy "sr_select" on public.service_requests for select to authenticated
  using (mentee_id = auth.uid()
         or exists (select 1 from public.mentor_profiles mp
                    where mp.user_id = auth.uid() and (mp.id = mentor_id or mentor_id is null)));
create policy "sr_insert" on public.service_requests for insert to authenticated
  with check (mentee_id = auth.uid());
create policy "sr_update" on public.service_requests for update to authenticated
  using (mentee_id = auth.uid());

create policy "apps_all" on public.applications for all to authenticated
  using (mentee_id = auth.uid()) with check (mentee_id = auth.uid());

create policy "amd_select" on public.application_material_defaults for select to authenticated using (true);

create policy "mats_all" on public.application_materials for all to authenticated
  using (exists (select 1 from public.applications a
                 where a.id = application_id and a.mentee_id = auth.uid()))
  with check (exists (select 1 from public.applications a
                      where a.id = application_id and a.mentee_id = auth.uid()));

create policy "schol_select" on public.scholarships for select to authenticated using (is_active = true or posted_by = auth.uid());
create policy "schol_insert" on public.scholarships for insert to authenticated with check (posted_by = auth.uid());
create policy "schol_update" on public.scholarships for update to authenticated using (posted_by = auth.uid());
create policy "schol_delete" on public.scholarships for delete to authenticated using (posted_by = auth.uid());

create policy "fees_select" on public.fee_requests for select to authenticated using (mentee_id = auth.uid());
create policy "fees_insert" on public.fee_requests for insert to authenticated with check (mentee_id = auth.uid());

create policy "ev_select" on public.events for select to authenticated
  using (status = 'approved' or host_id = auth.uid());
create policy "ev_insert" on public.events for insert to authenticated with check (host_id = auth.uid());
create policy "ev_update" on public.events for update to authenticated using (host_id = auth.uid());
create policy "ev_delete" on public.events for delete to authenticated using (host_id = auth.uid());

create policy "reg_select" on public.event_registrations for select to authenticated using (true);
create policy "reg_insert" on public.event_registrations for insert to authenticated with check (user_id = auth.uid());
create policy "reg_delete" on public.event_registrations for delete to authenticated using (user_id = auth.uid());

create policy "slots_select" on public.availability_slots for select to authenticated using (true);
-- Client-side slot writes are replaced by the replace_availability_slots RPC in 002.

create policy "milestones_select"  on public.point_milestones  for select to authenticated using (true);
create policy "mmilestones_select" on public.mentee_milestones for select to authenticated using (true);
-- Points ledgers: read policies added in 003; no client write policies ever.

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

-- ── signup trigger (hardened version ships in 002) ───────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, first_name, last_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    'mentee'
  ) on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── auto-populate application checklist ──────────────────────────────────────
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

-- ── storage: avatars bucket ──────────────────────────────────────────────────
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

-- ── CONFIG SEEDS (not demo data) ─────────────────────────────────────────────
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

insert into public.application_material_defaults (name, description, degree_levels, sort_order) values
  ('Statement of Purpose',      'Your main essay: why this program, why you.',          '{bachelor,masters,phd,other}', 1),
  ('Academic transcripts',      'Official records from all institutions attended.',     '{bachelor,masters,phd,other}', 2),
  ('Letters of recommendation', 'Usually 2-3, from professors or supervisors.',         '{masters,phd}',                3),
  ('English test score',        'IELTS / TOEFL / Duolingo, per program requirements.',  '{bachelor,masters,phd,other}', 4),
  ('CV / Resume',               'Academic CV highlighting research and experience.',    '{masters,phd,other}',          5),
  ('Passport copy',             'Valid for at least six months beyond intended stay.',  '{bachelor,masters,phd,other}', 6),
  ('Financial documents',       'Bank statements or sponsor letters, per checklist.',   '{bachelor,masters,phd,other}', 7),
  ('Application fee',           'Paid or waiver confirmed.',                            '{bachelor,masters,phd,other}', 8),
  ('Research proposal',         'Required for most PhD and research-based programs.',   '{phd}',                        9),
  ('Writing sample',            'If the program requests one.',                         '{masters,phd}',               10)
on conflict do nothing;
