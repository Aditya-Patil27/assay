"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MarkerType,
  ReactFlow,
} from "@xyflow/react";

import { Block, Figure } from "@/components/Chrome";
import {
  COLUMN_COLOR,
  LINEAGE_NODE_TYPES,
  type LineageFlowNode,
  nodeAccent,
} from "@/components/LineageNodes";
import {
  computeHighlight,
  type LayoutOptions,
  layoutLineage,
} from "@/lib/lineage-layout";
import type { LineageGraphData, LineageNode, LineageNodeKind } from "@/lib/lineage";

/**
 * The /lineage page: two graphs over the same corpus other pages already print as tables.
 *
 * The first cut of this drew React Flow's default nodes and waited for the reader to guess
 * that clicking one did anything, which meant it opened as a grey hairball and stayed that
 * way. Three things fixed that, and they are the whole design:
 *
 *   - every node is a card with its column's colour on the rail, so the five stages read as
 *     five stages before a single label is read;
 *   - a row of entry-point chips sits above each graph, so tracing a path is an offered
 *     action rather than a discovery;
 *   - the page lights a real path by itself 800ms after it mounts -- the first technique
 *     that actually got through with defences off -- so a judge who never clicks anything
 *     still sees the thing the graph is for.
 *
 * Either graph can be null: a clone that never ran the agent runtime export or never wrote
 * a feature schema still builds, and this omits the graph it cannot draw rather than
 * inventing one -- the same rule lib/load.ts's optional loaders follow everywhere else.
 */
export function LineageGraph({
  agentic,
  tabular,
}: {
  agentic: LineageGraphData | null;
  tabular: LineageGraphData | null;
}) {
  return (
    <>
      <Block
        title="Graph 1 — the agentic surface"
        lede="Where a payload can enter, and what it can do: the task the agent is doing, the channel it reads, the injection technique planted there, the goal it aims at, and what actually happened across 288 measured trials on one model (gpt-oss-120b via Groq)."
      >
        {agentic ? (
          <LineageGraphView
            graph={agentic}
            n={1}
            caption="Click a chip, or any node, to trace every path through it — everything off that path drops back and the traced edges start flowing. Edge labels appear only on a traced path: channel → technique and technique → goal are injection counts, technique → outcome are trial counts."
            legendKinds={["task", "channel", "technique", "goal", "outcome"]}
          />
        ) : (
          <MissingNote file="agent_runtime.json or agentic/redteam-groq.json" />
        )}
      </Block>

      <Block
        title="Graph 2 — the tabular surface"
        lede="This is the structure of the measured corpus and the worked examples that survived to a successful evasion -- not a causal model. A feature pointing at an evasion means that evasion touched it, nothing stronger."
      >
        {tabular ? (
          <LineageGraphView
            graph={tabular}
            n={2}
            caption="Feature tier → feature → the worked evasion it fed. The seven frozen features hold their own lane, drawn back and locked, because the attack is not allowed to move them; the thirteen it can move sit beside them. Edge labels on a traced path are before → after values."
            legendKinds={["tier", "feature", "evasion"]}
            layout={TABULAR_LAYOUT}
          />
        ) : (
          <MissingNote file="feature_schema.json, attack/examples.json, or attack/rounds.json" />
        )}
      </Block>
    </>
  );
}

function MissingNote({ file }: { file: string }) {
  return (
    <p className="border border-dashed border-rule bg-figure-2 p-4 text-[0.8125rem] text-muted">
      This graph needs {file}, which this build does not have.
    </p>
  );
}

/* ---------------------------------------------------------------------------------------
 * One graph: chips, canvas, legend, panel.
 * ------------------------------------------------------------------------------------- */

const AUTO_SELECT_MS = 800;

/** Module scope: an inline object literal here would rebuild the layout on every render. */
const TABULAR_LAYOUT: LayoutOptions = { gapRow: 12, gapCol: 118 };

function LineageGraphView({
  graph,
  n,
  caption,
  legendKinds,
  layout: layoutOptions,
}: {
  graph: LineageGraphData;
  n: number;
  caption: string;
  legendKinds: LineageNodeKind[];
  layout?: LayoutOptions;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const touchedRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => layoutLineage(graph.nodes, layoutOptions), [graph, layoutOptions]);
  const { nodes, edges } = useFlowElements(graph, layout.positions, selected);

  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);
  const selectedNode = selected ? (byId.get(selected) ?? null) : null;

  // A canvas tall enough that fitView does not shrink the drawing past reading size. The
  // layout reports its own extent, so this is derived rather than guessed.
  const height = Math.round(Math.min(880, Math.max(640, layout.height * 0.95)));

  // Opens lit. Skipped entirely if the reader got there first.
  useEffect(() => {
    if (!graph.defaultSelected) return;
    const t = window.setTimeout(() => {
      if (touchedRef.current) return;
      setSelected(graph.defaultSelected);
    }, AUTO_SELECT_MS);
    return () => window.clearTimeout(t);
  }, [graph]);

  const pick = useCallback((id: string | null, scroll = false) => {
    touchedRef.current = true;
    setTouched(true);
    setSelected((cur) => (cur === id ? null : id));
    if (scroll) {
      window.requestAnimationFrame(() =>
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      );
    }
  }, []);

  return (
    <div>
      <ChipRow graph={graph} selected={selected} onPick={(id) => pick(id, true)} />

      <Figure n={n} caption={caption}>
        <div
          style={{ height }}
          className="w-full overflow-hidden rounded-[4px] border border-rule bg-paper"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={LINEAGE_NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.4}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            nodesDraggable={false}
            edgesFocusable={false}
            onNodeClick={(_, node) => pick(node.id)}
            onPaneClick={() => pick(null)}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#2a3243" />
            <Controls showInteractive={false} className="!border-rule !bg-figure" />
          </ReactFlow>
        </div>

        <Legend kinds={legendKinds} />
      </Figure>

      <div ref={panelRef} className="mt-4 scroll-mt-24">
        <DetailPanel node={selectedNode} hint={!touched} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------
 * Entry points.
 * ------------------------------------------------------------------------------------- */

function ChipRow({
  graph,
  selected,
  onPick,
}: {
  graph: LineageGraphData;
  selected: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
      <span className="mono-label mr-1 text-[0.75rem] uppercase tracking-[0.08em] text-muted">
        Start from:
      </span>
      {graph.chipGroups.map((group) =>
        group.chips.map((chip) => {
          const node = graph.nodes.find((x) => x.id === chip.id);
          const accent = node ? nodeAccent(node) : "var(--color-rule-strong)";
          const on = selected === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onPick(chip.id)}
              aria-pressed={on}
              className="btn inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.75rem] leading-tight"
              style={{
                borderColor: on ? accent : "var(--color-rule)",
                background: on ? accent : "var(--color-figure)",
                color: on ? "var(--color-paper)" : "var(--color-ink)",
              }}
            >
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: on ? "var(--color-paper)" : accent }}
              />
              {chip.label}
            </button>
          );
        }),
      )}
    </div>
  );
}

const KIND_LABEL: Record<LineageNodeKind, string> = {
  task: "task",
  channel: "channel",
  technique: "technique",
  goal: "goal",
  outcome: "outcome",
  tier: "tier",
  feature: "feature",
  evasion: "evasion",
};

function Legend({ kinds }: { kinds: LineageNodeKind[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.75rem] text-muted">
      {kinds.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-1 rounded-[1px]"
            style={{ background: COLUMN_COLOR[k] }}
          />
          {KIND_LABEL[k]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-[1px]"
          style={{ background: "#ff4d5e" }}
        />
        coral = exploited
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-[1px]"
          style={{ background: "#22d3a6" }}
        />
        teal = held
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------
 * The side panel.
 * ------------------------------------------------------------------------------------- */

function DetailPanel({ node, hint }: { node: LineageNode | null; hint: boolean }) {
  const accent = node ? nodeAccent(node) : "var(--color-rule-strong)";
  return (
    <div
      className="card border border-rule p-5 text-[0.8125rem] leading-relaxed"
      style={{ borderLeftWidth: 5, borderLeftColor: accent, borderLeftStyle: "solid" }}
    >
      {node ? (
        <>
          <p className="mono-label text-[0.6875rem] uppercase tracking-[0.08em] text-muted">
            {node.eyebrow}
            {node.badge ? ` · ${node.badge}` : ""}
          </p>
          <h3 className="display mt-1.5 text-[1.125rem] leading-snug text-ink">
            {node.detail.title}
          </h3>

          {node.detail.stats?.length ? (
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-rule pt-4">
              {node.detail.stats.map((s) => (
                <div key={s.k}>
                  <dd className="tnum font-mono text-[1.25rem] leading-none text-ink">{s.v}</dd>
                  <dt className="mt-1.5 text-[0.75rem] text-muted">{s.k}</dt>
                </div>
              ))}
            </dl>
          ) : null}

          {node.detail.quote ? (
            <blockquote
              className="mt-4 bg-figure-2 px-4 py-3 font-mono text-[0.75rem] leading-relaxed text-ink"
              style={{ borderLeft: `3px solid ${accent}` }}
            >
              <p className="mono-label mb-1.5 text-[0.6875rem] uppercase tracking-[0.08em] text-muted">
                example injection
              </p>
              &ldquo;{node.detail.quote}&rdquo;
            </blockquote>
          ) : null}

          {node.detail.rows.length ? (
            <ul className="mt-4 space-y-1.5 break-words font-mono text-[0.75rem] text-muted">
              {node.detail.rows.map((row, i) => (
                <li key={i}>{row}</li>
              ))}
            </ul>
          ) : null}

          {hint ? (
            <p className="mt-4 border-t border-rule pt-3 text-[0.75rem] text-muted">
              Opened on this path automatically — click any node or chip to trace a different
              one.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-muted">
          Click any node or chip to trace a different path: everything off it drops back, and
          this panel shows what feeds the node and what it fed.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------
 * Flow elements.
 * ------------------------------------------------------------------------------------- */

const REST_STROKE = "var(--color-rule-strong)";
const TONE_STROKE = { attack: "#ff4d5e", defend: "#22d3a6" } as const;

function useFlowElements(
  graph: LineageGraphData,
  positions: Record<string, { x: number; y: number }>,
  selected: string | null,
) {
  return useMemo(() => {
    const { nodeIds, edgeIds } = computeHighlight(graph.edges, selected);
    const nodeHi = new Set(nodeIds);
    const edgeHi = new Set(edgeIds);
    const active = selected !== null;
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));

    const nodes: LineageFlowNode[] = graph.nodes.map((n) => ({
      id: n.id,
      type: "lineage",
      position: positions[n.id] ?? { x: n.col * 280, y: 0 },
      data: { node: n, dim: active && !nodeHi.has(n.id), active: n.id === selected },
      draggable: false,
      selectable: true,
    }));

    const edges: Edge[] = graph.edges.map((e) => {
      const lit = active && edgeHi.has(e.id);
      const dim = active && !lit;
      // A traced edge takes its colour from where it comes from, so a path visibly changes
      // register as it crosses the columns rather than being one flat highlight colour.
      const source = byId.get(e.source);
      const stroke = lit
        ? (e.tone ? TONE_STROKE[e.tone] : source ? nodeAccent(source) : REST_STROKE)
        : REST_STROKE;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "default",
        animated: lit,
        // Labels only where a reader is already looking: on every edge at once they were
        // the single biggest source of noise in the first version of this page.
        label: lit ? e.label : undefined,
        labelShowBg: true,
        labelStyle: {
          fill: "var(--color-ink)",
          fontSize: 13,
          fontFamily: "var(--font-mono)",
        },
        labelBgStyle: { fill: "var(--color-figure)", stroke: "var(--color-rule)" },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 9,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 13,
          height: 13,
        },
        style: {
          stroke,
          strokeWidth: 2,
          opacity: dim ? 0.15 : lit ? 1 : 0.5,
          transition: "opacity 220ms ease, stroke 220ms ease",
        },
      };
    });

    return { nodes, edges };
  }, [graph, positions, selected]);
}
