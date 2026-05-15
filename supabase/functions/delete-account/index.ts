// Permanently deletes the calling DUF user's account, including:
//   1. Cancel any live Stripe subscriptions and delete the Stripe customer
//   2. Remove uploaded attachment files from the case-log-attachments bucket
//   3. Delete all DUF-owned rows tied to the user
//   4. Delete the Supabase auth user so they can no longer sign in
//
// Idempotent: re-invoking after a partial failure is safe — every step tolerates
// "already gone" states. Caller is identified by their JWT; we never accept a
// user_id from the request body.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0?target=denonext";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[DELETE-ACCOUNT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const userEmail = userData.user.email ?? null;
    log("START", { userId });

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 1. Stripe cleanup -------------------------------------------------------
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    let stripeCustomerId: string | null = null;
    try {
      const { data: subRow } = await admin
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .maybeSingle();
      stripeCustomerId = subRow?.stripe_customer_id ?? null;
    } catch (e) {
      log("LOOKUP_SUB_FAILED", { error: (e as Error).message });
    }

    if (stripeKey) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      // Resolve customer if not stored: prefer durable metadata, then email.
      if (!stripeCustomerId) {
        try {
          const found = await stripe.customers.search({
            query: `metadata['supabase_user_id']:'${userId}'`,
            limit: 1,
          });
          if (found.data[0]) stripeCustomerId = found.data[0].id;
        } catch (e) {
          log("STRIPE_SEARCH_FAILED", { error: (e as Error).message });
        }
        if (!stripeCustomerId && userEmail) {
          try {
            const list = await stripe.customers.list({ email: userEmail, limit: 5 });
            const tagged = list.data.find((c) => c.metadata?.supabase_user_id === userId);
            if (tagged) stripeCustomerId = tagged.id;
          } catch (e) {
            log("STRIPE_EMAIL_LOOKUP_FAILED", { error: (e as Error).message });
          }
        }
      }

      if (stripeCustomerId) {
        // Cancel any non-terminal subscriptions immediately.
        try {
          const statuses = ["active", "trialing", "past_due", "unpaid", "incomplete"] as const;
          for (const status of statuses) {
            const subs = await stripe.subscriptions.list({
              customer: stripeCustomerId,
              status,
              limit: 20,
            });
            for (const s of subs.data) {
              try {
                await stripe.subscriptions.cancel(s.id, { invoice_now: false, prorate: false });
                log("STRIPE_SUB_CANCELED", { subscriptionId: s.id });
              } catch (e) {
                log("STRIPE_SUB_CANCEL_FAILED", { subscriptionId: s.id, error: (e as Error).message });
              }
            }
          }
        } catch (e) {
          log("STRIPE_LIST_SUBS_FAILED", { error: (e as Error).message });
        }

        // Delete the customer record.
        try {
          await stripe.customers.del(stripeCustomerId);
          log("STRIPE_CUSTOMER_DELETED", { stripeCustomerId });
        } catch (e) {
          log("STRIPE_CUSTOMER_DELETE_FAILED", { stripeCustomerId, error: (e as Error).message });
        }
      } else {
        log("STRIPE_NO_CUSTOMER", { userId });
      }
    } else {
      log("STRIPE_KEY_MISSING");
    }

    // 2. Storage cleanup ------------------------------------------------------
    // Files live under `<user_id>/...` in the case-log-attachments bucket. We
    // delete every object linked from case_log_attachments AND any orphans
    // discovered by recursively listing the user's prefix, so nothing is left
    // even if a row was lost or an upload was never linked.
    const removeInChunks = async (paths: string[]) => {
      const chunkSize = 100;
      for (let i = 0; i < paths.length; i += chunkSize) {
        const chunk = paths.slice(i, i + chunkSize);
        const { error } = await admin.storage.from("case-log-attachments").remove(chunk);
        if (error) log("STORAGE_REMOVE_PARTIAL", { error: error.message, count: chunk.length });
      }
    };

    try {
      const { data: attachments } = await admin
        .from("case_log_attachments")
        .select("file_path")
        .eq("user_id", userId);
      const linkedPaths = (attachments ?? [])
        .map((a) => a.file_path as string | null)
        .filter((p): p is string => !!p);
      if (linkedPaths.length > 0) {
        await removeInChunks(linkedPaths);
        log("STORAGE_REMOVED_LINKED", { count: linkedPaths.length });
      }
    } catch (e) {
      log("STORAGE_LINKED_CLEANUP_FAILED", { error: (e as Error).message });
    }

    // Sweep any remaining objects under the user's prefix (orphans).
    try {
      const sweep = async (prefix: string) => {
        const { data, error } = await admin.storage
          .from("case-log-attachments")
          .list(prefix, { limit: 1000 });
        if (error) {
          log("STORAGE_LIST_FAILED", { prefix, error: error.message });
          return;
        }
        const files: string[] = [];
        for (const entry of data ?? []) {
          const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          // Folders surface with id === null in storage.list output.
          if ((entry as { id?: string | null }).id === null) {
            await sweep(fullPath);
          } else {
            files.push(fullPath);
          }
        }
        if (files.length > 0) await removeInChunks(files);
      };
      await sweep(userId);
      log("STORAGE_PREFIX_SWEPT", { prefix: userId });
    } catch (e) {
      log("STORAGE_SWEEP_FAILED", { error: (e as Error).message });
    }

    // 3. DB cleanup -----------------------------------------------------------
    // Delete child rows before parents. Communication Shield results are tied
    // to sessions and have no user_id column, so delete them via the session ids.
    try {
      const { data: sessions } = await admin
        .from("communication_shield_sessions")
        .select("id")
        .eq("user_id", userId);
      const sessionIds = (sessions ?? []).map((s) => s.id as string);
      if (sessionIds.length > 0) {
        await admin.from("communication_shield_results").delete().in("session_id", sessionIds);
      }
    } catch (e) {
      log("CS_RESULTS_DELETE_FAILED", { error: (e as Error).message });
    }

    const tablesByUserId = [
      "communication_shield_sessions",
      "communication_shield_history_legacy",
      "case_intelligence_patterns",
      "case_intelligence_analyses",
      "case_log_attachments",
      "case_log_entries",
      "cases",
      "usage_counters",
      "subscriptions",
      "profiles",
    ];
    for (const table of tablesByUserId) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) log("DB_DELETE_FAILED", { table, error: error.message });
    }

    // 4. Auth user ------------------------------------------------------------
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) {
      log("AUTH_DELETE_FAILED", { error: authErr.message });
      return new Response(
        JSON.stringify({
          error:
            "Account data was removed but the sign-in record could not be deleted. Please contact support.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log("DONE", { userId });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE-ACCOUNT] FATAL", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
