-- =============================================================================
-- 009_backfill_mentor_stats.sql — run after 008.
--
-- Why a mentor with completed, rated sessions still shows 0 sessions, no stars
-- and no impact points: those numbers are written by triggers, and before 005
-- the column guard was REJECTING the triggers' own writes ("Verification status
-- and stats can only be changed by an admin"). Every session completed or rated
-- before that fix left the counters untouched.
--
-- This recomputes the truth from service_requests — the source of record — and
-- backfills the points ledger for sessions and ratings that never got theirs.
-- Idempotent: safe to run more than once.
-- =============================================================================

-- Our own writes; skip the column guards (see 005/007).
select set_config('app.system_write', 'on', false);

-- ── 1. total_sessions and avg_rating, recomputed from the requests table ─────
update public.mentor_profiles mp
set total_sessions = coalesce(stats.completed, 0),
    avg_rating     = coalesce(stats.avg_rating, 0)
from (
  select
    m.id as mentor_profile_id,
    count(*) filter (where sr.status = 'completed')                as completed,
    round(avg(sr.rating) filter (where sr.rating is not null), 2)  as avg_rating
  from public.mentor_profiles m
  left join public.service_requests sr on sr.mentor_id = m.id
  group by m.id
) stats
where mp.id = stats.mentor_profile_id;

-- ── 2. Points for completed sessions that never got theirs (+10 each) ────────
insert into public.mentor_points (mentor_id, points, reason, source_id, source_type)
select mp.user_id, 10, 'Completed a mentorship session', sr.id, 'session'
from public.service_requests sr
join public.mentor_profiles mp on mp.id = sr.mentor_id
where sr.status = 'completed'
  and not exists (
    select 1 from public.mentor_points pt
    where pt.source_id = sr.id and pt.source_type = 'session'
  );

-- ── 3. Points for ratings received (+1..+5, the stars given) ─────────────────
insert into public.mentor_points (mentor_id, points, reason, source_id, source_type)
select mp.user_id, sr.rating,
       'Received a ' || sr.rating || '-star rating', sr.id, 'rating'
from public.service_requests sr
join public.mentor_profiles mp on mp.id = sr.mentor_id
where sr.rating is not null
  and not exists (
    select 1 from public.mentor_points pt
    where pt.source_id = sr.id and pt.source_type = 'rating'
  );

-- ── 4. Mentee points for ratings they left (+5 each) ─────────────────────────
insert into public.mentee_points (mentee_id, points, reason, source_id, source_type)
select sr.mentee_id, 5, 'Rated a completed session', sr.id, 'rating'
from public.service_requests sr
where sr.rating is not null
  and not exists (
    select 1 from public.mentee_points pt
    where pt.source_id = sr.id and pt.source_type = 'rating'
  );

-- ── 5. Welcome bonus for mentors approved before that trigger existed ────────
insert into public.mentor_points (mentor_id, points, reason, source_type)
select mp.user_id, 5, 'Welcome aboard — approved as a mentor', 'bonus'
from public.mentor_profiles mp
where mp.status = 'approved'
  and not exists (
    select 1 from public.mentor_points pt
    where pt.mentor_id = mp.user_id and pt.source_type = 'bonus'
  );

select set_config('app.system_write', 'off', false);
