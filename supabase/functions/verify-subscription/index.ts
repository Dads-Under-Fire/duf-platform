import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Reverse map: Stripe product → plan name
const PRODUCT_TO_PLAN: Record<string, string> = {
  prod_UAS0oqVtCXTjIv: "core",
  prod_UAS2cJMUXg2PcA: "pro",
  prod_UAS3p46KbLbv8o: "case_builder",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
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

    // Optional: verify a specific checkout session
    const body = await req.json().catch(() => ({}));
    const sessionId = body.session_id;

    if (sessionId) {
      // Verify a specific checkout session completed
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid" || session.status !== "complete") {
        return new Response(JSON.stringify({ activated: false, reason: "Payment not completed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check Stripe for active subscription
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ activated: false, reason: "No Stripe customer" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return new Response(JSON.stringify({ activated: false, reason: "No active subscription" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeSub = subscriptions.data[0];
    const productId = stripeSub.items.data[0].price.product as string;
    const plan = PRODUCT_TO_PLAN[productId] || "core";
    const periodStart = new Date(stripeSub.current_period_start * 1000).toISOString();
    const periodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();

    // Update subscription in our DB using service role
    await serviceClient
      .from("subscriptions")
      .update({
        plan,
        status: "active",
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    // Clear intended_plan from profile since payment succeeded
    await serviceClient
      .from("profiles")
      .update({ intended_plan: null })
      .eq("user_id", user.id);

    return new Response(
      JSON.stringify({ activated: true, plan, period_start: periodStart, period_end: periodEnd }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
