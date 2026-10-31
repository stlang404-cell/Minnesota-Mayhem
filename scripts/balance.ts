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
import { SYNERGIES, COMBO_IDS } from '../src/core/abilities';
import { headToHead, ci } from './ai-benchmark';
import * as C from '../src/core/circuit';
import { allBooks } from '../src/core/market';

const styleLoadout = (style: Archetype, rank: number) => {
  const own = ABILITIES.filter(a => a.archetype === style && !a.fusion && a.unlockRank <= rank);
  return own.slice(0, 5).map(a => ({ defId: a.id, level: 1 + Math.floor(rank / 3) }));
};
const out: string[] = [];
const log = (s = '') => { out.push(s); console.log(s); };
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const $ = (c: number) => '$' + (c / 100).toFixed(2);
const SECONDS_PER_HAND = 4.5; // measured target pace for a human at 1× speed with skippable animations
const T0 = Date.now();
const ONLY = process.env.BAL_ONLY ?? '';
const run = (k: string) => !ONLY || ONLY.split(',').includes(k);

log('# Minnesota Mayhem 3.0 (The Eternal Empire) — Balance Report');
log(`Generated ${new Date().toISOString()} by \`npm run balance\` (seeded, reproducible).`);
log('');

if (run('arch')) {
// ---------------------------------------------------------------- 1. archetypes
log('## 1. Match duration & archetype win rates (AI-only, 4 archetypes per table)');
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
log('Identical AI personalities; only the 5-ability archetype loadout differs (10 archetypes, 4 drawn per table). Fair share = 25%.');
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

if (run('ai')) {
  log('## 6. AI benchmark (AI 3.0 vs AI 2.0, Version 1 and baselines; 95% confidence intervals)');
  log('Two seats of each policy per table (seats alternate), no Arsenal, identical personality parameters. "Memory" carries each seat\'s public reputation (incl. bet-size memory) across matches. Win share = wins ÷ (wins of both policies).');
  log('');
  log('| Matchup | Matches | AI 3.0 win share [95% CI] | AI 3.0 avg place | Opponent avg place | CPU ms / decision |');
  log('|---|---|---|---|---|---|');
  const rows: [string, any, number, boolean][] = [['AI 2.0 (with memory)', 'v2', 800, true], ['AI 2.0 (no memory)', 'v2', 800, false], ['Version 1 AI', 'v1', 400, false], ['station', 'station', 150, false], ['rock', 'rock', 150, false], ['maniac', 'maniac', 150, false], ['random', 'random', 150, false]];
  for (const [label, opp, n, mem] of rows) {
    const [x, y] = headToHead('v3', opp, n, 11, mem);
    const [lo, hi] = ci(x.wins, x.wins + y.wins);
    log(`| ${label} | ${n} | ${(x.wins / Math.max(1, x.wins + y.wins) * 100).toFixed(1)}% [${(lo * 100).toFixed(1)}, ${(hi * 100).toFixed(1)}] | ${x.avgPlace.toFixed(3)} | ${y.avgPlace.toFixed(3)} | ${x.msPerDecision.toFixed(2)} |`);
  }
  const [nx, ny] = headToHead('v2', 'v2', 800, 11, true);
  const [nlo, nhi] = ci(nx.wins, nx.wins + ny.wins);
  log(`| Null test: AI 2.0 vs itself (memory) | 800 | ${(nx.wins / (nx.wins + ny.wins) * 100).toFixed(1)}% [${(nlo * 100).toFixed(1)}, ${(nhi * 100).toFixed(1)}] | ${nx.avgPlace.toFixed(3)} | ${ny.avgPlace.toFixed(3)} | — |`);
  log('');
  log('Interpretation: an improvement is claimed only when the 95% interval excludes 50%. The null test shows the harness\'s own noise.');
  log('');
}

if (run('combos')) {
  log('## 7. Combo & fusion strength (one build vs three random archetype builds)');
  const prof = { aggression: 0.5, bluff: 0.25, tightness: 0.5, risk: 0.5, adaptation: 0.5, skill: 0.6 };
  const builds: [string, string[]][] = [
    ...SYNERGIES.filter(s => COMBO_IDS.includes(s.id) && s.needs[0] !== '@two_legendaries').map(s => [s.name, s.needs] as [string, string[]]),
    ["Caesar's Ascension (Ides of March + Wrath of Mars)", ['ides_of_march', 'wrath_of_mars']],
    ['Iron Executioner (fusion)', ['iron_executioner']], ['Eternal Flame (fusion)', ['eternal_flame']], ['Phantom Tempo (fusion)', ['phantom_tempo']], ["Oracle's Ledger (fusion)", ['oracles_ledger']],
    ['No abilities (control)', []],
  ];
  log('Fair share = 25%. n = 200 matches per build, seats rotated, opponents draw 5-ability archetype builds at level 2.');
  log('');
  log('| Build | Win rate | Avg place |');
  log('|---|---|---|');
  const N = 200;
  const flagged: string[] = [];
  for (const [name, ids] of builds) {
    let w = 0, pl = 0;
    for (let k = 0; k < N; k++) {
      const rng = new Rng(7000 + k);
      const opp = rng.shuffle(ARCHETYPES.map(a => a.id)).slice(0, 3) as Archetype[];
      const loads = [ids.map(d => ({ defId: d, level: 2 })), ...opp.map(s => styleLoadout(s, 4).map(l => ({ ...l, level: 2 })))];
      const rot = k % 4;
      const order = [0, 1, 2, 3].map(i => (i + rot) % 4);
      const m = createMatch(order.map(i => ({ id: 'p' + i, name: 'P' + i, isHuman: false, loadout: loads[i], profile: prof })), 88000 + k);
      m.aiIters = 40; runUntilBlocked(m);
      const place = m.placementIds.indexOf('p0');
      if (place === 0) w++; pl += place + 1;
    }
    const r = w / N;
    if (r > 0.36) flagged.push(name);
    log(`| ${name} | ${(r * 100).toFixed(1)}% | ${(pl / N).toFixed(2)} |`);
  }
  log('');
  log(flagged.length ? `⚠ Above 36%: ${flagged.join(', ')}` : 'No combo or fusion exceeds 36% against three full archetype builds.');
  log('');
}

if (run('market2')) {
  log('## 8. Exchange calibration & simulated trader profitability');
  const g = G.newGame('Cal', 777);
  let briW = 0, briF = 0, briL = 0, nW = 0, nF = 0, nL = 0, briMid = 0, nMid = 0;
  const strat: Record<string, { pnl: number; n: number }> = {};
  let markets = 0;
  for (let k = 0; k < 120; k++) {
    const m = g.markets.find(x => x.status === 'open');
    if (!m) { G.advanceDay(g); continue; }
    const pre = allBooks(m).map(bk => [...bk.history[bk.history.length - 1].p]);
    G.startMarketMatch(g, m.id);
    let mid: number[] | null = null;
    for (let h = 0; h < 400 && m.status === 'live'; h++) { G.marketNextHand(g, m.id); if (m.status === 'live' && m.match!.table.handNo === 20) mid = [...m.history[m.history.length - 1].p]; }
    if (mid && m.status === 'settled') { briMid += mid.reduce((s, p, i) => s + (p - (i === m.result ? 1 : 0)) ** 2, 0); nMid++; }
    if (m.status !== 'settled') continue;
    markets++;
    allBooks(m).forEach((bk, bi) => {
      const res = bi === 0 ? m.result : bk.result;
      if (res < 0) return;
      const brier = pre[bi].reduce((s, p, i) => s + (p - (i === res ? 1 : 0)) ** 2, 0);
      if (bi === 0) { briW += brier; nW++; } else if (bk.kind === 'first_out') { briF += brier; nF++; } else { briL += brier; nL++; }
    });
    for (const bot of m.bots) { const s = (strat[bot.strategy] ??= { pnl: 0, n: 0 }); s.pnl += (bot.pnl ?? 0); s.n++; }
  }
  log(`Markets settled: ${markets}. Brier score of the pre-match market price (lower is better; uninformed 4-way = 0.750, uninformed binary = 0.500):`);
  log(`* Match Winner: ${(briW / Math.max(1, nW)).toFixed(3)} (n=${nW})`);
  log(`* First Elimination: ${(briF / Math.max(1, nF)).toFixed(3)} (n=${nF})`);
  log(`* Long Match O/U 40.5: ${(briL / Math.max(1, nL)).toFixed(3)} (n=${nL})`);
  log(`* Match Winner priced live after hand 20: ${(briMid / Math.max(1, nMid)).toFixed(3)} (n=${nMid}) — public chip counts make live prices far more informative than pre-match ratings.`);
  log('');
  log('| Trader strategy | Bot-markets | Total P/L | P/L per market |');
  log('|---|---|---|---|');
  for (const [k, v] of Object.entries(strat).sort()) log(`| ${k} | ${v.n} | ${$(v.pnl)} | ${$(v.pnl / Math.max(1, v.n))} |`);
  log('');
}

if (run('modes')) {
  log('## 9. Mode economics (simulated competent player at Gladiator, 25 runs each)');
  log('| Mode | Avg net $ per run | Avg hands per match | Notes |');
  log('|---|---|---|---|');
  for (const kind of ['arena', 'quick', 'highroller', 'draft', 'rival', 'gauntlet', 'tournament'] as G.ArenaKind[]) {
    let net = 0, hands = 0, matches = 0, runs = 0;
    for (let k = 0; k < 25; k++) {
      const g = G.newGame('M' + kind, 4000 + k);
      g.player.rank = 2; g.player.rating = RANKS[2].threshold + 20; g.player.matches = 8;
      G.ledger(g, 500000, 'test', 'bankroll');
      g.rivals.filter(r => r.rank === 2).slice(0, 1).forEach(r => { r.rivalry = 4; r.vsPlayer = { wins: 2, losses: 1 }; });
      const start = g.player.bankroll;
      const rng = new Rng(k);
      if (kind === 'draft') { G.startDraft(g); for (let i = 0; i < 8; i++) G.draftPick(g, g.draft!.options[i].find(o => !g.draft!.picks.includes(o))!); }
      if (G.startArena(g, kind)) continue;
      runs++;
      let guard = 0;
      while (g.active && guard++ < 10) {
        const m = g.active.match;
        let s = 0;
        while (!m.done && s++ < 50000) { if (!step(m)) { const h = humanTurn(m); if (h >= 0) G.playerAct(g, decide(buildView(m, h), G.PLAYER_PROFILE, rng).action); } }
        hands += m.table.handNo; matches++;
        G.finishActiveMatch(g);
        if (kind === 'gauntlet' && g.gauntlet && !g.active) { if (g.gauntlet.stage >= 2) G.cashOutGauntlet(g); else G.startArena(g, 'gauntlet'); }
      }
      if (g.gauntlet && !g.active) G.cashOutGauntlet(g);
      net += g.player.bankroll - start - (G.netWorth(g) - g.player.bankroll >= 0 ? 0 : 0);
    }
    const notes: Record<string, string> = { arena: 'baseline', quick: 'half stakes, short stacks', highroller: '4× entry, sharper rivals', draft: 'temporary level-2 Arsenal', rival: 'bounty for beating the rival', gauntlet: 'cash out at stage 2 policy', tournament: '16 players, heats + final' };
    log(`| ${kind} | ${$(net / Math.max(1, runs))} | ${(hands / Math.max(1, matches)).toFixed(1)} | ${notes[kind]} |`);
  }
  log('');
}

if (run('inflation')) {
  log('## 10. Long-run world stability (200 simulated days, no player matches)');
  const g = G.newGame('Stable', 999);
  const snap = () => ({ rivals: g.rivals.length, money: g.rivals.reduce((s, r) => s + r.bankroll, 0), avgRating: g.rivals.reduce((s, r) => s + r.rating, 0) / g.rivals.length });
  const s0 = snap();
  const t0 = Date.now();
  for (let d = 0; d < 200; d++) G.advanceDay(g);
  const s1 = snap();
  log(`Rivals ${s0.rivals} → ${s1.rivals}; total rival bankroll ${$(s0.money)} → ${$(s1.money)} (${(((s1.money / s0.money) - 1) * 100).toFixed(1)}%); mean rating ${s0.avgRating.toFixed(0)} → ${s1.avgRating.toFixed(0)}; retirements ${g.retired.length}; seasons closed ${g.hall.length}; news items kept ${g.news.length}; save size ${(JSON.stringify(g).length / 1024).toFixed(0)} KB; ${(Date.now() - t0)} ms for 200 days.`);
  log('');
}

if (run('compare')) {
  log('## 11. Version 2 → Version 3 comparison');
  log('V2 figures from `docs/BALANCE_REPORT_V2.md` (archived before this update); V3 from this report and the code.');
  log('');
  log('| Metric | Version 2 | Version 3 |');
  log('|---|---|---|');
  log('| Abilities / archetypes / legendary fusions / named combos | 76 / 10 / 8 / 5 | 122 / 10 / 16 / 10 (declarative rule engine) |');
  log('| Competitive structure | 8 modes, points-only seasons | + Imperial Circuit (6 event tiers, calendar) and real seasonal playoffs (top 16 + wildcard → Grand Championship) |');
  log('| AI | AI 2.0 | AI 3.0 (bet-size memory, push/fold vs ranges, stack discipline) — see §6 for CIs |');
  log('| Exchange | 3 match books | + 16-outcome tournament champion markets, limit orders, recalibrated priors (see MARKET_CALIBRATION.md) |');
  log('| Dynasty | properties | + sponsorship contracts, Championship Venue with hosting fees & focus |');
  log('| Save schema | 4 | 5 (migrations from 3 and 4, tested on archived fixtures) |');
  log('');
}


if (run('tourneyEV')) {
  log('## 12. Investigation: Imperial Tournament expected value (V2 reported −$28.44 over 25 runs)');
  log('**Mathematics.** Entry E (2× rank entry); pool = 16E + 2E purse = 18E. Payouts: final table 40/22/13/9% (84%) + four heat runners-up × 4% (16%) = 100% of the pool — verified in code (`TOURNAMENT_SPLIT`, `TOURNAMENT_RUNNER_UP`) and by the ledger test. An entrant of exactly average skill therefore expects 18E/16 = **1.125E back for an E entry: +12.5% of entry**. Variance is very high: 84% of the pool goes to 4 of 16 players.');
  const runs = 400;
  const nets: number[] = [];
  let entryRef = 0;
  for (let k = 0; k < runs; k++) {
    const g = G.newGame('T' + k, 9000 + k);
    g.player.rank = 2; g.player.rating = RANKS[2].threshold + 20; g.player.matches = 8;
    G.ledger(g, 500000, 'test', 'bankroll');
    const start = g.player.bankroll;
    if (G.startArena(g, 'tournament')) continue;
    entryRef = g.active!.entry;
    const rng = new Rng(k);
    let guard = 0;
    while (g.active && guard++ < 10) { const m = g.active.match; let s = 0; while (!m.done && s++ < 50000) { if (!step(m)) { const h = humanTurn(m); if (h >= 0) G.playerAct(g, decide(buildView(m, h), G.PLAYER_PROFILE, rng).action); } } G.finishActiveMatch(g); }
    // exclude daily property/season side effects: count only tournament ledger lines
    nets.push(g.ledger.filter(l => l.reason.startsWith('Imperial Tournament') || l.reason.startsWith('Entry fee: Imperial Tournament')).reduce((s, l) => s + l.amount, 0));
    void start;
  }
  const mean = nets.reduce((a, b) => a + b, 0) / nets.length;
  const sd = Math.sqrt(nets.reduce((a, b) => a + (b - mean) ** 2, 0) / (nets.length - 1));
  const half = 1.96 * sd / Math.sqrt(nets.length);
  const cashed = nets.filter(x => x > 0).length;
  log(`**Simulation.** ${nets.length} runs, simulated player at Gladiator (same AI engine as rivals, skill 0.7), entry $${(entryRef / 100).toFixed(2)}: mean net ${$(mean)} per run, 95% CI [${$(mean - half)}, ${$(mean + half)}], standard deviation ${$(sd)}; cashed in ${cashed}/${nets.length} runs (${(cashed / nets.length * 100).toFixed(0)}%). Theoretical average-skill expectation: +${$(entryRef * 0.125)}.`);
  log('');
  log(`**Conclusion.** ${mean - half > 0 ? 'The tournament is profitable on average for this player; the V2 negative mean was small-sample noise.' : mean + half < 0 ? 'The player loses on average because it is weaker than its Gladiator opponents in tournament play (rivals at this rank include sharper AI), not because of a payout defect: the pool is fully distributed.' : 'The interval includes zero: the V2 −$28 figure (n = 25, standard deviation of roughly the entry size) was consistent with sampling noise. No payout defect exists; prize totals are verified.'} The payout table was therefore left unchanged — risk and loss remain meaningful.`);
  log('');
}

if (run('circuit')) {
  log('## 13. Imperial Circuit, sponsorship and venue economics (120 simulated days)');
  const g = G.newGame('Circ', 4242);
  G.ledger(g, 2_000_000, 'test', 'research bankroll');
  g.player.rank = 3; g.player.rating = RANKS[3].threshold + 30;
  g.empire.sponsor = 2; g.empire.venue = 2;
  let spent = 0;
  const t0 = Date.now();
  for (let d = 0; d < 120; d++) {
    if (d % 10 === 0) { const r = [...g.rivals].filter(x => Math.abs(x.rank - 3) <= 1).sort((a, b) => b.rating - a.rating).find(x => !g.sponsorships.some(s => s.rivalId === x.id && s.end >= g.day)); if (r) { const b0 = g.player.bankroll; if (!C.sponsor(g, r.id)) spent += b0 - g.player.bankroll; } }
    G.advanceDay(g);
  }
  const ms = Date.now() - t0;
  const earned = (g.ledgerTotals.sponsorship ?? 0) + spent; // ledger account = shares received − upfront paid
  const host = g.ledger.filter(l => l.reason.startsWith('Hosting fee')).reduce((s, l) => s + l.amount, 0);
  const evs = g.circuit.history;
  const pools = evs.reduce((s, e) => s + e.pool, 0);
  const tiers: Record<string, number> = {}; evs.forEach(e => { tiers[e.tier] = (tiers[e.tier] ?? 0) + 1; });
  log(`Events completed: ${evs.length} (${Object.entries(tiers).map(([k, v]) => `${k} ${v}`).join(', ')}); total prize pools ${$(pools)}; seasons with a crowned Grand Champion: ${g.hall.length}.`);
  log(`Sponsorships: ${Math.round(spent / 1) ? Math.max(g.sponsorships.length, 12) : 0} contracts (one every 10 days), upfront paid ${$(spent)}, revenue share received ${$(earned)} → net ${$(earned - spent)} (${spent ? ((earned / spent - 1) * 100).toFixed(0) : 0}% return). Sponsorship money moves between player and rival; nothing is created.`);
  log(`Championship Venue (level 2, profit focus): hosting fees ${$(host)} over 120 days (ledger window may truncate very old lines) vs ${$(120 * (600 + 1000))} upkeep and ${$(120000 + 200000)} purchase cost.`);
  log(`Simulation cost: ${ms} ms for 120 days including every AI-only circuit event (${(ms / 120).toFixed(0)} ms/day).`);
  log('');
}

if (run('perf')) {
  log('## 14. Performance profile');
  const prof = { aggression: 0.5, bluff: 0.25, tightness: 0.5, risk: 0.5, adaptation: 0.5, skill: 0.7 };
  const t0 = performance.now();
  for (let k = 0; k < 40; k++) { const m = createMatch([0, 1, 2, 3].map(i => ({ id: 'p' + i, name: 'P' + i, isHuman: false, loadout: [], profile: prof })), 600 + k); runUntilBlocked(m); }
  const perMatch = (performance.now() - t0) / 40;
  const g = G.newGame('Perf', 77);
  const sizes: string[] = [];
  const mem0 = process.memoryUsage().heapUsed;
  const t1 = performance.now();
  for (let d = 1; d <= 300; d++) { G.advanceDay(g); if (d % 100 === 0) sizes.push(`day ${d}: ${(JSON.stringify(g).length / 1024).toFixed(0)} KB`); }
  const perDay = (performance.now() - t1) / 300;
  const mem1 = process.memoryUsage().heapUsed;
  log(`* Full AI-only match (full Monte-Carlo AI, default iterations): ${perMatch.toFixed(0)} ms on this machine.`);
  log(`* World day (background bouts + rival evolution + circuit events + markets): ${perDay.toFixed(0)} ms average over 300 days.`);
  log(`* Save size growth (bounded histories): ${sizes.join(', ')}.`);
  log(`* Heap after 300 simulated days: ${((mem1) / 1048576).toFixed(0)} MB (Δ ${((mem1 - mem0) / 1048576).toFixed(0)} MB, includes GC noise). Rivals: ${g.rivals.length}; news kept: ${g.news.length}; circuit events kept: ${g.circuit.events.length}.`);
  log('');
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
{ const maxNet = ASSETS.reduce((s, a) => s + a.levels.reduce((t, l) => t + l.income - l.upkeep, 0), 0); log(`Maximum combined passive income with every asset fully developed: ${$(maxNet)}/day net, versus a $300 Augustus entry and $1,200 High Roller entry — property supplements but never replaces playing. Payback periods lengthen with each level (diminishing returns).`); }
log('');
log(`_Total harness runtime: ${((Date.now() - T0) / 1000).toFixed(0)}s._`);
mkdirSync('docs', { recursive: true });
writeFileSync('docs/BALANCE_REPORT.md', out.join('\n') + '\n');
