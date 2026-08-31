import type { AgenticCategory, AttackExample } from "@/lib/types";

import { Panel } from "./Chrome";

/**
 * Exploit rate per injection category, before and after the defense layer.
 *
 * The OWASP id is shown next to every category so the agentic track lands on the same map
 * a security reviewer already has in their head, and the aggregate row on top is the
 * number that feeds the second row of the scorecard.
 */
export function AgenticPanel({ categories }: { categories: AgenticCategory[] }) {
  const attempts = categories.reduce((n, c) => n + c.attempts, 0);
  const before = categories.reduce((n, c) => n + c.success_before, 0);
  const after = categories.reduce((n, c) => n + c.success_after, 0);

  return (
    <div className="space-y-4">
      <Panel className="bg-figure-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h3 className="text-[13px] font-medium text-muted">
            All categories · {attempts} injection attempts
          </h3>
          <p className="font-mono text-sm">
            <span className="text-attack">{((before / attempts) * 100).toFixed(0)}%</span>
            <span className="mx-2 text-muted" aria-label="reduced to">
              →
            </span>
            <span className="text-defend">{((after / attempts) * 100).toFixed(0)}%</span>
            <span className="ml-3 text-muted">
              exploit rate ({before}/{attempts} → {after}/{attempts})
            </span>
          </p>
        </div>
        <div className="mt-4 space-y-2">
          <Bar label="before" value={before / attempts} tone="attack" />
          <Bar label="after" value={after / attempts} tone="defend" />
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        {categories.map((c) => {
          const rateBefore = c.success_before / c.attempts;
          const rateAfter = c.success_after / c.attempts;
          const drop = rateBefore ? 1 - rateAfter / rateBefore : 0;
          return (
            <Panel key={c.category}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium">{c.category}</h3>
                <span className="shrink-0 rounded-[2px] border border-rule px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  OWASP {c.owasp_id}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                <Bar label="before" value={rateBefore} tone="attack" />
                <Bar label="after" value={rateAfter} tone="defend" />
              </div>

              <p className="mt-3 font-mono text-[11px] text-muted">
                {c.success_before}/{c.attempts} → {c.success_after}/{c.attempts} ·{" "}
                <span className="font-semibold text-ink">−{(drop * 100).toFixed(0)}%</span>{" "}
                exploit rate
              </p>

              <p className="mt-4 border-l-2 border-warn/50 bg-figure-2 py-2 pl-3 pr-2 font-mono text-[11px] leading-relaxed text-muted">
                <span className="mb-1 block text-[10px] text-warn">
                  example injection
                </span>
                {c.example_injection}
              </p>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "attack" | "defend";
}) {
  const color = tone === "attack" ? "bg-attack-fill" : "bg-defend-fill";
  const text = tone === "attack" ? "text-attack" : "text-defend";
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[10px] text-muted">
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden bg-figure-2 ring-1 ring-rule">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.max(value * 100, value > 0 ? 1.5 : 0)}%` }}
        />
      </div>
      <span className={`w-12 shrink-0 text-right font-mono text-xs tabular-nums ${text}`}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

/**
 * One worked evasion.
 *
 * The point of showing the deltas is that every touched feature is one an attacker
 * genuinely controls -- the frozen tier never appears in this list -- and that the list is
 * short. L0 is the sparsity claim, so it is stated as a count rather than implied.
 */
export function AttackExamplePanel({
  example,
  threshold,
}: {
  example: AttackExample;
  threshold?: number;
}) {
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-muted">{example.id}</span>
        <span className="text-[10px] text-muted">
          round {example.round}
        </span>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <div>
          <p className="text-[10px] text-muted">
            flagged as fraud
          </p>
          <p className="font-mono text-3xl tabular-nums text-attack">
            {example.orig_prob.toFixed(2)}
          </p>
        </div>
        <div className="flex-1 pb-3">
          <div className="border-t-2 border-dashed border-rule" />
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted">
            passes as legitimate
          </p>
          <p className="font-mono text-3xl tabular-nums text-defend">
            {example.adv_prob.toFixed(2)}
          </p>
        </div>
      </div>

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted">
        {threshold !== undefined
          ? `crossed the round ${example.round} decision threshold (${threshold.toFixed(2)}) by moving `
          : "moved "}
        <span className="font-semibold text-warn">
          L0 = {example.touched.length} feature{example.touched.length === 1 ? "" : "s"}
        </span>
      </p>

      <table className="mt-4 w-full text-xs">
        <caption className="sr-only">Features changed by the attack, before and after</caption>
        <thead>
          <tr className="text-[10px] text-muted">
            <th scope="col" className="pb-2 text-left font-normal">
              feature
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              before
            </th>
            <th scope="col" className="pb-2 text-center font-normal" />
            <th scope="col" className="pb-2 text-right font-normal">
              after
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Δ
            </th>
          </tr>
        </thead>
        <tbody>
          {example.touched.map((d) => (
            <tr key={d.feature} className="border-t border-rule">
              <td className="py-2 pr-3 font-mono text-muted">{d.feature}</td>
              <td className="py-2 text-right font-mono tabular-nums">{fmt(d.before)}</td>
              <td className="px-2 py-2 text-center text-muted" aria-label="becomes">
                →
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-warn">{fmt(d.after)}</td>
              <td className="py-2 pl-3 text-right font-mono tabular-nums text-muted">
                {delta(d.before, d.after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

const fmt = (n: number) =>
  Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(3);

const delta = (before: number, after: number) => {
  if (before === 0) return "—";
  const pct = ((after - before) / Math.abs(before)) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
};
