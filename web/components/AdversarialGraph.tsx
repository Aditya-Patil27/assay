"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
} from "@xyflow/react";

import type { Graph } from "@/lib/types";

const TRACK_COLOR: Record<string, string> = {
  tabular: "var(--color-attack)",
  agentic: "var(--color-warn)",
  shared: "var(--color-defend)",
};

/**
 * The unrolled adversarial loop.
 *
 * Strategy 5.1: this process is cyclic -- attack, detect, retrain, attack again. It only
 * becomes a DAG once unrolled over rounds, so the feedback edges are drawn dashed and
 * labelled "unroll" rather than quietly presented as ordinary flow.
 */
export function AdversarialGraph({ graph }: { graph: Graph }) {
  const { nodes, edges } = useMemo(() => {
    // Layered layout: x by pipeline depth, y by track lane and round.
    const depth = new Map<string, number>();
    const incoming = new Map<string, string[]>();
    for (const e of graph.edges) {
      incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source]);
    }

    const resolve = (id: string, seen = new Set<string>()): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (seen.has(id)) return 0; // guard against the unroll edge closing a cycle
      seen.add(id);
      const parents = incoming.get(id) ?? [];
      const d = parents.length ? Math.max(...parents.map((p) => resolve(p, seen))) + 1 : 0;
      depth.set(id, d);
      return d;
    };
    graph.nodes.forEach((n) => resolve(n.id));

    const laneOf = (track: string) => (track === "agentic" ? 2 : track === "shared" ? 1 : 0);
    const perColumn = new Map<string, number>();

    const rfNodes: Node[] = graph.nodes.map((n) => {
      const x = resolve(n.id);
      const key = `${x}:${laneOf(n.track)}`;
      const seat = perColumn.get(key) ?? 0;
      perColumn.set(key, seat + 1);
      const color = TRACK_COLOR[n.track] ?? "var(--color-muted)";

      return {
        id: n.id,
        position: { x: x * 210, y: laneOf(n.track) * 260 + seat * 78 },
        data: {
          label: (
            <div className="text-left">
              <div className="font-mono text-[10px] uppercase tracking-wider opacity-60">
                {n.stage}
                {n.round !== null ? ` · r${n.round}` : ""}
              </div>
              <div className="mt-0.5 text-xs font-medium">{n.label}</div>
            </div>
          ),
        },
        style: {
          background: "var(--color-panel-2)",
          border: `1px solid ${color}`,
          borderRadius: 8,
          color: "var(--color-text)",
          padding: "8px 10px",
          width: 178,
          fontSize: 12,
        },
      };
    });

    const rfEdges: Edge[] = graph.edges.map((e, i) => ({
      id: `${e.source}->${e.target}-${i}`,
      source: e.source,
      target: e.target,
      animated: e.kind === "unroll",
      label: e.kind === "unroll" ? "unroll" : undefined,
      labelStyle: {
        fill: "var(--color-warn)",
        fontSize: 10,
        fontFamily: "var(--font-mono)",
      },
      labelBgStyle: { fill: "var(--color-ink)" },
      style: {
        stroke: e.kind === "unroll" ? "var(--color-warn)" : "var(--color-line)",
        strokeWidth: e.kind === "unroll" ? 2 : 1.5,
        strokeDasharray: e.kind === "unroll" ? "5 4" : undefined,
      },
    }));

    return { nodes: rfNodes, edges: rfEdges };
  }, [graph]);

  return (
    <div className="h-[560px] w-full overflow-hidden rounded-xl border border-line bg-ink">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
autoPanOnNodeFocus={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1a212c" />
        <Controls showInteractive={false} className="!bg-panel !border-line" />
      </ReactFlow>
    </div>
  );
}
