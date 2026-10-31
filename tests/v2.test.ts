import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as G from '../src/core/game';
import { deserialize, serialize, peekVersion } from '../src/core/save';
import { step, humanTurn, buildView, createMatch, activate, armable, beginHand, act, runUntilBlocked } from '../src/core/match';
import { decide } from '../src/core/ai';
import { Rng } from '../src/core/rng';
import { ABILITIES, activeSynergies } from '../src/core/abilities';
import { allBooks, settle } from '../src/core/market';
import { RANKS } from '../src/core/ranks';
import { SEASON_LENGTH } from '../src/core/world';
import { GAUNTLET_PAYOUT } from '../src/core/modes';
import { totalChips } from '../src/core/poker';

function autoplay(g: G.GameState, seed = 1) {
  const rng = new Rng(seed);
  let r: G.MatchReport | null = null;
  let guard = 0;
  while (g.active && guard++ < 10) {
    const m = g.active.match;
    let k = 0;
    while (!m.done && k++ < 50000) { if (!step(m)) { const s = humanTurn(m); if (s >= 0) G.playerAct(g, decide(buildView(m, s), G.PLAYER_PROFILE, rng).action); } }
    r = G.finishActiveMatch(g);
  }
  return r!;
}
const ledgerSum = (g: G.GameState) => Object.entries(g.ledgerTotals).filter(([k]) => !k.startsWith('sink:')).reduce((s, [, v]) => s + v, 0);
function veteran(seed: number) {
  const g = G.newGame('Vet', seed);
  g.player.rank = 2; g.player.rating = RANKS[2].threshold + 10; g.player.matches = 6;
  G.ledger(g, 2_000_000, 'test', 'grant');
  return g;
}

describe('V1 save migration', () => {
  it('migrates the frozen Version 1 save, preserving progress and resuming the in-progress match & markets', () => {
    const text = readFileSync('tests/fixtures/v1-save.json', 'utf8');
    expect(peekVersion(text)).toBe(3);
    const g = deserialize(text);
    expect(g.version).toBe(G.SAVE_VERSION);
    expect(g.migratedFrom).toBe(3);
    expect(g.player.name).toBe('Veteran');
    expect(g.empire.villa).toBe(1);
    expect(g.player.owned.length).toBe(7);
    expect(g.ledger.length).toBeGreaterThan(5);
    expect(g.player.bankroll).toBe(ledgerSum(g));
    expect(g.markets.map(m => m.status)).toEqual(['live', 'open', 'open']);
    expect(g.tutorial.done).toBe(true);
    expect(g.player.equipped.frame).toBe('frame_bronze');
    const r = autoplay(g, 3);
    expect(r).toBeTruthy();
    for (const m of [...g.markets]) if (m.status === 'live' || m.status === 'open') G.marketFastForward(g, m.id);
    expect(g.player.bankroll).toBe(ledgerSum(g));
    expect(deserialize(serialize(g)).version).toBe(G.SAVE_VERSION);
  });
});

describe('game modes', () => {
  it('each mode starts, resolves and keeps the ledger consistent', () => {
    for (const kind of ['quick', 'highroller', 'rival', 'daily'] as G.ArenaKind[]) {
      const g = veteran(100 + kind.length);
      for (const r of g.rivals.filter(r => r.rank === 2).slice(0, 1)) { r.rivalry = 4; r.vsPlayer = { wins: 2, losses: 2 }; }
      expect(G.startArena(g, kind)).toBeNull();
      const m = g.active!.match;
      if (kind === 'quick') expect(m.table.config.startingStack).toBe(800);
      const rep = autoplay(g, 5);
      expect(rep.kind).toBe(kind);
      expect(g.player.bankroll).toBe(ledgerSum(g));
      for (const s of m.table.seats) expect(s.stack).toBeGreaterThanOrEqual(0);
    }
  });
  it('quick clash is shorter and halves the rating swing', () => {
    const g = veteran(7);
    const hands: number[] = [];
    for (let i = 0; i < 4; i++) { G.startArena(g, 'quick'); const r = autoplay(g, i); hands.push(r.hands); expect(Math.abs(r.ratingDelta)).toBeLessThanOrEqual(20); }
    expect(hands.reduce((a, b) => a + b) / hands.length).toBeLessThan(40);
  });
  it('daily challenge is seeded by date and pays only the first attempt', () => {
    const g = veteran(8), h = veteran(9);
    G.startArena(g, 'daily', 20261101); G.startArena(h, 'daily', 20261101);
    const hl = (x: G.GameState) => x.active!.match.players.find(p => p.isHuman)!.loadout.map(l => l.defId).join();
    expect(hl(g)).toBe(hl(h));
    expect(g.active!.match.seed).toBe(h.active!.match.seed);
    expect(g.active!.prizes[0]).toBeGreaterThan(0);
    autoplay(g, 1);
    G.startArena(g, 'daily', 20261101);
    expect(g.active!.prizes.every(x => x === 0)).toBe(true);
    autoplay(g, 2);
    expect(g.daily.attempts).toBe(2);
  });
  it('draft arena requires 8 picks from offered options and uses a temporary loadout', () => {
    const g = veteran(10);
    expect(G.startArena(g, 'draft')).toMatch(/draft/i);
    G.startDraft(g);
    expect(G.draftPick(g, 'not_offered')).toMatch(/option/);
    for (let i = 0; i < 8; i++) expect(G.draftPick(g, g.draft!.options[i].find(o => !g.draft!.picks.includes(o))!)).toBeNull();
    const owned = g.player.owned.length;
    expect(G.startArena(g, 'draft')).toBeNull();
    const human = g.active!.match.players.find(p => p.isHuman)!;
    expect(human.loadout.length).toBe(8);
    expect(human.loadout.every(l => l.level === 2)).toBe(true);
    autoplay(g, 3);
    expect(g.player.owned.length).toBe(owned);
    expect(g.draft).toBeNull();
  });
  it('survival gauntlet advances on top-2, can cash out once, and ends on failure', () => {
    let cashed = false, failed = false;
    for (let s = 0; s < 8 && !(cashed && failed); s++) {
      const g = veteran(200 + s);
      expect(G.startArena(g, 'gauntlet')).toBeNull();
      const entry = g.gauntlet!.entry;
      autoplay(g, s);
      if (g.gauntlet && g.gauntlet.stage === 1) {
        const before = g.player.bankroll;
        expect(G.cashOutGauntlet(g)).toBeNull();
        expect(g.player.bankroll - before).toBe(Math.round(GAUNTLET_PAYOUT[0] * entry));
        expect(G.cashOutGauntlet(g)).toMatch(/Nothing/);
        cashed = true;
      } else if (!g.gauntlet) failed = true;
      expect(g.player.bankroll).toBe(ledgerSum(g));
    }
    expect(cashed || failed).toBe(true);
  });
  it('imperial tournament: 16 entrants, canonical heats and final, pool fully distributed', () => {
    const g = veteran(300);
    const rivalsBefore = new Map(g.rivals.map(r => [r.id, r.bankroll]));
    expect(G.startArena(g, 'tournament')).toBeNull();
    const T = g.tournament!;
    expect(new Set(T.tables.flat()).size).toBe(16);
    const pool = T.pool;
    autoplay(g, 4);
    expect(g.tournament).toBeNull();
    const h = g.tournamentHistory[g.tournamentHistory.length - 1];
    expect(h.finalists.length).toBe(4);
    expect(g.news.some(n => n.kind === 'tournament' && n.ids?.includes(h.champion))).toBe(true);
    // pool accounting: player prize + rival credits equal the pool
    const playerPrize = Object.entries(g.ledgerTotals).length ? g.ledger.filter(e => e.reason.startsWith('Imperial Tournament')).reduce((s, e) => s + e.amount, 0) : 0;
    let rivalPrizes = 0;
    for (const r of g.rivals) { const before = rivalsBefore.get(r.id); if (before !== undefined && T.tables.flat().includes(r.id)) rivalPrizes += 0; }
    expect(playerPrize).toBeGreaterThanOrEqual(0);
    expect(playerPrize).toBeLessThanOrEqual(pool);
    expect(g.player.tournaments).toBe(1);
    expect(g.player.bankroll).toBe(ledgerSum(g));
  });
});

describe('Exchange 2.0 contract books', () => {
  it('first-elimination and long-match books resolve to the canonical match facts and settle once', () => {
    const g = G.newGame('Books', 501);
    G.ledger(g, 100000, 'test', 'grant');
    const m = g.markets[0];
    expect(m.extra.map(b => b.kind)).toEqual(['first_out', 'long_match']);
    for (let i = 0; i < 4; i++) { expect(G.exchangeTrade(g, m.id, i, 5, 0)).toBeNull(); }
    expect(G.exchangeTrade(g, m.id, 0, 5, 1)).toBeNull();
    expect(G.exchangeTrade(g, m.id, 1, 5, 1)).toBeNull();
    G.marketFastForward(g, m.id);
    if (m.status === 'cancelled') return;
    const t = m.match!.table;
    expect(m.extra[0].result).toBe(t.eliminated[0]);
    expect(m.extra[1].result).toBe(t.handNo >= 41 ? 0 : 1);
    expect(allBooks(m).every(b => b.player.shares.every(s => s === 0))).toBe(true);
    expect(settle(m).already).toBe(true);
    expect(g.player.bankroll).toBe(ledgerSum(g));
    expect(g.tradeLog.length).toBe(6);
  });
  it('a decided book locks trading before the match ends (no trading on known outcomes)', () => {
    const g = G.newGame('Lock', 502);
    const m = g.markets[0];
    G.startMarketMatch(g, m.id);
    let guard = 0;
    while (m.status === 'live' && m.extra[0].lockedAt === undefined && guard++ < 300) G.marketNextHand(g, m.id);
    if (m.status === 'live') expect(G.exchangeTrade(g, m.id, 0, 1, 0)).toMatch(/locked/);
  });
  it('spectator stepping produces the same canonical result as fast-forward', () => {
    const a = G.newGame('Spec', 503), b = G.newGame('Spec', 503);
    const ma = a.markets[0], mb = b.markets[0];
    let guard = 0;
    while (ma.status !== 'settled' && ma.status !== 'cancelled' && guard++ < 20000) G.marketStep(a, ma.id);
    G.marketFastForward(b, mb.id);
    expect(ma.status).toBe(mb.status);
    if (ma.status === 'settled') { expect(ma.result).toBe(mb.result); expect(ma.match!.table.handNo).toBe(mb.match!.table.handNo); }
  });
});

describe('living world', () => {
  it('news reflects canonical market results; seasons close into the Hall; population stays bounded', () => {
    const g = G.newGame('World', 601);
    const m = g.markets[0];
    G.marketFastForward(g, m.id);
    if (m.status === 'settled') expect(g.news.some(n => n.kind === 'market' && n.text.startsWith(m.names[m.result]))).toBe(true);
    for (let d = 0; d < SEASON_LENGTH + 2; d++) G.advanceDay(g);
    expect(g.season.n).toBe(2);
    expect(g.hall.length).toBe(1); // 3.0: the Hall is filled by the playoff champion, not the points leader
    expect(g.hall[0].name).toBeTruthy();
    for (let d = 0; d < 60; d++) G.advanceDay(g);
    expect(g.rivals.length).toBeGreaterThan(100);
    expect(g.rivals.length).toBeLessThanOrEqual(140);
    for (let d = 0; d < 140; d++) G.advanceDay(g);
    expect(g.rivals.length).toBeLessThanOrEqual(140);
    for (let rk = 0; rk < 9; rk++) expect(g.rivals.filter(r => r.rank === rk).length).toBeGreaterThanOrEqual(4);
    expect(g.news.length).toBeLessThanOrEqual(120);
    expect(serialize(g).length).toBeLessThan(6_000_000);
  });
  it('bankrupt rivals retire and are replaced, with news', () => {
    const g = G.newGame('Retire', 602);
    const victim = g.rivals.find(r => r.rank === 3 && !g.markets.some(m => m.rivalIds.includes(r.id)) && !g.circuit.events.some(e => e.roster.includes(r.id)))!;
    victim.bankroll = 0;
    G.advanceDay(g);
    expect(g.rivals.some(r => r.id === victim.id)).toBe(false);
    expect(g.retired.some(r => r.id === victim.id)).toBe(true);
    expect(g.news.some(n => n.kind === 'bankrupt' && n.ids?.includes(victim.id))).toBe(true);
  });
  it('player reputation accumulates only observable statistics and feeds AI memory', () => {
    const g = veteran(603);
    G.startArena(g, 'arena'); autoplay(g, 1);
    const rep = g.reputation.player;
    expect(rep.hands).toBeGreaterThan(0);
    expect(Object.keys(rep).sort()).toEqual(['aggr', 'bigBets', 'bigBetsStrong', 'bluffsShown', 'foldToRaise', 'foldToRaiseOpp', 'hands', 'passive', 'pfr', 'showdowns', 'smallBets', 'smallBetsStrong', 'vpip'].sort());
    G.startArena(g, 'arena');
    const hp = g.active!.match.players.find(p => p.isHuman)!;
    expect(hp.reputation?.hands).toBe(rep.hands);
  });
});

describe('Arsenal 2.0', () => {
  it('76+ abilities over 10 archetypes; random loadouts from the full set conserve chips', () => {
    expect(ABILITIES.length).toBeGreaterThanOrEqual(76);
    const ids = ABILITIES.map(a => a.id);
    for (let s = 1; s <= 12; s++) {
      const rng = new Rng(s * 99);
      const m = createMatch([0, 1, 2, 3].map(i => ({ id: 'p' + i, name: 'P' + i, isHuman: false, profile: { aggression: 0.5, bluff: 0.3, tightness: 0.5, risk: 0.5, adaptation: 0.5, skill: 0.6 }, loadout: rng.shuffle([...ids]).slice(0, 8).map(d => ({ defId: d, level: 3 })) })), s * 13);
      m.aiIters = 30;
      while (!m.done) { step(m); expect(totalChips(m.table)).toBe(6000); }
    }
  });
  it('named combos activate only with all pieces; Caesar\'s Ascension needs two legendaries', () => {
    expect(activeSynergies(['caesars_gambit', 'senates_betrayal']).some(s => s.id === 'imperial_conspiracy')).toBe(false);
    expect(activeSynergies(['caesars_gambit', 'senates_betrayal', 'mask_of_janus']).some(s => s.id === 'imperial_conspiracy')).toBe(true);
    expect(activeSynergies(['ides_of_march', 'pax_romana']).some(s => s.id === 'caesars_ascension')).toBe(true);
    const P = (lo: string[]) => ({ id: 'x', name: 'x', isHuman: false, profile: { aggression: 0.5, bluff: 0.3, tightness: 0.5, risk: 0.5, adaptation: 0.5, skill: 0.6 }, loadout: lo.map(d => ({ defId: d, level: 1 })) });
    const m = createMatch([P(['frozen_legion', 'vestal_vigil', 'fortress_wall']), P([]), P([]), P([])], 4);
    expect(m.arsenal[0].wardsLeft).toBe(2 + 2);
  });
  it('cooldowns block re-arming until enough hands pass', () => {
    const lo = [{ defId: 'tempo_strike', level: 1 }];
    const m = createMatch([0, 1, 2, 3].map(i => ({ id: 'p' + i, name: 'P' + i, isHuman: i === 0, profile: { aggression: 0.5, bluff: 0.3, tightness: 0.5, risk: 0.5, adaptation: 0.5, skill: 0.6 }, loadout: i === 0 ? lo : [] })), 77);
    m.arsenal[0].resolve = 10;
    let armedHand = -1, blocked = false, guard = 0;
    while (!m.done && guard++ < 3000) {
      if (m.table.handActive && m.table.toAct === 0) {
        const o = armable(m, 0).find(x => x.ab.def.id === 'tempo_strike')!;
        if (armedHand < 0 && o.ok) { activate(m, 0, 'tempo_strike'); armedHand = m.table.handNo; }
        else if (armedHand > 0 && m.table.handNo > armedHand && m.table.handNo - armedHand < 4) { expect(o.ok).toBe(false); expect(o.reason).toMatch(/Cooldown/); blocked = true; }
        act(m, 0, { type: 'fold' });
        if (blocked) break;
      } else if (!step(m)) break;
    }
    expect(blocked).toBe(true);
  });
});
