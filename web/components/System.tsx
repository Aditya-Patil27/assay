import type { DataProvenance, FeatureSchema, LatencyStats } from "@/lib/types";

/**
 * The system behind the numbers.
 *
 * Everything above this point is a result. These three panels are the machine that
 * produced it, and they exist because the results are only as good as the contract, the
 * corpus and the serving path underneath them -- each of which is a committed artifact
 * rather than a claim in a slide.
 */

type Tier = "frozen" | "coupled" | "free";

const TIER: Record<Tier, { label: string; rule: string; className: string }> = {
  // Blue is the defense. A frozen column is the one piece of the transaction the attacker
  // provably cannot reach, so it is drawn as defended rather than as merely disabled.
  frozen: {
    label: "Frozen",
    rule: "inherited from the victim; excluded from the search",
    className: "text-defend",
  },
  coupled: {
    label: "Coupled",
    rule: "moves only as a unit, to a merchant observed in the network",
    className: "text-warn",
  },
  free: {
    label: "Free",
    rule: "the attacker's actual levers, clipped to the observed band",
    className: "text-attack",
  },
};

const num = (n: number) =>
  Math.abs(n) >= 1000
    ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : Math.abs(n) >= 1
      ? n.toFixed(2)
      : n.toFixed(3);

/**
 * The contract the attacker is held to.
 *
 * This is the project's central claim rendered as data rather than prose: every one of
 * the detector's 20 input columns is assigned a tier, and the bounds are the observed
 * min/max of the training corpus. "Feasible" is therefore a measured property of the
 * network, not an assertion by whoever wrote the attack.
 */
export function ConstraintContract({ schema }: { schema: FeatureSchema }) {
  const coupled = new Set(schema.coupled_groups.flat());
  const frozen = new Set(schema.frozen);

  const tierOf = (col: string): Tier =>
    frozen.has(col) ? "frozen" : coupled.has(col) ? "coupled" : "free";

  const order: Tier[] = ["frozen", "coupled", "free"];
  const counts = { frozen: 0, coupled: 0, free: 0 } as Record<Tier, number>;
  for (const c of schema.columns) counts[tierOf(c)] += 1;

  return (
    <div>
      <dl className="flex flex-wrap gap-x-8 gap-y-2 border-b border-rule pb-4 text-[0.8125rem]">
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">Detector inputs</dt>
          <dd className="tnum font-mono">{schema.columns.length}</dd>
        </div>
        {order.map((t) => (
          <div key={t} className="flex items-baseline gap-2">
            <dt className={TIER[t].className}>{TIER[t].label}</dt>
            <dd className="tnum font-mono">{counts[t]}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">
            Every detector input column, its constraint tier, and its observed range
          </caption>
          <thead>
            <tr className="text-left text-[11px] font-medium text-muted">
              <th scope="col" className="border-b border-rule py-2.5 pr-4">
                Column
              </th>
              <th scope="col" className="border-b border-rule py-2.5 pr-4">
                Tier
              </th>
              <th scope="col" className="border-b border-rule py-2.5 text-right">
                Observed range
              </th>
            </tr>
          </thead>
          {order.map((tier) => {
            const cols = schema.columns.filter((c) => tierOf(c) === tier);
            if (cols.length === 0) return null;
            return (
              <tbody key={tier}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={3}
                    className="border-b border-rule pb-2 pt-5 text-left text-[0.8125rem] font-normal"
                  >
                    <span className={`font-medium ${TIER[tier].className}`}>
                      {TIER[tier].label}
                    </span>
                    <span className="text-muted"> — {TIER[tier].rule}</span>
                  </th>
                </tr>
                {cols.map((c) => {
                  const b = schema.bounds[c];
                  return (
                    <tr key={c}>
                      <td className="border-b border-rule py-2 pr-4 font-mono text-[0.8125rem]">
                        {c}
                      </td>
                      <td className="border-b border-rule py-2 pr-4 text-[0.8125rem] text-muted">
                        {TIER[tier].label}
                      </td>
                      <td className="tnum border-b border-rule py-2 text-right font-mono text-[0.8125rem] text-muted">
                        {b ? `${num(b[0])} … ${num(b[1])}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </div>
  );
}

/**
 * The serving path.
 *
 * A detector that only exists inside a notebook is not a payment control. These numbers
 * come from the exported ONNX graph on the same input shape the pipeline scores, so the
 * question "could this sit in an authorisation path" has a measured answer rather than an
 * architectural diagram.
 */
export function ServingLatency({ latency }: { latency: LatencyStats }) {
  const rows: { label: string; value: number; bar: boolean }[] = [
    { label: "p50", value: latency.p50_ms, bar: true },
    { label: "p95", value: latency.p95_ms, bar: true },
    { label: "p99", value: latency.p99_ms, bar: true },
    { label: "mean", value: latency.mean_ms, bar: true },
    { label: "max", value: latency.max_ms, bar: false },
  ];
  // Scaled to p99, not to max: the max is a single cold-path outlier two orders of
  // magnitude out, and scaling to it would flatten every bar that matters to nothing.
  const scale = Math.max(latency.p99_ms, 1e-9);

  return (
    <div>
      <dl className="flex flex-wrap gap-x-8 gap-y-2 border-b border-rule pb-4 text-[0.8125rem]">
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">Backend</dt>
          <dd className="font-mono">{latency.backend}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">Mode</dt>
          <dd className="font-mono">{latency.mode.replace(/_/g, " ")}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">Samples</dt>
          <dd className="tnum font-mono">{latency.n_samples.toLocaleString("en-US")}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">1 / mean</dt>
          <dd className="tnum font-mono">
            {Math.round(1000 / latency.mean_ms).toLocaleString("en-US")} txn/s
          </dd>
        </div>
      </dl>

      <table className="mt-4 w-full border-collapse text-sm">
        <caption className="sr-only">
          Single-transaction scoring latency of the exported ONNX detector
        </caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="w-16 border-b border-rule py-2.5 text-[0.8125rem] text-muted">
                {r.label}
              </td>
              <td className="tnum w-24 border-b border-rule py-2.5 text-right font-mono">
                {r.value.toFixed(3)}
                <span className="ml-1 text-[0.75rem] text-muted">ms</span>
              </td>
              <td className="border-b border-rule py-2.5 pl-5">
                {r.bar ? (
                  <span className="block h-2 w-full bg-figure-2" aria-hidden="true">
                    <span
                      className="block h-full bg-defend-fill"
                      style={{ width: `${Math.min((r.value / scale) * 100, 100)}%` }}
                    />
                  </span>
                ) : (
                  <span className="text-[0.75rem] text-muted">
                    single cold-path outlier, shown rather than trimmed
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where the transactions came from, straight off the loader's provenance record. */
export function Corpus({ prov }: { prov: DataProvenance }) {
  const day = (s: string) => s.slice(0, 10);
  const items: { label: string; value: string }[] = [
    { label: "Transactions", value: prov.n_rows.toLocaleString("en-US") },
    { label: "Labelled fraud", value: prov.n_fraud.toLocaleString("en-US") },
    { label: "Base rate", value: `${(prov.fraud_rate * 100).toFixed(3)}%` },
    { label: "Distinct cards", value: prov.n_cards.toLocaleString("en-US") },
    { label: "Window", value: `${day(prov.date_min)} → ${day(prov.date_max)}` },
    { label: "Source", value: prov.kaggle_dataset ?? prov.generator ?? prov.source },
  ];

  return (
    <div>
      <dl className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <div key={i.label} className="border-b border-rule py-3">
            <dt className="text-[0.8125rem] text-muted">{i.label}</dt>
            <dd className="tnum mt-1 break-all font-mono text-base">{i.value}</dd>
          </div>
        ))}
      </dl>

      {prov.warning ? (
        <p role="alert" className="mt-4 border-l-2 border-warn py-2 pl-3 text-[0.8125rem] text-warn">
          Loader warning, verbatim: {prov.warning}
        </p>
      ) : null}
    </div>
  );
}
