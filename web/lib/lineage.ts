/**
 * Pure builders for the /lineage page.
 *
 * These functions turn committed artifacts into plain node/edge lists a React Flow graph
 * can render -- no React, no DOM, nothing that needs a browser to test. The page ("second
 * brain" reading: entry point -> technique -> goal -> outcome, and feature -> evasion) is
 * assembled here so the layout math and the click-to-highlight traversal can be unit
 * tested without mounting a graph.
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

export interface LineageDetail {
  title: string;
  rows: string[];
}

export interface LineageNode {
  id: string;
  col: number;
  kind: LineageNodeKind;
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

export interface LineageGraphData {
  nodes: LineageNode[];
  edges: LineageEdge[];
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
  const edge = (id: string, source: string, target: string, label?: string, tone?: "attack" | "defend") =>
    edges.push({ id, source, target, label, tone });

  for (const t of tasks) {
    const rows = scenarios.filter((s) => s.task_type === t);
    nodes.push({
      id: `task:${t}`,
      col: 0,
      kind: "task",
      label: humanize(t),
      sublabel: `${rows.length} scenario${rows.length === 1 ? "" : "s"}`,
      detail: {
        title: `${humanize(t)} -- ${rows.length} scenario${rows.length === 1 ? "" : "s"}`,
        rows: rows.map((s: Scenario) => `${s.id}: "${s.user_request}"`),
      },
    });
  }

  for (const c of channels) {
    const readers = scenarios.filter((s) => s.channel === c);
    nodes.push({
      id: `channel:${c}`,
      col: 1,
      kind: "channel",
      label: humanize(c),
      sublabel: `read by ${readers.length} scenario${readers.length === 1 ? "" : "s"}`,
      detail: {
        title: `${humanize(c)} -- scenarios that read this channel`,
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
      label: row.category,
      badge: row.owasp_id,
      sublabel: `${row.success_before}/${row.attempts} → ${row.success_after}/${row.attempts}`,
      detail: {
        title: `${row.category} · OWASP ${row.owasp_id}${rep ? ` · ${rep.atlas_technique}` : ""}`,
        rows: [
          `${row.attempts} attempts · exploited ${row.success_before} before defenses, ${row.success_after} after`,
          `example injection: "${row.example_injection}"`,
        ],
      },
    });

    for (const c of channels) {
      const count = injections.filter((i) => i.channel === c && i.category_title === row.category).length;
      if (count > 0) edge(`channel:${c}->${id}`, `channel:${c}`, id, String(count));
    }

    for (const g of goals) {
      const count = injections.filter((i) => i.category_title === row.category && i.goal === g).length;
      if (count > 0) edge(`${id}->goal:${g}`, id, `goal:${g}`);
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
      label: humanize(g),
      sublabel: `${targeting.length} injection${targeting.length === 1 ? "" : "s"}`,
      detail: {
        title: `${humanize(g)} -- targeted by ${targeting.length} injection${targeting.length === 1 ? "" : "s"}`,
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
      label: "Exploited with defences off",
      sublabel: `${totalBefore}/${totalAttempts}`,
      tone: "attack",
      detail: {
        title: `Exploited with defences off -- ${totalBefore}/${totalAttempts} attempts`,
        rows: redteam
          .filter((r) => r.success_before > 0)
          .map((r) => `${r.category}: ${r.success_before}/${r.attempts}`),
      },
    },
    {
      id: OUTCOME_HELD,
      col: 4,
      kind: "outcome",
      label: "Held with defences on",
      sublabel: `${totalAttempts - totalAfter}/${totalAttempts}`,
      tone: "defend",
      detail: {
        title: `Held with defences on -- ${totalAttempts - totalAfter}/${totalAttempts} attempts`,
        rows: redteam
          .filter((r) => r.attempts - r.success_after > 0)
          .map((r) => `${r.category}: ${r.attempts - r.success_after}/${r.attempts}`),
      },
    },
  );

  return { nodes, edges };
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

  (["frozen", "coupled", "mutable"] as const).forEach((tier) => {
    const members = schema.columns.filter((f) => tierOf(f) === tier);
    nodes.push({
      id: `tier:${tier}`,
      col: 0,
      kind: "tier",
      label: TIER_INFO[tier].label,
      sublabel: TIER_INFO[tier].blurb,
      detail: {
        title: `${TIER_INFO[tier].label} -- ${TIER_INFO[tier].blurb}`,
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
      kind: "feature",
      label: feature,
      sublabel: touched > 0 ? `touched ${touched}× last round` : "not touched last round",
      muted: tier === "frozen",
      lock: tier === "frozen",
      detail: {
        title: `${feature} -- ${TIER_INFO[tier].label.toLowerCase()}`,
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

  function edge(id: string, source: string, target: string, label?: string) {
    edges.push({ id, source, target, label });
  }

  for (const ex of examples) {
    const id = `evasion:${ex.id}`;
    nodes.push({
      id,
      col: 2,
      kind: "evasion",
      label: `${ex.id} · round ${ex.round} · ${ex.orig_prob.toFixed(2)} → ${ex.adv_prob.toFixed(2)}`,
      detail: {
        title: `${ex.id} -- round ${ex.round}`,
        rows: [
          `score ${ex.orig_prob.toFixed(4)} → ${ex.adv_prob.toFixed(4)}`,
          ...ex.touched.map((t) => `${t.feature}: ${fmtNum(t.before)} → ${fmtNum(t.after)}`),
        ],
      },
    });
    for (const t of ex.touched) {
      edge(`feature:${t.feature}->${id}`, `feature:${t.feature}`, id, `${fmtNum(t.before)} → ${fmtNum(t.after)}`);
    }
  }

  return { nodes, edges };
}

/* ---------------------------------------------------------------------------------------
 * Layout and interaction -- pure, so both are unit-testable without React Flow mounted.
 * ------------------------------------------------------------------------------------- */

export interface LayoutOptions {
  colWidth?: number;
  rowHeight?: number;
}

/** Fixed x per column; y spread evenly, with shorter columns centred against the tallest. */
export function layoutColumns(
  nodes: LineageNode[],
  { colWidth = 260, rowHeight = 92 }: LayoutOptions = {},
): Record<string, { x: number; y: number }> {
  const byCol = new Map<number, string[]>();
  for (const n of nodes) {
    const arr = byCol.get(n.col) ?? [];
    arr.push(n.id);
    byCol.set(n.col, arr);
  }
  const maxCount = Math.max(1, ...[...byCol.values()].map((a) => a.length));

  const pos: Record<string, { x: number; y: number }> = {};
  for (const [col, ids] of byCol) {
    const offset = ((maxCount - ids.length) / 2) * rowHeight;
    ids.forEach((id, i) => {
      pos[id] = { x: col * colWidth, y: offset + i * rowHeight };
    });
  }
  return pos;
}

export interface Highlight {
  nodeIds: string[];
  edgeIds: string[];
}

/**
 * Every node and edge on a path through `selectedId` -- ancestors found by walking edges
 * backward, descendants by walking forward. The caller dims everything not returned here.
 */
export function computeHighlight(edges: LineageEdge[], selectedId: string | null): Highlight {
  if (!selectedId) return { nodeIds: [], edgeIds: [] };

  const nodeIds = new Set<string>([selectedId]);
  const edgeIds = new Set<string>();

  const forward = [selectedId];
  while (forward.length) {
    const cur = forward.shift()!;
    for (const e of edges) {
      if (e.source === cur) {
        edgeIds.add(e.id);
        if (!nodeIds.has(e.target)) {
          nodeIds.add(e.target);
          forward.push(e.target);
        }
      }
    }
  }

  const backward = [selectedId];
  while (backward.length) {
    const cur = backward.shift()!;
    for (const e of edges) {
      if (e.target === cur) {
        edgeIds.add(e.id);
        if (!nodeIds.has(e.source)) {
          nodeIds.add(e.source);
          backward.push(e.source);
        }
      }
    }
  }

  return { nodeIds: [...nodeIds], edgeIds: [...edgeIds] };
}
