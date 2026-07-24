import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { MentorProfile, Profile } from '@/types';

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error; // network/RLS failures must not look like "no profile"
  return (data as Profile) ?? null;
}

async function fetchMentorProfile(userId: string): Promise<MentorProfile | null> {
  const { data, error } = await supabase
    .from('mentor_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as MentorProfile) ?? null;
}

/**
 * Session + profile state for the whole app.
 * - Queries run only once a real user id exists (no sentinel ids).
 * - mentorProfile semantics: undefined = still loading, null = none exists.
 */
export function useAuth() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;
  const isAuthenticated = !!userId;

  const profileQuery = useQuery({
    queryKey: qk.profile(userId ?? ''),
    queryFn: () => fetchProfile(userId!),
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: 1,
  });

  // Google serves avatars from lh3.googleusercontent.com, which 403s on
  // cross-site requests and can expire outright. Copy the photo into our own
  // avatars bucket once, then serve it from there forever after.
  const profile = profileQuery.data;
  useEffect(() => {
    if (!userId || !profile?.avatar_url) return;
    if (!/googleusercontent\.com/.test(profile.avatar_url)) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(profile.avatar_url!, { referrerPolicy: 'no-referrer' });
        if (!res.ok) return;
        const blob = await res.blob();
        const ext = blob.type.includes('png') ? 'png' : 'jpg';
        const path = `${userId}/avatar.${ext}`;
        const up = await supabase.storage
          .from('avatars')
          .upload(path, blob, { upsert: true, contentType: blob.type });
        if (up.error || cancelled) return;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        const url = `${data.publicUrl}?t=${Date.now()}`;
        await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
        if (!cancelled) queryClient.invalidateQueries({ queryKey: qk.profile(userId) });
      } catch {
        // Never block sign-in over a profile picture.
      }
    })();
    return () => { cancelled = true; };
  }, [userId, profile?.avatar_url, queryClient]);

  const isMentor = profileQuery.data?.role === 'mentor';
  const mentorQuery = useQuery({
    queryKey: qk.mentorProfile(userId ?? ''),
    queryFn: () => fetchMentorProfile(userId!),
    // Fetch for mentors (routing) and for mentees who applied to become one.
    enabled: isAuthenticated && !!profileQuery.data,
    staleTime: 10_000,
    retry: 1,
  });

  const refetchMentorProfile = () => {
    if (userId) queryClient.invalidateQueries({ queryKey: qk.mentorProfile(userId) });
  };

  return {
    session,
    userId,
    isAuthenticated,
    profile: profileQuery.data ?? null,
    isAdmin: profileQuery.data?.is_admin ?? false,
    // undefined while the query is in flight; null when no row exists.
    mentorProfile: mentorQuery.isLoading && isAuthenticated
      ? undefined
      : (mentorQuery.data ?? null),
    isMentor,
    isLoading: session === undefined || (isAuthenticated && profileQuery.isLoading),
    profileError: profileQuery.isError,
    refetchMentorProfile,
  };
}
