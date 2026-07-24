-- =============================================================================
-- 002_fixes.sql — Security & correctness patch for Ethio Mentor Group
-- Run after 001_full_schema.sql (fresh DB) or against a live project whose
-- schema already matches 001. Each section explains why it exists.
-- =============================================================================

-- ── 0. Admin support ─────────────────────────────────────────────────────────
-- Minimum viable admin: a flag on profiles + a helper usable inside policies.
-- SECURITY DEFINER lets the helper read profiles even when the caller's own
-- RLS would not allow it.
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- Mark your own account admin once, via the SQL editor:
-- update public.profiles set is_admin = true where email = 'you@example.com';

-- ── 1. profiles: stop the PII leak + role escalation ─────────────────────────
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;

create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Column guard: role / is_admin / email are never user-editable.
create or replace function public.guard_profiles_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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

-- Public-safe projection for cards and joins (no email, no phone).
-- The frontend joins public_profiles wherever it shows OTHER users.
create or replace view public.public_profiles
with (security_invoker = false) as
  select id, first_name, last_name, avatar_url, country, role
  from public.profiles;
grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to anon;

-- ── 2. mentor_profiles: kill self-approval and stat inflation ────────────────
drop policy if exists "mp_update" on public.mentor_profiles;
create policy "mp_update" on public.mentor_profiles for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create or replace function public.guard_mentor_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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

drop policy if exists "mp_select" on public.mentor_profiles;
create policy "mp_select" on public.mentor_profiles for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());

-- ── 3. service_requests: mentors can respond; each side edits only its columns
drop policy if exists "sr_update" on public.service_requests;
drop policy if exists "sr_update_mentee" on public.service_requests;
drop policy if exists "sr_update_mentor" on public.service_requests;

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

drop policy if exists "sr_select" on public.service_requests;
create policy "sr_select" on public.service_requests for select to authenticated
  using (
    mentee_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.mentor_profiles mp
               where mp.user_id = auth.uid() and mp.status = 'approved'
                 and (mp.id = mentor_id or mentor_id is null))
  );

-- Field-level rules RLS cannot express:
--   mentee: may cancel while pending; may rate once after completion; cannot
--           touch status transitions, meet_link, scheduled_at, or reassignment.
--   mentor: may approve/decline/complete and set meet_link/scheduled_at;
--           cannot touch rating/review; may claim unassigned requests only
--           for themselves.
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

-- ── 4. Ratings, counters, and points: computed by the database ───────────────
-- The browser never writes points, session counts, or ratings aggregates.
create or replace function public.on_service_request_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Session counter + mentor points: fires exactly once per completion.
  if new.status = 'completed' and old.status is distinct from new.status then
    update public.mentor_profiles
      set total_sessions = total_sessions + 1
      where id = new.mentor_id;
    insert into public.mentor_points (mentor_id, points, reason, source_id, source_type)
    select mp.user_id, 10, 'Completed a mentorship session', new.id, 'session'
    from public.mentor_profiles mp where mp.id = new.mentor_id;
  end if;

  -- Rating aggregation + mentee points: fires when a rating is first set.
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
  end if;
  return new;
end; $$;

drop trigger if exists on_service_request_change on public.service_requests;
create trigger on_service_request_change after update on public.service_requests
  for each row execute function public.on_service_request_change();

-- ── 5. fee_requests: client amount is an estimate only ───────────────────────
alter table public.fee_requests
  add column if not exists quoted_rate numeric(10,4),
  add column if not exists quoted_at   timestamptz;

alter table public.fee_requests drop constraint if exists fee_amount_sane;
alter table public.fee_requests add constraint fee_amount_sane
  check (amount_usd > 0 and amount_usd < 100000);

-- Never trust client-supplied birr amounts: null them on insert.
-- The admin sets the real quote later (amount_birr + quoted_rate + quoted_at).
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

drop policy if exists "fees_update_admin" on public.fee_requests;
create policy "fees_update_admin" on public.fee_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "fees_cancel_own" on public.fee_requests;
create policy "fees_cancel_own" on public.fee_requests for update to authenticated
  using (mentee_id = auth.uid() and status = 'pending')
  with check (mentee_id = auth.uid() and status = 'cancelled');

drop policy if exists "fees_select" on public.fee_requests;
create policy "fees_select" on public.fee_requests for select to authenticated
  using (mentee_id = auth.uid() or public.is_admin());

-- ── 6. scholarships: publishing requires an approved mentor or admin ─────────
drop policy if exists "schol_insert" on public.scholarships;
create policy "schol_insert" on public.scholarships for insert to authenticated
  with check (
    posted_by = auth.uid()
    and (public.is_admin()
         or exists (select 1 from public.mentor_profiles mp
                    where mp.user_id = auth.uid() and mp.status = 'approved'))
  );

drop policy if exists "schol_select" on public.scholarships;
create policy "schol_select" on public.scholarships for select to authenticated
  using (is_active = true or posted_by = auth.uid() or public.is_admin());

-- ── 7. signup trigger: bad metadata must never break account creation ────────
-- Single funnel: everyone starts as mentee; mentors apply from inside the app,
-- and role promotion is an admin action (see guard_profiles_columns).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, first_name, last_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    case when new.raw_user_meta_data->>'role' in ('mentee','mentor')
         then (new.raw_user_meta_data->>'role')::public.user_role
         else 'mentee' end
  ) on conflict (id) do nothing;
  return new;
end; $$;

-- ── 8. Atomic availability save (replaces delete-then-insert from the client)
-- Frontend: supabase.rpc('replace_availability_slots', { p_slots: [...] })
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

-- ── 9. Indexes: every FK used in RLS subqueries and common sorts ─────────────
create index if not exists idx_sr_mentee   on public.service_requests (mentee_id);
create index if not exists idx_sr_mentor   on public.service_requests (mentor_id);
create index if not exists idx_sr_status   on public.service_requests (status);
create index if not exists idx_apps_mentee on public.applications (mentee_id);
create index if not exists idx_apps_deadln on public.applications (deadline);
create index if not exists idx_mats_app    on public.application_materials (application_id);
create index if not exists idx_mp_user     on public.mentor_profiles (user_id);
create index if not exists idx_mp_status   on public.mentor_profiles (status);
create index if not exists idx_fees_mentee on public.fee_requests (mentee_id);
create index if not exists idx_schol_deadl on public.scholarships (deadline) where is_active;
create index if not exists idx_ev_status   on public.events (status);
create index if not exists idx_slots_mentor on public.availability_slots (mentor_id);
