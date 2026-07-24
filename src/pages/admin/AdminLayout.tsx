import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { PageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/hooks/useAuth';

/*
 * Admin console shell, gated on profiles.is_admin, with a navy sidebar on
 * desktop that collapses into a horizontal scroller on mobile. Each section
 * is a real route, so queues are linkable and the back button works.
 */

const NAV = [
  { to: '/admin',              label: 'Overview',            end: true },
  { to: '/admin/requests',     label: 'Requests' },
  { to: '/admin/mentors',      label: 'Mentor applications' },
  { to: '/admin/events',       label: 'Event approvals' },
  { to: '/admin/fees',         label: 'Fee queue' },
  { to: '/admin/scholarships', label: 'Scholarships' },
  { to: '/admin/users',        label: 'Users' },
];

export default function AdminLayout() {
  const { isAdmin, isLoading } = useAuth();

  if (isLoading) return <PageSpinner />;
  if (!isAdmin) return <Navigate to="/home" replace />;

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'block whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition',
      isActive
        ? 'bg-white/10 text-gold'
        : 'text-white/60 hover:bg-white/5 hover:text-white',
    );

  return (
    <div className="min-h-screen bg-cloud pt-14">
      <div className="mx-auto flex max-w-7xl flex-col md:flex-row">

        {/* Sidebar */}
        <aside className="md:min-h-[calc(100vh-3.5rem)] md:w-60 md:shrink-0 bg-navy">
          <div className="px-5 pb-2 pt-6">
            <p className="text-xs font-black uppercase tracking-widest text-gold">Admin console</p>
            <p className="mt-1 text-[11px] text-white/40">
              Every action here is RLS-audited.
            </p>
          </div>
          <nav className="flex gap-1 overflow-x-auto p-3 md:flex-col md:overflow-visible">
            {NAV.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkCls}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Section content */}
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
