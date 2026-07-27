import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { ImpactLevelChip } from "@/pages/profile";
import { DefaultAvatar } from "@/components/ui/DefaultAvatar";
import { cn } from "@/lib/cn";
import { qk } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
  createRequest,
  getMentors,
  getMentorSlots,
  type AvailabilitySlot,
  type MentorCard,
} from "../api";
import { DAYS, MENTORSHIP_AREAS } from "@/types";

// ─── Format time (24h → 12h) ──────────────────────────────────────────────
function fmt12(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ─── Fetch mentor events ───────────────────────────────────────────────────

// ─── Request form schema ───────────────────────────────────────────────────
const reqSchema = z.object({
  topics: z.array(z.string()).min(1, "Pick at least one topic"),
  message: z.string().min(20, "At least 20 characters"),
  booked_slot: z.string().optional(), // "day|time" e.g. "1|09:00"
});
type ReqValues = z.infer<typeof reqSchema>;

// ─── Request modal ─────────────────────────────────────────────────────────
export function RequestModal({
  mentor,
  slots,
  onClose,
  onSuccess,
}: {
  mentor: MentorCard;
  slots: AvailabilitySlot[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { profile } = useAuth();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ReqValues>({
    resolver: zodResolver(reqSchema),
    defaultValues: { topics: [], booked_slot: "" },
  });
  const topics = watch("topics") ?? [];
  const selectedSlot = watch("booked_slot");

  const [attachment, setAttachment] = useState<File | null>(null);
  // Some topics beg for a document: reviewing an essay or SOP is meaningless
  // without the essay itself.
  const wantsDocument = topics.some((t) =>
    /essay|sop|statement|application|resume|cv/i.test(t),
  );
  const qc = useQueryClient();

  // "Ready" = the mentor will know who they're meeting and where that person
  // is in the process. Stage is computed from the journey now (the manual
  // dropdown was removed), so we check that the student has actually started:
  // at least one application, plus the degree they're aiming for.
  const p = profile as { target_degree?: string } | null;
  const { data: appCount = 0 } = useQuery({
    queryKey: ["mentee-app-count", profile?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("applications")
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    },
    enabled: !!profile?.id,
  });
  const profileReady = appCount > 0 && !!p?.target_degree;

  const send = useMutation({
    mutationFn: (v: ReqValues) => {
      const [day, time] = v.booked_slot?.split("|") ?? [];
      return createRequest({
        menteeId: profile!.id,
        mentorId: mentor.mentorProfileId,
        topics: v.topics,
        message: v.message,
        bookedDay: day ? Number(day) : null,
        bookedTime: time ?? null,
        attachmentFile: attachment,
      });
    },
    onSuccess: () => {
      // Refresh the My Requests cache so the new request (with mentor details)
      // is there immediately, not only after a manual refresh.
      qc.invalidateQueries({ queryKey: qk.requests("out") });
      qc.invalidateQueries({ queryKey: ["home", "requests"] });
      onSuccess();
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-modal animate-fade-up max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-ink">Request mentorship</h2>
            <p className="text-xs text-ink-muted">
              {mentor.firstName} {mentor.lastName} · {mentor.currentJob}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full border border-surface-border text-ink-muted hover:bg-surface-muted"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={handleSubmit((v) => send.mutate(v))}
          className="space-y-5"
          noValidate
        >
          {/* Topics */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">
              What do you need help with?
            </label>
            <div className="flex flex-wrap gap-2">
              {MENTORSHIP_AREAS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() =>
                    setValue(
                      "topics",
                      topics.includes(a)
                        ? topics.filter((x) => x !== a)
                        : [...topics, a],
                      { shouldValidate: true },
                    )
                  }
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    topics.includes(a)
                      ? "bg-navy text-white"
                      : "border border-surface-border text-ink-muted hover:border-navy/30",
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
            {errors.topics && (
              <p className="mt-1 text-xs text-red-600">
                {errors.topics.message}
              </p>
            )}
          </div>

          {/* Available slots */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">
              Pick an available time slot
              <span className="ml-1 font-normal text-ink-subtle">
                (optional)
              </span>
            </label>
            {slots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-border bg-surface-soft p-3 text-center text-xs text-ink-muted">
                This mentor hasn't set availability slots yet. You can still
                send a request.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {slots.map((slot) => {
                  const key = `${slot.day_of_week}|${slot.start_time}`;
                  const selected = selectedSlot === key;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() =>
                        setValue("booked_slot", selected ? "" : key)
                      }
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left text-sm transition",
                        selected
                          ? "border-navy bg-navy text-white"
                          : "border-surface-border bg-white hover:border-navy/40",
                      )}
                    >
                      <p className="font-bold">{DAYS[slot.day_of_week]}</p>
                      <p
                        className={cn(
                          "text-xs",
                          selected ? "text-white/80" : "text-ink-muted",
                        )}
                      >
                        {fmt12(slot.start_time)} to {fmt12(slot.end_time)}
                      </p>
                      <p
                        className={cn(
                          "text-[10px] mt-0.5",
                          selected ? "text-white/60" : "text-ink-subtle",
                        )}
                      >
                        {slot.timezone}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Message */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              Your message
            </label>
            <textarea
              rows={4}
              {...register("message")}
              className="resize-none"
              placeholder="Tell them about your situation, where you are in the process, and what you need most…"
            />
            {errors.message && (
              <p className="mt-1 text-xs text-red-600">
                {errors.message.message}
              </p>
            )}
          </div>

          {/* Share the document when the request is about reviewing one. */}
          <div
            className={cn(
              "rounded-2xl border p-4 transition",
              wantsDocument
                ? "border-gold/40 bg-gold-soft/40"
                : "border-surface-border bg-cloud",
            )}
          >
            <label className="block text-sm font-semibold text-ink">
              {wantsDocument
                ? "Share the document you'd like reviewed"
                : "Attach a document (optional)"}
            </label>
            <p className="mb-2 mt-0.5 text-xs text-ink-muted">
              {wantsDocument
                ? "Your mentor can read your essay or SOP before the session, so no time is wasted."
                : "PDF or Word, your mentor will be able to open it."}
            </p>
            {attachment ? (
              <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-white px-3 py-2">
                <span className="flex-1 truncate text-sm font-semibold text-ink">
                  {attachment.name}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="text-xs font-bold text-ink-subtle hover:text-red-500"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-surface-border bg-white px-4 py-2 text-sm font-bold text-navy transition hover:bg-navy-light">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 10 * 1024 * 1024) {
                      alert("Please keep files under 10MB.");
                      return;
                    }
                    setAttachment(f ?? null);
                    e.target.value = "";
                  }}
                />
                Choose file
              </label>
            )}
          </div>

          {send.isError && (
            <p className="text-xs text-red-600">
              {(send.error as Error).message}
            </p>
          )}

          {/* A mentor who knows where you are gives a far better session, so we
              ask for the missing pieces before the request goes out. */}
          {!profileReady && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-black text-amber-800">
                A couple of steps first
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                So your mentor can help from minute one:
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-amber-700">
                <li className={appCount > 0 ? "line-through opacity-60" : ""}>
                  {appCount > 0 ? "✓" : "•"} Add at least one university in your
                  journey (this sets your stage automatically).
                </li>
                <li
                  className={p?.target_degree ? "line-through opacity-60" : ""}
                >
                  {p?.target_degree ? "✓" : "•"} Set what you're applying for in
                  your profile (Bachelor's, Master's, PhD…).
                </li>
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                {appCount === 0 && (
                  <Link to="/journey">
                    <Button size="sm" variant="secondary">
                      Add a university
                    </Button>
                  </Link>
                )}
                {!p?.target_degree && (
                  <Link to="/profile">
                    <Button size="sm" variant="secondary">
                      Set in profile
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || send.isPending || !profileReady}
              title={
                !profileReady ? "Complete your profile to send a request" : ""
              }
            >
              {send.isPending ? "Sending…" : "Send request"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Mini event card ───────────────────────────────────────────────────────

// ─── Mentor profile panel ──────────────────────────────────────────────────

// ─── Mentor card (light design) ────────────────────────────────────────────
function MentorCardTile({ mentor }: { mentor: MentorCard }) {
  const navigate = useNavigate();
  return (
    <div
      className={cn(
        "flex flex-col rounded-3xl border p-5 shadow-card backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-md",
        mentor.isFeatured
          ? "border-gold/50 bg-gold-soft/40 ring-1 ring-gold/40"
          : "border-white/70 bg-white/85",
      )}
    >
      {mentor.isFeatured && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-navy px-3 py-2 text-white">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
          </svg>
          <span className="text-xs font-black">
            Official EMG team · helps with everything, including mock interviews
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-black text-ink">
            {mentor.firstName} {mentor.lastName}
          </p>
          <p className="truncate text-sm text-ink-muted">{mentor.currentJob}</p>
          <p className="truncate text-sm text-ink-muted">
            {mentor.currentLocation}
          </p>
        </div>
        {mentor.avatarUrl ? (
          <img
            referrerPolicy="no-referrer"
            src={mentor.avatarUrl}
            alt={mentor.firstName}
            className="h-16 w-16 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-2xl">
            <DefaultAvatar className="h-16 w-16" />
          </span>
        )}
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-muted">
        {mentor.bio}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {mentor.areas.slice(0, 3).map((a) => (
          <span
            key={a}
            className="rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-bold text-ink-muted ring-1 ring-surface-border"
          >
            {a}
          </span>
        ))}
        {mentor.areas.length > 3 && (
          <span className="rounded-full bg-surface-soft px-2 py-1 text-[11px] font-bold text-ink-muted ring-1 ring-surface-border">
            +{mentor.areas.length - 3}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="text-sm font-bold text-ink">
          {mentor.avgRating > 0 ? (
            <>
              <span className="text-gold">★</span> {mentor.avgRating.toFixed(1)}
              <span className="font-semibold text-ink-muted">
                {" "}
                · {mentor.totalSessions} sessions
              </span>
            </>
          ) : (
            <span className="font-semibold text-ink-muted">New mentor</span>
          )}
        </p>
        <ImpactLevelChip userId={mentor.userId} />
      </div>

      <div className="mt-4 flex items-stretch justify-between gap-2">
        <Button
          size="sm"
          onClick={() => navigate(`/mentors/${mentor.mentorProfileId}`)}
        >
          View profile →
        </Button>
        {!mentor.isAvailable ? (
          <span className="flex items-center whitespace-nowrap rounded-xl bg-surface-soft px-3.5 text-xs font-bold text-ink-muted ring-1 ring-surface-border">
            Not accepting
          </span>
        ) : mentor.isFullThisWeek ? (
          <span className="flex items-center whitespace-nowrap rounded-xl bg-amber-50 px-3.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
            Full this week
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function MentorsPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  // Deep links like /mentors?area=IELTS%20Prep pre-filter the list.
  const [area, setArea] = useState(params.get("area") ?? "");
  const [visibleCount, setVisibleCount] = useState(9);
  const [requesting, setRequesting] = useState<MentorCard | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      area: area || undefined,
      search: search || undefined,
    }),
    [area, search],
  );

  const { data: mentors, isLoading } = useQuery({
    queryKey: qk.mentors(filters),
    queryFn: () => getMentors(filters),
  });

  const { data: requestingSlots = [] } = useQuery({
    queryKey: ["mentor-slots", requesting?.mentorProfileId],
    queryFn: () => getMentorSlots(requesting!.mentorProfileId),
    enabled: !!requesting,
  });

  return (
    <div className="pb-4">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 space-y-3">
          <input
            type="search"
            placeholder="Search mentors by name, city, school, or expertise…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!rounded-2xl !py-3 w-full"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setArea("")}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-bold transition",
                area === ""
                  ? "bg-navy text-white"
                  : "border border-surface-border text-ink-muted hover:text-ink",
              )}
            >
              All
            </button>
            {MENTORSHIP_AREAS.map((a) => (
              <button
                key={a}
                onClick={() => setArea(a === area ? "" : a)}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-bold transition",
                  area === a
                    ? "bg-navy text-white"
                    : "border border-surface-border text-ink-muted hover:text-ink",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {success && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            Request sent to {success}! Track it under{" "}
            <Link to="/mentors/requests" className="underline">
              My requests
            </Link>
            .
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-2xl border border-surface-border bg-white"
              />
            ))}
          </div>
        ) : mentors?.length === 0 ? (
          <div className="py-20 text-center">
            <p className="mt-3 font-black text-ink">
              No mentors match your filters.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => {
                setSearch("");
                setArea("");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(mentors ?? []).slice(0, visibleCount).map((m) => (
                <MentorCardTile key={m.mentorProfileId} mentor={m} />
              ))}
            </div>
            {(mentors ?? []).length > visibleCount && (
              <div className="mt-6 text-center">
                <Button
                  variant="secondary"
                  onClick={() => setVisibleCount((c) => c + 9)}
                >
                  Load more mentors ({(mentors ?? []).length - visibleCount}{" "}
                  remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {requesting && (
        <RequestModal
          mentor={requesting}
          slots={requestingSlots}
          onClose={() => setRequesting(null)}
          onSuccess={() => {
            setSuccess(requesting.firstName);
            setTimeout(() => setSuccess(null), 6000);
          }}
        />
      )}
    </div>
  );
}
