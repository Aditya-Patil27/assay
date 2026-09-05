"use client";

import { Handle, type Node, type NodeProps, type NodeTypes, Position } from "@xyflow/react";

import { NODE_W } from "@/lib/lineage-layout";
import type { LineageNode, LineageNodeKind } from "@/lib/lineage";

/**
 * The card drawn for one node of the lineage graphs.
 *
 * React Flow's default node is a bordered box with a single 12px label, which is how the
 * first cut of this page ended up as a wall of grey rectangles nobody could read at fitView
 * zoom. This replaces it with something closer to the rest of the site: a coloured rail
 * naming the column, a mono eyebrow, a title set large enough to survive the shrink, and
 * one line of figures.
 *
 * Font sizes here are pre-zoom. fitView on a 1440-wide screen lands both graphs near 0.85,
 * so a 17px title reads at roughly 14px and the eyebrow at 11px -- the reason the layout in
 * lib/lineage.ts reports its pixel extent is so those two numbers can be reasoned about
 * rather than discovered in a screenshot.
 */

/** One colour per column. Ink for the two "where it starts" columns, then the accents. */
export const COLUMN_COLOR: Record<LineageNodeKind, string> = {
  task: "#9aa7bd",
  channel: "#5eb0ff",
  technique: "#ff4d5e",
  goal: "#f5b544",
  outcome: "#9aa7bd",
  tier: "#9aa7bd",
  feature: "#5eb0ff",
  evasion: "#ff4d5e",
};

const FILL = { attack: "#ff4d5e", defend: "#22d3a6" } as const;

/** The rail colour: an outcome's tone wins over its column, because that is its meaning. */
export function nodeAccent(node: LineageNode): string {
  if (node.tone === "attack") return "#ff4d5e";
  if (node.tone === "defend") return "#22d3a6";
  return COLUMN_COLOR[node.kind];
}

export interface LineageNodeData extends Record<string, unknown> {
  node: LineageNode;
  dim: boolean;
  active: boolean;
}

export type LineageFlowNode = Node<LineageNodeData, "lineage">;

const HANDLE_STYLE: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  border: "none",
  background: "transparent",
};

function LineageNodeCard({ data }: NodeProps<LineageFlowNode>) {
  const { node, dim, active } = data;
  const accent = nodeAccent(node);
  // Outcomes are the terminal reading of the whole graph, so they are filled rather than
  // railed -- both fill colours carry the ground colour as text at well over 4.5:1.
  const fill = node.kind === "outcome" && node.tone ? FILL[node.tone] : null;

  return (
    <div
      style={{
        width: NODE_W[node.kind],
        boxSizing: "border-box",
        background: fill ?? (node.muted ? "var(--color-figure-2)" : "var(--color-figure)"),
        borderTop: "1px solid var(--color-rule)",
        borderRight: "1px solid var(--color-rule)",
        borderBottom: "1px solid var(--color-rule)",
        borderLeft: `5px solid ${accent}`,
        borderRadius: 4,
        padding: node.kind === "feature" ? "7px 10px" : "9px 12px 10px",
        textAlign: "left",
        // A filled node carries the ground colour, not ink: ink on coral is unreadable.
        color: fill ? "var(--color-on-accent)" : "var(--color-ink)",
        // Frozen features are drawn back, not hidden: the point of the lane is that the
        // attacker cannot move them, and an empty gap would not say that.
        opacity: dim ? 0.15 : node.muted ? 0.4 : 1,
        boxShadow: active
          ? `0 0 0 2px ${accent}, 0 6px 18px rgb(0 0 0 / 0.55)`
          : "0 1px 2px rgb(0 0 0 / 0.45)",
        transition: "opacity 220ms ease, box-shadow 180ms ease",
      }}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} isConnectable={false} />

      {node.kind === "feature" ? null : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: fill ? "rgb(8 10 15 / 0.68)" : "var(--color-muted)",
          }}
        >
          <span>{node.eyebrow}</span>
          {node.badge ? (
            <span
              style={{
                border: `1px solid ${fill ? "rgb(8 10 15 / 0.32)" : "var(--color-rule)"}`,
                borderRadius: 3,
                padding: "0 4px",
                letterSpacing: "0.02em",
              }}
            >
              {node.badge}
            </span>
          ) : null}
        </div>
      )}

      <div
        style={{
          marginTop: node.kind === "feature" ? 0 : 3,
          fontFamily: node.kind === "feature" ? "var(--font-mono)" : "var(--font-sans)",
          fontSize: 17,
          fontWeight: 600,
          lineHeight: 1.16,
          letterSpacing: node.kind === "feature" ? "-0.02em" : "-0.005em",
          overflowWrap: "anywhere",
        }}
      >
        {node.lock ? <span aria-hidden="true">&#128274; </span> : null}
        {node.label}
      </div>

      {node.sublabel ? (
        <div
          style={{
            marginTop: 3,
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            lineHeight: 1.25,
            color: fill ? "rgb(8 10 15 / 0.78)" : "var(--color-muted)",
          }}
        >
          {node.sublabel}
        </div>
      ) : null}

      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} isConnectable={false} />
    </div>
  );
}

/** Registered once at module scope: React Flow warns and remounts if this identity moves. */
export const LINEAGE_NODE_TYPES: NodeTypes = { lineage: LineageNodeCard };
