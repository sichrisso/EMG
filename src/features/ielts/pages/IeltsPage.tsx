import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/*
 * Test preparation. One selector, one detail panel, one coaching button ,
 * rather than six near-identical cards each repeating the same two actions.
 * Registration always points at the official operator; we never take that fee.
 */

interface TestOption {
  id: string;
  name: string;
  fullName: string;
  cost: string;
  duration: string;
  validFor: string;
  useCase: string;
  goodToKnow: string[];
  registerUrl: string;
  mentorArea: string;
}

const TESTS: TestOption[] = [
  {
    id: "ielts",
    name: "IELTS",
    fullName: "International English Language Testing System",
    cost: "~$215–255",
    duration: "2h 45m",
    validFor: "2 years",
    useCase:
      "The widest acceptance of any English test, the UK, Canada, Australia, and most US programs.",
    goodToKnow: [
      "Academic version is the one universities want (not General Training).",
      "Speaking is face-to-face with a real examiner, on a separate day at some centres.",
      "Most programs ask for an overall 6.5, with no band under 6.0.",
    ],
    registerUrl: "https://ethiopia.britishcouncil.org/exam/ielts",
    mentorArea: "English Test Prep",
  },
  {
    id: "toefl",
    name: "TOEFL iBT",
    fullName: "Test of English as a Foreign Language",
    cost: "~$195–245",
    duration: "~2h",
    validFor: "2 years",
    useCase:
      "Preferred by many US universities. Entirely computer-based, including the speaking section.",
    goodToKnow: [
      "You speak into a microphone, not to a person, practice with a timer.",
      "Scored out of 120; competitive programs look for 90–100+.",
      "Scores are typically released in 4–8 days.",
    ],
    registerUrl: "https://www.ets.org/toefl.html",
    mentorArea: "English Test Prep",
  },
  {
    id: "duolingo",
    name: "Duolingo English Test",
    fullName: "Duolingo English Test",
    cost: "~$65",
    duration: "~1h",
    validFor: "2 years",
    useCase:
      "The cheapest and fastest option, taken from home. Accepted by 5,000+ institutions, but check yours first.",
    goodToKnow: [
      "You need a quiet room, a webcam, and a stable connection.",
      "Results usually arrive within 48 hours.",
      "Scored out of 160; roughly 115–120 maps to IELTS 6.5–7.0.",
    ],
    registerUrl: "https://englishtest.duolingo.com/applicants",
    mentorArea: "English Test Prep",
  },
  {
    id: "sat",
    name: "SAT",
    fullName: "Scholastic Assessment Test",
    cost: "~$103 (international)",
    duration: "~2h 15m",
    validFor: "5 years",
    useCase:
      "Undergraduate admissions in the US. Many schools are now test-optional, check before you pay.",
    goodToKnow: [
      "Now fully digital and adaptive, taken at a test centre.",
      "Scored out of 1600; strong applicants aim for 1350+.",
      "Register early, Addis Ababa seats are limited.",
    ],
    registerUrl: "https://satsuite.collegeboard.org/sat/registration",
    mentorArea: "University Selection",
  },
  {
    id: "gre",
    name: "GRE",
    fullName: "Graduate Record Examinations",
    cost: "~$220",
    duration: "~1h 58m",
    validFor: "5 years",
    useCase:
      "Master's and PhD programs, mostly in the US. Many programs have dropped it, verify before studying.",
    goodToKnow: [
      "Sections: verbal, quantitative, and analytical writing.",
      "Quant matters most for engineering and science programs.",
      "You see unofficial scores immediately after the test.",
    ],
    registerUrl:
      "https://www.ets.org/gre/test-takers/general-test/register.html",
    mentorArea: "University Selection",
  },
  {
    id: "gmat",
    name: "GMAT",
    fullName: "Graduate Management Admission Test",
    cost: "~$275–300",
    duration: "~2h 15m",
    validFor: "5 years",
    useCase: "MBA and business master’s programs worldwide.",
    goodToKnow: [
      "The Focus Edition is the current version, study for that one.",
      "Scored 205–805; top programs look for 645+.",
      "You can choose which scores to send to schools.",
    ],
    registerUrl: "https://www.mba.com/exams/gmat-exam/register",
    mentorArea: "University Selection",
  },
];

const STEPS = [
  {
    title: "Choose which test to take",
    detail:
      "Check the admission page of every university on your list, most name the tests and minimum scores they accept. Pick the one that appears on all of them, or the cheapest that does.",
  },
  {
    title: "Register on the official website",
    detail:
      "Use the register button below. Book 4–8 weeks ahead: Addis Ababa test-centre seats fill quickly, especially before September intakes.",
  },
  {
    title: "Prepare, free materials, plus a mentor if you want one",
    detail:
      "Every operator publishes free practice tests on the same official site. If you want a human, request coaching from a mentor who sat the exact test you’re taking.",
  },
  {
    title: "Take the test and send your scores",
    detail:
      "Scores arrive in 2–13 days depending on the test. Send them from your official test account, most tests include a few free score reports if you designate schools early.",
  },
];

export default function IeltsPage() {
  const [selectedId, setSelectedId] = useState(TESTS[0].id);
  const test = TESTS.find((t) => t.id === selectedId)!;

  return (
    <div className="pb-4">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Plan */}
        <div className="card p-6">
          <h2 className="text-lg font-black text-ink">Your test plan</h2>
          <div className="mt-4 space-y-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex gap-4">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy text-sm font-black text-white">
                  {i + 1}
                </div>
                <div>
                  <p className="font-bold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                    {s.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* One selector, one panel */}
        <h2 className="mb-3 mt-8 text-lg font-black text-ink">
          Pick your test
        </h2>

        <div className="flex flex-wrap gap-2">
          {TESTS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-bold transition",
                t.id === selectedId
                  ? "bg-navy text-white"
                  : "border border-surface-border bg-white text-ink-muted hover:border-navy/30 hover:text-ink",
              )}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="card mt-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-ink">{test.name}</h3>
              <p className="text-xs text-ink-subtle">{test.fullName}</p>
            </div>
            <div className="flex gap-5 text-right">
              {[
                { k: "Cost", v: test.cost },
                { k: "Length", v: test.duration },
                { k: "Valid for", v: test.validFor },
              ].map((item) => (
                <div key={item.k}>
                  <p className="text-[10px] font-black uppercase tracking-wide text-ink-subtle">
                    {item.k}
                  </p>
                  <p className="text-sm font-bold text-ink">{item.v}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            {test.useCase}
          </p>

          <div className="mt-4 rounded-2xl border border-surface-border bg-cloud p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-ink-subtle">
              Good to know
            </p>
            <ul className="mt-2 space-y-1.5">
              {test.goodToKnow.map((line) => (
                <li key={line} className="flex gap-2 text-sm text-ink-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={test.registerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button>Register for {test.name}, official site</Button>
            </a>
            <Link to={`/mentors?area=${encodeURIComponent(test.mentorArea)}`}>
              <Button variant="secondary">
                Request coaching for {test.name}
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-subtle">
            If you don’t have an international card to pay with, check out our{" "}
            <Link
              to="/services/fees"
              className="font-bold text-navy hover:underline"
            >
              fee payment service
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
