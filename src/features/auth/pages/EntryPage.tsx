import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { PageSpinner } from "@/components/ui/Spinner";
import { EntryAuthCard } from "./EntryAuthCard";
/*
 * The entry screen at "/": navy identity panel on the left, headline, three
 * gold-check promises, the community sketch walking along the bottom, and
 * the auth card floating on the light panel to the right. Matches the launch
 * mockup. Logged-in users are sent straight to their home.
 */
// Everything the product actually does, the first thing a newcomer reads.
const OFFERINGS: { icon: string; title: string; desc: string }[] = [
  {
    icon: "tracker",
    title: "Application tracker",
    desc: "A document checklist per university - deadlines, uploads, progress.",
  },
  {
    icon: "award",
    title: "Real scholarships",
    desc: "Verified funding, updated regularly. No dead links.",
  },
  {
    icon: "test",
    title: "Test preparation",
    desc: "IELTS, TOEFL, GRE, what to take, where to register, how to prep.",
  },
  {
    icon: "plane",
    title: "Visa & embassy steps",
    desc: "I-20, SEVIS, DS-160, the interview, walked through in order.",
  },
  {
    icon: "people",
    title: "1-on-1 mentors",
    desc: "Ethiopians already studying abroad, reviewing your essays and plans.",
  },
  {
    icon: "card",
    title: "Fee payment help",
    desc: "No international card? We handle application and test fees for you.",
  },
];
function OfferIcon({ name }: { name: string }) {
  const c = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "tracker":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" {...c}>
          <path d="M9 11l3 3 8-8" />
          <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
        </svg>
      );
    case "award":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" {...c}>
          <circle cx="12" cy="8" r="5" />
          <path d="M8.2 12.5 7 21l5-3 5 3-1.2-8.5" />
        </svg>
      );
    case "test":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" {...c}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h4" />
        </svg>
      );
    case "plane":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" {...c}>
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      );
    case "people":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" {...c}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    default:
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" {...c}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      );
  }
}
export default function EntryPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(isAdmin ? "/admin" : "/home", { replace: true });
    }
  }, [isLoading, isAuthenticated, isAdmin, navigate]);
  if (isLoading) return <PageSpinner />;
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ── Identity panel ── */}
      <aside className="relative hidden flex-col overflow-hidden bg-gradient-to-b from-[#5C7E8F] to-[#26333B] p-10 lg:flex">
        {/* Faint dot texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        {/* The community, walking along the bottom edge */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-4 left-0 h-[26rem] w-full bg-[url('/community-sketch.png')] bg-[length:100%_auto] bg-left-bottom bg-no-repeat opacity-35 mix-blend-luminosity"
        />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-white">
            <img
              src="/logo-mark.jpeg"
              alt=""
              className="h-full w-full object-cover"
            />
          </span>
          <span className="text-lg font-black text-white">
            Ethio Mentor Group
          </span>
        </div>
        <div className="relative mt-14 max-w-lg">
          <h1 className="text-4xl font-black leading-tight text-white">
            Your Complete Student Visa Roadmap!
          </h1>
          <p className="mt-3 text-lg font-bold text-gold">
            Do It Yourself. We’ll Guide You Every Step of the Way.
          </p>
          <ul className="mt-8 space-y-4">
            {OFFERINGS.map((o) => (
              <li key={o.title} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
                  <OfferIcon name={o.icon} />
                </span>
                <span>
                  <span className="block text-[15px] font-black text-white">
                    {o.title}
                  </span>
                  <span className="block text-[13px] leading-snug text-white/60">
                    {o.desc}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-auto">
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} Ethio Mentor Group
          </p>
        </div>
      </aside>
      {/* ── Auth panel ── */}
      <main className="flex items-center justify-center bg-gradient-to-b from-[#D4DDE2]/50 to-white px-4 py-10">
        <div className="w-full max-w-md">
          {/* Mobile logo (the aside is hidden on small screens) */}
          <div className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
            <img
              src="/logo-mark.jpeg"
              alt=""
              className="h-10 w-10 rounded-xl object-cover"
            />
            <span className="text-lg font-black text-ink">
              Ethio Mentor Group
            </span>
          </div>
          <EntryAuthCard />
        </div>
      </main>
    </div>
  );
}
