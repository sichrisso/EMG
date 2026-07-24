-- =============================================================================
-- 004_meetings_and_notifications.sql
-- 1) On approval: compute the real session time from the booked slot and
--    auto-generate a shared video link when none was provided.
-- 2) Email the mentee AND mentor on approval, and again ~30 minutes before
--    the session — sent from inside Postgres via pg_net + Resend, scheduled
--    by pg_cron. No app server required.
--
-- ONE-TIME SETUP (Supabase dashboard, after running this file):
--   a) Database -> Extensions: enable  pg_net  and  pg_cron  (both built in).
--   b) Create a free Resend account (resend.com), verify your sending domain,
--      create an API key, then store it in Vault (SQL editor):
--        select vault.create_secret('re_YOUR_KEY_HERE', 'resend_api_key');
--      And set your from-address:
--        insert into public.app_settings (key, value)
--        values ('email_from', 'Ethio Mentor Group <notify@yourdomain.com>')
--        on conflict (key) do update set value = excluded.value;
--   If the key or from-address is missing, everything else still works —
--   emails are simply skipped (never blocking an approval).
-- =============================================================================

create extension if not exists pg_net  with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ── Settings (non-secret config; secrets live in Vault) ─────────────────────
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
-- No policies: clients can never read or write settings; SECURITY DEFINER
-- functions below access them directly.

-- Track reminder delivery so each session is reminded exactly once.
alter table public.service_requests
  add column if not exists reminder_sent_at timestamptz;

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Read the Resend key from Vault; null when not configured.
create or replace function public.get_resend_key()
returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'resend_api_key' limit 1;
$$;

/**
 * Fire-and-forget email via Resend's HTTP API using pg_net.
 * Never raises: notification failures must not roll back the business write
 * (an approval is more important than its email).
 */
create or replace function public.send_email(p_to text, p_subject text, p_html text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_key  text := public.get_resend_key();
  v_from text := (select value from public.app_settings where key = 'email_from');
begin
  if v_key is null or v_from is null or p_to is null then
    raise notice 'send_email skipped (missing key/from/recipient)';
    return;
  end if;
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'from', v_from, 'to', p_to, 'subject', p_subject, 'html', p_html
    )
  );
exception when others then
  raise notice 'send_email failed: %', sqlerrm;
end; $$;

/**
 * Next occurrence of a weekly slot (0=Sunday..6=Saturday, HH:MM) in the
 * platform's home timezone. If today's slot time already passed, next week.
 * Limitation: requests store the slot's day/time but not its timezone;
 * Africa/Addis_Ababa is assumed (the default for availability slots).
 */
create or replace function public.next_slot_occurrence(p_day int, p_time text)
returns timestamptz language plpgsql stable as $$
declare
  v_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
  v_date  date := v_today + ((p_day - extract(dow from v_today)::int + 7) % 7);
  v_ts    timestamptz;
begin
  v_ts := (v_date::text || ' ' || p_time)::timestamp at time zone 'Africa/Addis_Ababa';
  if v_ts <= now() then
    v_ts := v_ts + interval '7 days';
  end if;
  return v_ts;
end; $$;

-- ── Approval: schedule the session and guarantee a shared video link ─────────
create or replace function public.on_request_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    -- Real session time from the booked slot (falls back to whatever was set).
    if new.booked_day is not null and new.booked_time is not null then
      new.scheduled_at := public.next_slot_occurrence(new.booked_day, new.booked_time);
    end if;
    -- One shared link for both sides. Jitsi rooms work instantly with no
    -- account; a manually pasted Google Meet link is kept when provided.
    if new.meet_link is null or new.meet_link = '' then
      new.meet_link := 'https://meet.jit.si/EMG-' || substr(md5(new.id::text || now()::text), 1, 12);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists on_request_approval on public.service_requests;
create trigger on_request_approval before update on public.service_requests
  for each row execute function public.on_request_approval();

-- ── Approval emails to both parties ──────────────────────────────────────────
create or replace function public.on_request_approval_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mentee record;
  v_mentor record;
  v_when   text;
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    select email, first_name into v_mentee from public.profiles where id = new.mentee_id;
    select p.email, p.first_name into v_mentor
      from public.mentor_profiles mp join public.profiles p on p.id = mp.user_id
      where mp.id = new.mentor_id;

    v_when := coalesce(
      to_char(new.scheduled_at at time zone 'Africa/Addis_Ababa',
              'Dy, Mon FMDD "at" HH24:MI') || ' (Addis Ababa time)',
      'the scheduled time');

    perform public.send_email(
      v_mentee.email,
      'Your mentorship session is confirmed',
      '<p>Hi ' || coalesce(v_mentee.first_name, 'there') || ',</p>'
      || '<p>Your session <strong>' || new.title || '</strong> is confirmed for <strong>'
      || v_when || '</strong>.</p>'
      || '<p><a href="' || new.meet_link || '">Join the video call</a> — the same link works for both of you.</p>'
      || '<p>— Ethio Mentor Group</p>');

    if v_mentor.email is not null then
      perform public.send_email(
        v_mentor.email,
        'Session confirmed with your mentee',
        '<p>Hi ' || coalesce(v_mentor.first_name, 'there') || ',</p>'
        || '<p>You confirmed <strong>' || new.title || '</strong> for <strong>' || v_when || '</strong>.</p>'
        || '<p><a href="' || new.meet_link || '">Join the video call</a></p>'
        || '<p>— Ethio Mentor Group</p>');
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists on_request_approval_notify on public.service_requests;
create trigger on_request_approval_notify after update on public.service_requests
  for each row execute function public.on_request_approval_notify();

-- ── Reminders ~30 minutes before the session ─────────────────────────────────
create or replace function public.send_session_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select sr.id, sr.title, sr.meet_link, sr.scheduled_at,
           me.email as mentee_email, me.first_name as mentee_name,
           mp_p.email as mentor_email, mp_p.first_name as mentor_name
    from public.service_requests sr
    join public.profiles me on me.id = sr.mentee_id
    left join public.mentor_profiles mp on mp.id = sr.mentor_id
    left join public.profiles mp_p on mp_p.id = mp.user_id
    where sr.status = 'approved'
      and sr.reminder_sent_at is null
      and sr.scheduled_at between now() and now() + interval '35 minutes'
  loop
    perform public.send_email(
      r.mentee_email,
      'Starting soon: ' || r.title,
      '<p>Hi ' || coalesce(r.mentee_name, 'there') || ', your session starts at <strong>'
      || to_char(r.scheduled_at at time zone 'Africa/Addis_Ababa', 'HH24:MI')
      || '</strong> (Addis Ababa time).</p><p><a href="' || r.meet_link || '">Join now</a></p>');
    if r.mentor_email is not null then
      perform public.send_email(
        r.mentor_email,
        'Starting soon: ' || r.title,
        '<p>Hi ' || coalesce(r.mentor_name, 'there') || ', your session starts at <strong>'
        || to_char(r.scheduled_at at time zone 'Africa/Addis_Ababa', 'HH24:MI')
        || '</strong> (Addis Ababa time).</p><p><a href="' || r.meet_link || '">Join now</a></p>');
    end if;
    update public.service_requests set reminder_sent_at = now() where id = r.id;
  end loop;
end; $$;

-- Every 10 minutes; each session is reminded once thanks to reminder_sent_at.
select cron.schedule(
  'emg-session-reminders',
  '*/10 * * * *',
  $$select public.send_session_reminders()$$
) where not exists (select 1 from cron.job where jobname = 'emg-session-reminders');
