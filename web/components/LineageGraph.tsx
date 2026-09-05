"use client";

import { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  ReactFlow,
} from "@xyflow/react";

import { Block, Figure } from "@/components/Chrome";
import {
  computeHighlight,
  layoutColumns,
  type LineageGraphData,
  type LineageNode,
} from "@/lib/lineage";

/**
 * The /lineage page: two "second brain" graphs over the same corpus other pages already
 * chart as tables. Both share one interaction -- click a node, everything not on a path
 * through it dims to ~25% opacity -- so a viewer can trace "a memo can carry X aiming at Y,
 * held N of M times" by clicking through the columns rather than cross-referencing tables.
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
          <Figure
            n={1}
            caption="Click a task, channel, technique, goal, or outcome node to trace every path through it -- the rest of the graph dims. Edge labels on channel → technique are injection counts; on technique → outcome they are trial counts."
          >
            <LineageGraphView graph={agentic} />
          </Figure>
        ) : (
          <MissingNote file="agent_runtime.json or agentic/redteam-groq.json" />
        )}
      </Block>

      <Block
        title="Graph 2 — the tabular surface"
        lede="This is the structure of the measured corpus and the worked examples that survived to a successful evasion -- not a causal model. A feature pointing at an evasion means that evasion touched it, nothing stronger."
      >
        {tabular ? (
          <Figure
            n={2}
            caption="Feature tier (frozen / coupled / mutable) → feature, sub-labelled with how often it was touched in the last attack round → the worked evasion it fed. Edge labels are before → after values."
          >
            <LineageGraphView graph={tabular} />
          </Figure>
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

function LineageGraphView({ graph }: { graph: LineageGraphData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { nodes, edges } = useFlowElements(graph, selected);
  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selected) ?? null,
    [graph, selected],
  );

  // The canvas grows with the tallest column so fitView does not shrink twenty stacked
  // feature nodes into an unreadable strip.
  const tallest = useMemo(() => {
    const perColumn = new Map<number, number>();
    for (const n of nodes) perColumn.set(n.position.x, (perColumn.get(n.position.x) ?? 0) + 1);
    return Math.max(1, ...perColumn.values());
  }, [nodes]);
  const height = Math.min(1150, Math.max(520, tallest * 54 + 120));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div style={{ height }} className="w-full overflow-hidden border border-rule bg-paper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          edgesFocusable={false}
          onNodeClick={(_, node) => setSelected((cur) => (cur === node.id ? null : node.id))}
          onPaneClick={() => setSelected(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#bdbdb2" />
          <Controls showInteractive={false} className="!border-rule !bg-figure" />
        </ReactFlow>
      </div>

      <DetailPanel node={selectedNode} />
    </div>
  );
}

function DetailPanel({ node }: { node: LineageNode | null }) {
  return (
    <div className="card border border-rule p-4 text-[0.8125rem] leading-relaxed">
      {node ? (
        <>
          <p className="mono-label text-[0.6875rem] text-muted">{node.kind}</p>
          <h3 className="mt-1 font-medium leading-snug text-ink">{node.detail.title}</h3>
          <ul className="mt-3 space-y-1.5 break-words font-mono text-[0.75rem] text-muted">
            {node.detail.rows.length ? (
              node.detail.rows.map((row, i) => <li key={i}>{row}</li>)
            ) : (
              <li>No further detail recorded.</li>
            )}
          </ul>
        </>
      ) : (
        <p className="text-muted">
          Click a node to see what feeds it, what it fed, and to dim every other path.
        </p>
      )}
    </div>
  );
}

function useFlowElements(graph: LineageGraphData, selected: string | null) {
  return useMemo(() => {
    const pos = layoutColumns(graph.nodes);
    const { nodeIds, edgeIds } = computeHighlight(graph.edges, selected);
    const nodeHi = new Set(nodeIds);
    const edgeHi = new Set(edgeIds);
    const active = selected !== null;

    const nodes: Node[] = graph.nodes.map((n) => {
      const dim = active && !nodeHi.has(n.id);
      return {
        id: n.id,
        position: pos[n.id] ?? { x: n.col * 260, y: 0 },
        className: dim ? "lineage-dim" : undefined,
        data: { label: <NodeLabel node={n} /> },
        style: {
          ...nodeStyle(n),
          opacity: dim ? 0.25 : 1,
        },
      };
    });

    const edges: Edge[] = graph.edges.map((e) => {
      const dim = active && !edgeHi.has(e.id);
      const stroke =
        e.tone === "attack"
          ? "var(--color-attack-fill)"
          : e.tone === "defend"
            ? "var(--color-defend-fill)"
            : "var(--color-rule-strong)";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        className: dim ? "lineage-dim" : undefined,
        labelStyle: { fill: "var(--color-muted)", fontSize: 10, fontFamily: "var(--font-mono)" },
        labelBgStyle: { fill: "var(--color-paper)" },
        labelBgPadding: [4, 2] as [number, number],
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
        style: {
          stroke,
          strokeWidth: e.tone ? 2 : 1.25,
          opacity: dim ? 0.25 : 1,
        },
      };
    });

    return { nodes, edges };
  }, [graph, selected]);
}

function nodeStyle(n: LineageNode): React.CSSProperties {
  const border =
    n.tone === "attack"
      ? "var(--color-attack-fill)"
      : n.tone === "defend"
        ? "var(--color-defend-fill)"
        : "var(--color-rule-strong)";
  return {
    background: n.muted ? "var(--color-figure-2)" : "var(--color-figure)",
    border: `1.5px ${n.muted ? "dashed" : "solid"} ${border}`,
    borderRadius: 2,
    color: "var(--color-ink)",
    padding: "8px 10px",
    width: 200,
    fontSize: 12,
  };
}

function NodeLabel({ node }: { node: LineageNode }) {
  return (
    <div className="text-left">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted">
        <span>{node.kind}</span>
        {node.badge ? (
          <span className="rounded-[2px] border border-rule px-1 py-0.5 font-mono text-[9px] normal-case text-muted">
            {node.badge}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs font-medium leading-snug">
        {node.lock ? (
          <span aria-hidden="true" title="frozen">
            🔒{" "}
          </span>
        ) : null}
        {node.label}
      </div>
      {node.sublabel ? (
        <div className="mt-1 font-mono text-[10px] text-muted">{node.sublabel}</div>
      ) : null}
    </div>
  );
}
