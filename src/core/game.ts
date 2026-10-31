import { ABILITIES, ABILITY_MAP, AbilityInstance, SIGILS, SigilId, STARTER_ABILITIES, upgradeCost } from './abilities';
import { AIProfile } from './ai';
import { ASSET_MAP, ASSETS, COSMETICS, dailyNet, SELL_REFUND } from './empire';
import {
  advanceHand, botsTrade, cancel, createMarket, goLive, Market, playerTrade, settle, tradingOpen,
} from './market';
import { act, activate, createMatch, LoadoutEntry, MatchState, rewardMultiplierPct, runUntilBlocked } from './match';
import { Action } from './poker';
import {
  applyRating, prizeTable, RANKS, ratingDeltas, RECOVERY_PRIZES, RECOVERY_THRESHOLD, START_RATING, TRIAL_FAIL_PENALTY,
  TRIAL_PASS_PLACE, trialAvailable,
} from './ranks';
import {
  evolveRivals, makePopulation, pickOpponents, rebalancePopulation, recordRivalResult, Rival, samplePlacement,
} from './rivals';
import { mix, Rng, RngState } from './rng';

export const SAVE_VERSION = 3;
export const STARTING_BANKROLL = 50000; // $500.00

export type ArenaKind = 'arena' | 'trial' | 'recovery' | 'club' | 'grand';

export interface LedgerEntry { id: number; day: number; amount: number; account: string; reason: string; balance: number }
export interface Notice { id: number; kind: 'promotion' | 'settlement' | 'purchase' | 'unlock' | 'victory' | 'info' | 'warning' | 'achievement'; text: string; day: number }

export interface PlayerState {
  name: string;
  bankroll: number;
  rating: number;
  rank: number;
  prestige: number;
  glory: number;
  peakRating: number;
  matches: number; wins: number; top2: number; trialsPassed: number; trialsFailed: number;
  owned: AbilityInstance[];
  loadout: string[];
  presets: { name: string; uids: string[] }[];
  cosmetics: string[];
  equipped: { cardback: string; felt: string; title: string };
  uidCounter: number;
  bankruptcies: number;
}

export interface ActiveMatch {
  match: MatchState; kind: ArenaKind; entry: number; prizes: number[]; rivalIds: string[]; day: number; rankAtStart: number; key: string;
}

export interface MatchReport {
  key: string; kind: ArenaKind; place: number; prize: number; entry: number; ratingDelta: number; newRating: number;
  trial?: 'passed' | 'failed'; newRank?: number; glory: number; rebate: number; sponsor: number; bonusPct: number;
  opponents: { id: string; name: string; place: number }[]; hands: number; abilityTriggers: number;
}

export interface GameState {
  version: number;
  seed: number;
  createdAt: number;
  day: number;
  world: RngState;
  player: PlayerState;
  rivals: Rival[];
  markets: Market[];
  archive: { id: string; title: string; names: string[]; result: number; placements: number[]; pnl: number; day: number; status: string; prices: number[] }[];
  active: ActiveMatch | null;
  lastReport: MatchReport | null;
  empire: Record<string, number>;
  ledger: LedgerEntry[];
  ledgerTotals: Record<string, number>;
  appliedKeys: string[];
  achievements: string[];
  notices: Notice[];
  counter: number;
  marketCounter: number;
  matchCounter: number;
  settings: { sound: boolean; reducedMotion: boolean; speed: number; autoSave: boolean };
  stats: { exchangeTrades: number; exchangePnl: number; marketsSettled: number; bestStreak: number; streak: number; earnedPrizes: number; propertyIncome: number };
}

// ------------------------------------------------------------------ helpers
export function rngOf(g: GameState): Rng { return new Rng(g.world); }
function useRng<T>(g: GameState, f: (r: Rng) => T): T { const r = rngOf(g); const v = f(r); g.world = r.state(); return v; }

export function notify(g: GameState, kind: Notice['kind'], text: string) {
  g.notices.push({ id: ++g.counter, kind, text, day: g.day });
  if (g.notices.length > 40) g.notices.splice(0, g.notices.length - 40);
}

/** Apply a signed Dollar movement to the player's bankroll with a ledger entry. Refuses overdrafts and duplicate keys. */
export function ledger(g: GameState, amount: number, account: string, reason: string, key?: string): boolean {
  amount = Math.round(amount);
  if (key && g.appliedKeys.includes(key)) return false;
  if (g.player.bankroll + amount < 0) return false;
  g.player.bankroll += amount;
  g.ledgerTotals[account] = (g.ledgerTotals[account] ?? 0) + amount;
  g.ledger.push({ id: ++g.counter, day: g.day, amount, account, reason, balance: g.player.bankroll });
  if (g.ledger.length > 400) g.ledger.splice(0, g.ledger.length - 400);
  if (key) { g.appliedKeys.push(key); if (g.appliedKeys.length > 3000) g.appliedKeys.splice(0, g.appliedKeys.length - 3000); }
  return true;
}

export function newGame(name: string, seed = Date.now() >>> 0): GameState {
  const rng = new Rng(mix(seed, 'world'));
  const rivals = makePopulation(rng);
  const g: GameState = {
    version: SAVE_VERSION, seed, createdAt: Date.now(), day: 1, world: rng.state(),
    player: {
      name: name || 'Lupus', bankroll: 0, rating: START_RATING, rank: 0, prestige: 0, glory: 0, peakRating: START_RATING,
      matches: 0, wins: 0, top2: 0, trialsPassed: 0, trialsFailed: 0, owned: [], loadout: [], presets: [],
      cosmetics: ['back_crimson', 'felt_green'], equipped: { cardback: 'back_crimson', felt: 'felt_green', title: '' }, uidCounter: 0, bankruptcies: 0,
    },
    rivals, markets: [], archive: [], active: null, lastReport: null, empire: {}, ledger: [], ledgerTotals: {}, appliedKeys: [],
    achievements: [], notices: [], counter: 0, marketCounter: 0, matchCounter: 0,
    settings: { sound: true, reducedMotion: false, speed: 1, autoSave: true },
    stats: { exchangeTrades: 0, exchangePnl: 0, marketsSettled: 0, bestStreak: 0, streak: 0, earnedPrizes: 0, propertyIncome: 0 },
  };
  ledger(g, STARTING_BANKROLL, 'start', 'Starting bankroll from your patron', 'start');
  for (const id of STARTER_ABILITIES) grantAbility(g, id);
  g.player.loadout = g.player.owned.map(o => o.uid);
  ensureMarkets(g);
  notify(g, 'info', `Welcome, ${g.player.name}. The frozen arenas of Minnesota await.`);
  return g;
}

function grantAbility(g: GameState, defId: string, level = 1): AbilityInstance {
  const inst: AbilityInstance = { uid: `a${++g.player.uidCounter}`, defId, level };
  g.player.owned.push(inst);
  return inst;
}

export function loadoutEntries(g: GameState): LoadoutEntry[] {
  return g.player.loadout.map(uid => g.player.owned.find(o => o.uid === uid)).filter(Boolean)
    .map(o => ({ defId: o!.defId, level: o!.level, sigil: o!.sigil })).slice(0, 8);
}

export const PLAYER_PROFILE: AIProfile = { aggression: 0.5, bluff: 0.2, tightness: 0.5, risk: 0.5, adaptation: 0.5, skill: 0.7 };

// ------------------------------------------------------------------ Arena
export function arenaOptions(g: GameState): { kind: ArenaKind; name: string; entry: number; prizes: number[]; available: boolean; reason: string; desc: string }[] {
  const p = g.player;
  const r = RANKS[p.rank];
  const out = [];
  const base = prizeTable(r.entry);
  out.push({ kind: 'arena' as ArenaKind, name: `${r.arena}`, entry: r.entry, prizes: base, available: p.bankroll >= r.entry, reason: p.bankroll >= r.entry ? '' : 'Not enough Dollars', desc: 'Ranked match: rating, Glory and prize money.' });
  if (p.rank < RANKS.length - 1) {
    const nr = RANKS[p.rank + 1];
    const ok = trialAvailable(p.rank, p.rating);
    out.push({ kind: 'trial' as ArenaKind, name: `Promotion Trial: ${nr.name}`, entry: r.entry, prizes: base,
      available: ok && p.bankroll >= r.entry, reason: ok ? (p.bankroll >= r.entry ? '' : 'Not enough Dollars') : `Reach ${nr.threshold} rating`,
      desc: `Face three ${nr.name}s. Finish in the top ${TRIAL_PASS_PLACE + 1} to be promoted.` });
  }
  const club = g.empire.club ?? 0;
  if (club > 0) {
    const pz = prizeTable(r.entry).map(x => Math.round(x * (club >= 2 ? 1.4 : 1.25) * 0.85));
    out.push({ kind: 'club' as ArenaKind, name: 'Club Night at St. Paul', entry: r.entry, prizes: pz, available: p.bankroll >= r.entry, reason: p.bankroll >= r.entry ? '' : 'Not enough Dollars', desc: 'Ranked match in your own club with a richer purse.' });
  }
  if ((g.empire.arena ?? 0) > 0) {
    const ok = g.day % 5 === 0;
    out.push({ kind: 'grand' as ArenaKind, name: 'The Grand Games', entry: r.entry * 2, prizes: prizeTable(r.entry * 2).map(x => Math.round(x * 1.2)), available: ok && p.bankroll >= r.entry * 2, reason: ok ? '' : `Held every 5th day (day ${Math.ceil(g.day / 5) * 5})`, desc: 'Double stakes in your Tournament Arena.' });
  }
  const rec = p.bankroll < RECOVERY_THRESHOLD;
  out.push({ kind: 'recovery' as ArenaKind, name: 'Bread & Circuses', entry: 0, prizes: RECOVERY_PRIZES, available: rec, reason: rec ? '' : 'Only when your bankroll is below $40', desc: 'Free charity match against Peasants. No rating change.' });
  return out;
}

export function startArena(g: GameState, kind: ArenaKind): string | null {
  if (g.active) return 'A match is already in progress';
  const opt = arenaOptions(g).find(o => o.kind === kind);
  if (!opt) return 'Unknown arena';
  if (!opt.available) return opt.reason || 'Unavailable';
  if (loadoutEntries(g).length === 0 && kind !== 'recovery') return 'Equip at least one ability';
  const id = `pm${++g.matchCounter}_${g.day}`;
  const key = `entry:${id}`;
  if (opt.entry > 0 && !ledger(g, -opt.entry, 'arena', `Entry fee: ${opt.name}`, key)) return 'Not enough Dollars';
  const oppRank = kind === 'trial' ? g.player.rank + 1 : kind === 'recovery' ? 0 : g.player.rank;
  const exclude = g.markets.filter(m => m.status === 'live').flatMap(m => m.rivalIds);
  const opps = useRng(g, r => pickOpponents(g.rivals, oppRank, r, 3, exclude));
  const seed = useRng(g, r => r.nextU32());
  const players = [
    { id: 'player', name: g.player.name, isHuman: true, loadout: loadoutEntries(g), profile: PLAYER_PROFILE },
    ...opps.map(o => ({ id: o.id, name: o.name, isHuman: false, loadout: o.loadout, profile: o.profile })),
  ];
  // seat order is shuffled so the player isn't always seat 0
  const order = useRng(g, r => r.shuffle([0, 1, 2, 3]));
  const seated = order.map(i => players[i]);
  const match = createMatch(seated, seed, kind === 'trial' ? 'trial' : kind === 'recovery' ? 'recovery' : 'arena', undefined, id);
  g.active = { match, kind, entry: opt.entry, prizes: opt.prizes, rivalIds: opps.map(o => o.id), day: g.day, rankAtStart: g.player.rank, key: id };
  return null;
}

export function playerSeat(m: MatchState): number { return m.players.findIndex(p => p.isHuman); }

export function playerAct(g: GameState, action: Action): string | null {
  const a = g.active; if (!a) return 'No match';
  const seat = playerSeat(a.match);
  if (a.match.table.toAct !== seat) return 'Not your turn';
  try { act(a.match, seat, action); } catch (e) { return (e as Error).message; }
  return null;
}

export function playerActivate(g: GameState, defId: string): boolean {
  const a = g.active; if (!a) return false;
  return activate(a.match, playerSeat(a.match), defId);
}

/** Concede: the player takes last place; the AI finish the match to determine the other places. */
export function forfeit(g: GameState) {
  const a = g.active; if (!a || a.match.done) return;
  const seat = playerSeat(a.match);
  const m = a.match;
  m.players[seat] = { ...m.players[seat], isHuman: false, profile: { aggression: 0, bluff: 0, tightness: 1, risk: 0, adaptation: 0, skill: 0.5 } };
  (m as any).forfeitSeat = seat;
  runUntilBlocked(m);
}

export function finishActiveMatch(g: GameState): MatchReport | null {
  const a = g.active;
  if (!a || !a.match.done) return null;
  const key = `result:${a.key}`;
  if (g.appliedKeys.includes(key)) { g.active = null; return g.lastReport; }
  const m = a.match;
  const seat = playerSeat(m) >= 0 ? playerSeat(m) : (m as any).forfeitSeat;
  const pid = 'player';
  let order = m.placementIds.slice();
  if ((m as any).forfeitSeat !== undefined) order = [...order.filter(id => id !== pid), pid];
  const place = order.indexOf(pid);
  const p = g.player;
  const rankIdx = p.rank;
  const bonusPct = rewardMultiplierPct(m, seat);
  const basePrize = a.prizes[place] ?? 0;
  const prize = basePrize > 0 ? Math.round(basePrize * (1 + bonusPct / 100)) : 0;
  const rebatePct = m.arsenal[seat].rebatePct;
  const rebate = place >= 2 && a.entry > 0 ? Math.round(a.entry * rebatePct / 100) : 0;
  const sponsorLv = g.empire.sponsor ?? 0;
  const sponsor = sponsorLv && place <= 1 && a.entry > 0 ? Math.round(a.entry * (sponsorLv >= 2 ? 0.7 : 0.4)) : 0;
  if (prize) ledger(g, prize, 'arena', `Prize: ${ordinal(place + 1)} place${bonusPct ? ` (+${bonusPct}% Arsenal bonus)` : ''}`, `prize:${a.key}`);
  if (rebate) ledger(g, rebate, 'arena', `Merchant's rebate (${rebatePct}% of entry)`, `rebate:${a.key}`);
  if (sponsor) ledger(g, sponsor, 'empire', 'Sponsorship bonus for a top-2 finish', `sponsor:${a.key}`);
  g.stats.earnedPrizes += prize;

  // rating
  let ratingDelta = 0;
  let trial: MatchReport['trial'];
  let newRank: number | undefined;
  const ids = order;
  const ratings = ids.map(id => id === pid ? p.rating : (g.rivals.find(r => r.id === id)?.rating ?? 1000));
  const placementArr = ids.map((_, i) => i);
  if (a.kind !== 'recovery') {
    const d = ratingDeltas(ratings, placementArr)[place];
    if (a.kind === 'trial') {
      if (place <= TRIAL_PASS_PLACE) {
        trial = 'passed'; p.rank = Math.min(RANKS.length - 1, p.rank + 1); newRank = p.rank; p.trialsPassed++;
        p.rating = Math.max(p.rating, RANKS[p.rank].threshold) + Math.max(0, d);
        ratingDelta = Math.max(0, d);
        notify(g, 'promotion', `PROMOTED to ${RANKS[p.rank].name}! ${RANKS[p.rank].unlock} unlocked.`);
      } else {
        trial = 'failed'; p.trialsFailed++;
        const before = p.rating;
        p.rating = applyRating(p.rank, p.rating, -TRIAL_FAIL_PENALTY);
        ratingDelta = p.rating - before;
        notify(g, 'warning', `Trial failed. You keep your rank; rating −${before - p.rating}. Try again when ready.`);
      }
    } else {
      const before = p.rating;
      p.rating = applyRating(p.rank, p.rating, d);
      ratingDelta = p.rating - before;
    }
  }
  p.peakRating = Math.max(p.peakRating, p.rating);
  p.matches++;
  if (place === 0) { p.wins++; g.stats.streak++; g.stats.bestStreak = Math.max(g.stats.bestStreak, g.stats.streak); } else g.stats.streak = 0;
  if (place <= 1) p.top2++;
  const glory = a.kind === 'recovery' ? 0 : Math.round(([100, 40, 10, 0][place] * (rankIdx + 1)) * ((g.empire.estate ?? 0) ? 1.25 : 1) * (1 + 0.1 * p.prestige));
  p.glory += glory;

  // rival careers (excluding player)
  const rivalIds = ids.filter(id => id !== pid);
  recordRivalResult(g.rivals, rivalIds, rivalIds.map(id => ids.indexOf(id)), a.prizes, a.entry, rivalIds.map(id => ratings[ids.indexOf(id)]));
  for (const id of rivalIds) {
    const r = g.rivals.find(x => x.id === id); if (!r) continue;
    const theirPlace = ids.indexOf(id);
    if (theirPlace < place) { r.vsPlayer.wins++; r.rivalry += 1; } else { r.vsPlayer.losses++; r.rivalry += 0.5; }
  }
  const report: MatchReport = {
    key: a.key, kind: a.kind, place, prize, entry: a.entry, ratingDelta, newRating: p.rating, trial, newRank, glory, rebate, sponsor, bonusPct,
    opponents: rivalIds.map(id => ({ id, name: g.rivals.find(r => r.id === id)?.name ?? id, place: ids.indexOf(id) })),
    hands: m.table.handNo, abilityTriggers: m.arsenal[seat].triggers,
  };
  if (place === 0) notify(g, 'victory', `Victory in ${a.kind === 'trial' ? 'the trial' : 'the arena'}! +$${(prize / 100).toFixed(2)}`);
  g.appliedKeys.push(key);
  g.lastReport = report;
  g.active = null;
  advanceDay(g);
  checkAchievements(g);
  return report;
}

export function ordinal(n: number) { return n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'); }

// ------------------------------------------------------------------ World
export function advanceDay(g: GameState) {
  g.day++;
  // Empire: income and upkeep
  const { income, upkeep } = dailyNet(g.empire);
  if (income) { ledger(g, income, 'empire', 'Property income', `income:${g.day}`); g.stats.propertyIncome += income; }
  if (upkeep) {
    const pay = Math.min(upkeep, g.player.bankroll);
    if (pay > 0) ledger(g, -pay, 'empire', 'Property upkeep', `upkeep:${g.day}`);
    if (pay < upkeep) notify(g, 'warning', 'Upkeep could not be fully paid — your stewards cover the shortfall this time.');
  }
  // Background summarised matches among rivals
  useRng(g, rng => {
    for (let k = 0; k < 8; k++) {
      const rank = rng.int(RANKS.length);
      const busy = new Set(g.markets.filter(m => m.status === 'live' || m.status === 'open').flatMap(m => m.rivalIds));
      const pool = g.rivals.filter(r => r.rank === rank && !busy.has(r.id));
      if (pool.length < 4) continue;
      const four = rng.shuffle([...pool]).slice(0, 4);
      const place = samplePlacement(four, rng);
      const entry = RANKS[rank].entry;
      recordRivalResult(g.rivals, four.map(r => r.id), place, prizeTable(entry), entry);
    }
    evolveRivals(g.rivals, rng);
    rebalancePopulation(g.rivals, rng);
  });
  if (g.player.bankroll < RECOVERY_THRESHOLD) {
    g.player.bankruptcies++;
    notify(g, 'warning', 'Your purse runs thin. Bread & Circuses matches are free — and the Exchange still trades.');
  }
  ensureMarkets(g);
  for (const m of g.markets) if (m.status === 'open') botsTrade(m, 2);
}

// ------------------------------------------------------------------ Exchange
export function ensureMarkets(g: GameState) {
  const open = g.markets.filter(m => m.status === 'open' || m.status === 'live');
  let n = open.length;
  while (n < 3) {
    const rank = useRng(g, r => Math.max(0, Math.min(RANKS.length - 1, g.player.rank + r.intRange(-1, 1))));
    const busy = new Set(g.markets.filter(m => m.status === 'open' || m.status === 'live').flatMap(m => m.rivalIds));
    const pool = g.rivals.filter(r => r.rank === rank && !busy.has(r.id));
    if (pool.length < 4) { n++; continue; }
    const four = useRng(g, r => r.shuffle([...pool]).slice(0, 4));
    const seed = useRng(g, r => r.nextU32());
    const mk = createMarket(`x${++g.marketCounter}`, four, rank, seed, g.day);
    botsTrade(mk, 4);
    g.markets.push(mk);
    n++;
  }
  // keep the list compact: archive old settled/cancelled markets
  const finished = g.markets.filter(m => m.status === 'settled' || m.status === 'cancelled');
  if (finished.length > 3) {
    for (const m of finished.slice(0, finished.length - 3)) {
      g.archive.push({ id: m.id, title: m.title, names: m.names, result: m.result, placements: m.placements, pnl: m.player.realized, day: g.day, status: m.status, prices: m.history[m.history.length - 1].p });
      g.markets.splice(g.markets.indexOf(m), 1);
    }
    if (g.archive.length > 60) g.archive.splice(0, g.archive.length - 60);
  }
}

export function marketById(g: GameState, id: string) { return g.markets.find(m => m.id === id); }

export function exchangeTrade(g: GameState, id: string, outcome: number, shares: number): string | null {
  const m = marketById(g, id); if (!m) return 'No market';
  const res = playerTrade(m, outcome, shares, g.player.bankroll);
  if (!res.ok) return res.error ?? 'Trade failed';
  const verb = shares > 0 ? 'Bought' : 'Sold';
  ledger(g, res.cashDelta, 'exchange', `${verb} ${Math.abs(shares)} × ${m.names[outcome]} @ ${m.title}`);
  g.ledgerTotals['sink:fees'] = (g.ledgerTotals['sink:fees'] ?? 0) + res.fee;
  g.stats.exchangeTrades++;
  botsTrade(m, 1); // the crowd reacts to your order flow
  checkAchievements(g);
  return null;
}

export function startMarketMatch(g: GameState, id: string): string | null {
  const m = marketById(g, id); if (!m) return 'No market';
  if (m.status !== 'open') return 'Already started';
  // deterministic pre-match withdrawal check (rare): market is cancelled and refunded
  const w = new Rng(mix(m.matchSeed, 'withdraw'));
  if (w.chance(0.03)) {
    const who = m.names[w.int(4)];
    const refund = cancel(m, `${who} withdrew before the match`);
    if (refund) ledger(g, refund, 'exchange', `Refund: ${m.title} cancelled`, `refund:${m.id}`);
    notify(g, 'settlement', `${m.title} cancelled — ${who} withdrew. Positions refunded at cost ($${(refund / 100).toFixed(2)}).`);
    ensureMarkets(g);
    return null;
  }
  goLive(m, g.rivals);
  return null;
}

export function marketNextHand(g: GameState, id: string): boolean {
  const m = marketById(g, id); if (!m) return false;
  if (m.status === 'open') startMarketMatch(g, id);
  if (m.status !== 'live') return false;
  const done = advanceHand(m);
  if (done) settleMarket(g, id);
  return done;
}

export function marketFastForward(g: GameState, id: string) {
  const m = marketById(g, id); if (!m) return;
  if (m.status === 'open') startMarketMatch(g, id);
  let guard = 0;
  while (m.status === 'live' && guard++ < 1000) marketNextHand(g, id);
}

export function settleMarket(g: GameState, id: string) {
  const m = marketById(g, id); if (!m || m.status !== 'live' || !m.match?.done) return;
  const before = m.player.realized;
  const s = settle(m);
  if (s.already) return;
  if (s.payout > 0) ledger(g, s.payout, 'exchange', `Settlement: ${m.names[m.result]} won ${m.title}`, s.key);
  const pnl = m.player.realized - before;
  g.stats.exchangePnl += m.player.realized;
  g.stats.marketsSettled++;
  // the same canonical result feeds rival careers
  const entry = RANKS[m.rank].entry;
  recordRivalResult(g.rivals, m.rivalIds, m.placements, prizeTable(entry), entry);
  if (m.player.fees > 0 || s.payout > 0) notify(g, 'settlement', `${m.names[m.result]} wins ${m.title}. Your contracts paid $${(s.payout / 100).toFixed(2)} (P/L on this market ${fmtSigned(m.player.realized)}).`);
  void pnl;
  ensureMarkets(g);
  checkAchievements(g);
}

export function fmtSigned(c: number) { return (c >= 0 ? '+' : '−') + '$' + (Math.abs(c) / 100).toFixed(2); }

// ------------------------------------------------------------------ Forge
export function forgeDiscount(g: GameState) { const a = g.empire.academy ?? 0; return a >= 2 ? 0.18 : a === 1 ? 0.1 : 0; }
export function priceOf(g: GameState, base: number) { return Math.round(base * (1 - forgeDiscount(g))); }

export function buyAbility(g: GameState, defId: string): string | null {
  const d = ABILITY_MAP[defId]; if (!d || d.fusion) return 'Not for sale';
  if (d.unlockRank > g.player.rank) return `Requires ${RANKS[d.unlockRank].name}`;
  if (g.player.owned.some(o => o.defId === defId)) return 'Already owned';
  const cost = priceOf(g, d.price);
  if (!ledger(g, -cost, 'forge', `Bought ${d.name}`)) return 'Not enough Dollars';
  const inst = grantAbility(g, defId);
  if (g.player.loadout.length < 8) g.player.loadout.push(inst.uid);
  notify(g, 'unlock', `New ability: ${d.name}!`);
  checkAchievements(g);
  return null;
}

export function upgradeAbility(g: GameState, uid: string): string | null {
  const o = g.player.owned.find(x => x.uid === uid); if (!o) return 'Not owned';
  if (o.level >= 3) return 'Already at maximum level';
  const d = ABILITY_MAP[o.defId];
  const cost = priceOf(g, upgradeCost(d, o.level + 1));
  if (!ledger(g, -cost, 'forge', `Upgraded ${d.name} to level ${o.level + 1}`)) return 'Not enough Dollars';
  o.level++;
  notify(g, 'purchase', `${d.name} reforged to level ${o.level}.`);
  return null;
}

export function applySigil(g: GameState, uid: string, sigil: SigilId): string | null {
  if (g.player.rank < 2) return 'Sigil crafting unlocks at Gladiator';
  const o = g.player.owned.find(x => x.uid === uid); if (!o) return 'Not owned';
  const d = ABILITY_MAP[o.defId];
  const s = SIGILS[sigil];
  if (!s.appliesTo(d)) return `${s.name} cannot bind to ${d.name}`;
  if (o.sigil === sigil) return 'Already bound';
  if (!ledger(g, -priceOf(g, s.price), 'forge', `Bound ${s.name} to ${d.name}`)) return 'Not enough Dollars';
  o.sigil = sigil;
  return null;
}

export function removeSigil(g: GameState, uid: string): string | null {
  const o = g.player.owned.find(x => x.uid === uid); if (!o || !o.sigil) return 'No sigil';
  delete o.sigil;
  return null;
}

export function fusionRecipes() { return ABILITIES.filter(a => a.fusion); }

export function fuse(g: GameState, fusionId: string): string | null {
  const d = ABILITY_MAP[fusionId]; if (!d?.fusion) return 'Not a fusion';
  if (g.player.rank < d.unlockRank) return `Fusions unlock at ${RANKS[d.unlockRank].name}`;
  if (g.player.owned.some(o => o.defId === fusionId)) return 'Already forged';
  const [a, b] = d.fusion;
  const ia = g.player.owned.find(o => o.defId === a), ib = g.player.owned.find(o => o.defId === b);
  if (!ia || !ib) return `Requires ${ABILITY_MAP[a].name} and ${ABILITY_MAP[b].name}`;
  if (!ledger(g, -priceOf(g, d.price), 'forge', `Forged ${d.name}`)) return 'Not enough Dollars';
  const lvl = Math.max(1, Math.min(3, Math.floor((ia.level + ib.level) / 2)));
  g.player.owned = g.player.owned.filter(o => o !== ia && o !== ib);
  g.player.loadout = g.player.loadout.filter(u => u !== ia.uid && u !== ib.uid);
  for (const pr of g.player.presets) pr.uids = pr.uids.filter(u => u !== ia.uid && u !== ib.uid);
  const inst = grantAbility(g, fusionId, lvl);
  g.player.loadout.push(inst.uid);
  notify(g, 'unlock', `Legendary fusion forged: ${d.name}!`);
  checkAchievements(g);
  return null;
}

/** Dismantle (respec): return 40% of the ability's purchase price. Starter abilities return nothing. */
export function dismantle(g: GameState, uid: string): string | null {
  const o = g.player.owned.find(x => x.uid === uid); if (!o) return 'Not owned';
  const d = ABILITY_MAP[o.defId];
  const refund = Math.round(d.price * 0.4);
  g.player.owned = g.player.owned.filter(x => x !== o);
  g.player.loadout = g.player.loadout.filter(u => u !== uid);
  for (const pr of g.player.presets) pr.uids = pr.uids.filter(u => u !== uid);
  if (refund) ledger(g, refund, 'forge', `Dismantled ${d.name}`);
  return null;
}

export function setLoadout(g: GameState, uids: string[]): string | null {
  const uniq = [...new Set(uids)].filter(u => g.player.owned.some(o => o.uid === u));
  if (uniq.length > 8) return 'Maximum 8 abilities';
  g.player.loadout = uniq;
  return null;
}
export function toggleEquip(g: GameState, uid: string): string | null {
  const l = g.player.loadout;
  if (l.includes(uid)) return setLoadout(g, l.filter(u => u !== uid));
  if (l.length >= 8) return 'Arsenal full (8 slots)';
  return setLoadout(g, [...l, uid]);
}
export function savePreset(g: GameState, name: string) {
  const i = g.player.presets.findIndex(p => p.name === name);
  const pr = { name: name || `Build ${g.player.presets.length + 1}`, uids: [...g.player.loadout] };
  if (i >= 0) g.player.presets[i] = pr; else g.player.presets.push(pr);
  if (g.player.presets.length > 6) g.player.presets.shift();
}
export function loadPreset(g: GameState, i: number) { const p = g.player.presets[i]; if (p) setLoadout(g, p.uids); }

// ------------------------------------------------------------------ Empire
export function buyAsset(g: GameState, id: string): string | null {
  const a = ASSET_MAP[id]; if (!a) return 'Unknown asset';
  const lv = g.empire[id] ?? 0;
  if (lv >= a.levels.length) return 'Fully developed';
  if (g.player.rank < a.unlockRank) return `Requires ${RANKS[a.unlockRank].name}`;
  const L = a.levels[lv];
  if (!ledger(g, -L.cost, 'empire', `${lv ? 'Expanded' : 'Purchased'} ${a.name} (level ${lv + 1})`)) return 'Not enough Dollars';
  g.empire[id] = lv + 1;
  notify(g, 'purchase', `${a.name} ${lv ? 'expanded' : 'acquired'}! ${L.effect}`);
  checkAchievements(g);
  return null;
}
export function sellAsset(g: GameState, id: string): string | null {
  const a = ASSET_MAP[id]; const lv = g.empire[id] ?? 0;
  if (!a || lv <= 0) return 'Not owned';
  const refund = Math.round(a.levels[lv - 1].cost * SELL_REFUND);
  ledger(g, refund, 'empire', `Sold ${a.name} level ${lv}`);
  g.empire[id] = lv - 1;
  return null;
}
export function buyCosmetic(g: GameState, id: string): string | null {
  const c = COSMETICS.find(x => x.id === id); if (!c) return 'Unknown';
  if (g.player.cosmetics.includes(id)) return 'Owned';
  if (g.player.rank < c.unlockRank && g.player.prestige === 0) return `Requires ${RANKS[c.unlockRank].name}`;
  if (c.requires && !(g.empire[c.requires] > 0)) return `Requires ${ASSET_MAP[c.requires].name}`;
  if (!ledger(g, -c.price, 'cosmetic', `Bought ${c.name}`)) return 'Not enough Dollars';
  g.player.cosmetics.push(id);
  equipCosmetic(g, id);
  return null;
}
export function equipCosmetic(g: GameState, id: string) {
  const c = COSMETICS.find(x => x.id === id); if (!c || !g.player.cosmetics.includes(id)) return;
  g.player.equipped[c.kind] = c.kind === 'title' && g.player.equipped.title === id ? '' : id;
}

export function canAscend(g: GameState) { return g.player.rank === RANKS.length - 1 && g.player.rating >= RANKS[RANKS.length - 1].threshold + 60; }
/** Prestige: return to Peasant with a laurel. Cosmetic/Glory only — no competitive power. */
export function ascend(g: GameState): string | null {
  if (!canAscend(g)) return `Reach ${RANKS[RANKS.length - 1].threshold + 60} rating as Augustus`;
  g.player.prestige++;
  g.player.rank = 0;
  g.player.rating = START_RATING;
  notify(g, 'promotion', `ASCENSION ${g.player.prestige}! You begin again as a legend among Peasants.`);
  checkAchievements(g);
  return null;
}

// ------------------------------------------------------------------ Objectives & achievements
export function nextObjective(g: GameState): string {
  const p = g.player;
  if (g.active) return 'Finish your match in the arena.';
  if (p.matches === 0) return 'Press PLAY to fight your first match.';
  if (p.bankroll < RECOVERY_THRESHOLD) return 'Low funds: play a free Bread & Circuses match to rebuild.';
  if (p.rank < RANKS.length - 1) {
    const nr = RANKS[p.rank + 1];
    if (trialAvailable(p.rank, p.rating)) return `Your ${nr.name} Promotion Trial is ready!`;
    if (g.stats.exchangeTrades === 0 && p.matches >= 2) return 'Visit the EXCHANGE and back a rival in an AI match.';
    if (p.owned.length <= 5 && p.bankroll > 8000) return 'Visit the FORGE to buy a new ability.';
    if (Object.keys(g.empire).length === 0 && p.rank >= 1 && p.bankroll > 45000) return 'Acquire your first property in the EMPIRE.';
    return `Earn ${nr.threshold - p.rating} more rating to unlock the ${nr.name} trial.`;
  }
  if (canAscend(g)) return 'You may ASCEND to begin a prestige cycle.';
  return `Reach ${RANKS[8].threshold + 60} rating to unlock Ascension.`;
}

export const ACHIEVEMENTS: { id: string; name: string; desc: string; test: (g: GameState) => boolean }[] = [
  { id: 'first_blood', name: 'First Blood', desc: 'Win an arena match.', test: g => g.player.wins >= 1 },
  { id: 'veteran', name: 'Veteran', desc: 'Play 25 matches.', test: g => g.player.matches >= 25 },
  { id: 'promoted', name: 'Rising Star', desc: 'Pass a promotion trial.', test: g => g.player.trialsPassed >= 1 },
  { id: 'centurion', name: 'Hundred-Commander', desc: 'Reach Centurion.', test: g => g.player.rank >= 3 },
  { id: 'consul', name: 'Voice of the Senate', desc: 'Reach Consul.', test: g => g.player.rank >= 5 },
  { id: 'augustus', name: 'Divine Majesty', desc: 'Reach Augustus.', test: g => g.player.rank >= 8 },
  { id: 'ascended', name: 'Eternal', desc: 'Ascend once.', test: g => g.player.prestige >= 1 },
  { id: 'trader', name: 'Mercator', desc: 'Make 10 Exchange trades.', test: g => g.stats.exchangeTrades >= 10 },
  { id: 'oracle', name: 'Oracle', desc: 'Earn $100 total profit on the Exchange.', test: g => (g.ledgerTotals.exchange ?? 0) >= 10000 },
  { id: 'landlord', name: 'Landlord', desc: 'Own a property.', test: g => Object.values(g.empire).some(v => v > 0) },
  { id: 'magnate', name: 'Magnate', desc: 'Own 4 different properties.', test: g => Object.values(g.empire).filter(v => v > 0).length >= 4 },
  { id: 'collector', name: 'Collector', desc: 'Own 15 abilities.', test: g => g.player.owned.length >= 15 },
  { id: 'fusion', name: 'Alchemist', desc: 'Forge a legendary fusion.', test: g => g.player.owned.some(o => ABILITY_MAP[o.defId]?.fusion) },
  { id: 'streak', name: 'Unstoppable', desc: 'Win 3 matches in a row.', test: g => g.stats.bestStreak >= 3 },
  { id: 'rich', name: 'Crassus Reborn', desc: 'Hold $5,000.', test: g => g.player.bankroll >= 500000 },
];
export function checkAchievements(g: GameState) {
  for (const a of ACHIEVEMENTS) if (!g.achievements.includes(a.id) && a.test(g)) { g.achievements.push(a.id); notify(g, 'achievement', `Achievement: ${a.name} — ${a.desc}`); }
}

export function netWorth(g: GameState): number {
  const pos = g.markets.reduce((s, m) => s + (m.status === 'open' || m.status === 'live' ? m.player.cost.reduce((a, b) => a + b, 0) : 0), 0);
  let assets = 0;
  for (const a of ASSETS) for (let k = 0; k < (g.empire[a.id] ?? 0); k++) assets += a.levels[k].cost * SELL_REFUND;
  return g.player.bankroll + pos + assets;
}
export { tradingOpen, RANKS };
