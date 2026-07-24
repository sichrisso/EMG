import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageSpinner, Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { startCheckout } from "@/features/payments/checkout";

/*
 * /services/mock-interview — the paid, EMG-run visa interview practice.
 * Mentors do not deliver these; every booking goes to the admin team.
 * Flow: pick a plan → describe your situation → pay → we schedule it.
 */

interface Plan {
  code: string;
  title: string;
  minutes: number;
  amount_cents: number;
  blurb: string;
  perks: string[];
  sort_order: number;
}

const money = (cents: number, currency = "ETB") =>
  new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);

// The four things that sink most visa interviews. Stated plainly, without
// scare tactics: a refusal is usually about preparation, not worthiness.
const PITFALLS = [
  {
    title: "An unclear story",
    body: "You know why you are going, but it comes out scattered under pressure. Officers decide fast, so the answer has to be clear in one or two sentences.",
  },
  {
    title: "Answers that contradict the DS-160",
    body: "A date, a job, or a sponsor that does not match what you filed reads as a red flag even when it is an honest slip.",
  },
  {
    title: "Shaky answers on money",
    body: "Who is paying, how much, and where it came from. Hesitating here is one of the most common reasons for a refusal.",
  },
  {
    title: "No ties to home",
    body: "You need to show what you are coming back to. Most students have a good answer, they have just never said it out loud.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Pick a plan",
    body: "Choose the length that fits how close your interview is and how much you want covered.",
  },
  {
    n: "2",
    title: "Tell us your situation",
    body: "Country, visa type, interview date, and what worries you. We prepare around your case, not a script.",
  },
  {
    n: "3",
    title: "Pay to confirm",
    body: "Your slot is held once payment clears. We schedule within 24 business hours and send the video link.",
  },
  {
    n: "4",
    title: "Practice, then get feedback",
    body: "A real rehearsal with someone who has been through it, followed by what to change before the day.",
  },
];

const bookingSchema = z.object({
  title: z.string().min(3, "Give your booking a short title"),
  description: z.string().min(20, "Tell us a bit more, at least 20 characters"),
  preferred_date: z.string().optional(),
  preferred_time: z.string().optional(),
});
type BookingValues = z.infer<typeof bookingSchema>;

export default function MockInterviewPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Plan | null>(null);
  const formRef = useRef<HTMLElement | null>(null);

  // Picking a plan reveals the form further down the page, which is easy to
  // miss on a laptop and invisible on a phone. Bring it into view.
  function choosePlan(plan: Plan) {
    setSelected(plan);
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["mock-interview-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mock_interview_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BookingValues>({ resolver: zodResolver(bookingSchema) });

  const book = useMutation({
    mutationFn: async (v: BookingValues) => {
      if (!selected) throw new Error("Pick a plan first.");

      // The request carries the details; it stays unassigned so it lands in
      // the admin queue rather than with a mentor.
      const { data: req, error: reqErr } = await supabase
        .from("service_requests")
        .insert({
          mentee_id: profile!.id,
          service_type: "mock_interview",
          title: v.title,
          description: v.description,
          preferred_date: v.preferred_date || null,
          preferred_time: v.preferred_time || null,
        })
        .select("id")
        .single();
      if (reqErr) throw reqErr;

      // The order's price is read from the catalogue server-side, so it can't
      // be tampered with from the browser.
      const { data: orderId, error: orderErr } = await supabase.rpc(
        "create_mock_interview_order",
        { p_plan_code: selected.code, p_request_id: req.id },
      );
      if (orderErr) throw orderErr;

      return startCheckout(orderId as string);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service_requests"] });
      qc.invalidateQueries({ queryKey: ["mock-interview-orders"] });
      reset();
    },
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
      {/* Why interviews go wrong */}
      <section>
        <h2 className="text-center text-xl font-black text-ink">
          Why students get refused
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-ink-muted">
          A refusal is rarely about whether you deserve to go. It is almost
          always preparation: a story that lands badly under pressure, or an
          answer that does not match your paperwork. All four of these are
          fixable in one session.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {PITFALLS.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-card backdrop-blur-md"
            >
              <p className="text-sm font-black text-ink">{p.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How the process works */}
      <section>
        <h2 className="text-center text-xl font-black text-ink">
          How it works
        </h2>
        <p className="mt-2 text-center text-sm text-ink-muted">
          Four steps, start to finish.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="rounded-2xl border border-white/60 bg-white/60 p-5 shadow-card backdrop-blur-md"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gold-soft text-sm font-black text-gold-dark">
                {step.n}
              </span>
              <p className="mt-3 text-sm font-black text-ink">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Plans */}
      <section>
        <h2 className="text-center text-2xl font-black text-ink">
          Choose your plan
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-ink-muted">
          A real interview rehearsal with someone who has sat across that
          window. Practice the answers, fix the gaps, walk in ready.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan, i) => {
            const featured = i === 1;
            const active = selected?.code === plan.code;
            return (
              <button
                key={plan.code}
                type="button"
                onClick={() => choosePlan(plan)}
                className={cn(
                  "relative rounded-3xl border p-6 text-left transition",
                  active
                    ? "border-gold bg-gold-soft/40 shadow-md"
                    : featured
                      ? "border-navy/30 bg-white shadow-card hover:shadow-md"
                      : "border-white/60 bg-white/60 shadow-card backdrop-blur-md hover:shadow-md",
                )}
              >
                {featured && !active && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-navy px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                    Most popular
                  </span>
                )}
                {active && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold px-3 py-1 text-[10px] font-black uppercase tracking-widest text-ink">
                    Selected
                  </span>
                )}

                <p className="text-center text-sm font-black text-ink">
                  {plan.title}
                </p>
                <p className="mt-2 text-center">
                  <span className="text-3xl font-black text-ink">
                    {money(plan.amount_cents)}
                  </span>
                  <span className="text-sm font-bold text-ink-muted">
                    {" "}
                    / {plan.minutes} min
                  </span>
                </p>
                <p className="mt-2 text-center text-xs leading-relaxed text-ink-muted">
                  {plan.blurb}
                </p>

                <ul className="mt-4 space-y-2">
                  {plan.perks.map((perk) => (
                    <li
                      key={perk}
                      className="flex items-start gap-2 text-xs text-ink-muted"
                    >
                      <svg
                        className="mt-0.5 shrink-0 text-emerald-600"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {perk}
                    </li>
                  ))}
                </ul>

                <span
                  className={cn(
                    "mt-5 block rounded-full py-2.5 text-center text-sm font-bold transition",
                    active
                      ? "bg-gold text-ink"
                      : featured
                        ? "bg-navy text-white"
                        : "border border-surface-border bg-white text-ink",
                  )}
                >
                  {active ? "Selected ✓" : `Choose ${plan.title}`}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      {/* Booking form, revealed once a plan is chosen */}
      {selected && (
        <section
          ref={formRef}
          className="scroll-mt-24 rounded-3xl border border-white/60 bg-white/60 p-6 shadow-card backdrop-blur-md sm:p-8"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-black text-ink">
              Tell us about your interview
            </h2>
            <p className="text-sm font-bold text-ink-muted">
              {selected.title} · {money(selected.amount_cents)} ·{" "}
              {selected.minutes} min
            </p>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            The more detail you give, the more useful the session is.
          </p>

          <form
            onSubmit={handleSubmit((v) => book.mutate(v))}
            className="mt-6 space-y-5"
            noValidate
          >
            <Input
              label="Short title for your booking *"
              placeholder="e.g. F-1 interview at the US Embassy, Addis"
              {...register("title")}
              error={errors.title?.message}
            />

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                Tell us more <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={5}
                {...register("description")}
                className="resize-none"
                placeholder="Which country and visa type? When is your interview? What worries you most? Anything about your DS-160 or funding we should know…"
              />
              {errors.description && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Preferred date (optional)"
                type="date"
                {...register("preferred_date")}
              />
              <Input
                label="Preferred time (optional)"
                type="time"
                {...register("preferred_time")}
              />
            </div>

            {book.isError && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {(book.error as Error).message}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={book.isPending}>
                {book.isPending ? (
                  <span className="flex items-center gap-2">
                    <Spinner className="h-4 w-4" /> Taking you to payment…
                  </span>
                ) : (
                  `Continue to payment · ${money(selected.amount_cents)}`
                )}
              </Button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-sm font-bold text-ink-subtle transition hover:text-ink"
              >
                Change plan
              </button>
            </div>

            <p className="text-xs text-ink-subtle">
              Pay with telebirr, CBE Birr, or any Ethiopian bank card. Your
              booking is confirmed once payment clears; we schedule within 24
              business hours and send the video link by email.
            </p>
          </form>
        </section>
      )}
      <p className="mx-auto mt-5 max-w-2xl rounded-2xl bg-navy/5 px-5 py-4 text-center text-xs leading-relaxed text-ink-muted">
        Sessions are run by the Ethio Mentor Group team, not by individual
        mentors. We cannot influence the embassy's decision and nobody can
        promise you a visa. What we can do is make sure you are not refused for
        a reason you could have fixed.
      </p>
    </div>
  );
}
