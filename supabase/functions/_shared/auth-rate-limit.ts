import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// ── CORS ──
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── JSON helper ──
export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Structured logging ──
export function logRequest(params: {
  userId: string | null;
  functionName: string;
  status: "success" | "error" | "rate_limited" | "unauthenticated" | "invalid_input";
  estimatedUsage?: number;
  detail?: string;
}) {
  const entry = {
    timestamp: new Date().toISOString(),
    user_id: params.userId,
    function: params.functionName,
    status: params.status,
    estimated_usage: params.estimatedUsage ?? 0,
    detail: params.detail ?? null,
  };
  // Supabase captures console output in edge function logs
  if (params.status === "success") {
    console.log(JSON.stringify(entry));
  } else {
    console.warn(JSON.stringify(entry));
  }
}

// ── In-memory per-user rate limiter (sliding window) ──
interface RateBucket {
  timestamps: number[];
}

const buckets = new Map<string, RateBucket>();

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param key     Unique key, typically `userId:functionName`
 * @param limit   Max requests in the window
 * @param windowMs  Window size in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  // Evict expired entries
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= limit) {
    return false; // rate limited
  }
  bucket.timestamps.push(now);
  return true;
}

// Periodic cleanup every 5 minutes to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  const MAX_AGE = 10 * 60 * 1000; // 10 min
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < MAX_AGE);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}, 5 * 60 * 1000);

// ── Auth helper ──
export interface AuthResult {
  userId: string;
  userClient: ReturnType<typeof createClient>;
  serviceClient: ReturnType<typeof createClient>;
}

/**
 * Authenticates the request via the Authorization header.
 * Returns userId derived from the server-verified token – never from client input.
 * Throws a Response on failure (caller should return it).
 */
export async function authenticateRequest(req: Request, functionName: string): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    logRequest({ userId: null, functionName, status: "unauthenticated", detail: "Missing bearer token" });
    throw jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await userClient.auth.getClaims(token);
  if (error || !data?.claims) {
    logRequest({ userId: null, functionName, status: "unauthenticated", detail: error?.message ?? "Invalid token" });
    throw jsonResponse({ error: "Unauthorized" }, 401);
  }

  const userId = data.claims.sub as string;
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  return { userId, userClient, serviceClient };
}
