import 'fake-indexeddb/auto';
import { describe, expect, it, beforeAll } from 'vitest';
import * as G from '../src/core/game';
import { deserialize, serialize, saveGame, loadGame, migrate, SaveError, checksum } from '../src/core/save';
import { step, humanTurn } from '../src/core/match';
import { autoplay } from './meta.test';

beforeAll(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
});

describe('20. save / load', () => {
  it('round-trips a full career including an in-progress match and live market', () => {
    const g = G.newGame('Saver', 77);
    G.startArena(g, 'arena'); autoplay(g, 3);
    G.exchangeTrade(g, g.markets[0].id, 1, 12);
    G.startMarketMatch(g, g.markets[0].id);
    G.marketNextHand(g, g.markets[0].id);
    G.startArena(g, 'arena');
    for (let i = 0; i < 5; i++) step(g.active!.match);
    const text = serialize(g);
    const back = deserialize(text);
    expect(JSON.stringify(back)).toBe(JSON.stringify(g));
    // deterministic restoration: continuing both copies yields identical outcomes
    const runOut = (x: G.GameState) => { const m = x.active!.match; let k = 0; while (!m.done && k++ < 20000) { if (!step(m)) { const s = humanTurn(m); if (s >= 0) G.playerAct(x, { type: 'call' }); } } return m.placementIds.join(); };
    expect(runOut(back)).toBe(runOut(g));
  });
  it('detects corruption and tampering', () => {
    const g = G.newGame('Tamper', 78);
    const text = serialize(g);
    expect(() => deserialize(text.replace('"bankroll":50000', '"bankroll":99999999'))).toThrow(SaveError);
    expect(() => deserialize(text.slice(0, text.length - 40))).toThrow(SaveError);
    expect(() => deserialize('{"hello":1}')).toThrow(/Not a Minnesota Mayhem save/);
  });
  it('migrates older schema versions', () => {
    const g = G.newGame('Old', 79) as any;
    delete g.archive; delete g.stats; g.version = 1;
    const m = migrate(JSON.parse(JSON.stringify(g)));
    expect(m.version).toBe(G.SAVE_VERSION);
    expect(Array.isArray(m.archive)).toBe(true);
    expect(m.stats.exchangeTrades).toBe(0);
    const newer = { ...g, version: 999 };
    expect(() => migrate(newer)).toThrow(/newer/);
  });
  it('IndexedDB two-slot save survives a corrupted primary slot', async () => {
    const g = G.newGame('Idb', 80);
    await saveGame(g);
    G.ledger(g, 1234, 'test', 'second');
    await saveGame(g);
    const { game } = await loadGame();
    expect(game!.player.bankroll).toBe(g.player.bankroll);
    // corrupt the active slot directly
    const { idbGet, idbPut } = await import('../src/core/save');
    const ptr = await idbGet('pointer');
    await idbPut('slot' + ptr, '{"format":"minnesota-mayhem-save","checksum":"bad","data":{}}');
    const res = await loadGame();
    expect(res.game).not.toBeNull();
    expect(res.warning).toMatch(/restored|backup/i);
    expect(checksum('a')).not.toBe(checksum('b'));
  });
});

describe('24. long-running simulation', () => {
  it('a 40-match career keeps every invariant', () => {
    const g = G.newGame('Marathon', 81);
    for (let i = 0; i < 40; i++) {
      const opts = G.arenaOptions(g);
      const kind = (opts.find(o => o.kind === 'trial' && o.available) ?? opts.find(o => o.kind === 'arena' && o.available) ?? opts.find(o => o.kind === 'recovery'))!.kind;
      expect(G.startArena(g, kind)).toBeNull();
      autoplay(g, i);
      if (i % 5 === 0) { const mk = g.markets.find(m => m.status === 'open'); if (mk) { G.exchangeTrade(g, mk.id, 0, 5); G.marketFastForward(g, mk.id); } }
      if (i % 7 === 0) G.buyAbility(g, 'silver_tongue');
      const sum = Object.entries(g.ledgerTotals).filter(([k]) => !k.startsWith('sink:')).reduce((s, [, v]) => s + v, 0);
      expect(g.player.bankroll).toBe(sum);
      expect(g.player.bankroll).toBeGreaterThanOrEqual(0);
      expect(g.markets.filter(m => m.status === 'open' || m.status === 'live').length).toBeGreaterThanOrEqual(1);
    }
    expect(g.day).toBeGreaterThan(40);
    expect(serialize(g).length).toBeLessThan(5_000_000);
    expect(g.rivals.length).toBeGreaterThan(40);
  });
});
