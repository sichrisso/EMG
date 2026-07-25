/*
 * Payment handoff for paid services (currently mock interviews).
 *
 * IMPORTANT — this file deliberately does NOT talk to a card network directly.
 * A browser can never be trusted with an amount or a payment result, so the
 * flow is always:
 *
 *   browser  ──create order (price read server-side)──▶  database
 *   browser  ──ask for a checkout link──▶  your serverless endpoint
 *   endpoint ──creates a hosted checkout with your secret key──▶  provider
 *   provider ──webhook──▶  your endpoint  ──marks the order paid──▶  database
 *
 * Until the endpoint below exists, startCheckout() throws a clear error rather
 * than pretending a payment happened.
 *
 * WHAT YOU STILL NEED TO DO
 * 1. Pick a provider. If EMG is collecting money into an Ethiopian account,
 *    Stripe is not an option (it does not support payouts to Ethiopia).
 *    Chapa, ArifPay, or telebirr are the usual local choices; Chapa also
 *    accepts international cards. If the receiving account is outside
 *    Ethiopia, Stripe or Paddle work fine.
 * 2. Add a serverless function at /api/checkout (Vercel: `api/checkout.ts`)
 *    that: verifies the caller's Supabase JWT, loads the order by id, reads
 *    the amount FROM THE DATABASE (never from the request body), creates a
 *    hosted checkout with your secret key, and returns { url }.
 * 3. Add a webhook at /api/payment-webhook that verifies the provider's
 *    signature and updates mock_interview_orders: status='paid', paid_at,
 *    provider, provider_ref. This is the only thing allowed to mark an order
 *    paid — the RLS policy already restricts updates to admins/service role.
 * 4. Put the secret key in Vercel's environment variables, never in this repo.
 */

/** Where the serverless checkout endpoint lives. */
const CHECKOUT_ENDPOINT = "/api/checkout";

export interface CheckoutResult {
  url: string;
}

/**
 * Exchanges an order id for a hosted checkout URL and sends the user there.
 * Throws with an actionable message if the endpoint is not deployed yet.
 */
export async function startCheckout(orderId: string): Promise<void> {
  let res: Response;
  try {
    const { supabase } = await import("@/lib/supabase");
    const {
      data: { session },
    } = await supabase.auth.getSession();

    res = await fetch(CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The endpoint must verify this before trusting the order id.
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      // Only the id travels: the endpoint looks up the real amount itself.
      body: JSON.stringify({ order_id: orderId }),
    });
  } catch {
    throw new Error(
      "Could not reach the payment service. Your booking is saved, our team will contact you to arrange payment.",
    );
  }

  if (res.status === 404) {
    throw new Error(
      "Online payment is not switched on yet. Your booking is saved and our team will reach out with payment details.",
    );
  }

  // Read the body once; it carries a diagnostic code on failure.
  let data: Partial<CheckoutResult> & {
    code?: string;
    missing?: string[];
    detail?: string | null;
  } = {};
  try {
    data = await res.json();
  } catch {
    /* fall through to the generic message below */
  }

  if (!res.ok || !data.url) {
    // The booking is already saved either way, so the customer-facing half of
    // every message says so. The operator-facing half names what to fix, which
    // is otherwise invisible without reading Vercel's function logs.
    const saved = "Your booking is saved, our team will be in touch.";

    switch (data.code) {
      case "missing_env":
        throw new Error(
          `Payment is not configured yet (missing: ${(data.missing ?? []).join(", ")}). ${saved}`,
        );
      case "auth":
        throw new Error(
          `Please sign out and back in, then try again. ${saved}`,
        );
      case "no_order":
        throw new Error(`We could not find that booking. ${saved}`);
      case "provider":
        throw new Error(
          data.detail
            ? `The payment provider refused the request: ${data.detail}. ${saved}`
            : `The payment provider refused the request. ${saved}`,
        );
      default:
        throw new Error(`Payment could not be started. ${saved}`);
    }
  }

  window.location.href = data.url;
}
