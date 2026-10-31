import { Card, rankOf, suitOf, RANK_CHARS } from './cards';
import { evaluate } from './handEval';
import { Rng, mix } from './rng';

/** Chen-formula strength for two hole cards (used to model public-information ranges). */
export function chen(a: Card, b: Card): number {
  let r1 = rankOf(a), r2 = rankOf(b);
  if (r2 > r1) [r1, r2] = [r2, r1];
  const base = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10];
  let s = base[r1];
  if (r1 === r2) return Math.max(5, s * 2);
  if (suitOf(a) === suitOf(b)) s += 2;
  const gap = r1 - r2 - 1;
  s -= [0, 1, 2, 4][Math.min(gap, 3)] + (gap >= 4 ? 1 : 0);
  if (gap <= 1 && r1 < 10) s += 1;
  return s;
}

/** Percentile (0 = best, 1 = worst) of every 2-card combo by Chen score. */
const PCT = new Float32Array(52 * 52);
(() => {
  const combos: [number, number, number][] = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) combos.push([a, b, chen(a, b)]);
  combos.sort((x, y) => y[2] - x[2]);
  combos.forEach(([a, b], i) => { const p = i / combos.length; PCT[a * 52 + b] = p; PCT[b * 52 + a] = p; });
})();
export function handPercentile(a: Card, b: Card): number { return PCT[a * 52 + b]; }

export function handClass(a: Card, b: Card): string {
  let r1 = rankOf(a), r2 = rankOf(b);
  if (r2 > r1) [r1, r2] = [r2, r1];
  const s = r1 === r2 ? '' : suitOf(a) === suitOf(b) ? 's' : 'o';
  return RANK_CHARS[r1] + RANK_CHARS[r2] + s;
}

/**
 * Monte Carlo equity using ONLY the hero's hole cards and the public board.
 * Opponent cards are sampled from the unseen cards — never from the real deck.
 * `ranges[i]` optionally restricts opponent i to the top fraction of hands.
 */
export function equityMC(hole: Card[], board: Card[], nOpp: number, iters: number, rng: Rng, ranges?: number[]): number {
  if (nOpp <= 0) return 1;
  const known = new Uint8Array(52);
  for (const c of hole) known[c] = 1;
  for (const c of board) known[c] = 1;
  const unseen: Card[] = [];
  for (let c = 0; c < 52; c++) if (!known[c]) unseen.push(c);
  let total = 0;
  const need = 5 - board.length;
  const pool = unseen.slice();
  const hero = new Array<Card>(7);
  const opp = new Array<Card>(7);
  for (let it = 0; it < iters; it++) {
    // partial Fisher-Yates over the pool
    let n = pool.length;
    const draw = () => { const j = rng.int(n); const c = pool[j]; pool[j] = pool[n - 1]; pool[n - 1] = c; n--; return c; };
    const oppHoles: Card[][] = [];
    for (let o = 0; o < nOpp; o++) {
      let h1 = draw(), h2 = draw();
      const cut = ranges?.[o];
      if (cut !== undefined && cut < 0.99) {
        let tries = 0;
        while (handPercentile(h1, h2) > cut && tries < 12) {
          n += 2; // return them
          h1 = draw(); h2 = draw(); tries++;
        }
      }
      oppHoles.push([h1, h2]);
    }
    const runout: Card[] = [];
    for (let k = 0; k < need; k++) runout.push(draw());
    const fullBoard = board.concat(runout);
    hero.length = 0; hero.push(hole[0], hole[1], ...fullBoard);
    const hs = evaluate(hero);
    let best = -1, ties = 0, heroBest = true;
    for (const oh of oppHoles) {
      opp.length = 0; opp.push(oh[0], oh[1], ...fullBoard);
      const s = evaluate(opp);
      if (s > hs) { heroBest = false; break; }
      if (s === hs) ties++;
      best = Math.max(best, s);
    }
    if (heroBest) total += 1 / (1 + ties);
  }
  return total / iters;
}

const preflopCache = new Map<string, number>();
/** Deterministic cached preflop equity vs N random opponents. */
export function preflopEquity(hole: Card[], nOpp: number): number {
  const key = handClass(hole[0], hole[1]) + nOpp;
  const hit = preflopCache.get(key);
  if (hit !== undefined) return hit;
  // canonical representative cards for the class
  const r1 = rankOf(hole[0]), r2 = rankOf(hole[1]);
  const suited = suitOf(hole[0]) === suitOf(hole[1]);
  const a = r1 * 4, b = r2 * 4 + (suited ? 0 : 1);
  const eq = equityMC([a, b], [], nOpp, 500, new Rng(mix('pf', key)));
  preflopCache.set(key, eq);
  return eq;
}
