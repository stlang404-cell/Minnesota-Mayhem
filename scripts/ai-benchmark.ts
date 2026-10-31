import { decide, decideV1, AIProfile } from '../src/core/ai';
import { act, buildView, createMatch, humanTurn, step, MatchPlayer } from '../src/core/match';
import { legalActions } from '../src/core/poker';
import { Rng } from '../src/core/rng';

export type Policy = 'v3' | 'v2' | 'v1' | 'station' | 'rock' | 'maniac' | 'random';
import { emptyStats, PublicStats } from '../src/core/ai';
const PROF: AIProfile = { aggression: 0.5, bluff: 0.25, tightness: 0.5, risk: 0.5, adaptation: 0.6, skill: 0.6 };

export interface BenchResult { policy: Policy; wins: number; n: number; avgPlace: number; msPerDecision: number; bluffRate: number; decisions: number }

/** Two seats of `a` vs two seats of `b` (seats rotated), no Arsenal, N matches. */
export function headToHead(a: Policy, b: Policy, N: number, seed = 1, memory = false): [BenchResult, BenchResult] {
  const rep: Record<string, PublicStats> = {};
  const res: Record<string, BenchResult> = {};
  for (const [p, tag] of [[a, 'A'], [b, 'B']] as const) res[p + tag] = { policy: p, wins: 0, n: 0, avgPlace: 0, msPerDecision: 0, bluffRate: 0, decisions: 0 };
  const time: Record<string, number> = {};
  const bluffs: Record<string, number> = {};
  for (let k = 0; k < N; k++) {
    const pols: Policy[] = k % 2 ? [a, b, a, b] : [b, a, b, a];
    const isA = pols.map((_, i) => (k % 2 ? i % 2 === 0 : i % 2 === 1));
    const keys = pols.map((p, i) => p + (isA[i] ? 'A' : 'B'));
    const ids = pols.map((p, i) => `${p}${isA[i] ? 'A' : 'B'}${Math.floor(i / 2)}`);
    const players: MatchPlayer[] = pols.map((p, i) => ({ id: 'p' + i, name: p + i, isHuman: !(p === 'v1' || p === 'v2' || p === 'v3'), loadout: [], profile: PROF, aiVersion: p === 'v1' ? 1 : p === 'v2' ? 2 : 3, reputation: memory ? rep[ids[i]] : undefined, familiarity: memory ? { p0: 10, p1: 10, p2: 10, p3: 10 } : undefined }));
    const m = createMatch(players, 50000 + seed * 7919 + k);
    m.aiIters = 60;
    const rng = new Rng(k + seed);
    let guard = 0;
    while (!m.done && guard++ < 100000) {
      const s = m.table.toAct;
      const key = s >= 0 ? keys[s] : '';
      const t0 = performance.now();
      if (step(m)) { if (s >= 0 && m.table.handNo && key) { time[key] = (time[key] ?? 0) + performance.now() - t0; res[key].decisions++; } continue; }
      const h = humanTurn(m);
      if (h < 0) break;
      const L = legalActions(m.table, h);
      const pol = pols[h];
      let a2: any;
      if (pol === 'station') a2 = L.canCheck ? { type: 'check' } : { type: 'call' };
      else if (pol === 'maniac') a2 = L.canRaise ? { type: 'raise', amount: Math.min(L.maxRaiseTo, Math.max(L.minRaiseTo, m.table.currentBet * 3 || m.table.level.bb * 3)) } : { type: 'call' };
      else if (pol === 'random') { const r = rng.next(); a2 = r < 0.3 ? (L.canCheck ? { type: 'check' } : { type: 'fold' }) : r < 0.75 ? (L.canCheck ? { type: 'check' } : { type: 'call' }) : L.canRaise ? { type: 'raise', amount: L.minRaiseTo } : { type: 'call' }; }
      else { // rock: decide with tight profile
        const d = decideV1(buildView(m, h), { ...PROF, tightness: 0.95, aggression: 0.3, bluff: 0, risk: 0.2 }, rng);
        a2 = d.action;
      }
      try { act(m, h, a2); } catch { act(m, h, L.canCheck ? { type: 'check' } : { type: 'fold' }); }
      res[keys[h]].decisions++;
    }
    if (memory) m.players.forEach((_, i) => { const r = (rep[ids[i]] ??= emptyStats()); for (const k of Object.keys(r) as (keyof PublicStats)[]) r[k] += m.stats[i][k] ?? 0; });
    m.placementIds.forEach((id, place) => { const key = keys[+id.slice(1)]; res[key].n++; res[key].avgPlace += place; if (place === 0) res[key].wins++; });
    for (const e of m.table.log) if ((e.kind === 'bet' || e.kind === 'raise') && e.street !== 'preflop') { const key = keys[e.seat]; bluffs[key] = (bluffs[key] ?? 0) + 1; }
  }
  const out = Object.entries(res).map(([k, r]) => ({ ...r, avgPlace: r.avgPlace / Math.max(1, r.n) + 1, msPerDecision: (time[k] ?? 0) / Math.max(1, r.decisions), bluffRate: (bluffs[k] ?? 0) / Math.max(1, r.decisions) }));
  return [out[0], out[1]];
}
/** 95% interval for a proportion (normal approximation). */
export function ci(k: number, n: number): [number, number] { const p = k / Math.max(1, n); const h = 1.96 * Math.sqrt(p * (1 - p) / Math.max(1, n)); return [p - h, p + h]; }
if (process.env.BENCH_MAIN) {
  for (const opp of ['v1', 'station', 'rock', 'maniac', 'random'] as Policy[]) {
    const [x, y] = headToHead('v2', opp, Number(process.env.BENCH_N ?? 200));
    console.log(`v2 vs ${opp}: v2 wins ${(x.wins / x.n * 50).toFixed(1)}%/seat-pair share=${(x.wins / (x.wins + y.wins) * 100).toFixed(1)}% avgPlace ${x.avgPlace.toFixed(2)} vs ${y.avgPlace.toFixed(2)}; ms/dec v2 ${x.msPerDecision.toFixed(2)}`);
  }
}
