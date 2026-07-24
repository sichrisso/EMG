/*
 * POST /api/chapa-webhook
 *
 * The only thing allowed to mark an order paid.
 *
 * Three defences, all of which must pass before an order is settled:
 *   1. Signature — the request really came from Chapa (HMAC SHA256).
 *   2. Re-verification — we ask Chapa's API directly rather than trusting the
 *      body, because a signature only proves origin, not that the payload was
 *      not replayed with stale data.
 *   3. Amount check — the database compares what was paid against what was
 *      asked for; a mismatch marks the order failed, never paid.
 *
 * Idempotency: Chapa retries every 10 minutes for up to 72 hours until it gets
 * a 200. mark_order_paid() returns quietly if the order is already paid, so a
 * replay is harmless.
 *
 * Environment variables required:
 *   CHAPA_SECRET_KEY        used both to verify the signature and to re-verify
 *   CHAPA_WEBHOOK_SECRET    the secret hash you set in the Chapa dashboard
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE
 */

import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";

const CHAPA_VERIFY = "https://api.chapa.co/v1/transaction/verify";

interface ChapaEvent {
  event?: string;
  status?: string;
  tx_ref?: string;
  reference?: string;
  amount?: string;
  currency?: string;
  mode?: string;
}

export async function POST(req: Request): Promise<Response> {
  const secretKey = process.env.CHAPA_SECRET_KEY;
  const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;

  if (!secretKey || !webhookSecret || !supabaseUrl || !serviceRole) {
    console.error("webhook: missing environment configuration");
    return new Response("Not configured", { status: 500 });
  }

  // Read the body as raw text: the signature is over the exact bytes sent.
  const raw = await req.text();

  // ── 1. Verify the signature ──────────────────────────────────────────────
  // Chapa sends x-chapa-signature (HMAC of the payload) and chapa-signature
  // (HMAC of the secret itself). Either being valid is sufficient.
  const sigPayload = req.headers.get("x-chapa-signature") ?? "";
  const sigSecret = req.headers.get("chapa-signature") ?? "";

  const expectedPayloadSig = createHmac("sha256", webhookSecret).update(raw).digest("hex");
  const expectedSecretSig = createHmac("sha256", webhookSecret).update(webhookSecret).digest("hex");

  const ok =
    safeEqual(sigPayload, expectedPayloadSig) || safeEqual(sigSecret, expectedSecretSig);

  if (!ok) {
    console.warn("webhook: bad signature, discarding");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: ChapaEvent;
  try {
    event = JSON.parse(raw) as ChapaEvent;
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  // Only successful charges settle an order. Acknowledge everything else so
  // Chapa stops retrying.
  const isSuccess =
    event.event === "charge.success" || event.status === "success";
  if (!isSuccess || !event.tx_ref) {
    return new Response("OK", { status: 200 });
  }

  // ── 2. Re-verify with Chapa rather than trusting the body ────────────────
  let verified: {
    status?: string;
    data?: { status?: string; amount?: string; currency?: string; reference?: string; mode?: string };
  };
  try {
    const res = await fetch(`${CHAPA_VERIFY}/${encodeURIComponent(event.tx_ref)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    verified = (await res.json()) as typeof verified;
  } catch (e) {
    // Return non-200 so Chapa retries later rather than dropping the payment.
    console.error("webhook: verify call failed", e);
    return new Response("Verify failed", { status: 500 });
  }

  if (verified?.data?.status !== "success") {
    console.warn("webhook: verify says not successful", event.tx_ref);
    return new Response("OK", { status: 200 });
  }

  // Guard against a live order being settled by a test-mode transaction.
  if (verified.data.mode && verified.data.mode !== "live" && process.env.NODE_ENV === "production") {
    console.warn("webhook: test-mode transaction ignored in production");
    return new Response("OK", { status: 200 });
  }

  // ── 3. Settle, with the amount checked inside the database ───────────────
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const amountCents = Math.round(Number(verified.data.amount ?? "0") * 100);

  const { error } = await admin.rpc("mark_order_paid", {
    p_tx_ref: event.tx_ref,
    p_provider_ref: verified.data.reference ?? event.reference ?? null,
    p_amount_cents: amountCents,
    p_currency: verified.data.currency ?? event.currency ?? "ETB",
  });

  if (error) {
    // A genuine mismatch is already recorded as failed; anything else should
    // be retried, so signal a non-200.
    console.error("webhook: mark_order_paid failed", error.message);
    return new Response("Could not settle", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}

/** Constant-time compare that tolerates length differences. */
function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
