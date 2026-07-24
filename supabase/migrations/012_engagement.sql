-- =============================================================================
-- 012_engagement.sql — run after 011.
-- 1) Scholarship interaction counts: every "Apply / Learn more" click is
--    tallied so students (and admins) can see what's drawing attention.
-- 2) Public mentor reviews: written feedback is visible on mentor profiles
--    through a narrow RPC (no request contents leak, just rating + words).
-- 3) Mentor applications: optional resume/extra document, and applicants can
--    withdraw a still-pending application.
-- =============================================================================

-- ── 1. Scholarship clicks ────────────────────────────────────────────────────
alter table public.scholarships
  add column if not exists click_count int not null default 0;

create or replace function public.increment_scholarship_click(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.scholarships set click_count = click_count + 1 where id = p_id;
$$;
grant execute on function public.increment_scholarship_click(uuid) to authenticated;
grant execute on function public.increment_scholarship_click(uuid) to anon;

-- ── 2. Mentor reviews, readable on the profile ───────────────────────────────
-- Returns only rating, feedback, date, and the reviewer's first name.
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

-- ── 3. Mentor application extras ─────────────────────────────────────────────
alter table public.mentor_profiles
  add column if not exists resume_url    text,
  add column if not exists extra_doc_url text;

-- Applicants may withdraw while still pending; decided applications stay.
drop policy if exists "mp_delete_own_pending" on public.mentor_profiles;
create policy "mp_delete_own_pending" on public.mentor_profiles
  for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');
