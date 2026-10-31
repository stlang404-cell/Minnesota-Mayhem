/**
 * Logarithmic Market Scoring Rule automated market maker.
 *   C(q) = b · ln( Σ exp(q_i / b) )
 *   p_i  = exp(q_i / b) / Σ_j exp(q_j / b)
 * Implemented with log-sum-exp for numerical stability.
 * Worst-case market-maker loss when initialised at q0 is  b · ln(1 / min p0).
 */
export function lse(q: number[], b: number): number {
  const m = Math.max(...q.map(x => x / b));
  let s = 0;
  for (const x of q) s += Math.exp(x / b - m);
  return m + Math.log(s);
}
export function cost(q: number[], b: number): number { return b * lse(q, b); }
export function prices(q: number[], b: number): number[] {
  const m = Math.max(...q.map(x => x / b));
  const e = q.map(x => Math.exp(x / b - m));
  const s = e.reduce((a, c) => a + c, 0);
  return e.map(x => x / s);
}
/** Dollar cost of changing outcome i by delta shares (negative delta = selling). */
export function tradeCost(q: number[], b: number, i: number, delta: number): number {
  const q2 = q.slice(); q2[i] += delta;
  return cost(q2, b) - cost(q, b);
}
/** Initial share vector reproducing given prior probabilities. */
export function initialQ(p: number[], b: number): number[] {
  const q = p.map(x => b * Math.log(Math.max(1e-6, x)));
  const mn = Math.min(...q);
  return q.map(x => x - mn);
}
/** Largest integer number of shares purchasable with `dollars` (before fees). */
export function sharesForBudget(q: number[], b: number, i: number, dollars: number): number {
  let lo = 0, hi = 1;
  while (tradeCost(q, b, i, hi) < dollars && hi < 1e7) hi *= 2;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (tradeCost(q, b, i, mid) <= dollars) lo = mid; else hi = mid; }
  return lo;
}
/** Shares to buy to move price of i to target (bounded). */
export function sharesToPrice(q: number[], b: number, i: number, target: number): number {
  const p = prices(q, b);
  const t = Math.max(0.005, Math.min(0.995, target));
  if (Math.abs(p[i] - t) < 1e-9) return 0;
  // p_i = e_i / (e_i + R)  -> e_i' = t R / (1 - t)
  const others = q.reduce((s, x, j) => j === i ? s : s + Math.exp((x - q[i]) / b), 0); // R / e_i
  const ratio = (t / (1 - t)) / (1 / others); // e_i'/e_i
  return b * Math.log(ratio);
}
