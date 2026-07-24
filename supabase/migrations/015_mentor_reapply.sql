-- =============================================================================
-- 015_mentor_reapply.sql — run after 014 (or after 000_init.sql).
-- Lets a rejected applicant apply again after a short cooling-off period.
-- The rule lives in the database, not the button, so it holds no matter what
-- the client sends.
-- =============================================================================

create or replace function public.reapply_as_mentor()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   public.mentor_status;
  v_reviewed timestamptz;
  v_cooldown interval := interval '7 days';
begin
  select status, reviewed_at into v_status, v_reviewed
  from public.mentor_profiles where user_id = auth.uid();

  if v_status is null then
    raise exception 'You do not have an application to replace.';
  end if;
  if v_status <> 'rejected' then
    raise exception 'Only a declined application can be replaced.';
  end if;
  if v_reviewed is not null and now() < v_reviewed + v_cooldown then
    raise exception 'You can reapply on %, take the time to strengthen your application first.',
      to_char((v_reviewed + v_cooldown) at time zone 'Africa/Addis_Ababa', 'Mon FMDD, YYYY');
  end if;

  delete from public.mentor_profiles where user_id = auth.uid();
end;
$$;

grant execute on function public.reapply_as_mentor() to authenticated;
