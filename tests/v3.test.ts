import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as G from '../src/core/game';
import * as C from '../src/core/circuit';
import { deserialize, serialize, peekVersion } from '../src/core/save';
import { step, humanTurn, buildView } from '../src/core/match';
import { decide } from '../src/core/ai';
import { Rng } from '../src/core/rng';
import { SEASON_LENGTH } from '../src/core/world';

export function autoplay(g: G.GameState, seed = 1) {
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
export const ledgerSum = (g: G.GameState) => Object.entries(g.ledgerTotals).filter(([k]) => !k.startsWith('sink:')).reduce((s, [, v]) => s + v, 0);
function rich(seed: number, rank = 2) {
  const g = G.newGame('Circuit', seed);
  g.player.rank = rank; g.player.rating = 1200 + rank * 30; g.player.matches = 10;
  G.ledger(g, 3_000_000, 'test', 'grant');
  C.ensureCalendar(g);
  return g;
}

describe('Imperial Circuit integrity', () => {
  it('prize split sums to exactly 100% and every scheduled event has 16 distinct competitors', () => {
    expect(C.SPLIT_TOTAL).toBeCloseTo(1, 10);
    const g = rich(1);
    for (let d = 0; d < 20; d++) G.advanceDay(g);
    expect(g.circuit.events.length + g.circuit.history.length).toBeGreaterThan(5);
    for (const e of g.circuit.events) { expect(new Set(e.roster).size).toBe(16); expect(e.eligibility.length).toBeGreaterThan(5); }
  });
  it('AI-only events: one canonical champion across bracket, history, news, market, rival titles', () => {
    const g = rich(2);
    let checked = 0;
    for (let d = 0; d < 25; d++) {
      const before = new Map(g.rivals.map(r => [r.id, r.career.titles]));
      G.advanceDay(g);
      for (const ev of g.circuit.events.filter(e => e.status === 'done' && e.day >= g.day - 1)) {
        const champ = ev.final!.order[0];
        expect(ev.heats.map(h => h.order[0]).sort()).toEqual([...ev.final!.order].sort());
        expect(g.circuit.history.find(h => h.id === ev.id)!.champion).toBe(champ);
        expect(g.news.some(n => n.kind === 'tournament' && n.text.includes(ev.name) && n.ids?.[0] === champ)).toBe(true);
        expect(ev.roster[ev.market!.result]).toBe(champ);
        if (before.has(champ)) expect(g.rivals.find(r => r.id === champ)!.career.titles).toBeGreaterThan(before.get(champ)!);
        const paid = Object.values(ev.payouts).reduce((a, b) => a + b, 0) + ev.hostFee;
        expect(Math.abs(paid - C.poolOf(ev))).toBeLessThanOrEqual(12); // rounding only
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3);
    expect(g.player.bankroll).toBe(ledgerSum(g));
  });
  it('the player can enter an eligible event, play the heat (and final), and get paid exactly once', () => {
    const g = rich(3);
    let ev: C.CircuitEvent | undefined;
    for (let d = 0; d < 10 && !ev; d++) { ev = g.circuit.events.find(e => e.status === 'scheduled' && e.playerEligible && e.day <= g.day + 2); if (!ev) G.advanceDay(g); }
    expect(ev).toBeTruthy();
    expect(C.enterEvent(g, ev!.id)).toBeNull();
    expect(ev!.roster).toContain('player');
    expect(C.eventTrade(g, ev!.id, 0, 5)).toMatch(/conflict/);
    while (g.day < ev!.day) G.advanceDay(g);
    expect(C.playEvent(g, ev!.id)).toBeNull();
    autoplay(g, 7);
    expect(ev!.status).toBe('done');
    expect(ev!.heats.length).toBe(4);
    expect(ev!.heats.some(h => h.order.includes('player'))).toBe(true);
    const prizeEntries = g.ledger.filter(l => l.reason.startsWith(`${ev!.name}: prize`));
    expect(prizeEntries.length).toBeLessThanOrEqual(1);
    expect((ev!.payouts.player ?? 0) === (prizeEntries[0]?.amount ?? 0)).toBe(true);
    expect(g.player.bankroll).toBe(ledgerSum(g));
  });
  it('season → qualification → Imperial Grand Championship → Hall of Champions (consistent champion)', () => {
    const g = rich(4);
    g.season.points.player = 9999; // qualify on merit for this test
    for (let d = 0; d < SEASON_LENGTH; d++) G.advanceDay(g);
    const grand = g.circuit.events.find(e => e.tier === 'grand');
    expect(grand).toBeTruthy();
    expect(grand!.roster.length).toBe(16);
    expect(grand!.roster).toContain('player');
    expect(grand!.seeds?.[0]).toBe('player'); // top seed
    expect(C.playEvent(g, grand!.id)).toBeNull();
    autoplay(g, 3);
    expect(grand!.status).toBe('done');
    const hall = g.hall[g.hall.length - 1];
    expect(hall.championId).toBe(grand!.final!.order[0]);
    expect(g.news.some(n => n.kind === 'season' && n.text.includes(hall.name))).toBe(true);
  });
  it('no-show players are replaced after the grace period (no refund) and the event still runs', () => {
    const g = rich(5);
    let ev: C.CircuitEvent | undefined;
    for (let d = 0; d < 10 && !ev; d++) { ev = g.circuit.events.find(e => e.status === 'scheduled' && e.playerEligible && e.entry > 0 && e.day <= g.day + 2); if (!ev) G.advanceDay(g); }
    expect(C.enterEvent(g, ev!.id)).toBeNull();
    const bank = g.player.bankroll;
    for (let d = 0; d < 8; d++) G.advanceDay(g);
    expect(ev!.status).toBe('done');
    expect(ev!.withdrawn).toBe(true);
    expect(ev!.roster).not.toContain('player');
    expect(g.ledger.some(l => l.reason.includes(ev!.name) && l.amount > 0 && l.account === 'circuit')).toBe(false); // no refund
  });
  it('champion markets: trade, crowd reaction, single settlement to the canonical champion', () => {
    const g = rich(6);
    const ev = g.circuit.events.find(e => e.status === 'scheduled' && e.market)!;
    expect(C.eventTrade(g, ev.id, 3, 10)).toBeNull();
    expect(C.eventTrade(g, ev.id, 3, -11)).toMatch(/naked/);
    expect(C.eventTrade(g, ev.id, 3, -4)).toBeNull();
    while (ev.status !== 'done') G.advanceDay(g);
    expect(ev.marketSettled).toBe(true);
    expect(ev.market!.player.shares.every(s => s === 0)).toBe(true);
    expect(g.ledger.filter(l => l.reason.startsWith('Settlement:') && l.reason.includes(ev.name)).length).toBeLessThanOrEqual(1);
    expect(g.player.bankroll).toBe(ledgerSum(g));
  });
});

describe('Dynasty: sponsorships', () => {
  it('upfront moves to the rival, prize share comes out of the rival winnings, conflicts are blocked', () => {
    const g = rich(7);
    g.empire.sponsor = 1;
    const r = g.rivals.find(x => x.rank === 2 && !g.markets.some(m => m.rivalIds.includes(x.id)))!;
    const before = r.bankroll, bank = g.player.bankroll;
    expect(G.ledger).toBeTruthy();
    expect(C.sponsor(g, r.id)).toBeNull();
    const s = g.sponsorships[0];
    expect(r.bankroll).toBe(before + s.upfront);
    expect(g.player.bankroll).toBe(bank - s.upfront);
    expect(C.sponsor(g, r.id)).toMatch(/Already/);
    const rb = r.bankroll, pb = g.player.bankroll;
    C.sponsorShare(g, r.id, 10000, 'test prize');
    expect(g.player.bankroll - pb).toBe(3000);
    expect(rb - r.bankroll).toBe(3000);
    // conflict of interest on markets featuring the sponsored rival
    const mk = g.markets[0];
    mk.rivalIds[0] = r.id;
    expect(G.exchangeTrade(g, mk.id, 0, 5)).toMatch(/conflict/);
    expect(g.player.bankroll).toBe(ledgerSum(g));
  });
});

describe('save migration v2 → v3 (and v1 → v3)', () => {
  it('migrates the frozen 2.0 save with an in-progress tournament and contract books, then plays on', () => {
    const text = readFileSync('tests/fixtures/v2-save.json', 'utf8');
    expect(peekVersion(text)).toBe(4);
    const g = deserialize(text);
    expect(g.version).toBe(G.SAVE_VERSION);
    expect(g.migratedFrom).toBe(4);
    expect(g.empire).toMatchObject({ villa: 1, library: 1 });
    expect(g.tournament?.stage).toBe('heat');
    expect(g.markets[0].extra.length).toBe(2);
    expect(g.circuit.events).toEqual([]);
    expect(g.timeline.some(t => t.text.includes('3.0'))).toBe(true);
    expect(g.player.bankroll).toBe(ledgerSum(g));
    autoplay(g, 2); // finishes the 2.0 tournament
    expect(g.tournament).toBeNull();
    G.marketFastForward(g, g.markets[0].id);
    for (let d = 0; d < 6; d++) G.advanceDay(g);
    expect(g.circuit.events.length + g.circuit.history.length).toBeGreaterThan(0);
    expect(g.player.bankroll).toBe(ledgerSum(g));
    expect(deserialize(serialize(g)).version).toBe(G.SAVE_VERSION);
  });
  it('the 1.0 save migrates through every version', () => {
    const g = deserialize(readFileSync('tests/fixtures/v1-save.json', 'utf8'));
    expect(g.version).toBe(G.SAVE_VERSION);
    expect(g.legacy).toBeTruthy();
    autoplay(g, 4);
    expect(g.player.bankroll).toBe(ledgerSum(g));
  });
});

import { placeLimit, cancelOrder, processOrders } from '../src/core/orders';
import { marketPrices } from '../src/core/market';
describe('Grand Exchange: limit orders', () => {
  it('buy limit above market fills partially at or better than the limit; escrow is exact', () => {
    const g = rich(20);
    const m = g.markets[0];
    const p0 = marketPrices(m)[1];
    const lim = Math.min(99, Math.round(p0 * 100) + 6);
    const bank0 = g.player.bankroll;
    expect(placeLimit(g, m.id, -1, 1, 'buy', lim, 2000)).toBeNull();
    const o = g.orders[g.orders.length - 1];
    expect(o.filled).toBeGreaterThan(0);
    expect(o.filled).toBeLessThan(2000);              // partial: stops at the limit
    expect(marketPrices(m)[1]).toBeLessThanOrEqual(lim / 100 + 0.01);
    const paid = o.fills.reduce((s, f) => s + f.cents, 0);
    expect(paid / o.filled).toBeLessThanOrEqual(lim * (1 + 0.02) + 1e-6); // avg incl. fee ≤ limit + fee
    expect(cancelOrder(g, o.id)).toBeNull();
    expect(cancelOrder(g, o.id)).toMatch(/not open/);
    expect(bank0 - g.player.bankroll).toBe(paid);    // only fills were spent; the rest of escrow came back exactly once
    expect(g.player.bankroll).toBe(ledgerSum(g));
  });
  it('buy limit below market rests; sell orders reserve shares; orders expire at settlement', () => {
    const g = rich(21);
    const m = g.markets[0];
    expect(placeLimit(g, m.id, -1, 0, 'buy', 1, 50)).toBeNull();
    const rest = g.orders[g.orders.length - 1];
    expect(rest.filled).toBe(0);
    expect(rest.status).toBe('open');
    G.exchangeTrade(g, m.id, 2, 20);
    expect(placeLimit(g, m.id, -1, 2, 'sell', 99, 15)).toBeNull();
    expect(G.exchangeTrade(g, m.id, 2, -10)).toMatch(/reserved/);
    expect(G.exchangeTrade(g, m.id, 2, -5)).toBeNull();
    expect(placeLimit(g, m.id, -1, 2, 'sell', 99, 1)).toMatch(/unreserved/);
    G.marketFastForward(g, m.id);
    expect(g.orders.filter(o => o.marketId === m.id).every(o => o.status !== 'open')).toBe(true);
    expect(g.player.bankroll).toBe(ledgerSum(g));
    expect((g.ledgerTotals.escrow ?? 0) + g.orders.filter(o => o.side === 'buy').reduce((s, o) => s + o.fills.reduce((a, f) => a + f.cents, 0), 0)).toBe(0);
  });
  it('rejects invalid orders', () => {
    const g = rich(22);
    const m = g.markets[0];
    expect(placeLimit(g, m.id, -1, 0, 'buy', 0, 5)).toMatch(/Limit/);
    expect(placeLimit(g, m.id, -1, 0, 'buy', 50, 1.5)).toMatch(/whole/);
    expect(placeLimit(g, m.id, -1, 0, 'sell', 50, 5)).toMatch(/unreserved/);
    processOrders(g, 'nope');
  });
});

import { ABILITIES, activeSynergies, COMBO_IDS } from '../src/core/abilities';
import { createMatch, runUntilBlocked } from '../src/core/match';
import { totalChips } from '../src/core/poker';
describe('Legendary Arsenal (rule engine)', () => {
  it('122 abilities, 16 legendaries, ≥10 named combos; every rule ability has a complete rule', () => {
    expect(ABILITIES.length).toBeGreaterThanOrEqual(120);
    expect(ABILITIES.filter(a => a.rarity === 'legendary').length).toBeGreaterThanOrEqual(16);
    expect(COMBO_IDS.length).toBeGreaterThanOrEqual(10);
    for (const a of ABILITIES.filter(a => (a as any).rule)) {
      const r = (a as any).rule; expect(r.trigger).toBeTruthy(); expect(r.effect.kind).toBeTruthy();
      if (a.kind === 'active') expect(a.cost).toBeGreaterThan(0);
    }
    expect(new Set(ABILITIES.map(a => a.id)).size).toBe(ABILITIES.length); // stable unique ids
  });
  it('deterministic replay and chip conservation with random 3.0 loadouts', () => {
    const ids = ABILITIES.filter(a => (a as any).rule).map(a => a.id);
    for (let s = 1; s <= 10; s++) {
      const mk = () => { const rng = new Rng(s); const m = createMatch([0, 1, 2, 3].map(i => ({ id: 'p' + i, name: 'P' + i, isHuman: false, profile: { aggression: 0.6, bluff: 0.4, tightness: 0.45, risk: 0.55, adaptation: 0.5, skill: 0.6 }, loadout: rng.shuffle([...ids]).slice(0, 8).map(d => ({ defId: d, level: 3 })) })), s * 7); m.aiIters = 30; return m; };
      const a = mk(), b = mk();
      while (!a.done) { step(a); expect(totalChips(a.table)).toBe(6000); }
      runUntilBlocked(b);
      expect(a.placementIds).toEqual(b.placementIds);
      expect(a.events.map(e => e.text)).toEqual(b.events.map(e => e.text));
    }
  });
  it('3.0 combos activate only with all three pieces', () => {
    expect(activeSynergies(['emperors_feint', 'thunder_of_jupiter']).some(s => s.id === 'emperors_gambit')).toBe(false);
    expect(activeSynergies(['emperors_feint', 'thunder_of_jupiter', 'mask_of_janus']).some(s => s.id === 'emperors_gambit')).toBe(true);
  });
});

import { sizeRead, emptyStats } from '../src/core/ai';
describe('AI 3.0 information boundaries', () => {
  it('bet-size memory only uses public showdown observations and is pattern-relative', () => {
    const s = emptyStats();
    expect(sizeRead(s, 1).n).toBe(0);
    s.bigBets = 10; s.bigBetsStrong = 9; s.smallBets = 10; s.smallBetsStrong = 2;
    const big = sizeRead(s, 1), small = sizeRead(s, 0.3);
    expect(big.pStrong).toBeGreaterThan(big.base);
    expect(small.pStrong).toBeLessThan(small.base);
  });
  it('AI views contain no hidden cards (3.0 fields included)', () => {
    const g = rich(30);
    G.startArena(g, 'arena');
    const m = g.active!.match;
    while (m.table.toAct < 0 || m.players[m.table.toAct].isHuman) { if (!step(m)) G.playerAct(g, { type: 'call' }); }
    const v = buildView(m, m.table.toAct);
    const others = m.table.seats.filter((_, i) => i !== v.seat).flatMap(s => s.hole);
    expect(JSON.stringify(v.opponents)).not.toMatch(/hole/);
    expect(v.hole.some(c => others.includes(c))).toBe(false);
  });
});

describe('trophies & awards', () => {
  it('a player win at a final table awards a trophy, title, timeline entry, Hall (grand) and the champion achievement', () => {
    const g = rich(40);
    g.season.points.player = 9999;
    for (let d = 0; d < SEASON_LENGTH; d++) G.advanceDay(g);
    const grand = g.circuit.events.find(e => e.tier === 'grand')!;
    expect(C.playEvent(g, grand.id)).toBeNull();
    // play the heat to completion, then resolve the stage through the real path with the canonical order
    const a = g.active!; const m = a.match;
    while (!m.done) { if (!step(m)) { const s = humanTurn(m); if (s >= 0) G.playerAct(g, { type: 'call' }); } }
    // simulate the bracket path for a player who reached and won the final table
    const notes: string[] = [];
    const heatOrder = ['player', ...m.placementIds.filter(id => id !== 'player')];
    expect(C.advanceCircuitMatch(g, a, heatOrder, notes)).toBe(false); // → final table starts
    const fa = g.active!; const fm = fa.match;
    while (!fm.done) { if (!step(fm)) { const s = humanTurn(fm); if (s >= 0) G.playerAct(g, { type: 'call' }); } }
    const finalOrder = ['player', ...fm.placementIds.filter(id => id !== 'player')];
    expect(C.advanceCircuitMatch(g, fa, finalOrder, notes)).toBe(true);
    expect(g.trophies.some(t => t.tier === 'grand')).toBe(true);
    expect(g.hall[g.hall.length - 1].championId).toBe('player');
    expect(g.ceremony).toBe(100);
    expect(g.timeline.some(t => t.text.includes('Won the'))).toBe(true);
    G.checkAchievements(g);
    expect(g.achievements).toContain('grand_champ');
    expect(g.player.bankroll).toBe(ledgerSum(g));
  });
});
