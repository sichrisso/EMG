import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';

/*
 * Seamless header: translucent blue-grey that darkens once you scroll, inline
 * section links on desktop, and, on the right, the theme toggle, the
 * hamburger (full nav on any screen), and the avatar with its menu.
 */
interface HeaderLink { to: string; label: string; end?: boolean }

const MENTEE_LINKS: HeaderLink[] = [
  { to: '/journey',            label: 'Application tracker' },
  { to: '/mentors',            label: 'Mentors' },
  { to: '/resources',          label: 'Scholarships', end: true },
  { to: '/resources/ielts',    label: 'Test prep' },
  { to: '/resources/embassy',  label: 'Visa & Embassy' },
  { to: '/services',           label: 'Services' },
  { to: '/resources/faq',      label: 'FAQ' },
];

const MENTOR_LINKS: HeaderLink[] = [
  { to: '/mentor/dashboard', label: 'Dashboard' },
  { to: '/events',           label: 'Post events' },
  { to: '/resources',        label: 'Resources' },
];

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem('emg-theme', dark ? 'dark' : 'light');
}

export function Header() {
  const navigate = useNavigate();
  const { profile, isAuthenticated, isAdmin } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('emg-theme') === 'dark');
  const [avatarBroken, setAvatarBroken] = useState(false);

  // The header keeps the page colour at the top and gains weight on scroll.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { applyTheme(dark); }, [dark]);

  const links = isAdmin
    ? [{ to: '/admin', label: 'Admin console' }]
    : profile?.role === 'mentor'
    ? MENTOR_LINKS
    : MENTEE_LINKS;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate('/', { replace: true });
  };

  if (!isAuthenticated || !profile) return null;

  const avatarMenu = isAdmin
    ? [{ to: '/admin', label: 'Admin console' }]
    : [
        { to: '/profile',      label: 'Profile' },
        { to: '/how-it-works', label: 'How it works' },
        ...(profile.role === 'mentee'
          ? [{ to: '/become-a-mentor', label: 'Become a mentor' }]
          : []),
      ];

  return (
    <header className={cn(
      'fixed inset-x-0 top-0 z-50 h-14 transition-colors duration-300',
      scrolled
        ? 'bg-[#5C7E8F]/85 shadow-sm backdrop-blur-lg'
        : '',
    )}>
      <div className="mx-auto flex h-full max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        {/* Logo */}
        <Link to={isAdmin ? '/admin' : '/home'} className="flex shrink-0 items-center gap-2.5">
          <img src="/logo-mark.jpeg" alt="" className="h-9 w-9 rounded-xl object-cover" />
          <span className="hidden text-[15px] font-black tracking-tight text-ink xl:block">
            Ethio Mentor Group
          </span>
        </Link>

        {/* Inline section links (desktop) */}
        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end ?? false}
              className={({ isActive }) => cn(
                'whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-bold transition',
                isActive
                  ? 'bg-white/70 text-navy shadow-sm'
                  : 'text-ink/70 hover:bg-white/40 hover:text-ink',
              )}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1 lg:hidden" />

        {/* Right: theme · hamburger · avatar */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-full bg-white/50 shadow-sm backdrop-blur-sm">
            <button
              onClick={() => setDark(d => !d)}
              className="grid h-10 w-11 place-items-center text-ink/70 transition hover:text-ink"
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              )}
            </button>
            <span className="h-5 w-px bg-ink/15" aria-hidden />
            <button
              onClick={() => { setNavOpen(o => !o); setAvatarOpen(false); }}
              className="grid h-10 w-11 place-items-center text-ink transition hover:text-navy"
              aria-expanded={navOpen}
              aria-label="Navigation menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>

          {/* Avatar sits right after the hamburger */}
          <div className="relative">
            <button
              onClick={() => { setAvatarOpen(o => !o); setNavOpen(false); }}
              className="flex items-center gap-1"
              aria-expanded={avatarOpen}
              aria-label="Account menu"
            >
              {profile.avatar_url && !avatarBroken ? (
                <img referrerPolicy="no-referrer" src={profile.avatar_url} alt=""
                  onError={() => setAvatarBroken(true)}
                  className="h-9 w-9 rounded-full object-cover ring-2 ring-white/70" />
              ) : (
                <span className="block overflow-hidden rounded-full ring-2 ring-white/70">
                  <DefaultAvatar className="h-9 w-9" />
                </span>
              )}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={cn('text-ink transition', avatarOpen && 'rotate-180')}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {avatarOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAvatarOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-white/60 bg-white/95 py-1.5 shadow-modal backdrop-blur-md">
                  <p className="truncate px-4 pb-1.5 pt-2 text-xs font-black text-ink">
                    {profile.first_name} {profile.last_name}
                  </p>
                  <div className="border-t border-surface-border/60" />
                  {avatarMenu.map(item => (
                    <Link key={item.to} to={item.to} onClick={() => setAvatarOpen(false)}
                      className="block px-4 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface-soft hover:text-ink">
                      {item.label}
                    </Link>
                  ))}
                  <div className="border-t border-surface-border/60" />
                  <button onClick={handleSignOut}
                    className="block w-full px-4 py-2 text-left text-sm font-semibold text-red-500 transition hover:bg-red-50">
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Hamburger nav (all sizes: complete list incl. extras) */}
      {navOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setNavOpen(false)} />
          <nav className="absolute right-4 z-20 mt-1 w-64 overflow-hidden rounded-2xl border border-white/60 bg-white/95 py-1.5 shadow-modal backdrop-blur-md sm:right-6">
            {[...links,
              { to: '/events',       label: profile.role === 'mentor' ? 'Events' : 'Events & workshops' },
              { to: '/how-it-works', label: 'How it works' },
            ].filter((l, i, arr) => arr.findIndex(x => x.to === l.to) === i).map(l => (
              <NavLink key={l.to} to={l.to} end={(l as HeaderLink).end ?? false}
                onClick={() => setNavOpen(false)}
                className={({ isActive }) => cn(
                  'block px-4 py-2.5 text-sm font-bold transition',
                  isActive
                    ? 'border-l-2 border-gold bg-gold-soft/40 text-ink'
                    : 'text-ink-muted hover:bg-surface-soft hover:text-ink',
                )}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        </>
      )}
    </header>
  );
}
