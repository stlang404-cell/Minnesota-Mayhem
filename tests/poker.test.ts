import { describe as d, expect, it } from 'vitest';
import { parseCards } from '../src/core/cards';
import { evaluate, categoryOf, describe } from '../src/core/handEval';
import { applyAction, buildPots, createTable, finalizeHand, legalActions, startHand, totalChips, TableState, placements, IllegalAction, DEFAULT_CONFIG } from '../src/core/poker';

const ev = (s: string) => evaluate(parseCards(s));

d('1. hand rankings', () => {
  it('ranks every category in order', () => {
    const hands = [
      'As Kd 9h 7c 3s 2d 4h', // high card
      'As Ad 9h 7c 3s 2d 5h', // pair
      'As Ad 9h 9c 3s 2d 5h', // two pair
      'As Ad Ah 9c 3s 2d 5h', // trips
      '5s 6d 7h 8c 9s Kd Kh', // straight (with pair present)
      '2h 7h 9h Jh Kh As Ad', // flush
      'As Ad Ah 9c 9s 2d 5h', // full house
      'As Ad Ah Ac 9s 2d 5h', // quads
      '5h 6h 7h 8h 9h As Ad', // straight flush
    ];
    const cats = hands.map(h => categoryOf(ev(h)));
    expect(cats).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (let i = 1; i < hands.length; i++) expect(ev(hands[i])).toBeGreaterThan(ev(hands[i - 1]));
  });
  it('handles the wheel straight and royal flush', () => {
    expect(categoryOf(ev('Ac 2d 3h 4s 5c Kd Qh'))).toBe(4);
    expect(ev('6c 2d 3h 4s 5c Kd Qh')).toBeGreaterThan(ev('Ac 2d 3h 4s 5c Kd Qh'));
    expect(describe(ev('Ah Kh Qh Jh Th 2c 3d'))).toBe('Royal Flush');
    expect(categoryOf(ev('Ah 2h 3h 4h 5h 9c 9d'))).toBe(8);
  });
  it('picks best two pair and kickers', () => {
    expect(ev('As Ad Kh Kc Qs Qd 2h')).toBeGreaterThan(ev('As Ad Kh Kc Js Jd 9h'));
    expect(ev('As Ad Kh Kc 2s 2d Qh')).toBeGreaterThan(ev('As Ad Kh Kc 2s 2d Jh'));
  });
  it('full house picks highest trips + best pair from two trips', () => {
    expect(ev('As Ad Ah Kc Ks Kd 2h')).toBeGreaterThan(ev('As Ad Ah Qc Qs Qd 2h'));
  });
});

d('2. tie resolution', () => {
  it('equal hands tie, kicker breaks ties', () => {
    expect(ev('As Kd 9h 7c 3s 2d 4h')).toBe(ev('Ac Kh 9d 7s 3c 2h 4d'));
    expect(ev('As Ad Kh 7c 3s 2d 4h')).toBeGreaterThan(ev('Ac Ah Qd 7s 3c 2h 4d'));
    // board plays: both hold irrelevant cards
    expect(ev('2c 3d Ah Kh Qh Jh Th')).toBe(ev('4c 5d Ah Kh Qh Jh Th'));
  });
});

function table(stacks: number[], seed = 1): TableState {
  const t = createTable(stacks.map((_, i) => ({ id: 'p' + i, name: 'P' + i })), seed, { ...DEFAULT_CONFIG, levels: [{ sb: 10, bb: 20, ante: 0 }] });
  t.seats.forEach((s, i) => { s.stack = stacks[i]; });
  return t;
}
const conserve = (t: TableState, total: number) => expect(totalChips(t)).toBe(total);

d('3. betting legality', () => {
  it('enforces turn order, min raise and check rules', () => {
    const t = table([1000, 1000, 1000, 1000]);
    startHand(t);
    const first = t.toAct;
    const other = (first + 1) % 4;
    expect(() => applyAction(t, other, { type: 'call' })).toThrow(IllegalAction);
    const L = legalActions(t, first);
    expect(L.canCheck).toBe(false);
    expect(L.toCall).toBe(20);
    expect(L.minRaiseTo).toBe(40);
    expect(() => applyAction(t, first, { type: 'check' })).toThrow(IllegalAction);
    expect(() => applyAction(t, first, { type: 'raise', amount: 30 })).toThrow(IllegalAction);
    expect(() => applyAction(t, first, { type: 'raise', amount: 5000 })).toThrow(IllegalAction);
    applyAction(t, first, { type: 'raise', amount: 60 });
    const L2 = legalActions(t, t.toAct);
    expect(L2.minRaiseTo).toBe(100); // raise of 40 must be matched
    conserve(t, 4000);
  });
  it('big blind gets the option when limped to', () => {
    const t = table([1000, 1000, 1000, 1000]);
    startHand(t);
    for (let k = 0; k < 3; k++) applyAction(t, t.toAct, { type: 'call' });
    expect(t.toAct).toBe(t.bbSeat);
    expect(legalActions(t, t.bbSeat).canCheck).toBe(true);
    applyAction(t, t.bbSeat, { type: 'check' });
    expect(t.street).toBe('flop');
    expect(t.board.length).toBe(3);
    conserve(t, 4000);
  });
  it('incomplete all-in raise does not reopen betting', () => {
    const t = table([1000, 1000, 1000, 1000]);
    startHand(t);
    const a = t.toAct; applyAction(t, a, { type: 'raise', amount: 100 });
    const b = t.toAct; t.seats[b].stack = 110; // short stack: all-in for 110 total = raise of 10 (< 80)
    applyAction(t, b, { type: 'allin' });
    // others fold until back to a
    while (t.toAct !== a && t.handActive) applyAction(t, t.toAct, { type: 'fold' });
    if (t.handActive) {
      const L = legalActions(t, a);
      expect(L.canRaise).toBe(false);
      expect(L.canCall).toBe(true);
    }
  });
});

d('4/5. side pots & all-in', () => {
  it('builds correct main and side pots', () => {
    const pots = buildPots([
      { totalIn: 100, folded: false, out: false },
      { totalIn: 300, folded: false, out: false },
      { totalIn: 300, folded: false, out: false },
      { totalIn: 50, folded: true, out: false },
    ]);
    expect(pots).toEqual([{ amount: 350, eligible: [0, 1, 2] }, { amount: 400, eligible: [1, 2] }]);
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(750);
  });
  it('multi-way all-in settles with exact chip conservation over many seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const t = table([100, 300, 600, 1000], seed);
      startHand(t);
      while (t.handActive) applyAction(t, t.toAct, { type: 'allin' });
      conserve(t, 2000);
      expect(t.seats.every(s => s.stack >= 0)).toBe(true);
      const r = t.lastResult!;
      expect(r.showdown).toBe(true);
      // short stack can win at most 4x its stack
      expect(r.winnings[0]).toBeLessThanOrEqual(400);
      expect(r.pots.reduce((s, p) => s + p.amount, 0)).toBe(r.contrib.reduce((a, b) => a + b, 0));
    }
  });
  it('returns uncalled bets', () => {
    const t = table([1000, 1000, 1000, 1000]);
    startHand(t);
    applyAction(t, t.toAct, { type: 'raise', amount: 500 });
    while (t.handActive) applyAction(t, t.toAct, { type: 'fold' });
    conserve(t, 4000);
    expect(t.lastResult!.uncontested).toBe(true);
  });
});

d('6. tournament elimination', () => {
  it('eliminates busted players, orders placements, and finishes', () => {
    const t = table([500, 500, 500, 500], 7);
    let hands = 0;
    while (!t.finished && hands < 400) {
      startHand(t);
      while (t.handActive) applyAction(t, t.toAct, { type: 'allin' });
      finalizeHand(t);
      hands++;
      expect(totalChips(t)).toBe(2000);
    }
    expect(t.finished).toBe(true);
    const pl = placements(t);
    expect(new Set(pl).size).toBe(4);
    expect(t.seats[pl[0]].stack).toBe(2000);
  });
  it('heads-up: dealer posts the small blind', () => {
    const t = table([1000, 1000, 0, 0]);
    t.seats[2].out = true; t.seats[3].out = true;
    startHand(t);
    expect(t.sbSeat).toBe(t.dealer);
  });
});
