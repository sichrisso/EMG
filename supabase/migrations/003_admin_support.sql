-- =============================================================================
-- 003_admin_support.sql — policies the in-app /admin panel and entry page need
-- Run after 002_fixes.sql.
-- =============================================================================

-- ── Points ledgers: readable by their owner and admins; clients never write ──
-- (Triggers write them; SECURITY DEFINER functions bypass RLS.)
drop policy if exists "points_select"        on public.mentor_points;
drop policy if exists "points_insert"        on public.mentor_points;
drop policy if exists "mentee_points_select" on public.mentee_points;
drop policy if exists "mentee_points_insert" on public.mentee_points;

create policy "mentor_points_select" on public.mentor_points for select to authenticated
  using (mentor_id = auth.uid() or public.is_admin());
create policy "mentee_points_select" on public.mentee_points for select to authenticated
  using (mentee_id = auth.uid() or public.is_admin());

-- ── Admin moderation: scholarships ───────────────────────────────────────────
drop policy if exists "schol_update" on public.scholarships;
drop policy if exists "schol_delete" on public.scholarships;
create policy "schol_update" on public.scholarships for update to authenticated
  using (posted_by = auth.uid() or public.is_admin())
  with check (posted_by = auth.uid() or public.is_admin());
create policy "schol_delete" on public.scholarships for delete to authenticated
  using (posted_by = auth.uid() or public.is_admin());

-- ── Admin moderation: events (approve / reject with note) ────────────────────
drop policy if exists "ev_select" on public.events;
drop policy if exists "ev_update" on public.events;
create policy "ev_select" on public.events for select to authenticated
  using (status = 'approved' or host_id = auth.uid() or public.is_admin());
create policy "ev_update" on public.events for update to authenticated
  using (host_id = auth.uid() or public.is_admin())
  with check (host_id = auth.uid() or public.is_admin());

-- Hosts may not self-approve: status/admin_note are admin-only columns.
create or replace function public.guard_event_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if (new.status is distinct from old.status and new.status <> 'cancelled')
       or new.admin_note is distinct from old.admin_note then
      raise exception 'Event approval is handled by an admin.';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists guard_event_columns on public.events;
create trigger guard_event_columns before update on public.events
  for each row execute function public.guard_event_columns();

-- ── Entry page: anonymous visitors may see the live scholarship strip ────────
create policy "schol_select_anon" on public.scholarships for select to anon
  using (is_active = true);
