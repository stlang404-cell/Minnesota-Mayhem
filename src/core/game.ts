import { ABILITIES, ABILITY_MAP, AbilityInstance, SIGILS, SigilId, STARTER_ABILITIES, upgradeCost } from './abilities';
import { AIProfile, PublicStats } from './ai';
import { ASSET_MAP, ASSETS, COSMETICS, dailyNet, SELL_REFUND } from './empire';
import {
  advanceAction, advanceHand, allBooks, bookOf, bookTitle, botsTrade, cancel, createMarket, goLive, lockResolvedBooks, Market, playerTrade, realizedTotal, settle, tradingOpen,
} from './market';
import { act, activate, createMatch, LoadoutEntry, MatchPlayer, MatchState, rewardMultiplierPct, runUntilBlocked } from './match';
import { GAUNTLET_PAYOUT, GAUNTLET_STAGES, MODES, ModeKind, todaySeed, TOURNAMENT_RUNNER_UP, TOURNAMENT_SPLIT } from './modes';
import { addReputation, HallEntry, nameOf, news, NewsItem, retireAndReplace, SeasonState, seasonPoints, seasonTick } from './world';
import { Action } from './poker';
import {
  applyRating, prizeTable, RANKS, ratingDeltas, RECOVERY_PRIZES, RECOVERY_THRESHOLD, START_RATING, TRIAL_FAIL_PENALTY,
  TRIAL_PASS_PLACE, trialAvailable,
} from './ranks';
import {
  evolveRivals, makePopulation, pickOpponents, rebalancePopulation, recordRivalResult, Rival, samplePlacement, winProbabilities,
} from './rivals';
import { mix, Rng, RngState } from './rng';

export const SAVE_VERSION = 4;
export const STARTING_BANKROLL = 50000; // $500.00
export const PODIUM_BONUS = [6, 3, 0, 0];

export type ArenaKind = ModeKind;

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
  equipped: { cardback: string; felt: string; title: string; frame: string; banner: string; victory: string };
  uidCounter: number;
  bankruptcies: number;
  // ---- v4 ----
  career: { hands: number; handsWon: number; biggestPot: number; decisions: number; abilitiesArmed: number; abilityTriggers: number };
  modeCounts: Record<string, number>;
  rivalWins: Record<string, number>;
  titles: number;
  tournaments: number;
  gauntletBest: number;
}

export interface ActiveMatch {
  match: MatchState; kind: ArenaKind; entry: number; prizes: number[]; rivalIds: string[]; day: number; rankAtStart: number; key: string;
  ratingScale: number; gloryScale: number; meta?: any;
}
export interface TournamentState { id: string; entry: number; pool: number; tables: string[][]; heatWinners: string[]; heatRunnersUp: string[]; stage: 'heat' | 'final'; day: number; finalOrder: string[] }
export interface TradeLogEntry { t: number; day: number; market: string; book: string; label: string; shares: number; cents: number; fee: number }

export interface MatchReport {
  key: string; kind: ArenaKind; place: number; prize: number; entry: number; ratingDelta: number; newRating: number;
  trial?: 'passed' | 'failed'; newRank?: number; glory: number; rebate: number; sponsor: number; bonusPct: number;
  opponents: { id: string; name: string; place: number }[]; hands: number; abilityTriggers: number; notes?: string[];
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
  settings: { sound: boolean; reducedMotion: boolean; speed: number; autoSave: boolean; volume: number };
  stats: { exchangeTrades: number; exchangePnl: number; marketsSettled: number; bestStreak: number; streak: number; earnedPrizes: number; propertyIncome: number };
  // ---- v4: Imperial Ascension ----
  reputation: Record<string, PublicStats>;
  news: NewsItem[];
  season: SeasonState;
  hall: HallEntry[];
  retired: { id: string; name: string; rank: number; wins: number; matches: number; titles: number; day: number }[];
  gauntlet: { stage: number; entry: number; alive: boolean } | null;
  draft: { options: string[][]; picks: string[] } | null;
  daily: { date: number; best: number; attempts: number };
  tournament: TournamentState | null;
  tournamentHistory: { id: string; day: number; champion: string; finalists: string[]; playerResult: number }[];
  tutorial: { step: number; done: boolean };
  watchlist: string[];
  tradeLog: TradeLogEntry[];
  ceremony: number | null;
  migratedFrom?: number;
}

export function v4PlayerDefaults() {
  return { career: { hands: 0, handsWon: 0, biggestPot: 0, decisions: 0, abilitiesArmed: 0, abilityTriggers: 0 }, modeCounts: {}, rivalWins: {}, titles: 0, tournaments: 0, gauntletBest: 0 };
}
export function v4WorldDefaults(day: number) {
  return {
    reputation: {}, news: [], season: { n: 1, start: day, points: {} }, hall: [], retired: [], gauntlet: null, draft: null,
    daily: { date: 0, best: -1, attempts: 0 }, tournament: null, tournamentHistory: [], tutorial: { step: 0, done: false },
    watchlist: [], tradeLog: [], ceremony: null,
  };
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
      cosmetics: ['back_crimson', 'felt_green', 'frame_bronze', 'banner_crimson', 'victory_laurels'], equipped: { cardback: 'back_crimson', felt: 'felt_green', title: '', frame: 'frame_bronze', banner: 'banner_crimson', victory: 'victory_laurels' }, uidCounter: 0, bankruptcies: 0,
      ...v4PlayerDefaults(),
    },
    rivals, markets: [], archive: [], active: null, lastReport: null, empire: {}, ledger: [], ledgerTotals: {}, appliedKeys: [],
    achievements: [], notices: [], counter: 0, marketCounter: 0, matchCounter: 0,
    settings: { sound: true, reducedMotion: false, speed: 1, autoSave: true, volume: 0.7 },
    stats: { exchangeTrades: 0, exchangePnl: 0, marketsSettled: 0, bestStreak: 0, streak: 0, earnedPrizes: 0, propertyIncome: 0 },
    ...v4WorldDefaults(1),
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

/** Build a MatchPlayer for a rival including public reputation & familiarity (memory). */
export function rivalPlayer(g: GameState, r: Rival, skillBonus = 0): MatchPlayer {
  const fam: Record<string, number> = { player: r.vsPlayer.wins + r.vsPlayer.losses };
  return { id: r.id, name: r.name, isHuman: false, loadout: r.loadout, profile: skillBonus ? { ...r.profile, skill: Math.min(0.97, r.profile.skill + skillBonus) } : r.profile, reputation: g.reputation[r.id], familiarity: fam };
}
function humanPlayer(g: GameState, loadout = loadoutEntries(g)): MatchPlayer {
  return { id: 'player', name: g.player.name, isHuman: true, loadout, profile: PLAYER_PROFILE, reputation: g.reputation.player };
}

export interface ArenaOption { kind: ArenaKind; name: string; icon: string; entry: number; prizes: number[]; available: boolean; reason: string; desc: string; group: 'core' | 'modes'; unlocked: boolean }

export function rivalTarget(g: GameState): Rival | undefined {
  return g.rivals.filter(r => Math.abs(r.rank - g.player.rank) <= 1 && (r.rivalry >= 2 || r.vsPlayer.wins + r.vsPlayer.losses >= 3))
    .sort((a, b) => b.rivalry - a.rivalry || b.vsPlayer.wins - a.vsPlayer.wins)[0];
}

export function arenaOptions(g: GameState, today = todaySeed()): ArenaOption[] {
  const p = g.player;
  const r = RANKS[p.rank];
  const base = prizeTable(r.entry);
  const out: ArenaOption[] = [];
  const opt = (kind: ArenaKind, entry: number, prizes: number[], unlockReason: string | null, extra: string | null = null, name?: string): void => {
    const d = MODES[kind];
    const unlocked = unlockReason === null;
    const reason = !unlocked ? unlockReason! : extra ? extra : p.bankroll < entry ? 'Not enough Dollars' : '';
    out.push({ kind, name: name ?? d.name, icon: d.icon, entry, prizes, available: unlocked && !reason, reason, desc: d.desc, group: d.group, unlocked });
  };
  opt('arena', r.entry, base, null, null, `Ranked: ${r.arena}`);
  if (p.rank < RANKS.length - 1) {
    const nr = RANKS[p.rank + 1];
    opt('trial', r.entry, base, null, trialAvailable(p.rank, p.rating) ? null : `Reach ${nr.threshold} rating`, `Promotion Trial: ${nr.name}`);
  }
  const club = g.empire.club ?? 0;
  if (club > 0) opt('club', r.entry, base.map(x => Math.round(x * (club >= 2 ? 1.4 : 1.25) * 0.85)), null);
  if ((g.empire.arena ?? 0) > 0) opt('grand', r.entry * 2, prizeTable(r.entry * 2).map(x => Math.round(x * 1.2)), null, g.day % 5 === 0 ? null : `Held every 5th day (day ${Math.ceil(g.day / 5) * 5})`);
  opt('recovery', 0, RECOVERY_PRIZES, null, p.bankroll < RECOVERY_THRESHOLD ? null : 'Only when your bankroll is below $40');
  // ---- additional modes (progressive disclosure) ----
  opt('quick', Math.round(r.entry / 2), prizeTable(Math.round(r.entry / 2)), p.matches >= 1 ? null : 'Play 1 match to unlock');
  opt('daily', 0, g.daily.date === today ? [0, 0, 0, 0] : [r.entry * 3, Math.round(r.entry * 1.5), Math.round(r.entry / 2), 0], p.matches >= 2 ? null : 'Play 2 matches to unlock',
    null, g.daily.date === today ? `Daily Challenge (best today: ${g.daily.best >= 0 ? ordinal(g.daily.best + 1) : '—'}, practice)` : 'Daily Challenge');
  opt('draft', r.entry, prizeTable(r.entry).map(x => Math.round(x * 1.1)), p.matches >= 3 ? null : 'Play 3 matches to unlock');
  const tgt = rivalTarget(g);
  opt('rival', r.entry, base, tgt ? null : 'Build a rivalry first (face the same rival 3 times)', null, tgt ? `Rival Challenge: ${tgt.name}` : 'Rival Challenge');
  const gEntry = r.entry * 2;
  opt('gauntlet', g.gauntlet ? 0 : gEntry, GAUNTLET_PAYOUT.map(x => Math.round(x * gEntry)), p.rank >= 1 ? null : 'Unlocks at Plebeian', null,
    g.gauntlet ? `Survival Gauntlet — stage ${g.gauntlet.stage + 1}` : 'Survival Gauntlet');
  const tEntry = r.entry * 2;
  opt('tournament', tEntry, TOURNAMENT_SPLIT.map(x => Math.round(x * tournamentPool(tEntry))), p.rank >= 1 && p.matches >= 5 ? null : 'Unlocks at Plebeian after 5 matches');
  opt('highroller', r.entry * 4, prizeTable(r.entry * 4).map(x => Math.round(x * 1.08)), p.rank >= 2 ? null : 'Unlocks at Gladiator');
  return out;
}
export const tournamentPool = (entry: number) => entry * 16 + entry * 2;

function pickRivals(g: GameState, rank: number, n: number, exclude: string[] = []): Rival[] {
  const busy = g.markets.filter(m => m.status === 'live').flatMap(m => m.rivalIds);
  return useRng(g, r => pickOpponents(g.rivals, rank, r, n, [...busy, ...exclude]));
}

/** Draft Arena: generate 8 rounds of 3 options from abilities unlocked up to rank+1. */
export function startDraft(g: GameState): string | null {
  if (g.draft) return null;
  const pool = ABILITIES.filter(a => !a.fusion && a.unlockRank <= g.player.rank + 1);
  const options = useRng(g, r => Array.from({ length: 8 }, () => r.shuffle([...pool]).slice(0, 3).map(a => a.id)));
  g.draft = { options, picks: [] };
  return null;
}
export function draftPick(g: GameState, id: string): string | null {
  const d = g.draft; if (!d) return 'No draft';
  const round = d.picks.length;
  if (round >= 8) return 'Draft complete';
  if (!d.options[round].includes(id)) return 'Not an option this round';
  if (d.picks.includes(id)) return 'Already drafted';
  d.picks.push(id);
  return null;
}

function seatAndCreate(g: GameState, players: MatchPlayer[], kind: ArenaKind, id: string, config?: any, shuffleSeed?: number): MatchState {
  const seed = shuffleSeed ?? useRng(g, r => r.nextU32());
  const order = shuffleSeed !== undefined ? new Rng(shuffleSeed).shuffle([0, 1, 2, 3]) : useRng(g, r => r.shuffle([0, 1, 2, 3]));
  const mk = kind === 'trial' ? 'trial' : kind === 'recovery' ? 'recovery' : 'arena';
  return createMatch(order.map(i => players[i]), seed, mk, config, id);
}

export function startArena(g: GameState, kind: ArenaKind, today = todaySeed()): string | null {
  if (g.active) return 'A match is already in progress';
  const opt = arenaOptions(g, today).find(o => o.kind === kind);
  if (!opt) return 'Unknown mode';
  if (!opt.available) return opt.reason || 'Unavailable';
  const def = MODES[kind];
  if (loadoutEntries(g).length === 0 && !['recovery', 'draft', 'daily'].includes(kind)) return 'Equip at least one ability';
  if (kind === 'draft' && (!g.draft || g.draft.picks.length < 8)) return 'Complete your draft first';
  const id = `pm${++g.matchCounter}_${g.day}`;
  const r = RANKS[g.player.rank];
  let entry = opt.entry;
  let prizes = opt.prizes;
  if (entry > 0 && !ledger(g, -entry, 'arena', `Entry fee: ${opt.name}`, `entry:${id}`)) return 'Not enough Dollars';
  let players: MatchPlayer[];
  let meta: any = undefined;
  let config = def.config;
  let shuffleSeed: number | undefined;
  switch (kind) {
    case 'trial': players = [humanPlayer(g), ...pickRivals(g, g.player.rank + 1, 3).map(x => rivalPlayer(g, x))]; break;
    case 'recovery': players = [humanPlayer(g), ...pickRivals(g, 0, 3).map(x => rivalPlayer(g, x))]; break;
    case 'highroller': players = [humanPlayer(g), ...pickRivals(g, g.player.rank, 3).map(x => rivalPlayer(g, x, def.skillBonus))]; break;
    case 'draft': players = [humanPlayer(g, g.draft!.picks.map(d => ({ defId: d, level: 2 }))), ...pickRivals(g, g.player.rank, 3).map(x => rivalPlayer(g, x))]; meta = { draft: [...g.draft!.picks] }; g.draft = null; break;
    case 'rival': {
      const tgt = rivalTarget(g)!;
      players = [humanPlayer(g), rivalPlayer(g, tgt), ...pickRivals(g, g.player.rank, 2, [tgt.id]).map(x => rivalPlayer(g, x))];
      meta = { target: tgt.id };
      break;
    }
    case 'daily': {
      const rng = new Rng(mix('daily', today));
      const pool = ABILITIES.filter(a => !a.fusion && a.unlockRank <= Math.max(1, g.player.rank));
      const lo = rng.shuffle([...pool]).slice(0, 6).map(a => ({ defId: a.id, level: 2 }));
      const cands = g.rivals.filter(x => x.rank === g.player.rank).sort((a, b) => a.id.localeCompare(b.id));
      const opp = rng.shuffle([...cands]).slice(0, 3);
      players = [humanPlayer(g, lo), ...opp.map(x => rivalPlayer(g, x))];
      shuffleSeed = mix('daily-seat', today) >>> 0;
      meta = { date: today, paid: g.daily.date !== today };
      if (g.daily.date !== today) g.daily = { date: today, best: -1, attempts: 0 };
      g.daily.attempts++;
      break;
    }
    case 'gauntlet': {
      if (!g.gauntlet) g.gauntlet = { stage: 0, entry, alive: true };
      const st = g.gauntlet.stage;
      players = [humanPlayer(g), ...pickRivals(g, Math.min(8, g.player.rank + (st >= 3 ? 1 : 0)), 3).map(x => rivalPlayer(g, x, 0.03 * st))];
      meta = { stage: st };
      prizes = [0, 0, 0, 0];
      break;
    }
    case 'tournament': {
      const field = pickRivals(g, g.player.rank, 15);
      const ids = ['player', ...field.map(f => f.id)];
      const order = useRng(g, rr => rr.shuffle(ids.slice(1)));
      const tables = [['player', ...order.slice(0, 3)], order.slice(3, 7), order.slice(7, 11), order.slice(11, 15)];
      g.tournament = { id, entry, pool: tournamentPool(entry), tables, heatWinners: [], heatRunnersUp: [], stage: 'heat', day: g.day, finalOrder: [] };
      players = tables[0].map(pid => pid === 'player' ? humanPlayer(g) : rivalPlayer(g, g.rivals.find(x => x.id === pid)!));
      meta = { stage: 'heat' };
      prizes = [0, 0, 0, 0];
      break;
    }
    default: players = [humanPlayer(g), ...pickRivals(g, g.player.rank, 3).map(x => rivalPlayer(g, x))];
  }
  const match = seatAndCreate(g, players, kind, id, config, shuffleSeed);
  g.active = { match, kind, entry, prizes, rivalIds: players.filter(p => !p.isHuman).map(p => p.id), day: g.day, rankAtStart: g.player.rank, key: id, ratingScale: def.ratingScale, gloryScale: def.gloryScale, meta };
  if (g.tutorial && !g.tutorial.done && g.tutorial.step === 0) g.tutorial.step = 1;
  return null;
}

export function playerSeat(m: MatchState): number { return m.players.findIndex(p => p.isHuman); }

export function playerAct(g: GameState, action: Action): string | null {
  const a = g.active; if (!a) return 'No match';
  const seat = playerSeat(a.match);
  if (a.match.table.toAct !== seat) return 'Not your turn';
  try { act(a.match, seat, action); } catch (e) { return (e as Error).message; }
  g.player.career.decisions++;
  return null;
}

export function playerActivate(g: GameState, defId: string): boolean {
  const a = g.active; if (!a) return false;
  const ok = activate(a.match, playerSeat(a.match), defId);
  if (ok) g.player.career.abilitiesArmed++;
  return ok;
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

/** Simulate an AI-only table (canonical result) and record it everywhere. */
function simulateTable(g: GameState, ids: string[], seed: number, entry: number, label: string): string[] {
  const rs = ids.map(id => g.rivals.find(r => r.id === id)!);
  const m = createMatch(rs.map(r => rivalPlayer(g, r)), seed, 'exhibition', undefined, label);
  m.aiIters = 60;
  runUntilBlocked(m);
  recordWorldMatch(g, m, entry, 0.5);
  return m.placementIds;
}

/** One canonical write path for every fully simulated match: careers, season, reputation, news. */
export function recordWorldMatch(g: GameState, m: MatchState, entry: number, seasonWeight = 1, prizes = prizeTable(entry)) {
  const ids = m.placementIds;
  const rivalIds = ids.filter(id => id !== 'player');
  const ratings = rivalIds.map(id => g.rivals.find(r => r.id === id)?.rating ?? 1000);
  recordRivalResult(g.rivals, rivalIds, rivalIds.map(id => ids.indexOf(id)), prizes, entry, ratings);
  seasonPoints(g, ids, ids.map((_, i) => i), seasonWeight);
  m.players.forEach((p, seat) => addReputation(g, p.id, m.stats[seat]));
}

export function finishActiveMatch(g: GameState): MatchReport | null {
  const a = g.active;
  if (!a || !a.match.done) return null;
  const key = `result:${a.key}`;
  if (g.appliedKeys.includes(key)) { g.active = null; return g.lastReport; }
  const m = a.match;
  const forfeitSeat = (m as any).forfeitSeat;
  const seat = playerSeat(m) >= 0 ? playerSeat(m) : forfeitSeat;
  const pid = 'player';
  let order = m.placementIds.slice();
  if (forfeitSeat !== undefined) order = [...order.filter(id => id !== pid), pid];
  const place = order.indexOf(pid);
  const p = g.player;
  const rankIdx = p.rank;
  const notes: string[] = [];
  const bonusPct = rewardMultiplierPct(m, seat);
  const basePrize = a.prizes[place] ?? 0;
  const prize = basePrize > 0 ? Math.round(basePrize * (1 + bonusPct / 100)) : 0;
  const rebatePct = m.arsenal[seat].rebatePct;
  const insurance = m.arsenal[seat].x?.insurancePct ?? 0;
  const rebate = a.entry > 0 ? Math.round(a.entry * Math.max(place >= 2 ? rebatePct : 0, place === 3 ? insurance : 0) / 100) : 0;
  const sponsorLv = g.empire.sponsor ?? 0;
  const sponsorable = ['arena', 'club', 'grand', 'highroller', 'rival', 'quick'].includes(a.kind);
  const sponsor = sponsorLv && sponsorable && place <= 1 && a.entry > 0 ? Math.round(a.entry * (sponsorLv >= 2 ? 0.7 : 0.4)) : 0;
  if (prize) ledger(g, prize, 'arena', `Prize: ${ordinal(place + 1)} place${bonusPct ? ` (+${bonusPct}% Arsenal bonus)` : ''}`, `prize:${a.key}`);
  if (rebate) ledger(g, rebate, 'arena', `Arsenal rebate on entry`, `rebate:${a.key}`);
  if (sponsor) ledger(g, sponsor, 'empire', 'Sponsorship bonus for a top-2 finish', `sponsor:${a.key}`);
  g.stats.earnedPrizes += prize;

  // ---- rating ----
  let ratingDelta = 0;
  let trial: MatchReport['trial'];
  let newRank: number | undefined;
  const ratings = order.map(id => id === pid ? p.rating : (g.rivals.find(r => r.id === id)?.rating ?? 1000));
  if (a.kind === 'trial') {
    const d = ratingDeltas(ratings, order.map((_, i) => i))[place];
    if (place <= TRIAL_PASS_PLACE) {
      trial = 'passed'; p.rank = Math.min(RANKS.length - 1, p.rank + 1); newRank = p.rank; p.trialsPassed++;
      p.rating = Math.max(p.rating, RANKS[p.rank].threshold) + Math.max(0, d);
      ratingDelta = Math.max(0, d);
      notify(g, 'promotion', `PROMOTED to ${RANKS[p.rank].name}! ${RANKS[p.rank].unlock} unlocked.`);
      news(g, 'player', `${p.name} is promoted to ${RANKS[p.rank].name}!`, ['player']);
      g.ceremony = p.rank;
    } else {
      trial = 'failed'; p.trialsFailed++;
      const before = p.rating;
      p.rating = applyRating(p.rank, p.rating, -TRIAL_FAIL_PENALTY);
      ratingDelta = p.rating - before;
      notify(g, 'warning', `Trial failed. You keep your rank; rating −${before - p.rating}. Try again when ready.`);
    }
  } else if (a.ratingScale > 0) {
    const d = ratingDeltas(ratings, order.map((_, i) => i))[place];
    const before = p.rating;
    p.rating = applyRating(p.rank, p.rating, Math.round((d + PODIUM_BONUS[place]) * a.ratingScale));
    ratingDelta = p.rating - before;
  }
  p.peakRating = Math.max(p.peakRating, p.rating);
  p.matches++;
  p.modeCounts[a.kind] = (p.modeCounts[a.kind] ?? 0) + 1;
  if (place === 0) { p.wins++; g.stats.streak++; g.stats.bestStreak = Math.max(g.stats.bestStreak, g.stats.streak); } else g.stats.streak = 0;
  if (place <= 1) p.top2++;
  const glory = Math.round(([100, 40, 10, 0][place] * (rankIdx + 1)) * a.gloryScale * ((g.empire.estate ?? 0) ? 1.25 : 1) * ((g.empire.palace ?? 0) ? 1.1 : 1) * (1 + 0.1 * p.prestige));
  p.glory += glory;
  const c = p.career;
  c.hands += m.table.handNo;
  c.biggestPot = Math.max(c.biggestPot, ...m.history.filter(h => h.winners.includes(seat)).map(h => h.pot), 0);
  c.handsWon += m.history.filter(h => h.winners.includes(seat)).length;
  c.abilityTriggers += m.arsenal[seat].triggers;

  // ---- world: rivals, season, reputation ----
  const entryForRivals = a.entry || RANKS[0].entry;
  recordWorldMatch(g, m, entryForRivals, a.kind === 'quick' ? 0.5 : a.kind === 'recovery' || a.kind === 'daily' ? 0 : 1, a.prizes.some(x => x > 0) ? a.prizes : prizeTable(entryForRivals));
  const rivalIds = order.filter(id => id !== pid);
  for (const id of rivalIds) {
    const r = g.rivals.find(x => x.id === id); if (!r) continue;
    const theirPlace = order.indexOf(id);
    if (theirPlace < place) { r.vsPlayer.wins++; r.rivalry += 1; } else { r.vsPlayer.losses++; r.rivalry += 0.5; }
  }

  // ---- mode-specific resolution ----
  if (a.kind === 'rival' && a.meta?.target) {
    const tp = order.indexOf(a.meta.target);
    const tname = nameOf(g, a.meta.target);
    if (place < tp) {
      const bounty = Math.round(a.entry * 1.5);
      ledger(g, bounty, 'arena', `Rival bounty: finished ahead of ${tname}`, `bounty:${a.key}`);
      p.rivalWins[a.meta.target] = (p.rivalWins[a.meta.target] ?? 0) + 1;
      notes.push(`Bounty claimed: ahead of ${tname} (+${(bounty / 100).toFixed(2)})`);
      const w = p.rivalWins[a.meta.target];
      if (w === 1 || w === 3 || w === 5) news(g, 'player', `${p.name} bests rival ${tname} for the ${ordinal(w)} time.`, ['player', a.meta.target]);
    } else notes.push(`${tname} finished ahead of you. The rivalry deepens.`);
  }
  if (a.kind === 'daily') {
    if (g.daily.best < 0 || place < g.daily.best) g.daily.best = place;
    notes.push(a.meta?.paid ? 'Daily Challenge result recorded.' : 'Practice run (today\'s prize already claimed).');
  }
  if (a.kind === 'draft') notes.push('Your drafted Arsenal returns to the Forge vaults.');
  if (a.kind === 'gauntlet' && g.gauntlet) {
    const gs = g.gauntlet;
    if (place <= 1) {
      gs.stage++;
      if (gs.stage >= GAUNTLET_STAGES) { cashOutGauntlet(g); notes.push('GAUNTLET CONQUERED! The maximum purse is yours.'); }
      else notes.push(`Stage ${gs.stage} cleared. Cash out ${(Math.round(GAUNTLET_PAYOUT[gs.stage - 1] * gs.entry) / 100).toFixed(2)} or continue.`);
    } else {
      notes.push(`Eliminated from the Gauntlet at stage ${gs.stage + 1}.`);
      news(g, 'player', `${p.name} falls in stage ${gs.stage + 1} of the Survival Gauntlet.`, ['player']);
      g.gauntlet = null;
    }
  }
  let tournamentDone = true;
  if (a.kind === 'tournament' && g.tournament) tournamentDone = advanceTournament(g, a, order, notes);

  const report: MatchReport = {
    key: a.key, kind: a.kind, place, prize, entry: a.entry, ratingDelta, newRating: p.rating, trial, newRank, glory, rebate, sponsor, bonusPct,
    opponents: rivalIds.map(id => ({ id, name: nameOf(g, id), place: order.indexOf(id) })),
    hands: m.table.handNo, abilityTriggers: m.arsenal[seat].triggers, notes,
  };
  if (place === 0) notify(g, 'victory', `Victory${a.kind === 'trial' ? ' in the trial' : ''}! ${prize ? '+$' + (prize / 100).toFixed(2) : ''}`);
  g.appliedKeys.push(key);
  g.lastReport = report;
  if (g.active === a) g.active = null;
  if (tournamentDone) advanceDay(g);
  if (g.tutorial && !g.tutorial.done && g.tutorial.step <= 3) g.tutorial.step = 4;
  checkAchievements(g);
  return report;
}

export function cashOutGauntlet(g: GameState): string | null {
  const gs = g.gauntlet;
  if (!gs || gs.stage === 0) return 'Nothing to cash out';
  if (g.active?.kind === 'gauntlet') return 'Finish the current stage first';
  const amount = Math.round(GAUNTLET_PAYOUT[Math.min(gs.stage, GAUNTLET_STAGES) - 1] * gs.entry);
  ledger(g, amount, 'arena', `Survival Gauntlet cash-out after stage ${gs.stage}`, `gauntlet:${gs.entry}:${g.matchCounter}`);
  news(g, 'player', `${g.player.name} survives ${gs.stage} stage(s) of the Gauntlet and cashes out $${(amount / 100).toFixed(2)}.`, ['player']);
  notify(g, 'victory', `Gauntlet cash-out: +$${(amount / 100).toFixed(2)}`);
  if (gs.stage >= 3) g.player.gauntletBest = Math.max(g.player.gauntletBest, gs.stage);
  else g.player.gauntletBest = Math.max(g.player.gauntletBest, gs.stage);
  g.gauntlet = null;
  return null;
}

/** Imperial Tournament flow. Returns true when the whole tournament has finished. */
function advanceTournament(g: GameState, a: ActiveMatch, order: string[], notes: string[]): boolean {
  const T = g.tournament!;
  const pay = (id: string, frac: number, label: string) => {
    const amt = Math.round(T.pool * frac);
    if (id === 'player') ledger(g, amt, 'arena', `Imperial Tournament: ${label}`, `tour:${T.id}:${label}`);
    else { const r = g.rivals.find(x => x.id === id); if (r) { r.bankroll += amt; r.career.earnings += amt; } }
  };
  if (T.stage === 'heat') {
    T.heatWinners.push(order[0]); T.heatRunnersUp.push(order[1]);
    T.tables.slice(1).forEach((tb, i) => {
      const res = simulateTable(g, tb, mix(T.id, 'heat', i), T.entry, `${T.id}h${i}`);
      T.heatWinners.push(res[0]); T.heatRunnersUp.push(res[1]);
    });
    T.heatRunnersUp.forEach(id => pay(id, TOURNAMENT_RUNNER_UP, 'heat runner-up'));
    if (order[0] === 'player') {
      T.stage = 'final';
      notes.push('You won your heat! The final table awaits.');
      const players = T.heatWinners.map(id => id === 'player' ? humanPlayer(g) : rivalPlayer(g, g.rivals.find(x => x.id === id)!));
      const fid = `${T.id}f`;
      const match = seatAndCreate(g, players, 'tournament', fid, undefined, mix(T.id, 'final'));
      g.active = { match, kind: 'tournament', entry: 0, prizes: [0, 0, 0, 0], rivalIds: T.heatWinners.filter(x => x !== 'player'), day: g.day, rankAtStart: g.player.rank, key: fid, ratingScale: 0, gloryScale: 3, meta: { stage: 'final' } };
      return false;
    }
    notes.push(order[1] === 'player' ? 'Heat runner-up: you earn a small share of the pool.' : 'Knocked out in the heats.');
    T.finalOrder = simulateTable(g, T.heatWinners, mix(T.id, 'final'), T.entry, `${T.id}f`);
  } else {
    T.finalOrder = order;
    const pl = order.indexOf('player');
    notes.push(`Final table: ${ordinal(pl + 1)} place.`);
    if (pl === 0) g.player.titles++;
  }
  T.finalOrder.forEach((id, i) => pay(id, TOURNAMENT_SPLIT[i], `${ordinal(i + 1)} place`));
  const champ = T.finalOrder[0];
  const r = g.rivals.find(x => x.id === champ); if (r) r.career.titles++;
  seasonPoints(g, T.finalOrder, [0, 1, 2, 3], 2);
  news(g, 'tournament', `${nameOf(g, champ)} wins the Imperial Tournament (${RANKS[g.player.rank].name} division), defeating ${T.finalOrder.slice(1).map(id => nameOf(g, id)).join(', ')} at the final table.`, T.finalOrder);
  g.tournamentHistory.push({ id: T.id, day: g.day, champion: champ, finalists: T.finalOrder, playerResult: T.finalOrder.includes('player') ? T.finalOrder.indexOf('player') + 1 : T.heatRunnersUp.includes('player') ? 5 : 9 });
  if (g.tournamentHistory.length > 30) g.tournamentHistory.shift();
  g.player.tournaments++;
  g.tournament = null;
  return true;
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
  // Background summarised matches among rivals (statistical, cheap); canonical once recorded
  useRng(g, rng => {
    for (let k = 0; k < 16; k++) {
      const rank = rng.int(RANKS.length);
      const busy = new Set(g.markets.filter(m => m.status === 'live' || m.status === 'open').flatMap(m => m.rivalIds));
      const pool = g.rivals.filter(r => r.rank === rank && !busy.has(r.id));
      if (pool.length < 4) continue;
      const four = rng.shuffle([...pool]).slice(0, 4);
      const probs = winProbabilities(four);
      const place = samplePlacement(four, rng);
      const w = place.indexOf(0);
      const entry = RANKS[rank].entry;
      recordRivalResult(g.rivals, four.map(r => r.id), place, prizeTable(entry), entry);
      seasonPoints(g, four.map(r => r.id), place, 0.5);
      if (probs[w] < 0.17) news(g, 'upset', `Upset in the ${RANKS[rank].arena}: ${four[w].name} (${Math.round(probs[w] * 100)}% favourite odds) beats ${four.filter((_, i) => i !== w).map(r => r.name).join(', ')}.`, four.map(r => r.id));
    }
    for (const ev of evolveRivals(g.rivals, rng)) news(g, ev.up ? 'promotion' : 'demotion', ev.up ? `${ev.name} is promoted to ${RANKS[ev.rank].name}.` : `${ev.name} drops to ${RANKS[ev.rank].name}.`, [ev.id]);
    retireAndReplace(g, rng);
    rebalancePopulation(g.rivals, rng);
  });
  seasonTick(g, (amount, reason, key) => { if (ledger(g, amount, 'season', reason, key)) notify(g, 'victory', `${reason}: +$${(amount / 100).toFixed(2)}`); });
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
      g.archive.push({ id: m.id, title: m.title, names: m.names, result: m.result, placements: m.placements, pnl: realizedTotal(m), day: g.day, status: m.status, prices: m.history[m.history.length - 1].p });
      g.markets.splice(g.markets.indexOf(m), 1);
    }
    if (g.archive.length > 60) g.archive.splice(0, g.archive.length - 60);
  }
}

export function marketById(g: GameState, id: string) { return g.markets.find(m => m.id === id); }

export function exchangeTrade(g: GameState, id: string, outcome: number, shares: number, bookIdx = -1): string | null {
  const m = marketById(g, id); if (!m) return 'No market';
  const bk = bookOf(m, bookIdx);
  const res = playerTrade(m, outcome, shares, g.player.bankroll, bookIdx);
  if (!res.ok) return res.error ?? 'Trade failed';
  const verb = shares > 0 ? 'Bought' : 'Sold';
  const label = bk.kind === 'winner' ? m.names[outcome] : bk.kind === 'first_out' ? `${bk.labels[outcome]} out first` : bk.labels[outcome];
  ledger(g, res.cashDelta, 'exchange', `${verb} ${Math.abs(shares)} × ${label} @ ${m.title}`);
  g.ledgerTotals['sink:fees'] = (g.ledgerTotals['sink:fees'] ?? 0) + res.fee;
  g.tradeLog.push({ t: ++g.counter, day: g.day, market: m.title, book: bookTitle(bk), label, shares, cents: res.cashDelta, fee: res.fee });
  if (g.tradeLog.length > 200) g.tradeLog.shift();
  g.stats.exchangeTrades++;
  botsTrade(m, 1); // the crowd reacts to your order flow
  if (g.tutorial && !g.tutorial.done && g.tutorial.step === 6) g.tutorial.step = 7;
  checkAchievements(g);
  return null;
}

export function toggleWatch(g: GameState, rivalId: string) {
  const i = g.watchlist.indexOf(rivalId);
  if (i >= 0) g.watchlist.splice(i, 1); else if (g.watchlist.length < 20) g.watchlist.push(rivalId);
}

/** Spectator step: one AI decision at a time. Settles automatically at the end. */
export function marketStep(g: GameState, id: string): { done: boolean; handEnded: boolean } {
  const m = marketById(g, id); if (!m) return { done: true, handEnded: false };
  if (m.status === 'open') startMarketMatch(g, id);
  if (m.status !== 'live') return { done: true, handEnded: false };
  const r = advanceAction(m);
  if (r.done) settleMarket(g, id);
  return r;
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
  goLive(m, g.rivals, 70, id => g.reputation[id]);
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
  const before = realizedTotal(m);
  const s = settle(m);
  if (s.already) return;
  if (s.payout > 0) ledger(g, s.payout, 'exchange', `Settlement: ${m.names[m.result]} won ${m.title}`, s.key);
  const pnl = realizedTotal(m) - before;
  g.stats.exchangePnl += realizedTotal(m);
  g.stats.marketsSettled++;
  // the same canonical result feeds rival careers, season standings, reputation and news
  const entry = RANKS[m.rank].entry;
  recordWorldMatch(g, m.match!, entry, 1);
  const fav = m.prior.indexOf(Math.max(...m.prior));
  news(g, 'market', `${m.names[m.result]} wins ${m.title}${m.result === fav ? ' as the pre-match favourite' : ` at ${Math.round(m.prior[m.result] * 100)}% pre-match odds`}.`, [m.rivalIds[m.result]]);
  if (allBooks(m).some(b => b.player.fees > 0) || s.payout > 0) notify(g, 'settlement', `${m.names[m.result]} wins ${m.title}. Your contracts paid $${(s.payout / 100).toFixed(2)} (P/L on this market ${fmtSigned(realizedTotal(m))}).`);
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
  (g.player.equipped as any)[c.kind] = c.kind === 'title' && g.player.equipped.title === id ? '' : id;
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
  if (g.gauntlet && g.gauntlet.stage > 0) return `Survival Gauntlet: cash out or brave stage ${g.gauntlet.stage + 1}.`;
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

// ------------------------------------------------------------------ Tutorial (learn by doing)
export const TUTORIAL: { tab: string; title: string; text: string }[] = [
  { tab: 'arena', title: 'Welcome to the Frozen Fields', text: 'Press the big PLAY button to enter your first four-player match.' },
  { tab: 'match', title: 'Your first hand', text: 'Your two cards are at the bottom. CHECK or CALL to stay in, RAISE to pressure, FOLD to give up the hand. Glowing Arsenal icons are abilities you can arm right now — try War Drums before you raise.' },
  { tab: 'match', title: 'Resolve and abilities', text: 'Abilities cost Resolve (◆), which grows every second hand. Passives trigger by themselves. Outlast all three rivals to win!' },
  { tab: 'match', title: 'Keep fighting', text: 'Use the speed buttons or ⏭ to skip ahead. The match ends when one competitor holds every chip.' },
  { tab: 'arena', title: 'Dollars earned', text: 'Prizes and entry fees change your bankroll. Now open the FORGE to strengthen your Arsenal.' },
  { tab: 'forge', title: 'The Forge', text: 'Select an ability, then Buy or Upgrade it. Equip up to eight. Three of one archetype grant a set bonus.' },
  { tab: 'exchange', title: 'The Arena Exchange', text: 'Back AI competitors in their own matches. Buy contracts that pay $1 if your pick wins — prices move only when someone trades.' },
  { tab: 'empire', title: 'Your Empire', text: 'Properties earn daily income or unlock perks. One day passes per arena match. That is everything — now climb to Augustus!' },
];
export function tutorialEvent(g: GameState, ev: 'tab:forge' | 'tab:exchange' | 'tab:empire' | 'forge:buy' | 'armed' | 'acted' | 'skip' | 'next') {
  const t = g.tutorial;
  if (!t || t.done) return;
  if (ev === 'skip') { t.done = true; return; }
  if (ev === 'next') { t.step++; }
  else if (ev === 'armed' && t.step <= 2) t.step = 3;
  else if (ev === 'acted' && t.step === 1) t.step = 2;
  else if (ev === 'tab:forge' && t.step === 4) t.step = 5;
  else if (ev === 'forge:buy' && t.step === 5) t.step = 6;
  else if (ev === 'tab:exchange' && t.step === 5) t.step = 6;
  else if (ev === 'tab:empire' && t.step === 7) t.step = 8;
  if (t.step >= TUTORIAL.length) { t.done = true; g.player.glory += 0; notify(g, 'achievement', 'Tutorial complete — the Empire is yours to conquer.'); if (!g.achievements.includes('student')) g.achievements.push('student'); }
}

export const ACHIEVEMENTS: { id: string; name: string; desc: string; test: (g: GameState) => boolean }[] = [
  { id: 'student', name: 'Student of the Arena', desc: 'Complete the tutorial.', test: g => g.tutorial?.done && g.achievements.includes('student') },
  { id: 'quick', name: 'Lightning Legate', desc: 'Win a Quick Clash.', test: g => (g.lastReport?.kind === 'quick' && g.lastReport.place === 0) || g.achievements.includes('quick') },
  { id: 'drafter', name: 'Master of the Draft', desc: 'Finish top 2 in a Draft Arena.', test: g => (g.lastReport?.kind === 'draft' && g.lastReport.place <= 1) },
  { id: 'gauntlet3', name: 'Through the Fire', desc: 'Clear 3 Gauntlet stages.', test: g => g.player.gauntletBest >= 3 || (g.gauntlet?.stage ?? 0) >= 3 },
  { id: 'champion', name: 'Imperial Champion', desc: 'Win an Imperial Tournament.', test: g => g.player.titles >= 1 },
  { id: 'tourney', name: 'Tournament Veteran', desc: 'Complete an Imperial Tournament.', test: g => g.player.tournaments >= 1 },
  { id: 'nemesis', name: 'Nemesis Vanquished', desc: 'Finish ahead of the same rival in 3 Rival Challenges.', test: g => Object.values(g.player.rivalWins).some(v => v >= 3) },
  { id: 'daily', name: 'Daily Devotion', desc: 'Win a Daily Challenge.', test: g => g.daily?.best === 0 },
  { id: 'season', name: 'Season Contender', desc: 'Finish a season in the top 10.', test: g => g.hall.some(h => h.playerPlace > 0 && h.playerPlace <= 10) },
  { id: 'palace', name: 'Palace of the North Star', desc: 'Own the Palace.', test: g => (g.empire.palace ?? 0) > 0 },
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
