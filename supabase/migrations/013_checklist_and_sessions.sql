-- =============================================================================
-- 013_checklist_and_sessions.sql — run after 012.
-- 1) Leaner default checklist: remove the duplicated / rarely-needed items.
--    Existing untouched copies of those items are cleared too (anything a
--    student already started or uploaded to is kept).
-- 2) Sessions: a concrete timestamp per approved session so meeting links can
--    expire once the time passes, and reschedules have an anchor.
-- =============================================================================

-- ── 1. Trim the checklist template ───────────────────────────────────────────
delete from public.application_material_defaults
where name in (
  'Writing sample',
  'Academic transcripts',
  'Letters of recommendation',
  'English test score',
  'Research proposal',
  'Application fee'
);

-- Remove the same items from existing checklists, but only where the student
-- never touched them (not started, nothing uploaded).
delete from public.application_materials
where name in (
  'Writing sample',
  'Academic transcripts',
  'Letters of recommendation',
  'English test score',
  'Research proposal',
  'Application fee'
)
and status = 'not_started'
and file_url is null;

-- ── 2. Session timestamp ─────────────────────────────────────────────────────
alter table public.service_requests
  add column if not exists scheduled_for timestamptz;

-- ── 3. Merge IELTS/TOEFL mentor areas into English Test Prep ─────────────────
update public.mentor_profiles
set areas = (
  select array_agg(distinct case
    when a in ('IELTS Prep', 'TOEFL Prep') then 'English Test Prep'
    else a end)
  from unnest(areas) as a
)
where areas && array['IELTS Prep', 'TOEFL Prep'];
