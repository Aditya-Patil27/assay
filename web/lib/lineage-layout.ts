/**
 * Layout and traversal for the /lineage graphs -- pure, so both are exercisable without
 * React Flow mounted.
 *
 * Split out of lib/lineage.ts, which builds the nodes: the two halves change for different
 * reasons. The builders move when an artifact's shape changes; this moves when the drawing
 * has to be made to read on a different screen. It imports only types from the builders,
 * so nothing is loaded at run time in that direction.
 */
import type { LineageEdge, LineageNode, LineageNodeKind } from "./lineage";


/** Drawn width per kind. Column widths follow the longest label the column has to carry. */
export const NODE_W: Record<LineageNodeKind, number> = {
  task: 180,
  channel: 190,
  technique: 215,
  goal: 180,
  outcome: 200,
  tier: 180,
  // Wide enough that `amt_ratio_to_card_mean` sets on one line at 17px mono: a feature name
  // broken across two lines costs more vertical room than the column can spare.
  feature: 250,
  evasion: 196,
};

/** Drawn height per kind, used for row pitch. The DOM node measures a little under this. */
export const NODE_H: Record<LineageNodeKind, number> = {
  task: 84,
  channel: 84,
  technique: 92,
  goal: 84,
  outcome: 84,
  tier: 84,
  feature: 56,
  evasion: 74,
};

export interface LayoutOptions {
  /** Gap between columns. */
  gapCol?: number;
  /** Gap between two lanes of the same column. */
  gapSubcol?: number;
  /** Vertical gap between nodes in a lane. */
  gapRow?: number;
}

export interface LineageLayout {
  positions: Record<string, { x: number; y: number }>;
  /** Pixel extent of the drawing, so a caller can pick a canvas that keeps it legible. */
  width: number;
  height: number;
}

/**
 * Fixed x per lane, y stacked, every lane centred against the tallest.
 *
 * Lanes -- not columns -- are the unit, so a column can split (graph 2's frozen features
 * sit beside the movable ones rather than being lost among them) without the caller having
 * to invent fake column indices that would then break `col`-based styling.
 */
export function layoutLineage(
  nodes: LineageNode[],
  { gapCol = 62, gapSubcol = 26, gapRow = 20 }: LayoutOptions = {},
): LineageLayout {
  const lanes = new Map<string, LineageNode[]>();
  for (const n of nodes) {
    const key = `${n.col}|${n.subcol ?? 0}`;
    const arr = lanes.get(key) ?? [];
    arr.push(n);
    lanes.set(key, arr);
  }

  const keys = [...lanes.keys()].sort((a, b) => {
    const [ac, as] = a.split("|").map(Number);
    const [bc, bs] = b.split("|").map(Number);
    return ac - bc || as - bs;
  });

  const laneHeight = (arr: LineageNode[]) =>
    arr.reduce((h, n) => h + NODE_H[n.kind] + gapRow, -gapRow);
  const tallest = Math.max(0, ...keys.map((k) => laneHeight(lanes.get(k)!)));

  const positions: Record<string, { x: number; y: number }> = {};
  let x = 0;
  let prevWidth = 0;
  let prevCol: number | null = null;

  for (const key of keys) {
    const arr = lanes.get(key)!;
    const col = Number(key.split("|")[0]);
    const width = Math.max(...arr.map((n) => NODE_W[n.kind]));
    if (prevCol !== null) x += prevWidth + (col === prevCol ? gapSubcol : gapCol);

    let y = (tallest - laneHeight(arr)) / 2;
    for (const n of arr) {
      positions[n.id] = { x, y };
      y += NODE_H[n.kind] + gapRow;
    }

    prevWidth = width;
    prevCol = col;
  }

  return { positions, width: x + prevWidth, height: tallest };
}

export interface Highlight {
  nodeIds: string[];
  edgeIds: string[];
}

/**
 * Every node and edge on a path through `selectedId` -- ancestors found by walking edges
 * backward, descendants by walking forward. The caller drops everything not returned here
 * to 15% opacity, which is what turns a hairball into one traceable route.
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
