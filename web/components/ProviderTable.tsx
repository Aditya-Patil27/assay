import { fisherExactTwoSided, formatP } from "@/lib/stats";
import type { AgenticCategory, Envelope } from "@/lib/types";

/**
 * The same defense, measured twice, on two vendors.
 *
 * A single provider's exploit rate is a property of that provider's model, so a defense
 * validated once has been validated against one model's idiosyncrasies. Showing both runs
 * separately is also the only way to report the honest version of this result: it clears
 * significance on one model and on the pooled corpus, and does not clear it on the other.
 * Collapsing to the pooled row alone would hide that.
 *
 * Every p on this table is computed at build time from the counts in the row beside it --
 * see lib/stats.ts. Nothing here is a number somebody typed in.
 */
function providerOf(kind: string): string {
  if (kind.endsWith("_groq")) return "Groq";
  if (kind.endsWith("_nvidia")) return "NVIDIA NIM";
  return kind.replace(/^agentic_redteam_?/, "") || "pooled";
}

interface Row {
  provider: string;
  model: string;
  attempts: number;
  before: number;
  after: number;
  p: number;
}

const totals = (rows: AgenticCategory[]) => ({
  attempts: rows.reduce((n, c) => n + c.attempts, 0),
  before: rows.reduce((n, c) => n + c.success_before, 0),
  after: rows.reduce((n, c) => n + c.success_after, 0),
});

export function ProviderTable({ providers }: { providers: Envelope<AgenticCategory[]>[] }) {
  if (providers.length === 0) return null;

  const rows: Row[] = providers.map((env) => {
    const t = totals(env.payload);
    return {
      provider: providerOf(env.kind),
      model: env.payload[0]?.model ?? "—",
      attempts: t.attempts,
      before: t.before,
      after: t.after,
      // 2x2 with the same margins the counts imply: exploited vs not, before vs after.
      p: fisherExactTwoSided(t.before, t.attempts - t.before, t.after, t.attempts - t.after),
    };
  });

  const pooledAttempts = rows.reduce((n, r) => n + r.attempts, 0);
  const pooledBefore = rows.reduce((n, r) => n + r.before, 0);
  const pooledAfter = rows.reduce((n, r) => n + r.after, 0);
  const pooled: Row = {
    provider: "Pooled",
    model: `${rows.length} models`,
    attempts: pooledAttempts,
    before: pooledBefore,
    after: pooledAfter,
    p: fisherExactTwoSided(
      pooledBefore,
      pooledAttempts - pooledBefore,
      pooledAfter,
      pooledAttempts - pooledAfter,
    ),
  };

  const rate = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">
          Exploit rate before and after the defense, per model, with a two-sided Fisher
          exact p-value computed from each row&apos;s counts
        </caption>
        <thead>
          <tr className="text-left text-[11px] font-medium text-muted">
            {["Model", "Provider", "Exploited before", "Exploited after", "Fisher exact", "At α = 0.05"].map(
              (h) => (
                <th key={h} scope="col" className="border-b border-rule py-2.5 pr-4">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {[...rows, pooled].map((r) => {
            const isPooled = r.provider === "Pooled";
            const significant = r.p < 0.05;
            return (
              <tr key={r.provider} className={isPooled ? "border-t-2 border-rule-strong" : ""}>
                <td
                  className={`border-b border-rule py-3 pr-4 font-mono text-[0.8125rem] ${isPooled ? "font-semibold" : ""}`}
                >
                  {r.model}
                </td>
                <td className="border-b border-rule py-3 pr-4 text-[0.8125rem] text-muted">
                  {r.provider}
                </td>
                <td className="tnum border-b border-rule py-3 pr-4 font-mono text-attack">
                  {r.before}/{r.attempts}
                  <span className="ml-2 text-[0.75rem] text-muted">{rate(r.before, r.attempts)}</span>
                </td>
                <td className="tnum border-b border-rule py-3 pr-4 font-mono text-defend">
                  {r.after}/{r.attempts}
                  <span className="ml-2 text-[0.75rem] text-muted">{rate(r.after, r.attempts)}</span>
                </td>
                <td className="tnum border-b border-rule py-3 pr-4 font-mono">{formatP(r.p)}</td>
                <td className="border-b border-rule py-3 pr-4 text-[0.8125rem]">
                  {significant ? (
                    <span className="text-defend">
                      <span aria-hidden="true">✓ </span>significant
                    </span>
                  ) : (
                    <span className="text-muted">
                      <span aria-hidden="true">○ </span>not significant
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
