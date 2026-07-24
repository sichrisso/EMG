/*
 * Admin queues, the moderation workloads, one exported component per queue.
 * Mounted as routes by AdminLayout; every mutation writes through the same
 * RLS-guarded API as the rest of the app.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { assertUpdated } from '@/lib/safeUpdate';
import { EventForm, ScholarshipForm,
         type EditableEvent, type EditableScholarship } from './ContentForms';

/*
 * /admin, moderation panel, gated on profiles.is_admin. Replaces editing
 * rows in the Supabase table editor (error-prone, no confirmation) with
 * plain lists and explicit actions. Four queues:
 *   Mentors     , approve or reject applications (approval promotes role)
 *   Events      , approve or reject submitted events
 *   Fees        , quote requests in birr, mark them paid
 *   Scholarships, deactivate or delete listings
 */


// ── Row types (admin sees full rows; RLS allows it via is_admin()) ───────────
interface TeamRequest {
  id: string; title: string; description: string; service_type: string;
  status: string; mentor_id: string | null; meet_link: string | null;
  scheduled_at: string | null; admin_note: string | null; created_at: string;
  mentee: { first_name: string; last_name: string } | null;
}
interface MentorOption {
  id: string;
  profile: { first_name: string; last_name: string } | null;
  current_job: string;
}

interface PendingMentor {
  id: string; user_id: string; current_job: string; current_location: string;
  university: string; graduation_year: number | null; linkedin_url: string | null;
  bio: string; areas: string[]; status: string; created_at: string;
  profile: { first_name: string; last_name: string } | null;
}
interface PendingEvent {
  id: string; title: string; description: string; type: string; status: string;
  scheduled_at: string | null; duration_min: number; meet_link: string | null;
  max_attendees: number | null; created_at: string;
  host: { first_name: string; last_name: string } | null;
}
interface AdminFeeRequest {
  id: string; fee_type: string; amount_usd: number; amount_birr: number | null;
  quoted_rate: number | null; status: string; recipient_name: string | null;
  notes: string | null; created_at: string;
  mentee: { first_name: string; last_name: string } | null;
}
interface AdminScholarship {
  id: string; title: string; provider: string; type: string;
  amount: string | null; deadline: string | null;
  link: string | null; is_active: boolean; is_verified: boolean;
  description: string; eligible_levels: string[]; created_at: string;
}

// ── Small shared bits ─────────────────────────────────────────────────────────
function SectionEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-surface-border bg-white p-10 text-center text-sm text-ink-muted">
      {text}
    </div>
  );
}

function NoteInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="!py-2 !text-xs"
    />
  );
}

// ── Requests queue ────────────────────────────────────────────────────────────
// General inquiries (no mentor chosen) land here as the team inbox. Admins can
// answer directly, approval auto-generates the shared video link, computes
// the session time, and emails both parties (all database-side), or hand the
// request to a specific mentor. Assigned pending requests are monitored below.
export function RequestsQueue() {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [assignee, setAssignee] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.admin('requests'),
    queryFn: async (): Promise<TeamRequest[]> => {
      const { data, error } = await supabase
        .from('service_requests')
        .select('*, mentee:public_profiles!service_requests_mentee_id_fkey(first_name, last_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TeamRequest[];
    },
  });

  const { data: mentorOptions = [] } = useQuery({
    queryKey: qk.admin('mentor-options'),
    queryFn: async (): Promise<MentorOption[]> => {
      const { data, error } = await supabase
        .from('mentor_profiles')
        .select('id, current_job, profile:public_profiles!mentor_profiles_user_id_fkey(first_name, last_name)')
        .eq('status', 'approved')
        .eq('is_available', true)
        .order('created_at');
      if (error) throw error;
      // PostgREST can't infer one-to-one cardinality through the view join,
      // so the generated type wraps profile in an array; the runtime shape
      // is a single object.
      return (data ?? []) as unknown as MentorOption[];
    },
  });

  // Approve as the team: the database trigger fills meet_link/scheduled_at
  // and sends the confirmation emails.
  const approve = useMutation({
    mutationFn: async (id: string) => {
      await assertUpdated(
        supabase
          .from('service_requests')
          .update({ status: 'approved', responded_at: new Date().toISOString() })
          .eq('id', id)
          .select('id'),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('requests') }),
  });

  const decline = useMutation({
    mutationFn: async (id: string) => {
      await assertUpdated(
        supabase
          .from('service_requests')
          .update({
            status: 'declined',
            admin_note: notes[id]?.trim() || null,
            responded_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select('id'),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('requests') }),
  });

  const assign = useMutation({
    mutationFn: async (id: string) => {
      const mentorId = assignee[id];
      if (!mentorId) throw new Error('Pick a mentor first.');
      await assertUpdated(
        supabase
          .from('service_requests')
          .update({ mentor_id: mentorId })
          .eq('id', id)
          .select('id'),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('requests') }),
  });

  if (isLoading) return <PageSpinner />;

  const inbox = rows.filter(r => !r.mentor_id);
  const withMentor = rows.filter(r => !!r.mentor_id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 font-black text-ink">
          Team inbox
          <span className="ml-2 text-xs font-semibold text-ink-muted">
            general inquiries with no mentor chosen
          </span>
        </h2>
        {inbox.length === 0 ? (
          <SectionEmpty text="No open inquiries, inbox zero." />
        ) : (
          <div className="space-y-3">
            {inbox.map(r => (
              <article key={r.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-ink">{r.title}</h3>
                    <p className="text-xs text-ink-muted">
                      {r.service_type} · {r.mentee?.first_name} {r.mentee?.last_name}
                      {' · '}{new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-sm text-ink-muted">{r.description}</p>

                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" disabled={approve.isPending}
                      onClick={() => approve.mutate(r.id)}>
                      Approve, auto-schedule & send link
                    </Button>
                    <select
                      value={assignee[r.id] ?? ''}
                      onChange={e => setAssignee(a => ({ ...a, [r.id]: e.target.value }))}
                      className="!w-auto !py-2 !text-xs"
                    >
                      <option value="">Assign to a mentor…</option>
                      {mentorOptions.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.profile?.first_name} {m.profile?.last_name}, {m.current_job}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="secondary"
                      disabled={assign.isPending || !assignee[r.id]}
                      onClick={() => assign.mutate(r.id)}>
                      Assign
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-[220px] flex-1">
                      <NoteInput
                        value={notes[r.id] ?? ''}
                        onChange={v => setNotes(n => ({ ...n, [r.id]: v }))}
                        placeholder="Note to the student (required if declining)"
                      />
                    </div>
                    <Button size="sm" variant="secondary" disabled={decline.isPending}
                      onClick={() => {
                        if (!notes[r.id]?.trim()) { alert('Add a short note explaining the decline.'); return; }
                        decline.mutate(r.id);
                      }}>
                      Decline
                    </Button>
                  </div>
                </div>
                {(approve.isError || decline.isError || assign.isError) && (
                  <p className="mt-2 text-xs text-red-600">
                    {((approve.error ?? decline.error ?? assign.error) as Error).message}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {withMentor.length > 0 && (
        <div>
          <h2 className="mb-3 font-black text-ink">
            Waiting on mentors
            <span className="ml-2 text-xs font-semibold text-ink-muted">
              pending requests already assigned
            </span>
          </h2>
          <div className="space-y-2">
            {withMentor.map(r => (
              <article key={r.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{r.title}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {r.mentee?.first_name} {r.mentee?.last_name}
                    {' · sent '}{new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                  Awaiting mentor
                </span>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mentors queue ─────────────────────────────────────────────────────────────
export function MentorsQueue() {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.admin('mentors'),
    queryFn: async (): Promise<PendingMentor[]> => {
      const { data, error } = await supabase
        .from('mentor_profiles')
        .select('*, profile:public_profiles!mentor_profiles_user_id_fkey(first_name, last_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PendingMentor[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ row, approve }: { row: PendingMentor; approve: boolean }) => {
      await assertUpdated(
        supabase
          .from('mentor_profiles')
          .update({
            status: approve ? 'approved' : 'rejected',
            status_note: notes[row.id]?.trim() || null,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .select('id'),
      );
      // Approval promotes the account: role changes are admin-only, so this
      // is the one place in the app where profiles.role is written.
      if (approve) {
        await assertUpdated(
          supabase.from('profiles').update({ role: 'mentor' }).eq('id', row.user_id).select('id'),
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('mentors') }),
  });

  if (isLoading) return <PageSpinner />;
  if (rows.length === 0) return <SectionEmpty text="No mentor applications waiting." />;

  return (
    <div className="space-y-3">
      {rows.map(row => (
        <article key={row.id} className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-ink">
                {row.profile?.first_name} {row.profile?.last_name}
              </h3>
              <p className="text-xs text-ink-muted">
                {row.current_job} · {row.current_location} · {row.university}
                {row.graduation_year ? ` (${row.graduation_year})` : ''}
              </p>
              {row.linkedin_url && (
                <a href={row.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-bold text-navy hover:underline">
                  LinkedIn profile
                </a>
              )}
            </div>
            <span className="text-xs text-ink-subtle">
              applied {new Date(row.created_at).toLocaleDateString()}
            </span>
          </div>

          <p className="mt-2 text-sm text-ink-muted">{row.bio}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.areas.map(a => (
              <span key={a} className="rounded-full bg-navy-light px-2.5 py-0.5 text-xs font-semibold text-navy">
                {a}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="min-w-[220px] flex-1">
              <NoteInput
                value={notes[row.id] ?? ''}
                onChange={v => setNotes(n => ({ ...n, [row.id]: v }))}
                placeholder="Optional note to the applicant (required if rejecting)"
              />
            </div>
            <Button size="sm" disabled={decide.isPending}
              onClick={() => decide.mutate({ row, approve: true })}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" disabled={decide.isPending}
              onClick={() => {
                if (!notes[row.id]?.trim()) { alert('Add a short note explaining the rejection.'); return; }
                decide.mutate({ row, approve: false });
              }}>
              Reject
            </Button>
          </div>
          {decide.isError && (
            <p className="mt-2 text-xs text-red-600">{(decide.error as Error).message}</p>
          )}
        </article>
      ))}
    </div>
  );
}

// ── Events queue ──────────────────────────────────────────────────────────────
export function EventsQueue() {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableEvent | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.admin('events'),
    queryFn: async (): Promise<PendingEvent[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('*, host:public_profiles!events_host_id_fkey(first_name, last_name)')
        .in('status', ['pending', 'approved'])
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PendingEvent[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      await assertUpdated(
        supabase
          .from('events')
          .update({
            status: approve ? 'approved' : 'rejected',
            admin_note: notes[id]?.trim() || null,
          })
          .eq('id', id)
          .select('id'),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('events') }),
  });

  if (isLoading) return <PageSpinner />;

  const waiting = rows.filter(e => e.status === 'pending');
  const live    = rows.filter(e => e.status === 'approved');

  // Admins can author events directly; a trigger approves theirs on insert.
  if (creating || editing) {
    return (
      <div className="card p-5">
        <h2 className="mb-4 font-black text-ink">
          {editing ? 'Edit event' : 'New event'}
        </h2>
        <EventForm
          initial={editing ?? undefined}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>+ New event</Button>
      </div>

      {rows.length === 0 && <SectionEmpty text="No events yet, host the first one." />}

      {waiting.length > 0 && (
        <div>
          <h2 className="mb-3 font-black text-ink">
            Waiting for review
            <span className="ml-2 text-xs font-semibold text-ink-muted">
              not visible to students until approved
            </span>
          </h2>
          <div className="space-y-3">
      {waiting.map(ev => (
        <article key={ev.id} className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-ink">{ev.title}</h3>
              <p className="text-xs text-ink-muted">
                {ev.host?.first_name} {ev.host?.last_name} · {ev.type} · {ev.duration_min} min
                {ev.scheduled_at &&
                  ` · ${new Date(ev.scheduled_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}`}
              </p>
            </div>
            {ev.meet_link && (
              <a href={ev.meet_link} target="_blank" rel="noopener noreferrer"
                className="text-xs font-bold text-navy hover:underline">
                Meeting link
              </a>
            )}
          </div>
          <p className="mt-2 text-sm text-ink-muted">{ev.description}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="min-w-[220px] flex-1">
              <NoteInput
                value={notes[ev.id] ?? ''}
                onChange={v => setNotes(n => ({ ...n, [ev.id]: v }))}
                placeholder="Optional note to the host (required if rejecting)"
              />
            </div>
            <Button size="sm" disabled={decide.isPending}
              onClick={() => decide.mutate({ id: ev.id, approve: true })}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(ev)}>
              Edit
            </Button>
            <Button size="sm" variant="secondary" disabled={decide.isPending}
              onClick={() => {
                if (!notes[ev.id]?.trim()) { alert('Add a short note explaining the rejection.'); return; }
                decide.mutate({ id: ev.id, approve: false });
              }}>
              Reject
            </Button>
          </div>
        </article>
      ))}
          </div>
        </div>
      )}

      {live.length > 0 && (
        <div>
          <h2 className="mb-3 font-black text-ink">Published events</h2>
          <div className="space-y-2">
            {live.map(ev => (
              <article key={ev.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{ev.title}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {ev.host?.first_name} {ev.host?.last_name} · {ev.type}
                    {ev.scheduled_at &&
                      ` · ${new Date(ev.scheduled_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}`}
                  </p>
                </div>
                {ev.meet_link && (
                  <a href={ev.meet_link} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold text-navy hover:underline">
                    Link
                  </a>
                )}
                <Button size="sm" variant="secondary" onClick={() => setEditing(ev)}>
                  Edit
                </Button>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fees queue ────────────────────────────────────────────────────────────────
export function FeesQueue() {
  const qc = useQueryClient();
  const [quotes, setQuotes] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.admin('fees'),
    queryFn: async (): Promise<AdminFeeRequest[]> => {
      const { data, error } = await supabase
        .from('fee_requests')
        .select('*, mentee:public_profiles!fee_requests_mentee_id_fkey(first_name, last_name)')
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdminFeeRequest[];
    },
  });

  // Step 1: set the authoritative birr quote (status pending -> approved).
  const quote = useMutation({
    mutationFn: async (row: AdminFeeRequest) => {
      const birr = Number(quotes[row.id]);
      if (!birr || birr <= 0) throw new Error('Enter the birr amount first.');
      await assertUpdated(
        supabase
          .from('fee_requests')
          .update({
            amount_birr: birr,
            quoted_rate: Number((birr / row.amount_usd).toFixed(4)),
            quoted_at: new Date().toISOString(),
            status: 'approved',
          })
          .eq('id', row.id)
          .select('id'),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('fees') }),
  });

  // Step 2: after we pay the fee, mark it completed with the receipt.
  const markPaid = useMutation({
    mutationFn: async (row: AdminFeeRequest) => {
      const receipt = window.prompt('Receipt URL (optional, leave empty to skip):') ?? '';
      await assertUpdated(
        supabase
          .from('fee_requests')
          .update({
            status: 'completed',
            paid_at: new Date().toISOString(),
            receipt_url: receipt.trim() || null,
          })
          .eq('id', row.id)
          .select('id'),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('fees') }),
  });

  if (isLoading) return <PageSpinner />;
  if (rows.length === 0) return <SectionEmpty text="No fee requests in the queue." />;

  return (
    <div className="space-y-3">
      {rows.map(row => (
        <article key={row.id} className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-ink">
                {row.fee_type} · ${row.amount_usd}
              </h3>
              <p className="text-xs text-ink-muted">
                {row.mentee?.first_name} {row.mentee?.last_name}
                {row.recipient_name ? ` · pay to: ${row.recipient_name}` : ''}
                {' · '}{new Date(row.created_at).toLocaleDateString()}
              </p>
              {row.notes && <p className="mt-1 text-xs text-ink-muted">{row.notes}</p>}
            </div>
            <span className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-bold',
              row.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
            )}>
              {row.status === 'pending' ? 'Needs quote' : 'Quoted, awaiting payment'}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {row.status === 'pending' ? (
              <>
                <div className="w-44">
                  <input
                    type="number"
                    value={quotes[row.id] ?? ''}
                    onChange={e => setQuotes(q => ({ ...q, [row.id]: e.target.value }))}
                    placeholder="Amount in ETB"
                    className="!py-2 !text-xs"
                  />
                </div>
                <Button size="sm" disabled={quote.isPending} onClick={() => quote.mutate(row)}>
                  Set quote
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-ink">
                  {Number(row.amount_birr).toLocaleString()} ETB
                  <span className="ml-1 text-xs font-normal text-ink-muted">
                    ({row.quoted_rate} ETB/USD)
                  </span>
                </p>
                <Button size="sm" disabled={markPaid.isPending} onClick={() => markPaid.mutate(row)}>
                  Mark paid
                </Button>
              </>
            )}
          </div>
          {(quote.isError || markPaid.isError) && (
            <p className="mt-2 text-xs text-red-600">
              {((quote.error ?? markPaid.error) as Error).message}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

// ── Scholarships review ───────────────────────────────────────────────────────
export function ScholarshipsReview() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableScholarship | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.admin('scholarships'),
    queryFn: async (): Promise<AdminScholarship[]> => {
      const { data, error } = await supabase
        .from('scholarships')
        .select('id, title, provider, type, amount, deadline, link, is_active, is_verified, description, eligible_levels, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminScholarship[];
    },
  });

  const verify = useMutation({
    mutationFn: async (id: string) => {
      await assertUpdated(
        supabase.from('scholarships').update({ is_verified: true }).eq('id', id).select('id'),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('scholarships') }),
  });

  const toggle = useMutation({
    mutationFn: async (row: AdminScholarship) => {
      await assertUpdated(
        supabase
          .from('scholarships')
          .update({ is_active: !row.is_active })
          .eq('id', row.id)
          .select('id'),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('scholarships') }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await assertUpdated(
        supabase.from('scholarships').delete().eq('id', id).select('id'),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('scholarships') }),
  });

  if (isLoading) return <PageSpinner />;

  const pendingReview = rows.filter(r => !r.is_verified);
  const published = rows.filter(r => r.is_verified);

  // Admins author scholarships directly, a trigger publishes theirs on insert.
  if (creating || editing) {
    return (
      <div className="card p-5">
        <h2 className="mb-4 font-black text-ink">
          {editing ? 'Edit scholarship' : 'New scholarship'}
        </h2>
        <ScholarshipForm
          initial={editing ?? undefined}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          + New scholarship
        </Button>
      </div>

      {rows.length === 0 && (
        <SectionEmpty text="No scholarships yet, post the first one." />
      )}
      {pendingReview.length > 0 && (
        <div>
          <h2 className="mb-3 font-black text-ink">
            Awaiting review
            <span className="ml-2 text-xs font-semibold text-ink-muted">
              not visible to students until approved
            </span>
          </h2>
          <div className="space-y-2">
            {pendingReview.map(row => (
              <article key={row.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{row.title}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {row.provider}
                      {row.deadline && ` · due ${new Date(row.deadline).toLocaleDateString()}`}
                    </p>
                  </div>
                  {row.link && (
                    <a href={row.link} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-bold text-navy hover:underline">
                      Check link
                    </a>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
                    Edit
                  </Button>
                  <Button size="sm" disabled={verify.isPending}
                    onClick={() => verify.mutate(row.id)}>
                    Approve & publish
                  </Button>
                  <Button size="sm" variant="secondary" disabled={remove.isPending}
                    onClick={() => { if (confirm('Reject and delete this submission?')) remove.mutate(row.id); }}>
                    Reject
                  </Button>
                </div>
                <p className="mt-2 text-xs text-ink-muted">{row.description}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
      {published.map(row => (
        <article key={row.id}
          className={cn('card flex flex-wrap items-center gap-3 p-4', !row.is_active && 'opacity-60')}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{row.title}</p>
            <p className="truncate text-xs text-ink-muted">
              {row.provider}
              {row.deadline && ` · due ${new Date(row.deadline).toLocaleDateString()}`}
            </p>
          </div>
          {row.link && (
            <a href={row.link} target="_blank" rel="noopener noreferrer"
              className="text-xs font-bold text-navy hover:underline">
              Open link
            </a>
          )}
          <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
            Edit
          </Button>
          <Button size="sm" variant="secondary" disabled={toggle.isPending}
            onClick={() => toggle.mutate(row)}>
            {row.is_active ? 'Deactivate' : 'Activate'}
          </Button>
          <Button size="sm" variant="secondary" disabled={remove.isPending}
            onClick={() => { if (confirm('Delete this scholarship permanently?')) remove.mutate(row.id); }}>
            Delete
          </Button>
        </article>
      ))}
      </div>
    </div>
  );
}

