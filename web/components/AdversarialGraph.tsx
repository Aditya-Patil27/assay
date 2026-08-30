"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  ReactFlow,
} from "@xyflow/react";

import type { Graph, NodeStatus, Track } from "@/lib/types";

const TRACK: Record<Track, { color: string; label: string }> = {
  tabular: { color: "var(--color-attack)", label: "Tabular detector" },
  shared: { color: "var(--color-defend)", label: "Shared / contract" },
  agentic: { color: "var(--color-warn)", label: "Payment agent" },
};

/** Status is carried by a glyph, not only by opacity -- colour alone would not survive a projector. */
const STATUS: Record<NodeStatus, { glyph: string; word: string }> = {
  done: { glyph: "✓", word: "done" },
  running: { glyph: "▶", word: "running" },
  pending: { glyph: "○", word: "pending" },
};

const COL = 224;
const ROW = 132;
const LABEL_X = -196;

/**
 * The unrolled adversarial loop.
 *
 * Strategy 5.1: this process is cyclic -- attack, detect, retrain, attack again. It only
 * becomes a DAG once unrolled over rounds, so the feedback edges are drawn dashed, in a
 * different colour, animated, and labelled "unroll" rather than quietly presented as
 * ordinary flow. Calling the whole thing a DAG without saying that is the mistake the
 * strategy doc warns about.
 */
export function AdversarialGraph({ graph }: { graph: Graph }) {
  const { nodes, edges } = useMemo(() => {
    // The writer can emit both a flow and an unroll edge for the same pair (the retrain
    // hand-off is genuinely both). Drawing both stacks two lines on one path and the
    // dashes vanish underneath the solid stroke, so the unroll reading wins.
    const deduped = new Map<string, (typeof graph.edges)[number]>();
    for (const e of graph.edges) {
      const key = `${e.source}->${e.target}`;
      const existing = deduped.get(key);
      if (!existing || e.kind === "unroll") deduped.set(key, e);
    }
    const edgeList = [...deduped.values()];

    // Topological depth, used only to order nodes left-to-right within their band.
    const depth = new Map<string, number>();
    const incoming = new Map<string, string[]>();
    for (const e of edgeList) {
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

    // One row per round, rather than one long ribbon ordered by raw depth.
    //
    // Depth alone puts all 23 nodes on a single 17-column line, which fitView then shrinks
    // until the labels are unreadable on a projector. Banding by round costs nothing and
    // makes the unroll edges do visible work: each one drops from the end of round r back
    // to the start of round r+1, so the loop reads as a loop.
    const bandOf = (n: (typeof graph.nodes)[number]): string => {
      if (n.stage === "terminal") return "zz-terminal";
      if (n.track === "agentic") return "zy-agentic";
      if (n.round !== null) return `r${String(n.round).padStart(3, "0")}`;
      return "aa-setup";
    };
    const bandLabel = (band: string): string =>
      band === "aa-setup"
        ? "Setup"
        : band === "zy-agentic"
          ? "Agent track"
          : band === "zz-terminal"
            ? "Scorecard"
            : `Round ${Number(band.slice(1))}`;

    const bands = [...new Set(graph.nodes.map(bandOf))].sort();
    const rowOf = new Map(bands.map((b, i) => [b, i]));
    const seatOf = new Map<string, number>();
    for (const band of bands) {
      graph.nodes
        .filter((n) => bandOf(n) === band)
        .sort((a, b) => resolve(a.id) - resolve(b.id) || a.id.localeCompare(b.id))
        .forEach((n, i) => seatOf.set(n.id, i));
    }

    const rfNodes: Node[] = graph.nodes.map((n) => {
      const row = rowOf.get(bandOf(n))!;
      const seat = seatOf.get(n.id)!;
      const { color } = TRACK[n.track] ?? { color: "var(--color-muted)" };
      const status = STATUS[n.status] ?? STATUS.pending;

      return {
        id: n.id,
        position: { x: seat * COL, y: row * ROW },
        data: {
          label: (
            <div className="text-left">
              <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
                <span>
                  {n.stage}
                  {n.round !== null ? ` · r${n.round}` : ""}
                </span>
                <span title={status.word} style={{ color }}>
                  <span aria-hidden="true">{status.glyph}</span>
                  <span className="sr-only">{status.word}</span>
                </span>
              </div>
              <div className="mt-1 text-xs font-medium leading-snug">{n.label}</div>
            </div>
          ),
        },
        style: {
          background: "var(--color-figure-2)",
          border: `1.5px ${n.status === "pending" ? "dashed" : "solid"} ${color}`,
          borderRadius: 2,
          color: "var(--color-ink)",
          padding: "8px 10px",
          width: 186,
          fontSize: 12,
          opacity: n.status === "pending" ? 0.62 : 1,
        },
      };
    });

    // Row gutter labels. Presentation chrome derived from the data, not extra pipeline
    // state: without them the bands are just three near-identical rows of boxes.
    const labelNodes: Node[] = bands.map((band) => ({
      id: `__band-${band}`,
      className: "band-label",
      position: { x: LABEL_X, y: rowOf.get(band)! * ROW + 16 },
      draggable: false,
      selectable: false,
      connectable: false,
      data: {
        label: (
          <span className="text-[11px] text-muted">
            {bandLabel(band)}
          </span>
        ),
      },
      style: {
        background: "transparent",
        border: "none",
        boxShadow: "none",
        padding: 0,
        width: 170,
        textAlign: "right" as const,
      },
    }));

    const rfEdges: Edge[] = edgeList.map((e, i) => {
      const unroll = e.kind === "unroll";
      const stroke = unroll ? "var(--color-warn)" : "var(--color-rule)";
      return {
        id: `${e.source}->${e.target}-${i}`,
        source: e.source,
        target: e.target,
        animated: unroll,
        label: unroll ? "unroll r→r+1" : undefined,
        labelStyle: {
          fill: "var(--color-warn)",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
        },
        labelBgStyle: { fill: "var(--color-paper)" },
        labelBgPadding: [4, 2] as [number, number],
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 },
        style: {
          stroke,
          strokeWidth: unroll ? 2.5 : 1.5,
          strokeDasharray: unroll ? "6 4" : undefined,
        },
      };
    });

    return { nodes: [...labelNodes, ...rfNodes], edges: rfEdges };
  }, [graph]);

  return (
    <div>
      <div className="h-[420px] w-full overflow-hidden border border-rule bg-paper sm:h-[520px] md:h-[600px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          minZoom={0.15}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          autoPanOnNodeFocus={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#bdbdb2" />
          <Controls showInteractive={false} className="!border-rule !bg-figure" />
        </ReactFlow>
      </div>

      <GraphLegend />
    </div>
  );
}

function GraphLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border border-rule bg-figure px-4 py-3 text-[11px] text-muted">
      {(Object.keys(TRACK) as Track[]).map((t) => (
        <span key={t} className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-5 border-[1.5px]"
            style={{ borderColor: TRACK[t].color, background: "var(--color-figure-2)" }}
          />
          {TRACK[t].label}
        </span>
      ))}

      <span className="inline-flex items-center gap-2">
        <svg width="30" height="10" aria-hidden="true">
          <line x1="0" y1="5" x2="30" y2="5" stroke="var(--color-rule)" strokeWidth="2" />
        </svg>
        flow edge
      </span>
      <span className="inline-flex items-center gap-2 text-warn">
        <svg width="30" height="10" aria-hidden="true">
          <line
            x1="0"
            y1="5"
            x2="30"
            y2="5"
            stroke="var(--color-warn)"
            strokeWidth="2.5"
            strokeDasharray="6 4"
          />
        </svg>
        unroll edge — the feedback cycle, made acyclic by round
      </span>

      <span className="inline-flex items-center gap-3">
        {(Object.keys(STATUS) as NodeStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true">{STATUS[s].glyph}</span>
            {STATUS[s].word}
          </span>
        ))}
      </span>
    </div>
  );
}
