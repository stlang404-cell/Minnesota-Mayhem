/**
 * THE IMPERIAL CIRCUIT (3.0): a persistent calendar of 16-player tournaments plus real seasonal playoffs.
 * One canonical write path: every event result updates the bracket record, rival careers, season points,
 * news, the champion market and the Hall of Champions — all from the same simulated matches.
 */
import type { ActiveMatch, GameState } from './game';
import { humanPlayer, ledger, notify, recordWorldMatch, rivalPlayer, seatAndCreate, useRng, ordinal } from './game';
import { Book, FEE_RATE, emptyPosition, marketPrices, quote } from './market';
import { initialQ, prices, sharesToPrice, tradeCost } from './lmsr';
import { createMatch, MatchState, runUntilBlocked } from './match';
import { prizeTable, RANKS } from './ranks';
import { strength, Rival } from './rivals';
import { mix, Rng } from './rng';
import { nameOf, news, seasonPoints, SEASON_LENGTH } from './world';

export type EventTier = 'local' | 'regional' | 'invitational' | 'highroller' | 'revenge' | 'qualifier' | 'grand';
export interface TableRecord { table: string[]; order: string[]; hands: number; highlights: string[]; stacks: number[][] }
export interface CircuitEvent {
  id: string; name: string; tier: EventTier; day: number; rank: number; season: number;
  eligibility: string; entry: number; purse: number; roster: string[];
  status: 'scheduled' | 'awaiting' | 'done';
  playerEligible: boolean; playerEntered: boolean; withdrawn?: boolean;
  heats: TableRecord[]; final: TableRecord | null; payouts: Record<string, number>;
  market: Book | null; marketSettled: boolean; hostFee: number; seeds?: string[];
}
export const SPLIT = { champion: 0.35, runnerUp: 0.18, third: 0.11, fourth: 0.08, heat2: 0.04, heat3: 0.03 }; // sums to 1.00
export const SPLIT_TOTAL = SPLIT.champion + SPLIT.runnerUp + SPLIT.third + SPLIT.fourth + 4 * SPLIT.heat2 + 4 * SPLIT.heat3;
const SPECIAL = ['Imperial Cup', 'Senate Invitational', 'Winter Frontier Championship', 'Golden Legion Tournament', 'High-Roller Festival', 'Rival Revenge Night'];
export const PLAYOFF_SIZE = 16;
export const GRACE_DAYS = 3;

export function poolOf(ev: CircuitEvent) { return ev.entry * 16 + ev.purse; }

function eligibleRivals(g: GameState, minRank: number, maxRank: number, minBank: number, exclude: Set<string>): Rival[] {
  return g.rivals.filter(r => r.rank >= minRank && r.rank <= maxRank && r.bankroll >= minBank && !exclude.has(r.id));
}

function busyIds(g: GameState): Set<string> {
  const s = new Set<string>();
  for (const m of g.markets) if (m.status === 'open' || m.status === 'live') m.rivalIds.forEach(id => s.add(id));
  if (g.active) g.active.rivalIds.forEach(id => s.add(id));
  for (const e of g.circuit.events) if (e.status !== 'done') e.roster.forEach(id => s.add(id));
  return s;
}

/** Calendar: keep the next 6 days scheduled. Patterned, seeded, and derived from world state. */
export function ensureCalendar(g: GameState) {
  for (let d = g.day; d <= g.day + 5; d++) {
    if (g.circuit.scheduledThrough >= d) continue;
    g.circuit.scheduledThrough = d;
    const inSeason = d - g.season.start;
    if (inSeason === SEASON_LENGTH - 3) { schedule(g, d, 'qualifier'); continue; }
    if (d % 3 === 0) schedule(g, d, 'local');
    if (d % 5 === 0) schedule(g, d, 'regional');
    if (d % 7 === 0) schedule(g, d, (d / 7) % 3 === 0 ? 'highroller' : (d / 7) % 3 === 1 ? 'invitational' : 'revenge');
  }
}

function schedule(g: GameState, day: number, tier: EventTier, roster?: string[], name?: string) {
  const rng = new Rng(mix(g.seed, 'circuit', day, tier));
  const busy = busyIds(g);
  const pr = g.player.rank;
  let rank = tier === 'local' ? Math.max(0, Math.min(8, pr + rng.intRange(-1, 1))) : tier === 'regional' ? Math.max(0, Math.min(8, pr + rng.intRange(0, 1))) : Math.max(1, pr);
  if (tier === 'grand' || tier === 'qualifier') rank = -1;
  const baseEntry = RANKS[Math.max(0, rank)].entry;
  const entry = tier === 'highroller' ? baseEntry * 5 : tier === 'grand' ? 0 : tier === 'qualifier' ? Math.round(baseEntry / 2) : tier === 'invitational' ? baseEntry * 2 : baseEntry;
  const purse = tier === 'grand' ? RANKS[Math.min(8, pr + 2)].entry * 40 : tier === 'invitational' ? baseEntry * 6 : tier === 'highroller' ? baseEntry * 8 : baseEntry * 2;
  let ids: string[] = roster ?? [];
  let eligibility = '';
  let playerEligible = false;
  if (!roster) {
    let pool: Rival[];
    if (tier === 'invitational') {
      pool = [...g.rivals].filter(r => !busy.has(r.id) && r.rank >= rank).sort((a, b) => b.rating - a.rating).slice(0, 24);
      eligibility = `Invitation: top-rated rivals of ${RANKS[rank].name} or above; you are invited at rating ${RANKS[rank].threshold}+`;
      playerEligible = g.player.rating >= RANKS[rank].threshold;
    } else if (tier === 'revenge') {
      pool = [...g.rivals].filter(r => !busy.has(r.id) && Math.abs(r.rank - pr) <= 1).sort((a, b) => b.rivalry - a.rivalry).slice(0, 20);
      eligibility = 'Rival Revenge Night: your fiercest rivals; open to you';
      playerEligible = true;
    } else if (tier === 'qualifier') {
      pool = g.rivals.filter(r => !busy.has(r.id) && !topSeasonIds(g, PLAYOFF_SIZE).includes(r.id));
      eligibility = 'Last Chance Qualifier: anyone outside the top 16 of the season standings; the champion earns the playoff wildcard';
      playerEligible = !topSeasonIds(g, PLAYOFF_SIZE).includes('player');
    } else {
      let lo = tier === 'regional' ? Math.max(0, rank - 1) : rank, hi = tier === 'regional' ? Math.min(8, rank + 1) : rank;
      pool = eligibleRivals(g, lo, hi, entry, busy);
      if (pool.length < 16) { lo = Math.max(0, lo - 1); hi = Math.min(8, hi + 1); pool = eligibleRivals(g, lo, hi, entry, busy); }
      eligibility = tier === 'highroller' ? `High-Roller Festival: ${RANKS[rank].name}+ with a $${(entry / 100).toFixed(0)} buy-in` : `${tier === 'regional' ? 'Regional' : 'Local'} circuit: ${RANKS[lo].name}${hi !== lo ? `–${RANKS[hi].name}` : ''}`;
      playerEligible = g.player.rank >= lo && g.player.rank <= hi + (tier === 'highroller' ? 8 : 0);
    }
    rng.shuffle(pool);
    ids = pool.slice(0, 16).map(r => r.id);
    if (ids.length < 16) return; // not enough idle competitors — no event (honest, no filler)
  } else {
    eligibility = 'Imperial Grand Championship: the season’s top 16 (wildcard from the Last Chance Qualifier)';
    playerEligible = roster.includes('player');
  }
  const special = tier === 'local' || tier === 'qualifier' || tier === 'grand' ? null : SPECIAL[(day + tier.length) % SPECIAL.length];
  const evName = name ?? (tier === 'local' ? `${RANKS[rank].arena} Open` : tier === 'regional' ? `${special} — ${RANKS[rank].name} Region` : tier === 'qualifier' ? `Last Chance Qualifier (Season ${g.season.n})` : special!);
  const ev: CircuitEvent = {
    id: `ev${++g.circuit.counter}`, name: evName, tier, day, rank, season: g.season.n, eligibility, entry, purse,
    roster: ids, status: 'scheduled', playerEligible, playerEntered: roster?.includes('player') ?? false,
    heats: [], final: null, payouts: {}, market: null, marketSettled: false, hostFee: 0, seeds: roster ? ids : undefined,
  };
  ev.market = createChampionMarket(g, ev);
  g.circuit.events.push(ev);
  if (tier === 'grand' || tier === 'invitational' || tier === 'highroller') news(g, 'tournament', `Announced: ${ev.name} on day ${day} — ${ev.eligibility}. Pool $${(poolOf(ev) / 100).toFixed(0)}.`, ids.filter(i => i !== 'player').slice(0, 3));
  return ev;
}

// ------------------------------------------------------------------ champion market (16 outcomes)
function createChampionMarket(g: GameState, ev: CircuitEvent): Book {
  const s = ev.roster.map(id => id === 'player' ? 10 ** (g.player.rating / 400) * 1.0 : (() => { const r = g.rivals.find(x => x.id === id); return r ? strength(r) : 1; })());
  const w = s.map(x => Math.sqrt(x));
  const tot = w.reduce((a, b) => a + b, 0);
  const prior = w.map(x => x / tot);
  const b = 150;
  const q0 = initialQ(prior, b);
  return {
    kind: 'winner', title: 'Tournament Champion', rule: `Pays $1 if this competitor wins the ${ev.name} final table (the event's canonical result).`,
    labels: ev.roster.map(id => nameOf(g, id)), b, q: q0.slice(), q0, prior, history: [{ t: 0, hand: 0, p: prices(q0, b) }], trades: [],
    player: emptyPosition(16), mmCash: 0, result: -1,
  };
}

export function eventTradingOpen(g: GameState, ev: CircuitEvent): string | null {
  if (!ev.market) return 'No market';
  if (ev.status !== 'scheduled') return 'Trading closed — the event has started';
  if (ev.playerEntered || ev.roster.includes('player')) return 'You are competing in this event (conflict of interest)';
  return null;
}

/** Player trade on a champion market. Same LMSR accounting & rounding as match markets. */
export function eventTrade(g: GameState, evId: string, outcome: number, shares: number): string | null {
  const ev = g.circuit.events.find(e => e.id === evId); if (!ev) return 'No event';
  const lock = eventTradingOpen(g, ev); if (lock) return lock;
  const bk = ev.market!;
  if (!Number.isInteger(shares) || shares === 0 || outcome < 0 || outcome >= 16) return 'Invalid order';
  if (sponsoredIn(g, [ev.roster[outcome]])) return 'You sponsor this competitor (conflict of interest)';
  const pos = bk.player;
  if (shares < 0 && -shares > pos.shares[outcome]) return 'Cannot sell more contracts than you own (no naked shorts)';
  const qt = quote(bk, outcome, shares);
  const price = marketPrices(bk)[outcome];
  if (shares > 0) {
    if (!ledger(g, -(qt.cents + qt.fee), 'exchange', `Bought ${shares} × ${bk.labels[outcome]} to win ${ev.name}`)) return 'Insufficient Dollars';
    pos.shares[outcome] += shares; pos.cost[outcome] += qt.cents; pos.fees += qt.fee;
  } else {
    const n = -shares, receive = Math.max(0, -qt.cents - qt.fee);
    const basis = Math.round((pos.cost[outcome] / pos.shares[outcome]) * n);
    pos.realized += receive - basis; pos.cost[outcome] -= basis; pos.shares[outcome] -= n; pos.fees += qt.fee;
    if (pos.shares[outcome] === 0) pos.cost[outcome] = 0;
    ledger(g, receive, 'exchange', `Sold ${n} × ${bk.labels[outcome]} (${ev.name})`);
  }
  g.ledgerTotals['sink:fees'] = (g.ledgerTotals['sink:fees'] ?? 0) + qt.fee;
  bk.q[outcome] += shares; bk.mmCash += qt.cents / 100;
  bk.trades.push({ t: ++g.counter, who: 'You', outcome, shares, cents: qt.cents, fee: qt.fee, price, hand: 0 });
  bk.history.push({ t: g.counter, hand: 0, p: marketPrices(bk) });
  g.tradeLog.push({ t: g.counter, day: g.day, market: ev.name, book: 'Tournament Champion', label: bk.labels[outcome], shares, cents: shares > 0 ? -(qt.cents + qt.fee) : Math.max(0, -qt.cents - qt.fee), fee: qt.fee });
  if (g.tradeLog.length > 200) g.tradeLog.shift();
  g.stats.exchangeTrades++;
  eventBots(g, ev);
  return null;
}

/** Simulated traders on champion markets: value (model), momentum, conservative. Orders hit the LMSR. */
export function eventBots(g: GameState, ev: CircuitEvent) {
  const bk = ev.market; if (!bk || ev.status !== 'scheduled') return;
  const rng = new Rng(mix(g.seed, 'evbots', ev.id, bk.trades.length));
  for (let k = 0; k < 4; k++) {
    const p = marketPrices(bk);
    const style = (['value', 'momentum', 'conservative', 'value'] as const)[k];
    const last = bk.history.length > 3 ? bk.history[bk.history.length - 4].p : p;
    const belief = bk.prior.map((f, i) => style === 'momentum' ? Math.max(0.002, p[i] + (p[i] - last[i])) : f * (1 + (rng.next() - 0.5) * (style === 'conservative' ? 0.1 : 0.3)));
    const s = belief.reduce((a, b) => a + b, 0);
    let best = 0, edge = 0;
    belief.forEach((x, i) => { const e = x / s - p[i]; if (e > edge) { edge = e; best = i; } });
    if (edge < (style === 'conservative' ? 0.03 : 0.012)) continue;
    let sh = Math.round(sharesToPrice(bk.q, bk.b, best, p[best] + edge * 0.5));
    sh = Math.min(sh, style === 'conservative' ? 10 : 30);
    if (sh <= 0) continue;
    const c = tradeCost(bk.q, bk.b, best, sh);
    const cents = Math.ceil(c * 100);
    bk.q[best] += sh; bk.mmCash += cents / 100;
    bk.trades.push({ t: ++g.counter, who: `${style} trader`, outcome: best, shares: sh, cents, fee: Math.ceil(cents * FEE_RATE), price: p[best], hand: 0 });
    bk.history.push({ t: g.counter, hand: 0, p: marketPrices(bk) });
  }
  if (bk.history.length > 200) bk.history.splice(1, bk.history.length - 200);
  if (bk.trades.length > 150) bk.trades.splice(0, bk.trades.length - 150);
}

function settleEventMarket(g: GameState, ev: CircuitEvent) {
  const bk = ev.market; if (!bk || ev.marketSettled) return;
  const res = ev.roster.indexOf(ev.final!.order[0]);
  bk.result = res;
  const pay = bk.player.shares[res] * 100;
  bk.player.realized += pay - bk.player.cost.reduce((a, b) => a + b, 0);
  bk.mmCash -= bk.q[res] - bk.q0[res];
  bk.player.shares = bk.player.shares.map(() => 0); bk.player.cost = bk.player.cost.map(() => 0);
  if (pay > 0) ledger(g, pay, 'exchange', `Settlement: ${bk.labels[res]} won ${ev.name}`, `evsettle:${ev.id}`);
  if (bk.player.fees > 0) notify(g, 'settlement', `${bk.labels[res]} won ${ev.name}. Champion contracts paid $${(pay / 100).toFixed(2)}.`);
  ev.marketSettled = true;
}

// ------------------------------------------------------------------ running events
function simTable(g: GameState, ids: string[], seed: number, entry: number, label: string): TableRecord {
  const ps = ids.map(id => rivalPlayer(g, g.rivals.find(r => r.id === id)!));
  const m = createMatch(ps, seed, 'exhibition', undefined, label);
  m.aiIters = 50;
  runUntilBlocked(m);
  recordWorldMatch(g, m, entry, 0, [0, 0, 0, 0]);
  return tableRecord(m);
}
export function tableRecord(m: MatchState): TableRecord {
  const hl = m.events.filter(e => e.kind === 'elim' || e.kind === 'bluff' || e.kind === 'champion').slice(-8).map(e => `Hand ${e.hand}: ${e.text}`);
  const big = [...m.history].sort((a, b) => b.pot - a.pot)[0];
  if (big) hl.unshift(`Biggest pot (hand ${big.hand}): ${big.text}`);
  return { table: m.players.map(p => p.id), order: m.placementIds, hands: m.table.handNo, highlights: hl, stacks: m.history.map(h => h.stacks) };
}

function tablesFor(ev: CircuitEvent, rng: Rng): string[][] {
  const ids = ev.seeds ?? rng.shuffle([...ev.roster]);
  // snake seeding when seeds are known (playoffs): 1,8,9,16 | 2,7,10,15 | ...
  if (ev.seeds) return [[0, 7, 8, 15], [1, 6, 9, 14], [2, 5, 10, 13], [3, 4, 11, 12]].map(t => t.map(i => ids[i]));
  return [ids.slice(0, 4), ids.slice(4, 8), ids.slice(8, 12), ids.slice(12, 16)];
}

/** Run every scheduled AI-only event whose day has arrived; withdraw no-show players after the grace period. */
export function circuitTick(g: GameState) {
  for (const ev of g.circuit.events) {
    if (ev.status === 'done') continue;
    if (ev.status === 'scheduled' && g.day > ev.day + 0 && !ev.playerEntered) { runAiEvent(g, ev); continue; }
    if (ev.playerEntered && g.day > ev.day + GRACE_DAYS && !(g.active?.meta?.eventId === ev.id)) {
      // honest no-show rule: the player is replaced by an alternate; entry is not refunded
      const alt = g.rivals.find(r => !ev.roster.includes(r.id) && !busyIds(g).has(r.id));
      if (alt) { ev.roster[ev.roster.indexOf('player')] = alt.id; if (ev.seeds) ev.seeds = ev.roster; }
      ev.playerEntered = false; ev.withdrawn = true;
      notify(g, 'warning', `You did not take your seat in ${ev.name}; an alternate replaced you.`);
      runAiEvent(g, ev);
    }
  }
  for (const ev of g.circuit.events) if (ev.status === 'scheduled') eventBots(g, ev);
  // prune history (bounded)
  const done = g.circuit.events.filter(e => e.status === 'done');
  if (done.length > 24) g.circuit.events = g.circuit.events.filter(e => e.status !== 'done' || done.slice(-24).includes(e));
}

function payPlaces(g: GameState, ev: CircuitEvent) {
  const pool = poolOf(ev);
  const vl = g.empire.venue ?? 0;
  const host = vl > 0 && ev.tier !== 'grand' && (ev.rank < 0 ? vl >= 3 : ev.rank <= vl * 3) ? Math.round(pool * (0.03 + 0.01 * vl) + (g.businessFocus.venue === 'prestige' ? 0 : pool * 0.01)) : 0;
  const net = pool - host;
  ev.hostFee = host;
  const pays: [string, number][] = [];
  const f = ev.final!.order;
  pays.push([f[0], SPLIT.champion], [f[1], SPLIT.runnerUp], [f[2], SPLIT.third], [f[3], SPLIT.fourth]);
  for (const h of ev.heats) { pays.push([h.order[1], SPLIT.heat2]); pays.push([h.order[2], SPLIT.heat3]); }
  for (let i = 0; i < pays.length; i++) {
    const [id, frac] = pays[i];
    const amt = Math.round(net * frac);
    ev.payouts[id] = (ev.payouts[id] ?? 0) + amt;
    if (id === 'player') ledger(g, amt, 'circuit', `${ev.name}: prize`, `evprize:${ev.id}:${i}`);
    else { const r = g.rivals.find(x => x.id === id); if (r) { r.bankroll += amt; r.career.earnings += amt; sponsorShare(g, id, amt, ev.name); } }
  }
  if (host) {
    const focus = g.businessFocus.venue ?? 'profit';
    ledger(g, host, 'empire', `Hosting fee: ${ev.name} at your Championship Venue`, `host:${ev.id}`);
    if (focus === 'prestige') g.player.glory += 150;
  }
}

function finishEvent(g: GameState, ev: CircuitEvent) {
  payPlaces(g, ev);
  const champ = ev.final!.order[0];
  ev.status = 'done';
  const r = g.rivals.find(x => x.id === champ);
  if (r) { r.career.titles++; (r as any).championships = ((r as any).championships ?? 0) + (ev.tier === 'grand' ? 1 : 0); }
  if (champ === 'player') { g.player.titles++; g.trophies.push({ id: ev.id, name: ev.name, tier: ev.tier, day: g.day, season: ev.season }); g.timeline.push({ day: g.day, text: `Won the ${ev.name}`, icon: '🏆' }); }
  if (ev.roster.includes('player') && ev.tier === 'grand') g.timeline.push({ day: g.day, text: `Played the Season ${ev.season} Imperial Grand Championship`, icon: '🏛' });
  const pts = ev.tier === 'grand' ? [0, 0, 0, 0] : ev.tier === 'local' ? [8, 4, 2, 1] : [16, 8, 4, 2];
  seasonPoints(g, ev.final!.order, [0, 1, 2, 3], 0);
  ev.final!.order.forEach((id, i) => { g.season.points[id] = (g.season.points[id] ?? 0) + pts[i]; });
  news(g, 'tournament', `${nameOf(g, champ)} wins the ${ev.name}, beating ${ev.final!.order.slice(1).map(id => nameOf(g, id)).join(', ')} at the final table.`, ev.final!.order);
  settleEventMarket(g, ev);
  if (ev.tier === 'qualifier') {
    g.circuit.wildcard = champ;
    news(g, 'tournament', `${nameOf(g, champ)} claims the Season ${ev.season} playoff wildcard.`, [champ]);
  }
  if (ev.tier === 'grand') {
    const runnerUp = ev.final!.order[1];
    g.hall.push({ season: ev.season, day: g.day, championId: champ, name: nameOf(g, champ), points: g.circuit.lastSeasonPoints[champ] ?? 0, playerPlace: ev.final!.order.includes('player') ? ev.final!.order.indexOf('player') + 1 : ev.roster.includes('player') ? 5 : 0, runnerUp: nameOf(g, runnerUp) } as any);
    if (g.hall.length > 50) g.hall.shift();
    news(g, 'season', `🏆 ${nameOf(g, champ)} is crowned Imperial Grand Champion of Season ${ev.season}!`, [champ]);
    if (champ === 'player') { g.ceremony = 100; notify(g, 'promotion', `You are the Imperial Grand Champion of Season ${ev.season}!`); }
  }
  g.circuit.history.push({ id: ev.id, name: ev.name, tier: ev.tier, day: g.day, season: ev.season, champion: champ, finalists: ev.final!.order, pool: poolOf(ev), playerResult: ev.final!.order.includes('player') ? ev.final!.order.indexOf('player') + 1 : ev.roster.includes('player') ? 9 : 0 });
  if (g.circuit.history.length > 80) g.circuit.history.shift();
}

function repairRoster(g: GameState, ev: CircuitEvent) {
  for (let i = 0; i < ev.roster.length; i++) {
    const id = ev.roster[i];
    if (id === 'player' || g.rivals.some(r => r.id === id)) continue;
    const sub = g.rivals.find(r => !ev.roster.includes(r.id) && !busyIds(g).has(r.id));
    if (sub) { ev.roster[i] = sub.id; if (ev.market) ev.market.labels[i] = sub.name; }
  }
  if (ev.seeds) ev.seeds = ev.roster;
}

export function runAiEvent(g: GameState, ev: CircuitEvent) {
  if (ev.status === 'done') return;
  repairRoster(g, ev);
  ev.status = 'awaiting';
  const rng = new Rng(mix(g.seed, 'evtables', ev.id));
  for (const id of ev.roster) { const r = g.rivals.find(x => x.id === id); if (r && ev.entry) r.bankroll = Math.max(0, r.bankroll - ev.entry); }
  const tables = tablesFor(ev, rng);
  ev.heats = tables.map((tb, i) => simTable(g, tb, mix(g.seed, ev.id, 'heat', i), ev.entry, `${ev.id}h${i}`));
  ev.final = simTable(g, ev.heats.map(h => h.order[0]), mix(g.seed, ev.id, 'final'), ev.entry, `${ev.id}f`);
  finishEvent(g, ev);
}

// ------------------------------------------------------------------ player participation
export function enterEvent(g: GameState, evId: string): string | null {
  const ev = g.circuit.events.find(e => e.id === evId); if (!ev) return 'No event';
  if (ev.status !== 'scheduled') return 'Registration closed';
  if (!ev.playerEligible) return 'Not eligible';
  if (ev.playerEntered) return 'Already registered';
  if (g.day < ev.day - 2) return `Registration opens on day ${ev.day - 2}`;
  if (ev.entry > 0 && !ledger(g, -ev.entry, 'circuit', `Entry: ${ev.name}`, `eventry:${ev.id}`)) return 'Not enough Dollars';
  // the player takes a seat; the lowest-rated rival steps aside (their market outcome is refunded by relabelling)
  const drop = ev.roster.reduce((a, b) => ((g.rivals.find(r => r.id === a)?.rating ?? 0) <= (g.rivals.find(r => r.id === b)?.rating ?? 0) ? a : b));
  const idx = ev.roster.indexOf(drop);
  ev.roster[idx] = 'player';
  ev.playerEntered = true;
  // champion market: the player now competes → trading on it closes for the player; outcome label updated
  if (ev.market) ev.market.labels[idx] = g.player.name;
  return null;
}

/** Start (or continue) the player's next table in an entered event. */
export function playEvent(g: GameState, evId: string): string | null {
  const ev = g.circuit.events.find(e => e.id === evId); if (!ev) return 'No event';
  if (!ev.playerEntered) return 'Not registered';
  if (g.active) return 'A match is already in progress';
  if (g.day < ev.day) return `The event starts on day ${ev.day}`;
  const rng = new Rng(mix(g.seed, 'evtables', ev.id));
  if (ev.heats.length === 0) {
    repairRoster(g, ev);
    ev.status = 'awaiting';
    for (const id of ev.roster) { const r = g.rivals.find(x => x.id === id); if (r && ev.entry) r.bankroll = Math.max(0, r.bankroll - ev.entry); }
    const tables = tablesFor(ev, rng);
    const mine = tables.find(t => t.includes('player'))!;
    (ev as any).pendingTables = tables;
    startEventTable(g, ev, mine, 'heat');
    return null;
  }
  return 'Your table is already running';
}

function startEventTable(g: GameState, ev: CircuitEvent, ids: string[], stage: 'heat' | 'final') {
  const players = ids.map(id => id === 'player' ? humanPlayer(g) : rivalPlayer(g, g.rivals.find(r => r.id === id)!));
  const key = `${ev.id}${stage === 'heat' ? 'h' : 'f'}p`;
  const match = seatAndCreate(g, players, 'tournament', key, undefined, mix(g.seed, ev.id, stage, 'p'));
  g.active = { match, kind: 'circuit', entry: 0, prizes: [0, 0, 0, 0], rivalIds: ids.filter(x => x !== 'player'), day: g.day, rankAtStart: g.player.rank, key, ratingScale: 0, gloryScale: ev.tier === 'grand' ? 4 : 2, meta: { eventId: ev.id, stage } } as ActiveMatch;
}

/** Called from finishActiveMatch for circuit matches. Returns true if the whole event is complete. */
export function advanceCircuitMatch(g: GameState, a: ActiveMatch, order: string[], notes: string[]): boolean {
  const ev = g.circuit.events.find(e => e.id === a.meta.eventId);
  if (!ev) return true;
  const m = a.match;
  m.placementIds = order;
  const rec = tableRecord(m);
  rec.order = order;
  if (a.meta.stage === 'heat') {
    const tables: string[][] = (ev as any).pendingTables;
    ev.heats = tables.map((tb, i) => tb.includes('player') ? rec : simTable(g, tb, mix(g.seed, ev.id, 'heat', i), ev.entry, `${ev.id}h${i}`));
    const winners = ev.heats.map(h => h.order[0]);
    if (order[0] === 'player') {
      notes.push(`You won your heat of the ${ev.name}! The final table awaits.`);
      g.active = null;
      startEventTable(g, ev, winners, 'final');
      return false;
    }
    notes.push(`${ordinal(order.indexOf('player') + 1)} in your heat of the ${ev.name}.`);
    ev.final = simTable(g, winners, mix(g.seed, ev.id, 'final'), ev.entry, `${ev.id}f`);
  } else {
    ev.final = rec;
    notes.push(`Final table of the ${ev.name}: ${ordinal(order.indexOf('player') + 1)} place.`);
  }
  delete (ev as any).pendingTables;
  finishEvent(g, ev);
  if (ev.payouts.player) notes.push(`Event prize: $${(ev.payouts.player / 100).toFixed(2)}`);
  return true;
}

// ------------------------------------------------------------------ seasons & playoffs
export function topSeasonIds(g: GameState, n: number): string[] {
  return Object.entries(g.season.points).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([id]) => id)
    .filter(id => id === 'player' || g.rivals.some(r => r.id === id));
}

/** Season end: qualification → playoffs (Imperial Grand Championship) → awards. Replaces the v2 points-only close. */
export function seasonPlayoffs(g: GameState, pay: (amount: number, reason: string, key: string) => void) {
  if (g.day - g.season.start < SEASON_LENGTH) return;
  const standings = Object.entries(g.season.points).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  let qualified = topSeasonIds(g, PLAYOFF_SIZE);
  // fill if retired rivals left gaps
  for (const r of [...g.rivals].sort((a, b) => b.rating - a.rating)) { if (qualified.length >= PLAYOFF_SIZE) break; if (!qualified.includes(r.id)) qualified.push(r.id); }
  const wc = g.circuit.wildcard;
  if (wc && !qualified.includes(wc) && (wc === 'player' || g.rivals.some(r => r.id === wc))) qualified[PLAYOFF_SIZE - 1] = wc;
  qualified = qualified.slice(0, PLAYOFF_SIZE);
  g.circuit.lastSeasonPoints = Object.fromEntries(standings);
  const pp = standings.findIndex(([id]) => id === 'player');
  const entry = RANKS[g.player.rank].entry;
  // regular-season awards (smaller than v2 since the playoffs now carry the big prize)
  if (pp === 0) pay(entry * 8, `Season ${g.season.n}: regular-season points leader`, `season:${g.season.n}`);
  else if (pp > 0 && pp < 3) pay(entry * 4, `Season ${g.season.n}: top 3 in the standings`, `season:${g.season.n}`);
  else if (pp >= 3 && pp < 10) pay(entry * 2, `Season ${g.season.n}: top 10 in the standings`, `season:${g.season.n}`);
  news(g, 'season', `Season ${g.season.n} regular season ends. Qualified for the Imperial Grand Championship: ${qualified.slice(0, 6).map(id => nameOf(g, id)).join(', ')} and ${qualified.length - 6} more${wc ? ` (wildcard: ${nameOf(g, wc)})` : ''}.`, qualified.filter(i => i !== 'player').slice(0, 5));
  if (qualified.includes('player')) notify(g, 'promotion', `You qualified for the Season ${g.season.n} Imperial Grand Championship (seed ${qualified.indexOf('player') + 1})!`);
  const prevSeason = g.season.n;
  g.season = { n: g.season.n + 1, start: g.day, points: {} };
  g.circuit.wildcard = null;
  const ev = schedule(g, g.day, 'grand', qualified, `Imperial Grand Championship — Season ${prevSeason}`);
  if (ev) ev.season = prevSeason;
}

// ------------------------------------------------------------------ sponsorships (Dynasty)
export interface Sponsorship { rivalId: string; start: number; end: number; upfront: number; sharePct: number; earned: number; bonusPaid: boolean }
export function sponsoredIn(g: GameState, ids: string[]): boolean {
  return g.sponsorships.some(s => s.end >= g.day && ids.includes(s.rivalId));
}
export function sponsorOffer(g: GameState, r: Rival) {
  const formBoost = r.form.length ? 1 + (2 - r.form.reduce((a, b) => a + b, 0) / r.form.length) * 0.15 : 1;
  return { upfront: Math.round(RANKS[r.rank].entry * 2 * formBoost), sharePct: 30, days: 10 };
}
export function sponsor(g: GameState, rivalId: string): string | null {
  const lv = g.empire.sponsor ?? 0;
  if (!lv) return 'Requires a Sponsorship Office';
  const active = g.sponsorships.filter(s => s.end >= g.day);
  if (active.length >= lv + 1) return `Your office manages at most ${lv + 1} contracts`;
  if (active.some(s => s.rivalId === rivalId)) return 'Already sponsored';
  const r = g.rivals.find(x => x.id === rivalId); if (!r) return 'Unknown rival';
  const o = sponsorOffer(g, r);
  if (!ledger(g, -o.upfront, 'sponsorship', `Sponsorship of ${r.name} (${o.days} days, ${o.sharePct}% of prizes)`, `spons:${rivalId}:${g.day}`)) return 'Not enough Dollars';
  r.bankroll += o.upfront; // money moves to the rival — nothing is created
  g.sponsorships.push({ rivalId, start: g.day, end: g.day + o.days, upfront: o.upfront, sharePct: o.sharePct, earned: 0, bonusPaid: false });
  news(g, 'record', `${g.player.name}'s house sponsors ${r.name} for ${o.days} days.`, [rivalId]);
  return null;
}
/** Revenue share: called whenever a rival receives prize money. Transfers come out of the rival's winnings. */
export function sponsorShare(g: GameState, rivalId: string, prize: number, label: string) {
  if (prize <= 0) return;
  for (const s of g.sponsorships) {
    if (s.rivalId !== rivalId || s.end < g.day || s.start > g.day) continue;
    const r = g.rivals.find(x => x.id === rivalId); if (!r) continue;
    const cut = Math.min(Math.round(prize * s.sharePct / 100), r.bankroll);
    if (cut <= 0) continue;
    r.bankroll -= cut; s.earned += cut;
    ledger(g, cut, 'sponsorship', `${s.sharePct}% of ${r.name}'s prize (${label})`);
  }
}
export { SPECIAL };
