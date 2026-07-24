import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { EventForm } from "@/features/mentors/pages/MentorDashboardPage";
import type { AppEvent, EventType } from "@/types";

/*
 * /events, list-row design. Students browse approved events (Upcoming | Past),
 * search them, filter by category, and register. Mentors see only their own
 * submissions here, every status, including declined and past, so what they
 * posted never mixes with the public feed. Hosting happens on the dashboard.
 */

interface EventWithMeta extends AppEvent {
  host: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  } | null;
  registration_count: number;
  is_registered: boolean;
}

async function fetchEvents(
  userId: string,
  mentorOnly: boolean,
): Promise<EventWithMeta[]> {
  // Mentors: their own rows, any status. Students: the approved feed.
  const base = supabase
    .from("events")
    .select(
      "*, host:public_profiles!events_host_id_fkey(first_name, last_name, avatar_url)",
    );
  const { data, error } = mentorOnly
    ? await base.eq("host_id", userId).order("created_at", { ascending: false })
    : await base
        .eq("status", "approved")
        .order("scheduled_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as EventWithMeta[];
  if (rows.length === 0) return [];

  const { data: regs } = await supabase
    .from("event_registrations")
    .select("event_id, user_id")
    .in(
      "event_id",
      rows.map((e) => e.id),
    );

  const regMap: Record<string, { count: number; mine: boolean }> = {};
  for (const r of regs ?? []) {
    regMap[r.event_id] ??= { count: 0, mine: false };
    regMap[r.event_id].count++;
    if (r.user_id === userId) regMap[r.event_id].mine = true;
  }
  return rows.map((e) => ({
    ...e,
    registration_count: regMap[e.id]?.count ?? 0,
    is_registered: regMap[e.id]?.mine ?? false,
  }));
}

const TYPE_LABEL: Record<EventType, string> = {
  workshop: "Workshop",
  webinar: "Webinar",
  info_session: "Info Session",
  qa: "Q&A",
  other: "Other",
};
const TYPE_CHIP: Record<EventType, string> = {
  workshop: "bg-emerald-50 text-emerald-700",
  webinar: "bg-[#E2E8F0] text-[#334155]",
  info_session: "bg-[#5C7E8F]/15 text-[#334155]",
  qa: "bg-[#E2E8F0] text-[#475569]",
  other: "bg-slate-100 text-slate-600",
};
const TYPE_TILE: Record<EventType, string> = {
  workshop: "bg-emerald-50 text-emerald-600",
  webinar: "bg-[#E2E8F0] text-[#334155]",
  info_session: "bg-[#5C7E8F]/15 text-[#5C7E8F]",
  qa: "bg-[#E2E8F0] text-[#475569]",
  other: "bg-slate-100 text-slate-500",
};

function TypeIcon({ type }: { type: EventType }) {
  const c = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "workshop":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" {...c}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "webinar":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" {...c}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case "info_session":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" {...c}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      );
    case "qa":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" {...c}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    default:
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" {...c}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
  }
}

const STATUS_CHIP: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  cancelled: "bg-slate-100 text-slate-500",
};

// ── Row ──────────────────────────────────────────────────────────────────────
function EventRow({
  event,
  mentorView,
  onRegister,
  onUnregister,
  busy,
}: {
  event: EventWithMeta;
  mentorView: boolean;
  onRegister: () => void;
  onUnregister: () => void;
  busy: boolean;
}) {
  const date = event.scheduled_at ? new Date(event.scheduled_at) : null;
  const isPast = !!date && date < new Date();
  const full =
    event.max_attendees !== null &&
    event.registration_count >= event.max_attendees;
  const hostName = event.host
    ? `${event.host.first_name} ${event.host.last_name}`.trim()
    : "EMG team";

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur-sm lg:flex-row lg:items-center">
      {/* Icon tile */}
      <span
        className={cn(
          "grid h-14 w-14 shrink-0 place-items-center rounded-2xl",
          TYPE_TILE[event.type],
        )}
      >
        <TypeIcon type={event.type} />
      </span>

      {/* Title block */}
      <div className="min-w-0 flex-1 lg:max-w-[36%]">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
              TYPE_CHIP[event.type],
            )}
          >
            {TYPE_LABEL[event.type]}
          </span>
          {mentorView && (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                STATUS_CHIP[event.status] ?? STATUS_CHIP.cancelled,
              )}
            >
              {event.status === "rejected"
                ? "Not approved"
                : event.status.charAt(0).toUpperCase() + event.status.slice(1)}
            </span>
          )}
          {isPast && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">
              Past
            </span>
          )}
        </div>
        <h3 className="mt-1.5 text-lg font-black leading-snug text-ink">
          {event.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-muted">
          {event.description}
        </p>
        <p className="mt-1.5 text-xs text-ink-subtle">
          Posted by <span className="font-bold text-ink-muted">{hostName}</span>
        </p>
      </div>

      {/* When */}
      <div className="shrink-0 space-y-1 text-sm text-ink-muted lg:w-48">
        {date && (
          <>
            <p className="flex items-center gap-2">
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
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {date.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <p className="flex items-center gap-2">
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
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              {date.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
              {event.duration_min ? ` · ${event.duration_min} min` : ""}
            </p>
          </>
        )}
      </div>

      {/* Numbers */}
      <div className="flex shrink-0 items-center gap-8 lg:w-56">
        <div>
          <p className="text-xl font-black text-ink">
            {event.registration_count}
          </p>
          <p className="text-xs text-ink-subtle">Registered</p>
        </div>
        <div>
          <p className="text-xl font-black text-ink">
            {event.max_attendees ?? ", "}
          </p>
          <p className="text-xs text-ink-subtle">Capacity</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-col items-stretch gap-2 lg:w-40">
        {!mentorView &&
          !isPast &&
          (event.is_registered ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={onUnregister}
              disabled={busy}
            >
              Registered ✓
            </Button>
          ) : (
            <Button size="sm" onClick={onRegister} disabled={busy || full}>
              {full ? "Full" : "Register →"}
            </Button>
          ))}
        {event.meet_link &&
          (mentorView || event.is_registered) &&
          event.status === "approved" && (
            <a
              href={event.meet_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-sm font-bold text-navy hover:underline"
            >
              View Link
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
              </svg>
            </a>
          )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 8;

export default function EventsPage() {
  const { profile, userId } = useAuth();
  const qc = useQueryClient();
  const isMentor = profile?.role === "mentor";
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<EventType | "">("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  // Grab the current time safely using useEffect to avoid React Compiler purity errors
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
  }, []);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events", isMentor ? "mine" : "public", userId],
    queryFn: () => fetchEvents(userId!, isMentor),
    enabled: !!userId,
  });

  const register = useMutation({
    mutationFn: async (eventId: string) => {
      setBusyId(eventId);
      const { error } = await supabase
        .from("event_registrations")
        .insert({ event_id: eventId, user_id: userId! });
      if (error) throw error;
    },
    onSettled: () => {
      setBusyId(null);
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const unregister = useMutation({
    mutationFn: async (eventId: string) => {
      setBusyId(eventId);
      const { error } = await supabase
        .from("event_registrations")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onSettled: () => {
      setBusyId(null);
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const filtered = useMemo(() => {
    // Skip filtering on the very first render before useEffect fires
    if (now === 0) return events;

    let list = events;
    if (!isMentor) {
      list = list.filter((e) =>
        tab === "upcoming"
          ? !e.scheduled_at || new Date(e.scheduled_at).getTime() >= now
          : e.scheduled_at && new Date(e.scheduled_at).getTime() < now,
      );
    }
    if (typeFilter) list = list.filter((e) => e.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.host &&
            `${e.host.first_name} ${e.host.last_name}`
              .toLowerCase()
              .includes(q)),
      );
    }
    return list;
  }, [events, isMentor, tab, typeFilter, search, now]);

  const upcomingCount = isMentor
    ? events.length
    : events.filter(
        (e) => !e.scheduled_at || new Date(e.scheduled_at).getTime() >= now,
      ).length;

  if (isLoading) return <PageSpinner />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5C7E8F]/25 via-[#D4DDE2]/60 to-white pt-14">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-4xl font-black tracking-tight text-ink">
          {isMentor ? "Your events" : "Events & workshops"}
        </h1>
        <div className="mt-2 h-1 w-12 rounded-full bg-gold" aria-hidden />
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">
          {isMentor
            ? "Everything you submitted, pending, live, past, and declined. Host new events from your dashboard."
            : "Live workshops, webinars, and Q&A sessions from mentors who\u2019ve made it. All free."}
        </p>

        {/* Toolbar: tabs · search · category */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!isMentor ? (
            <div className="flex gap-1 rounded-xl border border-white/70 bg-white/80 p-1 backdrop-blur-sm">
              {(
                [
                  ["upcoming", `Upcoming (${upcomingCount})`],
                  ["past", "Past"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    setTab(id);
                    setVisible(PAGE_SIZE);
                  }}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-sm font-bold transition",
                    tab === id
                      ? "bg-navy text-white"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-navy px-4 py-2 text-sm font-bold text-white">
                My submissions ({events.length})
              </span>
              <Button size="sm" onClick={() => setPosting(true)}>
                + Post an event
              </Button>
            </div>
          )}

          <div className="relative min-w-[220px] flex-1">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search event, host, or keyword…"
              className="w-full !rounded-xl !border-white/70 !bg-white/80 !py-2.5 !pl-10 text-sm backdrop-blur-sm"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as EventType | "")}
            className="!w-auto !rounded-xl !border-white/70 !bg-white/80 !py-2.5 text-sm backdrop-blur-sm"
          >
            <option value="">All categories</option>
            {(Object.keys(TYPE_LABEL) as EventType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Rows */}
        <div className="mt-5 space-y-3">
          {filtered.slice(0, visible).map((e) => (
            <EventRow
              key={e.id}
              event={e}
              mentorView={isMentor}
              busy={busyId === e.id}
              onRegister={() => register.mutate(e.id)}
              onUnregister={() => unregister.mutate(e.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded-3xl border-2 border-dashed border-ink/15 bg-white/60 p-12 text-center backdrop-blur-sm">
              <p className="font-black text-ink">
                {isMentor ? "Nothing submitted yet" : "No events here yet"}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
                {isMentor
                  ? "Host a workshop or webinar from your dashboard, it goes live after admin approval."
                  : "Check back soon, mentors post workshops and Q&A sessions regularly."}
              </p>
            </div>
          )}
        </div>

        {posting && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-20"
            onClick={() => setPosting(false)}
          >
            <div
              className="w-full max-w-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-3xl bg-white p-6 shadow-modal">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-black text-ink">Post an event</h2>
                  <button
                    onClick={() => setPosting(false)}
                    className="text-sm font-bold text-ink-subtle hover:text-ink"
                  >
                    ✕
                  </button>
                </div>
                <EventForm
                  hostId={userId!}
                  onDone={() => {
                    setPosting(false);
                    qc.invalidateQueries({ queryKey: ["events"] });
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {filtered.length > visible && (
          <div className="mt-6 text-center">
            <Button
              variant="secondary"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
            >
              Load more ({filtered.length - visible} remaining)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
