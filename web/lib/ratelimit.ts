/**
 * Abuse control for the one endpoint that spends money.
 *
 * /api/agent is unauthenticated by design -- a judge must be able to fire it without an
 * account -- and every call is a billed completion against a shared provider key. Without
 * a limit, one `while true; do curl ...` drains every key the deployment holds, and
 * because the route rotates keys it drains all of them rather than one. The demo then
 * returns 503 to the next person who opens it.
 *
 * WHAT THIS DOES NOT DO, VERIFIED RATHER THAN ASSUMED.
 *
 * State here is per serverless instance. On this deployment that means it does not bind at
 * all: firing five requests at the live endpoint returns five distinct x-vercel-id lambda
 * ids, so every request gets a fresh module scope and a full bucket. Fifteen consecutive
 * calls all returned 200. This limiter stops a burst only where an instance is reused,
 * which under Vercel's model for a low-traffic app is close to never.
 *
 * It is kept because it costs nothing, it binds under sustained load where instances do get
 * reused, and the tests hold it to its stated behaviour. It is NOT the control that protects
 * the endpoint, and this comment exists so nobody reads the file and concludes otherwise.
 *
 * WHAT ACTUALLY BOUNDS THE DAMAGE TODAY: the provider keys are free-tier with no payment
 * method attached, so the worst case is quota exhaustion -- the demo answers 503 -- and not
 * an unbounded bill. That is a real risk during judging and not a financial one.
 *
 * THE REAL FIX needs shared state across instances: Vercel KV or Upstash Redis (both have
 * free tiers, roughly ten minutes plus a signup), or a WAF rule at the edge. Either makes
 * the bucket global instead of per-instance. Neither was available to do here without
 * creating an account on someone's behalf.
 */

const PER_IP_TOKENS = 8;
const PER_IP_REFILL_MS = 60_000;
const DAILY_CEILING = 400;

type Bucket = { tokens: number; last: number };

const buckets = new Map<string, Bucket>();
let dayStamp = new Date().toISOString().slice(0, 10);
let dayCount = 0;

/** Trust only the first hop; the rest of XFF is caller-controlled and trivially forged. */
export function clientKey(request: Request): string {
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

export type Verdict =
  | { ok: true }
  | { ok: false; status: 429; error: string; retryAfter: number };

export function checkLimit(request: Request): Verdict {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayStamp) {
    dayStamp = today;
    dayCount = 0;
    buckets.clear();
  }

  if (dayCount >= DAILY_CEILING) {
    return {
      ok: false,
      status: 429,
      error:
        "This demo's daily budget for live model calls is spent. The measured results on " +
        "the page are unaffected -- they are committed artifacts, not live calls.",
      retryAfter: 3600,
    };
  }

  const key = clientKey(request);
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: PER_IP_TOKENS, last: now };

  // Continuous refill rather than a fixed window: a fixed window lets a caller spend the
  // whole allowance twice across the boundary.
  const refilled = ((now - b.last) / PER_IP_REFILL_MS) * PER_IP_TOKENS;
  b.tokens = Math.min(PER_IP_TOKENS, b.tokens + refilled);
  b.last = now;

  if (b.tokens < 1) {
    buckets.set(key, b);
    const waitMs = ((1 - b.tokens) / PER_IP_TOKENS) * PER_IP_REFILL_MS;
    return {
      ok: false,
      status: 429,
      error: `Rate limit: ${PER_IP_TOKENS} live model calls per minute. The committed results on this page need no calls at all.`,
      retryAfter: Math.max(1, Math.ceil(waitMs / 1000)),
    };
  }

  b.tokens -= 1;
  buckets.set(key, b);
  dayCount += 1;

  // Unbounded growth is its own denial of service: a caller cycling source addresses would
  // otherwise grow this map until the instance dies.
  if (buckets.size > 5_000) {
    const cutoff = now - PER_IP_REFILL_MS * 2;
    for (const [k, v] of buckets) if (v.last < cutoff) buckets.delete(k);
  }

  return { ok: true };
}

/** Exposed for the route's tests, which must not depend on wall-clock state from earlier ones. */
export function __resetLimiter(): void {
  buckets.clear();
  dayCount = 0;
  dayStamp = new Date().toISOString().slice(0, 10);
}
