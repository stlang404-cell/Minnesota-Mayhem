import { Card } from './cards';
import { equityMC, preflopEquity } from './equity';
import { Action, Legal, Street } from './poker';
import { Rng } from './rng';

export interface AIProfile {
  aggression: number;  // 0..1 how often it bets/raises for value
  bluff: number;       // 0..1 bluff frequency
  tightness: number;   // 0..1 how selective preflop
  risk: number;        // 0..1 willingness to gamble
  adaptation: number;  // 0..1 how much it uses opponent statistics
  skill: number;       // 0..1 estimation accuracy (difficulty)
}

export interface PublicStats {
  hands: number; vpip: number; pfr: number; aggr: number; passive: number;
  foldToRaiseOpp: number; foldToRaise: number; showdowns: number; bluffsShown: number;
}
export const emptyStats = (): PublicStats => ({ hands: 0, vpip: 0, pfr: 0, aggr: 0, passive: 0, foldToRaiseOpp: 0, foldToRaise: 0, showdowns: 0, bluffsShown: 0 });

export interface OpponentView {
  seat: number; stack: number; committed: number; folded: boolean; allIn: boolean; out: boolean;
  stats: PublicStats; raisedThisHand: boolean; raisedThisStreet: boolean;
}

/** Everything an AI may legitimately know. Built by the match layer; contains no hidden cards. */
export interface AIView {
  seat: number;
  hole: Card[];
  board: Card[];
  street: Street;
  pot: number;
  stack: number;
  committed: number;
  currentBet: number;
  bb: number;
  legal: Legal;
  opponents: OpponentView[];
  playersLeft: number;
  isButton: boolean;
  handNo: number;
  resolve: number;
}

export interface AIDecision { action: Action; equity: number }

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

function vpipRate(s: PublicStats) { return s.hands >= 4 ? s.vpip / s.hands : 0.4; }

/** Estimated equity using public information + own cards only. */
export function estimateEquity(v: AIView, p: AIProfile, rng: Rng, iters?: number): number {
  const live = v.opponents.filter(o => !o.folded && !o.out);
  const nOpp = live.length;
  if (nOpp === 0) return 1;
  if (v.street === 'preflop' && p.adaptation < 0.35) return preflopEquity(v.hole, nOpp);
  // range model: opponents who raised are assumed to hold stronger hands, scaled by their observed looseness
  const ranges = live.map(o => {
    const loose = vpipRate(o.stats);
    let r = clamp(loose * 1.2, 0.15, 1);
    if (o.raisedThisHand) r *= (0.55 + 0.4 * clamp(o.stats.bluffsShown / Math.max(1, o.stats.showdowns)));
    return clamp(1 - (1 - r) * p.adaptation, 0.08, 1);
  });
  const n = iters ?? Math.round(60 + 140 * p.skill);
  return equityMC(v.hole, v.board, nOpp, n, rng, ranges);
}

export function decide(v: AIView, p: AIProfile, rng: Rng, iters?: number): AIDecision {
  const L = v.legal;
  const live = v.opponents.filter(o => !o.folded && !o.out);
  const nOpp = live.length;
  let eq = estimateEquity(v, p, rng, iters);
  // skill-based estimation noise (low-rank rivals misjudge more)
  eq = clamp(eq + rng.gauss() * 0.1 * (1 - p.skill));
  const rel = eq * (nOpp + 1); // 1.0 = average hand in this field
  const pot = v.pot;
  const toCall = L.toCall;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const bbStack = (v.stack + v.committed) / v.bb;
  const raiseTo = (frac: number) => {
    const target = Math.round(v.currentBet + Math.max(L.minRaiseTo - v.currentBet, (pot + toCall) * frac));
    const to = Math.min(L.maxRaiseTo, Math.max(L.minRaiseTo, target));
    if (to > (v.stack + v.committed) * 0.55) return L.maxRaiseTo;
    return to;
  };
  const act = (a: Action): AIDecision => ({ action: a, equity: eq });
  const passive = (): AIDecision => L.canCheck ? act({ type: 'check' }) : act({ type: 'fold' });
  const callOrCheck = (): AIDecision => L.canCheck ? act({ type: 'check' }) : act({ type: 'call' });
  const raise = (frac: number): AIDecision => {
    if (!L.canRaise) return callOrCheck();
    const to = raiseTo(frac);
    return act(to >= L.maxRaiseTo ? { type: 'allin' } : { type: 'raise', amount: to });
  };

  // tournament pressure: with 3 left (one from the money) short stacks tighten up
  const bubble = v.playersLeft === 3 ? 0.06 : 0;

  // --- Push/fold when short preflop ---
  if (v.street === 'preflop' && bbStack <= 11) {
    const facingShove = toCall > v.stack * 0.5;
    const need = facingShove
      ? 1.05 + 0.25 * p.tightness - 0.3 * p.risk + bubble * 3
      : 1.15 + 0.35 * p.tightness - 0.35 * p.aggression - 0.25 * p.risk + bubble * 3 - (bbStack < 5 ? 0.35 : 0);
    if (rel >= need) return L.canRaise ? act({ type: 'allin' }) : callOrCheck();
    if (L.canCheck) return act({ type: 'check' });
    if (toCall <= v.bb * 0.5 && rel > 0.8) return act({ type: 'call' });
    return act({ type: 'fold' });
  }

  if (v.street === 'preflop') {
    const openThresh = 1.25 + 0.45 * p.tightness - 0.35 * p.aggression + bubble;
    const callThresh = 0.95 + 0.35 * p.tightness - 0.2 * p.risk + bubble;
    const facingRaise = v.currentBet > v.bb;
    if (rel > (facingRaise ? openThresh + 0.45 : openThresh)) {
      if (rel > 2.2 && rng.chance(0.3 + 0.4 * p.aggression)) return raise(1.0);
      return raise(facingRaise ? 0.9 : 0.6 + 0.3 * p.aggression);
    }
    if (L.canCheck) {
      if (rng.chance(p.bluff * 0.12) && v.isButton) return raise(0.5);
      return act({ type: 'check' });
    }
    // calling decision: price + strength
    const cheap = toCall <= v.bb;
    if (rel > callThresh + (facingRaise ? 0.25 : 0) - (cheap ? 0.15 : 0) && eq > potOdds * 0.9) return act({ type: 'call' });
    if (rng.chance(p.bluff * 0.05) && L.canRaise && nOpp <= 2) return raise(0.8);
    return act({ type: 'fold' });
  }

  // --- Postflop ---
  const valueThresh = 0.52 + 0.18 * p.tightness - 0.12 * p.aggression - (nOpp === 1 ? 0.08 : 0);
  if (L.canCheck) {
    if (eq > valueThresh + 0.15 && rng.chance(0.35 + 0.5 * p.aggression)) return raise(0.55 + 0.35 * p.aggression);
    if (eq > valueThresh && rng.chance(0.25 + 0.45 * p.aggression)) return raise(0.45);
    // bluff/semi-bluff, more often heads-up and against frequent folders
    const foldy = live.reduce((s, o) => s + (o.stats.foldToRaiseOpp >= 3 ? o.stats.foldToRaise / o.stats.foldToRaiseOpp : 0.45), 0) / Math.max(1, nOpp);
    const bluffChance = p.bluff * (nOpp === 1 ? 0.45 : 0.18) * (0.6 + p.adaptation * foldy);
    if (rng.chance(bluffChance)) return raise(0.5 + 0.3 * rng.next());
    return act({ type: 'check' });
  }
  // facing a bet
  const margin = 0.05 + 0.08 * p.tightness - 0.08 * p.risk;
  if (eq > valueThresh + 0.22 && rng.chance(0.3 + 0.5 * p.aggression)) return raise(0.8);
  if (eq > potOdds + margin) return act({ type: 'call' });
  if (rng.chance(p.bluff * 0.06) && nOpp === 1 && L.canRaise) return raise(0.9);
  return passive();
}
