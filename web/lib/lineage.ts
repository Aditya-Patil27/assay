/**
 * Pure builders and layout for the /lineage page.
 *
 * These functions turn committed artifacts into plain node/edge lists a React Flow graph
 * can render -- no React, no DOM, nothing that needs a browser to test. The page ("second
 * brain" reading: entry point -> technique -> goal -> outcome, and feature -> evasion) is
 * assembled here so the layout math, the entry-point chips and the click-to-highlight
 * traversal can be exercised without mounting a graph.
 *
 * Where the nodes are drawn, and which of them a click lights, lives next door in
 * lib/lineage-layout.ts: the builders change when an artifact's shape changes, the layout
 * changes when the drawing has to read on a different screen.
 */
import type { AgentRuntime, Injection, Scenario } from "./agent/types";
import type { AgenticCategory, AttackExample, FeatureSchema } from "./types";

export type LineageNodeKind =
  | "task"
  | "channel"
  | "technique"
  | "goal"
  | "outcome"
  | "tier"
  | "feature"
  | "evasion";

/** One mono statistic in a node's side panel: `attempts 24`. */
export interface LineageStat {
  k: string;
  v: string;
}

export interface LineageDetail {
  title: string;
  /** Rendered as a row of mono figures above the prose. */
  stats?: LineageStat[];
  /** Verbatim payload text, set in a quote block. */
  quote?: string;
  rows: string[];
}

export interface LineageNode {
  id: string;
  col: number;
  /** Lane within the column. Column 1 of graph 2 splits into frozen (0) and movable (1). */
  subcol?: number;
  kind: LineageNodeKind;
  /** The mono eyebrow printed above the title -- the column name, or a feature's tier. */
  eyebrow: string;
  label: string;
  sublabel?: string;
  badge?: string;
  muted?: boolean;
  lock?: boolean;
  tone?: "attack" | "defend";
  detail: LineageDetail;
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  tone?: "attack" | "defend";
}

/** A row of "start from:" chips above a graph. */
export interface LineageChipGroup {
  label: string;
  chips: { id: string; label: string }[];
}

export interface LineageGraphData {
  nodes: LineageNode[];
  edges: LineageEdge[];
  chipGroups: LineageChipGroup[];
  /** Lit automatically shortly after mount, so the page never opens inert. */
  defaultSelected: string | null;
}

/* ---------------------------------------------------------------------------------------
 * Small formatting helpers, kept local rather than imported from a component -- lib/ does
 * not reach into components/.
 * ------------------------------------------------------------------------------------- */

export const humanize = (s: string): string => {
  const spaced = s.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** Same magnitude-aware rounding AttackExamplePanel uses, so the two readings agree. */
export const fmtNum = (n: number): string =>
  Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(3);

const dedupeInOrder = (values: string[]): string[] => [...new Set(values)];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------------------------------------------------------------------------------------
 * Graph 1 -- the agentic surface: task -> channel -> technique -> goal -> outcome.
 * ------------------------------------------------------------------------------------- */

const OUTCOME_EXPLOITED = "outcome:exploited";
const OUTCOME_HELD = "outcome:held";

export function buildAgenticLineage(
  runtime: Pick<AgentRuntime, "scenarios" | "injections">,
  redteam: AgenticCategory[],
): LineageGraphData {
  const { scenarios, injections } = runtime;

  const tasks = dedupeInOrder(scenarios.map((s) => s.task_type));
  const channels = dedupeInOrder(injections.map((i) => i.channel));
  const goals = dedupeInOrder(injections.map((i) => i.goal));

  // One technique node per redteam row, matched to its injections by the shared readable
  // title (AgenticCategory.category holds the same string as Injection.category_title).
  const techniqueSlug = (title: string): string =>
    injections.find((i) => i.category_title === title)?.category ?? slugify(title);

  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const edge = (
    id: string,
    source: string,
    target: string,
    label?: string,
    tone?: "attack" | "defend",
  ) => edges.push({ id, source, target, label, tone });

  for (const t of tasks) {
    const rows = scenarios.filter((s) => s.task_type === t);
    nodes.push({
      id: `task:${t}`,
      col: 0,
      kind: "task",
      eyebrow: "task",
      label: humanize(t),
      sublabel: plural(rows.length, "scenario"),
      detail: {
        title: `${humanize(t)} — ${plural(rows.length, "scenario")}`,
        stats: [{ k: "scenarios", v: String(rows.length) }],
        rows: rows.map((s: Scenario) => `${s.id}: "${s.user_request}"`),
      },
    });
  }

  for (const c of channels) {
    const readers = scenarios.filter((s) => s.channel === c);
    const carries = injections.filter((i) => i.channel === c);
    nodes.push({
      id: `channel:${c}`,
      col: 1,
      kind: "channel",
      eyebrow: "channel",
      label: humanize(c),
      sublabel: `${readers.length} read · ${carries.length} planted`,
      detail: {
        title: `${humanize(c)} — scenarios that read this channel`,
        stats: [
          { k: "read by", v: String(readers.length) },
          { k: "injections planted", v: String(carries.length) },
        ],
        rows: readers.length
          ? readers.map((s) => `${s.id} (${humanize(s.task_type)}): "${s.user_request}"`)
          : ["No scenario in the corpus reads this channel."],
      },
    });

    for (const t of tasks) {
      const linked = scenarios.some((s) => s.task_type === t && s.channel === c);
      if (linked) edge(`task:${t}->channel:${c}`, `task:${t}`, `channel:${c}`);
    }
  }

  for (const row of redteam) {
    const slug = techniqueSlug(row.category);
    const id = `technique:${slug}`;
    const rep = injections.find((i) => i.category_title === row.category);
    nodes.push({
      id,
      col: 2,
      kind: "technique",
      eyebrow: "technique",
      label: row.category,
      badge: row.owasp_id,
      sublabel: `${row.success_before}/${row.attempts} → ${row.success_after}/${row.attempts}`,
      detail: {
        title: `${row.category} · OWASP ${row.owasp_id}${rep ? ` · ${rep.atlas_technique}` : ""}`,
        stats: [
          { k: "attempts", v: String(row.attempts) },
          { k: "exploited, defences off", v: String(row.success_before) },
          { k: "exploited, defences on", v: String(row.success_after) },
        ],
        quote: row.example_injection,
        rows: [
          `channels carrying it: ${
            dedupeInOrder(
              injections.filter((i) => i.category_title === row.category).map((i) => humanize(i.channel)),
            ).join(", ") || "none"
          }`,
          `goals it aims at: ${
            dedupeInOrder(
              injections.filter((i) => i.category_title === row.category).map((i) => humanize(i.goal)),
            ).join(", ") || "none"
          }`,
        ],
      },
    });

    for (const c of channels) {
      const count = injections.filter(
        (i) => i.channel === c && i.category_title === row.category,
      ).length;
      if (count > 0) edge(`channel:${c}->${id}`, `channel:${c}`, id, String(count));
    }

    for (const g of goals) {
      const count = injections.filter(
        (i) => i.category_title === row.category && i.goal === g,
      ).length;
      if (count > 0) edge(`${id}->goal:${g}`, id, `goal:${g}`, String(count));
    }

    if (row.success_before > 0) {
      edge(`${id}->${OUTCOME_EXPLOITED}`, id, OUTCOME_EXPLOITED, String(row.success_before), "attack");
    }
    const held = row.attempts - row.success_after;
    if (held > 0) {
      edge(`${id}->${OUTCOME_HELD}`, id, OUTCOME_HELD, String(held), "defend");
    }
  }

  for (const g of goals) {
    const targeting = injections.filter((i) => i.goal === g);
    const byTechnique = dedupeInOrder(targeting.map((i) => i.category_title));
    nodes.push({
      id: `goal:${g}`,
      col: 3,
      kind: "goal",
      eyebrow: "goal",
      label: humanize(g),
      sublabel: plural(targeting.length, "injection"),
      detail: {
        title: `${humanize(g)} — targeted by ${plural(targeting.length, "injection")}`,
        stats: [{ k: "injections", v: String(targeting.length) }],
        rows: byTechnique.map(
          (title) => `${title}: ${targeting.filter((i) => i.category_title === title).length}`,
        ),
      },
    });
  }

  const totalBefore = redteam.reduce((n, r) => n + r.success_before, 0);
  const totalAttempts = redteam.reduce((n, r) => n + r.attempts, 0);
  const totalAfter = redteam.reduce((n, r) => n + r.success_after, 0);
  nodes.push(
    {
      id: OUTCOME_EXPLOITED,
      col: 4,
      kind: "outcome",
      eyebrow: "outcome",
      label: "Exploited with defences off",
      sublabel: `${totalBefore}/${totalAttempts}`,
      tone: "attack",
      detail: {
        title: `Exploited with defences off — ${totalBefore}/${totalAttempts} attempts`,
        stats: [
          { k: "exploited", v: String(totalBefore) },
          { k: "of attempts", v: String(totalAttempts) },
        ],
        rows: redteam
          .filter((r) => r.success_before > 0)
          .map((r) => `${r.category}: ${r.success_before}/${r.attempts}`),
      },
    },
    {
      id: OUTCOME_HELD,
      col: 4,
      kind: "outcome",
      eyebrow: "outcome",
      label: "Held with defences on",
      sublabel: `${totalAttempts - totalAfter}/${totalAttempts}`,
      tone: "defend",
      detail: {
        title: `Held with defences on — ${totalAttempts - totalAfter}/${totalAttempts} attempts`,
        stats: [
          { k: "held", v: String(totalAttempts - totalAfter) },
          { k: "of attempts", v: String(totalAttempts) },
        ],
        rows: redteam
          .filter((r) => r.attempts - r.success_after > 0)
          .map((r) => `${r.category}: ${r.attempts - r.success_after}/${r.attempts}`),
      },
    },
  );

  // The page opens on the first technique that actually got through with defences off, so
  // the lit path a reader lands on is a real exploit rather than an arbitrary node.
  const firstExploited = redteam.find((r) => r.success_before > 0) ?? redteam[0];

  return {
    nodes,
    edges,
    chipGroups: [
      {
        label: "channel",
        chips: channels.map((c) => ({ id: `channel:${c}`, label: humanize(c) })),
      },
      {
        label: "technique",
        chips: redteam.map((r) => ({
          id: `technique:${techniqueSlug(r.category)}`,
          label: r.category,
        })),
      },
    ],
    defaultSelected: firstExploited ? `technique:${techniqueSlug(firstExploited.category)}` : null,
  };
}

/* ---------------------------------------------------------------------------------------
 * Graph 2 -- the tabular surface: feature tier -> feature -> evasion.
 * ------------------------------------------------------------------------------------- */

const TIER_INFO: Record<"frozen" | "coupled" | "mutable", { label: string; blurb: string }> = {
  frozen: { label: "Frozen", blurb: "attacker cannot touch" },
  coupled: { label: "Coupled", blurb: "moves together: merchant choice" },
  mutable: { label: "Mutable", blurb: "freely adjustable within observed bounds" },
};

export function buildTabularLineage(
  schema: FeatureSchema,
  examples: AttackExample[],
  lastRoundFreq: Record<string, number>,
): LineageGraphData {
  const coupled = new Set(schema.coupled_groups.flat());
  const tierOf = (feature: string): "frozen" | "coupled" | "mutable" =>
    schema.frozen.includes(feature) ? "frozen" : coupled.has(feature) ? "coupled" : "mutable";

  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const edge = (id: string, source: string, target: string, label?: string) => {
    edges.push({ id, source, target, label });
  };

  (["frozen", "coupled", "mutable"] as const).forEach((tier) => {
    const members = schema.columns.filter((f) => tierOf(f) === tier);
    nodes.push({
      id: `tier:${tier}`,
      col: 0,
      kind: "tier",
      eyebrow: "tier",
      label: TIER_INFO[tier].label,
      sublabel: `${members.length} of ${schema.columns.length} features`,
      detail: {
        title: `${TIER_INFO[tier].label} — ${TIER_INFO[tier].blurb}`,
        stats: [{ k: "features", v: `${members.length}/${schema.columns.length}` }],
        rows: members,
      },
    });
  });

  for (const feature of schema.columns) {
    const tier = tierOf(feature);
    const touched = lastRoundFreq[feature] ?? 0;
    const touchingEvasions = examples.filter((e) => e.touched.some((t) => t.feature === feature));
    nodes.push({
      id: `feature:${feature}`,
      col: 1,
      // Frozen features get their own lane on the left, drawn back, because they are the
      // half of the schema the attack is not allowed to move -- that is the finding.
      subcol: tier === "frozen" ? 0 : 1,
      kind: "feature",
      eyebrow: tier,
      label: feature,
      sublabel: touched > 0 ? `${touched}× last round` : "not touched",
      muted: tier === "frozen",
      lock: tier === "frozen",
      detail: {
        title: `${feature} — ${TIER_INFO[tier].label.toLowerCase()}`,
        stats: [
          { k: "tier", v: TIER_INFO[tier].label.toLowerCase() },
          { k: "touched, last round", v: String(touched) },
          { k: "evasions fed", v: String(touchingEvasions.length) },
        ],
        rows: [
          `touched ${touched} time${touched === 1 ? "" : "s"} across successful evasions in the last round`,
          ...touchingEvasions.map((e) => {
            const d = e.touched.find((t) => t.feature === feature)!;
            return `${e.id}: ${fmtNum(d.before)} → ${fmtNum(d.after)}`;
          }),
        ],
      },
    });
    edge(`tier:${tier}->feature:${feature}`, `tier:${tier}`, `feature:${feature}`);
  }

  for (const ex of examples) {
    const id = `evasion:${ex.id}`;
    nodes.push({
      id,
      col: 2,
      kind: "evasion",
      eyebrow: `round ${ex.round}`,
      label: ex.id,
      sublabel: `${ex.orig_prob.toFixed(2)} → ${ex.adv_prob.toFixed(2)}`,
      detail: {
        title: `${ex.id} — round ${ex.round}`,
        stats: [
          { k: "round", v: String(ex.round) },
          { k: "score before", v: ex.orig_prob.toFixed(4) },
          { k: "score after", v: ex.adv_prob.toFixed(4) },
        ],
        rows: ex.touched.map((t) => `${t.feature}: ${fmtNum(t.before)} → ${fmtNum(t.after)}`),
      },
    });
    for (const t of ex.touched) {
      edge(
        `feature:${t.feature}->${id}`,
        `feature:${t.feature}`,
        id,
        `${fmtNum(t.before)} → ${fmtNum(t.after)}`,
      );
    }
  }

  // Chips only for features that actually fed an evasion -- a chip that lights nothing is
  // an invitation to a dead end. Ordered by how often the last round touched them.
  const fed = schema.columns.filter((f) => examples.some((e) => e.touched.some((t) => t.feature === f)));
  const chips = fed
    .map((f) => ({ id: `feature:${f}`, label: `${f} · ${lastRoundFreq[f] ?? 0}`, freq: lastRoundFreq[f] ?? 0 }))
    .sort((a, b) => b.freq - a.freq)
    .map(({ id, label }) => ({ id, label }));

  const defaultSelected =
    fed.includes("hour") ? "feature:hour" : (chips[0]?.id ?? null);

  return { nodes, edges, chipGroups: [{ label: "feature", chips }], defaultSelected };
}
