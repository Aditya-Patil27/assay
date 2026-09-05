"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AttackRound } from "@/lib/types";

/** One bar shade per round -- attack red, walked from bright to dim as rounds advance. */
const ROUND_FILL = ["var(--color-attack-fill)", "#d05f4b", "var(--color-attack-dim)"];

/**
 * Which features each round's successful evasions actually touched.
 *
 * Shares, not raw counts: each bar is the fraction of that round's successes that moved a
 * given feature. With attack success at 1.000 every round the denominator is constant, so
 * here the normalisation only rescales -- it is kept because a round that ever failed some
 * attempts would otherwise be compared against a different denominator without saying so.
 *
 * The movement across rounds is the search relocating under pressure. It is not the
 * attacker being disarmed: every round still succeeds on every attempt.
 */
export function FeatureFrequencyPanel({ rounds }: { rounds: AttackRound[] }) {
  const features = [...new Set(rounds.flatMap((r) => Object.keys(r.per_feature_freq)))];

  const data = features
    .map((feature) => {
      const row: Record<string, string | number> = { feature };
      for (const r of rounds) {
        const n = r.per_feature_freq[feature] ?? 0;
        row[`r${r.round}`] = r.n_success ? +((n / r.n_success) * 100).toFixed(1) : 0;
      }
      return row;
    })
    .sort((a, b) => Number(b[`r${rounds[0].round}`]) - Number(a[`r${rounds[0].round}`]));

  return (
    <div className="h-[340px] w-full sm:h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--color-rule)" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            unit="%"
            stroke="var(--color-muted)"
            tick={{ fontSize: 11, fontFamily: "var(--font-mono)", fill: "var(--color-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-rule)" }}
          />
          <YAxis
            type="category"
            dataKey="feature"
            width={168}
            stroke="var(--color-muted)"
            tick={{ fontSize: 11, fontFamily: "var(--font-mono)", fill: "var(--color-ink)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.05)" }}
            contentStyle={{
              background: "var(--color-figure-2)",
              border: "1px solid var(--color-rule)",
              borderRadius: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--color-muted)" }}
            formatter={(v) => [`${v}% of evasions`, ""] as [string, string]}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            wrapperStyle={{ fontSize: 12, fontFamily: "var(--font-sans)" }}
          />
          {rounds.map((r, i) => (
            <Bar
              key={r.round}
              dataKey={`r${r.round}`}
              name={`Round ${r.round}`}
              fill={ROUND_FILL[i % ROUND_FILL.length]}
              radius={[0, 3, 3, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
