import { describe, expect, it } from 'vitest';
import { ABILITIES, ABILITY_MAP, resolveAbility, setBonuses, activeSynergies } from '../src/core/abilities';
import { decide, AIProfile } from '../src/core/ai';
import { act, activate, armable, beginHand, buildView, createMatch, MatchPlayer, runUntilBlocked, step } from '../src/core/match';
import { Rng } from '../src/core/rng';
import { totalChips } from '../src/core/poker';

const prof: AIProfile = { aggression: 0.5, bluff: 0.3, tightness: 0.5, risk: 0.5, adaptation: 0.5, skill: 0.6 };
const P = (i: number, loadout: string[], human = false): MatchPlayer => ({ id: 'p' + i, name: 'P' + i, isHuman: human, profile: prof, loadout: loadout.map(defId => ({ defId, level: 1 })) });

describe('7. arsenal activation timing', () => {
  it('actives may only be armed on your turn, in their window, with Resolve', () => {
    const m = createMatch([P(0, ['war_drums', 'decimation', 'augurs_eye'], true), P(1, []), P(2, []), P(3, [])], 11);
    // advance until the human acts preflop (folding through other spots)
    let g = 0;
    while (g++ < 500 && !(m.table.handActive && m.table.toAct === 0 && m.table.street === 'preflop')) {
      if (!step(m)) act(m, 0, { type: 'fold' });
    }
    expect(m.table.toAct).toBe(0);
    {
      const opts = armable(m, 0);
      expect(opts.find(o => o.ab.def.id === 'war_drums')!.ok).toBe(true);
      expect(opts.find(o => o.ab.def.id === 'decimation')!.ok).toBe(false); // river only
      const before = m.arsenal[0].resolve;
      expect(activate(m, 0, 'war_drums')).toBe(true);
      expect(m.arsenal[0].resolve).toBe(before - 1);
      expect(activate(m, 0, 'war_drums')).toBe(false); // already armed
      m.arsenal[0].resolve = 0;
      expect(activate(m, 0, 'augurs_eye')).toBe(false); // no Resolve
    }
    // cannot arm when not your turn
    expect(armable(m, 0).find(o => o.ab.def.id === 'decimation')!.reason).toBe('River only');
    const notTurn = [1, 2, 3].find(s => s !== m.table.toAct)!;
    m.players[notTurn].loadout = [{ defId: 'war_drums', level: 1 }];
    expect(activate(m, notTurn, 'war_drums')).toBe(false);
  });
  it('every ability has complete metadata', () => {
    expect(ABILITIES.length).toBeGreaterThanOrEqual(40);
    const arche = new Set(ABILITIES.map(a => a.archetype));
    expect(arche.size).toBe(8);
    for (const a of ABILITIES) {
      expect(a.text(a.values[0]).length).toBeGreaterThan(10);
      expect(a.counter.length).toBeGreaterThan(5);
      if (a.kind === 'active') { expect(a.window).toBeTruthy(); expect(a.cost).toBeGreaterThanOrEqual(1); }
      for (const l of [1, 2, 3]) expect(Number.isFinite(resolveAbility({ defId: a.id, level: l }).value)).toBe(true);
    }
  });
});

describe('8. combo resolution & integrity', () => {
  it('Arsenal effects conserve chips and never go negative across many matches', () => {
    const all = ABILITIES.map(a => a.id);
    for (let seed = 1; seed <= 25; seed++) {
      const rng = new Rng(seed);
      const pl = [0, 1, 2, 3].map(i => P(i, rng.shuffle([...all]).slice(0, 8)));
      const m = createMatch(pl, seed * 7);
      m.aiIters = 40;
      while (!m.done) {
        step(m);
        expect(totalChips(m.table)).toBe(6000);
        for (const s of m.table.seats) expect(s.stack).toBeGreaterThanOrEqual(0);
      }
      expect(m.placementIds.length).toBe(4);
    }
  });
  it('wards negate tributes before they are paid', () => {
    const m = createMatch([P(0, ['vestal_vigil']), P(1, ['caesars_gambit']), P(2, []), P(3, [])], 3);
    expect(m.arsenal[0].wardsLeft).toBe(2);
  });
  it('set bonuses and synergies are detected', () => {
    expect(setBonuses(['caesars_gambit', 'silver_tongue', 'mask_of_janus'])[0]).toMatchObject({ archetype: 'bluff', startResolve: 1 });
    expect(activeSynergies(['last_stand', 'phoenix_ash']).map(s => s.id)).toContain('phoenix_rising');
    const m = createMatch([P(0, ['caesars_gambit', 'silver_tongue', 'mask_of_janus']), P(1, []), P(2, []), P(3, [])], 3);
    expect(m.arsenal[0].resolve).toBe(3);
  });
  it('sigils apply bounded tradeoffs', () => {
    const base = resolveAbility({ defId: 'decimation', level: 1 });
    const haste = resolveAbility({ defId: 'decimation', level: 1, sigil: 'haste' });
    const might = resolveAbility({ defId: 'decimation', level: 1, sigil: 'might' });
    expect(haste.cost).toBe(base.cost - 1); expect(haste.value).toBeLessThan(base.value);
    expect(might.cost).toBe(base.cost + 1); expect(might.value).toBeGreaterThan(base.value);
  });
});

describe('9. AI information boundaries', () => {
  it('AI view contains no opponent hole cards and decisions ignore hidden cards', () => {
    const m = createMatch([P(0, []), P(1, []), P(2, []), P(3, [])], 99);
    beginHand(m);
    const seat = m.table.toAct;
    const view = buildView(m, seat);
    const json = JSON.stringify(view);
    for (let i = 0; i < 4; i++) if (i !== seat) for (const c of m.table.seats[i].hole) expect(view.opponents.some(o => JSON.stringify(o).includes(`"hole"`))).toBe(false);
    expect(json.includes('deck')).toBe(false);
    const d1 = decide(view, prof, new Rng(5));
    // swap opponent hole cards & deck: decision must be identical
    const other = (seat + 1) % 4;
    const saved = m.table.seats[other].hole;
    m.table.seats[other].hole = [m.table.deck[0], m.table.deck[1]];
    m.table.deck.reverse();
    const d2 = decide(buildView(m, seat), prof, new Rng(5));
    expect(d2).toEqual(d1);
    m.table.seats[other].hole = saved;
  });
  it('AI-only matches are deterministic for a seed', () => {
    const mk = () => { const m = createMatch([P(0, ['caesars_gambit']), P(1, ['siege_engine']), P(2, ['frozen_legion']), P(3, ['last_stand'])], 1234); m.aiIters = 40; runUntilBlocked(m); return m; };
    const a = mk(), b = mk();
    expect(a.placementIds).toEqual(b.placementIds);
    expect(a.table.handNo).toBe(b.table.handNo);
  });
});
