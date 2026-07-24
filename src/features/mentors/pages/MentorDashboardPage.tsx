import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageSpinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { saveSlots, nextOccurrence } from "../api";
import { getMaterialFileUrl } from "@/features/applications/api";
import { assertUpdated } from "@/lib/safeUpdate";
import { PointsToast } from "@/components/ui/PointsToast";
import { StudentSnapshot } from "../components/StudentSnapshot";
import {
  DAYS,
  EVENT_STATUS_CFG,
  EVENT_TYPE_LABELS,
  REQUEST_STATUS_CFG,
  SERVICE_TYPE_LABELS,
} from "@/types";
import type {
  AppEvent,
  EventType,
  RequestStatus,
  ServiceRequest,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface RequestWithMentee extends ServiceRequest {
  // Joined via public_profiles: name and avatar only, never email/phone.
  mentee: { first_name: string; last_name: string } | null;
}
interface MP {
  id: string;
  user_id: string;
  current_job: string;
  current_location: string;
  bio: string;
  areas: string[];
  linkedin_url: string | null;
  avg_rating: number;
  total_sessions: number;
  is_available: boolean;
  weekly_limit: number;
  status: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event form schema
// ─────────────────────────────────────────────────────────────────────────────
const eventSchema = z.object({
  title: z.string().min(5, "Required"),
  description: z.string().min(20, "At least 20 characters"),
  type: z.enum(["workshop", "webinar", "info_session", "qa", "other"] as const),
  scheduled_at: z.string().min(1, "Pick a date & time"),
  duration_min: z.coerce.number().min(15).max(480),
  max_attendees: z.coerce.number().min(1).max(1000).optional(),
  meet_link: z.string().url("Enter a valid link").or(z.literal("")).optional(),
});
type EventValues = z.infer<typeof eventSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Data fetchers
// ─────────────────────────────────────────────────────────────────────────────
async function fetchAllRequests(): Promise<RequestWithMentee[]> {
  const { data, error } = await supabase
    .from("service_requests")
    .select(
      "*, mentee:public_profiles!service_requests_mentee_id_fkey(first_name, last_name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RequestWithMentee[];
}

async function fetchMentorFull(userId: string): Promise<MP | null> {
  const { data } = await supabase
    .from("mentor_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data as MP | null;
}

async function fetchMyEvents(hostId: string): Promise<AppEvent[]> {
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("host_id", hostId)
    .order("created_at", { ascending: false });
  return (data ?? []) as AppEvent[];
}

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Event form (create + edit)
// ─────────────────────────────────────────────────────────────────────────────
export function EventForm({
  hostId,
  initial,
  onDone,
}: {
  hostId: string;
  initial?: AppEvent | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EventValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: initial
      ? {
          title: initial.title,
          description: initial.description,
          type: initial.type,
          scheduled_at: initial.scheduled_at
            ? new Date(initial.scheduled_at).toISOString().slice(0, 16)
            : "",
          duration_min: initial.duration_min,
          max_attendees: initial.max_attendees ?? undefined,
          meet_link: initial.meet_link ?? "",
        }
      : { type: "workshop", duration_min: 60 },
  });

  const save = useMutation({
    mutationFn: async (v: EventValues) => {
      const payload = {
        host_id: hostId,
        title: v.title,
        description: v.description,
        type: v.type,
        scheduled_at: new Date(v.scheduled_at).toISOString(),
        duration_min: v.duration_min,
        max_attendees: v.max_attendees ?? null,
        meet_link: v.meet_link || null,
        status: initial?.status ?? "pending",
      };
      if (initial) {
        const { error } = await supabase
          .from("events")
          .update(payload)
          .eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("events")
          .insert({ ...payload, status: "pending" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-events", hostId] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((v) => save.mutate(v))}
      className="space-y-4"
      noValidate
    >
      <Input
        label="Event title"
        placeholder="IELTS Strategy Workshop"
        {...register("title")}
        error={errors.title?.message}
      />
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-ink">
          Description
        </label>
        <textarea
          rows={3}
          {...register("description")}
          className="resize-none"
          placeholder="What will you cover? Who is it for?"
        />
        {errors.description && (
          <p className="mt-1 text-xs text-red-600">
            {errors.description.message}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">
            Type
          </label>
          <select {...register("type")} className="!py-2.5 !text-sm">
            {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Duration (minutes)"
          type="number"
          {...register("duration_min")}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Date & time"
          type="datetime-local"
          {...register("scheduled_at")}
          error={errors.scheduled_at?.message}
        />
        <Input
          label="Max attendees (optional)"
          type="number"
          placeholder="50"
          {...register("max_attendees")}
        />
      </div>
      <Input
        label="Video call link (optional)"
        placeholder="Leave empty and we'll generate one on approval"
        {...register("meet_link")}
        error={errors.meet_link?.message}
      />

      {!initial && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Submitted for admin review. It'll go live once approved.
        </p>
      )}
      {initial && (
        <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Editing a live event will keep its current approval status.
        </p>
      )}

      {save.isError && (
        <p className="text-xs text-red-600">{(save.error as Error).message}</p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          className="flex-1"
          disabled={isSubmitting || save.isPending}
        >
          {save.isPending
            ? "Saving…"
            : initial
              ? "Save changes"
              : "Submit for approval"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Events tab
// ─────────────────────────────────────────────────────────────────────────────
function EventsTab({ userId, hostId }: { userId: string; hostId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AppEvent | null>(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["my-events", hostId],
    queryFn: () => fetchMyEvents(userId),
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-events", hostId] }),
  });

  const cancelEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("events")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-events", hostId] }),
  });

  if (creating || editing) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => {
              setCreating(false);
              setEditing(null);
            }}
            className="text-xs font-bold text-navy hover:underline"
          >
            ← Back
          </button>
          <h2 className="font-black text-ink">
            {editing ? "Edit event" : "Create new event"}
          </h2>
        </div>
        <div className="card p-5">
          <EventForm
            hostId={userId}
            initial={editing}
            onDone={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-black text-ink">Your workshops & events</h2>
          <p className="text-xs text-ink-muted">
            All events need admin approval before going live.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          + New event
        </Button>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : events.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="mt-3 font-black text-ink">No events yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Host a workshop or webinar for students.
          </p>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            Create your first event
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => {
            const cfg = EVENT_STATUS_CFG[ev.status];
            const date = ev.scheduled_at ? new Date(ev.scheduled_at) : null;
            const isPast = date ? date < new Date() : false;
            return (
              <div
                key={ev.id}
                className={cn("card p-5", isPast && "opacity-60")}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-ink">{ev.title}</span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                          cfg.cls,
                        )}
                      >
                        {cfg.label}
                      </span>
                      <span className="rounded-full border border-surface-border bg-surface-soft px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                        {EVENT_TYPE_LABELS[ev.type]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {date
                        ? date.toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "No date set"}
                      {` · ${ev.duration_min} min`}
                      {ev.max_attendees
                        ? ` · Max ${ev.max_attendees} attendees`
                        : ""}
                    </p>
                  </div>
                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {/* Edit, always available */}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing(ev)}
                    >
                      Edit
                    </Button>
                    {/* Cancel (for pending/approved) */}
                    {(ev.status === "pending" || ev.status === "approved") && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (
                            confirm(
                              "Cancel this event? Students will no longer see it.",
                            )
                          )
                            cancelEvent.mutate(ev.id);
                        }}
                        disabled={cancelEvent.isPending}
                      >
                        Cancel event
                      </Button>
                    )}
                    {/* Delete (for cancelled/rejected only) */}
                    {(ev.status === "cancelled" ||
                      ev.status === "rejected") && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          if (confirm("Permanently delete this event?"))
                            deleteEvent.mutate(ev.id);
                        }}
                        disabled={deleteEvent.isPending}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

                <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
                  {ev.description}
                </p>

                {ev.meet_link && (
                  <a
                    href={ev.meet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-navy hover:underline"
                  >
                    {ev.meet_link} ↗
                  </a>
                )}

                {ev.admin_note && (
                  <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <strong>Admin note:</strong> {ev.admin_note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Request card
// ─────────────────────────────────────────────────────────────────────────────
function RequestCard({
  req,
  onUpdate,
  loading,
  canAccept,
}: {
  req: RequestWithMentee;
  onUpdate: (args: {
    id: string;
    status: RequestStatus;
    meetLink?: string;
    bookedDay?: number | null;
    bookedTime?: string | null;
  }) => void;
  loading: boolean;
  canAccept: boolean;
}) {
  const [meetLink, setMeetLink] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [showStudent, setShowStudent] = useState(false);
  const cfg = REQUEST_STATUS_CFG[req.status];

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black text-ink">{req.title}</h3>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                cfg.cls,
              )}
            >
              {cfg.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            {SERVICE_TYPE_LABELS[req.service_type]}
            {req.mentee
              ? ` · ${req.mentee.first_name} ${req.mentee.last_name}`
              : ""}
            {/* Know where they are before the session starts. */}
            <button
              onClick={() => setShowStudent(true)}
              className="ml-2 font-bold text-navy hover:underline"
            >
              View progress
            </button>
          </p>
        </div>
        <p className="text-xs text-ink-subtle">
          {new Date(req.created_at).toLocaleDateString()}
        </p>
      </div>

      <p className="mt-2 line-clamp-3 text-sm text-ink-muted">
        {req.description}
      </p>

      {req.attachment_url && (
        <button
          onClick={async () => {
            try {
              const url = await getMaterialFileUrl(req.attachment_url!);
              window.open(url, "_blank", "noopener");
            } catch {
              alert("Could not open that file.");
            }
          }}
          className="mt-2 inline-flex items-center gap-2 rounded-xl border border-navy/20 bg-navy-light px-3 py-1.5 text-xs font-bold text-navy transition hover:bg-navy/10"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          {req.attachment_name ?? "View attached document"}
        </button>
      )}

      {(req.preferred_date || req.preferred_time) && (
        <p className="mt-1 text-xs text-ink-muted">
          Prefers: <strong>{req.preferred_date ?? "any day"}</strong>
          {req.preferred_time ? ` at ${req.preferred_time}` : ""}
        </p>
      )}

      {req.meet_link && (
        <a
          href={req.meet_link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
        >
          Open{" "}
          {req.meet_link && req.meet_link.includes("meet.google")
            ? "Google Meet"
            : "video call"}{" "}
          ↗
        </a>
      )}

      {req.rating != null && (
        <div className="mt-3 rounded-xl border border-gold/20 bg-gold-light px-3 py-2 text-xs">
          <span className="font-black text-gold">
            {"★".repeat(req.rating)}
            {"☆".repeat(5 - req.rating)}
          </span>
          {req.review && (
            <p className="mt-1 italic text-ink-muted">"{req.review}"</p>
          )}
        </div>
      )}

      {req.status === "pending" && (
        <div className="mt-4 space-y-2">
          {showInput ? (
            <div className="flex gap-2">
              <input
                value={meetLink}
                onChange={(e) => setMeetLink(e.target.value)}
                placeholder="Google Meet link (optional, leave empty to auto-generate a video link)"
                className="flex-1 !py-2 !text-sm"
              />
              <Button
                size="sm"
                onClick={() =>
                  onUpdate({
                    id: req.id,
                    status: "approved",
                    meetLink: meetLink || undefined,
                    bookedDay: req.booked_day,
                    bookedTime: req.booked_time,
                  })
                }
                disabled={loading || !canAccept}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowInput(false)}
              >
                ✕
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  onUpdate({
                    id: req.id,
                    status: "approved",
                    bookedDay: req.booked_day,
                    bookedTime: req.booked_time,
                  })
                }
                disabled={loading || !canAccept}
                title={!canAccept ? "You are full or unavailable" : ""}
              >
                {canAccept ? "Approve" : "Full this week"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowInput(true)}
                disabled={loading || !canAccept}
              >
                Approve with my own link
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onUpdate({ id: req.id, status: "declined" })}
                disabled={loading}
              >
                Decline
              </Button>
            </div>
          )}
        </div>
      )}

      {showStudent && (
        <StudentSnapshot
          menteeId={req.mentee_id}
          onClose={() => setShowStudent(false)}
        />
      )}

      {req.status === "approved" && (
        <div className="mt-3 space-y-2">
          {req.meet_link ? (
            <a
              href={req.meet_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2 text-xs font-bold text-white transition hover:bg-navy-soft"
            >
              Join{" "}
              {req.meet_link.includes("meet.google")
                ? "Google Meet"
                : "video call"}
            </a>
          ) : (
            <div className="flex gap-2">
              <input
                value={meetLink}
                onChange={(e) => setMeetLink(e.target.value)}
                placeholder="Add a video call link…"
                className="flex-1 !py-2 !text-sm"
              />
              <Button
                size="sm"
                onClick={() =>
                  onUpdate({
                    id: req.id,
                    status: "approved",
                    meetLink: meetLink || undefined,
                    bookedDay: req.booked_day,
                    bookedTime: req.booked_time,
                  })
                }
                disabled={!meetLink || loading}
              >
                Save link
              </Button>
            </div>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onUpdate({ id: req.id, status: "completed" })}
            disabled={loading}
          >
            Mark as completed
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dashboard
// ─────────────────────────────────────────────────────────────────────────────
// ─── Mentor points card ────────────────────────────────────────────────────
function MentorPointsCard({ mentorUserId }: { mentorUserId: string }) {
  const { data } = useQuery({
    queryKey: ["mentor-points", mentorUserId],
    queryFn: async () => {
      const { data: pts } = await supabase
        .from("mentor_points")
        .select("points")
        .eq("mentor_id", mentorUserId);
      const total = (pts ?? []).reduce(
        (s: number, r: { points: number }) => s + r.points,
        0,
      );
      const { data: milestones } = await supabase
        .from("point_milestones")
        .select("*")
        .order("points");
      return { total, milestones: milestones ?? [] };
    },
    enabled: !!mentorUserId,
  });

  const total = data?.total ?? 0;
  const milestones = data?.milestones ?? [];
  const earned = milestones.filter(
    (m: { points: number }) => m.points <= total,
  );
  const next = milestones.find((m: { points: number }) => m.points > total);
  const ptsToNext = next ? next.points - total : 0;
  // The bar fills toward the 400-point cap, so early points read as small but
  // honest progress rather than a near-full first level.
  const CAP = 400;
  const progress = Math.min(100, Math.round((total / CAP) * 100));

  if (total === 0 && earned.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wide text-ink-subtle">
          Impact points
        </p>
        <span className="text-2xl font-black text-navy">
          {Math.min(total, CAP)}
          <span className="text-sm font-bold text-ink-subtle">/{CAP}</span>
        </span>
      </div>

      {/* Current level, right under the header */}
      {earned.length > 0 && (
        <p
          className="mb-3 text-sm font-black"
          style={{ color: earned[earned.length - 1].badge_color }}
        >
          {!next
            ? `${earned[earned.length - 1].title} status achieved`
            : earned[earned.length - 1].title}
        </p>
      )}

      {earned.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {earned.map(
            (m: { points: number; title: string; badge_color: string }) => (
              <span
                key={m.points}
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: m.badge_color }}
              >
                {m.title}
              </span>
            ),
          )}
        </div>
      )}

      <div className="mb-1 flex justify-between text-xs">
        <span className="text-ink-muted">
          {next ? `→ ${next.title}` : "Max level reached"}
        </span>
        <span className="font-bold text-navy">
          {next ? `${ptsToNext} pts to go` : `${CAP} pts`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-navy transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-3 border-t border-surface-border pt-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          How to earn
        </p>
        <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
          <li>+10 for every completed session</li>
          <li>+1 to +5 for each star rating you receive</li>
          <li>+5 welcome bonus when you were approved</li>
        </ul>
      </div>
    </div>
  );
}

export default function MentorDashboardPage() {
  const { profile, mentorProfile, userId } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"requests" | "events" | "availability">(
    "requests",
  );
  const [pointsToast, setPointsToast] = useState<{
    points: number;
    milestone: string | null;
  } | null>(null);
  const [reqTab, setReqTab] = useState<"pending" | "active" | "completed">(
    "pending",
  );

  const { data: mp } = useQuery({
    queryKey: ["mentor-full", userId],
    queryFn: () => fetchMentorFull(userId!),
    enabled: !!userId,
    staleTime: 10_000,
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["mentor-requests", mentorProfile?.id],
    queryFn: fetchAllRequests,
    enabled: !!mentorProfile?.id,
  });

  const updateRequest = useMutation({
    mutationFn: async ({
      id,
      status,
      meetLink,
      bookedDay,
      bookedTime,
    }: {
      id: string;
      status: RequestStatus;
      meetLink?: string;
      bookedDay?: number | null;
      bookedTime?: string | null;
    }) => {
      const update: Record<string, unknown> = {
        status,
        responded_at: new Date().toISOString(),
      };
      if (meetLink) update.meet_link = meetLink;
      if (status === "approved") {
        update.scheduled_at = new Date().toISOString();
        // Pin the concrete session moment so the link can expire after it.
        if (bookedDay !== null && bookedDay !== undefined) {
          update.scheduled_for = nextOccurrence(
            bookedDay,
            bookedTime ?? null,
          ).toISOString();
        }
      }
      await assertUpdated(
        supabase
          .from("service_requests")
          .update(update)
          .eq("id", id)
          .select("id"),
      );

      // Points and session counters are awarded by a database trigger the
      // moment the status flips to completed. Read the fresh total back so
      // the toast can announce the award (and any milestone just crossed).
      if (status === "completed" && profile) {
        const [{ data: pts }, { data: milestones }] = await Promise.all([
          supabase
            .from("mentor_points")
            .select("points")
            .eq("mentor_id", profile.id),
          supabase
            .from("point_milestones")
            .select("points, title")
            .order("points"),
        ]);
        const newTotal = (pts ?? []).reduce(
          (sum: number, r: { points: number }) => sum + r.points,
          0,
        );
        const oldTotal = newTotal - 10;
        const crossed = (milestones ?? []).find(
          (m: { points: number; title: string }) =>
            m.points > oldTotal && m.points <= newTotal,
        );
        setPointsToast({ points: 10, milestone: crossed?.title ?? null });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["mentor-requests", mentorProfile?.id],
      });
      qc.invalidateQueries({ queryKey: ["mentor-points", profile?.id] });
      qc.invalidateQueries({ queryKey: ["mentor-full", userId] });
    },
  });

  const toggleAvailability = useMutation({
    mutationFn: async (val: boolean) => {
      await assertUpdated(
        supabase
          .from("mentor_profiles")
          .update({ is_available: val })
          .eq("user_id", userId!)
          .select("id"),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["mentor-full", userId] }),
  });

  if (!profile || !mentorProfile) return <PageSpinner />;

  const myId = mentorProfile.id;
  const mine = requests.filter((r) => r.mentor_id === myId);
  const pending = mine.filter((r) => r.status === "pending");
  const active = mine.filter((r) => r.status === "approved");
  const completed = mine.filter((r) => r.status === "completed");

  const weekStart = getWeekStart();
  const thisWeek = mine.filter(
    (r) => r.status === "approved" && r.updated_at >= weekStart,
  ).length;
  const limit = mp?.weekly_limit ?? 3;
  const isFull = thisWeek >= limit;
  const isAvail = mp?.is_available ?? true;
  const canAccept = isAvail && !isFull;

  const TABS = [
    {
      id: "requests" as const,
      label: "Requests",
      count: pending.length,
    },
    { id: "events" as const, label: "Workshops & Events", count: 0 },
    { id: "availability" as const, label: "Availability", count: 0 },
  ];

  const REQ_TABS = [
    {
      id: "pending" as const,
      label: "Pending",
      count: pending.length,
    },
    { id: "active" as const, label: "Active", count: active.length },
    { id: "completed" as const, label: "Completed", count: completed.length },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5C7E8F]/25 via-[#D4DDE2]/60 to-white pt-14">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Mentor dashboard</p>
            <h1 className="mt-1 text-3xl font-black">
              {profile.first_name} {profile.last_name}
            </h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              {mentorProfile.current_job} · {mentorProfile.current_location}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-ink-muted">
              {canAccept
                ? "Accepting students"
                : isFull
                  ? "Full this week"
                  : "Unavailable"}
            </span>
            <button
              onClick={() => toggleAvailability.mutate(!isAvail)}
              disabled={toggleAvailability.isPending || isFull}
              title={
                isFull
                  ? "You're at your weekly limit, the toggle unlocks when a slot frees up or the week resets."
                  : isAvail
                    ? "Pause new student requests"
                    : "Resume accepting students"
              }
              className={cn(
                "relative h-7 w-12 rounded-full transition-colors",
                isFull
                  ? "cursor-not-allowed bg-slate-200 opacity-60"
                  : isAvail
                    ? "bg-emerald-500"
                    : "bg-slate-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                  isAvail ? "left-6" : "left-1",
                )}
              />
            </button>
          </div>
        </div>

        {/* Stats, icon circles, per the dashboard design */}
        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            {
              value: String(mine.length),
              label: "Total assigned",
              tint: "bg-gold-soft text-gold-dark",
              sub:
                pending.length > 0
                  ? `${pending.length} awaiting you`
                  : "All caught up",
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
                </svg>
              ),
            },
            {
              value: String(pending.length),
              label: "Needs review",
              tint: "bg-[#E2E8F0] text-[#475569]",
              sub:
                pending.length > 0 ? "New requests waiting" : "Nothing pending",
              icon: (
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
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              ),
            },
            {
              value: String(active.length),
              label: "Active sessions",
              tint: "bg-emerald-50 text-emerald-600",
              sub: `${thisWeek} this week`,
              icon: (
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
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              ),
            },
            {
              value: String(mentorProfile.areas?.length ?? 0),
              label: "Areas of expertise",
              tint: "bg-[#5C7E8F]/15 text-[#5C7E8F]",
              sub: "edit-link",
              icon: (
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
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              ),
            },
          ].map((st) => (
            <div
              key={st.label}
              className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur-sm"
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-12 w-12 shrink-0 place-items-center rounded-full",
                    st.tint,
                  )}
                >
                  {st.icon}
                </span>
                <div>
                  <p className="text-2xl font-black leading-none text-ink">
                    {st.value}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-ink-muted">
                    {st.label}
                  </p>
                </div>
              </div>
              {st.sub === "edit-link" ? (
                <Link
                  to="/profile"
                  className="mt-3 block text-xs font-black text-navy hover:underline"
                >
                  Edit in profile →
                </Link>
              ) : (
                <p className="mt-3 text-xs font-bold text-ink-subtle">
                  {st.sub}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Weekly capacity + upcoming sessions */}
        <div className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur-sm">
            <div className="flex items-baseline justify-between">
              <h2 className="font-black text-ink">Weekly capacity</h2>
              <span
                className={cn(
                  "text-sm font-black",
                  isFull ? "text-red-500" : "text-navy",
                )}
              >
                {thisWeek} / {limit} sessions booked
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  isFull ? "bg-red-400" : "bg-navy",
                )}
                style={{ width: `${Math.min(100, (thisWeek / limit) * 100)}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-xs font-bold">
              <span className="text-ink-muted">
                {Math.round(Math.min(100, (thisWeek / limit) * 100))}% booked
              </span>
              <span className={isFull ? "text-red-500" : "text-navy"}>
                {isFull
                  ? "Full this week"
                  : `${limit - thisWeek} slot${limit - thisWeek === 1 ? "" : "s"} left`}
              </span>
            </div>

            {/* Day-by-day: approved sessions per weekday */}
            <div className="mt-5 grid grid-cols-7 gap-1 rounded-2xl border border-surface-border/70 p-3">
              {[1, 2, 3, 4, 5, 6, 0].map((dow, i) => {
                const monday = new Date(getWeekStart());
                monday.setDate(monday.getDate() + 1); // getWeekStart returns Sunday
                const date = new Date(monday);
                date.setDate(monday.getDate() + i);
                const count = active.filter((r) => r.booked_day === dow).length;
                return (
                  <div key={dow} className="text-center">
                    <p className="text-xs font-black text-ink">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow]}
                    </p>
                    <p className="text-[10px] text-ink-subtle">
                      {date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <span
                      className={cn(
                        "mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-black",
                        count > 0
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-surface-soft text-ink-subtle",
                      )}
                    >
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upcoming sessions */}
          <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur-sm">
            <h2 className="font-black text-ink">Upcoming sessions</h2>
            <div className="mt-3 space-y-3">
              {active.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-3 border-b border-surface-border/60 pb-3 last:border-0 last:pb-0"
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy-light text-navy">
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink">
                      {r.title.replace("Mentorship request: ", "")}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {r.mentee
                        ? `With ${r.mentee.first_name}`
                        : "Student session"}
                      {r.booked_day !== null && r.booked_day !== undefined
                        ? ` · ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][r.booked_day]}${r.booked_time ? ` ${String(r.booked_time).slice(0, 5)}` : ""}`
                        : ""}
                    </p>
                  </div>
                </div>
              ))}
              {active.length === 0 && (
                <p className="rounded-2xl bg-surface-soft px-4 py-6 text-center text-xs text-ink-muted">
                  Approved sessions land here.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Main tabs: Requests | Events */}
        <div className="mb-5 flex gap-1 rounded-xl border border-surface-border bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 rounded-lg py-2.5 text-sm font-bold transition",
                tab === t.id
                  ? "bg-navy text-white shadow-sm"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]",
                    tab === t.id ? "bg-white/20" : "bg-surface-muted",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── REQUESTS TAB ── */}
        {tab === "requests" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
            <div>
              {/* Sub-tabs */}
              <div className="mb-4 flex gap-1 rounded-xl border border-surface-border bg-white p-1">
                {REQ_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setReqTab(t.id)}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-xs font-bold transition",
                      reqTab === t.id
                        ? "bg-navy text-white"
                        : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {t.label}
                    {t.count > 0 && (
                      <span
                        className={cn(
                          "ml-1 rounded-full px-1.5 text-[10px]",
                          reqTab === t.id ? "bg-white/20" : "bg-surface-muted",
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {isLoading ? (
                <PageSpinner />
              ) : (
                <div className="space-y-3">
                  {(reqTab === "pending"
                    ? pending
                    : reqTab === "active"
                      ? active
                      : completed
                  ).map((r) => (
                    <RequestCard
                      key={r.id}
                      req={r}
                      onUpdate={updateRequest.mutate}
                      loading={updateRequest.isPending}
                      canAccept={canAccept}
                    />
                  ))}
                  {((reqTab === "pending" && pending.length === 0) ||
                    (reqTab === "active" && active.length === 0) ||
                    (reqTab === "completed" && completed.length === 0)) && (
                    <div className="card p-8 text-center text-sm text-ink-muted">
                      No {reqTab} requests.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside className="space-y-4">
              <div className="card p-5">
                <div className="flex items-center gap-3 mb-3">
                  {(profile as { avatar_url?: string }).avatar_url ? (
                    <img
                      referrerPolicy="no-referrer"
                      src={(profile as { avatar_url: string }).avatar_url}
                      className="h-10 w-10 rounded-full object-cover"
                      alt=""
                    />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-navy text-sm font-black text-white">
                      {profile.first_name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="font-black text-ink">
                      {profile.first_name} {profile.last_name}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {mentorProfile.current_job}
                    </p>
                  </div>
                </div>
                {mentorProfile.avg_rating > 0 && (
                  <p className="text-sm font-black text-gold mb-2">
                    ★ {Number(mentorProfile.avg_rating).toFixed(1)} ·{" "}
                    {mentorProfile.total_sessions} sessions
                  </p>
                )}
                <a
                  href="/profile"
                  className="block w-full rounded-xl border border-surface-border bg-surface-soft py-2 text-center text-xs font-bold text-ink hover:bg-white transition"
                >
                  Edit profile & availability →
                </a>
              </div>

              {/* Points card */}
              <MentorPointsCard mentorUserId={profile.id} />
            </aside>
          </div>
        )}

        {/* ── AVAILABILITY TAB ── */}
        {tab === "availability" && (
          <AvailabilityTab mentorId={mentorProfile.id} />
        )}

        {/* ── EVENTS TAB ── */}
        {tab === "events" && <EventsTab userId={userId!} hostId={userId!} />}
      </div>

      {pointsToast && (
        <PointsToast
          points={pointsToast.points}
          milestone={pointsToast.milestone}
          onDone={() => setPointsToast(null)}
        />
      )}
    </div>
  );
}

// ─── Availability slots editor ─────────────────────────────────────────────
const TIMEZONES = [
  "Africa/Addis_Ababa",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Toronto",
];

function AvailabilityTab({ mentorId }: { mentorId: string }) {
  const qc = useQueryClient();
  const [slots, setSlots] = useState<
    { day: number; start: string; end: string; tz: string }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // React Query v5, use data directly, no onSuccess
  const { data: rawSlots } = useQuery({
    queryKey: ["my-slots", mentorId],
    queryFn: async () => {
      const { data } = await supabase
        .from("availability_slots")
        .select("*")
        .eq("mentor_id", mentorId)
        .order("day_of_week")
        .order("start_time");
      return (data ?? []) as Array<{
        day_of_week: number;
        start_time: string;
        end_time: string;
        timezone: string;
      }>;
    },
    enabled: !!mentorId,
  });

  // Sync rawSlots into local editable state once on load
  useEffect(() => {
    if (rawSlots && rawSlots.length > 0 && slots.length === 0) {
      setSlots(
        rawSlots.map((s) => ({
          day: s.day_of_week,
          start: s.start_time.slice(0, 5),
          end: s.end_time.slice(0, 5),
          tz: s.timezone,
        })),
      );
    }
  }, [rawSlots]);

  const addSlot = () =>
    setSlots((s) => [
      ...s,
      { day: 1, start: "09:00", end: "10:00", tz: "Africa/Addis_Ababa" },
    ]);
  const removeSlot = (i: number) =>
    setSlots((s) => s.filter((_, idx) => idx !== i));
  const updateSlot = (i: number, field: string, value: string | number) =>
    setSlots((s) =>
      s.map((slot, idx) => (idx === i ? { ...slot, [field]: value } : slot)),
    );

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSlots(
        slots.map((s) => ({
          day_of_week: s.day,
          start_time: s.start,
          end_time: s.end,
          timezone: s.tz,
        })),
      );
      qc.invalidateQueries({ queryKey: ["my-slots", mentorId] });
      qc.invalidateQueries({ queryKey: ["mentor-slots"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silent
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-black text-ink">Your availability</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Students see these time slots when requesting a session and can book
            directly from them.
          </p>
        </div>
        <Button size="sm" onClick={addSlot}>
          + Add slot
        </Button>
      </div>

      {slots.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="mt-3 font-black text-ink">No availability set</p>
          <p className="mt-1 text-sm text-ink-muted">
            Add time slots so students can book directly.
          </p>
          <Button className="mt-4" onClick={addSlot}>
            Add your first slot
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {slots.map((slot, i) => (
            <div key={i} className="card p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[140px]">
                  <label className="mb-1.5 block text-xs font-semibold text-ink-muted">
                    Day
                  </label>
                  <select
                    value={slot.day}
                    onChange={(e) =>
                      updateSlot(i, "day", Number(e.target.value))
                    }
                    className="!py-2 !text-sm"
                  >
                    {DAYS.map((d, idx) => (
                      <option key={d} value={idx}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink-muted">
                    From
                  </label>
                  <input
                    type="time"
                    value={slot.start}
                    onChange={(e) => updateSlot(i, "start", e.target.value)}
                    className="!py-2 !text-sm !w-36"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink-muted">
                    To
                  </label>
                  <input
                    type="time"
                    value={slot.end}
                    onChange={(e) => updateSlot(i, "end", e.target.value)}
                    className="!py-2 !text-sm !w-36"
                  />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="mb-1.5 block text-xs font-semibold text-ink-muted">
                    Timezone
                  </label>
                  <select
                    value={slot.tz}
                    onChange={(e) => updateSlot(i, "tz", e.target.value)}
                    className="!py-2 !text-sm"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => removeSlot(i)}
                  className="rounded-xl border border-surface-border px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 transition"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save availability"}
            </Button>
            <Button variant="secondary" onClick={addSlot}>
              + Add another slot
            </Button>
            {saved && (
              <p className="text-xs font-semibold text-emerald-600">Saved</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
