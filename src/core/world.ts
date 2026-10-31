/** Living world: canonical news feed, seasons, Hall of Champions, public reputation, retirements. */
import type { GameState } from './game';
import { PublicStats, emptyStats } from './ai';
import { RANKS } from './ranks';
import { makeRival, Rival } from './rivals';
import { Rng } from './rng';

export type NewsKind = 'promotion' | 'demotion' | 'upset' | 'champion' | 'retire' | 'bankrupt' | 'market' | 'season' | 'record' | 'player' | 'tournament' | 'rookie';
export interface NewsItem { id: number; day: number; kind: NewsKind; text: string; ids?: string[] }
export interface SeasonState { n: number; start: number; points: Record<string, number> }
export interface HallEntry { season: number; day: number; championId: string; name: string; points: number; playerPlace: number }

export const SEASON_LENGTH = 15;
export const SEASON_POINTS = [10, 6, 3, 1];

export function news(g: GameState, kind: NewsKind, text: string, ids?: string[]) {
  g.news.push({ id: ++g.counter, day: g.day, kind, text, ids });
  if (g.news.length > 120) g.news.splice(0, g.news.length - 120);
}

export function nameOf(g: GameState, id: string) { return id === 'player' ? g.player.name : g.rivals.find(r => r.id === id)?.name ?? id; }

/** Award season points for one finished match (any participants, including the player). */
export function seasonPoints(g: GameState, ids: string[], placement: number[], weight = 1) {
  ids.forEach((id, i) => { g.season.points[id] = (g.season.points[id] ?? 0) + Math.round(SEASON_POINTS[placement[i]] * weight); });
}

/** Accumulate observable statistics into a competitor's public reputation (bounded). */
export function addReputation(g: GameState, id: string, s: PublicStats) {
  const r = (g.reputation[id] ??= emptyStats());
  for (const k of Object.keys(r) as (keyof PublicStats)[]) r[k] += s[k];
  if (r.hands > 400) for (const k of Object.keys(r) as (keyof PublicStats)[]) r[k] = Math.round(r[k] * 0.75);
}

export function standings(g: GameState): { id: string; name: string; points: number }[] {
  return Object.entries(g.season.points).map(([id, points]) => ({ id, name: nameOf(g, id), points })).sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
}

/** Close the season when its length has elapsed. Returns player reward (cents) or 0. */
export function seasonTick(g: GameState, pay: (amount: number, reason: string, key: string) => void) {
  if (g.day - g.season.start < SEASON_LENGTH) return;
  const table = standings(g);
  if (table.length) {
    const champ = table[0];
    const playerPlace = table.findIndex(x => x.id === 'player');
    g.hall.push({ season: g.season.n, day: g.day, championId: champ.id, name: champ.name, points: champ.points, playerPlace: playerPlace >= 0 ? playerPlace + 1 : 0 });
    if (g.hall.length > 50) g.hall.shift();
    const r = g.rivals.find(x => x.id === champ.id);
    if (r) r.career.titles++;
    news(g, 'season', `Season ${g.season.n} ends: ${champ.name} is crowned Champion of the Empire with ${champ.points} points.`, [champ.id]);
    const entry = RANKS[g.player.rank].entry;
    if (playerPlace === 0) pay(entry * 20, `Season ${g.season.n} championship`, `season:${g.season.n}`);
    else if (playerPlace > 0 && playerPlace < 3) pay(entry * 8, `Season ${g.season.n}: top 3 finish`, `season:${g.season.n}`);
    else if (playerPlace >= 3 && playerPlace < 10) pay(entry * 3, `Season ${g.season.n}: top 10 finish`, `season:${g.season.n}`);
    if (playerPlace >= 0 && playerPlace < 10) news(g, 'player', `${g.player.name} finishes Season ${g.season.n} in place ${playerPlace + 1}.`, ['player']);
  }
  g.season = { n: g.season.n + 1, start: g.day, points: {} };
}

/** Bankrupt or aging rivals retire; rookies replace them so the population stays bounded. */
export function retireAndReplace(g: GameState, rng: Rng) {
  const used = new Set(g.rivals.map(r => r.name));
  const busy = new Set(g.markets.filter(m => m.status === 'open' || m.status === 'live').flatMap(m => m.rivalIds));
  if (g.active) g.active.rivalIds.forEach(id => busy.add(id));
  for (const e of g.circuit?.events ?? []) if (e.status !== 'done') e.roster.forEach(id => busy.add(id));
  for (const s of g.sponsorships ?? []) if (s.end >= g.day) busy.add(s.rivalId);
  const keep: Rival[] = [];
  let nextIdx = g.rivals.reduce((mx, r) => Math.max(mx, parseInt(r.id.slice(1), 10) || 0), 0) + 1;
  for (const r of g.rivals) {
    if (busy.has(r.id)) { keep.push(r); continue; }
    const broke = r.bankroll < RANKS[r.rank].entry;
    const old = r.career.matches > 160 && rng.chance(0.04);
    if (broke || old) {
      news(g, broke ? 'bankrupt' : 'retire', broke
        ? `${r.name} (${RANKS[r.rank].name}) is bankrupt and leaves the circuit after ${r.career.matches} matches.`
        : `${r.name} retires with ${r.career.wins} victories and ${r.career.titles} titles.`, [r.id]);
      g.retired.push({ id: r.id, name: r.name, rank: r.rank, wins: r.career.wins, matches: r.career.matches, titles: r.career.titles, day: g.day });
      if (g.retired.length > 60) g.retired.shift();
      const rookie = makeRival(rng, nextIdx++, 0, used);
      news(g, 'rookie', `A new challenger enters the Frozen Fields: ${rookie.name} of the ${rookie.style} school.`, [rookie.id]);
      keep.push(rookie);
    } else keep.push(r);
  }
  g.rivals = keep;
  // hard population cap: the longest-serving idle veterans retire first
  const CAP = 140;
  if (g.rivals.length > CAP) {
    const idle = g.rivals.filter(r => !busy.has(r.id)).sort((a, b) => b.career.matches - a.career.matches);
    for (const r of idle.slice(0, g.rivals.length - CAP)) {
      news(g, 'retire', `${r.name} hangs up the toga after ${r.career.matches} matches.`, [r.id]);
      g.retired.push({ id: r.id, name: r.name, rank: r.rank, wins: r.career.wins, matches: r.career.matches, titles: r.career.titles, day: g.day });
      g.rivals = g.rivals.filter(x => x !== r);
    }
    if (g.retired.length > 60) g.retired.splice(0, g.retired.length - 60);
  }
}

/** Rival lifestyle spending: wealth above ~30 entries is spent at 5%/day (economic sink, prevents inflation). */
export function rivalUpkeep(g: GameState) {
  for (const r of g.rivals) {
    const excess = r.bankroll - RANKS[r.rank].entry * 30;
    if (excess > 0) r.bankroll -= Math.round(excess * 0.05);
  }
}
export { emptyStats };
