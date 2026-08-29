"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AttackRound, DetectRound } from "@/lib/types";

/**
 * The headline result: attack success collapses across rounds while detection quality
 * barely moves. Two axes because the two series answer different questions -- forcing
 * them onto one scale would flatten the ASR collapse into nothing.
 */
export function CoevolutionChart({
  detect,
  attack,
}: {
  detect: DetectRound[];
  attack: AttackRound[];
}) {
  const data = attack.map((a) => ({
    round: `r${a.round}`,
    asr: +(a.asr * 100).toFixed(1),
    prAuc: +((detect.find((d) => d.round === a.round)?.pr_auc ?? 0) * 100).toFixed(1),
    l0: a.mean_l0,
  }));

  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="round"
            stroke="var(--color-muted)"
            tick={{ fontSize: 12, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-line)" }}
          />
          <YAxis
            yAxisId="left"
            domain={[0, 100]}
            stroke="var(--color-attack)"
            tick={{ fontSize: 12, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            width={44}
            unit="%"
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[60, 100]}
            stroke="var(--color-defend)"
            tick={{ fontSize: 12, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            width={44}
            unit="%"
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-panel-2)",
              border: "1px solid var(--color-line)",
              borderRadius: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--color-muted)" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, fontFamily: "var(--font-mono)", paddingTop: 8 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="asr"
            name="Attack Success Rate"
            stroke="var(--color-attack)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "var(--color-attack)" }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="prAuc"
            name="Detector PR-AUC"
            stroke="var(--color-defend)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "var(--color-defend)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
