import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageSpinner } from "@/components/ui/Spinner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { SERVICE_TYPE_LABELS, SERVICE_TYPES } from "@/types";
import type { ServiceType } from "@/types";

const schema = z
  .object({
    service_type: z.enum(SERVICE_TYPES as [ServiceType, ...ServiceType[]]),
    title: z.string().min(5, "Give your request a short title"),
    description: z
      .string()
      .min(20, "Please describe what you need (at least 20 characters)"),
    preferred_date: z.string().optional(),
    preferred_time: z.string().optional(),
    // Fee-payment extras, validated only when that service type is chosen.
    amount_usd: z.coerce.number().optional(),
    recipient_name: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.service_type === "fee_payment") {
      if (!v.amount_usd || v.amount_usd <= 0 || v.amount_usd >= 100000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount_usd"],
          message: "Enter the fee amount in USD",
        });
      }
      if (!v.recipient_name || v.recipient_name.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recipient_name"],
          message: "Who should we pay? (e.g. ETS, SEVIS, the university)",
        });
      }
    }
  });
type FormValues = z.infer<typeof schema>;

export default function ServicesPage() {
  const [params] = useSearchParams();
  const { profile, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { service_type: "general" },
  });
  const selectedType = watch("service_type");

  // Pre-fill from URL params (e.g. ?type=fee_payment, ?type=ielts_prep).
  // Arriving from "Request fee payment" must land with fee_payment already
  // chosen and the extra fields revealed, the user shouldn't re-pick it.
  useEffect(() => {
    const type = params.get("type") as ServiceType | null;
    const prefill = params.get("prefill");
    if (type && (SERVICE_TYPES as string[]).includes(type)) {
      setValue("service_type", type, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    if (prefill) setValue("title", prefill);
  }, [params, setValue]);

  const create = useMutation({
    mutationFn: async (v: FormValues) => {
      if (v.service_type === "fee_payment") {
        // One form for everything: fee requests route into the fee_requests
        // table where the admin sets the authoritative birr quote.
        const { error } = await supabase.from("fee_requests").insert({
          mentee_id: profile!.id,
          fee_type: v.title,
          amount_usd: v.amount_usd,
          recipient_name: v.recipient_name,
          notes: v.description,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("service_requests").insert({
        mentee_id: profile!.id,
        service_type: v.service_type,
        title: v.title,
        description: v.description,
        preferred_date: v.preferred_date || null,
        preferred_time: v.preferred_time || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service_requests"] });
      qc.invalidateQueries({ queryKey: ["fee_requests"] });
      reset();
    },
  });

  if (authLoading) return <PageSpinner />;

  return (
    <div className="pb-4">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Two columns: the form, and what-happens-next reassurance */}
        <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-card backdrop-blur-sm animate-fade-up">
            <h2 className="mb-1 text-lg font-black text-ink">
              Submit a request
            </h2>
            <p className="mb-4 text-xs text-ink-muted">
              The more detail you give, the faster we can act on it.
            </p>
            <form
              onSubmit={handleSubmit((v) => create.mutate(v))}
              className="space-y-4"
              noValidate
            >
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">
                  Service type
                </label>
                <select
                  {...register("service_type")}
                  className="!py-2.5 !text-sm"
                >
                  {SERVICE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SERVICE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label={
                  selectedType === "fee_payment"
                    ? "Which fee is this?"
                    : "Short title for your request"
                }
                placeholder={
                  selectedType === "fee_payment"
                    ? "e.g. SEVIS I-901 fee, TOEFL registration"
                    : "e.g. Need help reviewing my Harvard SOP"
                }
                {...register("title")}
                error={errors.title?.message}
              />

              {/* Fee-payment extras: amount + payee feed the admin quote queue */}
              {selectedType === "fee_payment" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Amount (USD)"
                    type="number"
                    step="0.01"
                    placeholder="350"
                    {...register("amount_usd")}
                    error={errors.amount_usd?.message}
                  />
                  <Input
                    label="Who should we pay?"
                    placeholder="e.g. ETS, SEVIS, University of Toronto"
                    {...register("recipient_name")}
                    error={errors.recipient_name?.message}
                  />
                </div>
              )}
              {selectedType === "fee_payment" && (
                <p className="rounded-xl border border-surface-border bg-cloud px-3 py-2 text-xs text-ink-muted">
                  We pay in USD from the US and you repay in birr. Our team
                  confirms the exact birr quote on your request before anything
                  is paid, track it under Services → Fee payment.
                </p>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">
                  Tell us more{" "}
                  <span className="font-normal text-ink-muted">
                    (the more detail the better)
                  </span>
                </label>
                <textarea
                  rows={5}
                  {...register("description")}
                  placeholder="What exactly do you need? What stage are you at? Any deadlines? Upload any documents to the files section below…"
                  className="resize-none"
                />
                {errors.description && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.description.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              {create.isError && (
                <p className="text-xs text-red-600">
                  {(create.error as Error).message}
                </p>
              )}
              {create.isSuccess && (
                <p className="text-xs font-semibold text-emerald-600">
                  Request submitted. We'll be in touch soon.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSubmitting || create.isPending}
                >
                  {create.isPending ? "Submitting…" : "Submit request"}
                </Button>
              </div>
            </form>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-5">
            <a
              href="https://chat.whatsapp.com/GoFxymNpwlG3VVgVEyvSqM"
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-card transition hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#25D366] text-white shadow-sm">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15L2 22l5.15-1.5A9.93 9.93 0 1 0 12.04 2zm0 18.1a8.1 8.1 0 0 1-4.14-1.14l-.3-.18-3.05.9.9-2.98-.2-.31a8.13 8.13 0 1 1 6.79 3.71zm4.45-6.08c-.24-.12-1.44-.71-1.66-.79s-.39-.12-.55.12-.63.79-.77.95-.28.18-.53.06a6.65 6.65 0 0 1-1.95-1.2 7.33 7.33 0 0 1-1.35-1.68c-.14-.24 0-.37.1-.5s.24-.28.37-.42a1.66 1.66 0 0 0 .24-.4.45.45 0 0 0 0-.43c-.06-.12-.55-1.32-.75-1.8s-.4-.42-.55-.42h-.47a.9.9 0 0 0-.65.3 2.73 2.73 0 0 0-.85 2 4.74 4.74 0 0 0 1 2.52 10.9 10.9 0 0 0 4.17 3.68 14 14 0 0 0 1.39.51 3.35 3.35 0 0 0 1.54.1 2.52 2.52 0 0 0 1.65-1.17 2 2 0 0 0 .14-1.16c-.06-.12-.22-.18-.46-.3z" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-black text-ink">
                    Need immediate help?
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                    Chat with our team on WhatsApp
                    <br />
                    Mon to Fri, 9AM to 6PM (EAT)
                  </p>
                  <p className="mt-1.5 text-xs font-black text-emerald-700">
                    Open WhatsApp →
                  </p>
                </div>
              </div>
            </a>

            <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-card backdrop-blur-sm">
              <p className="text-center text-base font-black text-ink">
                What happens next?
              </p>
              <div className="mt-5 space-y-5">
                {[
                  {
                    title: "Pay in your own currency",
                    body: "No need to worry about exchange rates or hidden bank charges.",
                    icon: (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    ),
                  },
                  {
                    title: "15% processing fee",
                    body: "We handle the currency conversion for a flat, transparent 15% fee.",
                    icon: (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    ),
                  },
                  {
                    title: "We take care of the rest",
                    body: "Sit back while we process your transaction and finalize your request.",
                    icon: (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    ),
                  },
                ].map((step, i) => (
                  <div
                    key={step.title}
                    className={
                      i > 0 ? "border-t border-surface-border/60 pt-5" : ""
                    }
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0 text-navy">
                        {step.icon}
                      </span>
                      <div>
                        <p className="text-sm font-black text-ink">
                          {step.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                          {step.body}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
