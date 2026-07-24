-- =============================================================================
-- 018_chapa_etb.sql — run after 017.
-- Chapa settles in birr and your customers pay from Ethiopian wallets and
-- cards, so the catalogue is priced in ETB directly rather than converted from
-- USD on the fly (a converted price changes every time the rate moves).
--
-- CHANGE THE NUMBERS BELOW to whatever you decide to charge. They are stored
-- in cents (santim), so 200000 = 2,000.00 ETB.
-- =============================================================================

alter table public.mock_interview_orders
  alter column currency set default 'ETB';

update public.mock_interview_orders
set currency = 'ETB'
where status = 'awaiting_payment';

-- Chapa's transaction reference, so a webhook can find the order again.
alter table public.mock_interview_orders
  add column if not exists tx_ref text unique;

create index if not exists idx_mio_tx_ref on public.mock_interview_orders (tx_ref);

-- Birr prices. Round numbers read better locally than converted ones.
update public.mock_interview_plans set amount_cents = 200000 where code = 'starter';    -- 2,000 ETB
update public.mock_interview_plans set amount_cents = 500000 where code = 'standard';   -- 5,000 ETB
update public.mock_interview_plans set amount_cents = 750000 where code = 'intensive';  -- 7,500 ETB

-- The order RPC now stamps the currency from a single place.
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
    (mentee_id, request_id, plan_code, minutes, amount_cents, currency)
  values
    (auth.uid(), p_request_id, v_plan.code, v_plan.minutes, v_plan.amount_cents, 'ETB')
  returning id into v_id;

  return v_id;
end; $$;

grant execute on function public.create_mock_interview_order(text, uuid) to authenticated;

-- Marks an order paid. Only the service role (the webhook) may call this, and
-- it is idempotent: replaying the same webhook changes nothing.
create or replace function public.mark_order_paid(
  p_tx_ref      text,
  p_provider_ref text,
  p_amount_cents int,
  p_currency     text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.mock_interview_orders%rowtype;
begin
  select * into v_order from public.mock_interview_orders where tx_ref = p_tx_ref;

  if v_order.id is null then
    raise exception 'No order for tx_ref %', p_tx_ref;
  end if;

  -- Already settled: acknowledge without doing the work twice.
  if v_order.status = 'paid' then
    return;
  end if;

  -- The amount must match what we asked for; a mismatch is never "paid".
  if v_order.amount_cents <> p_amount_cents or v_order.currency <> p_currency then
    update public.mock_interview_orders
      set status = 'failed', provider = 'chapa', provider_ref = p_provider_ref
      where id = v_order.id;
    raise exception 'Amount mismatch for %: expected % %, got % %',
      p_tx_ref, v_order.amount_cents, v_order.currency, p_amount_cents, p_currency;
  end if;

  update public.mock_interview_orders
    set status = 'paid', paid_at = now(),
        provider = 'chapa', provider_ref = p_provider_ref
    where id = v_order.id;
end; $$;

-- Deliberately NOT granted to authenticated: the webhook uses the service role.
revoke all on function public.mark_order_paid(text, text, int, text) from public;
revoke all on function public.mark_order_paid(text, text, int, text) from authenticated;
