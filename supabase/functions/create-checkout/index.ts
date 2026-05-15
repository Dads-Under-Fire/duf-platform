import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Plan -> { month, year } Stripe price IDs.
const PLAN_PRICES: Record<string, { month: string; year: string }> = {
  core: {
    month: "price_1TC76iQ4McEga1ntR2G3pFyi",
    year: "price_1TX9DWQ4McEga1ntT2QqQ3kL",
  },
  pro: {
    month: "price_1TC78UQ4McEga1nt9zrLyy3U",
    year: "price_1TX9DFQ4McEga1ntZvpLfmcf",
  },
  case_builder: {
    month: "price_1TC79BQ4McEga1ntkZGRxRbj",
    year: "price_1TX9CvQ4McEga1ntkdqUgdEL",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await anonClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const body = await req.json().catch(() => ({}));
    let plan = body.plan;
    const rawInterval = (body.interval ?? "month").toString().toLowerCase();
    // Accept both 'annual'/'annually' and 'yearly' as aliases for year.
    const interval: "month" | "year" =
      rawInterval === "year" || rawInterval === "annual" || rawInterval === "annually" || rawInterval === "yearly"
        ? "year"
        : "month";

    if (!plan) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("intended_plan")
        .eq("user_id", user.id)
        .single();
      plan = profile?.intended_plan;
    }

    const priceMap = PLAN_PRICES[plan];
    if (!priceMap) throw new Error(`Invalid plan: ${plan}`);
    const priceId = priceMap[interval];
    if (!priceId) throw new Error(`No ${interval} price for plan ${plan}`);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Resolve Stripe customer with strict identity precedence to prevent
    // duplicates when billing name / card / email differ:
    //   1. subscriptions.stripe_customer_id (DB source of truth)
    //   2. Stripe customer search by metadata.supabase_user_id (durable)
    //   3. Stripe customer list by email (last-resort fallback; logged)
    //   4. Create a fresh Stripe customer with metadata.supabase_user_id and persist
    let customerId: string | undefined;

    const { data: subRow } = await serviceClient
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (subRow?.stripe_customer_id) {
      try {
        const c = await stripe.customers.retrieve(subRow.stripe_customer_id);
        if (c && !(c as any).deleted) customerId = (c as Stripe.Customer).id;
      } catch (e) {
        console.warn(`[create-checkout] stored stripe_customer_id ${subRow.stripe_customer_id} not retrievable:`, (e as Error).message);
      }
    }

    if (!customerId) {
      try {
        const found = await stripe.customers.search({
          query: `metadata['supabase_user_id']:'${user.id}'`,
          limit: 2,
        });
        if (found.data.length > 1) {
          console.warn(`[create-checkout] AMBIGUOUS_METADATA_MATCH user=${user.id} count=${found.data.length} ids=${found.data.map((c) => c.id).join(",")}`);
        }
        if (found.data.length > 0) {
          customerId = found.data[0].id;
          console.log(`[create-checkout] matched by metadata.supabase_user_id -> ${customerId}`);
        }
      } catch (e) {
        console.warn(`[create-checkout] metadata search failed:`, (e as Error).message);
      }
    }

    if (!customerId) {
      const byEmail = await stripe.customers.list({ email: user.email, limit: 5 });
      // Prefer one already tagged with our metadata; otherwise log ambiguity.
      const tagged = byEmail.data.find((c) => c.metadata?.supabase_user_id === user.id);
      if (tagged) {
        customerId = tagged.id;
      } else if (byEmail.data.length === 1) {
        customerId = byEmail.data[0].id;
        console.log(`[create-checkout] adopted single email-matched customer ${customerId} for user ${user.id}`);
      } else if (byEmail.data.length > 1) {
        console.warn(`[create-checkout] AMBIGUOUS_EMAIL_MATCH user=${user.id} email=${user.email} count=${byEmail.data.length} ids=${byEmail.data.map((c) => c.id).join(",")} — creating new tagged customer`);
      }
    }

    if (!customerId) {
      const created = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = created.id;
      console.log(`[create-checkout] created new customer ${customerId} for user ${user.id}`);
    } else {
      // Make sure the customer carries our durable identity tag so future
      // lookups never fall back to email.
      try {
        const cust = await stripe.customers.retrieve(customerId);
        if (cust && !(cust as any).deleted && (cust as Stripe.Customer).metadata?.supabase_user_id !== user.id) {
          await stripe.customers.update(customerId, {
            metadata: {
              ...((cust as Stripe.Customer).metadata ?? {}),
              supabase_user_id: user.id,
            },
          });
        }
      } catch (e) {
        console.warn(`[create-checkout] could not backfill metadata on ${customerId}:`, (e as Error).message);
      }
    }

    // Persist the resolved customer id immediately so subsequent calls (portal,
    // webhook, repeat checkout) all reuse it.
    await serviceClient
      .from("subscriptions")
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    const origin = req.headers.get("origin") || "https://app.dadsunderfire.com";

    // If the customer already has any non-terminal subscriptions, we MUST modify
    // (or cancel + replace) instead of creating another Checkout — otherwise
    // they end up paying for two plans simultaneously. We treat
    // active/trialing/past_due as "live" subs.
    let liveSubs: Stripe.Subscription[] = [];
    if (customerId) {
      const [activeList, trialingList, pastDueList] = await Promise.all([
        stripe.subscriptions.list({ customer: customerId, status: "active", limit: 10 }),
        stripe.subscriptions.list({ customer: customerId, status: "trialing", limit: 10 }),
        stripe.subscriptions.list({ customer: customerId, status: "past_due", limit: 10 }),
      ]);
      liveSubs = [...activeList.data, ...trialingList.data, ...pastDueList.data];
    }

    if (liveSubs.length > 0) {
      // Keep the most recently created one and cancel any extras (this also
      // self-heals the duplicate-subscription state from earlier checkouts).
      liveSubs.sort((a, b) => b.created - a.created);
      const keep = liveSubs[0];
      const extras = liveSubs.slice(1);

      for (const extra of extras) {
        try {
          await stripe.subscriptions.cancel(extra.id, { invoice_now: false, prorate: true });
          console.log(`[create-checkout] canceled duplicate sub ${extra.id}`);
        } catch (e) {
          console.error(`[create-checkout] failed to cancel duplicate sub ${extra.id}:`, (e as Error).message);
        }
      }

      // Swap the kept subscription to the newly selected price (handles plan
      // change AND monthly<->annual change in one call). No-op if it's already
      // on the requested price and nothing else needed canceling.
      const currentItem = keep.items.data[0];
      const alreadyOnPrice = currentItem?.price.id === priceId;
      if (!alreadyOnPrice) {
        await stripe.subscriptions.update(keep.id, {
          items: [{ id: currentItem.id, price: priceId }],
          proration_behavior: "create_prorations",
          cancel_at_period_end: false,
          metadata: {
            supabase_user_id: user.id,
            plan,
            interval,
          },
        });
        console.log(`[create-checkout] updated sub ${keep.id} -> ${plan}/${interval}`);
      }

      // No Checkout needed — send the user straight to the success page so
      // verify-subscription re-syncs the subscriptions table from Stripe.
      return new Response(JSON.stringify({ url: `${origin}/checkout/success` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // No existing live subscription — normal first-time Checkout flow.
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      metadata: {
        supabase_user_id: user.id,
        plan,
        interval,
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("create-checkout error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
