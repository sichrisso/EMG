import { lazy, Suspense, type ReactNode } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Header } from '@/components/layout/Header';
import { TabHub } from '@/components/layout/TabHub';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ResourcesHub } from '@/features/resources/ResourcesHub';
import { BrandedLoader } from '@/components/ui/BrandedLoader';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { AuthCallbackPage } from '@/features/auth/pages/AuthCallbackPage';
import { NotFoundPage } from '@/features/auth/pages/misc';
import { useParams } from 'react-router-dom';

/** Preserves old /applications/:id bookmarks by mapping them to /journey/:id. */
function LegacyApplicationRedirect() {
  const { id } = useParams();
  return <Navigate to={`/journey/${id}`} replace />;
}

const EntryPage             = lazy(() => import('@/features/auth/pages/EntryPage'));
const HomePage              = lazy(() => import('@/pages/home'));
const ProfilePage           = lazy(() => import('@/pages/profile/index'));
const BecomeMentorPage      = lazy(() => import('@/pages/become-mentor'));
const HowItWorksPage        = lazy(() => import('@/pages/how-it-works'));
const AdminLayout           = lazy(() => import('@/pages/admin/AdminLayout'));
const AdminOverviewPage     = lazy(() => import('@/pages/admin/OverviewPage'));
const AdminUsersPage        = lazy(() => import('@/pages/admin/UsersPage'));
const MentorsPage           = lazy(() => import('@/features/mentors/pages/MentorsPage'));
const MentorProfilePage     = lazy(() => import('@/features/mentors/pages/MentorProfilePage'));
const MyRequestsPage        = lazy(() => import('@/features/mentors/pages/MyRequestsPage'));
const MentorDashboardPage   = lazy(() => import('@/features/mentors/pages/MentorDashboardPage'));
const TrackerPage           = lazy(() => import('@/features/applications/pages/TrackerPage'));
const IeltsPage             = lazy(() => import('@/features/ielts/pages/IeltsPage'));
const EmbassyPage           = lazy(() => import('@/features/embassy/pages/EmbassyPage'));
const FeesPage              = lazy(() => import('@/features/fees/pages/FeesPage'));
const ScholarshipsPage      = lazy(() => import('@/features/scholarships/pages/ScholarshipsPage'));
const ServicesPage          = lazy(() => import('@/features/services/pages/ServicesPage'));
const MockInterviewPage     = lazy(() => import('@/features/services/pages/MockInterviewPage'));
const EventsPage            = lazy(() => import('@/features/events/pages/EventsPage'));
const FaqPage               = lazy(() => import('@/features/resources/pages/FaqPage'));

function s(node: ReactNode) {
  return <Suspense fallback={<BrandedLoader />}>{node}</Suspense>;
}

const AdminQueues = lazy(() => import('@/pages/admin/queues').then(m => ({
  default: ({ kind }: { kind: 'requests' | 'mentors' | 'events' | 'fees' | 'scholarships' }) => {
    const meta = {
      requests:     { title: 'Requests',            sub: 'General inquiries land here; assign a mentor or handle them yourself.', C: m.RequestsQueue },
      mentors:      { title: 'Mentor applications', sub: 'Approval promotes the account to mentor.',                              C: m.MentorsQueue },
      events:       { title: 'Event approvals',     sub: 'Approved events go public and get a video link automatically.',         C: m.EventsQueue },
      fees:         { title: 'Fee queue',           sub: 'Quote in birr first, then mark paid with the receipt.',                 C: m.FeesQueue },
      scholarships: { title: 'Scholarships',        sub: 'Vet submissions before they appear to students.',                       C: m.ScholarshipsReview },
    }[kind];
    const C = meta.C;
    return (
      <div>
        <h1 className="text-2xl font-black text-ink">{meta.title}</h1>
        <p className="mb-5 mt-1 text-sm text-ink-muted">{meta.sub}</p>
        <C />
      </div>
    );
  },
})));

function AdminSection({ kind }: { kind: 'requests' | 'mentors' | 'events' | 'fees' | 'scholarships' }) {
  return <AdminQueues kind={kind} />;
}

function Layout() {
  return (
    <>
      <Header />
      <Outlet />
    </>
  );
}

/**
 * Route map, five purposeful sections instead of twelve scattered pages:
 *   /            entry (auth); redirects to /home when signed in
 *   /home        dashboard: your next actions
 *   /journey     application tracker (list + detail)
 *   /mentors     tabs: Find a mentor | My requests
 *   /resources   tabs: Scholarships | IELTS | Visa & Embassy
 *   /services    tabs: Request help | Fee payment
 *   /events      community events
 *   /profile     profile + "Become a mentor"
 *   /admin       admin-only moderation panel
 * Old paths keep working via redirects so no bookmark ever 404s.
 */
const router = createBrowserRouter([
  { path: '/', element: s(<EntryPage />) },
  { path: '/auth/callback', element: <AuthCallbackPage /> },

  // Legacy auth routes
  { path: '/login',  element: <Navigate to="/" replace /> },
  { path: '/signup', element: <Navigate to="/" replace /> },

  {
    element: <Layout />,
    children: [
      // Public within the app shell: reachable signed-out (it prompts sign-in).
      { path: 'become-a-mentor', element: s(<BecomeMentorPage />) },
      { path: 'how-it-works',    element: s(<HowItWorksPage />) },
      {
        element: <ProtectedRoute />,
        children: [
          { path: 'home',    element: s(<HomePage />) },
          { path: 'profile', element: s(<ProfilePage />) },
          { path: 'events',  element: s(<EventsPage />) },
          // Admin console: sidebar layout with one route per queue
          {
            path: 'admin',
            element: s(<AdminLayout />),
            children: [
              { index: true,           element: s(<AdminOverviewPage />) },
              { path: 'requests',      element: s(<AdminSection kind="requests" />) },
              { path: 'mentors',       element: s(<AdminSection kind="mentors" />) },
              { path: 'events',        element: s(<AdminSection kind="events" />) },
              { path: 'fees',          element: s(<AdminSection kind="fees" />) },
              { path: 'scholarships',  element: s(<AdminSection kind="scholarships" />) },
              { path: 'users',         element: s(<AdminUsersPage />) },
            ],
          },

          // Journey (application tracker)
          { path: 'mentors/:id', element: s(<MentorProfilePage />) },
          { path: 'journey',     element: s(<TrackerPage />) },
          { path: 'journey/:id', element: s(<TrackerPage />) },

          // Mentors hub
          {
            path: 'mentors',
            element: (
              <TabHub
                title="Mentors"
                subtitle="Ethiopians who've already made it, book sessions, get real answers."
                tabs={[
                  { to: '/mentors', label: 'Find a mentor', end: true },
                  { to: '/mentors/requests', label: 'My requests' },
                ]}
              />
            ),
            children: [
              { index: true, element: s(<MentorsPage />) },
              { path: 'requests', element: s(<MyRequestsPage />) },
            ],
          },

          // Resources hub (tabs are role-aware inside ResourcesHub)
          {
            path: 'resources',
            element: <ResourcesHub />,
            children: [
              { index: true, element: s(<ScholarshipsPage />) },
              { path: 'ielts', element: s(<IeltsPage />) },
              { path: 'embassy', element: s(<EmbassyPage />) },
              { path: 'faq', element: s(<FaqPage />) },
            ],
          },

          // Services hub
          {
            path: 'services',
            element: (
              <TabHub
                title="Services"
                subtitle="Ask our team for help, or request fee payment assistance. We process requests within 24 business hours."
                tabs={[
                  { to: '/services', label: 'Fee payment', end: true },
                  { to: '/services/help', label: 'Request help' },
                  { to: '/services/mock-interview', label: 'Mock interview' },
                ]}
              />
            ),
            children: [
              { index: true, element: s(<FeesPage />) },
              { path: 'help', element: s(<ServicesPage />) },
              { path: 'mock-interview', element: s(<MockInterviewPage />) },
              { path: 'fees', element: <Navigate to="/services" replace /> },
            ],
          },

          // Legacy paths → new sections
          { path: 'dashboard',          element: <Navigate to="/home" replace /> },
          { path: 'applications',       element: <Navigate to="/journey" replace /> },
          { path: 'applications/:id',   element: <LegacyApplicationRedirect /> },
          { path: 'scholarships',       element: <Navigate to="/resources" replace /> },
          { path: 'ielts',              element: <Navigate to="/resources/ielts" replace /> },
          { path: 'embassy',            element: <Navigate to="/resources/embassy" replace /> },
          { path: 'fees',               element: <Navigate to="/services/fees" replace /> },
          { path: 'requests',           element: <Navigate to="/mentors/requests" replace /> },

          // Mentor console (approved mentors only)
          {
            path: 'mentor/dashboard',
            element: (
              <ProtectedRoute role="mentor" requireApproval>
                {s(<MentorDashboardPage />)}
              </ProtectedRoute>
            ),
          },
        ],
      },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
]);

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
