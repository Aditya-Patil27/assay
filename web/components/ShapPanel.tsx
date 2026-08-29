import type { DetectRound } from "@/lib/types";

import { Panel } from "./Chrome";

/**
 * What the detector leans on, round by round.
 *
 * Rendered as plain bars rather than a chart because the interesting quantity is not the
 * magnitude but the *ordering* and how it churns: a feature entering the top-5 between
 * rounds is the detector re-weighting away from whatever the attacker just exploited.
 * New entries are marked with a glyph as well as colour.
 */
export function ShapPanel({ rounds }: { rounds: DetectRound[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {rounds.map((r, i) => {
        const previous = i > 0 ? new Set(rounds[i - 1].top_shap.map((f) => f.feature)) : null;
        const max = Math.max(...r.top_shap.map((f) => f.mean_abs_shap), 1e-9);

        return (
          <Panel key={r.round}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-mono text-sm font-semibold">Round {r.round}</h3>
              <span className="font-mono text-[11px] text-muted">
                PR-AUC {r.pr_auc.toFixed(3)}
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              mean |SHAP| · top {r.top_shap.length}
            </p>

            <ol className="mt-4 space-y-3">
              {r.top_shap.map((f) => {
                const isNew = previous ? !previous.has(f.feature) : false;
                return (
                  <li key={f.feature}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-[11px] text-text" title={f.feature}>
                        {isNew ? (
                          <span className="text-warn" title="new to the top features this round">
                            <span aria-hidden="true">↑ </span>
                            <span className="sr-only">new this round: </span>
                          </span>
                        ) : null}
                        {f.feature}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
                        {f.mean_abs_shap.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
                      <div
                        className={`h-full rounded-full ${isNew ? "bg-warn" : "bg-defend"}`}
                        style={{ width: `${(f.mean_abs_shap / max) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>

            <p className="mt-4 border-t border-line pt-3 font-mono text-[10px] leading-relaxed text-muted">
              threshold {r.threshold.toFixed(2)} · P {r.precision.toFixed(2)} · R{" "}
              {r.recall.toFixed(2)} · n={r.n_train.toLocaleString()}
              {r.n_adversarial_added
                ? ` (+${r.n_adversarial_added.toLocaleString()} adversarial)`
                : ""}
            </p>
          </Panel>
        );
      })}
    </div>
  );
}
