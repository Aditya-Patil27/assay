import type { ScorecardRow } from "@/lib/types";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * The terminal node both tracks feed.
 *
 * Strategy 5.2: this table is what converts "two projects in two tabs" into one framework
 * applied twice. It is deliberately the first thing on the page after the headline.
 */
export function Scorecard({ rows }: { rows: ScorecardRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-panel-2 text-left">
            {["Attack surface", "Metric", "Before", "After", "Reduction", "Defense cost"].map(
              (h) => (
                <th
                  key={h}
                  className="border-b border-line px-4 py-3 font-mono text-[11px] uppercase tracking-[0.15em] font-normal text-muted"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const drop = 1 - r.attack_success_after / r.attack_success_before;
            return (
              <tr key={r.surface} className="bg-panel">
                <td className="border-b border-line px-4 py-4 font-medium">{r.surface}</td>
                <td className="border-b border-line px-4 py-4 text-muted">{r.primary_metric}</td>
                <td className="border-b border-line px-4 py-4 font-mono tabular-nums text-attack">
                  {pct(r.attack_success_before)}
                </td>
                <td className="border-b border-line px-4 py-4 font-mono tabular-nums text-defend">
                  {pct(r.attack_success_after)}
                </td>
                <td className="border-b border-line px-4 py-4 font-mono tabular-nums font-semibold">
                  −{(drop * 100).toFixed(0)}%
                </td>
                <td className="border-b border-line px-4 py-4 text-xs text-muted">
                  {r.defense_cost}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
