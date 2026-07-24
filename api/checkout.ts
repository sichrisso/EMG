/*
 * POST /api/checkout
 *
 * Turns an order id into a Chapa checkout URL.
 *
 * The browser sends ONLY an order id. Everything that matters (the amount, the
 * currency, who owns the order) is read here from the database, so a tampered
 * client cannot change what it is charged.
 *
 * Environment variables required (set them in Vercel, never in the repo):
 *   CHAPA_SECRET_KEY        your CHASECK... key from the Chapa dashboard
 *   SUPABASE_URL            https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE   the service_role key (server only, never shipped)
 *   PUBLIC_SITE_URL         https://your-app.vercel.app
 */

import { createClient } from "@supabase/supabase-js";

const CHAPA_INIT = "https://api.chapa.co/v1/transaction/initialize";

interface OrderRow {
  id: string;
  mentee_id: string;
  plan_code: string;
  minutes: number;
  amount_cents: number;
  currency: string;
  status: string;
  tx_ref: string | null;
}

export async function POST(req: Request): Promise<Response> {
  const secretKey = process.env.CHAPA_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
  const siteUrl = process.env.PUBLIC_SITE_URL;

  if (!secretKey || !supabaseUrl || !serviceRole || !siteUrl) {
    console.error("checkout: missing environment configuration");
    return json({ error: "Payment is not configured" }, 500);
  }

  // ── Who is calling? Trust the JWT, not the request body ──────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in" }, 401);

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: "Not signed in" }, 401);
  }
  const user = userData.user;

  // ── Load the order and check it belongs to this user ─────────────────────
  let body: { order_id?: string };
  try {
    body = (await req.json()) as { order_id?: string };
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!body.order_id) return json({ error: "Missing order_id" }, 400);

  const { data: order, error: orderErr } = await admin
    .from("mock_interview_orders")
    .select("id, mentee_id, plan_code, minutes, amount_cents, currency, status, tx_ref")
    .eq("id", body.order_id)
    .single<OrderRow>();

  if (orderErr || !order) return json({ error: "Order not found" }, 404);
  if (order.mentee_id !== user.id) return json({ error: "Not your order" }, 403);
  if (order.status === "paid") return json({ error: "Already paid" }, 409);

  // ── A stable, unique reference we can match the webhook against ──────────
  const txRef = order.tx_ref ?? `emg-${order.id}`;
  if (!order.tx_ref) {
    await admin
      .from("mock_interview_orders")
      .update({ tx_ref: txRef })
      .eq("id", order.id);
  }

  // Chapa takes a decimal amount, our column is in cents/santim.
  const amount = (order.amount_cents / 100).toFixed(2);

  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("id", user.id)
    .single<{ first_name: string; last_name: string; email: string }>();

  const payload = {
    amount,
    currency: order.currency,
    email: profile?.email ?? user.email,
    first_name: profile?.first_name || "Student",
    last_name: profile?.last_name || "",
    tx_ref: txRef,
    callback_url: `${siteUrl}/api/chapa-webhook`,
    return_url: `${siteUrl}/services/mock-interview?paid=1`,
    customization: {
      title: "EMG mock interview",
      description: `${order.minutes} minute visa interview practice`,
    },
  };

  let chapaRes: Response;
  try {
    chapaRes = await fetch(CHAPA_INIT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("checkout: chapa unreachable", e);
    return json({ error: "Payment service unreachable" }, 502);
  }

  const chapaBody = (await chapaRes.json()) as {
    status?: string;
    message?: string;
    data?: { checkout_url?: string };
  };

  if (!chapaRes.ok || !chapaBody?.data?.checkout_url) {
    // Log the detail server-side; don't leak provider internals to the browser.
    console.error("checkout: chapa rejected", chapaRes.status, chapaBody?.message);
    return json({ error: "Could not start payment" }, 502);
  }

  return json({ url: chapaBody.data.checkout_url }, 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
