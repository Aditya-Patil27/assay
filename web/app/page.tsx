import Link from "next/link";

import {
  loadArtifacts,
  loadBackendAudit,
  loadDataProvenance,
  loadFeatureSchema,
  loadLatency,
  loadProviderRedteams,
} from "@/lib/load";

/**
 * The overview.
 *
 * Structurally this borrows the shape every enterprise fraud platform uses -- dark hero,
 * statistics band, capability cards, close -- because that shape works and a wall of white
 * reads as a document rather than a system. What it deliberately does NOT borrow is the
 * half of that page which is social proof: customer logo carousels, testimonials, award
 * strips, "trusted by" badges. This is a three-day hackathon build with no customers, and
 * every one of those would have to be invented. The statistics band below is the honest
 * substitute: the same visual weight, filled with numbers that came out of the pipeline.
 */

const CAPABILITIES = [
  {
    href: "/live",
    label: "Run the detector live",
    blurb:
      "The exported ONNX graph, executed in your browser on WASM. Move a transaction, watch the score move, then run the constraint-aware attack against it.",
    tone: "accent" as const,
  },
  {
    href: "/results",
    label: "Co-evolution results",
    blurb:
      "Three rounds of attack and adversarial retraining, plus the feasibility audit run against our own baseline before any number is reported.",
  },
  {
    href: "/attack",
    label: "Tabular surface",
    blurb:
      "Worked evasions feature by feature, which levers the search reaches for as the detector retrains, and the constraint contract every perturbation is held to.",
  },
  {
    href: "/agent",
    label: "Agentic surface",
    blurb:
      "Indirect prompt injection against a payment agent, scored by OWASP LLM Top 10 and measured on two vendors with an exact test on each row.",
  },
  {
    href: "/system",
    label: "The system, audited",
    blurb:
      "Every backend module inventoried from source, the ONNX serving latency, and the corpus the constraint bands were measured from.",
  },
];

export default async function Home() {
  const [{ attack, agentic }, latency, corpus, schema, audit, providers] = await Promise.all([
    loadArtifacts(),
    loadLatency(),
    loadDataProvenance(),
    loadFeatureSchema(),
    loadBackendAudit(),
    loadProviderRedteams(),
  ]);

  const first = attack.payload[0];
  const last = attack.payload[attack.payload.length - 1];
  const injections =
    providers.length > 0
      ? providers.reduce((n, p) => n + p.payload.reduce((m, c) => m + c.attempts, 0), 0)
      : agentic.payload.reduce((m, c) => m + c.attempts, 0);

  // Every figure in this band is read off a committed artifact. Nothing here is a round
  // number somebody liked the look of.
  const stats = [
    corpus && {
      value: corpus.n_rows.toLocaleString("en-US"),
      label: "transactions in the corpus",
      sub: `${corpus.n_fraud.toLocaleString("en-US")} labelled fraud · ${(corpus.fraud_rate * 100).toFixed(2)}% base rate`,
    },
    latency && {
      value: `${latency.payload.p50_ms.toFixed(3)} ms`,
      label: "to score one transaction",
      sub: `p50 on ${latency.payload.backend} over ${latency.payload.n_samples.toLocaleString("en-US")} samples`,
    },
    {
      value: injections.toLocaleString("en-US"),
      label: "prompt injections fired",
      sub:
        providers.length > 1
          ? `across ${providers.length} model vendors, scored by OWASP category`
          : "scored by OWASP LLM Top 10 category",
    },
    schema && {
      value: `${schema.frozen.length}/${schema.columns.length}`,
      label: "features the attacker cannot touch",
      sub: "frozen by the constraint contract, not by policy",
    },
    audit && {
      value: audit.payload.totals.loc.toLocaleString("en-US"),
      label: "lines of backend, under test",
      sub: `${audit.payload.totals.modules} modules · ${audit.payload.totals.test_cases} test cases`,
    },
  ].filter(Boolean) as { value: string; label: string; sub: string }[];

  return (
    <>
      {/* ---- Dark hero ---------------------------------------------------------- */}
      <section className="bg-night text-night-ink">
        <div className="wrap grid gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="text-[0.8125rem] font-medium text-defend-dim">
              Mastercard Innovation Challenge 2026
            </p>
            <h1 className="display mt-3 max-w-[16ch] text-[2.5rem] leading-[1.04] sm:text-[3.25rem] md:text-[3.75rem]">
              An attack that keeps working, and costs more every round.
            </h1>
            <p className="mt-6 max-w-[54ch] text-[1.0625rem] leading-relaxed text-night-muted">
              A constraint-aware red team evades a payment fraud detector by moving only what a
              real attacker controls. The detector retrains on those evasions. Repeat. Three
              rounds in, the attacker still succeeds on every attempt — so what we report is the
              price it pays, and the audit proving an unconstrained attacker&apos;s
              identical-looking score is mostly transactions that could never occur.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/live"
                className="rounded-[6px] bg-defend-fill px-4 py-2.5 text-[0.875rem] font-medium text-white transition-opacity hover:opacity-90"
              >
                Run the live detector
              </Link>
              <Link
                href="/results"
                className="rounded-[6px] border border-night-rule px-4 py-2.5 text-[0.875rem] font-medium text-night-ink transition-colors hover:bg-night-2"
              >
                See the results
              </Link>
            </div>
          </div>

          {/* The product visual is the actual result, not an abstract render: the two
              numbers the whole project turns on, and the gap between them. */}
          <div className="rounded-[10px] border border-night-rule bg-night-2 p-6">
            <p className="text-[0.75rem] font-medium text-night-muted">
              Attack success rate, by round
            </p>
            <div className="mt-5 space-y-4">
              {attack.payload.map((r) => (
                <div key={r.round}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[0.8125rem] text-night-muted">
                      round {r.round}
                    </span>
                    <span className="tnum font-mono text-[0.875rem] text-attack-dim">
                      {(r.asr * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-[2px] bg-night">
                    <div
                      className="h-full bg-attack-fill"
                      style={{ width: `${r.asr * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-night-rule pt-5">
              <p className="text-[0.75rem] font-medium text-night-muted">
                What it cost the attacker
              </p>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <p className="tnum display text-[1.5rem] text-defend-dim">
                    {first.mean_l0.toFixed(2)} → {last.mean_l0.toFixed(2)}
                  </p>
                  <p className="mt-1 text-[0.75rem] text-night-muted">mean features touched</p>
                </div>
                <div>
                  <p className="tnum display text-[1.5rem] text-defend-dim">
                    {first.median_queries} → {last.median_queries}
                  </p>
                  <p className="mt-1 text-[0.75rem] text-night-muted">median queries</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Statistics band ----------------------------------------------------- */}
      <section className="border-b border-rule bg-figure">
        <div className="wrap py-12">
          <dl className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label}>
                <dd className="tnum display text-[2rem] leading-none md:text-[2.25rem]">
                  {s.value}
                </dd>
                <dt className="mt-2 text-[0.9375rem] font-medium">{s.label}</dt>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{s.sub}</p>
              </div>
            ))}
          </dl>
          <p className="mt-9 border-t border-rule pt-4 text-[0.75rem] text-muted">
            Every figure above is read from a committed artifact at build time. There are no
            customer logos, testimonials or award badges on this page because this is a
            three-day build with none of those, and inventing them is the one thing a project
            about measurement dishonesty must not do.
          </p>
        </div>
      </section>

      {/* ---- Capabilities -------------------------------------------------------- */}
      <section className="wrap py-14">
        <h2 className="display text-[1.75rem] md:text-[2rem]">
          Two attack surfaces, one loop, measured end to end
        </h2>
        <p className="prose col mt-3">
          The same cycle — attack, measure, defend, re-measure — applied to a tabular fraud
          detector and to a payment agent. Two surfaces is what makes this a framework rather
          than a project.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={`card group flex flex-col border p-5 transition-shadow hover:shadow-md ${
                c.tone === "accent" ? "border-defend-dim" : "border-rule"
              }`}
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
              The detector is one click away, and it runs in your tab.
            </h2>
            <p className="mt-2 max-w-[56ch] text-[0.9375rem] text-night-muted">
              No sign-up, no server, no cold start — the model is downloaded and executed
              locally, so the numbers you get are the model&apos;s own.
            </p>
          </div>
          <Link
            href="/live"
            className="shrink-0 rounded-[6px] bg-defend-fill px-5 py-3 text-[0.875rem] font-medium text-white transition-opacity hover:opacity-90"
          >
            Run the live detector
          </Link>
        </div>
      </section>
    </>
  );
}
