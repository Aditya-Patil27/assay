"use client";

import {
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AttackRound, DetectRound } from "@/lib/types";

interface Row {
  round: string;
  asr: number;
  /** null when that round's detector has not been trained yet -- never coerce to 0. */
  prAuc: number | null;
  l0: number;
  queries: number;
  added: number;
}

/**
 * The headline result, which is not the one this chart was originally built to show.
 *
 * Attack success does NOT collapse across rounds. It is 100% at every round. An earlier
 * version of this component was captioned for a collapse that the run did not produce; the
 * series names promised it too. What the rounds actually show is the attacker being pushed
 * to spend more -- read the L0 and query columns in the table below the chart, which are
 * where the real movement is.
 *
 * Two axes because the two series answer different questions and share no unit. The series
 * are also drawn with different stroke patterns and dot shapes, so the argument survives a
 * projector that mangles colour and a reader who cannot separate red from teal.
 */
export function CoevolutionChart({
  detect,
  attack,
}: {
  detect: DetectRound[];
  attack: AttackRound[];
}) {
  const data: Row[] = attack.map((a) => {
    const d = detect.find((x) => x.round === a.round);
    return {
      round: `Round ${a.round}`,
      asr: +(a.asr * 100).toFixed(1),
      // A round with no detector is ABSENT, not zero. Coercing it renders a collapse to
      // the axis under a caption claiming PR-AUC holds -- the chart disproving its own
      // caption. Recharts skips nulls in a line series, which is the correct reading.
      prAuc: d ? +(d.pr_auc * 100).toFixed(1) : null,
      l0: a.mean_l0,
      queries: a.median_queries,
      added: d?.n_adversarial_added ?? 0,
    };
  });

  return (
    <div>
      <div className="h-[300px] w-full sm:h-[400px] md:h-[440px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 28, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--color-rule)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="round"
              stroke="var(--color-muted)"
              tick={{ fontSize: 13, fontFamily: "var(--font-mono)", fill: "var(--color-ink)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-rule)" }}
              padding={{ left: 24, right: 24 }}
            />
            <YAxis
              yAxisId="left"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              stroke="var(--color-attack-fill)"
              tick={{ fontSize: 12, fontFamily: "var(--font-mono)", fill: "var(--color-attack-fill)" }}
              tickLine={false}
              axisLine={false}
              width={52}
              unit="%"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              stroke="var(--color-defend-fill)"
              tick={{ fontSize: 12, fontFamily: "var(--font-mono)", fill: "var(--color-defend-fill)" }}
              tickLine={false}
              axisLine={false}
              width={52}
              unit="%"
            />
            <Tooltip content={<CoevolutionTooltip />} cursor={{ stroke: "var(--color-rule)" }} />
            <Legend
              verticalAlign="top"
              align="left"
              height={32}
              wrapperStyle={{ fontSize: 13, fontFamily: "var(--font-sans)" }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="prAuc"
              name="Detector PR-AUC"
              stroke="var(--color-defend-fill)"
              strokeWidth={2.5}
              strokeDasharray="7 4"
              dot={{ r: 5, fill: "var(--color-paper)", stroke: "var(--color-defend-fill)", strokeWidth: 2.5 }}
              activeDot={{ r: 7 }}
              isAnimationActive={false}
            >
              {/* Above the line, not below: at round 0 the two series are only ~11 points
                  apart and a label hung underneath the PR-AUC point lands on top of the
                  ASR label. */}
              <LabelList
                dataKey="prAuc"
                position="top"
                offset={10}
                formatter={(v: React.ReactNode) => `${v}%`}
                style={{
                  fill: "var(--color-defend-fill)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              />
            </Line>
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="asr"
              name="Attack success rate"
              stroke="var(--color-attack-fill)"
              strokeWidth={3.5}
              dot={{ r: 5, fill: "var(--color-attack-fill)" }}
              activeDot={{ r: 8 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="asr"
                position="top"
                offset={12}
                formatter={(v: React.ReactNode) => `${v}%`}
                style={{
                  fill: "var(--color-attack-fill)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>

      <RoundStrip rows={data} />
    </div>
  );
}

/**
 * What each round cost the attacker.
 *
 * The chart makes the claim; this strip is the evidence that the claim is not an
 * artefact of the attacker simply giving up -- L0 and query count rise every round, so
 * the surviving evasions are strictly more expensive to find.
 */
function RoundStrip({ rows }: { rows: Row[] }) {
  return (
    <div className="mt-6 overflow-x-auto border border-rule">
      <table className="w-full min-w-[600px] border-collapse text-sm">
        <thead>
          <tr className="bg-figure-2 text-left">
            {[
              "Round",
              "ASR",
              "PR-AUC",
              "Mean L0",
              "Median queries",
              "Adversarial rows added",
            ].map((h) => (
              <th
                key={h}
                className="border-b border-rule px-3 py-2.5 text-[11px] font-medium text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => (
            <tr key={r.round}>
              <td className="border-b border-rule px-3 py-2.5 text-muted">{r.round}</td>
              <td className="border-b border-rule px-3 py-2.5 font-semibold text-attack">
                {r.asr}%
              </td>
              <td className="border-b border-rule px-3 py-2.5 text-defend">
                {r.prAuc === null ? <span className="text-muted">not run</span> : `${r.prAuc}%`}
              </td>
              <td className="border-b border-rule px-3 py-2.5">{r.l0.toFixed(1)}</td>
              <td className="border-b border-rule px-3 py-2.5">{r.queries}</td>
              <td className="border-b border-rule px-3 py-2.5 text-muted">
                {r.added ? `+${r.added.toLocaleString("en-US")}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoevolutionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="border border-rule bg-paper px-3 py-2 font-mono text-xs">
      <p className="text-muted">{label}</p>
      <p className="mt-1.5 text-attack">ASR {r.asr}%</p>
      {r.prAuc === null ? (
        <p className="text-muted">PR-AUC — detector not trained for this round</p>
      ) : (
        <p className="text-defend">PR-AUC {r.prAuc}%</p>
      )}
      <p className="mt-1.5 text-muted">
        mean L0 {r.l0.toFixed(1)} · median {r.queries} queries
      </p>
    </div>
  );
}
