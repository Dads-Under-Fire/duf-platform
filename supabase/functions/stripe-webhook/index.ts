// Stripe webhook receiver — keeps subscriptions table in sync with Stripe truth.
// Handles checkout.session.completed, customer.subscription.{updated,deleted},
// and invoice.payment_failed. verify_jwt = false (Stripe signs the request).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0?target=denonext";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Map by price.id (more deterministic than product). Mirror of create-checkout.
// Includes both monthly and annual prices for each paid plan.
const PRICE_TO_PLAN: Record<string, "core" | "pro" | "case_builder"> = {
  // Core
  price_1TC76iQ4McEga1ntR2G3pFyi: "core",         // monthly
  price_1TX9DWQ4McEga1ntT2QqQ3kL: "core",         // annual
  // Pro
  price_1TC78UQ4McEga1nt9zrLyy3U: "pro",          // monthly
  price_1TX9DFQ4McEga1ntZvpLfmcf: "pro",          // annual
  // Case Builder
  price_1TC79BQ4McEga1ntkZGRxRbj: "case_builder", // monthly
  price_1TX9CvQ4McEga1ntkdqUgdEL: "case_builder", // annual
};

const log = (step: string, details?: unknown) =>
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-08-27.basil",
});

async function findUserId(opts: {
  customerId?: string | null;
  email?: string | null;
  metadataUserId?: string | null;
}): Promise<string | null> {
  if (opts.metadataUserId) return opts.metadataUserId;

  if (opts.customerId) {
    const { data } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", opts.customerId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  if (opts.email) {
    // No direct email column on profiles; resolve via auth admin.
    const { data, error } = await supabase.auth.admin.listUsers();
    if (!error) {
      const u = data.users.find((u) => u.email?.toLowerCase() === opts.email!.toLowerCase());
      if (u) return u.id;
    }
  }
  return null;
}

async function syncSubscriptionFromStripe(stripeSub: Stripe.Subscription, userIdHint?: string | null) {
  const customerId = stripeSub.customer as string;
  const priceId = stripeSub.items.data[0]?.price.id ?? "";
  const plan = PRICE_TO_PLAN[priceId];

  if (!plan) {
    log("UNKNOWN_PRICE_NO_FALLBACK", { priceId, subscriptionId: stripeSub.id });
    // Don't silently downgrade — leave plan untouched, only update status fields.
  }

  // Resolve user
  let userId = userIdHint ?? null;
  if (!userId) {
    const customer = await stripe.customers.retrieve(customerId);
    const email = (customer as Stripe.Customer).email ?? null;
    userId = await findUserId({ customerId, email, metadataUserId: (stripeSub.metadata?.supabase_user_id as string) ?? null });
  }
  if (!userId) {
    log("NO_USER_RESOLVED", { customerId, subscriptionId: stripeSub.id });
    return;
  }

  // Status mapping: Stripe statuses → our subscription_status enum
  // 'active' | 'inactive' | 'trialing' | 'canceled' | 'past_due'
  const statusMap: Record<string, "active" | "trialing" | "canceled" | "past_due" | "inactive"> = {
    active: "active",
    trialing: "trialing",
    canceled: "canceled",
    past_due: "past_due",
    unpaid: "past_due",
    incomplete: "inactive",
    incomplete_expired: "inactive",
    paused: "inactive",
  };
  const status = statusMap[stripeSub.status] ?? "inactive";

  // In Stripe API 2025-08-27.basil, current_period_start/end moved from the
  // subscription object to each subscription item. Read from the item first
  // and fall back to the legacy top-level fields for older API versions.
  const item = stripeSub.items?.data?.[0] as (Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
  }) | undefined;
  const periodStartUnix =
    item?.current_period_start ??
    (stripeSub as unknown as { current_period_start?: number }).current_period_start;
  const periodEndUnix =
    item?.current_period_end ??
    (stripeSub as unknown as { current_period_end?: number }).current_period_end;
  if (!periodStartUnix || !periodEndUnix) {
    log("MISSING_PERIOD", { subscriptionId: stripeSub.id });
    throw new Error(`Subscription ${stripeSub.id} missing current_period_start/end`);
  }

  const intervalRaw = stripeSub.items?.data?.[0]?.price?.recurring?.interval;
  const billingInterval: "month" | "year" = intervalRaw === "year" ? "year" : "month";

  const update: Record<string, unknown> = {
    status,
    stripe_customer_id: customerId,
    stripe_subscription_id: stripeSub.id,
    cancel_at_period_end: stripeSub.cancel_at_period_end ?? false,
    billing_period_start: new Date(periodStartUnix * 1000).toISOString(),
    billing_period_end: new Date(periodEndUnix * 1000).toISOString(),
    billing_interval: billingInterval,
    updated_at: new Date().toISOString(),
  };
  if (plan) update.plan = plan;

  // Upsert by user_id, but never overwrite with an older Stripe state.
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, billing_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const existingEnd = existing.billing_period_end ? new Date(existing.billing_period_end as string).getTime() : 0;
    const incomingEnd = new Date(update.billing_period_end as string).getTime();
    if (incomingEnd < existingEnd) {
      log("STALE_EVENT_SKIPPED", { userId, existingEnd, incomingEnd, subscriptionId: stripeSub.id });
      return;
    }
    await supabase.from("subscriptions").update(update).eq("user_id", userId);
  } else {
    await supabase.from("subscriptions").insert({ user_id: userId, plan: plan ?? "free", ...update });
  }

  // Clear intended_plan after any Stripe sync — once the user has reached
  // Stripe (whether they upgraded, downgraded, or canceled), the signup-time
  // "intended plan" hint is no longer meaningful and should not keep nagging.
  await supabase.from("profiles").update({ intended_plan: null }).eq("user_id", userId);

  log("SUB_SYNCED", { userId, plan: plan ?? "(unchanged)", status });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) {
    return new Response("Missing signature or secret", { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    log("INVALID_SIGNATURE", { error: (err as Error).message });
    return new Response("Invalid signature", { status: 400 });
  }

  log("EVENT", { type: event.type, id: event.id });

  // Idempotency: skip if we've already processed this event id.
  const { error: dedupeError } = await supabase
    .from("stripe_webhook_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      payload_created_at: event.created ? new Date(event.created * 1000).toISOString() : null,
    });
  if (dedupeError) {
    if ((dedupeError as { code?: string }).code === "23505") {
      log("DUPLICATE_EVENT_SKIPPED", { id: event.id });
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log("DEDUPE_INSERT_ERROR", { error: dedupeError.message });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription" || !session.subscription) break;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        await syncSubscriptionFromStripe(sub, (session.metadata?.supabase_user_id as string) ?? null);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscriptionFromStripe(sub);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string | null;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscriptionFromStripe(sub);
        }
        break;
      }
      default:
        log("IGNORED", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log("HANDLER_ERROR", { error: (err as Error).message });
    // Remove the dedupe row so Stripe's automatic retry can re-process this event.
    await supabase.from("stripe_webhook_events").delete().eq("event_id", event.id);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
