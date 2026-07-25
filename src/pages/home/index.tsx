import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { DefaultAvatar } from "@/components/ui/DefaultAvatar";
import { PageSpinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { qk } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { APP_STATUS_CFG } from "@/types";
import type { Application, AppStatus, ServiceRequest } from "@/types";
/*
 * /home, the dashboard. Two columns on a soft blue-grey canvas: the left side
 * greets, surfaces the next deadline, closing scholarships, and mentor
 * requests; the right side is the journey card, featuring a receding, 3D-style
 * zig-zagging road from account creation up to graduation.
 */
function daysLeft(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}
async function fetchApps(): Promise<Application[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .order("deadline", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Application[];
}
async function fetchRequests(): Promise<ServiceRequest[]> {
  const { data, error } = await supabase
    .from("service_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as ServiceRequest[];
}
interface StripScholarship {
  id: string;
  title: string;
  provider: string;
  deadline: string | null;
}
async function fetchClosingScholarships(): Promise<StripScholarship[]> {
  const { data } = await supabase
    .from("scholarships")
    .select("id, title, provider, deadline")
    .eq("is_active", true)
    .gte("deadline", new Date().toISOString().slice(0, 10))
    .order("deadline", { ascending: true })
    .limit(3);
  return (data ?? []) as StripScholarship[];
}
// ── Journey model ─────────────────────────────────────────────────────────────
interface Milestone {
  key: string;
  num: string;
  title: string;
  desc: string;
  to: string;
  /** Point where the flag is planted on the road (viewBox units). */
  x: number;
  y: number;
  /** Which side the info card sits on. */
  side: "left" | "right";
  color: string;
}
// Anchors run bottom (near, large) to top (far, small) so the road recedes.
const MILESTONES: Milestone[] = [
  {
    key: "university",
    num: "01",
    title: "Add your university",
    desc: "Pick where you’re applying.",
    to: "/journey",
    x: 400,
    y: 690,
    side: "left",
    color: "#7b7a77",
  },
  {
    key: "documents",
    num: "02",
    title: "Prepare documents",
    desc: "SOP, CV, transcripts, recommendation letters.",
    to: "/journey",
    x: 620,
    y: 560,
    side: "right",
    color: "#2FA37B",
  },
  {
    key: "test",
    num: "03",
    title: "Take your test",
    desc: "IELTS, TOEFL or Duolingo, on the official site.",
    to: "/resources/ielts",
    x: 230,
    y: 452,
    side: "left",
    color: "#3B82C4",
  },
  {
    key: "submitted",
    num: "04",
    title: "Submit applications",
    desc: "Send them off before the deadline.",
    to: "/journey",
    x: 550,
    y: 356,
    side: "right",
    color: "#7A5FC0",
  },
  {
    key: "accepted",
    num: "05",
    title: "Get accepted (I-20)",
    desc: "Your offer and I-20 arrive.",
    to: "/journey",
    x: 310,
    y: 268,
    side: "left",
    color: "#D8663A",
  },
  {
    key: "visa",
    num: "06",
    title: "Visa process",
    desc: "SEVIS, DS-160, interview, then your passport.",
    to: "/resources/embassy",
    x: 530,
    y: 176,
    side: "right",
    color: "#0B1B3A",
  },
];
interface JourneyInputs {
  apps: Application[];
  anyMaterialDone: boolean;
  testDone: boolean;
  embassySteps: number[];
}
/** How many milestones are complete (0..6). */
function reachedCount({
  apps,
  anyMaterialDone,
  testDone,
  embassySteps,
}: JourneyInputs): number {
  let n = 0;
  if (apps.length > 0) n = 1;
  if (n === 1 && anyMaterialDone) n = 2;
  if (n >= 2 && testDone) n = 3;
  // Submitting counts even if the test milestone was skipped, the English
  // test score item is no longer part of the default checklist.
  if (
    n >= 2 &&
    apps.some((a) => a.status === "submitted" || a.status === "accepted")
  )
    n = 4;
  if (n >= 4 && apps.some((a) => a.status === "accepted")) n = 5;
  if (n >= 5 && embassySteps.includes(7)) n = 6;
  return n;
}
const NOTES = [
  "Start here, add the first university you’re considering.",
  "University added. Now work through your document checklist.",
  "Documents moving. Book your English test when you’re ready.",
  "Test done. Time to submit those applications.",
  "Submitted, a huge step. Now we wait for the offer.",
  "ACCEPTED! The I-20 is coming. Start your visa steps.",
  "VISA IN HAND. You did it, see you on the other side.",
];
// ── The receding road helpers ──────────────────────────────────────────────────
const VB_W = 900;
const VB_H = 760;
// The road's centre-line: a smooth curve through the anchors, plus a start point at very bottom.
const ROAD_PTS = [
  { x: 400, y: 760 },
  ...MILESTONES.map((m) => ({ x: m.x, y: m.y })),
];
function roadPath(pts: { x: number; y: number }[]): string {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}
// Road width tapers with distance: wide at the bottom, thin at the top.
function roadWidth(y: number): number {
  const t = (y - 120) / (760 - 120); // 0 far … 1 near
  return 20 + t * 78; // 20px far → 98px near
}
function MilestoneIcon({ icon }: { icon: string }) {
  const c = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (icon) {
    case "pin":
      return (
        <g {...c}>
          <path d="M0 -6 a4.5 4.5 0 0 1 0 9 a4.5 4.5 0 0 1 0 -9 M0 3 v4" />
        </g>
      );
    case "doc":
      return (
        <g {...c}>
          <rect x="-4.5" y="-6" width="9" height="12" rx="1.4" />
          <path d="M-1.5 -2.5 h3 M-1.5 0 h3 M-1.5 2.5 h1.5" />
        </g>
      );
    case "test":
      return (
        <g {...c}>
          <rect x="-5.5" y="-5.5" width="11" height="11" rx="2" />
          <path d="M-2.5 -0.5 l2 2 3.5 -3.5" />
        </g>
      );
    case "send":
      return (
        <g {...c}>
          <path d="M6 -5 L-5 0 L-1 1.6 L0.6 6 L6 -5 Z" />
        </g>
      );
    case "award":
      return (
        <g {...c}>
          <circle cx="0" cy="-2" r="4.5" />
          <path d="M-2.6 1.6 l-1.6 6 4.2 -2.4 4.2 2.4 -1.6 -6" />
        </g>
      );
    case "plane":
      return (
        <g {...c}>
          <path d="M6 -1 L-5 -1 M-5 -1 l2.5 -3.4 M-5 -1 l2.5 3.4 M1.6 -1 l-2.6 -5 M1.6 -1 l-2.6 5" />
        </g>
      );
  }
  return null;
}
const ICONS: Record<string, string> = {
  university: "pin",
  documents: "doc",
  test: "test",
  submitted: "send",
  accepted: "award",
  visa: "plane",
};
// ── Journey Card Component ────────────────────────────────────────────────────
function JourneyCard(props: JourneyInputs) {
  const [statusFilter, setStatusFilter] = useState<AppStatus | null>(null);
  const shownApps = statusFilter
    ? props.apps.filter((a) => a.status === statusFilter)
    : props.apps;
  const reached = reachedCount(props);
  const complete = reached === MILESTONES.length;
  const dPath = roadPath(ROAD_PTS);
  const goldFrac = reached / MILESTONES.length;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const counts = {
    planning: props.apps.filter((a) => a.status === "planning").length,
    in_progress: props.apps.filter((a) => a.status === "in_progress").length,
    submitted: props.apps.filter((a) => a.status === "submitted").length,
    accepted: props.apps.filter((a) => a.status === "accepted").length,
  };
  return (
    <div className="flex h-full flex-col rounded-3xl border border-white/60 bg-white/60 shadow-card backdrop-blur-md">
      {/* Header */}
      <div className="flex items-baseline justify-between px-6 pt-6">
        <h2 className="text-xl font-black text-ink">Your journey</h2>
        <Link
          to="/journey"
          className="text-sm font-bold text-[#5C7E8F] transition hover:text-navy"
        >
          Open tracker →
        </Link>
      </div>
      {/* Note with progress-based styling */}
      <div className="px-6 pt-3">
        <p
          className={cn(
            "rounded-xl px-4 py-2.5 text-sm font-bold",
            reached >= 5
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-white/80 text-ink-muted ring-1 ring-surface-border",
          )}
        >
          {NOTES[reached]}
        </p>
      </div>
      {/* The road */}
      <div className="flex-1 overflow-hidden px-2 pt-2">
        <div
          className="relative mx-auto w-full max-w-[560px]"
          style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            <defs>
              <linearGradient id="road-gold" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#E3B23C" />
                <stop offset="100%" stopColor="#F0C860" />
              </linearGradient>
              <filter
                id="road-shadow"
                x="-30%"
                y="-30%"
                width="160%"
                height="160%"
              >
                <feDropShadow
                  dx="10"
                  dy="8"
                  stdDeviation="10"
                  floodColor="#0F172A"
                  floodOpacity="0.12"
                />
              </filter>
            </defs>
            {/* Base road with soft edges and tapering width */}
            <g filter="url(#road-shadow)">
              {[...Array(60)].map((_, i) => {
                const t0 = i / 60,
                  t1 = (i + 1) / 60;
                return (
                  <path
                    key={i}
                    d={dPath}
                    fill="none"
                    stroke="#D4DDE2"
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={`${t1 - t0} 1`}
                    strokeDashoffset={-t0}
                    strokeWidth={roadWidth(760 - (760 - 120) * ((t0 + t1) / 2))}
                  />
                );
              })}
            </g>
            {/* Gold paving over the completed portion */}
            {reached > 0 &&
              [...Array(60)].map((_, i) => {
                const t0 = i / 60,
                  t1 = (i + 1) / 60;
                if (t1 > goldFrac) return null;
                return (
                  <path
                    key={`g-${i}`}
                    d={dPath}
                    fill="none"
                    stroke="url(#road-gold)"
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={`${t1 - t0} 1`}
                    strokeDashoffset={-t0}
                    strokeWidth={
                      roadWidth(760 - (760 - 120) * ((t0 + t1) / 2)) - 6
                    }
                  />
                );
              })}
            {/* Dashed centre-line, like lane markings */}
            <path
              className="road-dash"
              d={dPath}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeDasharray="2 16"
              strokeLinecap="round"
              opacity="0.7"
            />
            {/* Flags planted at each milestone */}
            {MILESTONES.map((m, i) => {
              const done = i < reached;
              const current = i === reached;
              const scale = 0.7 + ((m.y - 120) / (760 - 120)) * 0.5; // near = bigger
              const poleH = 84 * scale;
              const active = done || current;
              const flagFill = active ? m.color : "#A2A2A2";
              return (
                <g key={m.key} transform={`translate(${m.x}, ${m.y})`}>
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2={-poleH}
                    stroke={flagFill}
                    strokeWidth={3.6 * scale}
                    strokeLinecap="round"
                  />
                  <circle
                    cx="0"
                    cy="0"
                    r={6 * scale}
                    fill={flagFill}
                    stroke="#FFFFFF"
                    strokeWidth={2 * scale}
                  />
                  {current && (
                    <circle
                      cx="0"
                      cy="0"
                      r={18 * scale}
                      fill="#10B981"
                      opacity="0.22"
                    >
                      <animate
                        attributeName="r"
                        values={`${12 * scale};${19 * scale};${12 * scale}`}
                        dur="2.4s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                  {/* Flag banner: a pennant carrying the number */}
                  <g transform={`translate(0, ${-poleH})`}>
                    <path
                      d={`M0 0 H ${64 * scale} l ${-13 * scale} ${15 * scale} l ${13 * scale} ${15 * scale} H 0 Z`}
                      fill={flagFill}
                    />
                    <text
                      x={29 * scale}
                      y={16 * scale}
                      textAnchor="middle"
                      fontSize={16 * scale}
                      fontWeight="800"
                      fill="#FFFFFF"
                      dominantBaseline="middle"
                    >
                      {m.num}
                    </text>
                    <g
                      transform={`translate(${-18 * scale}, ${15 * scale}) scale(${scale * 1.15})`}
                      color={active ? m.color : "#A2A2A2"}
                    >
                      <MilestoneIcon icon={ICONS[m.key]} />
                    </g>
                  </g>
                  {done && <circle cx={0} cy={-poleH + 12 * scale} r={0} />}
                </g>
              );
            })}
            {/* Graduation cap at the far end */}
            <g
              transform={`translate(${MILESTONES[5].x + 6}, ${MILESTONES[5].y - 132}) scale(1.4)`}
              opacity={complete ? 1 : 0.92}
            >
              <path d="M-17 5 L0 -4 L17 5 L0 14 Z" fill="#0B1B3A" />
              <path
                d="M-8 9 v7 c0 3.5 16 3.5 16 0 v-7"
                fill="none"
                stroke="#0B1B3A"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <path
                d="M17 5 v12"
                stroke="#E3B23C"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <circle cx="17" cy="19" r="3.4" fill="#E3B23C" />
            </g>
          </svg>
          {/* Info cards, number, title, description */}
          {MILESTONES.map((m, i) => {
            const done = i < reached;
            const current = i === reached;
            const active = done || current;
            return (
              <Link
                key={m.key}
                to={m.to}
                className="group absolute"
                style={{
                  // Start the box just past the flag (right) or at the card
                  // edge (left), and let it run toward the opposite edge. The
                  // small subtraction in maxWidth is the only gutter.
                  left:
                    m.side === "right" ? `calc(${pct(m.x, VB_W)} + 9%)` : "1%",
                  right:
                    m.side === "left"
                      ? `calc(${pct(VB_W - m.x, VB_W)} + 7%)`
                      : "1%",
                  maxWidth:
                    m.side === "right"
                      ? `calc(${pct(VB_W - m.x, VB_W)} - 1%)`
                      : `calc(${pct(m.x, VB_W)} - 2%)`,
                  top: pct(m.y - 30, VB_H),
                  transform: "translateY(-40%)",
                  textAlign: m.side === "right" ? "left" : "right",
                }}
              >
                <div
                  className="flex flex-col gap-y-0.5"
                  style={{
                    alignItems: m.side === "right" ? "flex-start" : "flex-end",
                  }}
                >
                  <span
                    className="text-lg font-black leading-none sm:text-xl"
                    style={{
                      color: active ? m.color : "#A2A2A2",
                      alignItems: "flex-start",
                    }}
                  >
                    {m.num}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 break-words text-[9px] font-black leading-tight group-hover:underline sm:text-[11px]",
                      active ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {m.title}
                  </span>
                </div>
                <p className="mt-0.5 hidden text-[11px] leading-snug text-ink-muted sm:block">
                  {m.desc}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
      <p className="pb-3 text-center text-xs text-ink-muted">
        {reached} of {MILESTONES.length} milestones complete · tap any step to
        open it
      </p>
      {/* Your universities list */}
      {props.apps.length > 0 && (
        <div className="max-h-[248px] space-y-2 overflow-y-auto px-5 pb-4">
          {shownApps.map((app) => {
            const d = daysLeft(app.deadline);
            const cfg = APP_STATUS_CFG[app.status];
            return (
              <Link
                key={app.id}
                to={`/journey/${app.id}`}
                className="flex items-center gap-3 rounded-xl border border-surface-border bg-white/90 px-4 py-3 transition hover:bg-white hover:shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-ink">
                      {app.university_name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                        cfg.cls,
                      )}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <p className="truncate text-xs text-ink-muted">
                    {app.program} · {app.country}
                  </p>
                </div>
                {d !== null && d >= 0 && (
                  <span
                    className={cn(
                      "shrink-0 text-xs font-black",
                      d <= 7
                        ? "text-red-500"
                        : d <= 30
                          ? "text-amber-500"
                          : "text-ink-subtle",
                    )}
                  >
                    {d === 0 ? "Today" : `${d}d`}
                  </span>
                )}
              </Link>
            );
          })}
          {shownApps.length === 0 && statusFilter && (
            <p className="rounded-xl bg-white/70 px-4 py-5 text-center text-xs text-ink-muted">
              No {APP_STATUS_CFG[statusFilter].label.toLowerCase()} applications
              yet.
            </p>
          )}
        </div>
      )}
      {/* Status strip, each count is a filter toggle */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-b-3xl border-t border-white/70 bg-[#D4DDE2]/60 px-4 py-3">
        {[
          {
            id: "planning" as AppStatus,
            n: counts.planning,
            label: "planning",
            color: "#7b7a77",
          },
          {
            id: "in_progress" as AppStatus,
            n: counts.in_progress,
            label: "in progress",
            color: "#3B82C4",
          },
          {
            id: "submitted" as AppStatus,
            n: counts.submitted,
            label: "submitted",
            color: "#7A5FC0",
          },
          {
            id: "accepted" as AppStatus,
            n: counts.accepted,
            label: "accepted",
            color: "#2FA37B",
          },
        ].map((st) => {
          const active = statusFilter === st.id;
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setStatusFilter(active ? null : st.id)}
              title={active ? "Show all applications" : `Show only ${st.label}`}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-ink transition",
                active ? "bg-white shadow-sm ring-2" : "hover:bg-white/80",
              )}
              style={
                active ? { ["--tw-ring-color" as string]: st.color } : undefined
              }
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: st.color }}
              />
              {st.n}{" "}
              <span className="font-semibold text-ink-muted">{st.label}</span>
              {active && (
                <span className="ml-0.5 text-xs text-ink-subtle">✕</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
// ── Mentor home (Unchanged) ──────────────────────────────────────────────────
function MentorHome() {
  const { profile, mentorProfile } = useAuth();
  const mp = mentorProfile;
  const SIDEBAR = [
    {
      to: "/mentor/dashboard",
      label: "Dashboard",
      icon: (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      to: "/resources",
      label: "Post Scholarships / Fellowships",
      icon: (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 10 12 5 2 10l10 5 10-5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
        </svg>
      ),
    },
    {
      to: "/events",
      label: "Post Events",
      icon: (
        <svg
          width="17"
          height="17"
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
      ),
    },
    {
      to: "/profile",
      label: "Profile",
      icon: (
        <svg
          width="17"
          height="17"
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
      ),
    },
  ];
  const ACTIONS = [
    {
      to: "/mentor/dashboard",
      title: "Student requests",
      desc: "Review and respond to mentorship requests assigned to you.",
      tint: "bg-navy-light text-navy",
    },
    {
      to: "/mentor/dashboard",
      title: "Your availability",
      desc: "Set weekly time slots so students can book your schedule.",
      tint: "bg-emerald-50 text-emerald-600",
    },
    {
      to: "/events",
      title: "Workshops & events",
      desc: "Host a workshop or webinar. Goes live after admin approval.",
      tint: "bg-[#5C7E8F]/15 text-[#5C7E8F]",
    },
    {
      to: "/resources",
      title: "Post a scholarship",
      desc: "Share funding opportunities you know are real and current.",
      tint: "bg-gold-soft text-gold-dark",
    },
    {
      to: "/profile",
      title: "Your profile",
      desc: "Bio, areas of expertise, availability, and photo.",
      tint: "bg-[#E2E8F0] text-[#334155]",
    },
    {
      to: "/resources/faq",
      title: "Mentor FAQ",
      desc: "Approvals, impact points, capacity, how it all works.",
      tint: "bg-[#E2E8F0] text-[#475569]",
    },
  ];
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5C7E8F]/25 via-[#D4DDE2]/60 to-white pt-14">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Mini sidebar */}
          <aside className="hidden h-fit rounded-3xl border border-white/70 bg-white/85 p-3 shadow-card backdrop-blur-sm lg:block">
            <nav className="space-y-1">
              {SIDEBAR.map((item, i) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold transition",
                    i === 0
                      ? "bg-navy-light/70 text-navy"
                      : "text-ink-muted hover:bg-surface-soft hover:text-ink",
                  )}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="leading-tight">{item.label}</span>
                </Link>
              ))}
            </nav>
            <div className="mt-4 flex items-center gap-3 border-t border-surface-border/60 px-2 pt-4">
              {profile?.avatar_url ? (
                <img
                  referrerPolicy="no-referrer"
                  src={profile.avatar_url}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <span className="block h-10 w-10 overflow-hidden rounded-full">
                  <DefaultAvatar className="h-10 w-10" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-ink">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <p className="text-xs text-ink-subtle">Mentor</p>
              </div>
            </div>
          </aside>
          {/* Main */}
          <div className="min-w-0 space-y-6">
            {/* Welcome card */}
            <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/60 p-6 shadow-card backdrop-blur-md sm:p-8">
              <div className="relative">
                <p className="text-xs font-black uppercase tracking-widest text-navy">
                  Mentor portal
                </p>
                <h1 className="mt-2 text-3xl font-black text-ink sm:text-4xl">
                  Welcome back, {profile?.first_name}.
                </h1>
                <p className="mt-2 text-sm text-ink-muted">
                  You're making a real difference for Ethiopian students going
                  abroad.
                </p>
                {mp && (
                  <div className="mt-5 grid max-w-md grid-cols-3 gap-3">
                    {[
                      {
                        to: "/profile",
                        value:
                          mp.avg_rating > 0
                            ? Number(mp.avg_rating).toFixed(1)
                            : "New",
                        label: "Rating",
                        tint: "bg-gold-soft text-gold-dark",
                        icon: (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
                          </svg>
                        ),
                      },
                      {
                        to: "/mentor/dashboard",
                        value: String(mp.total_sessions ?? 0),
                        label: "Sessions",
                        tint: "bg-emerald-50 text-emerald-600",
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
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          </svg>
                        ),
                      },
                      {
                        to: "/profile",
                        value: String(mp.areas?.length ?? 0),
                        label: "Areas",
                        tint: "bg-[#5C7E8F]/15 text-[#5C7E8F]",
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
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                          </svg>
                        ),
                      },
                    ].map((s) => (
                      <Link
                        key={s.label}
                        to={s.to}
                        className="min-w-0 rounded-2xl border border-surface-border bg-white p-3 transition hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-md"
                      >
                        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:items-center sm:gap-2.5 sm:text-left">
                          <span
                            className={cn(
                              "grid h-8 w-8 shrink-0 place-items-center rounded-full sm:h-9 sm:w-9",
                              s.tint,
                            )}
                          >
                            {s.icon}
                          </span>
                          <div className="min-w-0">
                            <p
                              className={cn(
                                "text-lg font-black leading-none",
                                s.label === "Rating"
                                  ? "text-gold-dark"
                                  : "text-ink",
                              )}
                            >
                              {s.value}
                            </p>
                            <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-wide text-ink-subtle sm:text-[10px]">
                              {s.label}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                <div className="mt-5 flex gap-3">
                  <Link
                    to="/mentor/dashboard"
                    className="min-w-0 flex-1 sm:flex-initial"
                  >
                    <Button className="w-full !px-3 text-xs sm:!px-5 sm:text-sm">
                      Go to dashboard
                    </Button>
                  </Link>
                  <Link to="/events" className="min-w-0 flex-1 sm:flex-initial">
                    <Button
                      variant="secondary"
                      className="w-full !px-3 text-xs sm:!px-5 sm:text-sm"
                    >
                      Browse events
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
            {/* Quick actions */}
            <div>
              <h2 className="mb-3 font-black text-ink">Quick actions</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {ACTIONS.map((card) => (
                  <Link
                    key={card.title}
                    to={card.to}
                    className="group rounded-3xl border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span
                      className={cn(
                        "grid h-11 w-11 place-items-center rounded-full",
                        card.tint,
                      )}
                    >
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
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                    <h3 className="mt-3 font-black text-ink">{card.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                      {card.desc}
                    </p>
                    <p className="mt-3 text-xs font-black text-navy transition group-hover:translate-x-0.5">
                      Open →
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// ── Student dashboard ─────────────────────────────────────────────────────────
function StudentHome() {
  const { profile } = useAuth();
  const { data: apps = [], isLoading: appsLoading } = useQuery({
    queryKey: qk.applications,
    queryFn: fetchApps,
  });
  // Checklist signals
  const appIds = apps.map((a) => a.id);
  const { data: matSignals } = useQuery({
    queryKey: ["home", "material-signals", appIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("application_materials")
        .select("name, status")
        .in("application_id", appIds)
        .eq("status", "done");
      const rows = (data ?? []) as { name: string; status: string }[];
      return {
        anyDone: rows.length > 0,
        testDone: rows.some(
          (r) =>
            r.name.toLowerCase().includes("test score") ||
            r.name.toLowerCase().includes("test result"),
        ),
      };
    },
    enabled: appIds.length > 0,
  });
  const { data: requests = [] } = useQuery({
    queryKey: ["home", "requests"],
    queryFn: fetchRequests,
  });
  const { data: closing = [] } = useQuery({
    queryKey: ["home", "closing-scholarships"],
    queryFn: fetchClosingScholarships,
  });
  if (appsLoading) return <PageSpinner />;
  // Next deadline
  const next = apps
    .filter(
      (a) => a.deadline && a.status !== "accepted" && a.status !== "rejected",
    )
    .map((a) => ({ app: a, d: daysLeft(a.deadline)! }))
    .filter((x) => x.d >= 0)
    .sort((a, b) => a.d - b.d)[0];
  const pendingRequests = requests.filter(
    (r) => r.status === "pending" || r.status === "approved",
  );
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#5C7E8F]/45 via-[#D4DDE2] to-white pt-14">
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6 lg:grid lg:min-h-[calc(100vh-8.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-stretch">
          {/* Left column. On phones it "dissolves" (display:contents) so its
              inner blocks join the outer flex and can be ordered around the
              journey card; on desktop it's a normal column again. */}
          <div className="contents min-w-0 lg:order-1 lg:block">
            {/* Greeting + Get-started: first on every screen */}
            <div className="order-1 lg:order-none">
              {/* Greeting */}
              <p className="text-xs font-black uppercase tracking-widest text-gold-dark">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <h1 className="mt-2 text-4xl font-black leading-tight text-ink sm:text-5xl">
                {profile?.first_name ? `Hi ${profile.first_name},` : "Hi,"}
                <br />
                here's what's next.
              </h1>
              <p className="mt-3 text-sm text-ink-muted">
                Every step forward counts. Let's keep the momentum going.
              </p>
              {/* Next deadline */}
              {next ? (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gold-soft px-6 py-5 shadow-card">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest text-gold-dark">
                      Next deadline
                    </p>
                    <p className="mt-1 truncate text-lg font-black text-ink">
                      {next.app.university_name} ,{" "}
                      {next.d === 0
                        ? "due today"
                        : `due in ${next.d} day${next.d === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <Link to={`/journey/${next.app.id}`} className="shrink-0">
                    <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink/80 px-5 py-2.5 text-sm font-bold text-ink transition hover:border-gold hover:bg-gold hover:text-ink">
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
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Open application
                    </span>
                  </Link>
                </div>
              ) : (
                <div className="mt-6 rounded-3xl bg-white/50 px-6 py-5 shadow-card">
                  <p className="text-xs font-black uppercase tracking-widest text-gold-dark">
                    Get started
                  </p>
                  <p className="mt-1 text-lg font-black text-ink">
                    Add your first university
                  </p>
                  <Link to="/journey" className="mt-3 inline-block">
                    <Button size="sm">Open journey →</Button>
                  </Link>
                </div>
              )}
            </div>
            {/* end greeting+get-started */}
            {/* Cards + community: after the journey on phones */}
            <div className="order-3 lg:order-none">
              {/* Cards */}
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                {/* Scholarships */}
                <div className="rounded-3xl border border-white/60 bg-white/60 p-5 shadow-card backdrop-blur-md">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-black text-ink">
                      Recent Scholarships / Fellowships
                    </h2>
                    <Link
                      to="/resources"
                      className="shrink-0 text-sm font-bold text-[#5C7E8F] transition hover:text-navy"
                    >
                      All →
                    </Link>
                  </div>
                  <div className="mt-4 space-y-2.5">
                    {closing.map((s) => (
                      <Link
                        key={s.id}
                        to="/resources"
                        className="flex items-baseline justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-sm transition hover:shadow-md"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-ink">
                            {s.title}
                          </p>
                          <p className="truncate text-xs text-ink-muted">
                            {s.provider}
                          </p>
                        </div>
                        {s.deadline && (
                          <span className="shrink-0 text-sm font-bold text-ink">
                            {new Date(s.deadline).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </Link>
                    ))}
                    {closing.length === 0 && (
                      <p className="rounded-2xl bg-white px-4 py-5 text-center text-sm text-ink-muted">
                        No open scholarships right now, check back soon.
                      </p>
                    )}
                  </div>
                </div>
                {/* Mentor requests */}
                <div className="rounded-3xl border border-white/60 bg-white/60 p-5 shadow-card backdrop-blur-md">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-black text-ink">
                      Your mentor requests
                    </h2>
                    <Link
                      to="/mentors/requests"
                      className="shrink-0 text-sm font-bold text-[#5C7E8F] transition hover:text-navy"
                    >
                      All →
                    </Link>
                  </div>
                  {pendingRequests.length > 0 ? (
                    <div className="mt-4 space-y-2.5">
                      {pendingRequests.slice(0, 3).map((r) => (
                        <Link
                          key={r.id}
                          to="/mentors/requests"
                          className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-sm transition hover:shadow-md"
                        >
                          <p className="min-w-0 truncate text-sm font-black text-ink">
                            {r.title}
                          </p>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                              r.status === "approved"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700",
                            )}
                          >
                            {r.status}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl bg-white/70 px-5 py-7 text-center">
                      <svg
                        className="mx-auto text-ink-subtle"
                        width="28"
                        height="28"
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
                      <p className="mx-auto mt-3 max-w-[220px] text-sm leading-relaxed text-ink-muted">
                        Nothing here yet, a 30-minute session with someone who's
                        done it can save you weeks.
                      </p>
                      <Link to="/mentors" className="mt-4 inline-block">
                        <span className="inline-block rounded-full bg-white px-5 py-2.5 text-sm font-bold text-ink shadow-sm transition hover:shadow-md">
                          Browse mentors
                        </span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              {/* Community */}
              <a
                href="https://chat.whatsapp.com/ExIJUHVsNUOGrJrXhXW7uV"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex items-center gap-3 rounded-3xl border border-emerald-200/70 bg-emerald-50/70 px-5 py-4 shadow-card backdrop-blur-sm transition hover:shadow-md"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-white">
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15L2 22l5.15-1.5A9.93 9.93 0 1 0 12.04 2zm0 18.1a8.1 8.1 0 0 1-4.14-1.14l-.3-.18-3.05.9.9-2.98-.2-.31a8.13 8.13 0 1 1 6.79 3.71zm4.45-6.08c-.24-.12-1.44-.71-1.66-.79s-.39-.12-.55.12-.63.79-.77.95-.28.18-.53.06a6.65 6.65 0 0 1-1.95-1.2 7.33 7.33 0 0 1-1.35-1.68c-.14-.24 0-.37.1-.5s.24-.28.37-.42a1.66 1.66 0 0 0 .24-.4.45.45 0 0 0 0-.43c-.06-.12-.55-1.32-.75-1.8s-.4-.42-.55-.42h-.47a.9.9 0 0 0-.65.3 2.73 2.73 0 0 0-.85 2 4.74 4.74 0 0 0 1 2.52 10.9 10.9 0 0 0 4.17 3.68 14 14 0 0 0 1.39.51 3.35 3.35 0 0 0 1.54.1 2.52 2.52 0 0 0 1.65-1.17 2 2 0 0 0 .14-1.16c-.06-.12-.22-.18-.46-.3z" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-ink">
                    Join our WhatsApp community
                  </span>
                  <span className="block text-xs text-ink-muted">
                    Scholarships, deadlines, and wins, shared daily.
                  </span>
                </span>
                <span className="shrink-0 text-xs font-black text-emerald-700">
                  Join →
                </span>
              </a>
            </div>
            {/* end cards+community */}
          </div>
          {/* Journey: second on phones (between greeting and the cards). */}
          <div className="order-2 min-w-0 lg:order-2">
            <JourneyCard
              apps={apps}
              anyMaterialDone={matSignals?.anyDone ?? false}
              testDone={matSignals?.testDone ?? false}
              embassySteps={
                (profile as { embassy_steps?: number[] } | null)
                  ?.embassy_steps ?? []
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
export default function HomePage() {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <PageSpinner />;
  if (profile?.role === "mentor") return <MentorHome />;
  return <StudentHome />;
}
