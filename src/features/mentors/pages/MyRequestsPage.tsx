import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { qk } from "@/lib/queryClient";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { assertUpdated } from "@/lib/safeUpdate";
import {
  cancelRequest,
  getMentorSlots,
  nextOccurrence,
  getOutgoingRequests,
  type OutgoingRequest,
} from "../api";
import { DAYS } from "@/types";
import type { RequestStatus } from "@/types";

/** A session is considered over two hours after its scheduled moment. */
function sessionExpired(req: OutgoingRequest): boolean {
  if (req.status !== "approved" || !req.scheduled_for) return false;
  return Date.now() > new Date(req.scheduled_for).getTime() + 2 * 60 * 60 * 1000;
}

// ── Reschedule: pick a new window from the mentor's availability ─────────────
function RescheduleModal({ req, onClose }: { req: OutgoingRequest; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["mentor-slots", req.mentor_id],
    queryFn: () => getMentorSlots(req.mentor_id!),
    enabled: !!req.mentor_id,
  });

  const reschedule = useMutation({
    mutationFn: async (slot: { day_of_week: number; start_time: string }) => {
      await assertUpdated(
        supabase
          .from("service_requests")
          .update({
            booked_day: slot.day_of_week,
            booked_time: slot.start_time,
            scheduled_for: nextOccurrence(slot.day_of_week, slot.start_time).toISOString(),
          })
          .eq("id", req.id)
          .select("id"),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.requests("out") });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-modal" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-ink">Pick a new time</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Choose one of {req.mentorFirstName}'s weekly windows. Your session moves
          to its next occurrence and the same link stays valid.
        </p>
        <div className="mt-4 space-y-2">
          {isLoading && <p className="text-sm text-ink-subtle">Loading windows…</p>}
          {!isLoading && slots.length === 0 && (
            <p className="rounded-xl bg-surface-soft px-3 py-4 text-center text-sm text-ink-muted">
              No availability windows right now, message your mentor or cancel and re-request.
            </p>
          )}
          {slots.map(slot => (
            <button key={slot.id}
              onClick={() => reschedule.mutate(slot)}
              disabled={reschedule.isPending}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border border-surface-border px-4 py-3 text-sm font-bold text-ink transition hover:border-navy/50 hover:bg-surface-soft",
                slot.day_of_week === req.booked_day && slot.start_time === req.booked_time && "border-navy bg-navy-light/50",
              )}>
              <span>{DAYS[slot.day_of_week]}</span>
              <span className="text-ink-muted">{slot.start_time.slice(0, 5)} to {slot.end_time.slice(0, 5)}</span>
            </button>
          ))}
        </div>
        {reschedule.isError && (
          <p className="mt-2 text-xs text-red-600">{(reschedule.error as Error).message}</p>
        )}
        <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

const STATUS_CFG: Record<RequestStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  declined: { label: "Declined", cls: "bg-red-50 text-red-600" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
  completed: { label: "Completed", cls: "bg-blue-50 text-blue-700" },
};

// Points earned per action
// Points are awarded server-side by a database trigger (+5 per rating).
const RATING_POINTS = 5;

function StarRating({
  value,
  onChange,
  readonly,
}: {
  value: number;
  onChange?: (n: number) => void;
  readonly?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => !readonly && setHover(n)}
          onMouseLeave={() => !readonly && setHover(0)}
          className={cn(
            "text-2xl transition-transform",
            !readonly && "hover:scale-110 cursor-pointer",
            readonly && "cursor-default",
            n <= (hover || value) ? "text-gold" : "text-surface-muted",
          )}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function RatingModal({
  req,
  onClose,
}: {
  req: OutgoingRequest;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (rating === 0) throw new Error("Please select a rating");

      // Write the rating only. The database trigger recomputes the mentor's
      // avg_rating and awards mentee points, the browser never touches
      // points, counters, or status transitions (RLS rejects it anyway).
      await assertUpdated(
        supabase
          .from("service_requests")
          .update({
            rating,
            review: review.trim() || null,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", req.id)
          .select("id"),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.requests("out") });
      if (profile) qc.invalidateQueries({ queryKey: qk.menteePoints(profile.id) });
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-modal animate-fade-up">
        <h2 className="text-lg font-black text-ink">Rate your session</h2>
        <p className="mt-1 text-sm text-ink-muted">
          with {req.mentorFirstName} {req.mentorLastName} ·{" "}
          {req.mentorCurrentJob}
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">
              How was your session?
            </p>
            <StarRating value={rating} onChange={setRating} />
            {rating > 0 && (
              <p className="mt-1 text-xs text-ink-muted">
                {["", "Poor", "Fair", "Good", "Great", "Excellent!"][rating]}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              Write a review{" "}
              <span className="font-normal text-ink-subtle">(optional)</span>
            </label>
            <textarea
              rows={4}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Share your experience, this helps other students choose the right mentor…"
              className="resize-none"
            />
          </div>

          {/* Points preview, matches the server-side award exactly */}
          <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-soft px-4 py-3">
            <div>
              <p className="text-sm font-black text-ink">
                You'll earn {RATING_POINTS} points
              </p>
              <p className="text-xs text-ink-muted">
                Ratings help other students choose the right mentor.
              </p>
            </div>
          </div>

          {submit.isError && (
            <p className="text-xs text-red-600">
              {(submit.error as Error).message}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => submit.mutate()}
              disabled={rating === 0 || submit.isPending}
            >
              {submit.isPending ? "Submitting…" : "Submit rating"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Skip
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequestCard({
  req,
  onCancel,
  cancelling,
  onRate,
}: {
  req: OutgoingRequest;
  onCancel: () => void;
  cancelling: boolean;
  onRate: () => void;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const cfg = STATUS_CFG[req.status];
  const isCancelled = req.status === "cancelled";
  const isCompleted = req.status === "completed";
  const canRate = isCompleted && !req.rating;

  return (
    <article className={cn("card p-5 transition", isCancelled && "opacity-50")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-black text-ink">
            {req.mentorFirstName} {req.mentorLastName}
          </h3>
          <p className="text-xs text-ink-muted">{req.mentorCurrentJob}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-bold",
            cfg.cls,
          )}
        >
          {cfg.label}
        </span>
      </div>

      {req.topics && req.topics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {req.topics.map((t) => (
            <span
              key={t}
              className="rounded-full border border-surface-border bg-surface-soft px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
        {req.description}
      </p>

      {/* Meet link, expires once the session time has passed */}
      {sessionExpired(req) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-xl border border-surface-border bg-surface-soft px-3 py-2 text-xs font-bold text-ink-subtle">
            Session time passed, link expired
          </span>
          <button onClick={() => setRescheduling(true)}
            className="rounded-xl border border-navy/40 px-3 py-2 text-xs font-bold text-navy transition hover:bg-navy-light">
            Reschedule →
          </button>
        </div>
      ) : (
        <>
      {req.status === "approved" && !req.meet_link && (
        <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Approved, your video link is being prepared. Refresh in a moment.
        </p>
      )}
      {req.status === "approved" && req.meet_link && (
        <a
          href={req.meet_link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
        >
          Join {req.meet_link.includes("meet.google") ? "Google Meet" : "video call"} ↗
        </a>
      )}
      {req.status === "approved" && (
        <button onClick={() => setRescheduling(true)}
          className="mt-2 block text-xs font-bold text-ink-subtle underline transition hover:text-navy">
          Can't make it? Reschedule
        </button>
      )}
        </>
      )}
      {rescheduling && <RescheduleModal req={req} onClose={() => setRescheduling(false)} />}

      {/* Existing rating */}
      {req.rating && (
        <div className="mt-3 rounded-xl border border-gold/20 bg-gold-light px-4 py-3">
          <div className="flex items-center gap-2">
            <StarRating value={req.rating} readonly />
            <span className="text-xs font-bold text-gold">
              {["", "Poor", "Fair", "Good", "Great", "Excellent!"][req.rating]}
            </span>
          </div>
          {req.review && (
            <p className="mt-1 text-xs italic text-ink-muted">"{req.review}"</p>
          )}
        </div>
      )}

      {/* Rate CTA, prominent banner */}
      {canRate && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div>
            <p className="text-sm font-black text-emerald-800">
              Session complete, leave a rating!
            </p>
            <p className="text-xs text-emerald-600">
              Earn up to 7 points + help other students.
            </p>
          </div>
          <Button size="sm" onClick={onRate}>
            Rate now ★
          </Button>
        </div>
      )}

      {req.admin_note && (
        <div className="mt-2 rounded-xl border border-surface-border bg-surface-soft px-3 py-2 text-xs text-ink-muted">
          <strong>Note:</strong> {req.admin_note}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          Sent {new Date(req.created_at).toLocaleDateString()}
        </p>
        {req.status === "pending" && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onCancel}
            disabled={cancelling}
          >
            Cancel request
          </Button>
        )}
      </div>
    </article>
  );
}

export default function MyRequestsPage() {
  const qc = useQueryClient();
  const [showCancelled, setShowCancelled] = useState(false);
  const [ratingReq, setRatingReq] = useState<OutgoingRequest | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: qk.requests("out"),
    queryFn: getOutgoingRequests,
  });

  const cancel = useMutation({
    mutationFn: cancelRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.requests("out") }),
  });

  // Fetch mentee points

  if (isLoading) return <PageSpinner />;

  const active = data.filter((r) => r.status !== "cancelled");
  const cancelled = data.filter((r) => r.status === "cancelled");
  const visible = showCancelled ? data : active;

  return (
    <div className="pb-4">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-ink">My requests</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {active.length === 0
                ? "No active requests."
                : `${active.length} active request${active.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <Link to="/mentors">
            <Button size="sm">+ Find mentors</Button>
          </Link>
        </div>

        {/* Points & streak card */}
        {active.length === 0 && !showCancelled ? (
          <div className="rounded-3xl border-2 border-dashed border-surface-border bg-white p-10 text-center">
            <p className="mt-3 font-black text-ink">No active requests</p>
            <p className="mt-1 text-sm text-ink-muted">
              Browse mentors and send a request to get started.
            </p>
            <Link to="/mentors" className="mt-4 inline-block">
              <Button>Find mentors</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                onCancel={() => {
                  if (confirm("Cancel this request? The mentor will no longer see it."))
                    cancel.mutate(req.id);
                }}
                cancelling={cancel.isPending}
                onRate={() => setRatingReq(req)}
              />
            ))}
          </div>
        )}

        {cancelled.length > 0 && (
          <button
            onClick={() => setShowCancelled((s) => !s)}
            className="mt-5 text-xs font-bold text-ink-muted hover:text-ink transition"
          >
            {showCancelled
              ? `Hide ${cancelled.length} cancelled request${cancelled.length === 1 ? "" : "s"}`
              : `Show ${cancelled.length} cancelled request${cancelled.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {ratingReq && (
        <RatingModal req={ratingReq} onClose={() => setRatingReq(null)} />
      )}
    </div>
  );
}
