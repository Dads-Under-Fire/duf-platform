import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    const body = await req.json().catch(() => ({}));
    const flow = (body?.flow ?? "manage").toString(); // "manage" | "subscription_update"

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Identity precedence: stored stripe_customer_id -> metadata.supabase_user_id
    // search -> email (last resort, ambiguity logged). Mirrors create-checkout
    // so portal and checkout always target the same Stripe customer.
    let customerId: string | null = null;
    const { data: subRow } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (subRow?.stripe_customer_id) {
      try {
        const c = await stripe.customers.retrieve(subRow.stripe_customer_id);
        if (c && !(c as any).deleted) customerId = (c as Stripe.Customer).id;
      } catch (_e) { /* fall through */ }
    }

    if (!customerId) {
      try {
        const found = await stripe.customers.search({
          query: `metadata['supabase_user_id']:'${user.id}'`,
          limit: 2,
        });
        if (found.data.length > 1) {
          console.warn(`[customer-portal] AMBIGUOUS_METADATA_MATCH user=${user.id} ids=${found.data.map((c) => c.id).join(",")}`);
        }
        if (found.data.length > 0) customerId = found.data[0].id;
      } catch (e) {
        console.warn(`[customer-portal] metadata search failed:`, (e as Error).message);
      }
    }

    if (!customerId) {
      const byEmail = await stripe.customers.list({ email: user.email, limit: 5 });
      const tagged = byEmail.data.find((c) => c.metadata?.supabase_user_id === user.id);
      if (tagged) {
        customerId = tagged.id;
      } else if (byEmail.data.length === 1) {
        customerId = byEmail.data[0].id;
      } else if (byEmail.data.length > 1) {
        console.warn(`[customer-portal] AMBIGUOUS_EMAIL_MATCH user=${user.id} email=${user.email} ids=${byEmail.data.map((c) => c.id).join(",")}`);
        throw new Error("Multiple Stripe customers found for this email — please contact support.");
      }
    }

    if (!customerId) {
      throw new Error("No Stripe customer found for this user. Please subscribe first.");
    }

    // Persist back so future calls short-circuit on the DB lookup.
    await supabaseAdmin
      .from("subscriptions")
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    const origin = req.headers.get("origin") || "https://app.dadsunderfire.com";
    const returnUrl = `${origin}/account?portal=${flow === "subscription_update" ? "change" : "manage"}`;

    // For the subscription_update flow, deep-link into the change-plan screen
    // for the customer's current live subscription (Stripe requires the sub id).
    const params: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: returnUrl,
    };

    if (flow === "subscription_update") {
      const [activeList, trialingList, pastDueList] = await Promise.all([
        stripe.subscriptions.list({ customer: customerId, status: "active", limit: 5 }),
        stripe.subscriptions.list({ customer: customerId, status: "trialing", limit: 5 }),
        stripe.subscriptions.list({ customer: customerId, status: "past_due", limit: 5 }),
      ]);
      const liveSubs = [...activeList.data, ...trialingList.data, ...pastDueList.data]
        .sort((a, b) => b.created - a.created);
      if (liveSubs.length === 0) {
        throw new Error("No active subscription to change. Please subscribe first.");
      }
      params.flow_data = {
        type: "subscription_update",
        subscription_update: { subscription: liveSubs[0].id },
        after_completion: { type: "redirect", redirect: { return_url: returnUrl } },
      } as Stripe.BillingPortal.SessionCreateParams.FlowData;
    }

    const portalSession = await stripe.billingPortal.sessions.create(params);

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("customer-portal error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
