-- =============================================================================
-- 016_public_impact_points.sql — run after 015 (or after 000_init.sql).
-- Mentees (and anyone signed in) can see a mentor's TOTAL impact points, but
-- not the individual ledger rows. The raw mentor_points table stays private;
-- this function exposes only the sum, so the chip renders for everyone.
-- =============================================================================

create or replace function public.get_mentor_impact(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(points), 0)::int
  from public.mentor_points
  where mentor_id = p_user_id;
$$;

grant execute on function public.get_mentor_impact(uuid) to authenticated;
grant execute on function public.get_mentor_impact(uuid) to anon;
