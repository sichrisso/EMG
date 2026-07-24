import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useAuth } from "@/features/auth/hooks/useAuth";

const URGENT_WA = "https://chat.whatsapp.com/GoFxymNpwlG3VVgVEyvSqM";
const COMMUNITY_WA = "https://chat.whatsapp.com/ExIJUHVsNUOGrJrXhXW7uV";

// Questions a mentor actually runs into, not a student.
const MENTOR_FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "How does my application get approved?",
    a: "Our team reviews every mentor application personally, usually within 1–2 business days. You’ll see the status on the Become a mentor page, and your dashboard unlocks the moment you’re approved.",
  },
  {
    q: "How do student requests reach me?",
    a: (
      <>
        Students pick you from the Mentors page and choose one of your
        availability windows. Requests land in your{" "}
        <Link className="font-bold text-navy underline" to="/mentor/dashboard">
          dashboard
        </Link>{" "}
        under Pending, open one to read their message, profile snapshot, and any
        attached essay before you decide.
      </>
    ),
  },
  {
    q: "What happens when I approve a request?",
    a: "A meeting link is generated automatically and shared with both of you by email, with a reminder before the session. Completed sessions count toward your stats.",
  },
  {
    q: "How do impact points work?",
    a: "Impact points measure your contribution: completing a session earns +10, a 5-star rating +5, and welcoming a brand-new student +5. They cap at 400, and the count shows on your profile and your public mentor page.",
  },
  {
    q: "How do I control my workload?",
    a: (
      <>
        Two controls in your{" "}
        <Link className="font-bold text-navy underline" to="/profile">
          profile
        </Link>
        : the "Accepting students" toggle pauses new requests without hiding
        you, and the weekly session limit marks you as full once you hit it.
      </>
    ),
  },
  {
    q: "How do I post a scholarship or event?",
    a: (
      <>
        Submit scholarships from{" "}
        <Link className="font-bold text-navy underline" to="/resources">
          Resources
        </Link>{" "}
        and events from the{" "}
        <Link className="font-bold text-navy underline" to="/events">
          Events
        </Link>{" "}
        page. Both go live after admin verification; track yours under "My
        submissions" so pending posts never mix with the public list.
      </>
    ),
  },
  {
    q: "Where do I see reviews students left me?",
    a: (
      <>
        On your{" "}
        <Link className="font-bold text-navy underline" to="/profile">
          profile
        </Link>
        , under the Reviews tab, every rating and written comment from your
        completed sessions.
      </>
    ),
  },
];

/*
 * Frequently asked questions. Answers link into the product wherever the
 * product IS the answer, so this page doubles as onboarding.
 */
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is Ethio Mentor Group free?",
    a: "Yes, creating an account, tracking applications, browsing scholarships, and booking mentors are all free for students.",
  },
  {
    q: "Who are the mentors?",
    a: "Ethiopian students and professionals who already went through this process. Every mentor application is reviewed by our team before their profile appears.",
  },
  {
    q: "What does the impact points badge on a mentor mean?",
    a: "Impact points show how much a mentor has helped the community. A mentor earns points for every session they complete, extra when students rate them highly, and a bonus when they welcome someone brand new. The badge (out of 400) is a quick signal of an experienced, well-reviewed mentor, though a brand-new mentor with few points can be just as helpful, so use it as one hint among several rather than the whole story.",
  },
  {
    q: "How do mentorship sessions work?",
    a: (
      <>
        Browse mentors, pick a time from their availability, and send a request.
        When it's approved you both receive the same video link to join. Track
        everything under{" "}
        <Link className="font-bold text-navy underline" to="/mentors/requests">
          My requests
        </Link>
        .
      </>
    ),
  },
  {
    q: "What is the fee payment service?",
    a: (
      <>
        Many international fees (SEVIS, test registration, application fees)
        require cards that are hard to get in Ethiopia. Our US-based team can
        pay on your behalf; you repay in birr at a quote we confirm per request.
        Start from{" "}
        <Link className="font-bold text-navy underline" to="/services/fees">
          Services → Fee payment
        </Link>
        .
      </>
    ),
  },
  {
    q: "How does the application checklist work?",
    a: (
      <>
        Add a university under{" "}
        <Link className="font-bold text-navy underline" to="/journey">
          Journey
        </Link>{" "}
        and we generate the document checklist for your degree level
        automatically. Your progress saves as you go.
      </>
    ),
  },
  {
    q: "Are the scholarships real?",
    a: "Every scholarship is posted by an approved mentor or our team and reviewed by an admin before it appears publicly. Expired deadlines move to a closed section automatically.",
  },
  {
    q: "How do I become a mentor?",
    a: (
      <>
        Open your{" "}
        <Link className="font-bold text-navy underline" to="/profile">
          Profile
        </Link>{" "}
        and use "Become a mentor". Our team reviews applications within 1–2
        business days.
      </>
    ),
  },
  {
    q: "I found a problem or have a suggestion. Where do I send it?",
    a: (
      <>
        Send it to our admin WhatsApp group, that's the fastest way to reach the
        team directly:{" "}
        <a
          className="font-bold text-emerald-700 underline"
          href={URGENT_WA}
          target="_blank"
          rel="noopener noreferrer"
        >
          join the support group here
        </a>
        . You can also use{" "}
        <Link
          className="font-bold text-navy underline"
          to="/services/help?type=general"
        >
          Services → Request help
        </Link>{" "}
        if you prefer a written request.
      </>
    ),
  },
];

export default function FaqPage() {
  const { profile } = useAuth();
  const [open, setOpen] = useState<number | null>(0);
  const faqs = profile?.role === "mentor" ? MENTOR_FAQS : FAQS;
  return (
    <div className="pb-4">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="space-y-2">
          {faqs.map((f, i) => (
            <div key={f.q} className="card overflow-hidden">
              <button
                onClick={() => setOpen((o) => (o === i ? null : i))}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="font-bold text-ink">{f.q}</span>
                <span
                  className={cn(
                    "shrink-0 text-ink-subtle transition-transform",
                    open === i && "rotate-180",
                  )}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
              {open === i && (
                <div className="border-t border-surface-border px-5 py-4 text-sm leading-relaxed text-ink-muted">
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Need a human? */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <a
            href={URGENT_WA}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-card transition hover:shadow-md"
          >
            <p className="text-sm font-black text-ink">Need immediate help?</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Chat with our support team on WhatsApp
              <br />
              Mon to Fri, 9AM to 6PM (EAT)
            </p>
            <p className="mt-2 text-xs font-black text-emerald-700">
              Open WhatsApp →
            </p>
          </a>
          <a
            href={COMMUNITY_WA}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-3xl border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-sm transition hover:shadow-md"
          >
            <p className="text-sm font-black text-ink">Join the community</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Scholarships, deadlines, and wins, shared in our WhatsApp
              community.
            </p>
            <p className="mt-2 text-xs font-black text-navy">
              Join on WhatsApp →
            </p>
          </a>
        </div>
      </div>
    </div>
  );
}
