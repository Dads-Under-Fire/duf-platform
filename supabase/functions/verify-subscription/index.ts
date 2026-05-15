import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0?target=denonext";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map by price.id — same source of truth as create-checkout. Do NOT silently
// fall back; if a price isn't mapped we leave the plan untouched.
// Includes both monthly and annual prices for each paid plan.
const PRICE_TO_PLAN: Record<string, "core" | "pro" | "case_builder"> = {
  price_1TC76iQ4McEga1ntR2G3pFyi: "core",         // monthly
  price_1TX9DWQ4McEga1ntT2QqQ3kL: "core",         // annual
  price_1TC78UQ4McEga1nt9zrLyy3U: "pro",          // monthly
  price_1TX9DFQ4McEga1ntZvpLfmcf: "pro",          // annual
  price_1TC79BQ4McEga1ntkZGRxRbj: "case_builder", // monthly
  price_1TX9CvQ4McEga1ntkdqUgdEL: "case_builder", // annual
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData.user?.email) throw new Error("Not authenticated");
    const user = userData.user;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.json().catch(() => ({}));
    const sessionId = body.session_id;

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid" || session.status !== "complete") {
        return new Response(JSON.stringify({ activated: false, reason: "Payment not completed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ activated: false, reason: "No Stripe customer" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return new Response(JSON.stringify({ activated: false, reason: "No active subscription" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeSub = subscriptions.data[0];
    const item = stripeSub.items.data[0] as Stripe.SubscriptionItem & {
      current_period_start?: number;
      current_period_end?: number;
    };
    const priceId = item.price.id;
    const plan = PRICE_TO_PLAN[priceId];

    if (!plan) {
      console.error("verify-subscription: unmapped price", { priceId });
      return new Response(
        JSON.stringify({ activated: false, reason: "Unrecognized plan price; contact support." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Stripe API 2025-08-27.basil moved current_period_* onto subscription items.
    const periodStartUnix =
      item.current_period_start ??
      (stripeSub as unknown as { current_period_start?: number }).current_period_start;
    const periodEndUnix =
      item.current_period_end ??
      (stripeSub as unknown as { current_period_end?: number }).current_period_end;
    if (!periodStartUnix || !periodEndUnix) {
      throw new Error(`Subscription ${stripeSub.id} missing current_period_start/end`);
    }

    const periodStart = new Date(periodStartUnix * 1000).toISOString();
    const periodEnd = new Date(periodEndUnix * 1000).toISOString();
    const billingInterval: "month" | "year" =
      item.price.recurring?.interval === "year" ? "year" : "month";

    await serviceClient
      .from("subscriptions")
      .update({
        plan,
        status: "active",
        stripe_customer_id: customerId,
        stripe_subscription_id: stripeSub.id,
        cancel_at_period_end: stripeSub.cancel_at_period_end ?? false,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        billing_interval: billingInterval,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    await serviceClient.from("profiles").update({ intended_plan: null }).eq("user_id", user.id);

    return new Response(
      JSON.stringify({
        activated: true,
        plan,
        interval: billingInterval,
        period_start: periodStart,
        period_end: periodEnd,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("verify-subscription error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
