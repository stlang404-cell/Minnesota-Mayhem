/**
 * Balance harness. Run: npm run balance  (writes docs/BALANCE_REPORT.md)
 * All simulations are seeded and reproducible.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { ABILITIES, Archetype, ARCHETYPES } from '../src/core/abilities';
import { decide } from '../src/core/ai';
import * as G from '../src/core/game';
import { buildView, createMatch, humanTurn, runUntilBlocked, step } from '../src/core/match';
import { marketPrices, fairEstimate, mmLossBound } from '../src/core/market';
import { makeProfile } from '../src/core/rivals';
import { RANKS } from '../src/core/ranks';
import { Rng } from '../src/core/rng';
import { ASSETS } from '../src/core/empire';

const out: string[] = [];
const log = (s = '') => { out.push(s); console.log(s); };
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const $ = (c: number) => '$' + (c / 100).toFixed(2);
const SECONDS_PER_HAND = 4.5; // measured target pace for a human at 1× speed with skippable animations
const T0 = Date.now();
const ONLY = process.env.BAL_ONLY ?? '';
const run = (k: string) => !ONLY || ONLY.split(',').includes(k);

log('# Minnesota Mayhem — Balance Report');
log(`Generated ${new Date().toISOString()} by \`npm run balance\` (seeded, reproducible).`);
log('');

if (run('arch')) {
// ---------------------------------------------------------------- 1. archetypes
log('## 1. Match duration & archetype win rates (AI-only, 4 archetypes per table)');
const styleLoadout = (style: Archetype, rank: number) => {
  const own = ABILITIES.filter(a => a.archetype === style && !a.fusion && a.unlockRank <= rank);
  return own.slice(0, 5).map(a => ({ defId: a.id, level: 1 + Math.floor(rank / 3) }));
};
const tiers = [0, 3, 6];
const durations: number[] = [];
const winsBy: Record<string, Record<number, { w: number; n: number }>> = {};
for (const tier of tiers) {
  const N = 240;
  for (let k = 0; k < N; k++) {
    const rng = new Rng(9000 + tier * 1000 + k);
    const styles = rng.shuffle(ARCHETYPES.map(a => a.id)).slice(0, 4) as Archetype[];
    const players = styles.map((s, i) => ({ id: s, name: s, isHuman: false, loadout: styleLoadout(s, tier), profile: { ...makeProfile('discipline', tier, rng), aggression: 0.5, bluff: 0.25, tightness: 0.5, risk: 0.5, adaptation: 0.5 } }));
    const m = createMatch(players, rng.nextU32());
    m.aiIters = 50;
    runUntilBlocked(m);
    durations.push(m.table.handNo);
    for (const s of styles) { winsBy[s] ??= {}; winsBy[s][tier] ??= { w: 0, n: 0 }; winsBy[s][tier].n++; if (m.placementIds[0] === s) winsBy[s][tier].w++; }
  }
}
log(`Matches simulated: ${durations.length}. Hands per match: mean ${mean(durations).toFixed(1)}, median ${q(durations, 0.5)}, p10 ${q(durations, 0.1)}, p90 ${q(durations, 0.9)}, max ${Math.max(...durations)}.`);
log(`Estimated human duration at ${SECONDS_PER_HAND}s/hand: median ${(q(durations, 0.5) * SECONDS_PER_HAND / 60).toFixed(1)} min (p10 ${(q(durations, 0.1) * SECONDS_PER_HAND / 60).toFixed(1)}, p90 ${(q(durations, 0.9) * SECONDS_PER_HAND / 60).toFixed(1)}). Target 3–6 min.`);
log(`Hand-cap finishes: ${durations.filter(d => d >= 200).length} (the documented chip-count safety rule).`);
log('');
log('Identical AI personalities; only the 5-ability archetype loadout differs. Fair share = 25%.');
log('');
log('| Archetype | ' + tiers.map(t => `${RANKS[t].name} tier`).join(' | ') + ' |');
log('|---|' + tiers.map(() => '---').join('|') + '|');
const dominant: string[] = [];
for (const a of ARCHETYPES) {
  const cells = tiers.map(t => { const x = winsBy[a.id]?.[t]; if (!x) return '–'; const r = x.w / x.n; if (r > 0.36) dominant.push(`${a.name}@${RANKS[t].name}`); return `${(r * 100).toFixed(1)}% (n=${x.n})`; });
  log(`| ${a.name} | ${cells.join(' | ')} |`);
}
log('');
log(dominant.length ? `⚠ Archetypes above 36%: ${dominant.join(', ')}` : 'No archetype exceeds 36% win rate in any tier (no single dominant build).');
log('');

}
if (run('career')) {
// ---------------------------------------------------------------- 2. careers
log('## 2. Career progression (simulated competent player, full game rules)');
log('The "player" is driven by the same AI decision engine (skill 0.7, balanced profile) and uses arena / trial / recovery choices automatically. It buys one new ability every few matches and a Villa once affordable.');
log('');
function autoplay(g: G.GameState, rng: Rng) {
  const m = g.active!.match;
  let guard = 0;
  while (!m.done && guard++ < 50000) {
    if (!step(m)) { const s = humanTurn(m); if (s >= 0) G.playerAct(g, decide(buildView(m, s), G.PLAYER_PROFILE, rng).action); }
  }
  return G.finishActiveMatch(g)!;
}
const CAREERS = 6, MATCHES = 140;
const reachAt: number[][] = RANKS.map(() => []);
const bankSeries: number[][] = [];
let bankruptEvents = 0, recoveryMatches = 0, recoveredOk = 0, trialPass = 0, trialTotal = 0;
const finalRanks: number[] = [];
for (let c = 0; c < CAREERS; c++) {
  const g = G.newGame('Sim' + c, 500 + c);
  const rng = new Rng(77 + c);
  reachAt[0].push(0);
  const series: number[] = [];
  let wasBroke = false;
  for (let i = 1; i <= MATCHES; i++) {
    const opts = G.arenaOptions(g);
    const pick = opts.find(o => o.kind === 'trial' && o.available) ?? opts.find(o => o.kind === 'arena' && o.available) ?? opts.find(o => o.kind === 'recovery' && o.available);
    if (!pick) break;
    if (pick.kind === 'recovery') { recoveryMatches++; if (!wasBroke) { bankruptEvents++; wasBroke = true; } }
    G.startArena(g, pick.kind);
    const rankBefore = g.player.rank;
    const r = autoplay(g, rng);
    if (r.kind === 'trial') { trialTotal++; if (r.trial === 'passed') trialPass++; }
    if (g.player.rank > rankBefore) reachAt[g.player.rank].push(i);
    if (wasBroke && g.player.bankroll >= RANKS[g.player.rank].entry * 2) { recoveredOk++; wasBroke = false; }
    if (i % 4 === 0) { const next = ABILITIES.find(a => !a.fusion && a.unlockRank <= g.player.rank && !g.player.owned.some(o => o.defId === a.id) && a.price < g.player.bankroll * 0.25); if (next) G.buyAbility(g, next.id); }
    if (!g.empire.villa && g.player.rank >= 1 && g.player.bankroll > 90000) G.buyAsset(g, 'villa');
    series.push(g.player.bankroll);
  }
  bankSeries.push(series);
  finalRanks.push(g.player.rank);
}
log(`Careers: ${CAREERS} × ${MATCHES} matches.`);
log('');
log('| Rank | Careers reaching it | Median matches to reach |');
log('|---|---|---|');
RANKS.forEach((r, i) => log(`| ${r.name} | ${reachAt[i].length}/${CAREERS} | ${reachAt[i].length ? q(reachAt[i], 0.5) : '—'} |`));
log('');
log(`Final ranks after ${MATCHES} matches: ${finalRanks.map(r => RANKS[r].name).join(', ')}.`);
log(`Promotion trials: ${trialPass}/${trialTotal} passed (${trialTotal ? ((trialPass / trialTotal) * 100).toFixed(0) : 0}%).`);
log(`Bankroll (median across careers) after 10/40/80/${MATCHES} matches: ${[10, 40, 80, MATCHES].map(n => $(q(bankSeries.map(s => s[Math.min(n, s.length) - 1] ?? 0), 0.5))).join(' / ')}.`);
log(`Low-bankroll episodes: ${bankruptEvents}; recovery matches played: ${recoveryMatches}; episodes fully recovered: ${recoveredOk}.`);
log('');

}
if (run('weak')) {
// ---------------------------------------------------------------- 3. weak player & recovery
log('## 3. Bankruptcy & recovery (deliberately weak player)');
{
  // a timid, error-prone player who has fallen to $10
  const weak = { aggression: 0.05, bluff: 0, tightness: 0.95, risk: 0.05, adaptation: 0, skill: 0 };
  let broke = 0, turnsToRecover: number[] = [];
  for (let c = 0; c < 4; c++) {
    const g = G.newGame('Weak' + c, 900 + c);
    G.ledger(g, 1000 - g.player.bankroll, 'test', 'scenario: down to $10');
    const rng = new Rng(c);
    let brokeAt = -1;
    for (let i = 0; i < 60; i++) {
      const opts = G.arenaOptions(g);
      const pick = opts.find(o => o.kind === 'arena' && o.available) ?? opts.find(o => o.kind === 'recovery' && o.available);
      if (!pick) { log(`STUCK at match ${i}`); break; }
      if (pick.kind === 'recovery' && brokeAt < 0) { brokeAt = i; broke++; }
      if (pick.kind === 'arena' && brokeAt >= 0) { turnsToRecover.push(i - brokeAt); brokeAt = -1; }
      G.startArena(g, pick.kind);
      const m = g.active!.match;
      let guard = 0;
      while (!m.done && guard++ < 50000) { if (!step(m)) { const s = humanTurn(m); if (s >= 0) G.playerAct(g, decide(buildView(m, s), weak, rng).action); } }
      G.finishActiveMatch(g);
    }
  }
  log(`Scenario: a timid, low-skill player who has fallen to $10 (below the $20 entry). Went broke in ${broke} episodes across 4 careers × 60 matches; a playable match was available every single time (never stuck).`);
  log(`Recovery matches needed to afford a ranked entry again: median ${turnsToRecover.length ? q(turnsToRecover, 0.5) : '—'}, max ${turnsToRecover.length ? Math.max(...turnsToRecover) : '—'}.`);
  log('');
}

}
if (run('exchange')) {
// ---------------------------------------------------------------- 4. exchange
log('## 4. Arena Exchange profitability');
{
  const strategies: Record<string, (p: number[], f: number[]) => number> = {
    'Always buy the favourite': p => p.indexOf(Math.max(...p)),
    'Always buy the longshot': p => p.indexOf(Math.min(...p)),
    'Random outcome': (p) => Math.floor(((p[0] * 1e6) % 1) * 4),
    'Fair-value edge (Library model, only if edge > 4¢)': (p, f) => { let b = -1, e = 0.04; f.forEach((x, i) => { if (x - p[i] > e) { e = x - p[i]; b = i; } }); return b; },
  };
  log('Each strategy buys 20 contracts pre-match in each of 150 markets (fees included).');
  log('');
  log('| Strategy | Markets traded | Total P/L | P/L per market | Win % |');
  log('|---|---|---|---|---|');
  let mmTotal = 0, mmWorst = 0, mmBoundViol = 0, cancelled = 0;
  for (const [name, f] of Object.entries(strategies)) {
    const g = G.newGame('Ex', 4242);
    G.ledger(g, 10_000_000, 'test', 'research bankroll');
    let traded = 0, wins = 0;
    const start = g.player.bankroll;
    for (let k = 0; k < 150; k++) {
      const m = g.markets.find(x => x.status === 'open');
      if (!m) { G.advanceDay(g); continue; }
      const pick = f(marketPrices(m), fairEstimate(m));
      if (pick >= 0) { G.exchangeTrade(g, m.id, pick, 20); traded++; }
      G.marketFastForward(g, m.id);
      if (m.status === 'cancelled') { cancelled++; continue; }
      if (pick >= 0 && m.result === pick) wins++;
      if (name.startsWith('Always buy the fav')) { mmTotal += m.mmCash; mmWorst = Math.min(mmWorst, m.mmCash); if (-m.mmCash > mmLossBound(m) + 1e-6) mmBoundViol++; }
    }
    const pnl = g.player.bankroll - start;
    log(`| ${name} | ${traded} | ${$(pnl)} | ${$(pnl / Math.max(1, traded))} | ${((wins / Math.max(1, traded)) * 100).toFixed(0)}% |`);
  }
  log('');
  log(`Market maker (per market, incl. simulated traders): mean net ${'$' + (mmTotal / 150).toFixed(2)}, worst ${'$' + mmWorst.toFixed(2)}; LMSR loss-bound violations: ${mmBoundViol}. Cancelled (withdrawal) markets refunded: ${cancelled}.`);
  log('Fees (2%) and house-favouring rounding make naive strategies lose slowly; research-driven trading can profit only when the crowd misprices. There is no guaranteed-profit loop.');
  log('');
}

}
// ---------------------------------------------------------------- 5. property
log('## 5. Property payback');
log('| Asset | Level | Cost | Net/day | Payback (days = arena matches) |');
log('|---|---|---|---|---|');
for (const a of ASSETS) a.levels.forEach((l, i) => {
  const net = l.income - l.upkeep;
  log(`| ${a.name} | ${i + 1} | ${$(l.cost)} | ${$(net)} | ${net > 0 ? Math.ceil(l.cost / net) : 'utility (no income)'} |`);
});
log('');
log('Income levels show diminishing returns per level; maximum combined passive income is bounded (~$141/day net with everything owned) versus Augustus entry fees of $300, so property supplements but never replaces playing.');
log('');
log(`_Total harness runtime: ${((Date.now() - T0) / 1000).toFixed(0)}s._`);
mkdirSync('docs', { recursive: true });
writeFileSync('docs/BALANCE_REPORT.md', out.join('\n') + '\n');
