import { Panel } from "@/components/Chrome";
import type { AdversarialDetection } from "@/lib/types";

/**
 * The row that answers "so what do you do about the 100%".
 *
 * The loop's question is whether a fresh search can evade the retrained model, and the
 * answer is always yes. This panel answers the other question a payments team actually
 * asks: once we have seen some evasions, do we catch the next ones? Half the successful
 * evasions go into retraining, the other half are never shown to the model, and recall is
 * measured on that held-out half only. Recall on the rows the model was trained on is
 * printed too, because it is the memorisation ceiling and the number a less careful
 * report would have quoted.
 */
export function AdversarialDetectionPanel({ result }: { result: AdversarialDetection }) {
  const r = result.report;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Panel>
        <p className="text-sm font-medium text-muted">Evasions the model never saw</p>
        <p className="mt-3 text-3xl font-semibold text-defend">
          {pct(r.holdout_recall_before)} <span className="text-muted">→</span> {pct(r.holdout_recall_after)}
        </p>
        <p className="mt-1 text-sm text-muted">
          recall on {r.n_adversarial_holdout} held-out adversarial rows, before and after retraining on the
          other {r.n_adversarial_train}
        </p>
        <p className="mt-3 border-t border-rule pt-3 text-sm text-muted">
          Rows it was trained on: <span className="font-mono text-ink">{pct(r.train_recall_after)}</span> — the
          memorisation ceiling, not the result.
        </p>
      </Panel>

      <Panel>
        <p className="text-sm font-medium text-muted">What it cost legitimate payments</p>
        <p className="mt-3 text-3xl font-semibold text-ink">
          {r.legit_declines_per_100k_after.toFixed(0)}
          <span className="text-base font-normal text-muted"> declines / 100k</span>
        </p>
        <p className="mt-1 text-sm text-muted">
          false-positive rate {pct(r.legit_fpr_before)} → {pct(r.legit_fpr_after)} at the same FPR budget of{" "}
          {pct(result.fpr_budget)}
        </p>
      </Panel>

      <Panel>
        <p className="text-sm font-medium text-muted">What it cost real-fraud detection</p>
        <p className="mt-3 text-3xl font-semibold text-ink">
          {pct(r.real_fraud_recall_before)} <span className="text-muted">→</span> {pct(r.real_fraud_recall_after)}
        </p>
        <p className="mt-1 text-sm text-muted">
          recall on genuine fraud · PR-AUC {r.pr_auc_before.toFixed(3)} → {r.pr_auc_after.toFixed(3)} on{" "}
          {result.rows.toLocaleString("en-US")} rows
        </p>
      </Panel>
    </div>
  );
}
