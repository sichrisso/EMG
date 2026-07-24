-- =============================================================================
-- 008_documents_and_admin.sql — run after 007.
-- 1) Document uploads: a private `documents` bucket + file columns on the
--    checklist, so students attach their SOP/CV/transcripts to each item.
-- 2) Customisable checklists: students add or remove items per application.
-- 3) "Where I am": profile fields students set so mentors arrive informed.
-- 4) Mentors can read a snapshot of a student they actually work with.
-- 5) Admins can delete accounts (auth.users is off-limits to the anon key,
--    so this is a SECURITY DEFINER function gated on is_admin()).
-- =============================================================================

-- ── 1. Checklist file attachments ────────────────────────────────────────────
alter table public.application_materials
  add column if not exists file_url    text,
  add column if not exists file_name   text,
  add column if not exists uploaded_at timestamptz;

-- Private bucket: nothing here is world-readable.
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

-- Path convention: {user_id}/{application_id}/{filename}
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

-- Readable by: the owner, any admin, and a mentor who has a live request with
-- that student (so they can actually review the essay they're helping with).
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

-- ── 2. "Where I am": profile fields mentors can see ──────────────────────────
alter table public.profiles
  add column if not exists journey_stage    text,
  add column if not exists target_degree    text,
  add column if not exists target_countries text[] not null default '{}',
  add column if not exists about            text;

-- The public projection gains the non-sensitive progress fields (still no
-- email, no phone). Mentor cards and student snapshots read from here.
drop view if exists public.public_profiles;
create view public.public_profiles
with (security_invoker = false) as
  select id, first_name, last_name, avatar_url, country, role,
         journey_stage, target_degree, target_countries, about
  from public.profiles;
grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to anon;

-- ── 3. Student snapshot for mentors ──────────────────────────────────────────
-- Returns progress for one student, but only to an admin or a mentor who has
-- an actual request from them. Keeps the raw tables locked down.
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

-- ── 4. Admin: delete an account ──────────────────────────────────────────────
-- Removing the auth.users row cascades to profiles and everything below it.
-- The anon key cannot touch auth schema, hence SECURITY DEFINER + admin gate.
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

-- ── 5. Admin-authored content is published immediately ───────────────────────
-- A scholarship an admin posts needs no second review.
create or replace function public.autoverify_admin_scholarship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    new.is_verified := true;
  end if;
  return new;
end; $$;

drop trigger if exists autoverify_admin_scholarship on public.scholarships;
create trigger autoverify_admin_scholarship before insert on public.scholarships
  for each row execute function public.autoverify_admin_scholarship();

-- Same for events: an admin's own event is born approved (the guard in 003
-- already lets admins set status, this just saves them a click).
create or replace function public.autoapprove_admin_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    new.status := 'approved';
  end if;
  return new;
end; $$;

drop trigger if exists autoapprove_admin_event on public.events;
create trigger autoapprove_admin_event before insert on public.events
  for each row execute function public.autoapprove_admin_event();
