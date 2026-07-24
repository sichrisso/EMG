-- =============================================================================
-- 010_names_and_attachments.sql — run after 009.
-- 1) Google sign-ins arrived with blank names: Google returns `name` /
--    `full_name` / `given_name`, but handle_new_user only looked for
--    `first_name`. Fixed going forward, and backfilled for existing accounts.
-- 2) Requests can carry an attachment (the essay you want reviewed) so the
--    mentor can read it before the session.
-- =============================================================================

-- ── 1. Signup: understand every provider's metadata shape ────────────────────
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

-- Backfill accounts that already came through blank.
update public.profiles p
set first_name = coalesce(
      nullif(p.first_name, ''),
      nullif(u.raw_user_meta_data->>'given_name', ''),
      nullif(split_part(coalesce(u.raw_user_meta_data->>'full_name',
                                 u.raw_user_meta_data->>'name', ''), ' ', 1), ''),
      split_part(u.email, '@', 1)          -- last resort: something to greet them by
    ),
    last_name = coalesce(
      nullif(p.last_name, ''),
      nullif(u.raw_user_meta_data->>'family_name', ''),
      nullif(trim(substring(coalesce(u.raw_user_meta_data->>'full_name',
                                     u.raw_user_meta_data->>'name', '')
             from position(' ' in coalesce(u.raw_user_meta_data->>'full_name',
                                           u.raw_user_meta_data->>'name', ' ')) + 1)), ''),
      ''
    ),
    avatar_url = coalesce(
      p.avatar_url,
      nullif(u.raw_user_meta_data->>'avatar_url', ''),
      nullif(u.raw_user_meta_data->>'picture', '')
    )
from auth.users u
where u.id = p.id
  and (p.first_name = '' or p.first_name is null);

-- ── 2. Request attachments ───────────────────────────────────────────────────
-- "Please review my SOP" is useless without the SOP. The file lives in the
-- private `documents` bucket under the student's folder, which a mentor with a
-- live request can already read (see 008). No policy change needed: the column
-- guard in 002 only polices status/scheduling/rating.
alter table public.service_requests
  add column if not exists attachment_url  text,
  add column if not exists attachment_name text;
