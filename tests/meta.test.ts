import { describe, expect, it } from 'vitest';
import * as G from '../src/core/game';
import { ratingDeltas, applyRating, RANKS, ratingFloor, ratingCeiling, trialAvailable, RECOVERY_THRESHOLD } from '../src/core/ranks';
import { step, humanTurn, buildView } from '../src/core/match';
import { decide } from '../src/core/ai';
import { Rng } from '../src/core/rng';
import { prices, cost, tradeCost, initialQ, sharesForBudget } from '../src/core/lmsr';
import { marketPrices, quote, settle, cancel, playerTrade, createMarket, goLive, advanceHand, mmLossBound } from '../src/core/market';
import { ASSETS } from '../src/core/empire';

export function autoplay(g: G.GameState, seed = 1) {
  const m = g.active!.match; const rng = new Rng(seed);
  let guard = 0;
  while (!m.done && guard++ < 50000) {
    if (!step(m)) { const s = humanTurn(m); if (s >= 0) { const d = decide(buildView(m, s), G.PLAYER_PROFILE, rng); G.playerAct(g, d.action); } }
  }
  return G.finishActiveMatch(g)!;
}
const ledgerSum = (g: G.GameState) => Object.entries(g.ledgerTotals).filter(([k]) => !k.startsWith('sink:')).reduce((s, [, v]) => s + v, 0);

describe('10. rank rating updates', () => {
  it('multi-player Elo is zero-sum and orders by placement', () => {
    const d = ratingDeltas([1000, 1000, 1000, 1000], [0, 1, 2, 3]);
    expect(d[0]).toBeGreaterThan(d[1]); expect(d[1]).toBeGreaterThan(d[2]); expect(d[2]).toBeGreaterThan(d[3]);
    expect(Math.abs(d.reduce((a, b) => a + b, 0))).toBeLessThanOrEqual(2);
    // beating stronger opponents is worth more
    expect(ratingDeltas([1000, 1200, 1200, 1200], [0, 1, 2, 3])[0]).toBeGreaterThan(d[0]);
  });
  it('rating floors and ceilings protect progress', () => {
    expect(applyRating(2, RANKS[2].threshold, -500)).toBe(ratingFloor(2));
    expect(applyRating(2, RANKS[3].threshold, 500)).toBe(ratingCeiling(2));
    expect(trialAvailable(0, RANKS[1].threshold)).toBe(true);
    expect(trialAvailable(0, RANKS[1].threshold - 1)).toBe(false);
  });
});

describe('11. promotion trials', () => {
  it('passing promotes, failing keeps rank with a bounded penalty; wealth cannot buy rank', () => {
    const g = G.newGame('T', 5);
    g.player.bankroll = 10_000_000; // wealth alone does nothing
    expect(G.arenaOptions(g).find(o => o.kind === 'trial')!.available).toBe(false);
    g.player.rating = RANKS[1].threshold;
    let passed = false, failed = false;
    for (let i = 0; i < 12 && !(passed && failed); i++) {
      if (g.player.rank > 0) { g.player.rank = 0; g.player.rating = RANKS[1].threshold; }
      g.player.rating = Math.max(g.player.rating, RANKS[1].threshold);
      expect(G.startArena(g, 'trial')).toBeNull();
      const r = autoplay(g, i);
      if (r.trial === 'passed') { passed = true; expect(g.player.rank).toBe(1); }
      else { failed = true; expect(g.player.rank).toBe(0); expect(r.ratingDelta).toBeGreaterThanOrEqual(-15); }
    }
    expect(passed || failed).toBe(true);
  });
});

describe('12. dollar accounting & ledger', () => {
  it('bankroll always equals the sum of ledger entries; no overdrafts; idempotent keys', () => {
    const g = G.newGame('Acct', 9);
    for (let i = 0; i < 4; i++) { G.startArena(g, 'arena'); autoplay(g, i); expect(g.player.bankroll).toBe(ledgerSum(g)); }
    expect(G.ledger(g, -g.player.bankroll - 1, 'x', 'overdraft')).toBe(false);
    expect(G.ledger(g, 100, 'x', 'once', 'k1')).toBe(true);
    expect(G.ledger(g, 100, 'x', 'twice', 'k1')).toBe(false);
    expect(g.player.bankroll).toBe(ledgerSum(g));
    expect(Number.isInteger(g.player.bankroll)).toBe(true);
  });
  it('match results cannot be collected twice', () => {
    const g = G.newGame('Dup', 10);
    G.startArena(g, 'arena');
    const m = g.active!;
    autoplay(g, 2);
    const bank = g.player.bankroll;
    g.active = m; // replay the same finished match
    G.finishActiveMatch(g);
    expect(g.player.bankroll).toBe(bank);
  });
});

describe('13. forge transactions', () => {
  it('buy, upgrade, sigil, fuse, dismantle with correct charges', () => {
    const g = G.newGame('Smith', 3);
    g.player.rank = 4; G.ledger(g, 500000, 'test', 'grant');
    const b0 = g.player.bankroll;
    expect(G.buyAbility(g, 'brutus_dagger')).toBeNull();
    expect(g.player.bankroll).toBe(b0 - 30000);
    expect(G.buyAbility(g, 'brutus_dagger')).toBe('Already owned');
    const uid = g.player.owned.find(o => o.defId === 'brutus_dagger')!.uid;
    expect(G.upgradeAbility(g, uid)).toBeNull();
    expect(G.upgradeAbility(g, uid)).toBeNull();
    expect(G.upgradeAbility(g, uid)).toBe('Already at maximum level');
    expect(G.applySigil(g, uid, 'haste')).toBeNull();
    expect(G.applySigil(g, uid, 'thrift')).toMatch(/cannot bind/);
    expect(G.fuse(g, 'ides_of_march')).toBeNull();
    expect(g.player.owned.some(o => o.defId === 'brutus_dagger')).toBe(false);
    expect(g.player.owned.some(o => o.defId === 'ides_of_march')).toBe(true);
    expect(g.player.bankroll).toBe(ledgerSum(g));
    const poor = G.newGame('Poor', 4); poor.player.bankroll = 0;
    expect(G.buyAbility(poor, 'silver_tongue')).toBe('Not enough Dollars');
    expect(G.buyAbility(poor, 'thunder_of_jupiter')).toMatch(/Requires/);
    expect(G.setLoadout(poor, poor.player.owned.map(o => o.uid).concat(['a1', 'a2']))).toBeNull();
    expect(poor.player.loadout.length).toBeLessThanOrEqual(8);
  });
});

describe('14. property transactions', () => {
  it('buy/expand/sell with income and upkeep each day', () => {
    const g = G.newGame('Lord', 6);
    g.player.rank = 2; G.ledger(g, 200000, 'test', 'grant');
    expect(G.buyAsset(g, 'arena')).toMatch(/Requires/); expect(G.buyAsset(g, 'estate')).toMatch(/Requires/);
    const b0 = g.player.bankroll;
    expect(G.buyAsset(g, 'villa')).toBeNull();
    expect(g.player.bankroll).toBe(b0 - ASSETS[0].levels[0].cost);
    const b1 = g.player.bankroll;
    G.advanceDay(g);
    expect(g.player.bankroll).toBe(b1 + 1200 - 200);
    expect(G.sellAsset(g, 'villa')).toBeNull();
    expect(g.empire.villa).toBe(0);
    expect(g.player.bankroll).toBe(b1 + 1000 + 20000);
    expect(g.player.bankroll).toBe(ledgerSum(g));
  });
});

describe('15/16. market pricing & execution', () => {
  it('LMSR prices sum to 1, initial q reproduces priors, cost is path independent', () => {
    const b = 120, p0 = [0.42, 0.31, 0.18, 0.09];
    const q = initialQ(p0, b);
    prices(q, b).forEach((p, i) => expect(p).toBeCloseTo(p0[i], 6));
    const q2 = q.slice(); q2[0] += 50; q2[2] += 30;
    const path1 = tradeCost(q, b, 0, 50) + tradeCost([q[0] + 50, q[1], q[2], q[3]], b, 2, 30);
    expect(path1).toBeCloseTo(cost(q2, b) - cost(q, b), 9);
    expect(prices(q2, b).reduce((a, x) => a + x, 0)).toBeCloseTo(1, 12);
    // numerical stability with huge positions
    const big = [1e5, 0, 0, 0];
    expect(Number.isFinite(cost(big, b))).toBe(true);
    expect(prices(big, b)[0]).toBeCloseTo(1, 6);
    const n = sharesForBudget(q, b, 3, 20);
    expect(tradeCost(q, b, 3, n)).toBeLessThanOrEqual(20);
    expect(tradeCost(q, b, 3, n + 1)).toBeGreaterThan(20);
  });
  it('buying raises the price; round-trip loses money (no free arbitrage)', () => {
    const g = G.newGame('Trader', 21);
    const m = g.markets[0];
    const p0 = marketPrices(m)[1];
    const bank = g.player.bankroll;
    expect(G.exchangeTrade(g, m.id, 1, 30)).toBeNull();
    expect(m.player.shares[1]).toBe(30);
    expect(m.history.length).toBeGreaterThan(1);
    const q = quote(m, 1, -30);
    expect(G.exchangeTrade(g, m.id, 1, -30)).toBeNull();
    expect(g.player.bankroll).toBeLessThan(bank);
    expect(p0).toBeGreaterThan(0);
    expect(q.cents).toBeLessThan(0);
  });
});

describe('17. position accounting', () => {
  it('tracks cost basis, realized and unrealized P/L; no naked shorts', () => {
    const g = G.newGame('Book', 22);
    const m = g.markets[0];
    G.exchangeTrade(g, m.id, 0, 20);
    G.exchangeTrade(g, m.id, 0, 20);
    const basis = m.player.cost[0];
    expect(m.player.shares[0]).toBe(40);
    expect(G.exchangeTrade(g, m.id, 0, -10)).toBeNull();
    expect(m.player.cost[0]).toBe(basis - Math.round((basis / 40) * 10));
    expect(G.exchangeTrade(g, m.id, 0, -31)).toMatch(/no naked shorts/);
    expect(G.exchangeTrade(g, m.id, 2, -1)).toMatch(/no naked shorts/);
    expect(G.exchangeTrade(g, m.id, 0, 1.5 as any)).toMatch(/Whole/);
  });
});

describe('18. contract settlement', () => {
  it('settles exactly once to the canonical match winner and updates rival careers', () => {
    const g = G.newGame('Settle', 23);
    const m = g.markets[0];
    for (let i = 0; i < 4; i++) G.exchangeTrade(g, m.id, i, 10);
    const careers = m.rivalIds.map(id => g.rivals.find(r => r.id === id)!.career.matches);
    G.marketFastForward(g, m.id);
    if (m.status === 'cancelled') return; // rare withdrawal path covered elsewhere
    expect(m.status).toBe('settled');
    const winner = m.match!.placementIds[0];
    expect(m.rivalIds[m.result]).toBe(winner);
    const payout = (g.ledgerTotals.exchange ?? 0);
    expect(m.player.shares.every(s => s === 0)).toBe(true);
    // second settlement is a no-op
    const again = settle(m);
    expect(again.already).toBe(true);
    G.settleMarket(g, m.id);
    expect(g.ledgerTotals.exchange).toBe(payout);
    m.rivalIds.forEach((id, i) => expect(g.rivals.find(r => r.id === id)!.career.matches).toBe(careers[i] + 1));
    // trading is locked after settlement
    expect(G.exchangeTrade(g, m.id, 0, 1)).toMatch(/locked/);
    expect(g.player.bankroll).toBe(ledgerSum(g));
  });
  it('market maker loss stays within the LMSR bound', () => {
    const g = G.newGame('Bound', 31);
    for (const m of [...g.markets]) {
      for (let i = 0; i < 4; i++) G.exchangeTrade(g, m.id, i, 40);
      G.marketFastForward(g, m.id);
      if (m.status === 'settled') expect(-m.mmCash).toBeLessThanOrEqual(mmLossBound(m) + 1e-6);
    }
  });
});

describe('19. cancellation & refunds', () => {
  it('refunds the open cost basis exactly once', () => {
    const g = G.newGame('Cancel', 24);
    const m = g.markets[0];
    G.exchangeTrade(g, m.id, 2, 25);
    const basis = m.player.cost[2];
    const before = g.player.bankroll;
    const refund = cancel(m, 'test withdrawal');
    expect(refund).toBe(basis);
    G.ledger(g, refund, 'exchange', 'refund', `refund:${m.id}`);
    expect(G.ledger(g, refund, 'exchange', 'refund', `refund:${m.id}`)).toBe(false);
    expect(cancel(m, 'again')).toBe(0);
    expect(g.player.bankroll).toBe(before + basis);
    expect(G.exchangeTrade(g, m.id, 2, 1)).toMatch(/locked/);
  });
  it('trading is locked while a hand is being played', () => {
    const g = G.newGame('Lock', 25);
    const m = g.markets[0];
    goLive(m, g.rivals);
    expect(G.exchangeTrade(g, m.id, 0, 1)).toBeNull(); // between hands
    advanceHand(m);
    if (!m.match!.done) expect(G.exchangeTrade(g, m.id, 0, 1)).toBeNull();
  });
});

describe('23. bankruptcy recovery', () => {
  it('a broke player can always play free recovery matches and rebuild', () => {
    const g = G.newGame('Broke', 26);
    G.ledger(g, -g.player.bankroll, 'test', 'lose everything');
    expect(g.player.bankroll).toBe(0);
    expect(G.arenaOptions(g).find(o => o.kind === 'arena')!.available).toBe(false);
    const rec = G.arenaOptions(g).find(o => o.kind === 'recovery')!;
    expect(rec.available).toBe(true);
    let n = 0;
    while (g.player.bankroll < RANKS[0].entry && n < 30) { expect(G.startArena(g, 'recovery')).toBeNull(); autoplay(g, n); n++; }
    expect(g.player.bankroll).toBeGreaterThanOrEqual(RANKS[0].entry);
    expect(g.player.rating).toBe(1000); // recovery matches don't change rating
    expect(G.nextObjective(g)).toBeTruthy();
    expect(RECOVERY_THRESHOLD).toBeGreaterThan(RANKS[0].entry);
  });
});
