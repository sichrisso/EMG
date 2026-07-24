-- =============================================================================
-- 017_mock_interview_paid.sql — run after 016.
-- Mock visa interviews become an admin-run, PAID service.
--   1) Mentors no longer offer "Mock Interview" as an area.
--   2) Mock interview requests are invisible to mentors (admin only).
--   3) A paid order sits alongside each request.
-- =============================================================================

-- ── 1. Strip the retired area from every mentor profile ─────────────────────
update public.mentor_profiles
set areas = array_remove(areas, 'Mock Interview')
where 'Mock Interview' = any(areas);

-- ── 2. Mock interviews are admin-only ───────────────────────────────────────
-- The old policy let any approved mentor see unassigned requests. Mock
-- interviews are excluded so only the mentee and admins can see them.
drop policy if exists "sr_select" on public.service_requests;
create policy "sr_select" on public.service_requests for select to authenticated
  using (
    mentee_id = auth.uid()
    or public.is_admin()
    or (
      service_type <> 'mock_interview'
      and exists (
        select 1 from public.mentor_profiles mp
        where mp.user_id = auth.uid() and mp.status = 'approved'
          and (mp.id = mentor_id or mentor_id is null)
      )
    )
  );

-- Belt and braces: a trigger refuses to attach a mentor to a mock interview.
create or replace function public.guard_mock_interview_admin_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.service_type = 'mock_interview'
     and new.mentor_id is not null
     and not public.is_admin() then
    raise exception 'Mock interviews are run by the EMG team, not individual mentors.';
  end if;
  return new;
end; $$;

drop trigger if exists guard_mock_interview_admin_only on public.service_requests;
create trigger guard_mock_interview_admin_only
  before insert or update on public.service_requests
  for each row execute function public.guard_mock_interview_admin_only();

-- ── 3. Paid orders ──────────────────────────────────────────────────────────
do $$ begin
  create type public.order_status as enum
    ('awaiting_payment','paid','failed','refunded','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.mock_interview_orders (
  id             uuid primary key default gen_random_uuid(),
  mentee_id      uuid not null references public.profiles(id) on delete cascade,
  request_id     uuid references public.service_requests(id) on delete set null,
  plan_code      text not null,                 -- 'starter' | 'standard' | 'intensive'
  minutes        int  not null,
  amount_cents   int  not null check (amount_cents > 0),
  currency       text not null default 'USD',
  status         public.order_status not null default 'awaiting_payment',
  -- Set by the payment webhook, never by the browser.
  provider       text,                          -- 'chapa' | 'stripe' | ...
  provider_ref   text,                          -- checkout/session id
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.mock_interview_orders enable row level security;

create index if not exists idx_mio_mentee on public.mock_interview_orders (mentee_id);
create index if not exists idx_mio_status on public.mock_interview_orders (status);

create policy "mio_select" on public.mock_interview_orders for select to authenticated
  using (mentee_id = auth.uid() or public.is_admin());
create policy "mio_insert" on public.mock_interview_orders for insert to authenticated
  with check (mentee_id = auth.uid());
create policy "mio_update_admin" on public.mock_interview_orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists touch_mock_interview_orders on public.mock_interview_orders;
create trigger touch_mock_interview_orders before update on public.mock_interview_orders
  for each row execute function public.touch_updated_at();

-- The browser must never be able to mark its own order paid: prices come from
-- the server-side catalogue and payment state comes from the webhook.
create table if not exists public.mock_interview_plans (
  code         text primary key,
  title        text not null,
  minutes      int  not null,
  amount_cents int  not null,
  blurb        text not null default '',
  perks        text[] not null default '{}',
  sort_order   int not null default 0,
  is_active    boolean not null default true
);
alter table public.mock_interview_plans enable row level security;
create policy "mip_select" on public.mock_interview_plans for select to authenticated using (is_active);
create policy "mip_select_anon" on public.mock_interview_plans for select to anon using (is_active);

insert into public.mock_interview_plans (code, title, minutes, amount_cents, blurb, perks, sort_order) values
  ('starter', 'Starter', 10, 2000,
   'A focused 10 minute run-through of the questions that matter most.',
   array['10 minute mock interview','Instant verbal feedback','Top 5 question drill'], 1),
  ('standard', 'Standard', 30, 5000,
   'A full 30 minute interview plus a written report on what to fix.',
   array['30 minute mock interview','DS-160 consistency check','Written feedback report','One follow-up question round'], 2),
  ('intensive', 'Intensive', 60, 7500,
   'An hour of practice, document review, and story building.',
   array['60 minute mock interview','Full document review','Interview strategy and story building','Two follow-up sessions'], 3)
on conflict (code) do update
  set title = excluded.title, minutes = excluded.minutes,
      amount_cents = excluded.amount_cents, blurb = excluded.blurb,
      perks = excluded.perks, sort_order = excluded.sort_order;

-- Creates an order with the price read from the catalogue, so a tampered
-- client cannot invent its own amount.
create or replace function public.create_mock_interview_order(
  p_plan_code text,
  p_request_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_plan public.mock_interview_plans%rowtype;
  v_id   uuid;
begin
  select * into v_plan from public.mock_interview_plans
  where code = p_plan_code and is_active;

  if v_plan.code is null then
    raise exception 'Unknown or inactive plan.';
  end if;

  insert into public.mock_interview_orders
    (mentee_id, request_id, plan_code, minutes, amount_cents)
  values
    (auth.uid(), p_request_id, v_plan.code, v_plan.minutes, v_plan.amount_cents)
  returning id into v_id;

  return v_id;
end; $$;

grant execute on function public.create_mock_interview_order(text, uuid) to authenticated;
