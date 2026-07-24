import { supabase } from '@/lib/supabase';
import { assertUpdated } from '@/lib/safeUpdate';
import type { MentorProfile, Profile, RequestStatus, ServiceRequest } from '@/types';

export interface MentorCard {
  mentorProfileId: string;
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  currentLocation: string;
  currentJob: string;
  university: string;
  graduationYear: number | null;
  bio: string;
  areas: string[];
  linkedinUrl: string | null;
  isAvailable: boolean;
  weeklyLimit: number;
  avgRating: number;
  totalSessions: number;
  weekBooked: number;
  isFullThisWeek: boolean;
}

export interface AvailabilitySlot {
  id: string;
  mentor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
  is_active: boolean;
}

// Profile data comes from the public_profiles view (name/avatar/country only)
// because the base profiles table is own-row-only under RLS.
interface RawMentor extends MentorProfile {
  profile: Pick<Profile, 'first_name' | 'last_name' | 'avatar_url'> | null;
  is_available?: boolean;
  weekly_limit?: number;
}

function toCard(r: RawMentor): MentorCard {
  return {
    mentorProfileId: r.id,
    userId: r.user_id,
    firstName: r.profile?.first_name ?? '',
    lastName: r.profile?.last_name ?? '',
    avatarUrl: r.profile?.avatar_url ?? null,
    currentLocation: r.current_location,
    currentJob: r.current_job,
    university: r.university,
    graduationYear: r.graduation_year,
    bio: r.bio,
    areas: r.areas,
    linkedinUrl: r.linkedin_url,
    isAvailable: r.is_available ?? true,
    weeklyLimit: r.weekly_limit ?? 3,
    avgRating: Number(r.avg_rating ?? 0),
    totalSessions: r.total_sessions ?? 0,
    weekBooked: 0,
    isFullThisWeek: false,
  };
}

export async function getMentors(filters?: {
  area?: string;
  search?: string;
}): Promise<MentorCard[]> {
  let q = supabase
    .from('mentor_profiles')
    .select('*, profile:public_profiles!mentor_profiles_user_id_fkey(first_name, last_name, avatar_url)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (filters?.area) q = q.contains('areas', [filters.area]);

  const { data, error } = await q;
  if (error) throw error;

  // Client-side text search is fine at the current mentor count; move to
  // Postgres full-text search when the list grows past a few hundred.
  let cards = (data as RawMentor[]).map(toCard);

  // Weekly capacity: count each mentor's approved sessions scheduled from the
  // start of this week, and mark those at/over their weekly_limit as full.
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // back to Sunday
  const { data: weekRows } = await supabase
    .from('service_requests')
    .select('mentor_id')
    .eq('status', 'approved')
    .gte('scheduled_at', weekStart.toISOString());
  const weekCounts = new Map<string, number>();
  for (const r of (weekRows ?? []) as { mentor_id: string | null }[]) {
    if (r.mentor_id) weekCounts.set(r.mentor_id, (weekCounts.get(r.mentor_id) ?? 0) + 1);
  }
  cards = cards.map(c => {
    const used = weekCounts.get(c.mentorProfileId) ?? 0;
    return { ...c, weekBooked: used, isFullThisWeek: used >= c.weeklyLimit };
  });

  if (filters?.search) {
    const needle = filters.search.toLowerCase();
    cards = cards.filter(c =>
      [c.firstName, c.lastName, c.currentLocation, c.currentJob, c.university, c.bio]
        .join(' ').toLowerCase().includes(needle),
    );
  }
  return cards;
}

export async function getMentorSlots(mentorId: string): Promise<AvailabilitySlot[]> {
  const { data, error } = await supabase
    .from('availability_slots')
    .select('*')
    .eq('mentor_id', mentorId)
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');
  if (error) throw error;
  return (data ?? []) as AvailabilitySlot[];
}

/**
 * Atomic slot replacement via a Postgres function. The old client-side
 * delete-then-insert could wipe a mentor's availability if the insert
 * failed mid-way; the RPC runs both in one transaction.
 */
export async function saveSlots(
  slots: { day_of_week: number; start_time: string; end_time: string; timezone: string }[],
): Promise<void> {
  const { error } = await supabase.rpc('replace_availability_slots', { p_slots: slots });
  if (error) throw error;
}

export async function createRequest(input: {
  menteeId: string;
  mentorId: string; // mentor_profiles.id
  topics: string[];
  message: string;
  bookedDay?: number | null;
  bookedTime?: string | null;
  attachmentFile?: File | null;
}): Promise<void> {
  // If the student attached a document (e.g. the essay to review), upload it to
  // their private folder first; a mentor with this request can read it (008).
  let attachmentUrl: string | null = null;
  let attachmentName: string | null = null;
  if (input.attachmentFile) {
    const safe = input.attachmentFile.name.replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `${input.menteeId}/requests/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage
      .from('documents')
      .upload(path, input.attachmentFile, { upsert: true, contentType: input.attachmentFile.type });
    if (upErr) throw upErr;
    attachmentUrl = path;
    attachmentName = input.attachmentFile.name;
  }

  const { error } = await supabase.from('service_requests').insert({
    mentee_id: input.menteeId,
    mentor_id: input.mentorId,
    service_type: 'general',
    title: `Mentorship request: ${input.topics.slice(0, 2).join(', ')}`,
    description: input.message,
    topics: input.topics,
    booked_day: input.bookedDay ?? null,
    booked_time: input.bookedTime ?? null,
    attachment_url: attachmentUrl,
    attachment_name: attachmentName,
  });
  if (error) throw error;
}

export async function cancelRequest(id: string): Promise<void> {
  await assertUpdated(
    supabase
      .from('service_requests')
      .update({ status: 'cancelled' as RequestStatus })
      .eq('id', id)
      .select('id'),
  );
}

export interface OutgoingRequest extends ServiceRequest {
  mentorFirstName: string;
  mentorLastName: string;
  mentorCurrentJob: string;
}

export async function getOutgoingRequests(): Promise<OutgoingRequest[]> {
  const { data, error } = await supabase
    .from('service_requests')
    .select(`
      *,
      mentor:mentor_profiles!service_requests_mentor_id_fkey(
        current_job,
        profile:public_profiles!mentor_profiles_user_id_fkey(first_name, last_name)
      )
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map(
    (r: ServiceRequest & {
      mentor: {
        current_job: string;
        profile: { first_name: string; last_name: string } | null;
      } | null;
    }) => ({
      ...r,
      mentorFirstName: r.mentor?.profile?.first_name ?? '',
      mentorLastName: r.mentor?.profile?.last_name ?? '',
      mentorCurrentJob: r.mentor?.current_job ?? '',
    }),
  );
}


/** The next real-world occurrence of a weekly slot (day 0=Sunday, HH:MM). */
export function nextOccurrence(day: number, time: string | null): Date {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() + ((day - now.getDay() + 7) % 7));
  const [h, m] = (time ?? '17:00').split(':').map(Number);
  d.setHours(h || 17, m || 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
  return d;
}
