/**
 * Exchange forecasting study (3.0). Public-information models only; fitted on one half, evaluated on the other.
 * Writes docs/MARKET_CALIBRATION.md. Run: npx vite-node scripts/forecast.ts
 */
import { writeFileSync } from 'node:fs';
import * as G from '../src/core/game';
import { createMatch, runUntilBlocked } from '../src/core/match';
import { Rng } from '../src/core/rng';
import { winProbabilities, Rival } from '../src/core/rivals';

export interface Row { f: number[][]; share10: number[] | null; share20: number[] | null; winner: number; prior: number[] }
export const FEATURES = ['rating', 'career win rate', 'recent form', 'Arsenal power'];

export function features(r: Rival, mean: number): number[] {
  const wr = r.career.matches ? r.career.wins / r.career.matches - 0.25 : 0;
  const form = r.form.length ? (1.5 - r.form.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, r.form.length)) / 1.5 : 0;
  const power = r.loadout.reduce((s, l) => s + l.level, 0) / 8 - 1;
  return [(r.rating - mean) / 100, wr, form, power];
}
const softmax = (s: number[]) => { const m = Math.max(...s); const e = s.map(x => Math.exp(x - m)); const t = e.reduce((a, b) => a + b, 0); return e.map(x => x / t); };
export const predict = (w: number[], f: number[][]) => softmax(f.map(x => x.reduce((s, v, k) => s + v * w[k], 0)));
const ll = (p: number[], y: number) => -Math.log(Math.max(1e-9, p[y]));
const brier = (p: number[], y: number) => p.reduce((s, x, i) => s + (x - (i === y ? 1 : 0)) ** 2, 0);
function score(rows: Row[], pred: (r: Row) => number[] | null) {
  let L = 0, B = 0, n = 0;
  for (const r of rows) { const p = pred(r); if (!p) continue; L += ll(p, r.winner); B += brier(p, r.winner); n++; }
  return { ll: L / n, brier: B / n, n };
}
function fit(rows: Row[], dims: number[]): number[] {
  const w = FEATURES.map(() => 0);
  for (let pass = 0; pass < 4; pass++) for (const k of dims) {
    let best = w[k], bestL = Infinity;
    for (let v = -3; v <= 3.001; v += 0.1) { w[k] = v; const s = score(rows, r => predict(w, r.f)).ll; if (s < bestL) { bestL = s; best = v; } }
    w[k] = best;
  }
  return w;
}
function shareModel(rows: Row[], key: 'share10' | 'share20') {
  let bestA = 1, bestL = Infinity;
  for (let a = 0.2; a <= 3.001; a += 0.1) { const s = score(rows, r => r[key] ? softmax(r[key]!.map(x => a * Math.log(Math.max(1e-6, x)))) : null).ll; if (s < bestL) { bestL = s; bestA = a; } }
  return bestA;
}

export function collect(N: number, seed = 31): Row[] {
  const g = G.newGame('Forecast', seed);
  for (let d = 0; d < 40; d++) G.advanceDay(g); // build careers/form
  const rng = new Rng(seed);
  const rows: Row[] = [];
  for (let k = 0; k < N; k++) {
    const rank = rng.int(9);
    const pool = rng.shuffle(g.rivals.filter(r => r.rank === rank));
    if (pool.length < 4) continue;
    const four = pool.slice(0, 4);
    const mean = four.reduce((s, r) => s + r.rating, 0) / 4;
    const row: Row = { f: four.map(r => features(r, mean)), share10: null, share20: null, winner: -1, prior: winProbabilities(four) };
    const m = createMatch(four.map(r => G.rivalPlayer(g, r)), rng.nextU32());
    m.aiIters = 40; runUntilBlocked(m);
    const tot = (h: { stacks: number[] }) => h.stacks.reduce((a, b) => a + b, 0);
    const h10 = m.history.find(h => h.hand === 10), h20 = m.history.find(h => h.hand === 20);
    if (h10) row.share10 = h10.stacks.map(s => s / tot(h10));
    if (h20) row.share20 = h20.stacks.map(s => s / tot(h20));
    row.winner = four.findIndex(r => r.id === m.placementIds[0]);
    G.recordWorldMatch(g, m, 2000, 0, [0, 0, 0, 0]); // careers & form keep evolving like the real world
    rows.push(row);
  }
  return rows;
}

export function study(rows: Row[]) {
  const train = rows.filter((_, i) => i % 2 === 0), test = rows.filter((_, i) => i % 2 === 1);
  const models: { name: string; s: ReturnType<typeof score>; w?: number[] }[] = [];
  models.push({ name: 'Uniform (25% each)', s: score(test, () => [0.25, 0.25, 0.25, 0.25]) });
  models.push({ name: 'Current market prior (sqrt rating strength)', s: score(test, r => r.prior) });
  const wR = fit(train, [0]); models.push({ name: 'Rating only (fitted)', s: score(test, r => predict(wR, r.f)), w: wR });
  const wAll = fit(train, [0, 1, 2, 3]); models.push({ name: 'Rating + win rate + form + Arsenal (fitted)', s: score(test, r => predict(wAll, r.f)), w: wAll });
  const a10 = shareModel(train, 'share10'); models.push({ name: `Live: chip share at hand 10 (α=${a10.toFixed(1)})`, s: score(test, r => r.share10 ? softmax(r.share10.map(x => a10 * Math.log(Math.max(1e-6, x)))) : null) });
  const a20 = shareModel(train, 'share20'); models.push({ name: `Live: chip share at hand 20 (α=${a20.toFixed(1)})`, s: score(test, r => r.share20 ? softmax(r.share20.map(x => a20 * Math.log(Math.max(1e-6, x)))) : null) });
  // reliability for the best pre-match model and the hand-20 model
  const rel = (pred: (r: Row) => number[] | null) => {
    const b = Array.from({ length: 5 }, () => ({ p: 0, y: 0, n: 0 }));
    for (const r of test) { const p = pred(r); if (!p) continue; p.forEach((x, i) => { const k = Math.min(4, Math.floor(x * 5)); b[k].p += x; b[k].y += i === r.winner ? 1 : 0; b[k].n++; }); }
    return b.map((x, i) => ({ bucket: `${i * 20}–${i * 20 + 20}%`, predicted: x.n ? x.p / x.n : 0, observed: x.n ? x.y / x.n : 0, n: x.n }));
  };
  return { models, wAll, relPre: rel(r => predict(wAll, r.f)), rel20: rel(r => r.share20 ? softmax(r.share20.map(x => a20 * Math.log(Math.max(1e-6, x)))) : null), train: train.length, test: test.length };
}

if (process.env.FORECAST_MAIN) {
  const t0 = Date.now();
  const rows = collect(Number(process.env.FORECAST_N ?? 1000));
  const st = study(rows);
  const out: string[] = ['# Minnesota Mayhem 3.0 — Exchange Forecast Calibration', '', `Generated by \`FORECAST_MAIN=1 npx vite-node scripts/forecast.ts\`. ${rows.length} fully simulated 4-player rival matches (world pre-aged 40 days so careers and form exist). Models were fitted on ${st.train} matches and evaluated **out of sample** on ${st.test}. Inputs are public information only.`, '',
    '| Model | Log loss | Brier | n | Weights |', '|---|---|---|---|---|'];
  for (const m of st.models) out.push(`| ${m.name} | ${m.s.ll.toFixed(4)} | ${m.s.brier.toFixed(4)} | ${m.s.n} | ${m.w ? m.w.map((x, i) => `${FEATURES[i]} ${x.toFixed(1)}`).join(', ') : ''} |`);
  out.push('', 'Uniform log loss = ln 4 = 1.3863; Brier = 0.7500. Lower is better.', '', '## Reliability (out of sample)', '', '| Predicted bucket | Pre-match model: predicted / observed (n) | Hand-20 chip model: predicted / observed (n) |', '|---|---|---|');
  st.relPre.forEach((b, i) => out.push(`| ${b.bucket} | ${(b.predicted * 100).toFixed(1)}% / ${(b.observed * 100).toFixed(1)}% (${b.n}) | ${(st.rel20[i].predicted * 100).toFixed(1)}% / ${(st.rel20[i].observed * 100).toFixed(1)}% (${st.rel20[i].n}) |`));
  out.push('', `_Runtime ${((Date.now() - t0) / 1000).toFixed(0)}s._`);
  writeFileSync('docs/MARKET_CALIBRATION.md', out.join('\n') + '\n');
  console.log(out.join('\n'));
}
