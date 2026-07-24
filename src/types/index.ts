// ─────────────────────────────────────────────────────────────────────────────
// Database-matched types
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = "mentee" | "mentor";
export type MentorStatus = "pending" | "approved" | "rejected";
export type RequestStatus =
  | "pending"
  | "approved"
  | "declined"
  | "cancelled"
  | "completed";
export type AppStatus =
  | "planning"
  | "in_progress"
  | "submitted"
  | "accepted"
  | "rejected"
  | "declined";
export type MaterialStatus = "not_started" | "in_progress" | "done";
export type DegreeLevel = "bachelor" | "masters" | "phd" | "other";
export type ScholarshipType = "full" | "partial" | "loan" | "grant" | "other";
export type ServiceType =
  | "ielts_prep"
  | "toefl_prep"
  | "essay_review"
  | "sop_review"
  | "university_selection"
  | "visa_guidance"
  | "mock_interview"
  | "fee_payment"
  | "scholarship_advice"
  | "general";

export interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  avatar_url: string | null;
  phone: string | null;
  country: string | null;
  total_points: number;
  is_admin?: boolean;
  created_at: string;
  updated_at: string;
}

export interface MentorProfile {
  id: string;
  user_id: string;
  current_location: string;
  current_job: string;
  university: string;
  graduation_year: number | null;
  linkedin_url: string | null;
  bio: string;
  areas: string[];
  status: MentorStatus;
  status_note: string | null;
  reviewed_at: string | null;
  total_sessions: number;
  avg_rating: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequest {
  id: string;
  mentee_id: string;
  mentor_id: string | null;
  service_type: ServiceType;
  title: string;
  description: string;
  status: RequestStatus;
  topics: string[];
  preferred_date: string | null;
  preferred_time: string | null;
  booked_day: number | null;
  booked_time: string | null;
  meet_link: string | null;
  scheduled_at: string | null;
  admin_note: string | null;
  responded_at: string | null;
  scheduled_for: string | null;
  rating: number | null;
  review: string | null;
  reviewed_at: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  mentee_id: string;
  university_name: string;
  country: string;
  program: string;
  degree_level: DegreeLevel;
  deadline: string | null;
  status: AppStatus;
  notes: string | null;
  portal_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationMaterial {
  id: string;
  application_id: string;
  name: string;
  description?: string;
  status: MaterialStatus;
  is_custom: boolean;
  notes: string | null;
  /** Uploaded evidence: a signed path in the private `documents` bucket. */
  file_url: string | null;
  file_name: string | null;
  uploaded_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ApplicationDetail extends Application {
  materials: ApplicationMaterial[];
}

export interface Scholarship {
  click_count?: number;
  id: string;
  posted_by: string;
  title: string;
  description: string;
  provider: string;
  type: ScholarshipType;
  amount: string | null;
  deadline: string | null;
  link: string | null;
  eligible_levels: DegreeLevel[];
  eligible_countries: string[] | null;
  is_active: boolean;
  /** Set by an admin; only verified scholarships are shown publicly. */
  is_verified?: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeeRequest {
  id: string;
  mentee_id: string;
  fee_type: string;
  amount_usd: number;
  amount_birr: number | null;
  recipient_name: string;
  recipient_ref: string | null;
  notes: string | null;
  status: RequestStatus;
  paid_at: string | null;
  receipt_url: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// App-level constants
// ─────────────────────────────────────────────────────────────────────────────

export const MENTORSHIP_AREAS = [
  "English Test Prep",
  "University Selection",
  "Essay & SOP Review",
  "Scholarship Guidance",
  "Visa & Embassy Prep",
  "Pre-Arrival & Settling In",
  "Academic Life Advice",
  "Career & Internships",
] as const;
export type MentorshipArea = (typeof MENTORSHIP_AREAS)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  ielts_prep: "English Test Prep",
  toefl_prep: "English Test Prep",  // legacy rows only, hidden from new selects
  essay_review: "Essay Review",
  sop_review: "SOP Review",
  university_selection: "University Selection",
  visa_guidance: "Visa & Embassy Guidance",
  mock_interview: "Mock Interview",
  fee_payment: "Fee Payment Assistance",
  scholarship_advice: "Scholarship Advice",
  general: "General Inquiry",
};

// toefl_prep is folded into English Test Prep, kept in labels for legacy rows
export const SERVICE_TYPES = (Object.keys(SERVICE_TYPE_LABELS) as ServiceType[])
  // toefl_prep folded into English Test Prep; mock_interview is a paid booking
  // with its own page at /services/mock-interview.
  .filter(t => t !== "toefl_prep" && t !== "mock_interview");

export const DEGREE_LABELS: Record<DegreeLevel, string> = {
  bachelor: "Bachelor's",
  masters: "Master's",
  phd: "PhD",
  other: "Other",
};

export const APP_STATUS_CFG: Record<AppStatus, { label: string; cls: string }> =
  {
    planning: { label: "Planning", cls: "bg-[#E2E8F0] text-[#475569]" },
    in_progress: { label: "In progress", cls: "bg-[#5C7E8F]/15 text-[#334155]" },
    submitted: { label: "Submitted", cls: "bg-[#334155] text-white" },
    accepted: { label: "Accepted ✓", cls: "bg-emerald-50 text-emerald-700" },
    rejected: { label: "Rejected", cls: "bg-red-50 text-red-600" },
    declined: { label: "Declined", cls: "bg-slate-100 text-slate-500" },
  };

export const REQUEST_STATUS_CFG: Record<
  RequestStatus,
  { label: string; cls: string }
> = {
  pending: { label: "Pending", cls: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  declined: { label: "Declined", cls: "bg-red-50 text-red-600" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
  completed: { label: "Completed", cls: "bg-blue-50 text-blue-700" },
};

export const MATERIAL_STATUS_CFG: Record<
  MaterialStatus,
  { label: string; color: string }
> = {
  not_started: { label: "Not started", color: "#d1d5db" },
  in_progress: { label: "In progress", color: "#f59e0b" },
  done: { label: "Done", color: "#10b981" },
};

export const FEE_TYPES = [
  "SEVIS Fee",
  "IELTS Fee",
  "TOEFL Fee",
  "University App Fee",
  "Visa Fee",
  "Other",
];

export const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

// IELTS journey steps (static but accurate)
export const IELTS_STEPS = [
  {
    id: 1,
    title: "Choose your test format",
    desc: "Academic (for university admission) vs General Training (for work/migration). Most universities require Academic.",
    action: "Decide format",
  },
  {
    id: 2,
    title: "Register for the test",
    desc: "Register at ielts.org or through a local British Council/IDP centre. Test centres in Ethiopia are in Addis Ababa.",
    action: "Register now",
  },
  {
    id: 3,
    title: "Prepare (8–12 weeks)",
    desc: "Study all four bands: Listening, Reading, Writing, Speaking. Target score: 6.5+ for most graduate programs.",
    action: "Request IELTS coaching",
  },
  {
    id: 4,
    title: "Take the test",
    desc: "Arrive 30 min early with your passport. Results in 3–5 days (online/computer) or 13 days (paper).",
    action: "Book test date",
  },
  {
    id: 5,
    title: "Receive & send scores",
    desc: "Download your Test Report Form. Send scores directly to universities from your IELTS account.",
    action: "Send scores",
  },
];

// Embassy/Visa journey steps
export const EMBASSY_STEPS = [
  {
    id: 1,
    title: "Receive I-20 / Admission letter",
    desc: "Your university issues the I-20 (US) or equivalent after you pay the enrollment deposit.",
    docs: ["I-20 form", "Acceptance letter"],
  },
  {
    id: 2,
    title: "Pay SEVIS fee",
    desc: "US students pay $350 SEVIS fee at fmjfee.com before scheduling the visa interview. We can help pay this.",
    docs: ["SEVIS receipt (I-901)"],
    fee: true,
  },
  {
    id: 3,
    title: "Complete DS-160 form",
    desc: "Fill the online US visa application (DS-160) at ceac.state.gov. Save your barcode.",
    docs: ["DS-160 barcode"],
  },
  {
    id: 4,
    title: "Schedule visa interview",
    desc: "Book at the US Embassy in Addis Ababa via ustraveldocs.com. Pay the MRV fee (~$185).",
    docs: ["Interview appointment letter"],
    fee: true,
  },
  {
    id: 5,
    title: "Prepare documents",
    desc: "Gather all required documents below.",
    docs: [
      "Valid passport",
      "I-20",
      "DS-160 barcode",
      "SEVIS receipt",
      "Financial proof",
      "Transcripts & test scores",
      "Acceptance letter",
      "Passport photos",
    ],
  },
  {
    id: 6,
    title: "Attend interview",
    desc: "Arrive 30 min early. Answer questions clearly and confidently. Request a mock interview from us.",
    docs: [],
    mockInterview: true,
  },
  {
    id: 7,
    title: "Visa decision & passport return",
    desc: "If approved, your passport with visa is mailed back within 3–5 days.",
    docs: ["Visa-stamped passport"],
  },
];

export type EventStatus = "pending" | "approved" | "rejected" | "cancelled";
export type EventType =
  | "workshop"
  | "webinar"
  | "info_session"
  | "qa"
  | "other";

export interface AppEvent {
  id: string;
  host_id: string;
  title: string;
  description: string;
  type: EventType;
  status: EventStatus;
  meet_link: string | null;
  scheduled_at: string | null;
  duration_min: number;
  max_attendees: number | null;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  user_id: string;
  created_at: string;
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  workshop: "Workshop",
  webinar: "Webinar",
  info_session: "Info Session",
  qa: "Q&A Session",
  other: "Other",
};

export const EVENT_STATUS_CFG: Record<
  EventStatus,
  { label: string; cls: string }
> = {
  pending: { label: "Pending review", cls: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-600" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
};

export const HOBBY_SUGGESTIONS = [
  "Football",
  "Basketball",
  "Running",
  "Hiking",
  "Swimming",
  "Reading",
  "Writing",
  "Photography",
  "Music",
  "Guitar",
  "Piano",
  "Cooking",
  "Baking",
  "Travel",
  "Art & Drawing",
  "Painting",
  "Chess",
  "Gaming",
  "Coding side projects",
  "Volunteering",
  "Podcasting",
  "Film & Cinema",
  "Dancing",
  "Yoga",
  "Fitness",
] as const;
