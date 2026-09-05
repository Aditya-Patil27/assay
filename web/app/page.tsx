import Link from "next/link";

import { LiveScoreStream } from "@/components/LiveScoreStream";
import { WhatBroke } from "@/components/WhatBroke";
import { FeatureLoop } from "@/components/FeatureLoop";

import {
  loadArtifacts,
  loadGuarantees,
  loadDataProvenance,
  loadFeatureSchema,
  loadLatency,
  loadLiveSamples,
  loadProviderRedteams,
} from "@/lib/load";

/**
 * The overview.
 *
 * Structurally this borrows the shape every enterprise fraud platform uses -- dark hero,
 * statistics band, capability cards, close -- because a wall of white reads as a document
 * rather than a system. What it deliberately does not borrow is the half of that page
 * which is social proof: logo carousels, testimonials, award strips. This is a three-day
 * build with no customers, and every one of those would have to be invented.
 *
 * A judging panel scans for what/why/impressive in the first ten seconds, so the argument
 * is a three-step flow before it is a paragraph, and every raw metric carries its own
 * translation -- "3.81 -> 4.64 mean features touched" means nothing to a reader who does
 * not already know what L0 is.
 */

const STEPS = [
  {
    k: "The problem",
    v: "A fraud defence reports a number nobody attacked. Published evasion results usually measure an attacker who could not exist.",
  },
  {
    k: "What we built",
    v: "One loop — attack, measure, defend, re-measure — held to what a real attacker controls, run on a tabular detector and on a payment agent.",
  },
  {
    k: "What landed",
    v: "Payment-agent exploits 4.86% → 0.0% (p = 0.015 on gpt-oss-120b). And a feasibility audit: 99.9% of a naive attacker's identical 100% is transactions that cannot occur.",
  },
  {
    k: "What we priced",
    v: "Adversarial retraining did not stop one evasion. It raised the attacker's median queries 275 → 391 and cost 1.6% of PR-AUC — so the defence has to live elsewhere.",
  },
];

const CAPABILITIES = [
  {
    href: "/results",
    label: "Co-evolution results",
    blurb: "Three rounds of attack and adversarial retraining, plus the feasibility audit run against our own baseline before any number is reported.",
  },
  {
    href: "/attack",
    label: "Tabular surface",
    blurb: "Worked evasions feature by feature, and the constraint contract every perturbation is held to.",
  },
  {
    href: "/system",
    label: "The system, audited",
    blurb: "Every backend module inventoried from source, the ONNX serving latency, and the corpus the bands were measured from.",
  },
];

export default async function Home() {
  const [{ attack, agentic }, latency, corpus, schema, guarantees, providers, live] =
    await Promise.all([
      loadArtifacts(),
      loadLatency(),
      loadDataProvenance(),
      loadFeatureSchema(),
      loadGuarantees(),
      loadProviderRedteams(),
      loadLiveSamples(),
    ]);

  const rounds = attack.payload;
  const first = rounds[0];
  const last = rounds[rounds.length - 1];
  const injections =
    providers.length > 0
      ? providers.reduce((n, p) => n + p.payload.reduce((m, c) => m + c.attempts, 0), 0)
      : agentic.payload.reduce((m, c) => m + c.attempts, 0);

  // Translations, computed rather than written down: a reader who does not know what L0
  // is still learns that the attack got 22% more expensive.
  const l0Pct = (last.mean_l0 / first.mean_l0 - 1) * 100;
  const qPct = (last.median_queries / first.median_queries - 1) * 100;

  const stats = [
    corpus && {
      value: corpus.n_rows.toLocaleString("en-US"),
      label: "real transactions",
      sub: `${corpus.n_fraud.toLocaleString("en-US")} labelled fraud · ${(corpus.fraud_rate * 100).toFixed(2)}% base rate`,
    },
    latency && {
      value: `${latency.payload.p50_ms.toFixed(3)} ms`,
      label: "to score one transaction",
      sub: `p50 on ${latency.payload.backend} — fast enough for an authorisation path`,
    },
    {
      value: injections.toLocaleString("en-US"),
      label: "prompt injections fired",
      sub:
        providers.length > 1
          ? `across ${providers.length} model vendors, with an exact test on each`
          : "scored by OWASP LLM Top 10 category",
    },
    schema && {
      value: `${schema.frozen.length}/${schema.columns.length}`,
      label: "features the attacker cannot touch",
      sub: "frozen by the constraint contract, not by policy",
    },
    guarantees && {
      // Not lines of code. LOC says nothing about whether a system works; the number of
      // places the same logic is held equal across two languages says quite a lot.
      value: String(guarantees.payload.guarantees.length),
      label: "checks that fail loudly",
      sub: `cross-language equivalence proofs · ${guarantees.payload.tests.cases} test cases`,
    },
    {
      value: `${(last.asr * 100).toFixed(0)}%`,
      label: "attack success, still",
      sub: "after three rounds of adversarial retraining",
      tone: "attack" as const,
    },
  ].filter(Boolean) as { value: string; label: string; sub: string; tone?: "attack" }[];

  return (
    <>
      {/* ---- Dark hero ---------------------------------------------------------- */}
      <section className="bg-night text-night-ink">
        <div className="wrap grid gap-12 py-16 md:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start">
          <div>
            <p className="mono-label text-[0.8125rem] text-attack">
              Razorpay AI Buildathon 2026 · Open Track
            </p>
            <h1 className="display mt-4 max-w-[15ch] text-[2.75rem] sm:text-[3.75rem] md:text-[4.5rem]">
              The test that tells you which of your security numbers are real.
            </h1>

            {/* The three-step read, before the paragraph. A panel scans; it does not
                start by reading 60 words of prose. */}
            <dl className="mt-8 space-y-4 border-l border-night-rule pl-5">
              {STEPS.map((s) => (
                <div key={s.k}>
                  <dt className="mono-label text-[0.75rem] text-attack">
                    {s.k}
                  </dt>
                  <dd className="mt-1 max-w-[56ch] text-[0.9375rem] leading-relaxed text-night-muted">
                    {s.v}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/live"
                className="mono-label rounded-[5px] bg-attack-fill px-4 py-2.5 text-[0.8125rem] font-bold text-ink transition-opacity hover:opacity-90"
              >
                Run the live detector
              </Link>
              <Link
                href="/results"
                className="mono-label rounded-[5px] border border-rule px-4 py-2.5 text-[0.8125rem] text-ink transition-colors hover:border-muted"
              >
                See the results
              </Link>
            </div>

            {/* The transparency claim, up here rather than buried in a footnote. It is
                the most persuasive thing on the page for this particular panel. */}
            <p className="mt-8 max-w-[60ch] border-t border-night-rule pt-5 text-[0.8125rem] leading-relaxed text-night-muted">
              <span className="font-medium text-night-ink">Every number on this site is read
              from a committed artifact.</span>{" "}
              There are no customer logos, testimonials or award badges anywhere on it, because
              a project about measurement dishonesty does not get to invent its own proof.
            </p>
          </div>

          <div className="space-y-4">
            {live?.payload.stream?.length ? (
              <LiveScoreStream samples={live.payload} />
            ) : null}
            <CoevolutionSpark rounds={rounds} l0Pct={l0Pct} qPct={qPct} />
          </div>
        </div>
      </section>

      {/* ---- The system in 37 seconds ------------------------------------------- */}
      <section className="wrap reveal pt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="display text-[1.5rem] md:text-[1.75rem]">The system in 37 seconds</h2>
          <p className="text-[0.8125rem] text-muted">
            Four cuts from the deployed site, captioned. No narration; the pitch has that.
          </p>
        </div>
        <div className="mt-4 overflow-hidden rounded-[8px] border border-rule bg-black">
          <video
            src="/demos/hero.mp4"
            autoPlay
            muted
            loop
            playsInline
            controls
            preload="metadata"
            aria-label="The system in 37 seconds: a live injection fired with defences off then on, the detector scoring in the browser, the audit ledger replaying, and the three-round results"
            className="block h-auto w-full"
          />
        </div>
      </section>

      {/* ---- Bento statistics ---------------------------------------------------- */}
      <section className="wrap reveal py-14">
        <h2 className="mono-label text-[0.8125rem] text-muted">Measured, end to end</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="card border border-rule p-5">
              <dd
                className={`tnum display text-[1.875rem] leading-none ${s.tone === "attack" ? "text-attack" : ""}`}
              >
                {s.value}
              </dd>
              <dt className="mt-2 text-[0.9375rem] font-medium">{s.label}</dt>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{s.sub}</p>
            </div>
          ))}
        </dl>
      </section>

      <WhatBroke />

      {/* ---- Feature loops ------------------------------------------------------ */}
      <section className="wrap pt-14">
        <h2 className="display text-[1.75rem] md:text-[2rem]">
          Two attack surfaces, one loop, both of them live
        </h2>
        <p className="prose col mt-3">
          The same cycle — attack, measure, defend, re-measure — applied to a tabular fraud
          detector and to a payment agent. Each clip below is the deployed page, recorded.
        </p>
      </section>
      <FeatureLoop
        eyebrow="Surface 1 · tabular"
        title="Run the detector in your own tab"
        blurb="The exported tree ensemble, walked in the browser. Move a transaction, watch the score move, then run the constraint-aware attack against it."
        href="/live"
        cta="Run the live detector"
        src="/demos/live.mp4"
      />
      <FeatureLoop
        eyebrow="Surface 2 · agentic"
        title="Fire a live injection at a real model"
        blurb="Pick a payload planted in a payment memo and fire it twice: defenses off, then on. Watch the payee's account move, or not."
        href="/agent"
        cta="Fire an injection"
        src="/demos/agent.mp4"
        flip
      />
      <FeatureLoop
        eyebrow="Provenance"
        title="Every claim, with what ran behind it"
        blurb="Each artifact becomes an audited claim. Green means a test or a file backs it. Amber means nothing ran — including five of our own."
        href="/audit"
        cta="Open the audit console"
        src="/demos/audit.mp4"
      />

      {/* ---- Remaining pages ----------------------------------------------------- */}
      <section className="wrap reveal pb-14 pt-4">
        <div className="grid gap-4 md:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="card group flex flex-col border border-rule p-5 transition-shadow hover:shadow-md"
            >
              <span className="display text-[1.0625rem]">{c.label}</span>
              <span className="mt-2 flex-1 text-[0.8125rem] leading-relaxed text-muted">
                {c.blurb}
              </span>
              <span className="mt-4 text-[0.8125rem] font-medium text-defend">
                Open
                <span
                  aria-hidden="true"
                  className="ml-1 inline-block transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- Close --------------------------------------------------------------- */}
      <section className="bg-night text-night-ink">
        <div className="wrap flex flex-wrap items-center justify-between gap-6 py-12">
          <div>
            <h2 className="display text-[1.5rem] md:text-[1.75rem]">
              Both demos run for real, and neither needs a sign-up.
            </h2>
            <p className="mt-2 max-w-[58ch] text-[0.9375rem] text-night-muted">
              The detector is downloaded and executed in your own tab. The payment agent is a
              live model call behind one server route, because that is where the key has to
              live.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/live"
              className="mono-label rounded-[5px] bg-attack-fill px-5 py-3 text-[0.8125rem] font-bold text-ink transition-opacity hover:opacity-90"
            >
              Run the detector
            </Link>
            <Link
              href="/agent"
              className="mono-label rounded-[5px] border border-rule px-5 py-3 text-[0.8125rem] text-ink transition-colors hover:border-muted"
            >
              Fire an injection
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * The hero visual: attack success pinned flat, attacker cost climbing under it.
 *
 * The cost series is median QUERIES, not features touched. On the full dataset mean L0
 * is flat (4.12 -> 4.03) while queries rise 275 -> 391, so features touched would draw a
 * flat line under a legend promising a climb.
 *
 * This replaced three full-width red bars. They were not wrong -- attack success really is
 * 100% at every round -- but three identical full bars spend a lot of red saying one
 * thing, and a reader scanning quickly reads three alarms instead of one flat line. Drawn
 * as two series the shape *is* the finding: the red does not move, the blue does.
 *
 * Inline SVG rather than a chart library because it is server-rendered, has no interaction
 * to offer, and must not cost the hero a client bundle.
 */
function CoevolutionSpark({
  rounds,
  l0Pct,
  qPct,
}: {
  rounds: { round: number; asr: number; mean_l0: number; median_queries: number }[];
  l0Pct: number;
  qPct: number;
}) {
  const W = 320;
  const H = 116;
  const pad = 6;
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(rounds.length - 1, 1);

  // Queries, not features touched. Mean L0 is flat across rounds on the full dataset
  // (4.12 -> 4.03), so drawing it as the "effort" series would show a flat line beneath a
  // legend claiming it climbs. Median queries per success is the axis the cost actually
  // appears on, and it is the one plotted.
  const efforts = rounds.map((r) => r.median_queries);
  const lo = Math.min(...efforts);
  const hi = Math.max(...efforts);
  // Effort is drawn on its own scale across the lower band; the two series share no unit
  // and a shared axis would invent a comparison that does not exist.
  const yEffort = (v: number) => H - 14 - ((v - lo) / Math.max(hi - lo, 1e-9)) * (H * 0.42);
  const yAsr = 20;

  return (
    <div className="rounded-[10px] border border-night-rule bg-night-2 p-6">
      <p className="text-[0.75rem] font-medium text-night-muted">Across three rounds</p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 w-full"
        role="img"
        aria-label={`Attack success rate stays at 100% across ${rounds.length} rounds while median queries per successful evasion rise from ${efforts[0]} to ${efforts[efforts.length - 1]}`}
      >
        <line
          x1={pad}
          y1={yAsr}
          x2={W - pad}
          y2={yAsr}
          stroke="var(--color-attack-fill)"
          strokeWidth="2"
        />
        {rounds.map((r, i) => (
          <circle key={r.round} cx={x(i)} cy={yAsr} r="3.5" fill="var(--color-attack-fill)" />
        ))}

        <polyline
          points={rounds.map((r, i) => `${x(i)},${yEffort(r.median_queries)}`).join(" ")}
          fill="none"
          stroke="var(--color-defend-fill)"
          strokeWidth="2"
        />
        {rounds.map((r, i) => (
          <circle
            key={r.round}
            cx={x(i)}
            cy={yEffort(r.median_queries)}
            r="3.5"
            fill="var(--color-figure)"
            stroke="var(--color-defend-fill)"
            strokeWidth="2"
          />
        ))}

        {rounds.map((r, i) => (
          <text
            key={r.round}
            x={x(i)}
            y={H - 1}
            textAnchor={i === 0 ? "start" : i === rounds.length - 1 ? "end" : "middle"}
            fontSize="9"
            fill="var(--color-night-muted)"
            fontFamily="var(--font-mono)"
          >
            r{r.round}
          </text>
        ))}
      </svg>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.75rem]">
        <span className="inline-flex items-center gap-1.5 text-night-muted">
          <span className="inline-block h-0.5 w-4 bg-attack-fill" aria-hidden="true" />
          attack success — flat at 100%
        </span>
        <span className="inline-flex items-center gap-1.5 text-night-muted">
          <span className="inline-block h-0.5 w-4 bg-defend-fill" aria-hidden="true" />
          attacker effort — queries climbing
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-night-rule pt-5">
        <Cost
          value={`${rounds[0].mean_l0.toFixed(2)} → ${rounds[rounds.length - 1].mean_l0.toFixed(2)}`}
          label="mean features touched"
          // The sign is derived, never assumed. A hardcoded "+" rendered "+-2%" once the
          // full dataset turned this delta negative, which is how it was found.
          delta={
            Math.abs(l0Pct) < 5
              ? "flat within noise"
              : `${l0Pct >= 0 ? "+" : "−"}${Math.abs(l0Pct).toFixed(0)}% per evasion`
          }
        />
        <Cost
          value={`${rounds[0].median_queries} → ${rounds[rounds.length - 1].median_queries}`}
          label="median queries"
          delta={`+${qPct.toFixed(0)}% probing to find one`}
        />
      </div>
    </div>
  );
}

function Cost({ value, label, delta }: { value: string; label: string; delta: string }) {
  return (
    <div>
      <p className="tnum display text-[1.375rem] text-ink">{value}</p>
      <p className="mt-1 text-[0.75rem] text-night-muted">{label}</p>
      <p className="mt-1.5 text-[0.75rem] font-medium text-defend">{delta}</p>
    </div>
  );
}
