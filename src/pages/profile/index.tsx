import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageSpinner, Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { qk } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { assertUpdated } from "@/lib/safeUpdate";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { MENTORSHIP_AREAS } from "@/types";

/*
 * /profile, the light profile layout: photo card + current-status card on the
 * left; tabs and content on the right. View mode reads like a page someone
 * would be proud to share; Edit mode swaps the right side for the form.
 * Mentees and mentors get the same shell with role-appropriate content.
 */


// ─── Avatar picker, preview only, no upload until Save ───────────────────
function AvatarPicker({
  currentUrl,
  name,
  onFileSelected,
}: {
  currentUrl: string | null;
  name: string;
  onFileSelected: (file: File | null, previewUrl: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [broken, setBroken] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    setPreview(currentUrl);
    setBroken(false);
    setHasNew(false);
  }, [currentUrl]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErr("Image must be under 2MB");
      return;
    }
    setErr(null);
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setHasNew(true);
    onFileSelected(file, localUrl);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const initials = name
    .trim()
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        {preview && !broken ? (
          <img
            referrerPolicy="no-referrer"
            src={preview}
            alt={name}
            onError={() => setBroken(true)}
            className={cn(
              "h-20 w-20 rounded-full object-cover ring-2 transition",
              hasNew ? "ring-gold" : "ring-surface-border",
            )}
          />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-full bg-navy text-2xl font-black text-white">
            {initials}
          </div>
        )}
        {hasNew && (
          <div className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-gold px-1.5 py-0.5 text-[9px] font-black text-navy">
            NEW
          </div>
        )}
      </div>
      <div>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          onClick={() => inputRef.current?.click()}
        >
          {preview ? "Change photo" : "Upload photo"}
        </Button>
        <p className="mt-1 text-xs text-ink-subtle">
          JPG, PNG or WEBP · max 2MB
          {hasNew && (
            <span className="ml-2 font-semibold text-gold">
              · Unsaved, click Save changes
            </span>
          )}
        </p>
        {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}

// ─── Upload helper (called at save time) ──────────────────────────────────
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


export function ImpactLevelChip({ userId, showNew = false }: { userId: string; showNew?: boolean }) {
  const { data } = useQuery({
    queryKey: qk.mentorPoints(userId),
    queryFn: async () => {
      const [{ data: total }, { data: milestones }] = await Promise.all([
        supabase.rpc("get_mentor_impact", { p_user_id: userId }),
        supabase.from("point_milestones").select("points, title, badge_color").order("points"),
      ]);
      const pointsTotal = (total as number | null) ?? 0;
      const earned = (milestones ?? []).filter(
        (m: { points: number }) => m.points <= pointsTotal,
      );
      const level = earned.length > 0
        ? (earned[earned.length - 1] as { title: string; badge_color: string })
        : undefined;
      return { total: pointsTotal, level };
    },
    enabled: !!userId,
  });

  if (!data) return null;
  if (data.total === 0) {
    if (!showNew) return null;
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-bold text-ink-muted"
        title="This mentor has not earned impact points yet. Impact points come from completed sessions and student ratings."
      >
        New mentor · 0/400 impact
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white"
      style={{ backgroundColor: data.level?.badge_color ?? "#334155" }}
      title="Impact points from completed sessions and student ratings. 400 is the cap."
    >
      Impact points · {Math.min(data.total, 400)}/400
    </span>
  );
}


// ── Shared vocabulary ────────────────────────────────────────────────────────
export const JOURNEY_STAGES = [
  { id: "exploring", label: "Exploring options" },
  { id: "documents", label: "Preparing documents" },
  { id: "testing",   label: "Studying for tests" },
  { id: "applying",  label: "Applying to universities" },
  { id: "waiting",   label: "Waiting on decisions" },
  { id: "accepted",  label: "Accepted, preparing visa" },
  { id: "visa",      label: "Visa process" },
] as const;

const DEGREE_LABELS: Record<string, string> = {
  bachelor: "Bachelor's", masters: "Master's", phd: "PhD", other: "Other",
};

const HELP_TOPICS = [
  "Application strategy", "SOP & Essays", "Interview preparation",
  "Scholarship search", "Career guidance", "Test prep", "Visa process",
];
const LANGUAGE_OPTIONS = ["Amharic", "English", "Oromo", "Tigrinya", "French", "Arabic"];

type RichProfile = {
  journey_stage?: string | null;
  target_degree?: string | null;
  about?: string | null;
  goals?: string | null;
  help_topics?: string[] | null;
  languages?: string[] | null;
  phone?: string | null;
  created_at?: string;
};

// ── Small layout atoms ───────────────────────────────────────────────────────
function SideCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-3xl border border-white/60 bg-white/60 p-5 shadow-card backdrop-blur-md", className)}>
      {children}
    </div>
  );
}

function StatusRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-surface-border/60 py-2.5 last:border-0">
      <span className="text-sm font-semibold text-ink-muted">{label}</span>
      <span className={cn("text-sm font-black", value === "Not set" ? "text-ink-subtle" : highlight ? "text-emerald-600" : "text-ink")}>
        {value}
      </span>
    </div>
  );
}

function ChipRow({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-ink-subtle">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(t => (
        <span key={t} className="rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-ink shadow-sm ring-1 ring-surface-border">
          {t}
        </span>
      ))}
    </div>
  );
}

function ToggleChips({ options, value, onChange }: {
  options: string[]; value: string[]; onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button key={o} type="button"
          onClick={() => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o])}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-bold transition",
            value.includes(o)
              ? "bg-navy text-white shadow-sm"
              : "bg-white text-ink-muted ring-1 ring-surface-border hover:text-ink",
          )}>
          {o}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-black text-ink">{children}</h3>;
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5C7E8F]/25 via-[#D4DDE2]/60 to-white pt-14">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}

// ── Mentee profile ───────────────────────────────────────────────────────────
const menteeSchema = z.object({
  first_name: z.string().min(1, "Required"),
  last_name: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  journey_stage: z.string().optional(),
  target_degree: z.string().optional(),
  about: z.string().max(500).optional(),
  goals: z.string().max(500).optional(),
});
type MenteeValues = z.infer<typeof menteeSchema>;

function MenteeProfile() {
  const qc = useQueryClient();
  const { profile, userId } = useAuth();
  const [editing, setEditing] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [helpTopics, setHelpTopics] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);

  const rich = (profile ?? {}) as RichProfile;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<MenteeValues>({
    resolver: zodResolver(menteeSchema),
  });

  useEffect(() => {
    if (profile) {
      reset({
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
        country: profile.country ?? "",
        phone: rich.phone ?? "",
        journey_stage: rich.journey_stage ?? "",
        target_degree: rich.target_degree ?? "",
        about: rich.about ?? "",
        goals: rich.goals ?? "",
      });
      setHelpTopics(rich.help_topics ?? []);
      setLanguages(rich.languages ?? []);
      setAvatarFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, reset]);

  const save = useMutation({
    mutationFn: async (v: MenteeValues) => {
      let avatarUrl = profile!.avatar_url;
      if (avatarFile) {
        setUploading(true);
        avatarUrl = await uploadAvatar(profile!.id, avatarFile);
        setUploading(false);
      }
      await assertUpdated(
        supabase.from("profiles").update({
          first_name: v.first_name.trim(),
          last_name: v.last_name?.trim() || "",
          country: v.country || null,
          phone: v.phone || null,
          journey_stage: v.journey_stage || null,
          target_degree: v.target_degree || null,
          about: v.about || null,
          goals: v.goals || null,
          help_topics: helpTopics,
          languages,
          avatar_url: avatarUrl,
        }).eq("id", profile!.id).select("id"),
      );
    },
    onSuccess: () => {
      if (userId) qc.invalidateQueries({ queryKey: qk.profile(userId) });
      setEditing(false);
      setAvatarFile(null);
    },
  });

  // The stage mirrors the journey road, computed, never hand-picked.
  const { data: stageApps = [] } = useQuery({
    queryKey: ["profile-stage-apps"],
    queryFn: async () => {
      const { data } = await supabase.from("applications").select("id, status");
      return (data ?? []) as { id: string; status: string }[];
    },
  });
  const { data: stageSignals } = useQuery({
    queryKey: ["profile-stage-mats", stageApps.map(a => a.id).join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("application_materials")
        .select("name, status")
        .in("application_id", stageApps.map(a => a.id))
        .eq("status", "done");
      const rows = (data ?? []) as { name: string }[];
      return {
        anyDone: rows.length > 0,
        testDone: rows.some(r => (r.name.toLowerCase().includes("test score") || r.name.toLowerCase().includes("test result"))),
      };
    },
    enabled: stageApps.length > 0,
  });
  const { data: requestCount = 0 } = useQuery({
    queryKey: ["profile-request-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("service_requests")
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  if (!profile) return <PageSpinner />;

  const embassySteps = (profile as { embassy_steps?: number[] }).embassy_steps ?? [];
  let reached = 0;
  if (stageApps.length > 0) reached = 1;
  if (reached === 1 && stageSignals?.anyDone) reached = 2;
  if (reached >= 2 && stageSignals?.testDone) reached = 3;
  if (reached >= 2 && stageApps.some(a => a.status === "submitted" || a.status === "accepted")) reached = 4;
  if (reached >= 4 && stageApps.some(a => a.status === "accepted")) reached = 5;
  if (reached >= 5 && embassySteps.includes(7)) reached = 6;
  const stageLabel = [
    "Getting started", "Preparing documents", "Studying for tests",
    "Applying", "Waiting on decisions", "Accepted, preparing visa",
    "Visa in hand",
  ][reached];
  const memberSince = rich.created_at
    ? new Date(rich.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <PageShell>
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── Left column ── */}
        <div className="space-y-5">
          <SideCard className="text-center">
            <div className="mx-auto w-fit">
              <AvatarPicker
                currentUrl={profile.avatar_url ?? null}
                name={`${profile.first_name} ${profile.last_name}`}
                onFileSelected={(f) => { setAvatarFile(f); setEditing(true); }}
              />
            </div>
            <h1 className="mt-4 text-xl font-black text-ink">
              {profile.first_name} {profile.last_name}
            </h1>
            <p className="text-sm text-ink-muted">Student</p>

            <div className="mt-4 space-y-2 border-t border-surface-border/60 pt-4 text-left text-sm text-ink-muted">
              <p className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {profile.country || "Add your country"}
              </p>
              {memberSince && (
                <p className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                  Member since {memberSince}
                </p>
              )}
            </div>

            <Button className="mt-4 w-full" onClick={() => setEditing(e => !e)}>
              {editing ? "Cancel editing" : "Edit profile"}
            </Button>
          </SideCard>

          <SideCard>
            <h2 className="font-black text-ink">Current status</h2>
            <div className="mt-2">
              <StatusRow label="Current stage" value={stageLabel} />
              <StatusRow label="Applying for" value={DEGREE_LABELS[rich.target_degree ?? ""] ?? "Not set"} />
              <StatusRow label="Requests sent" value={String(requestCount)} />
            </div>
          </SideCard>
        </div>

        {/* ── Right column ── */}
        <div className="rounded-3xl border border-white/60 bg-white/60 shadow-card backdrop-blur-md">
          {/* Tabs */}
          <div className="flex gap-6 border-b border-surface-border/70 px-6 pt-4">
            <span className="border-b-2 border-navy pb-3 text-sm font-black text-navy">Overview</span>
          </div>

          {editing ? (
            <form onSubmit={handleSubmit(v => save.mutate(v))} className="space-y-5 p-6" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="First name" {...register("first_name")} error={errors.first_name?.message} />
                <Input label="Last name" {...register("last_name")} />
                <Input label="Country" placeholder="Ethiopia" {...register("country")} />
                <Input label="Phone (optional)" placeholder="+251 91 234 5678" {...register("phone")} />
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-ink">Applying for</label>
                  <select {...register("target_degree")} className="rounded-xl border border-surface-border px-3 py-3 text-sm">
                    <option value="">Select…</option>
                    {Object.entries(DEGREE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">About me</label>
                <textarea rows={3} {...register("about")} className="resize-none"
                  placeholder="Who you are, what you're studying, what drives you…" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">My goals</label>
                <textarea rows={2} {...register("goals")} className="resize-none"
                  placeholder="e.g. Get accepted to a top master's program abroad…" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink">What I would like help with</label>
                <ToggleChips options={HELP_TOPICS} value={helpTopics} onChange={setHelpTopics} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink">Languages</label>
                <ToggleChips options={LANGUAGE_OPTIONS} value={languages} onChange={setLanguages} />
              </div>
              {save.isError && <p className="text-xs text-red-600">{(save.error as Error).message}</p>}
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={save.isPending || uploading}>
                  {uploading ? <span className="flex items-center gap-2"><Spinner className="h-4 w-4" /> Uploading…</span>
                    : save.isPending ? "Saving…" : "Save changes"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_270px]">
              <div className="space-y-7">
                <div>
                  <SectionTitle>About me</SectionTitle>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {rich.about || "Tell mentors who you are, tap Edit profile to add a few lines."}
                  </p>
                </div>

                <div className="rounded-2xl bg-navy-light/50 p-5">
                  <SectionTitle>My goals</SectionTitle>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {rich.goals || "What are you working toward? Add your goal so mentors can point you there faster."}
                  </p>
                </div>

                <div>
                  <SectionTitle>What I would like help with</SectionTitle>
                  <div className="mt-3">
                    <ChipRow items={rich.help_topics ?? []} empty="Pick the areas you want mentor support with, tap Edit profile." />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl bg-surface-soft p-5">
                  <SectionTitle>Current focus</SectionTitle>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {stageLabel
                      ? `${stageLabel}${rich.target_degree ? ` · aiming for a ${DEGREE_LABELS[rich.target_degree]}` : ""}.`
                      : "Set your stage so mentors arrive prepared."}
                  </p>
                </div>
                <div>
                  <SectionTitle>Languages</SectionTitle>
                  <div className="mt-3">
                    <ChipRow items={rich.languages ?? []} empty="Add the languages you speak." />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

// ── Mentor own profile ───────────────────────────────────────────────────────
const mentorSchema = z.object({
  first_name: z.string().min(1, "Required"),
  last_name: z.string().optional(),
  current_location: z.string().min(2, "Required"),
  current_job: z.string().min(2, "Required"),
  university: z.string().min(2, "Required"),
  graduation_year: z.coerce.number().min(1980).max(2100).optional(),
  linkedin_url: z.string().url("Enter a valid URL").or(z.literal("")).optional(),
  bio: z.string().min(20, "At least 20 chars").max(600),
  phone: z.string().optional(),
  is_available: z.boolean(),
  weekly_limit: z.coerce.number().min(1).max(20),
});
type MentorValues = z.infer<typeof mentorSchema>;

interface MentorReview { rating: number; feedback: string | null; created_at: string; reviewer: string }

function MentorOwnProfile() {
  const qc = useQueryClient();
  const { profile, mentorProfile, userId } = useAuth();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"overview" | "reviews">("overview");

  const { data: reviews = [] } = useQuery({
    queryKey: ["mentor-reviews", mentorProfile?.id],
    queryFn: async (): Promise<MentorReview[]> => {
      const { data, error } = await supabase
        .rpc("get_mentor_reviews", { p_mentor_profile_id: mentorProfile!.id });
      if (error) throw error;
      return (data ?? []) as MentorReview[];
    },
    enabled: !!mentorProfile?.id,
  });
  const [areas, setAreas] = useState<string[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  type MP = typeof mentorProfile & { is_available?: boolean; weekly_limit?: number };

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } =
    useForm<MentorValues>({
      resolver: zodResolver(mentorSchema),
      defaultValues: { is_available: true, weekly_limit: 3 },
    });

  useEffect(() => {
    if (mentorProfile && profile) {
      const mp = mentorProfile as MP;
      reset({
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
        current_location: mp.current_location,
        current_job: mp.current_job,
        university: mp.university,
        graduation_year: mp.graduation_year ?? undefined,
        linkedin_url: mp.linkedin_url ?? "",
        bio: mp.bio,
        phone: (profile as RichProfile).phone ?? "",
        is_available: mp.is_available ?? true,
        weekly_limit: mp.weekly_limit ?? 3,
      });
      setAreas(mp.areas ?? []);
      setAvatarFile(null);
    }
  }, [mentorProfile, profile, reset]);

  const isAvailable = watch("is_available");
  const weeklyLimit = watch("weekly_limit");

  const save = useMutation({
    mutationFn: async (v: MentorValues) => {
      let avatarUrl = profile!.avatar_url;
      if (avatarFile) {
        setUploading(true);
        avatarUrl = await uploadAvatar(profile!.id, avatarFile);
        setUploading(false);
      }
      // status / avg_rating / total_sessions are admin-only, guarded by trigger.
      await assertUpdated(
        supabase.from("mentor_profiles").update({
          current_location: v.current_location,
          current_job: v.current_job,
          university: v.university,
          graduation_year: v.graduation_year ?? null,
          linkedin_url: v.linkedin_url || null,
          bio: v.bio,
          is_available: v.is_available,
          weekly_limit: v.weekly_limit,
          areas,
        }).eq("user_id", profile!.id).select("id"),
      );
      await assertUpdated(
        supabase.from("profiles").update({
          first_name: v.first_name.trim(),
          last_name: v.last_name?.trim() || "",
          phone: v.phone || null,
          avatar_url: avatarUrl,
        }).eq("id", profile!.id).select("id"),
      );
    },
    onSuccess: () => {
      if (userId) {
        qc.invalidateQueries({ queryKey: qk.profile(userId) });
        qc.invalidateQueries({ queryKey: qk.mentorProfile(userId) });
      }
      setEditing(false);
      setAvatarFile(null);
    },
  });

  if (!mentorProfile || !profile) return <PageSpinner />;
  const mp = mentorProfile as MP;
  const memberSince = (profile as RichProfile).created_at
    ? new Date((profile as RichProfile).created_at!).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <PageShell>
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── Left ── */}
        <div className="space-y-5">
          <SideCard className="text-center">
            <div className="mx-auto w-fit">
              <AvatarPicker
                currentUrl={profile.avatar_url ?? null}
                name={`${profile.first_name} ${profile.last_name}`}
                onFileSelected={(f) => { setAvatarFile(f); setEditing(true); }}
              />
            </div>
            <h1 className="mt-4 text-xl font-black text-ink">
              {profile.first_name} {profile.last_name}
            </h1>
            <p className="text-sm text-ink-muted">{mp.current_job}</p>
            <div className="mt-2 flex justify-center"><ImpactLevelChip userId={profile.id} showNew /></div>

            <div className="mt-4 space-y-2 border-t border-surface-border/60 pt-4 text-left text-sm text-ink-muted">
              <p className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {mp.current_location}
              </p>
              {memberSince && (
                <p className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                  Member since {memberSince}
                </p>
              )}
            </div>

            <Button className="mt-4 w-full" onClick={() => setEditing(e => !e)}>
              {editing ? "Cancel editing" : "Edit profile"}
            </Button>
          </SideCard>

          <SideCard>
            <h2 className="font-black text-ink">Current status</h2>
            <div className="mt-2">
              <StatusRow label="Rating" value={mp.avg_rating > 0 ? `★ ${Number(mp.avg_rating).toFixed(1)}` : "New"} />
              <StatusRow label="Sessions" value={String(mp.total_sessions ?? 0)} />
              <StatusRow label="University" value={mp.university || "Not set"} />
              <StatusRow label="Accepting students" value={isAvailable ? "Yes" : "Paused"} highlight={isAvailable} />
            </div>
          </SideCard>
        </div>

        {/* ── Right ── */}
        <div className="rounded-3xl border border-white/60 bg-white/60 shadow-card backdrop-blur-md">
          <div className="flex gap-6 border-b border-surface-border/70 px-6 pt-4">
            {(["overview", "reviews"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn("pb-3 text-sm transition",
                  tab === t
                    ? "border-b-2 border-navy font-black text-navy"
                    : "font-semibold text-ink-subtle hover:text-ink")}>
                {t === "overview" ? "Overview" : `Reviews (${reviews.length})`}
              </button>
            ))}
          </div>

          {tab === "reviews" && !editing ? (
            <div className="space-y-3 p-6">
              {reviews.length === 0 && (
                <p className="rounded-2xl bg-surface-soft px-4 py-8 text-center text-sm text-ink-muted">
                  No reviews yet, they appear here after students rate your sessions.
                </p>
              )}
              {reviews.map((r, i) => (
                <div key={i} className="rounded-2xl bg-surface-soft p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-gold">
                      {"★".repeat(r.rating)}
                      <span className="text-surface-border">{"★".repeat(5 - r.rating)}</span>
                    </span>
                    <span className="text-xs text-ink-subtle">
                      {r.reviewer} · {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {r.feedback && (
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">“{r.feedback}”</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {(tab === "overview" || editing) && (editing ? (
            <form onSubmit={handleSubmit(v => save.mutate(v))} className="space-y-5 p-6" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="First name" {...register("first_name")} error={errors.first_name?.message} />
                <Input label="Last name" {...register("last_name")} />
                <Input label="Current location" placeholder="Boston, MA, USA"
                  {...register("current_location")} error={errors.current_location?.message} />
                <Input label="Current job / role" placeholder="Software Engineer at Google"
                  {...register("current_job")} error={errors.current_job?.message} />
                <Input label="University" {...register("university")} error={errors.university?.message} />
                <Input label="Graduation year" type="number" placeholder="2020" {...register("graduation_year")} />
                <Input label="LinkedIn URL (optional)" placeholder="https://linkedin.com/in/…" {...register("linkedin_url")} />
                <Input label="Phone (optional)" {...register("phone")} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">Bio</label>
                <textarea rows={4} {...register("bio")} className="resize-none"
                  placeholder="Tell students about your journey…" />
                {errors.bio && <p className="mt-1 text-xs text-red-600">{errors.bio.message}</p>}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink">Areas you mentor</label>
                <ToggleChips options={[...MENTORSHIP_AREAS]} value={areas} onChange={setAreas} />
              </div>

              {/* Availability controls */}
              <div className="rounded-2xl bg-surface-soft p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink">Accept new students</p>
                    <p className="text-xs text-ink-muted">Off = visible, no new requests</p>
                  </div>
                  <button type="button"
                    onClick={() => setValue("is_available", !isAvailable, { shouldDirty: true })}
                    className={cn("relative h-6 w-11 rounded-full transition",
                      isAvailable ? "bg-emerald-500" : "bg-surface-muted")}>
                    <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                      isAvailable ? "left-[22px]" : "left-0.5")} />
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-surface-border/60 pt-4">
                  <div>
                    <p className="font-semibold text-ink">Sessions per week</p>
                    <p className="text-xs text-ink-muted">You show as full once you hit this.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button"
                      onClick={() => setValue("weekly_limit", Math.max(1, weeklyLimit - 1), { shouldDirty: true })}
                      className="grid h-8 w-8 place-items-center rounded-full bg-white text-lg font-bold shadow-sm">−</button>
                    <span className="w-6 text-center text-lg font-black text-ink">{weeklyLimit}</span>
                    <button type="button"
                      onClick={() => setValue("weekly_limit", Math.min(20, weeklyLimit + 1), { shouldDirty: true })}
                      className="grid h-8 w-8 place-items-center rounded-full bg-white text-lg font-bold shadow-sm">+</button>
                  </div>
                </div>
              </div>

              {save.isError && <p className="text-xs text-red-600">{(save.error as Error).message}</p>}
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={save.isPending || uploading}>
                  {uploading ? <span className="flex items-center gap-2"><Spinner className="h-4 w-4" /> Uploading…</span>
                    : save.isPending ? "Saving…" : "Save profile"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_270px]">
              <div className="space-y-7">
                <div>
                  <SectionTitle>About me</SectionTitle>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted">{mp.bio}</p>
                </div>
                <div>
                  <SectionTitle>Areas I mentor</SectionTitle>
                  <div className="mt-3"><ChipRow items={mp.areas ?? []} empty="Add your areas in Edit profile." /></div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="rounded-2xl bg-surface-soft p-5">
                  <SectionTitle>Background</SectionTitle>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {mp.university}{mp.graduation_year ? ` '${String(mp.graduation_year).slice(-2)}` : ""}
                  </p>
                  {mp.linkedin_url && (
                    <a href={mp.linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm font-bold text-navy hover:underline">
                      LinkedIn ↗
                    </a>
                  )}
                </div>
                <div className="rounded-2xl bg-navy-light/50 p-5">
                  <SectionTitle>Availability</SectionTitle>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {isAvailable
                      ? `Accepting students, up to ${weeklyLimit} session${weeklyLimit === 1 ? "" : "s"} a week.`
                      : "Not taking new students right now."}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

export default function ProfilePage() {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageSpinner />;
  if (profile?.role === "mentor") return <MentorOwnProfile />;
  return <MenteeProfile />;
}
