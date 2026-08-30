import { Panel } from "@/components/Chrome";
import type { FeasibilityAudit } from "@/lib/types";

/**
 * The panel that makes an ASR mean something.
 *
 * Both attackers below report the same success rate. The difference is that most of the
 * unconstrained attacker's wins are not transactions at all -- they settle at merchants
 * absent from the network, or they forge an attribute a real attacker inherits from the
 * victim and cannot touch. Reporting the two side by side is the argument the project
 * exists to make, demonstrated on our own baseline rather than asserted in prose.
 */
export function FeasibilityPanel({
  audit,
  placeholder,
}: {
  audit: FeasibilityAudit;
  placeholder: boolean;
}) {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const impossible = audit.impossible_merchant_share;
  const plausible = 1 - impossible;

  return (
    <div className="grid gap-4">
      {placeholder && (
        <p className="rounded-lg border border-attack/40 bg-attack/5 px-3 py-2 font-mono text-[11px] text-attack">
          Fixture data — this audit has not been computed from a real run.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
            Unconstrained attacker
          </p>
          <p className="mt-3 text-3xl font-semibold text-attack">
            {pct(audit.unconstrained_asr)}
          </p>
          <p className="mt-1 text-sm text-muted">
            reported attack success · {audit.unconstrained_mean_l0.toFixed(2)} mean features
            touched
          </p>

          <div className="mt-5 border-t border-line pt-4">
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-line"
              role="img"
              aria-label={`${pct(impossible)} of successes are physically impossible, ${pct(plausible)} are plausible`}
            >
              <div className="bg-attack" style={{ width: `${impossible * 100}%` }} />
              <div className="bg-defend" style={{ width: `${plausible * 100}%` }} />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">At a merchant that does not exist</dt>
                <dd className="font-mono font-semibold text-attack">{pct(impossible)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Forged a frozen victim attribute</dt>
                <dd className="font-mono font-semibold text-attack">
                  {pct(audit.forged_frozen_share)}
                </dd>
              </div>
            </dl>
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
            Constraint-aware attacker
          </p>
          <p className="mt-3 text-3xl font-semibold text-defend">
            {pct(audit.constrained_asr)}
          </p>
          <p className="mt-1 text-sm text-muted">
            attack success · {audit.constrained_mean_l0.toFixed(2)} mean features touched
          </p>

          <div className="mt-5 border-t border-line pt-4">
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-line"
              role="img"
              aria-label="Every success is a transaction that could occur"
            >
              <div className="w-full bg-defend" />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">At a merchant that does not exist</dt>
                <dd className="font-mono font-semibold text-defend">0.0%</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Forged a frozen victim attribute</dt>
                <dd className="font-mono font-semibold text-defend">0.0%</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Zero by construction, not by measurement: frozen columns are excluded from the
              search and merchant choice is drawn from the observed network, so an infeasible
              transaction cannot be produced in the first place.
            </p>
          </div>
        </Panel>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        Read the left panel before believing any adversarial-ML result, including ours.{" "}
        <strong className="font-semibold text-text">
          {pct(impossible)} of the unconstrained attacker&apos;s &ldquo;evasions&rdquo; are
          transactions that could not physically occur
        </strong>{" "}
        — a merchant category paired with terminal coordinates no merchant occupies. The
        headline number is identical to ours; the thing it describes is not. This is the
        measurement error the whole framework is built to avoid, run against ourselves.
      </p>
    </div>
  );
}
