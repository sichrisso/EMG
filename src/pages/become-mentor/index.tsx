import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageSpinner, Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { qk } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { MENTORSHIP_AREAS } from "@/types";

/*
 * /become-a-mentor, the "Personal information" application. One page for the
 * whole lifecycle: apply, then the same page shows your submission read-only
 * with its status, and lets you withdraw while it's still pending. Photo is
 * required (students choose mentors by face), areas are required, resume and
 * extra documents are optional.
 */

const LOCATIONS = [
  "USA",
  "Canada",
  "UK",
  "Germany",
  "Australia",
  "Netherlands",
  "Sweden",
  "Norway",
  "Finland",
  "Denmark",
  "France",
  "Italy",
  "Hungary",
  "Turkey",
  "China",
  "Japan",
  "South Korea",
  "UAE",
  "Saudi Arabia",
  "Ethiopia",
  "Other",
];
const YEARS = Array.from({ length: 2031 - 1990 }, (_, i) => 2030 - i);

const applySchema = z.object({
  current_location: z.string().min(1, "Select your location"),
  current_job: z.string().min(2, "Required"),
  university: z.string().min(2, "Required"),
  graduation_year: z.coerce
    .number({ invalid_type_error: "Select a year" })
    .min(1990)
    .max(2030),
  linkedin_url: z
    .string()
    .url("Enter a valid URL")
    .or(z.literal(""))
    .optional(),
  bio: z.string().min(20, "At least 20 characters").max(600),
});
type ApplyValues = z.infer<typeof applySchema>;

async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

async function uploadDoc(
  userId: string,
  file: File,
  kind: string,
): Promise<string> {
  const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
  const path = `${userId}/mentor-application/${kind}-${safe}`;
  const { error } = await supabase.storage
    .from("documents")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}

function FileDrop({
  label,
  hint,
  file,
  onPick,
}: {
  label: string;
  hint: string;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink">{label}</p>
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx"
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-surface-border bg-white/60 px-4 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-light text-navy">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          {file ? (
            <>
              <p className="truncate text-sm font-bold text-ink">{file.name}</p>
              <button
                type="button"
                onClick={() => onPick(null)}
                className="text-xs font-bold text-red-500 hover:underline"
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-ink">{hint}</p>
              <p className="text-xs text-ink-subtle">PDF or DOCX (max 5MB)</p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="shrink-0 text-sm font-bold text-blue-600 hover:underline"
        >
          Browse files
        </button>
      </div>
    </div>
  );
}

// ── Submitted view: status + read-only application + withdraw ────────────────
function SubmissionView() {
  const qc = useQueryClient();
  const { profile, mentorProfile, userId } = useAuth();

  const withdraw = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("mentor_profiles")
        .delete()
        .eq("user_id", profile!.id)
        .eq("status", "pending");
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) qc.invalidateQueries({ queryKey: qk.mentorProfile(userId) });
    },
  });

  // Clearing a declined application returns this page to the blank form.
  // The 7-day cooling-off period is enforced by the database, not here.
  const reapply = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("reapply_as_mentor");
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) qc.invalidateQueries({ queryKey: qk.mentorProfile(userId) });
    },
  });

  if (!mentorProfile) return <PageSpinner />;
  const mp = mentorProfile;

  const chip =
    mp.status === "approved"
      ? "bg-emerald-50 text-emerald-700"
      : mp.status === "rejected"
        ? "bg-red-50 text-red-600"
        : "bg-amber-50 text-amber-700";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-card backdrop-blur-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black text-ink">Your application</h2>
          <span
            className={cn("rounded-full px-3 py-1 text-xs font-bold", chip)}
          >
            {mp.status === "pending"
              ? "Under review"
              : mp.status === "approved"
                ? "Approved"
                : "Not approved"}
          </span>
        </div>

        {mp.status === "pending" && (
          <p className="mt-2 text-sm text-ink-muted">
            Our team reviews every application personally, usually within 1–2
            business days. You'll see the result right here.
          </p>
        )}
        {mp.status === "approved" && (
          <p className="mt-2 text-sm text-ink-muted">
            Welcome aboard. Your{" "}
            <Link
              to="/mentor/dashboard"
              className="font-bold text-navy hover:underline"
            >
              dashboard
            </Link>{" "}
            is live and students can now find you.
          </p>
        )}
        {mp.status === "rejected" && (
          <div className="mt-2 text-sm text-ink-muted">
            <p>
              Not this time, but this isn't final. Most applications that come
              back stronger get approved.
            </p>
            {mp.status_note && (
              <div className="mt-3 rounded-xl border border-surface-border bg-surface-soft px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gold-dark">
                  What our team said
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink">
                  {mp.status_note}
                </p>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                onClick={() => {
                  if (
                    confirm(
                      "Start a new application? This clears the declined one and opens a blank form.",
                    )
                  ) {
                    reapply.mutate();
                  }
                }}
                disabled={reapply.isPending}
              >
                {reapply.isPending ? (
                  <span className="flex items-center gap-2">
                    <Spinner className="h-4 w-4" /> Clearing…
                  </span>
                ) : (
                  "Apply again"
                )}
              </Button>
              <span className="text-xs text-ink-subtle">
                Available 7 days after the decision.
              </span>
            </div>
            {reapply.isError && (
              <p className="mt-2 text-xs text-red-600">
                {(reapply.error as Error).message}
              </p>
            )}
          </div>
        )}

        {/* Read-only submission */}
        <div className="mt-6 grid gap-x-8 gap-y-4 border-t border-surface-border/60 pt-6 sm:grid-cols-2">
          {[
            ["Current location", mp.current_location],
            ["Current job / role", mp.current_job],
            ["University", mp.university],
            [
              "Graduation year",
              mp.graduation_year ? String(mp.graduation_year) : "Not set",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-black uppercase tracking-widest text-gold-dark">
                {label}
              </p>
              <p className="mt-1 text-sm font-bold text-ink">{value}</p>
            </div>
          ))}
          <div className="sm:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gold-dark">
              Your journey (bio)
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
              {mp.bio}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gold-dark">
              Areas
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(mp.areas ?? []).map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-navy-light px-2.5 py-1 text-xs font-bold text-navy"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>

        {mp.status === "pending" && (
          <div className="mt-6 border-t border-surface-border/60 pt-5">
            <button
              onClick={() => {
                if (
                  confirm(
                    "Withdraw your mentor application? You can apply again anytime.",
                  )
                ) {
                  withdraw.mutate();
                }
              }}
              disabled={withdraw.isPending}
              className="text-sm font-bold text-red-500 transition hover:underline disabled:opacity-40"
            >
              {withdraw.isPending ? "Withdrawing…" : "Cancel my application"}
            </button>
            {withdraw.isError && (
              <p className="mt-1 text-xs text-red-600">
                {(withdraw.error as Error).message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Application form ─────────────────────────────────────────────────────────
function ApplicationForm() {
  const qc = useQueryClient();
  const { profile, userId } = useAuth();
  const [areas, setAreas] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [extraDoc, setExtraDoc] = useState<File | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const needsPhoto = !profile?.avatar_url;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApplyValues>({
    resolver: zodResolver(applySchema),
  });

  const apply = useMutation({
    mutationFn: async (v: ApplyValues) => {
      // Students choose mentors by face, a photo is part of the application.
      if (needsPhoto && !photo)
        throw new Error(
          "Add a profile photo, students choose mentors by face.",
        );

      if (photo) {
        const url = await uploadAvatar(profile!.id, photo);
        await supabase
          .from("profiles")
          .update({ avatar_url: url })
          .eq("id", profile!.id);
      }
      const resumeUrl = resume
        ? await uploadDoc(profile!.id, resume, "resume")
        : null;
      const extraUrl = extraDoc
        ? await uploadDoc(profile!.id, extraDoc, "extra")
        : null;

      const { error } = await supabase.from("mentor_profiles").insert({
        user_id: profile!.id,
        current_location: v.current_location,
        current_job: v.current_job,
        university: v.university,
        graduation_year: v.graduation_year,
        linkedin_url: v.linkedin_url || null,
        bio: v.bio,
        areas,
        resume_url: resumeUrl,
        extra_doc_url: extraUrl,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) {
        qc.invalidateQueries({ queryKey: qk.mentorProfile(userId) });
        qc.invalidateQueries({ queryKey: qk.profile(userId) });
      }
    },
  });

  const areasMissing = areas.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-card backdrop-blur-sm sm:p-8">
        <h2 className="text-xl font-black text-ink">Personal information</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Help us get to know you better.
        </p>

        <form
          onSubmit={handleSubmit((v) => apply.mutate(v))}
          className="mt-6 space-y-5"
          noValidate
        >
          {/* Photo (required when the account has none) */}
          {needsPhoto && (
            <div className="flex items-center gap-4 rounded-2xl bg-gold-soft/40 p-4">
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setPhoto(f);
                  setPhotoPreview(f ? URL.createObjectURL(f) : null);
                  e.target.value = "";
                }}
              />
              {photoPreview ? (
                <img
                  referrerPolicy="no-referrer"
                  src={photoPreview}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-white"
                />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-full bg-white text-ink-subtle ring-2 ring-white">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-ink">
                  Profile photo <span className="text-red-500">*</span>
                </p>
                <p className="text-xs text-ink-muted">
                  Students choose mentors by face, add a clear photo of you.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => photoRef.current?.click()}
              >
                {photo ? "Change" : "Upload"}
              </Button>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                Current location <span className="text-red-500">*</span>
              </label>
              <select
                {...register("current_location")}
                defaultValue=""
                className="rounded-xl border border-surface-border px-3 py-3 text-sm"
              >
                <option value="" disabled>
                  Select your current location
                </option>
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              {errors.current_location && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.current_location.message}
                </p>
              )}
            </div>
            <Input
              label="Current job / role *"
              placeholder="Enter your current job or role"
              {...register("current_job")}
              error={errors.current_job?.message}
            />
            <Input
              label="University / School *"
              placeholder="Enter your university or school"
              {...register("university")}
              error={errors.university?.message}
            />
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                Graduation year (or expected){" "}
                <span className="text-red-500">*</span>
              </label>
              <select
                {...register("graduation_year")}
                defaultValue=""
                className="rounded-xl border border-surface-border px-3 py-3 text-sm"
              >
                <option value="" disabled>
                  Select year
                </option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              {errors.graduation_year && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.graduation_year.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              LinkedIn URL
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded bg-[#0A66C2] text-[10px] font-black text-white">
                in
              </span>
              <input
                {...register("linkedin_url")}
                placeholder="https://linkedin.com/in/your-profile"
                className="!pl-12"
              />
            </div>
            {errors.linkedin_url && (
              <p className="mt-1 text-xs text-red-600">
                {errors.linkedin_url.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">
              Your journey (bio) <span className="text-red-500">*</span>
            </label>
            <p className="mb-2 text-xs text-ink-muted">
              Tell us about your background, what you're working on, and what
              you hope to give.
            </p>
            <textarea
              rows={5}
              {...register("bio")}
              className="resize-none"
              placeholder="Share your story…"
            />
            {errors.bio && (
              <p className="mt-1 text-xs text-red-600">{errors.bio.message}</p>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">
              Areas you can mentor <span className="text-red-500">*</span>
            </p>
            <p className="mb-2 text-xs text-ink-muted">Select all that apply</p>
            <div className="flex flex-wrap gap-2">
              {MENTORSHIP_AREAS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() =>
                    setAreas((prev) =>
                      prev.includes(a)
                        ? prev.filter((x) => x !== a)
                        : [...prev, a],
                    )
                  }
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    areas.includes(a)
                      ? "bg-navy text-white shadow-sm"
                      : "border border-surface-border bg-white text-ink-muted hover:border-navy/40 hover:text-ink",
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
            {areasMissing && (
              <p className="mt-2 text-xs font-semibold text-ink-subtle">
                Pick at least one area to submit.
              </p>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FileDrop
              label="Resume (optional)"
              hint="Upload your resume"
              file={resume}
              onPick={setResume}
            />
            <FileDrop
              label="Additional documents (optional)"
              hint="Upload document"
              file={extraDoc}
              onPick={setExtraDoc}
            />
          </div>

          {apply.isError && (
            <p className="text-sm text-red-600">
              {(apply.error as Error).message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" disabled={apply.isPending}>
              {apply.isPending ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" /> Submitting…
                </span>
              ) : (
                "Submit application"
              )}
            </Button>
            <Link to="/home">
              <Button type="button" variant="secondary">
                Maybe later
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BecomeMentorPage() {
  const { profile, mentorProfile, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <PageSpinner />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5C7E8F]/25 via-[#D4DDE2]/60 to-white pt-14">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-center text-4xl font-black tracking-tight text-ink">
          Become a mentor
        </h1>
        <div
          className="mx-auto mt-2 h-1 w-12 rounded-full bg-gold"
          aria-hidden
        />
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-ink-muted">
          Someone helped you get there. Be that someone, share your journey and
          guide the next student out into the world.
        </p>

        <div className="mt-8">
          {!isAuthenticated ? (
            <div className="mx-auto max-w-md rounded-3xl border border-gold/30 bg-gold-soft/40 p-8 text-center shadow-card">
              <h2 className="text-lg font-black text-ink">Sign in to apply</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
                Create an account or sign in, then come straight back here.
              </p>
              <Link to="/" className="mt-4 inline-block">
                <Button>Sign in to continue</Button>
              </Link>
            </div>
          ) : profile?.role === "mentor" || mentorProfile ? (
            <SubmissionView />
          ) : (
            <ApplicationForm />
          )}
        </div>
      </div>
    </div>
  );
}
