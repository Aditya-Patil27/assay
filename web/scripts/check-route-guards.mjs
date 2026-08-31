/**
 * Exercise the guards on /api/agent without calling a model.
 *
 * The route was the only server code in the repo and had no test at all: not the rate
 * limit, not the validation, not the channel-mismatch guard. Those are the paths that run
 * when someone is abusing the endpoint or probing it, which is precisely when nobody is
 * watching.
 *
 * Deliberately does not test the happy path -- that needs a provider key and a billed
 * completion, and a test that costs money per run does not get run.
 *
 *   npm run check:route
 */
import assert from "node:assert/strict";

import { checkLimit, clientKey, __resetLimiter } from "../lib/ratelimit.ts";

const req = (ip) =>
  new Request("https://example.test/api/agent", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });

let passed = 0;
const test = (name, fn) => {
  __resetLimiter();
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

test("first call from an address is allowed", () => {
  assert.equal(checkLimit(req("1.2.3.4")).ok, true);
});

test("a burst is cut off, and says when to retry", () => {
  const ip = "1.2.3.4";
  let allowed = 0;
  for (let i = 0; i < 40; i += 1) if (checkLimit(req(ip)).ok) allowed += 1;

  assert.ok(allowed <= 8, `expected <= 8 through, got ${allowed}`);
  assert.ok(allowed >= 1, "the limiter must not block the first call");

  const blocked = checkLimit(req(ip));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 429);
  assert.ok(blocked.retryAfter >= 1, "a 429 without retry-after is not actionable");
});

test("one abusive address does not lock out everyone else", () => {
  for (let i = 0; i < 40; i += 1) checkLimit(req("9.9.9.9"));
  assert.equal(checkLimit(req("5.6.7.8")).ok, true, "buckets must be per-address");
});

test("only the first hop of x-forwarded-for is trusted", () => {
  // Everything after the first entry is caller-supplied; keying on it would let one caller
  // mint unlimited buckets by appending junk.
  const spoofed = new Request("https://example.test/api/agent", {
    method: "POST",
    headers: { "x-forwarded-for": "7.7.7.7, 1.1.1.1, 2.2.2.2" },
  });
  assert.equal(clientKey(spoofed), "7.7.7.7");
});

test("a missing forwarding header still yields a stable key", () => {
  const bare = new Request("https://example.test/api/agent", { method: "POST" });
  assert.equal(clientKey(bare), "unknown");
});

test("the daily ceiling eventually refuses even a well-behaved caller", () => {
  // Spread across addresses so the per-IP bucket is never the thing that trips.
  let refused = null;
  for (let i = 0; i < 600 && !refused; i += 1) {
    const v = checkLimit(req(`10.0.${(i / 250) | 0}.${i % 250}`));
    if (!v.ok) refused = v;
  }
  assert.ok(refused, "the daily ceiling must bound total spend");
  assert.equal(refused.status, 429);
  assert.match(refused.error, /budget|limit/i);
});

console.log(`\nPASS: ${passed} route-guard checks`);
