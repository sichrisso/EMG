-- =============================================================================
-- 006_sync_fixes.sql — run after 005.
-- 1) Checklists showing "0 of 0": older live databases miss the status/notes
--    columns and/or the default-materials trigger, so applications were born
--    with empty checklists. This aligns columns, reseeds defaults, recreates
--    the trigger, and BACKFILLS every existing application that has no items.
-- 2) Embassy progress becomes persistent (a column on profiles) so the visa
--    steps survive reloads and feed the home-page journey tracker.
-- 3) Scholarships vanished after 005 because existing rows were never marked
--    verified — trust the pre-review content once.
-- =============================================================================

-- ── 1a. Column alignment on application_materials ────────────────────────────
do $$ begin
  create type public.material_status as enum ('not_started','in_progress','done');
exception when duplicate_object then null; end $$;

alter table public.application_materials
  add column if not exists status    public.material_status not null default 'not_started',
  add column if not exists notes     text,
  add column if not exists is_custom boolean not null default false,
  add column if not exists description text not null default '',
  add column if not exists sort_order  int  not null default 0;

-- Migrate the legacy is_done flag into status, then retire it.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'application_materials'
               and column_name = 'is_done') then
    update public.application_materials set status = 'done' where is_done = true;
    alter table public.application_materials drop column is_done;
  end if;
end $$;

-- ── 1b. Defaults table + seed (insert-if-missing by name) ────────────────────
create table if not exists public.application_material_defaults (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text not null default '',
  degree_levels public.degree_level[] not null default '{bachelor,masters,phd,other}',
  sort_order    int not null default 0
);

-- Live databases created this table earlier with fewer columns; add whatever
-- is missing so the seed below always has somewhere to write.
alter table public.application_material_defaults
  add column if not exists description   text not null default '',
  add column if not exists degree_levels public.degree_level[] not null
      default '{bachelor,masters,phd,other}',
  add column if not exists sort_order    int not null default 0;

alter table public.application_material_defaults enable row level security;
drop policy if exists "amd_select" on public.application_material_defaults;
create policy "amd_select" on public.application_material_defaults
  for select to authenticated using (true);

insert into public.application_material_defaults (name, description, degree_levels, sort_order)
select v.name, v.description, v.degree_levels::public.degree_level[], v.sort_order
from (values
  ('Statement of Purpose',      'Your main essay: why this program, why you.',         '{bachelor,masters,phd,other}', 1),
  ('Academic transcripts',      'Official records from all institutions attended.',    '{bachelor,masters,phd,other}', 2),
  ('Letters of recommendation', 'Usually 2-3, from professors or supervisors.',        '{masters,phd}',                3),
  ('English test score',        'IELTS / TOEFL / Duolingo, per program requirements.', '{bachelor,masters,phd,other}', 4),
  ('CV / Resume',               'Academic CV highlighting research and experience.',   '{masters,phd,other}',          5),
  ('Passport copy',             'Valid for at least six months beyond intended stay.', '{bachelor,masters,phd,other}', 6),
  ('Financial documents',       'Bank statements or sponsor letters, per checklist.',  '{bachelor,masters,phd,other}', 7),
  ('Application fee',           'Paid or waiver confirmed.',                           '{bachelor,masters,phd,other}', 8),
  ('Research proposal',         'Required for most PhD and research-based programs.',  '{phd}',                        9),
  ('Writing sample',            'If the program requests one.',                        '{masters,phd}',               10)
) as v(name, description, degree_levels, sort_order)
where not exists (
  select 1 from public.application_material_defaults d where d.name = v.name
);

-- ── 1c. Trigger + backfill for empty checklists ──────────────────────────────
create or replace function public.populate_default_materials()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.application_materials (application_id, name, description, sort_order)
  select new.id, d.name, d.description, d.sort_order
  from public.application_material_defaults d
  where new.degree_level = any(d.degree_levels)
  order by d.sort_order;
  return new;
end; $$;

drop trigger if exists populate_default_materials on public.applications;
create trigger populate_default_materials after insert on public.applications
  for each row execute function public.populate_default_materials();

-- Every application that has zero items gets its checklist now.
insert into public.application_materials (application_id, name, description, sort_order)
select a.id, d.name, d.description, d.sort_order
from public.applications a
join public.application_material_defaults d on a.degree_level = any(d.degree_levels)
where not exists (
  select 1 from public.application_materials m where m.application_id = a.id
);

-- ── 2. Persistent embassy progress ───────────────────────────────────────────
-- Completed visa-step ids (1..7). Owned by the user; readable through the
-- normal profiles policies; feeds the journey tracker on the home page.
alter table public.profiles
  add column if not exists embassy_steps int[] not null default '{}';

-- ── 3. Trust pre-review scholarships once ────────────────────────────────────
update public.scholarships set is_verified = true
where is_active = true and is_verified = false;
