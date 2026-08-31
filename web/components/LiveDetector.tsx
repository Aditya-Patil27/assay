"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { scoreRow, type TreeModel } from "@/lib/trees";
import type { FeatureSchema, LiveSamples } from "@/lib/types";

/**
 * The detector, running in the visitor's browser.
 *
 * This is not a re-implementation and not a mock. It is models/detector_round0.onnx --
 * the same frozen graph scripts/export_live_samples.py scored to pick these transactions,
 * and the same one the latency figures on /system were measured against -- executed by
 * ONNX Runtime compiled to WASM. The scores below therefore agree with the pipeline's to
 * the float, and the page needs no server to produce them.
 *
 * The attack is a faithful port of the greedy stage of attack/engine.py: for each feature
 * the attacker is allowed to touch, sweep a grid of candidate values inside that feature's
 * observed band, keep the single change that drops p(fraud) most, and repeat until the
 * score falls under the operating threshold or the sparsity budget runs out.
 */

/** Mirrors AttackConfig: a 9-point sweep per feature and an L0 budget. */
const GRID = 9;
const MAX_STEPS = 8;

interface Step {
  feature: string;
  from: number;
  to: number;
  prob: number;
  queries: number;
}

export function LiveDetector({
  samples,
  schema,
}: {
  samples: LiveSamples;
  schema: FeatureSchema;
}) {
  const { threshold, features } = samples;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleIdx, setSampleIdx] = useState(0);
  const [values, setValues] = useState<Record<string, number>>(samples.samples[0].values);
  const [prob, setProb] = useState<number | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);

  const modelRef = useRef<TreeModel | null>(null);

  const frozen = useMemo(() => new Set(schema.frozen), [schema.frozen]);
  const coupled = useMemo(() => new Set(schema.coupled_groups.flat()), [schema.coupled_groups]);
  // The engine's `pool` when the merchant coordinate is excluded: everything the attacker
  // controls that is not part of the coupled merchant move.
  const free = useMemo(
    () => features.filter((f) => !frozen.has(f) && !coupled.has(f)),
    [features, frozen, coupled],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/data/detector_trees.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (cancelled) return;
        modelRef.current = d.payload as TreeModel;
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** One forward pass. Synchronous now -- it is 400 tree walks, not a runtime call. */
  const score = useCallback(
    async (v: Record<string, number>): Promise<number> => {
      const m = modelRef.current;
      return m ? scoreRow(m, v) : Number.NaN;
    },
    [],
  );

  // Rescore whenever the transaction changes.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    score(values).then((p) => {
      if (!cancelled) setProb(p);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, values, score]);

  const loadSample = (i: number) => {
    setSampleIdx(i);
    setValues(samples.samples[i].values);
    setSteps([]);
  };

  /**
   * Greedy coordinate descent, ported from attack/engine.py::_greedy.
   *
   * Each round sweeps every allowed feature across a grid inside its observed band, keeps
   * the single best single-feature change, and stops the moment the score crosses under
   * the threshold. The query counter is the real one -- every candidate evaluation is a
   * model call, which is what makes "median queries" on /results a cost and not a
   * decoration.
   */
  const runAttack = async () => {
    setRunning(true);
    setSteps([]);
    let current = { ...values };
    let p = await score(current);
    let queries = 1;
    const log: Step[] = [];

    for (let step = 0; step < MAX_STEPS && p >= threshold; step += 1) {
      let best: { feature: string; value: number; prob: number } | null = null;

      for (const f of free) {
        const band = schema.bounds[f];
        if (!band) continue;
        const [lo, hi] = band;
        for (let g = 0; g < GRID; g += 1) {
          const candidate = lo + ((hi - lo) * g) / (GRID - 1);
          if (candidate === current[f]) continue;
          const trial = { ...current, [f]: candidate };
          const tp = await score(trial);
          queries += 1;
          if (!best || tp < best.prob) best = { feature: f, value: candidate, prob: tp };
        }
      }

      if (!best || best.prob >= p) break; // no single move helps; the search is stuck
      log.push({ feature: best.feature, from: current[best.feature], to: best.value, prob: best.prob, queries });
      current = { ...current, [best.feature]: best.value };
      p = best.prob;
      setSteps([...log]);
      setValues(current);
    }

    setRunning(false);
  };

  const flagged = prob !== null && prob >= threshold;
  const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(3));

  if (error) {
    return (
      <div className="card border border-attack/30 p-5">
        <p className="text-sm font-medium text-attack">The detector could not be loaded.</p>
        <p className="mt-2 font-mono text-[0.8125rem] text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="card border border-rule p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="display text-[1.0625rem]">Transaction</h3>
          <label className="flex items-center gap-2 text-[0.8125rem] text-muted">
            real flagged fraud
            <select
              value={sampleIdx}
              onChange={(e) => loadSample(Number(e.target.value))}
              className="rounded-[5px] border border-rule bg-figure px-2 py-1 font-mono text-[0.8125rem] text-ink"
            >
              {samples.samples.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.id} · p={s.p_fraud.toFixed(3)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
          Drag any free feature and the score re-computes in the model, not in an
          approximation of it. Frozen features are the ones a real attacker inherits from the
          victim, so they cannot be dragged at all.
        </p>

        <div className="mt-5 space-y-3">
          {free.map((f) => {
            const [lo, hi] = schema.bounds[f] ?? [0, 1];
            return (
              <div key={f} className="grid grid-cols-[11rem_minmax(0,1fr)_5rem] items-center gap-3">
                <label htmlFor={`f-${f}`} className="truncate font-mono text-[0.75rem] text-ink">
                  {f}
                </label>
                <input
                  id={`f-${f}`}
                  type="range"
                  min={lo}
                  max={hi}
                  step={(hi - lo) / 200}
                  value={values[f]}
                  disabled={running}
                  onChange={(e) => setValues({ ...values, [f]: Number(e.target.value) })}
                  className="accent-[color:var(--color-defend-fill)]"
                />
                <span className="tnum text-right font-mono text-[0.75rem] text-muted">
                  {fmt(values[f])}
                </span>
              </div>
            );
          })}
        </div>

        <details className="mt-5 border-t border-rule pt-4">
          <summary className="cursor-pointer text-[0.8125rem] font-medium text-muted">
            {frozen.size} frozen and {coupled.size} coupled features, held fixed
          </summary>
          <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {features
              .filter((f) => frozen.has(f) || coupled.has(f))
              .map((f) => (
                <div key={f} className="flex items-baseline justify-between gap-3 text-[0.75rem]">
                  <span className="truncate font-mono text-muted">
                    <span aria-hidden="true" className={frozen.has(f) ? "text-defend" : "text-warn"}>
                      {frozen.has(f) ? "■ " : "◆ "}
                    </span>
                    {f}
                  </span>
                  <span className="tnum shrink-0 font-mono text-muted">{fmt(values[f])}</span>
                </div>
              ))}
          </div>
          <p className="mt-3 text-[0.75rem] leading-relaxed text-muted">
            Frozen (&#9632;) is excluded from the search by the constraint contract. Coupled
            (&#9670;) moves only as a unit and only to a merchant the network was observed to
            contain; the browser does not ship that merchant bank, so this demo runs the
            engine&apos;s no-merchant-coordinate mode and holds the group fixed.
          </p>
        </details>
      </div>

      <div className="flex flex-col gap-5">
        <div className="card border border-rule p-5">
          <p className="text-[0.8125rem] text-muted">Detector score</p>
          {!ready ? (
            <p className="mt-3 font-mono text-sm text-muted">loading the detector…</p>
          ) : (
            <>
              <p
                className={`tnum display mt-1 text-[2.75rem] leading-none ${flagged ? "text-attack" : "text-defend"}`}
              >
                {prob === null ? "—" : prob.toFixed(4)}
              </p>
              <p className="mt-2 text-[0.8125rem]">
                <span
                  className={`inline-block rounded-[5px] px-2 py-0.5 font-medium ${
                    flagged ? "bg-attack-fill text-ink" : "bg-defend-fill text-ink"
                  }`}
                >
                  {flagged ? "FLAGGED" : "PASSES"}
                </span>
                <span className="ml-2 tnum font-mono text-muted">
                  threshold {threshold.toFixed(4)}
                </span>
              </p>

              <div className="mt-4 h-2 w-full overflow-hidden rounded-[3px] bg-figure-2">
                <div
                  className={`h-full ${flagged ? "bg-attack-fill" : "bg-defend-fill"}`}
                  style={{ width: `${Math.min((prob ?? 0) * 100, 100)}%` }}
                />
              </div>

              <button
                type="button"
                onClick={runAttack}
                disabled={running || !flagged}
                className="mt-5 w-full rounded-[6px] bg-ink px-4 py-2.5 text-[0.875rem] font-medium text-paper transition-opacity disabled:opacity-40"
              >
                {running ? "searching…" : flagged ? "Run the attack" : "Already evaded"}
              </button>
            </>
          )}
        </div>

        <div className="card border border-rule p-5">
          <p className="text-[0.8125rem] font-medium">Search trace</p>
          {steps.length === 0 ? (
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
              Each line is one accepted single-feature move. The query count is every model
              call the search actually spent, which is the cost reported on the results page.
            </p>
          ) : (
            <ol className="mt-3 space-y-2 font-mono text-[0.75rem]">
              {steps.map((s, i) => (
                <li key={`${s.feature}-${i}`} className="border-b border-rule pb-2 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-ink">{s.feature}</span>
                    <span className={s.prob < threshold ? "text-defend" : "text-muted"}>
                      {s.prob.toFixed(4)}
                    </span>
                  </div>
                  <div className="tnum mt-0.5 text-muted">
                    {fmt(s.from)} → {fmt(s.to)} · {s.queries} queries
                  </div>
                </li>
              ))}
              <li className="pt-1 text-[0.75rem] text-muted">
                L0 = {steps.length} · {steps[steps.length - 1].queries} model calls ·{" "}
                {steps[steps.length - 1].prob < threshold ? (
                  <span className="font-semibold text-defend">EVADED</span>
                ) : (
                  <span className="font-semibold text-attack">still flagged</span>
                )}
              </li>
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
