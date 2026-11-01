import { Card, fullDeck } from './cards';
import { evaluate, describe } from './handEval';
import { Rng, RngState } from './rng';

/**
 * Imperium Poker: no-limit Texas Hold'em tournament engine.
 * Pure, serializable state. Chips are integers and conserved exactly.
 */
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'done';
export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface Action { type: ActionType; amount?: number /* raise-to total for this street */ }

export interface Seat {
  id: string;
  name: string;
  stack: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  out: boolean;          // eliminated from tournament
  committed: number;     // chips put in on current street
  totalIn: number;       // chips put in this hand (incl. antes)
  needsAction: boolean;
  canRaise: boolean;
  startStack: number;    // stack at start of hand
}

export interface LogEntry {
  hand: number; street: Street; seat: number; kind: string; amount?: number; text: string;
}

export interface PotResult { amount: number; eligible: number[]; winners: number[]; shares: number[]; handName?: string }

export interface HandResult {
  hand: number;
  pots: PotResult[];
  showdown: boolean;
  scores: Record<number, { score: number; name: string }>;
  winnings: number[]; // per seat, gross chips won from pots
  contrib: number[];  // per seat, chips put in this hand
  uncontested: boolean;
  board: Card[];
}

export interface BlindLevel { sb: number; bb: number; ante: number }

export interface TableConfig {
  startingStack: number;
  handsPerLevel: number;
  levels: BlindLevel[];
  /** After the final listed level, blinds double every level (accelerated finish). */
  hardHandCap: number;
}

export const DEFAULT_CONFIG: TableConfig = {
  startingStack: 1500,
  handsPerLevel: 6,
  levels: [
    { sb: 10, bb: 20, ante: 0 },
    { sb: 15, bb: 30, ante: 0 },
    { sb: 25, bb: 50, ante: 5 },
    { sb: 40, bb: 80, ante: 10 },
    { sb: 60, bb: 120, ante: 15 },
    { sb: 100, bb: 200, ante: 25 },
    { sb: 150, bb: 300, ante: 40 },
    { sb: 250, bb: 500, ante: 60 },
    { sb: 400, bb: 800, ante: 100 },
    { sb: 600, bb: 1200, ante: 150 },
  ],
  hardHandCap: 200,
};

export interface TableState {
  config: TableConfig;
  seats: Seat[];
  handNo: number;
  dealer: number;
  sbSeat: number;
  bbSeat: number;
  street: Street;
  board: Card[];
  deck: Card[];
  rng: RngState;
  toAct: number;
  currentBet: number;
  lastRaiseSize: number;
  level: BlindLevel;
  levelIndex: number;
  log: LogEntry[];
  lastResult: HandResult | null;
  /** seat indices in order of elimination (first eliminated first) */
  eliminated: number[];
  finished: boolean;
  winner: number;
  handActive: boolean;
  /** count of voluntary actions this hand per seat (for stats) */
  aggressor: number;
  finishReason: string;
}

export function levelFor(cfg: TableConfig, handNo: number): { level: BlindLevel; index: number } {
  const idx = Math.floor((handNo - 1) / cfg.handsPerLevel);
  if (idx < cfg.levels.length) return { level: cfg.levels[idx], index: idx };
  const last = cfg.levels[cfg.levels.length - 1];
  const mult = 2 ** (idx - cfg.levels.length + 1);
  return { level: { sb: last.sb * mult, bb: last.bb * mult, ante: last.ante * mult }, index: idx };
}

export function createTable(players: { id: string; name: string }[], seed: number, config: TableConfig = DEFAULT_CONFIG): TableState {
  const rng = new Rng(seed);
  const seats: Seat[] = players.map(p => ({
    id: p.id, name: p.name, stack: config.startingStack, hole: [], folded: false, allIn: false,
    out: false, committed: 0, totalIn: 0, needsAction: false, canRaise: true, startStack: config.startingStack,
  }));
  const dealer = rng.int(seats.length);
  return {
    config, seats, handNo: 0, dealer: (dealer + seats.length - 1) % seats.length, sbSeat: -1, bbSeat: -1,
    street: 'done', board: [], deck: [], rng: rng.state(), toAct: -1, currentBet: 0, lastRaiseSize: 0,
    level: config.levels[0], levelIndex: 0, log: [], lastResult: null, eliminated: [], finished: false,
    winner: -1, handActive: false, aggressor: -1, finishReason: '',
  };
}

export function totalChips(t: TableState): number {
  return t.seats.reduce((s, x) => s + x.stack + x.totalIn, 0);
}

export function liveSeats(t: TableState): number[] {
  return t.seats.map((s, i) => i).filter(i => !t.seats[i].out);
}

function nextLive(t: TableState, from: number): number {
  const n = t.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (!t.seats[i].out) return i;
  }
  return -1;
}

function canActSeat(s: Seat) { return !s.out && !s.folded && !s.allIn; }

function nextToAct(t: TableState, from: number): number {
  const n = t.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    const s = t.seats[i];
    if (canActSeat(s) && s.needsAction) return i;
  }
  return -1;
}

function log(t: TableState, seat: number, kind: string, text: string, amount?: number) {
  t.log.push({ hand: t.handNo, street: t.street, seat, kind, text, amount });
  if (t.log.length > 400) t.log.splice(0, t.log.length - 400);
}

function post(t: TableState, seat: number, amount: number, toStreet: boolean): number {
  const s = t.seats[seat];
  const a = Math.max(0, Math.min(amount, s.stack));
  s.stack -= a;
  s.totalIn += a;
  if (toStreet) s.committed += a;
  if (s.stack === 0) s.allIn = true;
  return a;
}

export interface BlindModifiers { [seat: number]: number /* fraction of blind to waive, 0..0.5 */ }

/** Start a new hand. `blindWaiver` lets the Arsenal engine waive part of a blind (bounded). */
export function startHand(t: TableState, blindWaiver: BlindModifiers = {}): void {
  if (t.finished) throw new Error('tournament finished');
  if (t.handActive) throw new Error('hand already active');
  const live = liveSeats(t);
  if (live.length < 2) throw new Error('not enough players');
  t.handNo++;
  const lv = levelFor(t.config, t.handNo);
  t.level = lv.level; t.levelIndex = lv.index;
  const rng = new Rng(t.rng);
  const deck = rng.shuffle(fullDeck());
  t.rng = rng.state();
  t.board = [];
  t.lastResult = null;
  for (const s of t.seats) {
    s.hole = []; s.folded = s.out; s.allIn = false; s.committed = 0; s.totalIn = 0;
    s.needsAction = false; s.canRaise = true; s.startStack = s.stack;
  }
  t.dealer = nextLive(t, t.dealer);
  if (live.length === 2) {
    t.sbSeat = t.dealer;
    t.bbSeat = nextLive(t, t.dealer);
  } else {
    t.sbSeat = nextLive(t, t.dealer);
    t.bbSeat = nextLive(t, t.sbSeat);
  }
  t.street = 'preflop';
  t.handActive = true;
  t.aggressor = -1;
  log(t, -1, 'hand', `Hand #${t.handNo} — blinds ${t.level.sb}/${t.level.bb}${t.level.ante ? ` ante ${t.level.ante}` : ''}`);
  if (t.level.ante > 0) for (const i of live) post(t, i, t.level.ante, false);
  const w = (seat: number) => Math.max(0, Math.min(0.5, blindWaiver[seat] ?? 0));
  const sbAmt = Math.round(t.level.sb * (1 - w(t.sbSeat)));
  const bbAmt = Math.round(t.level.bb * (1 - w(t.bbSeat)));
  const sbp = post(t, t.sbSeat, sbAmt, true);
  log(t, t.sbSeat, 'blind', `${t.seats[t.sbSeat].name} posts small blind ${sbp}`, sbp);
  const bbp = post(t, t.bbSeat, bbAmt, true);
  log(t, t.bbSeat, 'blind', `${t.seats[t.bbSeat].name} posts big blind ${bbp}`, bbp);
  t.currentBet = Math.max(t.level.bb, ...t.seats.map(s => s.committed));
  t.lastRaiseSize = t.level.bb;
  // deal: two passes starting left of dealer
  for (let r = 0; r < 2; r++) {
    let i = t.dealer;
    for (let k = 0; k < live.length; k++) {
      i = nextLive(t, i);
      t.seats[i].hole.push(deck.pop()!);
    }
  }
  t.deck = deck;
  for (const i of live) t.seats[i].needsAction = canActSeat(t.seats[i]);
  t.toAct = nextToAct(t, t.bbSeat);
  maybeAdvance(t);
}

export interface Legal {
  canFold: boolean; canCheck: boolean; canCall: boolean; callAmount: number;
  canRaise: boolean; minRaiseTo: number; maxRaiseTo: number; toCall: number;
}

export function legalActions(t: TableState, seat: number): Legal {
  const s = t.seats[seat];
  const none: Legal = { canFold: false, canCheck: false, canCall: false, callAmount: 0, canRaise: false, minRaiseTo: 0, maxRaiseTo: 0, toCall: 0 };
  if (!t.handActive || t.toAct !== seat || !canActSeat(s)) return none;
  const toCall = Math.max(0, t.currentBet - s.committed);
  const callAmount = Math.min(toCall, s.stack);
  const maxRaiseTo = s.committed + s.stack;
  const minRaiseTo = Math.min(t.currentBet + t.lastRaiseSize, maxRaiseTo);
  // others still able to respond?
  const othersCanAct = t.seats.some((o, i) => i !== seat && canActSeat(o));
  const canRaise = s.canRaise && maxRaiseTo > t.currentBet && othersCanAct;
  return {
    canFold: toCall > 0, canCheck: toCall === 0, canCall: toCall > 0, callAmount,
    canRaise, minRaiseTo, maxRaiseTo, toCall,
  };
}

export class IllegalAction extends Error {}

export function applyAction(t: TableState, seat: number, action: Action): void {
  if (!t.handActive) throw new IllegalAction('no active hand');
  if (seat !== t.toAct) throw new IllegalAction(`not seat ${seat}'s turn (toAct=${t.toAct})`);
  const s = t.seats[seat];
  const L = legalActions(t, seat);
  let type = action.type;
  if (type === 'allin') {
    const to = s.committed + s.stack;
    if (to <= t.currentBet) type = 'call';
    else if (!L.canRaise) type = 'call';
    else return doRaise(t, seat, to);
  }
  switch (type) {
    case 'fold':
      if (!L.canFold) {
        // folding when check is available is legal but pointless; treat as check-fold => allowed fold
      }
      s.folded = true; s.needsAction = false;
      log(t, seat, 'fold', `${s.name} folds`);
      break;
    case 'check':
      if (!L.canCheck) throw new IllegalAction('cannot check facing a bet');
      s.needsAction = false;
      log(t, seat, 'check', `${s.name} checks`);
      break;
    case 'call': {
      if (L.toCall === 0) { s.needsAction = false; log(t, seat, 'check', `${s.name} checks`); break; }
      const a = post(t, seat, L.callAmount, true);
      s.needsAction = false;
      log(t, seat, 'call', `${s.name} calls ${a}${s.allIn ? ' (all-in)' : ''}`, a);
      break;
    }
    case 'raise': {
      if (!L.canRaise) throw new IllegalAction('raise not allowed');
      const to = Math.floor(action.amount ?? L.minRaiseTo);
      if (to > L.maxRaiseTo) throw new IllegalAction('raise exceeds stack');
      if (to < L.minRaiseTo && to !== L.maxRaiseTo) throw new IllegalAction(`raise below minimum ${L.minRaiseTo}`);
      return doRaise(t, seat, to);
    }
    default:
      throw new IllegalAction('unknown action');
  }
  afterAction(t, seat);
}

function doRaise(t: TableState, seat: number, to: number) {
  const s = t.seats[seat];
  const add = to - s.committed;
  const raiseSize = to - t.currentBet;
  const full = raiseSize >= t.lastRaiseSize;
  post(t, seat, add, true);
  const wasBet = t.currentBet === 0;
  t.currentBet = to;
  if (full) t.lastRaiseSize = raiseSize;
  t.aggressor = seat;
  s.needsAction = false;
  for (let i = 0; i < t.seats.length; i++) {
    if (i === seat) continue;
    const o = t.seats[i];
    if (!canActSeat(o)) continue;
    if (full) { o.needsAction = true; o.canRaise = true; }
    else {
      // incomplete all-in raise: players who already acted may only call/fold
      if (!o.needsAction) o.canRaise = false;
      o.needsAction = true;
    }
  }
  log(t, seat, wasBet ? 'bet' : 'raise', `${s.name} ${wasBet ? 'bets' : 'raises to'} ${to}${s.allIn ? ' (all-in)' : ''}`, to);
  afterAction(t, seat);
}

function afterAction(t: TableState, seat: number) {
  t.toAct = nextToAct(t, seat);
  maybeAdvance(t);
}

function inHand(t: TableState) { return t.seats.map((s, i) => i).filter(i => !t.seats[i].folded && !t.seats[i].out); }

function maybeAdvance(t: TableState) {
  while (t.handActive) {
    const contenders = inHand(t);
    if (contenders.length === 1) { settle(t, false); return; }
    if (t.toAct !== -1) return;
    // betting round complete
    // if at most one player can still act and everyone matched, run it out
    returnUncalled(t);
    if (t.street === 'river') { settle(t, true); return; }
    nextStreet(t);
    const actors = t.seats.filter(canActSeat);
    if (actors.length <= 1) { t.toAct = -1; continue; }
    for (const s of actors) { s.needsAction = true; s.canRaise = true; }
    t.toAct = nextToAct(t, t.dealer);
  }
}

/** Return any portion of the highest bet no one else could match. */
function returnUncalled(t: TableState) {
  const contenders = inHand(t);
  const byCommit = [...t.seats.keys()].sort((a, b) => t.seats[b].committed - t.seats[a].committed);
  const top = byCommit[0];
  const second = t.seats.reduce((m, s, i) => i === top ? m : Math.max(m, s.committed), 0);
  const excess = t.seats[top].committed - second;
  if (excess > 0 && contenders.includes(top)) {
    const s = t.seats[top];
    s.committed -= excess; s.totalIn -= excess; s.stack += excess;
    if (s.stack > 0) s.allIn = false;
    log(t, top, 'return', `${excess} uncalled returned to ${s.name}`, excess);
  }
}

function nextStreet(t: TableState) {
  for (const s of t.seats) s.committed = 0;
  t.currentBet = 0;
  t.lastRaiseSize = t.level.bb;
  t.deck.pop(); // burn
  if (t.street === 'preflop') { t.street = 'flop'; t.board.push(t.deck.pop()!, t.deck.pop()!, t.deck.pop()!); }
  else if (t.street === 'flop') { t.street = 'turn'; t.board.push(t.deck.pop()!); }
  else if (t.street === 'turn') { t.street = 'river'; t.board.push(t.deck.pop()!); }
  log(t, -1, 'street', `${t.street.toUpperCase()}`);
}

/** Build main + side pots from totalIn contributions. */
export function buildPots(seats: { totalIn: number; folded: boolean; out: boolean }[]): { amount: number; eligible: number[] }[] {
  const levels = [...new Set(seats.filter(s => !s.folded && !s.out && s.totalIn > 0).map(s => s.totalIn))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: number[] }[] = [];
  let prev = 0;
  for (const lvl of levels) {
    let amount = 0;
    seats.forEach(s => { amount += Math.max(0, Math.min(s.totalIn, lvl) - prev); });
    const eligible = seats.map((s, i) => i).filter(i => !seats[i].folded && !seats[i].out && seats[i].totalIn >= lvl);
    if (amount > 0) pots.push({ amount, eligible });
    prev = lvl;
  }
  // dead money above the highest live contribution (from folded players) joins last pot
  let dead = 0;
  seats.forEach(s => { dead += Math.max(0, s.totalIn - prev); });
  if (dead > 0) {
    if (pots.length) pots[pots.length - 1].amount += dead;
  }
  return pots;
}

function settle(t: TableState, showdown: boolean) {
  const contenders = inHand(t);
  // run out board if needed
  if (showdown) {
    while (t.board.length < 5) { t.deck.pop(); t.board.push(t.deck.pop()!); }
    t.street = 'showdown';
  }
  const winnings = t.seats.map(() => 0);
  const scores: HandResult['scores'] = {};
  const potsOut: PotResult[] = [];
  if (!showdown || contenders.length === 1) {
    const w = contenders[0];
    const amount = t.seats.reduce((s, x) => s + x.totalIn, 0);
    winnings[w] += amount;
    potsOut.push({ amount, eligible: [w], winners: [w], shares: [amount] });
    log(t, w, 'win', `${t.seats[w].name} wins ${amount} uncontested`, amount);
  } else {
    for (const i of contenders) {
      const sc = evaluate([...t.seats[i].hole, ...t.board]);
      scores[i] = { score: sc, name: describe(sc) };
    }
    const pots = buildPots(t.seats);
    pots.forEach((p, pi) => {
      const best = Math.max(...p.eligible.map(i => scores[i]?.score ?? -1));
      const winners = p.eligible.filter(i => scores[i]?.score === best);
      // odd chips go to winners in seat order starting left of dealer
      const ordered: number[] = [];
      let i = t.dealer;
      for (let k = 0; k < t.seats.length; k++) { i = (i + 1) % t.seats.length; if (winners.includes(i)) ordered.push(i); }
      const base = Math.floor(p.amount / winners.length);
      let rem = p.amount - base * winners.length;
      const shares = ordered.map(() => base);
      for (let k = 0; rem > 0; k = (k + 1) % shares.length, rem--) shares[k]++;
      ordered.forEach((w, k) => { winnings[w] += shares[k]; });
      potsOut.push({ amount: p.amount, eligible: p.eligible, winners: ordered, shares, handName: scores[ordered[0]].name });
      const label = pots.length > 1 ? (pi === 0 ? 'main pot' : `side pot ${pi}`) : 'the pot';
      log(t, ordered[0], 'win', `${ordered.map(w => t.seats[w].name).join(' & ')} win${ordered.length > 1 ? '' : 's'} ${label} (${p.amount}) with ${scores[ordered[0]].name}`, p.amount);
    });
  }
  for (let i = 0; i < t.seats.length; i++) { t.seats[i].stack += winnings[i]; }
  t.lastResult = {
    hand: t.handNo, pots: potsOut, showdown: showdown && contenders.length > 1, scores, winnings,
    uncontested: !(showdown && contenders.length > 1), board: [...t.board],
    contrib: t.seats.map(s => s.totalIn),
  };
  for (const s of t.seats) { s.totalIn = 0; s.committed = 0; s.needsAction = false; }
  t.handActive = false;
  t.toAct = -1;
  t.street = 'done';
}

/** Transfer chips between seats outside of pots (Arsenal tributes). Capped at the payer's stack. */
export function transferChips(t: TableState, from: number, to: number, amount: number): number {
  if (t.handActive) throw new Error('transfers only between hands');
  const a = Math.max(0, Math.min(Math.floor(amount), t.seats[from].stack));
  t.seats[from].stack -= a;
  t.seats[to].stack += a;
  return a;
}

/** Finalize a completed hand: eliminations, placements, tournament end. */
export function finalizeHand(t: TableState): number[] {
  const busted = t.seats.map((s, i) => i).filter(i => !t.seats[i].out && t.seats[i].stack <= 0);
  // larger starting stack places higher -> eliminated later
  busted.sort((a, b) => t.seats[a].startStack - t.seats[b].startStack || a - b);
  for (const i of busted) {
    t.seats[i].out = true; t.seats[i].folded = true;
    t.eliminated.push(i);
    log(t, i, 'out', `${t.seats[i].name} is eliminated`);
  }
  const live = liveSeats(t);
  if (live.length === 1) {
    t.finished = true; t.winner = live[0]; t.finishReason = 'last standing';
    log(t, live[0], 'champion', `${t.seats[live[0]].name} wins the tournament!`);
  } else if (t.handNo >= t.config.hardHandCap) {
    // Documented safety finish: remaining players ranked by chip count (ties by seat order).
    const order = [...live].sort((a, b) => t.seats[a].stack - t.seats[b].stack || b - a);
    for (const i of order.slice(0, -1)) { t.seats[i].out = true; t.eliminated.push(i); }
    t.finished = true; t.winner = order[order.length - 1]; t.finishReason = 'hand cap';
    log(t, t.winner, 'champion', `${t.seats[t.winner].name} wins on chips at the hand cap`);
  }
  return busted;
}

/** Placements: index 0 = winner. */
export function placements(t: TableState): number[] {
  if (!t.finished) return [];
  return [t.winner, ...[...t.eliminated].reverse()];
}

export function potTotal(t: TableState): number { return t.seats.reduce((s, x) => s + x.totalIn, 0); }
