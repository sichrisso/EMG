-- =============================================================================
-- 007_admin_bootstrap.sql — RUN THIS BEFORE trying to make yourself an admin.
--
-- Why the "You cannot change role, admin status, or email" error happened:
-- the column guard from 002 asks is_admin(), which reads auth.uid(). In the
-- Supabase SQL editor there is no logged-in user, so auth.uid() is NULL,
-- is_admin() returns false, and the guard blocks even YOUR bootstrap update.
--
-- Fix: trusted server-side contexts (SQL editor, service_role key, and our own
-- SECURITY DEFINER triggers) have no auth.uid(). Those are already privileged —
-- the guard exists to stop *browser* clients, which always carry a uid. So the
-- guard now returns early when there is no authenticated user.
-- =============================================================================

create or replace function public.guard_profiles_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- No authenticated user => the write comes from the SQL editor, the
  -- service_role key, or a database trigger. All are trusted; browsers are not.
  if auth.uid() is null then
    return new;
  end if;
  -- Our own triggers mark their writes (see 005).
  if coalesce(current_setting('app.system_write', true), '') = 'on' then
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

-- The same reasoning applies to the mentor-profile and scholarship guards, so
-- admin tooling and SQL-editor fixes are never locked out of their own database.
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

-- =============================================================================
-- NOW make yourself an admin — replace the email with your own:
-- =============================================================================
-- update public.profiles set is_admin = true where email = 'you@example.com';
