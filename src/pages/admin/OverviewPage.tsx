import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

/*
 * Admin overview, the console home. Answers two questions at a glance:
 * "what needs my attention right now?" (action cards with live counts,
 * each linking to its queue) and "is the platform alive?" (totals plus
 * the latest signups and requests).
 */

async function count(table: string, build?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (build) q = build(q);
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
}

interface OverviewData {
  attention: { pendingInbox: number; pendingMentors: number; pendingEvents: number; pendingFees: number; pendingScholarships: number };
  totals: { students: number; mentors: number; sessionsDone: number; liveScholarships: number; upcomingEvents: number };
  recentUsers: { id: string; first_name: string; last_name: string; role: string; created_at: string }[];
  recentRequests: { id: string; title: string; status: string; created_at: string }[];
}

async function fetchOverview(): Promise<OverviewData> {
  const nowIso = new Date().toISOString();
  const [
    pendingInbox, pendingMentors, pendingEvents, pendingFees, pendingScholarships,
    students, mentors, sessionsDone, liveScholarships, upcomingEvents,
    usersRes, requestsRes,
  ] = await Promise.all([
    count('service_requests', q => q.eq('status', 'pending').is('mentor_id', null)),
    count('mentor_profiles',  q => q.eq('status', 'pending')),
    count('events',           q => q.eq('status', 'pending')),
    count('fee_requests',     q => q.eq('status', 'pending')),
    count('scholarships',     q => q.eq('is_verified', false)),
    count('profiles',         q => q.eq('role', 'mentee')),
    count('mentor_profiles',  q => q.eq('status', 'approved')),
    count('service_requests', q => q.eq('status', 'completed')),
    count('scholarships',     q => q.eq('is_verified', true).eq('is_active', true)),
    count('events',           q => q.eq('status', 'approved').gte('scheduled_at', nowIso)),
    supabase.from('profiles')
      .select('id, first_name, last_name, role, created_at')
      .order('created_at', { ascending: false }).limit(5),
    supabase.from('service_requests')
      .select('id, title, status, created_at')
      .order('created_at', { ascending: false }).limit(5),
  ]);
  return {
    attention: { pendingInbox, pendingMentors, pendingEvents, pendingFees, pendingScholarships },
    totals: { students, mentors, sessionsDone, liveScholarships, upcomingEvents },
    recentUsers: (usersRes.data ?? []) as OverviewData['recentUsers'],
    recentRequests: (requestsRes.data ?? []) as OverviewData['recentRequests'],
  };
}

export default function OverviewPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.admin('overview'),
    queryFn: fetchOverview,
    refetchInterval: 60_000, // the console stays current while it's open
  });

  if (isLoading) return <PageSpinner />;
  if (isError || !data) {
    return <p className="text-sm text-red-600">Couldn't load the overview, refresh to retry.</p>;
  }

  const attention = [
    { label: 'Team inbox',           n: data.attention.pendingInbox,        to: '/admin/requests' },
    { label: 'Mentor applications',  n: data.attention.pendingMentors,      to: '/admin/mentors' },
    { label: 'Events to review',     n: data.attention.pendingEvents,       to: '/admin/events' },
    { label: 'Fees to quote',        n: data.attention.pendingFees,         to: '/admin/fees' },
    { label: 'Scholarships to vet',  n: data.attention.pendingScholarships, to: '/admin/scholarships' },
  ];
  const totalPending = attention.reduce((s, a) => s + a.n, 0);

  const totals = [
    { label: 'Students',            n: data.totals.students },
    { label: 'Approved mentors',    n: data.totals.mentors },
    { label: 'Sessions completed',  n: data.totals.sessionsDone },
    { label: 'Live scholarships',   n: data.totals.liveScholarships },
    { label: 'Upcoming events',     n: data.totals.upcomingEvents },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-ink">Overview</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {totalPending === 0
            ? 'Inbox zero, nothing is waiting on you.'
            : `${totalPending} item${totalPending === 1 ? '' : 's'} waiting on you.`}
        </p>
      </div>

      {/* Needs attention */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {attention.map(a => (
          <Link key={a.to} to={a.to}
            className={cn(
              'card p-4 transition hover:shadow-md',
              a.n > 0 ? 'border-gold/50' : 'opacity-70',
            )}>
            <p className={cn('text-3xl font-black', a.n > 0 ? 'text-navy' : 'text-ink-subtle')}>
              {a.n}
            </p>
            <p className="mt-1 text-xs font-bold text-ink-muted">{a.label}</p>
          </Link>
        ))}
      </div>

      {/* Platform totals */}
      <div>
        <h2 className="mb-3 font-black text-ink">Platform</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {totals.map(t => (
            <div key={t.label} className="card p-4">
              <p className="text-2xl font-black text-ink">{t.n}</p>
              <p className="mt-1 text-xs font-semibold text-ink-muted">{t.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-ink">Newest members</h2>
            <Link to="/admin/users" className="text-xs font-bold text-navy hover:underline">
              All users →
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {data.recentUsers.map(u => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">
                    {u.first_name} {u.last_name}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {u.role} · joined {new Date(u.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
            {data.recentUsers.length === 0 && (
              <p className="text-sm text-ink-muted">No signups yet.</p>
            )}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-ink">Latest requests</h2>
            <Link to="/admin/requests" className="text-xs font-bold text-navy hover:underline">
              Open queue →
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {data.recentRequests.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-4 py-2.5">
                <p className="min-w-0 truncate text-sm font-bold text-ink">{r.title}</p>
                <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold text-ink-muted">
                  {r.status}
                </span>
              </div>
            ))}
            {data.recentRequests.length === 0 && (
              <p className="text-sm text-ink-muted">No requests yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
