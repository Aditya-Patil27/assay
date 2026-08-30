import type { ScorecardRow } from "@/lib/types";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * The terminal node both tracks feed.
 *
 * Strategy 5.2: this table is what converts "two projects in two tabs" into one framework
 * applied twice, so it is read top-to-bottom as a result rather than a dump -- the
 * reduction is the largest number in each row, and the before/after pair is drawn as a
 * bar so the collapse is visible before any digit is read.
 */
export function Scorecard({ rows }: { rows: ScorecardRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <caption className="sr-only">
          Framework scorecard: attack success before and after defense, per attack surface
        </caption>
        <thead>
          <tr className="bg-figure-2 text-left">
            {[
              "Attack surface",
              "Primary metric",
              "Before defense",
              "After defense",
              "Reduction",
              "What the defense cost",
            ].map((h) => (
              <th
                key={h}
                scope="col"
                className="border-b border-rule px-4 py-3 text-[11px] font-medium text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const drop = r.attack_success_before
              ? 1 - r.attack_success_after / r.attack_success_before
              : 0;
            return (
              <tr key={r.surface} className="align-top">
                <td className="border-b border-rule px-4 py-5">
                  <span className="text-base font-semibold">{r.surface}</span>
                </td>
                <td className="border-b border-rule px-4 py-5 text-muted">{r.primary_metric}</td>
                <td className="border-b border-rule px-4 py-5">
                  <span className="font-mono text-lg tabular-nums text-attack">
                    {pct(r.attack_success_before)}
                  </span>
                  <MiniBar value={r.attack_success_before} tone="attack" />
                </td>
                <td className="border-b border-rule px-4 py-5">
                  <span className="font-mono text-lg tabular-nums text-defend">
                    {pct(r.attack_success_after)}
                  </span>
                  <MiniBar value={r.attack_success_after} tone="defend" />
                </td>
                <td className="border-b border-rule px-4 py-5">
                  <span className="font-mono text-2xl font-semibold tabular-nums">
                    −{(drop * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="border-b border-rule px-4 py-5 text-xs leading-relaxed text-muted">
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

function MiniBar({ value, tone }: { value: number; tone: "attack" | "defend" }) {
  return (
    <span className="mt-2 block h-1.5 w-24 overflow-hidden bg-figure-2 ring-1 ring-rule">
      <span
        className={`block h-full ${tone === "attack" ? "bg-attack" : "bg-defend"}`}
        style={{ width: `${Math.max(value * 100, value > 0 ? 2 : 0)}%` }}
      />
    </span>
  );
}
