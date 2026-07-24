-- =============================================================================
-- 005_polish_and_fixes.sql — run after 004.
-- 1) FIX: rating/completing a session raised "Verification status and stats
--    can only be changed by an admin." Cause: the system trigger that updates
--    avg_rating / total_sessions runs AS the requesting user, so the column
--    guard from 002 blocked it. A session-local flag now marks system writes.
-- 2) Impact points: welcome bonus on mentor approval + points from ratings.
-- 3) Scholarships get an admin review step (is_verified).
-- 4) Events auto-generate a video link on approval, like sessions do.
-- 5) DATA FIX: events created from the dashboard stored mentor_profiles.id
--    in host_id instead of the user id; remap existing rows.
-- =============================================================================

-- ── 1. System-write bypass for column guards ─────────────────────────────────
create or replace function public.guard_mentor_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Writes initiated by our own triggers mark themselves; user writes don't.
  if coalesce(current_setting('app.system_write', true), '') = 'on' then
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

-- Rewritten stats trigger: flags its own writes, awards rating points too.
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

-- ── 2. Welcome bonus when a mentor is approved ───────────────────────────────
create or replace function public.on_mentor_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    insert into public.mentor_points (mentor_id, points, reason, source_type)
    select new.user_id, 5, 'Welcome aboard — approved as a mentor', 'bonus'
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

-- ── 3. Scholarships: submitted for review, published by admins ───────────────
alter table public.scholarships
  add column if not exists is_verified boolean not null default false;

-- Public sees verified+active only; posters always see their own; admins all.
drop policy if exists "schol_select" on public.scholarships;
create policy "schol_select" on public.scholarships for select to authenticated
  using ((is_active = true and is_verified = true)
         or posted_by = auth.uid() or public.is_admin());

drop policy if exists "schol_select_anon" on public.scholarships;
create policy "schol_select_anon" on public.scholarships for select to anon
  using (is_active = true and is_verified = true);

-- Only admins flip is_verified (posters can still edit their own content).
create or replace function public.guard_scholarship_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and new.is_verified is distinct from old.is_verified then
    raise exception 'Scholarship publishing is handled by an admin.';
  end if;
  return new;
end; $$;

drop trigger if exists guard_scholarship_columns on public.scholarships;
create trigger guard_scholarship_columns before update on public.scholarships
  for each row execute function public.guard_scholarship_columns();

-- ── 4. Events: auto-generate a shared video link on approval ─────────────────
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

-- ── 5. DATA FIX: remap dashboard-created events to the correct host id ───────
update public.events e
set host_id = mp.user_id
from public.mentor_profiles mp
where e.host_id = mp.id;   -- only matches rows that stored the wrong id
