import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

interface PointsToastProps {
  points: number;
  label?: string;
  /** Milestone title if this award just crossed a threshold. */
  milestone?: string | null;
  onDone: () => void;
}

/**
 * Bottom-right toast announcing a points award. Points themselves are
 * granted by a database trigger; this component only reports the result.
 */
export function PointsToast({ points, label = 'Points earned', milestone, onDone }: PointsToastProps) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 50);
    const t2 = setTimeout(() => setLeaving(true), 3200);
    const t3 = setTimeout(() => onDone(), 3800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      className={cn(
        'fixed right-5 z-[60] flex flex-col gap-2 transition-all duration-500',
        visible && !leaving ? 'bottom-8 opacity-100' : '-bottom-24 opacity-0',
      )}
      style={{ minWidth: 220 }}
      role="status"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-navy/10 bg-white px-5 py-3 shadow-modal">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-white">
          <span className="text-base font-black">+{points}</span>
        </div>
        <div>
          <p className="text-sm font-black text-ink">{label}</p>
          <p className="text-xs text-ink-muted">Keep up the great work.</p>
        </div>
      </div>

      {milestone && (
        <div className="animate-fade-up flex items-center gap-3 rounded-2xl border border-gold/30 bg-gold-soft px-5 py-3 shadow-modal">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gold-dark">Milestone unlocked</p>
            <p className="text-sm font-black text-ink">{milestone}</p>
          </div>
        </div>
      )}
    </div>
  );
}
