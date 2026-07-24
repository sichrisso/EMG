import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/cn';
import { Spinner } from '@/components/ui/Spinner';

/*
 * What a mentor sees before a session: where this student actually is.
 * The data comes from get_student_snapshot(), a SECURITY DEFINER function that
 * only answers for students the caller has a real request with, mentors can't
 * browse strangers, and the underlying tables stay locked down.
 */

const STAGE_LABELS: Record<string, string> = {
  exploring: 'Exploring options',
  documents: 'Preparing documents',
  testing:   'Studying for tests',
  applying:  'Applying to universities',
  waiting:   'Waiting on decisions',
  accepted:  'Accepted, preparing visa',
  visa:      'Visa process',
};

// Where each stage sits on the road, so the mentor sees the whole arc at once.
const STAGE_ORDER = ['exploring', 'documents', 'testing', 'applying', 'waiting', 'accepted', 'visa'];

const DEGREE_LABELS: Record<string, string> = {
  bachelor: "Bachelor's",
  masters:  "Master's",
  phd:      'PhD',
  other:    'Other',
};

interface Snapshot {
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  country: string | null;
  journey_stage: string | null;
  target_degree: string | null;
  target_countries: string[] | null;
  about: string | null;
  applications: number;
  submitted: number;
  accepted: number;
  materials_total: number;
  materials_done: number;
  visa_steps_done: number;
}

export function StudentSnapshot({ menteeId, onClose }: {
  menteeId: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['student-snapshot', menteeId],
    queryFn: async (): Promise<Snapshot | null> => {
      const { data, error } = await supabase
        .rpc('get_student_snapshot', { p_mentee_id: menteeId });
      if (error) throw error;
      const rows = (data ?? []) as Snapshot[];
      return rows[0] ?? null;
    },
  });

  const pct = data && data.materials_total > 0
    ? Math.round((data.materials_done / data.materials_total) * 100)
    : 0;
  const stageIdx = data?.journey_stage ? STAGE_ORDER.indexOf(data.journey_stage) : -1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-modal">
        {/* Header band */}
        <div className="relative overflow-hidden bg-gradient-to-br from-navy via-navy-soft to-navy-deep px-6 pb-6 pt-5">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '18px 18px',
            }}
          />
          <div className="relative flex items-start justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-gold">
              Student snapshot
            </p>
            <button onClick={onClose} className="text-white/60 hover:text-white">✕</button>
          </div>

          {isLoading && <div className="relative py-8"><Spinner /></div>}
          {isError && (
            <p className="relative mt-4 text-sm text-red-300">{(error as Error).message}</p>
          )}

          {data && (
            <div className="relative mt-4 flex items-center gap-4">
              {data.avatar_url ? (
                <img referrerPolicy="no-referrer" src={data.avatar_url} alt="" className="h-14 w-14 rounded-2xl object-cover ring-2 ring-white/20" />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-lg font-black text-white ring-2 ring-white/20">
                  {data.first_name.charAt(0)}
                </span>
              )}
              <div>
                <p className="text-lg font-black text-white">
                  {data.first_name} {data.last_name}
                </p>
                <p className="text-sm text-white/60">
                  {data.country ?? 'Ethiopia'}
                  {data.target_degree && ` · ${DEGREE_LABELS[data.target_degree] ?? data.target_degree}`}
                </p>
              </div>
            </div>
          )}
        </div>

        {data && (
          <div className="space-y-5 px-6 py-5">
            {/* Journey stage track */}
            {stageIdx >= 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-black uppercase tracking-wide text-ink-subtle">
                    Journey stage
                  </p>
                  <p className="text-xs font-bold text-navy">
                    {STAGE_LABELS[data.journey_stage!]}
                  </p>
                </div>
                <div className="flex gap-1">
                  {STAGE_ORDER.map((s, i) => (
                    <div
                      key={s}
                      className={cn(
                        'h-2 flex-1 rounded-full transition',
                        i < stageIdx ? 'bg-gold' :
                        i === stageIdx ? 'bg-emerald-500' : 'bg-surface-muted',
                      )}
                      title={STAGE_LABELS[s]}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Stat tiles */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { n: data.applications, label: 'universities', accent: 'text-navy' },
                { n: data.submitted,    label: 'submitted',    accent: 'text-navy' },
                { n: data.accepted,     label: 'accepted',     accent: data.accepted > 0 ? 'text-emerald-600' : 'text-ink' },
              ].map(stat => (
                <div key={stat.label} className="rounded-2xl border border-surface-border bg-cloud p-4 text-center">
                  <p className={cn('text-2xl font-black', stat.accent)}>{stat.n}</p>
                  <p className="text-[11px] font-semibold text-ink-muted">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Checklist ring + bar */}
            <div className="rounded-2xl border border-surface-border p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-ink">Document checklist</span>
                <span className="text-sm font-black text-gold-dark">{pct}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-dark transition-all"
                  style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-ink-muted">
                {data.materials_done} of {data.materials_total} items complete
              </p>
            </div>

            {data.visa_steps_done > 0 && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-sm font-black text-white">
                  {data.visa_steps_done}
                </span>
                <p className="text-sm font-semibold text-emerald-700">
                  of 7 visa steps complete
                </p>
              </div>
            )}

            {data.about && (
              <div className="rounded-2xl bg-gold-soft/40 p-4">
                <p className="text-[11px] font-black uppercase tracking-wide text-gold-dark">
                  In their words
                </p>
                <p className="mt-1 text-sm italic leading-relaxed text-ink">"{data.about}"</p>
              </div>
            )}

            {!data.journey_stage && (
              <p className="rounded-2xl border border-dashed border-surface-border bg-cloud px-4 py-3 text-xs text-ink-muted">
                This student hasn't set their stage yet, worth asking at the start
                of the session.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
