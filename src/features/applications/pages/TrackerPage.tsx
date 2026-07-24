import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageSpinner, Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { qk } from "@/lib/queryClient";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { APP_STATUS_CFG, DEGREE_LABELS } from "@/types";
import type {
  ApplicationMaterial,
  AppStatus,
  DegreeLevel,
  MaterialStatus,
} from "@/types";
import {
  addCustomMaterial,
  createApplication,
  deleteApplication,
  getApplicationDetail,
  getApplications,
  getMaterialFileUrl,
  removeMaterial,
  removeMaterialFile,
  updateApplication,
  uploadMaterialFile,
} from "../api";
import { updateMaterial } from "../api";

/*
 * /journey, the Application tracker, master-detail. Universities live in the
 * left rail; selecting one shows its header (checklist / deadline / documents
 * stats), the full checklist with uploads, and a progress ring. The layout
 * follows the light dashboard design: soft blue-grey wash, white rounded
 * cards, navy pills.
 */

// Steel family for process states; semantic green/red stay for outcomes.
const STATUS_CHIP: Record<AppStatus, string> = {
  planning: "bg-[#E2E8F0] text-[#475569]",
  in_progress: "bg-[#5C7E8F]/15 text-[#334155]",
  submitted: "bg-[#334155] text-white",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  declined: "bg-red-50 text-red-600",
};

// A deterministic tint for each university's initial square, so the rail has
// colour without needing uploaded logos.
// One calm steel tile for every university, the status chip carries meaning,
// the tile just carries the initial.
function tintFor(_name: string) {
  return "bg-gold-soft text-gold-dark";
}

function InitialSquare({
  name,
  size = "h-11 w-11 text-lg",
}: {
  name: string;
  size?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl font-black",
        size,
        tintFor(name),
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// ── Add-university modal ─────────────────────────────────────────────────────
// A starting list of universities students commonly consider, the field is a
// combo box: pick one or type any other name.
const UNIVERSITY_SUGGESTIONS = [
  "Arizona State University",
  "University of South Florida",
  "Michigan State University",
  "University of Minnesota",
  "Ohio State University",
  "Purdue University",
  "University of Texas at Arlington",
  "Wichita State University",
  "Jacksonville State University",
  "University of Toronto",
  "University of British Columbia",
  "McGill University",
  "University of Manitoba",
  "Memorial University of Newfoundland",
  "Technical University of Munich",
  "RWTH Aachen University",
  "University of Stuttgart",
  "University of Oxford",
  "University of Manchester",
  "University of Birmingham",
  "Uppsala University",
  "University of Helsinki",
  "University of Oslo",
  "E\u00f6tv\u00f6s Lor\u00e1nd University",
  "University of Debrecen",
  "Middle East Technical University",
  "Tsinghua University",
  "Zhejiang University",
  "University of Tokyo",
  "Seoul National University",
];

const DESTINATIONS = [
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
  "Other",
];

const createSchema = z.object({
  university_name: z.string().min(2, "Required"),
  country: z.string().min(1, "Pick a destination"),
  custom_country: z.string().optional(),
  program: z.string().min(2, "e.g. MSc Computer Science"),
  degree_level: z.enum(["bachelor", "masters", "phd", "other"] as const),
  deadline: z.string().min(1, "Deadline is required"),
  portal_url: z.string().url("Enter a valid URL").or(z.literal("")).optional(),
});
type CreateValues = z.infer<typeof createSchema>;

function AddUniversityModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id?: string) => void;
}) {
  const { profile } = useAuth();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { degree_level: "masters" },
  });
  const watchCountry = watch("country");

  const create = useMutation({
    mutationFn: (v: CreateValues) =>
      createApplication(profile!.id, {
        university_name: v.university_name,
        country:
          v.country === "Other" && v.custom_country?.trim()
            ? v.custom_country.trim()
            : v.country,
        program: v.program,
        degree_level: v.degree_level as DegreeLevel,
        deadline: v.deadline,
        portal_url: v.portal_url || null,
      }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-modal">
        <h2 className="text-lg font-black text-ink">Add a university</h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          We'll build the document checklist for you.
        </p>
        <form
          onSubmit={handleSubmit((v) => create.mutate(v))}
          className="mt-5 space-y-4"
          noValidate
        >
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              University
            </label>
            <input
              list="uni-suggestions"
              placeholder="Pick from the list or type your own"
              {...register("university_name")}
            />
            <datalist id="uni-suggestions">
              {UNIVERSITY_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            {errors.university_name && (
              <p className="mt-1 text-xs text-red-600">
                {errors.university_name.message}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                Country
              </label>
              <select
                {...register("country")}
                defaultValue=""
                className="rounded-xl border border-surface-border px-3 py-3 text-sm"
              >
                <option value="" disabled>
                  Where is it?
                </option>
                {DESTINATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {watchCountry === "Other" && (
                <input
                  className="mt-2"
                  placeholder="Type the country"
                  {...register("custom_country")}
                />
              )}
              {errors.country && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.country.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                Degree level
              </label>
              <select
                {...register("degree_level")}
                className="rounded-xl border border-surface-border px-3 py-3 text-sm"
              >
                <option value="bachelor">Bachelor's</option>
                <option value="masters">Master's</option>
                <option value="phd">PhD</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <Input
            label="Program"
            placeholder="MSc Computer Science"
            {...register("program")}
            error={errors.program?.message}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Deadline"
              required
              type="date"
              {...register("deadline")}
              error={errors.deadline?.message}
            />
            <Input
              label="Application portal (optional)"
              placeholder="https://…"
              {...register("portal_url")}
              error={errors.portal_url?.message}
            />
          </div>
          {create.isError && (
            <p className="text-xs text-red-600">
              {(create.error as Error).message}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add university"}
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

// ── Checklist row ────────────────────────────────────────────────────────────
const MAT_LABEL: Record<MaterialStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

function ChecklistRow({
  m,
  busy,
  onCycle,
  onUpload,
  onOpenFile,
  onRemoveFile,
  onRemove,
}: {
  m: ApplicationMaterial;
  busy: boolean;
  onCycle: () => void;
  onUpload: (f: File) => void;
  onOpenFile: () => void;
  onRemoveFile: () => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const done = m.status === "done";

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3.5 transition",
        done
          ? "border-emerald-200 bg-emerald-50/70"
          : "border-surface-border bg-white",
      )}
    >
      <div className="flex items-center gap-3">
        {/* Status circle */}
        <button
          onClick={onCycle}
          disabled={busy}
          aria-label="Cycle status"
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition",
            done
              ? "border-emerald-500 bg-emerald-500"
              : m.status === "in_progress"
                ? "border-blue-400"
                : "border-surface-border bg-white",
          )}
        >
          {done && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
          {m.status === "in_progress" && (
            <span className="h-2 w-2 rounded-full bg-blue-400" />
          )}
        </button>

        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-bold",
            done ? "text-emerald-700" : "text-ink",
          )}
        >
          {m.name}
        </span>

        {done ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            Done
          </span>
        ) : (
          <span className="shrink-0 text-xs font-semibold text-ink-subtle">
            {MAT_LABEL[m.status]}
          </span>
        )}

        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="shrink-0 rounded-full border border-surface-border bg-white px-3.5 py-1.5 text-xs font-bold text-ink shadow-sm transition hover:shadow-md disabled:opacity-40"
        >
          {busy ? (
            <Spinner className="h-3.5 w-3.5" />
          ) : m.file_url ? (
            "Replace"
          ) : (
            "Upload"
          )}
        </button>

        {/* ⋯ menu */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-lg px-1.5 py-1 text-lg font-black leading-none text-ink-subtle transition hover:text-ink"
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-surface-border bg-white py-1 shadow-modal">
                {m.file_url && (
                  <>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenFile();
                      }}
                      className="block w-full px-4 py-2 text-left text-xs font-semibold text-ink hover:bg-surface-soft"
                    >
                      View file
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onRemoveFile();
                      }}
                      className="block w-full px-4 py-2 text-left text-xs font-semibold text-ink hover:bg-surface-soft"
                    >
                      Remove file
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    if (confirm(`Remove "${m.name}" from this checklist?`))
                      onRemove();
                  }}
                  className="block w-full px-4 py-2 text-left text-xs font-semibold text-red-500 hover:bg-red-50"
                >
                  Remove item
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {m.file_url && (
        <button
          onClick={onOpenFile}
          className="mt-1.5 block w-full truncate pl-9 pr-3 text-left text-xs font-bold text-navy hover:underline"
        >
          {m.file_name ?? "Attached file"}
        </button>
      )}
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);

  const { data: app, isLoading } = useQuery({
    queryKey: qk.applicationDetail(id),
    queryFn: () => getApplicationDetail(id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.applicationDetail(id) });
    qc.invalidateQueries({ queryKey: qk.applications });
  };

  const updateStatus = useMutation({
    mutationFn: (status: AppStatus) => updateApplication(id, { status }),
    onSuccess: invalidate,
  });
  const cycleMat = useMutation({
    mutationFn: ({
      matId,
      current,
    }: {
      matId: string;
      current: MaterialStatus;
    }) => {
      const next: MaterialStatus =
        current === "not_started"
          ? "in_progress"
          : current === "in_progress"
            ? "done"
            : "not_started";
      if (next === "done" && !confirm("Mark this item as done?"))
        return Promise.resolve();
      return updateMaterial(matId, { status: next });
    },
    onSuccess: invalidate,
  });
  const addItem = useMutation({
    mutationFn: () => addCustomMaterial(id, newItem.trim()),
    onSuccess: () => {
      setNewItem("");
      setAddingItem(false);
      invalidate();
    },
  });
  const removeItem = useMutation({
    mutationFn: removeMaterial,
    onSuccess: invalidate,
  });
  const upload = useMutation({
    mutationFn: async ({ m, file }: { m: ApplicationMaterial; file: File }) => {
      if (!userId) throw new Error("Not signed in.");
      setBusyId(m.id);
      await uploadMaterialFile(m, userId, file);
    },
    onSuccess: invalidate,
    onSettled: () => setBusyId(null),
    onError: (e) => alert(e instanceof Error ? e.message : "Upload failed."),
  });
  const dropFile = useMutation({
    mutationFn: async (m: ApplicationMaterial) => {
      setBusyId(m.id);
      await removeMaterialFile(m);
    },
    onSuccess: invalidate,
    onSettled: () => setBusyId(null),
  });
  const deleteApp = useMutation({
    mutationFn: () => deleteApplication(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.applications });
      onDeleted();
    },
  });

  const openFile = async (m: ApplicationMaterial) => {
    if (!m.file_url) return;
    try {
      const url = await getMaterialFileUrl(m.file_url);
      if (/\.(jpe?g|png|webp|gif)$/i.test(m.file_name ?? "")) {
        setPreviewUrl(url);
        setPreviewName(m.file_name);
      } else {
        window.open(url, "_blank", "noopener");
      }
    } catch {
      alert("Could not open that file. Try re-uploading it.");
    }
  };

  if (isLoading)
    return (
      <div className="py-24">
        <PageSpinner />
      </div>
    );
  if (!app)
    return (
      <p className="py-24 text-center text-sm text-ink-muted">
        Application not found.
      </p>
    );

  const done = app.materials.filter((m) => m.status === "done").length;
  const inProgress = app.materials.filter(
    (m) => m.status === "in_progress",
  ).length;
  const notStarted = app.materials.filter(
    (m) => m.status === "not_started",
  ).length;
  const uploaded = app.materials.filter((m) => m.file_url).length;
  const pctNum =
    app.materials.length > 0
      ? Math.round((done / app.materials.length) * 100)
      : 0;

  return (
    <div className="min-w-0">
      {/* Header card: identity + the three stats. Sticky, so the university
          name stays with you while you scroll a long checklist. */}
      <div className="sticky top-16 z-20 rounded-3xl border border-white/60 bg-white/80 p-5 shadow-card backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-4">
          <InitialSquare name={app.university_name} size="h-16 w-16 text-2xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-black text-ink">
                {app.university_name}
              </h2>
              <select
                value={app.status}
                onChange={(e) =>
                  updateStatus.mutate(e.target.value as AppStatus)
                }
                className={cn(
                  "!w-auto cursor-pointer !rounded-full !border-0 !px-3 !py-1 text-xs font-bold",
                  STATUS_CHIP[app.status],
                )}
              >
                {(Object.keys(APP_STATUS_CFG) as AppStatus[])
                  .filter((s) => s !== "declined")
                  .map((s) => (
                    <option key={s} value={s}>
                      {APP_STATUS_CFG[s].label}
                    </option>
                  ))}
              </select>
            </div>
            <p className="mt-0.5 truncate text-sm text-ink-muted">
              {DEGREE_LABELS[app.degree_level]} · {app.program} · {app.country}
            </p>
          </div>

          <div className="flex gap-8 pr-2">
            {[
              { label: "Checklist", value: `${done}/${app.materials.length}` },
              {
                label: "Deadline",
                value: app.deadline
                  ? new Date(app.deadline).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Not set",
              },
              { label: "Documents", value: `${uploaded} uploaded` },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-[10px] font-black uppercase tracking-widest text-gold-dark">
                  {s.label}
                </p>
                <p className="mt-1 text-lg font-black text-ink">{s.value}</p>
              </div>
            ))}
            <button
              onClick={() => {
                if (
                  confirm(
                    `Delete ${app.university_name}? This removes its checklist and uploads too.`,
                  )
                ) {
                  deleteApp.mutate();
                }
              }}
              disabled={deleteApp.isPending}
              title="Delete this university"
              aria-label="Delete this university"
              className="grid h-10 w-10 shrink-0 place-items-center self-start rounded-xl text-ink-subtle transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            >
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
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px]">
        {/* Checklist */}
        <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-card backdrop-blur-sm">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="text-lg font-black text-ink">Checklist</h3>
              <p className="text-xs text-ink-muted">
                {done} of {app.materials.length} complete
              </p>
            </div>
          </div>

          <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {app.materials.map((m) => (
              <ChecklistRow
                key={m.id}
                m={m}
                busy={busyId === m.id}
                onCycle={() =>
                  cycleMat.mutate({ matId: m.id, current: m.status })
                }
                onUpload={(f) => upload.mutate({ m, file: f })}
                onOpenFile={() => openFile(m)}
                onRemoveFile={() => dropFile.mutate(m)}
                onRemove={() => removeItem.mutate(m.id)}
              />
            ))}
          </div>

          {/* Add-a-requirement zone, its own tinted block so it reads as a
              distinct action area, not a continuation of the checklist. */}
          <div className="mt-4 rounded-2xl border border-dashed border-[#94A3B8]/60 bg-[#E2E8F0]/70 p-4">
            {addingItem ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newItem.trim()) addItem.mutate();
                }}
                className="flex gap-2"
              >
                <input
                  autoFocus
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  placeholder="e.g. Portfolio, GRE score, financial affidavit"
                  className="flex-1 !bg-white !py-2 !text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!newItem.trim() || addItem.isPending}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setAddingItem(false);
                    setNewItem("");
                  }}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <button
                onClick={() => setAddingItem(true)}
                className="flex w-full items-center gap-2.5 text-left text-sm font-bold text-[#334155] transition hover:text-ink"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-base font-black text-[#5C7E8F] shadow-sm">
                  +
                </span>
                Add a requirement for this university
              </button>
            )}
            <p className="mt-2.5 text-xs leading-relaxed text-[#475569]">
              We start you with what most applications need. Add anything your
              university asks for, remove what it doesn't, and upload each
              document so your mentor can review it.
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="h-fit rounded-3xl border border-white/70 bg-white/80 p-5 shadow-card backdrop-blur-sm">
          <h3 className="text-lg font-black text-ink">Progress</h3>
          <div className="mt-3 space-y-2 text-sm">
            {[
              { label: "Done", n: done },
              { label: "In Progress", n: inProgress },
              { label: "Not Started", n: notStarted },
            ].map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between border-b border-surface-border/60 pb-2 last:border-0"
              >
                <span className="font-semibold text-ink-muted">{r.label}</span>
                <span className="font-black text-ink">{r.n}</span>
              </div>
            ))}
          </div>

          {/* Ring */}
          <div className="mx-auto mt-5 w-fit">
            <svg width="130" height="130" viewBox="0 0 130 130">
              <circle
                cx="65"
                cy="65"
                r="56"
                fill="none"
                stroke="#E7EAF1"
                strokeWidth="10"
              />
              <circle
                cx="65"
                cy="65"
                r="56"
                fill="none"
                stroke="#2FA37B"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(pctNum / 100) * 2 * Math.PI * 56} ${2 * Math.PI * 56}`}
                transform="rotate(-90 65 65)"
              />
              <text
                x="65"
                y="62"
                textAnchor="middle"
                fontSize="24"
                fontWeight="800"
                fill="#334155"
              >
                {pctNum}%
              </text>
              <text
                x="65"
                y="82"
                textAnchor="middle"
                fontSize="11"
                fill="#8B93A7"
              >
                Complete
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* Inline image preview for uploaded pictures */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => e.target === e.currentTarget && setPreviewUrl(null)}
        >
          <div className="relative max-h-[92vh] max-w-3xl">
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -right-3 -top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white text-ink shadow-modal"
            >
              ✕
            </button>
            <img
              src={previewUrl}
              alt={previewName ?? "Document preview"}
              className="max-h-[90vh] max-w-full rounded-2xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TrackerPage() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: apps = [], isLoading } = useQuery({
    queryKey: qk.applications,
    queryFn: getApplications,
  });

  // Selection follows the URL when present, else defaults to the first app.
  const selectedId = routeId ?? apps[0]?.id ?? null;

  // Quick delete straight from the list. If the open one is removed, fall back
  // to the journey root so the detail pane doesn't point at a dead id.
  const deleteFromList = useMutation({
    mutationFn: (appId: string) => deleteApplication(appId),
    onSuccess: (_data, appId) => {
      qc.invalidateQueries({ queryKey: qk.applications });
      if (appId === selectedId) navigate("/journey", { replace: true });
    },
  });
  useEffect(() => {
    if (!routeId && apps[0])
      navigate(`/journey/${apps[0].id}`, { replace: true });
  }, [routeId, apps, navigate]);

  if (isLoading) return <PageSpinner />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5C7E8F]/25 via-[#D4DDE2]/60 to-white pt-14">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link
          to="/home"
          className="text-sm font-bold text-ink-muted transition hover:text-ink"
        >
          ← Back to dashboard
        </Link>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-ink">
              Application tracker
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Track every university in one place.
            </p>
          </div>
          <Button onClick={() => setAdding(true)}>+ Add university</Button>
        </div>

        {apps.length === 0 ? (
          <div className="mt-10 rounded-3xl border-2 border-dashed border-ink/15 bg-white/60 p-14 text-center backdrop-blur-sm">
            <h2 className="text-lg font-black text-ink">No universities yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
              Add the first university you're considering and we'll build the
              document checklist for you.
            </p>
            <Button className="mt-4" onClick={() => setAdding(true)}>
              + Add university
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            {/* ── Left rail ── */}
            <div className="flex h-fit flex-col rounded-3xl border border-white/70 bg-white/70 p-4 shadow-card backdrop-blur-sm">
              <h2 className="px-1 pb-3 font-black text-ink">
                Your universities
              </h2>
              <div className="space-y-2">
                {apps.map((app) => {
                  const active = app.id === selectedId;
                  return (
                    <div
                      key={app.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-2xl border px-3 py-3 transition",
                        active
                          ? "border-blue-300 bg-blue-50/70 shadow-sm"
                          : "border-transparent bg-white hover:border-surface-border",
                      )}
                    >
                      <button
                        onClick={() => navigate(`/journey/${app.id}`)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <InitialSquare
                          name={app.university_name}
                          size="h-10 w-10 text-base"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-ink">
                            {app.university_name}
                          </span>
                          <span className="block truncate text-xs text-ink-muted">
                            {DEGREE_LABELS[app.degree_level]} · {app.program} ·{" "}
                            {app.country}
                          </span>
                        </span>
                      </button>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold",
                          STATUS_CHIP[app.status],
                        )}
                      >
                        {APP_STATUS_CFG[app.status].label}
                      </span>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Delete ${app.university_name}? This removes its checklist and uploads too.`,
                            )
                          ) {
                            deleteFromList.mutate(app.id);
                          }
                        }}
                        disabled={deleteFromList.isPending}
                        title="Delete this university"
                        aria-label={`Delete ${app.university_name}`}
                        className="shrink-0 rounded-lg p-1.5 text-ink-subtle opacity-0 transition hover:bg-red-50 hover:text-red-500 focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                      >
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
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Detail ── */}
            {selectedId && (
              <DetailPanel
                id={selectedId}
                onDeleted={() => {
                  qc.invalidateQueries({ queryKey: qk.applications });
                  navigate("/journey", { replace: true });
                }}
              />
            )}
          </div>
        )}
      </div>

      {adding && (
        <AddUniversityModal
          onClose={() => setAdding(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: qk.applications })}
        />
      )}
    </div>
  );
}
