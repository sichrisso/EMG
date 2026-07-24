import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries:   { staleTime: 5 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

/**
 * Query-key factory. Every useQuery / invalidateQueries in the app goes
 * through these builders so invalidation can never drift out of sync
 * with the keys used to cache.
 */
export const qk = {
  profile:           (userId: string) => ['auth', 'profile', userId] as const,
  mentorProfile:     (userId: string) => ['auth', 'mentor-profile', userId] as const,
  mentors:           (f?: object) => ['mentors', 'list', f ?? {}] as const,
  mentorSlots:       (mentorId: string) => ['mentors', 'slots', mentorId] as const,
  requests:          (dir: 'in' | 'out') => ['requests', dir] as const,
  mentorRequests:    (mentorId: string) => ['requests', 'mentor', mentorId] as const,
  applications:      ['applications', 'list'] as const,
  applicationDetail: (id: string) => ['applications', id] as const,
  scholarships:      ['scholarships', 'list'] as const,
  events:            (userId: string) => ['events', 'all', userId] as const,
  myEvents:          (hostId: string) => ['events', 'mine', hostId] as const,
  mentorPoints:      (userId: string) => ['points', 'mentor', userId] as const,
  menteePoints:      (userId: string) => ['points', 'mentee', userId] as const,
  fees:              ['fees', 'list'] as const,
  admin:             (section: string) => ['admin', section] as const,
};
