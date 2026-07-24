import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { assertUpdated } from '@/lib/safeUpdate';
import { useAuth } from '@/features/auth/hooks/useAuth';

/*
 * Admin-authored content. Admins publish scholarships and events directly , 
 * triggers in 008 mark their submissions verified/approved on insert, so there
 * is no queue to clear afterwards. The same forms edit anything already posted.
 */

// ── Scholarship ──────────────────────────────────────────────────────────────
const scholarshipSchema = z.object({
  title:       z.string().min(5, "Use the scholarship's full name"),
  provider:    z.string().min(2, 'Who offers it?'),
  type:        z.enum(['full', 'partial', 'loan', 'grant', 'other'] as const),
  amount:      z.string().optional(),
  description: z.string().min(30, 'Describe who it is for and what it covers'),
  deadline:    z.string().min(1, 'A deadline is required'),
  link:        z.string().url('The official link is required'),
  eligible_levels: z.array(z.string()).min(1, 'Pick at least one level'),
});
type ScholarshipValues = z.infer<typeof scholarshipSchema>;

export interface EditableScholarship {
  id: string; title: string; provider: string; type: string;
  amount: string | null; description: string; deadline: string | null;
  link: string | null; eligible_levels: string[];
}

const LEVELS = ['bachelor', 'masters', 'phd'] as const;

export function ScholarshipForm({ initial, onClose }: {
  initial?: EditableScholarship;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const [levels, setLevels] = useState<string[]>(initial?.eligible_levels ?? ['masters']);

  const { register, handleSubmit, setValue, formState: { errors } } =
    useForm<ScholarshipValues>({
      resolver: zodResolver(scholarshipSchema),
      defaultValues: initial
        ? {
            title: initial.title,
            provider: initial.provider,
            type: initial.type as ScholarshipValues['type'],
            amount: initial.amount ?? '',
            description: initial.description,
            deadline: initial.deadline ?? '',
            link: initial.link ?? '',
            eligible_levels: initial.eligible_levels,
          }
        : { type: 'full', eligible_levels: ['masters'] },
    });

  useEffect(() => { setValue('eligible_levels', levels); }, [levels, setValue]);

  const save = useMutation({
    mutationFn: async (v: ScholarshipValues) => {
      const payload = {
        title: v.title,
        provider: v.provider,
        type: v.type,
        amount: v.amount || null,
        description: v.description,
        deadline: v.deadline,
        link: v.link,
        eligible_levels: levels,
      };
      if (initial) {
        await assertUpdated(
          supabase.from('scholarships').update(payload).eq('id', initial.id).select('id'),
        );
      } else {
        const { error } = await supabase
          .from('scholarships')
          .insert({ ...payload, posted_by: userId, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.admin('scholarships') });
      onClose();
    },
  });

  return (
    <form onSubmit={handleSubmit(v => save.mutate(v))} className="space-y-3" noValidate>
      <Input label="Title" placeholder="Chevening Scholarship"
        {...register('title')} error={errors.title?.message} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Provider" placeholder="UK Government"
          {...register('provider')} error={errors.provider?.message} />
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Type</label>
          <select {...register('type')} className="rounded-xl border border-surface-border px-3 py-3 text-sm">
            <option value="full">Full funding</option>
            <option value="partial">Partial</option>
            <option value="grant">Grant</option>
            <option value="loan">Loan</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Amount (optional)" placeholder="Full tuition + stipend"
          {...register('amount')} />
        <Input label="Deadline" type="date"
          {...register('deadline')} error={errors.deadline?.message} />
      </div>
      <Input label="Official link" placeholder="https://…"
        {...register('link')} error={errors.link?.message} />
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-ink">Description</label>
        <textarea rows={3} {...register('description')} className="resize-none"
          placeholder="Who is eligible, what it covers, how to apply…" />
        {errors.description && (
          <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
        )}
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold text-ink">Eligible levels</label>
        <div className="flex gap-2">
          {LEVELS.map(l => (
            <button key={l} type="button"
              onClick={() => setLevels(p => p.includes(l) ? p.filter(x => x !== l) : [...p, l])}
              className={
                levels.includes(l)
                  ? 'rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white'
                  : 'rounded-full border border-surface-border px-3 py-1.5 text-xs font-bold text-ink-muted'
              }>
              {l}
            </button>
          ))}
        </div>
        {errors.eligible_levels && (
          <p className="mt-1 text-xs text-red-600">{errors.eligible_levels.message}</p>
        )}
      </div>
      {save.isError && <p className="text-xs text-red-600">{(save.error as Error).message}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : initial ? 'Save changes' : 'Publish scholarship'}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

// ── Event ────────────────────────────────────────────────────────────────────
const eventSchema = z.object({
  title:        z.string().min(5, 'Give the event a clear title'),
  description:  z.string().min(20, 'What will attendees get out of it?'),
  type:         z.enum(['workshop', 'webinar', 'info_session', 'qa', 'other'] as const),
  scheduled_at: z.string().min(1, 'Pick a date and time'),
  duration_min: z.coerce.number().min(15).max(480),
  max_attendees: z.coerce.number().min(1).max(1000).optional(),
  meet_link:    z.string().url('Enter a valid link').or(z.literal('')).optional(),
});
type EventValues = z.infer<typeof eventSchema>;

export interface EditableEvent {
  id: string; title: string; description: string; type: string;
  scheduled_at: string | null; duration_min: number;
  max_attendees: number | null; meet_link: string | null;
}

export function EventForm({ initial, onClose }: {
  initial?: EditableEvent;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { userId } = useAuth();

  const { register, handleSubmit, formState: { errors } } = useForm<EventValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: initial
      ? {
          title: initial.title,
          description: initial.description,
          type: initial.type as EventValues['type'],
          scheduled_at: initial.scheduled_at
            ? new Date(initial.scheduled_at).toISOString().slice(0, 16)
            : '',
          duration_min: initial.duration_min,
          max_attendees: initial.max_attendees ?? undefined,
          meet_link: initial.meet_link ?? '',
        }
      : { type: 'workshop', duration_min: 60 },
  });

  const save = useMutation({
    mutationFn: async (v: EventValues) => {
      const payload = {
        title: v.title,
        description: v.description,
        type: v.type,
        scheduled_at: new Date(v.scheduled_at).toISOString(),
        duration_min: v.duration_min,
        max_attendees: v.max_attendees ?? null,
        meet_link: v.meet_link || null,   // empty => generated on approval
      };
      if (initial) {
        await assertUpdated(
          supabase.from('events').update(payload).eq('id', initial.id).select('id'),
        );
      } else {
        const { error } = await supabase
          .from('events')
          .insert({ ...payload, host_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.admin('events') });
      onClose();
    },
  });

  return (
    <form onSubmit={handleSubmit(v => save.mutate(v))} className="space-y-3" noValidate>
      <Input label="Title" placeholder="EMG Launch AMA, applying abroad"
        {...register('title')} error={errors.title?.message} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Type</label>
          <select {...register('type')} className="rounded-xl border border-surface-border px-3 py-3 text-sm">
            <option value="workshop">Workshop</option>
            <option value="webinar">Webinar</option>
            <option value="info_session">Info session</option>
            <option value="qa">Q&amp;A</option>
            <option value="other">Other</option>
          </select>
        </div>
        <Input label="Date & time" type="datetime-local"
          {...register('scheduled_at')} error={errors.scheduled_at?.message} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Duration (minutes)" type="number"
          {...register('duration_min')} error={errors.duration_min?.message} />
        <Input label="Max attendees (optional)" type="number" placeholder="50"
          {...register('max_attendees')} />
      </div>
      <Input label="Video link (optional)"
        placeholder="Leave empty and we generate one automatically"
        {...register('meet_link')} error={errors.meet_link?.message} />
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-ink">Description</label>
        <textarea rows={3} {...register('description')} className="resize-none"
          placeholder="What will attendees learn or get out of this?" />
        {errors.description && (
          <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
        )}
      </div>
      {save.isError && <p className="text-xs text-red-600">{(save.error as Error).message}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : initial ? 'Save changes' : 'Publish event'}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}
