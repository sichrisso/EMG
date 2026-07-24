import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';

/*
 * /how-it-works, the complete manual. Every feature, in the order a person
 * meets it, with exact instructions for what to press and what happens next.
 * Students and mentors see the sections relevant to their role first.
 */

interface Guide { title: string; to: string; steps: string[] }

const STUDENT_GUIDES: Guide[] = [
  {
    title: 'Application tracker',
    to: '/journey',
    steps: [
      'Press "+ Add university" and pick the school, country, program, degree level, and deadline.',
      'We generate a document checklist for that university automatically, transcripts, letters, essays, test scores, passport, financial documents.',
      'Tap the circle on any item to move it: Not started → In progress → Done.',
      'Press "Upload" on an item to attach the actual document (PDF, Word, or a photo). Your mentor can review what you upload.',
      'Add anything your university asks for with "Add a requirement"; remove items via the ⋯ menu.',
      'The progress ring and header stats update as you go. Change the application status (Planning → In progress → Submitted → Accepted) from the dropdown at the top.',
    ],
  },
  {
    title: 'Finding a mentor & booking sessions',
    to: '/mentors',
    steps: [
      'Browse mentors by area (English test prep, essays, visa prep…) or search by name, city, school, or expertise.',
      'Open "View profile" to read their story, check their availability windows, and see reviews from other students.',
      'Press "Request 1-on-1 mentorship", pick your topics, write what you need, and choose one of their time windows.',
      'If your request involves an essay or SOP, attach the document right in the request so they arrive prepared.',
      'Track everything under Mentors → My requests. When a mentor approves, you get a meeting link there.',
      'After a session, rate it and leave feedback, reviews help other students choose.',
    ],
  },
  {
    title: 'Scholarships',
    to: '/resources',
    steps: [
      'Every scholarship is verified before it appears. Filter by type (full, partial, grant, loan) and degree level.',
      'Sort by "Deadline soon" to catch closing windows; the days-left counter turns red under two weeks.',
      '"Apply / Learn more" takes you to the official page. The eye counter shows how many students opened it.',
    ],
  },
  {
    title: 'Test prep (IELTS, TOEFL, GRE…)',
    to: '/resources/ielts',
    steps: [
      'Pick your test to see format, scoring, costs, and a preparation plan.',
      'Register only through the official links we list, they go to the British Council, ETS, and Duolingo directly.',
      'Mark your test score as Done in your application checklist once results arrive.',
    ],
  },
  {
    title: 'Visa & embassy',
    to: '/resources/embassy',
    steps: [
      'Follow the steps in order: I-20, SEVIS fee, DS-160, appointment, document folder, interview.',
      'Check off each step, your progress is saved to your profile and feeds your journey road on the home page.',
      'The DS-160 can decide your interview: book a session with a mentor to review it before submitting.',
    ],
  },
  {
    title: 'Services & fee payment',
    to: '/services',
    steps: [
      'No international card? Open Services → Fee payment, tell us which fee (application, SEVIS, test registration), and we pay it for you.',
      'For anything else, use Request help, we respond within 24 business hours.',
      'Urgent? Use the WhatsApp card on the Services page (Mon–Fri, 9AM–6PM EAT).',
    ],
  },
  {
    title: 'Events & workshops',
    to: '/events',
    steps: [
      'Mentors host live workshops, webinars, and Q&A sessions, all free.',
      'Press "Register" on any upcoming event; the meeting link is on the event card.',
    ],
  },
];

const MENTOR_GUIDES: Guide[] = [
  {
    title: 'Your dashboard',
    to: '/mentor/dashboard',
    steps: [
      'Student requests land in Pending. Open one to read their message, profile snapshot, and any attached documents.',
      'Approve to schedule it (a meeting link is generated automatically) or decline with a note.',
      'Your weekly capacity bar shows booked vs available sessions. Set the limit in your profile.',
      'The "Accepting students" toggle pauses new requests without hiding your profile.',
    ],
  },
  {
    title: 'Availability',
    to: '/mentor/dashboard',
    steps: [
      'Add weekly time windows (day + start/end, East Africa Time) so students book slots that work for you.',
      'Students pick one of your windows when they request a session.',
    ],
  },
  {
    title: 'Posting scholarships & events',
    to: '/resources',
    steps: [
      'Submit scholarships you know are real; our team verifies before they go live.',
      'Host workshops or webinars from the Events page, they appear to students after admin approval.',
      'Track your submissions separately under "My submissions" so your pending posts never mix with the public list.',
    ],
  },
  {
    title: 'Impact points & levels',
    to: '/profile',
    steps: [
      'Every completed session earns +10 points; a 5-star rating +5; welcoming a new student +5.',
      'Points build your level, Rising Mentor to Legend, shown on your profile.',
      'Reviews students write after sessions appear on your profile\u2019s Reviews tab.',
    ],
  },
];

export default function HowItWorksPage() {
  const { profile } = useAuth();
  const isMentor = profile?.role === 'mentor';
  const primary = isMentor ? MENTOR_GUIDES : STUDENT_GUIDES;
  const secondary = isMentor ? STUDENT_GUIDES : MENTOR_GUIDES;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5C7E8F]/25 via-[#D4DDE2]/60 to-white pt-14">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-4xl font-black tracking-tight text-ink">How it works</h1>
        <div className="mt-2 h-1 w-12 rounded-full bg-gold" aria-hidden />
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">
          Everything you can do here, feature by feature, exactly what to
          press and what happens next.
        </p>

        <div className="mt-8 space-y-5">
          {primary.map((g, i) => (
            <section key={g.title} className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card backdrop-blur-sm">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-black text-ink">
                  <span className="mr-2 text-gold">{String(i + 1).padStart(2, '0')}</span>
                  {g.title}
                </h2>
                <Link to={g.to} className="shrink-0 text-sm font-bold text-navy hover:underline">
                  Open →
                </Link>
              </div>
              <ol className="mt-4 space-y-2.5">
                {g.steps.map((step, j) => (
                  <li key={j} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold-soft text-[10px] font-black text-gold-dark">
                      {j + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <details className="mt-8 rounded-3xl border border-white/70 bg-white/70 p-6 shadow-card backdrop-blur-sm">
          <summary className="cursor-pointer text-sm font-black text-ink">
            {isMentor ? 'What students can do' : 'What mentors can do'}
          </summary>
          <div className="mt-4 space-y-4">
            {secondary.map(g => (
              <div key={g.title}>
                <p className="text-sm font-black text-ink">{g.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{g.steps[0]}</p>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
