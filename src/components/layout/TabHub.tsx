import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/cn';

export interface HubTab { to: string; label: string; end?: boolean }

/**
 * Section shell in the light design system: a soft blue-grey wash at the top,
 * a big navy title with subtitle, and pill tabs (active = navy pill). The
 * active tab's page renders below on the light canvas.
 */
export function TabHub({ title, subtitle, tabs }: {
  title: string;
  subtitle: string;
  tabs: HubTab[];
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5C7E8F]/25 via-[#D4DDE2]/60 to-white pt-14">
      <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <h1 className="text-4xl font-black tracking-tight text-ink">{title}</h1>
        <div className="bar-gold mt-2 h-1 w-14 rounded-full" aria-hidden />
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">{subtitle}</p>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {tabs.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-bold transition',
                  isActive
                    ? 'bg-navy text-white shadow-card'
                    : 'text-ink-muted hover:bg-white/70 hover:text-ink',
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
        <div className="mt-2 border-b border-ink/10" />
      </section>
      <Outlet />
    </div>
  );
}
