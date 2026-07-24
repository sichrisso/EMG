-- =============================================================================
-- 011_profile_richness.sql — run after 010.
-- The redesigned profile page shows goals, help topics, and languages so a
-- mentor can meet a student already knowing what they need. Plain columns on
-- profiles; the owner edits them through the normal own-row update policy.
-- =============================================================================

alter table public.profiles
  add column if not exists goals        text,
  add column if not exists help_topics  text[] not null default '{}',
  add column if not exists languages    text[] not null default '{}';

-- Expose them on the public projection (still no email / phone).
drop view if exists public.public_profiles;
create view public.public_profiles
with (security_invoker = false) as
  select id, first_name, last_name, avatar_url, country, role,
         journey_stage, target_degree, target_countries, about,
         goals, help_topics, languages
  from public.profiles;
grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to anon;

-- The mentor-facing snapshot gains the same context.
drop function if exists public.get_student_snapshot(uuid);
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
