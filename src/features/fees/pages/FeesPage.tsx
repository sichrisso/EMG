import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';

/*
 * Fee payment, informational page. There is exactly ONE form for asking us
 * anything (Services → Request help); the button below deep-links there with
 * the fee type pre-selected. This page explains how the service works and
 * shows the student's payment requests behind a toggle.
 */

// Display-only estimate; the authoritative quote is set per request by admins.
const ETB_RATE_ESTIMATE = 130;

const FEE_TYPES = [
  { name: 'SEVIS I-901 fee',         usd: 350, note: 'Required before your F-1 visa interview.' },
  { name: 'IELTS registration',      usd: 255, note: 'Paid to the British Council or IDP.' },
  { name: 'TOEFL registration',      usd: 220, note: 'Paid to ETS.' },
  { name: 'Duolingo English Test',   usd: 65,  note: 'The cheapest accepted English test.' },
  { name: 'University application',  usd: 90,  note: 'Varies by school, typically $50 to $150.' },
  { name: 'Visa (MRV) fee',          usd: 185, note: 'Paid before booking the embassy interview.' },
];

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Awaiting quote', cls: 'bg-amber-50 text-amber-700' },
  approved:  { label: 'Quoted',         cls: 'bg-blue-50 text-blue-700' },
  completed: { label: 'Paid',           cls: 'bg-emerald-50 text-emerald-700' },
  declined:  { label: 'Declined',       cls: 'bg-red-50 text-red-600' },
  cancelled: { label: 'Cancelled',      cls: 'bg-slate-100 text-slate-500' },
};

interface FeeRow {
  id: string; fee_type: string; amount_usd: number; amount_birr: number | null;
  quoted_rate: number | null; status: string; recipient_name: string | null;
  receipt_url: string | null; admin_note: string | null; created_at: string;
}

export default function FeesPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const [showRequests, setShowRequests] = useState(false);

  const { data: myRequests = [], isLoading } = useQuery({
    queryKey: qk.fees,
    queryFn: async (): Promise<FeeRow[]> => {
      const { data, error } = await supabase
        .from('fee_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as FeeRow[];
    },
    enabled: !!profile,
  });

  if (authLoading) return <PageSpinner />;

  return (
    <div className="pb-4">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">

        {/* How it works + the single CTA to the one form */}
        <div className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <h2 className="text-lg font-black text-ink">
                We pay your international fees. You repay in birr.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                International cards are hard to get in Ethiopia, and SEVIS,
                test, and application fees only take them. Our US-based team
                pays the fee on your behalf; you repay in Ethiopian birr at a
                quote we confirm on your request before anything is paid.
              </p>
              <ol className="mt-3 space-y-1.5 text-sm text-ink-muted">
                <li><strong className="text-ink">1.</strong> Send a request with the fee and amount.</li>
                <li><strong className="text-ink">2.</strong> We reply with the exact birr quote.</li>
                <li><strong className="text-ink">3.</strong> You pay in birr; we pay the fee and send you the receipt.</li>
              </ol>
            </div>
            <div className="shrink-0 space-y-2">
              <Link to="/services/help?type=fee_payment" className="block">
                <Button className="w-full">Request fee payment</Button>
              </Link>
              {profile && (
                <Button variant="secondary" className="w-full"
                  onClick={() => setShowRequests(s => !s)}>
                  {showRequests ? 'Hide my requests' : `My payment requests${myRequests.length ? ` (${myRequests.length})` : ''}`}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* The student's payment requests, only when they ask for them */}
        {showRequests && (
          <div className="mt-5">
            {isLoading ? (
              <PageSpinner />
            ) : myRequests.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-surface-border bg-white p-8 text-center text-sm text-ink-muted">
                No payment requests yet, use "Request fee payment" above to send your first one.
              </div>
            ) : (
              <div className="space-y-2">
                {myRequests.map(r => {
                  const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
                  return (
                    <article key={r.id} className="card p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-ink">
                            {r.fee_type} · ${r.amount_usd}
                          </p>
                          <p className="truncate text-xs text-ink-muted">
                            {r.recipient_name ? `pay to ${r.recipient_name} · ` : ''}
                            sent {new Date(r.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold', cfg.cls)}>
                          {cfg.label}
                        </span>
                      </div>
                      {r.amount_birr != null && (
                        <p className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                          Confirmed quote: <strong>{Number(r.amount_birr).toLocaleString()} ETB</strong>
                          {r.quoted_rate ? ` at ${r.quoted_rate} ETB/USD` : ''}
                        </p>
                      )}
                      {r.receipt_url && (
                        <a href={r.receipt_url} target="_blank" rel="noopener noreferrer"
                          className="mt-2 inline-block text-xs font-bold text-navy hover:underline">
                          View payment receipt
                        </a>
                      )}
                      {r.admin_note && (
                        <p className="mt-2 text-xs text-ink-muted">Note: {r.admin_note}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Common fees reference */}
        <h2 className="mt-8 mb-3 text-lg font-black text-ink">Common fees we pay</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEE_TYPES.map(f => (
            <div key={f.name} className="card flex flex-col p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-black text-ink">{f.name}</h3>
                <span className="shrink-0 text-xs font-bold text-ink-muted">~${f.usd}</span>
              </div>
              <p className="mt-1 flex-1 text-sm text-ink-muted">{f.note}</p>
              <p className="mt-2 text-xs text-ink-subtle">
                ≈ {(f.usd * ETB_RATE_ESTIMATE).toLocaleString()} ETB (estimate, final quote confirmed per request)
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
