import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { PageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { ImpactLevelChip } from '@/pages/profile';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { DAYS } from '@/types';
import { getMentors, getMentorSlots } from '../api';
import { RequestModal } from './MentorsPage';

/*
 * /mentors/:id, a mentor's full profile in the light layout, replacing the
 * old popup. Left: photo card with the Request 1-on-1 action; right: tabs
 * (Overview / Availability / Reviews) over the same white panel used on the
 * user's own profile, so the whole app reads as one product.
 */

type Tab = 'overview' | 'availability' | 'reviews';

export default function MentorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [requesting, setRequesting] = useState(false);
  const [sent, setSent] = useState(false);

  // The mentors list is small and cached; pull the card from it rather than
  // duplicating the join logic for a single row.
  const { data: mentors = [], isLoading } = useQuery({
    queryKey: qk.mentors(undefined),
    queryFn: () => getMentors(),
  });
  const mentor = mentors.find(m => m.mentorProfileId === id);

  const { data: slots = [] } = useQuery({
    queryKey: qk.mentorSlots(id ?? ''),
    queryFn: () => getMentorSlots(id!),
    enabled: !!id,
  });

  interface Review { rating: number; feedback: string | null; created_at: string; reviewer: string }
  const { data: reviews = [] } = useQuery({
    queryKey: ['mentor-reviews', id],
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await supabase
        .rpc('get_mentor_reviews', { p_mentor_profile_id: id! });
      if (error) throw error;
      return (data ?? []) as Review[];
    },
    enabled: !!id,
  });

  if (isLoading) return <PageSpinner />;
  if (!mentor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#5C7E8F]/25 via-[#D4DDE2]/60 to-white">
        <div className="text-center">
          <p className="text-ink-muted">Mentor not found.</p>
          <Link to="/mentors" className="mt-3 block text-sm font-bold text-navy hover:underline">
            ← Back to mentors
          </Link>
        </div>
      </div>
    );
  }

  const canRequest =
    profile?.role === 'mentee' && mentor.isAvailable && !mentor.isFullThisWeek;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5C7E8F]/25 via-[#D4DDE2]/60 to-white pt-14">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link to="/mentors" className="text-sm font-bold text-ink-muted transition hover:text-ink">
          ← Back to mentors
        </Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* ── Left: identity + action ── */}
          <div className="space-y-5">
            <div className="rounded-3xl border border-white/60 bg-white/60 p-5 text-center shadow-card backdrop-blur-md">
              {mentor.avatarUrl ? (
                <img referrerPolicy="no-referrer" src={mentor.avatarUrl} alt={mentor.firstName}
                  className="mx-auto h-28 w-28 rounded-full object-cover ring-4 ring-white" />
              ) : (
                <span className="mx-auto block h-28 w-28 overflow-hidden rounded-full ring-4 ring-white">
                  <DefaultAvatar className="h-28 w-28" />
                </span>
              )}
              <h1 className="mt-4 text-xl font-black text-ink">
                {mentor.firstName} {mentor.lastName}
              </h1>
              <p className="text-sm text-ink-muted">{mentor.currentJob}</p>
              <div className="mt-2 flex justify-center">
                <ImpactLevelChip userId={mentor.userId} showNew />
              </div>

              <div className="mt-4 space-y-2 border-t border-surface-border/60 pt-4 text-left text-sm text-ink-muted">
                <p className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  {mentor.currentLocation}
                </p>
                <p className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></svg>
                  {mentor.university}{mentor.graduationYear ? ` '${String(mentor.graduationYear).slice(-2)}` : ''}
                </p>
                {mentor.linkedinUrl && (
                  <a
                    href={mentor.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 font-bold text-[#0A66C2] transition hover:underline"
                  >
                    <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm bg-[#0A66C2] text-[8px] font-black text-white">
                      in
                    </span>
                    LinkedIn profile
                  </a>
                )}
              </div>

              {canRequest ? (
                <Button className="mt-4 w-full" onClick={() => setRequesting(true)}>
                  Request 1-on-1 mentorship
                </Button>
              ) : (
                <span className="mt-4 block rounded-xl bg-surface-soft px-4 py-3 text-sm font-bold text-ink-muted ring-1 ring-surface-border">
                  {profile?.role !== 'mentee'
                    ? 'Students request sessions here'
                    : !mentor.isAvailable
                    ? 'Not accepting new students'
                    : 'Full this week, check back next week'}
                </span>
              )}
              {sent && (
                <p className="mt-2 text-xs font-bold text-emerald-600">
                  Request sent, track it under My requests.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-sm">
              <h2 className="font-black text-ink">At a glance</h2>
              <div className="mt-2">
                {[
                  { label: 'Rating', value: mentor.avgRating > 0 ? `★ ${mentor.avgRating.toFixed(1)}` : 'New' },
                  { label: 'Sessions', value: String(mentor.totalSessions) },
                  { label: 'Areas', value: String(mentor.areas.length) },
                  { label: 'Availability', value: mentor.isAvailable ? (mentor.isFullThisWeek ? 'Full this week' : 'Open') : 'Paused' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between border-b border-surface-border/60 py-2.5 last:border-0">
                    <span className="text-sm font-semibold text-ink-muted">{r.label}</span>
                    <span className="text-sm font-black text-ink">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: tabbed content ── */}
          <div className="h-fit rounded-3xl border border-white/60 bg-white/60 shadow-card backdrop-blur-md">
            <div className="flex gap-6 border-b border-surface-border/70 px-6 pt-4">
              {([
                ['overview', 'Overview'],
                ['availability', `Availability (${slots.length})`],
                ['reviews', `Reviews (${reviews.length})`],
              ] as [Tab, string][]).map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)}
                  className={cn(
                    'pb-3 text-sm transition',
                    tab === t
                      ? 'border-b-2 border-navy font-black text-navy'
                      : 'font-semibold text-ink-subtle hover:text-ink',
                  )}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_250px]">
                <div className="space-y-7">
                  <div>
                    <h3 className="text-lg font-black text-ink">About me</h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
                      {mentor.bio}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-ink">Can help with</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {mentor.areas.map(a => (
                        <span key={a} className="rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-ink shadow-sm ring-1 ring-surface-border">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl bg-surface-soft p-5">
                  <h3 className="text-lg font-black text-ink">Background</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {mentor.university}
                    {mentor.graduationYear ? `, class of ${mentor.graduationYear}` : ''}.
                    Now {mentor.currentJob.toLowerCase().startsWith('a ') ? '' : 'working as '}
                    {mentor.currentJob} in {mentor.currentLocation}.
                  </p>
                </div>
              </div>
            )}

            {tab === 'availability' && (
              <div className="p-6">
                <p className="text-sm text-ink-muted">
                  Pick one of these windows when you send a request, so the
                  session lands at a time that works for both of you.
                </p>
                <div className="mt-4 space-y-2.5">
                  {slots.map(s => (
                    <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-surface-border">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-light text-navy">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                      </span>
                      <div>
                        <p className="text-sm font-black text-ink">{DAYS[s.day_of_week]}</p>
                        <p className="text-xs text-ink-muted">
                          {s.start_time.slice(0, 5)} to {s.end_time.slice(0, 5)} EAT
                        </p>
                      </div>
                    </div>
                  ))}
                  {slots.length === 0 && (
                    <p className="rounded-2xl bg-surface-soft px-4 py-6 text-center text-sm text-ink-muted">
                      No fixed windows, propose a time in your request message.
                    </p>
                  )}
                </div>
              </div>
            )}

            {tab === 'reviews' && (
              <div className="space-y-3 p-6">
                {mentor.avgRating > 0 && (
                  <div className="rounded-2xl bg-gold-soft/50 p-5 text-center">
                    <p className="text-3xl font-black text-ink">
                      <span className="text-gold">★</span> {mentor.avgRating.toFixed(1)}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">
                      Average across {mentor.totalSessions} completed session{mentor.totalSessions === 1 ? '' : 's'}.
                    </p>
                  </div>
                )}
                {reviews.map((r, i) => (
                  <div key={i} className="rounded-2xl bg-surface-soft p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-gold">
                        {'★'.repeat(r.rating)}<span className="text-surface-border">{'★'.repeat(5 - r.rating)}</span>
                      </span>
                      <span className="text-xs text-ink-subtle">
                        {r.reviewer} · {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {r.feedback && (
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">“{r.feedback}”</p>
                    )}
                  </div>
                ))}
                {reviews.length === 0 && (
                  <p className="rounded-2xl bg-surface-soft px-4 py-8 text-center text-sm text-ink-muted">
                    No sessions rated yet, be the first.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {requesting && (
        <RequestModal
          mentor={mentor}
          slots={slots}
          onClose={() => setRequesting(false)}
          onSuccess={() => setSent(true)}
        />
      )}
    </div>
  );
}
