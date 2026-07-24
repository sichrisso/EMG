import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { qk } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { assertUpdated } from "@/lib/safeUpdate";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { EMBASSY_STEPS } from "@/types";

// Step-by-step instructions, expanded on demand so the checklist stays scannable.
const STEP_DETAILS: Record<number, string[]> = {
  1: [
    "After a university accepts you, confirm your intent to enroll, most schools have a button or short form for this.",
    "The school then issues your Form I-20 (US) through their international office; it usually arrives by email as a PDF within 1–3 weeks.",
    "Check every field: name spelled exactly as in your passport, correct program and dates. Report any error immediately, the embassy compares it letter by letter.",
    "Print it in color and sign it at the bottom of page 1.",
  ],
  2: [
    "Go to fmjfee.com (the official SEVIS I-901 site) and fill the form using the SEVIS ID printed on your I-20 (starts with N).",
    "Pay the $350 fee with an international card, if you do not have one, use our Fee payment service and we pay it for you.",
    "Download and print the payment confirmation; you must bring it to the interview.",
  ],
  3: [
    "The DS-160 is the online visa application at ceac.state.gov. Set aside 1–2 hours; it saves progress with an Application ID, write that ID down.",
    "Answer everything truthfully and consistently with your documents; inconsistencies cause refusals more often than weak answers do.",
    "The DS-160 is often the deciding factor at the embassy, how you filled it can pass or fail you. Strongly consider going over it with a mentor or booking a session with us before you submit.",
    "Upload a photo that meets the US visa photo rules (white background, no glasses).",
    "Submit, then print the confirmation page with the barcode.",
  ],
  4: [
    "Create an account on the US visa appointment site for Ethiopia (ustraveldocs.com), pay the MRV fee, and book the earliest interview slot at the US Embassy in Addis Ababa.",
    "Slots fill quickly before September intakes, book the moment your DS-160 is submitted.",
    "You will receive an appointment confirmation letter; print it.",
  ],
  5: [
    "Assemble a single folder in this order: passport, appointment letter, DS-160 confirmation, I-20 (signed), SEVIS receipt, admission letter, academic transcripts and certificates, English test score, and financial evidence (bank statements or sponsor letters covering year one).",
    "Practice answering three questions out loud: Why this university? Who is funding you? What will you do after graduating?",
    "Book a mock interview with a mentor who has passed the Addis embassy interview, it is the single highest-value hour of preparation.",
  ],
  6: [
    "Arrive at the embassy at least 30 minutes early with your folder; phones and bags are not allowed inside.",
    "The interview itself is usually 2–4 minutes at a window. Answer briefly, confidently, and honestly.",
    "If approved, the officer keeps your passport and it returns with the visa in roughly 3–7 working days.",
  ],
  7: [
    "Once your passport is back, check the visa: name, visa type (F-1), and expiration.",
    "Book your flight to arrive no earlier than 30 days before the program start date on your I-20.",
    "Carry your I-20 and admission letter in your hand luggage, you must show them at the US border, not in checked bags.",
  ],
};

const FEES = [
  {
    name: "SEVIS Fee (I-901)",
    amount: "$350 USD",
    when: "Before scheduling interview",
    canHelp: true,
  },
  {
    name: "MRV Visa Fee",
    amount: "~$185 USD",
    when: "When booking interview appointment",
    canHelp: true,
  },
  {
    name: "DS-160 application",
    amount: "Free",
    when: "Online, before interview",
    canHelp: false,
  },
  {
    name: "Passport photos",
    amount: "~200–500 ETB",
    when: "Before interview day",
    canHelp: false,
  },
  {
    name: "Document translations",
    amount: "Varies",
    when: "Before interview day",
    canHelp: false,
  },
];

export default function EmbassyPage() {
  const { userId, profile } = useAuth();
  const qc = useQueryClient();
  const [completedSteps, setCompletedSteps] = useState<number[]>(
    (profile as { embassy_steps?: number[] } | null)?.embassy_steps ?? [],
  );

  // Keep local state in sync when the profile finishes loading.
  useEffect(() => {
    const saved = (profile as { embassy_steps?: number[] } | null)
      ?.embassy_steps;
    if (saved) setCompletedSteps(saved);
  }, [profile]);

  // Persist every change so visa progress survives reloads and feeds the
  // journey tracker on the home page.
  const toggle = async (id: number) => {
    const next = completedSteps.includes(id)
      ? completedSteps.filter((x) => x !== id)
      : [...completedSteps, id];
    setCompletedSteps(next);
    if (!userId) return;
    try {
      await assertUpdated(
        supabase
          .from("profiles")
          .update({ embassy_steps: next })
          .eq("id", userId)
          .select("id"),
      );
      qc.invalidateQueries({ queryKey: qk.profile(userId) });
    } catch {
      setCompletedSteps(completedSteps); // revert on failure
    }
  };

  const progress = Math.round(
    (completedSteps.length / EMBASSY_STEPS.length) * 100,
  );

  return (
    <div className="pb-4">
      {/* Hero */}

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {/* Progress bar */}
        <div className="mb-8 card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-black text-ink">Your progress</span>
            <span className="text-sm font-black text-navy">
              {completedSteps.length}/{EMBASSY_STEPS.length} steps done
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-surface-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Check off steps as you complete them. Your progress is saved
            locally.
          </p>
        </div>

        {/* Steps */}
        <div className="mb-8">
          <h2 className="mb-5 text-xl font-black text-ink">
            Step-by-step visa process
          </h2>
          <div className="space-y-3">
            {EMBASSY_STEPS.map((step, i) => {
              const done = completedSteps.includes(step.id);
              return (
                <div
                  key={step.id}
                  className={cn(
                    "card p-5",
                    done && "border-emerald-200 bg-emerald-50/40",
                  )}
                >
                  <div className="flex items-start gap-4">
                    <button
                      onClick={() => toggle(step.id)}
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black transition",
                        done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-navy text-navy",
                      )}
                    >
                      {done ? "✓" : i + 1}
                    </button>
                    <div className="flex-1">
                      <h3
                        className={cn(
                          "font-black",
                          done ? "text-emerald-700 line-through" : "text-ink",
                        )}
                      >
                        {step.title}
                      </h3>
                      <p className="mt-1 text-sm text-ink-muted">{step.desc}</p>

                      {STEP_DETAILS[step.id] && (
                        <details className="mt-2 group/det">
                          <summary className="cursor-pointer list-none text-xs font-bold text-navy hover:underline">
                            <span className="group-open/det:hidden">
                              See detailed instructions
                            </span>
                            <span className="hidden group-open/det:inline">
                              Hide instructions
                            </span>
                          </summary>
                          <ol className="mt-2 space-y-1.5 rounded-xl border border-surface-border bg-cloud p-3 text-xs leading-relaxed text-ink-muted">
                            {STEP_DETAILS[step.id].map((line, idx) => (
                              <li key={idx} className="flex gap-2">
                                <span className="font-black text-navy">
                                  {idx + 1}.
                                </span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}

                      {step.docs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {step.docs.map((doc) => (
                            <span
                              key={doc}
                              className="rounded-full border border-surface-border bg-surface-soft px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted"
                            >
                              {doc}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {step.fee && (
                          <Link to="/fees">
                            <Button size="sm" variant="secondary">
                              Need help paying this fee?
                            </Button>
                          </Link>
                        )}
                        {step.mockInterview && (
                          <Link to="/services/mock-interview">
                            <Button size="sm">Request mock interview →</Button>
                          </Link>
                        )}
                        <Link to="/services/help?type=visa_guidance">
                          <Button size="sm" variant="ghost">
                            Ask a question
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Fee breakdown */}
        <div className="mb-8 card p-6">
          <h2 className="mb-4 text-lg font-black text-ink">Fee breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs font-black uppercase tracking-wide text-ink-muted">
                  <th className="pb-2 pr-4">Fee</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2 pr-4">When</th>
                  <th className="pb-2">We can help</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {FEES.map((f) => (
                  <tr key={f.name}>
                    <td className="py-2.5 pr-4 font-semibold text-ink">
                      {f.name}
                    </td>
                    <td className="py-2.5 pr-4 font-black text-navy">
                      {f.amount}
                    </td>
                    <td className="py-2.5 pr-4 text-ink-muted">{f.when}</td>
                    <td className="py-2.5">
                      {f.canHelp ? (
                        <Link
                          to="/fees"
                          className="text-xs font-bold text-emerald-600 hover:underline"
                        >
                          Yes, request here →
                        </Link>
                      ) : (
                        <span className="text-xs text-ink-subtle">, </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CTA */}
        <div className="card bg-navy p-6 text-black">
          <h2 className="text-lg font-black">
            Feeling nervous about your interview?
          </h2>
          <p className="mt-1 text-sm text-black/70">
            We offer 1-on-1 mock interviews with mentors who've been through the
            same process. They'll run you through real questions and give you
            honest feedback.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/services/mock-interview">
              <Button className="!bg-gold !text-navy">
                Book a mock interview
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
