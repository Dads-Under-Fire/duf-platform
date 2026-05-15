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

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      await serviceClient
        .from("subscriptions")
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }

    const origin = req.headers.get("origin") || "https://app.dadsunderfire.com";

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
