/**
 * The detector, evaluated in plain JavaScript.
 *
 * This replaced onnxruntime-web. Scoring a 400-tree gradient-boosted ensemble is 400
 * walks down a binary tree comparing a float to a threshold -- it does not need a
 * general-purpose inference runtime, and shipping one cost 3.2MB of WASM on the wire and
 * 8.8 seconds to a first score on a 4Mbps connection. The exported arrays are 174KB
 * gzipped and score synchronously with nothing to await.
 *
 * This is the same model, not a reimplementation of it: scripts/check_tree_port.py scores
 * the whole demo corpus through ONNX and through this walker and fails on any
 * disagreement beyond float32 rounding.
 */

export interface TreeModel {
  objective: string;
  base_margin: number;
  features: string[];
  n_trees: number;
  n_nodes: number;
  roots: number[];
  split_idx: number[];
  split_cond: number[];
  left: number[];
  right: number[];
  default_left: number[];
}

/**
 * One forward pass. Returns p(fraud).
 *
 * Math.fround at each accumulation because XGBoost sums leaf weights in float32; letting
 * JavaScript accumulate in float64 drifts from the trained model by more than the fourth
 * decimal on deep ensembles, which is exactly where a demo starts quietly disagreeing
 * with the paper.
 */
export function scoreTrees(m: TreeModel, x: number[]): number {
  let margin = Math.fround(m.base_margin);

  for (let t = 0; t < m.roots.length; t += 1) {
    let i = m.roots[t];
    while (m.left[i] !== -1) {
      const v = x[m.split_idx[i]];
      // XGBoost sends missing values down the `default_left` branch; everything else
      // takes the left branch on a strict less-than, as in the trained splits.
      const goLeft = Number.isNaN(v) ? m.default_left[i] === 1 : v < m.split_cond[i];
      i = goLeft ? m.left[i] : m.right[i];
    }
    margin = Math.fround(margin + m.split_cond[i]);
  }

  return 1 / (1 + Math.exp(-margin));
}

/** Score from a feature map, in the model's own column order. */
export function scoreRow(m: TreeModel, values: Record<string, number>): number {
  const x = new Array<number>(m.features.length);
  for (let i = 0; i < m.features.length; i += 1) x[i] = values[m.features[i]] ?? Number.NaN;
  return scoreTrees(m, x);
}
