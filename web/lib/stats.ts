/**
 * Fisher's exact test, computed at build time from the committed counts.
 *
 * The significance claim is the whole point of doubling the injection corpus, so it must
 * not arrive on the page as a typed-in number. Nothing in `artifacts/` carries a p-value:
 * the red-team writers emit counts. This module derives the p from those counts during
 * `next build`, which means a judge can check the arithmetic against the same 2x2 table
 * the page shows them, and a future run that changes the counts changes the p with it.
 *
 * Cross-checked against scipy.stats.fisher_exact for the three tables this page renders.
 */

/** Lanczos approximation, g = 7, n = 9. Exact enough at the counts involved (n < 1000). */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = LANCZOS[0];
  for (let i = 1; i < 9; i += 1) x += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

const lchoose = (n: number, k: number) =>
  lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);

/**
 * Two-sided p for the 2x2 table [[a, b], [c, d]].
 *
 * Two-sided in the conventional sense: the sum of the probabilities of every table with
 * the same margins that is no more likely than the observed one. The 1e-7 slack absorbs
 * floating-point noise on tables that are exactly as likely as the observed table --
 * without it, the mirror table drops out of the sum and the p comes back visibly small.
 */
export function fisherExactTwoSided(a: number, b: number, c: number, d: number): number {
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const n = row1 + row2;
  if (row1 === 0 || row2 === 0 || col1 === 0 || col1 === n) return 1;

  const logP = (k: number) =>
    lchoose(row1, k) + lchoose(row2, col1 - k) - lchoose(n, col1);

  const observed = logP(a);
  const kMin = Math.max(0, col1 - row2);
  const kMax = Math.min(row1, col1);

  let total = 0;
  for (let k = kMin; k <= kMax; k += 1) {
    const lp = logP(k);
    if (lp <= observed + 1e-7) total += Math.exp(lp);
  }
  return Math.min(1, total);
}

/**
 * How a p-value is allowed to be written on this page.
 *
 * Never "p < 0.05" and never a bare star: the number is small enough to print, and
 * rounding it to a threshold is how a marginal result gets laundered into a significant
 * one. Below 0.001 the exact digits stop meaning anything, so that is the only bucket.
 */
export function formatP(p: number): string {
  if (p < 0.001) return "p < 0.001";
  return `p = ${p.toFixed(3)}`;
}
