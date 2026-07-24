import { TabHub, type HubTab } from '@/components/layout/TabHub';
import { useAuth } from '@/features/auth/hooks/useAuth';

/**
 * Resources section shell. Students get the full set; mentors only see what
 * applies to them (they've already taken the tests and gotten the visas).
 */
export function ResourcesHub() {
  const { profile } = useAuth();
  const isMentor = profile?.role === 'mentor';

  const tabs: HubTab[] = [
    { to: '/resources', label: 'Scholarships', end: true },
    ...(!isMentor
      ? [
          { to: '/resources/ielts', label: 'Test prep' },
          { to: '/resources/embassy', label: 'Visa & Embassy' },
        ]
      : []),
    { to: '/resources/faq', label: 'FAQ' },
  ];

  return (
    <TabHub
      title="Resources"
      subtitle={
        isMentor
          ? 'Post scholarships you know are real, our team reviews before publishing.'
          : 'Scholarships, test prep, and the visa process, everything you can do yourself, in one place.'
      }
      tabs={tabs}
    />
  );
}
