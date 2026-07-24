import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import { assertUpdated } from "@/lib/safeUpdate";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { DEGREE_LABELS } from "@/types";
import type { DegreeLevel, Scholarship, ScholarshipType } from "@/types";

// ─── Config ────────────────────────────────────────────────────────────────
const TYPE_CFG: Record<ScholarshipType, { label: string; cls: string; tile: string }> = {
  full: { label: "Full scholarship", cls: "bg-emerald-50 text-emerald-700", tile: "bg-emerald-50 text-emerald-600" },
  partial: { label: "Partial", cls: "bg-[#E2E8F0] text-[#334155]", tile: "bg-[#E2E8F0] text-[#334155]" },
  loan: { label: "Loan", cls: "bg-[#E2E8F0] text-[#475569]", tile: "bg-[#E2E8F0] text-[#475569]" },
  grant: { label: "Grant", cls: "bg-[#5C7E8F]/15 text-[#334155]", tile: "bg-[#5C7E8F]/15 text-[#5C7E8F]" },
  other: { label: "Other", cls: "bg-slate-100 text-slate-600", tile: "bg-slate-100 text-slate-500" },
};

// One line icon per type for the tinted corner tile, cap, star, banknote…
function TypeIcon({ type }: { type: ScholarshipType }) {
  const c = { fill: "none", stroke: "currentColor", strokeWidth: 2,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "full":    return <svg width="20" height="20" viewBox="0 0 24 24" {...c}><path d="M22 10 12 5 2 10l10 5 10-5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></svg>;
    case "grant":   return <svg width="20" height="20" viewBox="0 0 24 24" {...c}><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>;
    case "partial": return <svg width="20" height="20" viewBox="0 0 24 24" {...c}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" /></svg>;
    case "loan":    return <svg width="20" height="20" viewBox="0 0 24 24" {...c}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7-1.1 1.5-2.5 1.8-2.5.8-2.5 1.8 1.1 1.7 2.5 1.7 2.5-.7 2.5-1.7" /></svg>;
    default:        return <svg width="20" height="20" viewBox="0 0 24 24" {...c}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
  }
}

// ─── Form schema ───────────────────────────────────────────────────────────
// Submissions go to admin review, so the essentials are mandatory:
// a real title/provider, a working official link, and a future deadline.
const schema = z.object({
  title: z.string().min(5, "Use the scholarship's full name"),
  provider: z.string().min(2, "Who offers it?"),
  type: z.enum(["full", "partial", "loan", "grant", "other"] as const),
  amount: z.string().optional(),
  description: z.string().min(30, "Describe who it's for and what it covers (30+ characters)"),
  deadline: z.string().min(1, "A deadline is required").refine(
    (d) => new Date(d) > new Date(),
    "Deadline must be in the future",
  ),
  link: z.string().url("The official link is required").min(8),
  eligible_levels: z.array(z.string()).min(1, "Select at least one level"),
});
type FormValues = z.infer<typeof schema>;

// ─── Data fetcher ──────────────────────────────────────────────────────────
async function fetchScholarships(): Promise<Scholarship[]> {
  // RLS shapes visibility: the public sees verified+active rows; posters
  // additionally see their own submissions while under review.
  const { data, error } = await supabase
    .from("scholarships")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Scholarship[];
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function ScholarshipsPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<ScholarshipType | "">("");
  const [filterLevel, setFilterLevel] = useState<DegreeLevel | "">("");
  const [sortBy, setSortBy] = useState<"newest" | "deadline">("deadline");
  const [showClosed, setShowClosed] = useState(false);
  const [mentorView, setMentorView] = useState<"all" | "mine">("all");
  const [visibleCount, setVisibleCount] = useState(9);

  const { data: scholarships = [], isLoading } = useQuery({
    queryKey: ["scholarships"],
    queryFn: fetchScholarships,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "full",
      eligible_levels: ["bachelor", "masters", "phd"],
    },
  });
  const selectedLevels = watch("eligible_levels") ?? [];

  const toggleLevel = (l: string) =>
    setValue(
      "eligible_levels",
      selectedLevels.includes(l)
        ? selectedLevels.filter((x) => x !== l)
        : [...selectedLevels, l],
      { shouldValidate: true },
    );

  const create = useMutation({
    mutationFn: async (v: FormValues) => {
      const { error } = await supabase.from("scholarships").insert({
        posted_by: profile!.id,
        title: v.title,
        provider: v.provider,
        type: v.type,
        amount: v.amount || null,
        description: v.description,
        deadline: v.deadline || null,
        link: v.link || null,
        eligible_levels: v.eligible_levels as DegreeLevel[],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scholarships"] });
      reset();
      setShowForm(false);
    },
  });

  const deleteScholarship = async (id: string) => {
    if (!confirm("Delete this scholarship?")) return;
    try {
      await assertUpdated(
        supabase.from("scholarships").delete().eq("id", id).select("id"),
      );
      qc.invalidateQueries({ queryKey: ["scholarships"] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const matchesFilters = (s: Scholarship) => {
    if (filterType && s.type !== filterType) return false;
    if (filterLevel && !s.eligible_levels.includes(filterLevel)) return false;
    return true;
  };
  const isClosed = (s: Scholarship) =>
    !!s.deadline && new Date(s.deadline).getTime() < Date.now();

  const mineUnderReview = scholarships.filter(
    (s) => s.posted_by === profile?.id && s.is_verified === false,
  );
  const openList = scholarships
    .filter((s) => s.is_verified !== false && !isClosed(s) && matchesFilters(s))
    .sort((a, b) =>
      sortBy === "newest"
        ? +new Date(b.created_at) - +new Date(a.created_at)
        : +new Date(a.deadline ?? "9999-12-31") - +new Date(b.deadline ?? "9999-12-31"),
    );
  const closedList = scholarships.filter(
    (s) => s.is_verified !== false && isClosed(s) && matchesFilters(s),
  );
  // Show the mentor their own under-review submissions as real cards at the
  // top of the list (not just the banner), followed by the open published set.
  const myPosts = scholarships.filter((s) => s.posted_by === profile?.id);

  // Mentors can flip between everything published and just their own posts.
  const isMentor = profile?.role === "mentor";
  const filtered =
    isMentor && mentorView === "mine"
      ? myPosts
      : openList.slice(0, visibleCount);

  return (
    <div className="pb-4">
      {/* Hero */}

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Filters + post button */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select
            value={filterType}
            onChange={(e) =>
              setFilterType(e.target.value as ScholarshipType | "")
            }
            className="!w-auto !rounded-xl !py-2 !text-sm"
          >
            <option value="">All types</option>
            {(Object.keys(TYPE_CFG) as ScholarshipType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_CFG[t].label}
              </option>
            ))}
          </select>

          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as DegreeLevel | "")}
            className="!w-auto !rounded-xl !py-2 !text-sm"
          >
            <option value="">All levels</option>
            {(["bachelor", "masters", "phd", "other"] as DegreeLevel[]).map(
              (l) => (
                <option key={l} value={l}>
                  {DEGREE_LABELS[l]}
                </option>
              ),
            )}
          </select>

          {profile?.role === "mentor" && (
            <div className="flex gap-1 rounded-xl border border-surface-border bg-white p-1">
              {([["all", "All scholarships"], ["mine", "My submissions"]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setMentorView(id)}
                  className={
                    mentorView === id
                      ? "rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white"
                      : "rounded-lg px-3 py-1.5 text-xs font-bold text-ink-muted hover:text-ink"
                  }>
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-1 rounded-xl border border-surface-border bg-white p-1">
            {([["deadline", "Deadline soon"], ["newest", "Recently added"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setSortBy(id)}
                className={
                  sortBy === id
                    ? "rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white"
                    : "rounded-lg px-3 py-1.5 text-xs font-bold text-ink-muted hover:text-ink"
                }>
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            {profile?.role === "mentor" && (
              <Button size="sm" onClick={() => setShowForm((s) => !s)}>
                {showForm ? "Cancel" : "+ Post a scholarship"}
              </Button>
            )}
          </div>
        </div>

        {/* Your submissions awaiting admin review */}
        {mineUnderReview.length > 0 && (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-bold">
              {mineUnderReview.length} of your scholarship
              {mineUnderReview.length > 1 ? "s are" : " is"} under review.
            </p>
            <p className="mt-0.5 text-xs text-amber-600">
              Our team checks every submission before it goes public, usually within a day.
            </p>
          </div>
        )}

        {/* Create form, mentors only */}
        {showForm && (
          <div className="mb-6 card p-6 animate-fade-up">
            <h2 className="mb-4 font-black text-ink">
              Post a scholarship or opportunity
            </h2>
            <form
              onSubmit={handleSubmit((v) => create.mutate(v))}
              className="space-y-4"
              noValidate
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Title"
                  placeholder="Fulbright Foreign Student Program"
                  {...register("title")}
                  error={errors.title?.message}
                />
                <Input
                  label="Provider / Organisation"
                  placeholder="U.S. Department of State"
                  {...register("provider")}
                  error={errors.provider?.message}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-ink">
                    Type
                  </label>
                  <select {...register("type")} className="!py-2.5 !text-sm">
                    {(Object.keys(TYPE_CFG) as ScholarshipType[]).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_CFG[t].label}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Amount (optional)"
                  placeholder="Full tuition + $15k/yr"
                  {...register("amount")}
                />
                <Input
                  label="Deadline (optional)"
                  type="date"
                  {...register("deadline")}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">
                  Description
                </label>
                <textarea
                  rows={3}
                  {...register("description")}
                  placeholder="Who it's for, what it covers, how to apply…"
                  className="resize-none"
                />
                {errors.description && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.description.message}
                  </p>
                )}
              </div>

              <Input
                label="Link (optional)"
                placeholder="https://…"
                {...register("link")}
                error={errors.link?.message}
              />

              <div>
                <label className="mb-2 block text-sm font-semibold text-ink">
                  Eligible degree levels
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    ["bachelor", "masters", "phd", "other"] as DegreeLevel[]
                  ).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => toggleLevel(l)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                        selectedLevels.includes(l)
                          ? "bg-navy text-white"
                          : "border border-surface-border text-ink-muted hover:border-navy/30",
                      )}
                    >
                      {DEGREE_LABELS[l]}
                    </button>
                  ))}
                </div>
                {errors.eligible_levels && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.eligible_levels.message}
                  </p>
                )}
              </div>

              {create.isError && (
                <p className="text-xs text-red-600">
                  {(create.error as Error).message}
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSubmitting || create.isPending}
                >
                  {create.isPending ? "Submitting…" : "Submit for review"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowForm(false);
                    reset();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-2xl border border-surface-border bg-white"
              />
            ))}
          </div>
        ) : filtered.length === 0 && mineUnderReview.length === 0 && !showForm ? (
          <div className="rounded-2xl border-2 border-dashed border-surface-border bg-white py-16 text-center">
            <p className="font-black text-ink">
              {filterType || filterLevel
                ? "No scholarships match these filters."
                : "No scholarships posted yet."}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
              {filterType || filterLevel
                ? "Try clearing a filter to see more."
                : profile?.role === "mentor"
                ? "You can submit one for our team to review, it'll appear here once approved."
                : "We're adding real scholarships regularly. Check back soon, or ask a mentor about funding for your field."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => {
              const cfg = TYPE_CFG[s.type];
              const daysLeft = s.deadline
                ? Math.ceil(
                    (new Date(s.deadline).getTime() - Date.now()) / 86_400_000,
                  )
                : null;
              const isOwn = s.posted_by === profile?.id;
              const underReview = s.is_verified === false;

              return (
                <div
                  key={s.id}
                  className="group flex flex-col rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  {/* Top row: type chip · days left · icon tile */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", cfg.cls)}>
                        {cfg.label}
                      </span>
                      {underReview && (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">
                          Under review
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {(s.click_count ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-xs font-bold text-blue-600" title="People who opened this scholarship">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                          {s.click_count}
                        </span>
                      )}
                      {daysLeft !== null && (
                        <span className={cn("text-xs font-bold",
                          daysLeft <= 0 ? "text-ink-muted line-through"
                            : daysLeft <= 14 ? "text-red-500" : "text-ink-muted")}>
                          {daysLeft > 0 ? `${daysLeft}d left` : "Closed"}
                        </span>
                      )}
                      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", cfg.tile)}>
                        <TypeIcon type={s.type} />
                      </span>
                      {isOwn && (
                        <button
                          onClick={() => deleteScholarship(s.id)}
                          className="rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-red-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="mt-3 text-lg font-black leading-snug text-ink">{s.title}</h3>
                  <p className="mt-0.5 text-xs font-semibold text-ink-muted">
                    {s.provider}
                  </p>
                  {s.amount && (
                    <p className="mt-1.5 text-sm font-black text-emerald-600">
                      {s.amount}
                    </p>
                  )}
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-muted line-clamp-4">
                    {s.description}
                  </p>

                  {/* Bottom row: levels left, CTA right */}
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {s.eligible_levels.map((l) => (
                        <span key={l}
                          className="rounded-full bg-surface-soft px-2.5 py-1 text-[10px] font-bold text-ink-muted ring-1 ring-surface-border">
                          {DEGREE_LABELS[l]}
                        </span>
                      ))}
                    </div>
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noopener noreferrer" className="shrink-0"
                        onClick={() => {
                          // Fire-and-forget interest counter; the page must never
                          // block a student from reaching the scholarship.
                          void supabase.rpc("increment_scholarship_click", { p_id: s.id });
                        }}>
                        <Button size="sm">Apply / Learn more ↗</Button>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {openList.length > visibleCount && (
          <div className="mt-6 text-center">
            <Button variant="secondary" onClick={() => setVisibleCount((c) => c + 9)}>
              Load more ({openList.length - visibleCount} remaining)
            </Button>
          </div>
        )}

        {/* Closed scholarships live apart so the main list stays actionable */}
        {closedList.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowClosed((v) => !v)}
              className="text-xs font-bold text-ink-muted transition hover:text-ink"
            >
              {showClosed ? "Hide" : "Show"} {closedList.length} closed scholarship
              {closedList.length > 1 ? "s" : ""}
            </button>
            {showClosed && (
              <div className="mt-3 space-y-2">
                {closedList.map((sch) => (
                  <div key={sch.id}
                    className="card flex flex-wrap items-center gap-3 p-4 opacity-60">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink line-through decoration-ink-subtle">
                        {sch.title}
                      </p>
                      <p className="truncate text-xs text-ink-muted">{sch.provider}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500">
                      Closed {sch.deadline && new Date(sch.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
