import type { AgenticCategory, AttackExample } from "@/lib/types";

import { Panel } from "./Chrome";

/** Exploit rate per injection category, before and after the defense layer. */
export function AgenticPanel({ categories }: { categories: AgenticCategory[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {categories.map((c) => {
        const before = c.success_before / c.attempts;
        const after = c.success_after / c.attempts;
        return (
          <Panel key={c.category}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">{c.category}</h3>
              <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
                {c.owasp_id}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              <Bar label="before" value={before} tone="attack" />
              <Bar label="after" value={after} tone="defend" />
            </div>

            <p className="mt-4 border-l-2 border-line pl-3 font-mono text-[11px] leading-relaxed text-muted">
              {c.example_injection}
            </p>
          </Panel>
        );
      })}
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
  const color = tone === "attack" ? "bg-attack" : "bg-defend";
  const text = tone === "attack" ? "text-attack" : "text-defend";
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 font-mono text-[10px] uppercase tracking-wider text-muted">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value * 100}%` }} />
      </div>
      <span className={`w-12 text-right font-mono text-xs tabular-nums ${text}`}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

/**
 * One worked evasion. The point of showing the deltas is that every touched feature is
 * one an attacker genuinely controls -- the frozen tier never appears in this list.
 */
export function AttackExamplePanel({ example }: { example: AttackExample }) {
  return (
    <Panel>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs text-muted">{example.id}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          round {example.round} · L0 = {example.touched.length}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">flagged</p>
          <p className="font-mono text-2xl tabular-nums text-attack">
            {example.orig_prob.toFixed(2)}
          </p>
        </div>
        <div className="flex-1 border-t border-dashed border-line" />
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">evaded</p>
          <p className="font-mono text-2xl tabular-nums text-defend">
            {example.adv_prob.toFixed(2)}
          </p>
        </div>
      </div>

      <table className="mt-5 w-full text-xs">
        <tbody>
          {example.touched.map((d) => (
            <tr key={d.feature} className="border-t border-line">
              <td className="py-2 pr-3 font-mono text-muted">{d.feature}</td>
              <td className="py-2 text-right font-mono tabular-nums">{fmt(d.before)}</td>
              <td className="px-2 py-2 text-center text-muted">→</td>
              <td className="py-2 text-right font-mono tabular-nums text-warn">{fmt(d.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

const fmt = (n: number) =>
  Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(3);
