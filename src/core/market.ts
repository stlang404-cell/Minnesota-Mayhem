import { cost, initialQ, prices, sharesToPrice, tradeCost } from './lmsr';
import { beginHand, createMatch, MatchState, runHand, step } from './match';
import { Rival, winProbabilities } from './rivals';
import { mix, Rng } from './rng';

export const FEE_RATE = 0.02;
export type MarketStatus = 'open' | 'live' | 'settled' | 'cancelled';

export interface Position { shares: number[]; cost: number[] /* cents basis of open shares */; realized: number /* cents */; fees: number }
export interface TradeRecord { t: number; who: string; outcome: number; shares: number; cents: number; fee: number; price: number; hand: number }
export interface PricePoint { t: number; hand: number; p: number[] }

export interface TraderBot {
  id: string; name: string; strategy: 'fundamental' | 'momentum' | 'contrarian' | 'noise' | 'whale' | 'conservative' | 'speculative' | 'informed';
  bias: number[]; budget: number /* dollars */; shares: number[]; spent: number; aggressiveness: number;
  books?: Record<string, number[]>;  // holdings per book kind
  pnl?: number;                       // cents, realised at settlement
}

/** A contract book: one LMSR over mutually exclusive outcomes with a precise resolution rule. */
export interface Book {
  kind: 'winner' | 'first_out' | 'long_match';
  title: string;
  rule: string;
  labels: string[];
  b: number; q: number[]; q0: number[]; prior: number[];
  history: PricePoint[]; trades: TradeRecord[]; player: Position; mmCash: number;
  result: number;          // -1 until known
  lockedAt?: number;       // hand number at which the outcome became known (trading locked)
}

export const LONG_LINE = 40.5;

export interface Market {
  id: string;
  kind: 'winner';
  rule: string;
  labels: string[];
  extra: Book[];
  title: string;
  rivalIds: string[];
  names: string[];
  rank: number;
  b: number;
  q: number[];
  q0: number[];
  status: MarketStatus;
  prior: number[];
  history: PricePoint[];
  trades: TradeRecord[];
  bots: TraderBot[];
  player: Position;
  match: MatchState | null;
  matchSeed: number;
  result: number;           // winning outcome index
  placements: number[];     // placement per outcome (0 = winner)
  mmCash: number;           // dollars received by the market maker (net)
  tick: number;
  createdDay: number;
  settledKeys: string[];
  cancelReason?: string;
  refunded?: number;
}

export function emptyPosition(n = 4): Position { return { shares: Array(n).fill(0), cost: Array(n).fill(0), realized: 0, fees: 0 }; }

export function createMarket(id: string, rivals: Rival[], rank: number, seed: number, day: number): Market {
  const rng = new Rng(seed);
  const prior = winProbabilities(rivals);
  const b = 120;
  const q0 = initialQ(prior, b);
  const strategies: TraderBot['strategy'][] = ['fundamental', 'fundamental', 'informed', 'momentum', 'momentum', 'contrarian', 'conservative', 'speculative', 'noise', 'whale'];
  const bots: TraderBot[] = strategies.map((s, k) => ({
    id: `${id}b${k}`, name: ['Mercator', 'Argentarius', 'Negotiator', 'Spectator', 'Fortuna', 'Haruspex', 'Publicanus', 'Tabellarius', 'Lanista', 'Patronus'][k],
    strategy: s, bias: rivals.map(() => (rng.next() - 0.5) * (s === 'noise' ? 0.5 : 0.25)),
    budget: s === 'whale' ? 400 : 60 + rng.int(80), shares: [0, 0, 0, 0], spent: 0, aggressiveness: 0.3 + rng.next() * 0.5,
  }));
  return {
    id, title: `${RANK_TITLE(rank)} #${id.slice(1)}`,
    kind: 'winner', rule: 'Pays $1 if this competitor wins the match (last player with chips; documented hand-cap rule ranks by chips).', labels: rivals.map(r => r.name),
    rivalIds: rivals.map(r => r.id), names: rivals.map(r => r.name), rank, b, q: q0.slice(), q0, status: 'open', prior,
    history: [{ t: 0, hand: 0, p: prices(q0, b) }], trades: [], bots, player: emptyPosition(), match: null, matchSeed: mix(seed, 'match'),
    result: -1, placements: [], mmCash: 0, tick: 0, createdDay: day, settledKeys: [],
    extra: [makeBook('first_out', 'First Elimination', 'Pays $1 if this competitor is the first player eliminated (ties on the same hand: the smaller starting stack that hand is first, per tournament rules).', rivals.map(r => r.name), firstOutPrior(prior)),
            makeBook('long_match', `Long Match (${LONG_LINE} hands)`, `OVER pays $1 if the match is still running when hand ${Math.ceil(LONG_LINE)} is dealt; UNDER pays $1 if a champion is decided before then.`, ['Over', 'Under'], [0.5, 0.5])],
  };
}

function makeBook(kind: Book['kind'], title: string, rule: string, labels: string[], prior: number[]): Book {
  const b = kind === 'long_match' ? 80 : 100;
  const q0 = initialQ(prior, b);
  return { kind, title, rule, labels, b, q: q0.slice(), q0, prior, history: [{ t: 0, hand: 0, p: prices(q0, b) }], trades: [], player: emptyPosition(labels.length), mmCash: 0, result: -1 };
}
function firstOutPrior(winP: number[]): number[] {
  const inv = winP.map(p => 1 / Math.sqrt(p));
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map(x => x / s);
}
/** The winner book is the market object itself; extra books by index. */
export const bookTitle = (bk: Book) => (bk.kind === 'winner' ? 'Match Winner' : bk.title);
export function bookOf(m: Market, idx = -1): Book { return idx < 0 ? (m as unknown as Book) : m.extra[idx]; }
export function allBooks(m: Market): Book[] { return [m as unknown as Book, ...(m.extra ?? [])]; }
const RANK_TITLE = (r: number) => ['Snowfield Bout', 'Tavern Clash', 'Ludus Duel', 'Legion Contest', 'Praetorian Trial', 'Consular Games', 'Imperial Games', 'Caesarean Games', 'Divine Games'][r] ?? 'Exhibition';

export function marketPrices(m: Market | Book): number[] { return prices(m.q, m.b); }

export interface Quote { shares: number; cents: number; fee: number; total: number; avgPrice: number; newPrice: number }

/** Executable quote: buys round cost UP to the cent, sells round proceeds DOWN (house-favouring). */
export function quote(m: Market | Book, outcome: number, shares: number): Quote {
  const raw = tradeCost(m.q, m.b, outcome, shares);
  const cents = shares >= 0 ? Math.ceil(raw * 100 - 1e-9) : Math.floor(raw * 100 + 1e-9);
  const fee = Math.ceil(Math.abs(cents) * FEE_RATE);
  const total = shares >= 0 ? cents + fee : cents + fee; // buy: pay cents+fee; sell: cents negative, receive |cents|-fee
  const q2 = m.q.slice(); q2[outcome] += shares;
  return { shares, cents, fee, total, avgPrice: shares ? Math.abs(cents) / Math.abs(shares) / 100 : 0, newPrice: prices(q2, m.b)[outcome] };
}

export function tradingOpen(m: Market, book?: Book): boolean {
  return (m.status === 'open' || m.status === 'live') && !(m.match?.done) && !(m.match?.table.handActive) && !(book && book.lockedAt !== undefined);
}

export interface TradeResult { ok: boolean; error?: string; cashDelta: number /* cents, negative = paid */; fee: number }

/** Player trade. `cashAvailable` in cents. Shares are whole contracts. */
export function playerTrade(m: Market, outcome: number, shares: number, cashAvailable: number, bookIdx = -1): TradeResult {
  const bk = bookOf(m, bookIdx);
  if (!bk) return { ok: false, error: 'No such contract', cashDelta: 0, fee: 0 };
  if (!tradingOpen(m, bk)) return { ok: false, error: 'Trading is locked', cashDelta: 0, fee: 0 };
  if (!Number.isInteger(shares) || shares === 0) return { ok: false, error: 'Whole contracts only', cashDelta: 0, fee: 0 };
  if (outcome < 0 || outcome >= bk.q.length) return { ok: false, error: 'Bad outcome', cashDelta: 0, fee: 0 };
  const pos = bk.player;
  if (shares < 0 && -shares > pos.shares[outcome]) return { ok: false, error: 'Cannot sell more contracts than you own (no naked shorts)', cashDelta: 0, fee: 0 };
  const qt = quote(bk, outcome, shares);
  const price = marketPrices(bk)[outcome];
  const hand = m.match?.table.handNo ?? 0;
  if (shares > 0) {
    const pay = qt.cents + qt.fee;
    if (pay > cashAvailable) return { ok: false, error: 'Insufficient Dollars', cashDelta: 0, fee: 0 };
    pos.shares[outcome] += shares; pos.cost[outcome] += qt.cents; pos.fees += qt.fee;
    bk.q[outcome] += shares; bk.mmCash += qt.cents / 100;
    bk.trades.push({ t: ++m.tick, who: 'You', outcome, shares, cents: qt.cents, fee: qt.fee, price, hand });
    snapshot(m, bk);
    return { ok: true, cashDelta: -pay, fee: qt.fee };
  }
  const n = -shares;
  const proceeds = -qt.cents;
  const receive = Math.max(0, proceeds - qt.fee);
  const basis = Math.round((pos.cost[outcome] / pos.shares[outcome]) * n);
  pos.realized += receive - basis;
  pos.cost[outcome] -= basis; pos.shares[outcome] -= n; pos.fees += qt.fee;
  if (pos.shares[outcome] === 0) pos.cost[outcome] = 0;
  bk.q[outcome] -= n; bk.mmCash -= proceeds / 100;
  bk.trades.push({ t: ++m.tick, who: 'You', outcome, shares, cents: qt.cents, fee: qt.fee, price, hand });
  snapshot(m, bk);
  return { ok: true, cashDelta: receive, fee: qt.fee };
}

function snapshot(m: Market, bk: Book = m as unknown as Book) {
  bk.history.push({ t: m.tick, hand: m.match?.table.handNo ?? 0, p: marketPrices(bk) });
  if (bk.history.length > 400) bk.history.splice(1, bk.history.length - 400);
  if (bk.trades.length > 300) bk.trades.splice(0, bk.trades.length - 300);
}

/** Public-information fair value for an extra book. */
export function bookFair(m: Market, bk: Book): number[] {
  if (bk.result >= 0) return bk.labels.map((_, i) => (i === bk.result ? 1 : 0));
  const t = m.match?.table;
  if (bk.kind === 'first_out') {
    if (!t || t.handNo === 0) return bk.prior.slice();
    const tot = t.seats.reduce((s, x) => s + x.stack + x.totalIn, 0);
    const raw = t.seats.map((s, i) => (s.out ? 0 : Math.pow(tot / Math.max(1, s.stack + s.totalIn), 1.3) * Math.sqrt(bk.prior[i] * 4)));
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map(x => x / sum);
  }
  // long match: expected remaining hands grows with players left and the evenness of stacks
  if (!t || t.handNo === 0) return bk.prior.slice();
  const left = t.seats.filter(s => !s.out).length;
  const expectRemaining = Math.max(0, (left - 1) * 9 * Math.pow(0.85, Math.max(0, t.levelIndex - 4)));
  const z = (t.handNo + expectRemaining - LONG_LINE) / 7;
  const pOver = 1 / (1 + Math.exp(-z));
  return [pOver, 1 - pOver];
}

/** Lock extra books whose outcome has become known (between hands). */
export function lockResolvedBooks(m: Market) {
  const t = m.match?.table;
  if (!t) return;
  for (const bk of m.extra ?? []) {
    if (bk.lockedAt !== undefined) continue;
    if (bk.kind === 'first_out' && t.eliminated.length > 0) { bk.result = t.eliminated[0]; bk.lockedAt = t.handNo; }
    if (bk.kind === 'long_match') {
      if (!t.finished && t.handNo >= Math.ceil(LONG_LINE) - 1 && !t.handActive) { bk.result = 0; bk.lockedAt = t.handNo; }
      else if (t.finished) { bk.result = t.handNo >= Math.ceil(LONG_LINE) ? 0 : 1; bk.lockedAt = t.handNo; }
    }
  }
}

/** Probability model from PUBLIC state: prior skill blended with chip shares; eliminated = 0. */
export function fairEstimate(m: Market): number[] {
  if (!m.match || m.match.table.handNo === 0) return m.prior.slice();
  const seats = m.match.table.seats;
  const total = seats.reduce((s, x) => s + x.stack + x.totalIn, 0);
  // 3.0 calibrated live model: chip share ^ 0.8 (fitted out of sample; see docs/MARKET_CALIBRATION.md)
  const raw = seats.map((s, i) => s.out ? 0 : Math.pow((s.stack + s.totalIn) / total, 0.8) * Math.pow(m.prior[i] * 4, 0.25));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map(x => x / sum);
}

/** Simulated traders react to public information and trade through the LMSR (never moving prices directly). */
export function botsTrade(m: Market, rounds = 1) {
  if (!tradingOpen(m)) return;
  botsTradeBook(m, m as unknown as Book, fairEstimate(m), rounds);
  for (const bk of m.extra ?? []) if (bk.lockedAt === undefined) botsTradeBook(m, bk, bookFair(m, bk), rounds);
}

function botsTradeBook(m: Market, B: Book, fair: number[], rounds: number) {
  const nOut = B.q.length;
  const rng = new Rng(mix(m.matchSeed, 'bots', m.tick, m.match?.table.handNo ?? 0, B.kind));
  for (let r = 0; r < rounds; r++) {
    for (const bot of rng.shuffle([...m.bots])) {
      if (!rng.chance(bot.aggressiveness * (B.kind === 'winner' ? 1 : 0.6))) continue;
      const hold = (bot.books ??= {})[B.kind] ??= Array(nOut).fill(0);
      const p = marketPrices(B);
      const last = B.history.length > 3 ? B.history[B.history.length - 4].p : p;
      const belief = fair.map((f, i) => {
        if (fair[i] === 0) return 0;
        if (bot.strategy === 'informed') return Math.max(0.005, f); // reads the public model exactly
        switch (bot.strategy) {
          case 'momentum': return Math.max(0.005, p[i] + (p[i] - last[i]) * 1.5);
          case 'contrarian': return Math.max(0.005, p[i] - (p[i] - last[i]) * 1.0 + (f - p[i]) * 0.3);
          case 'noise': return Math.max(0.005, p[i] * (1 + (rng.next() - 0.5) * 0.4));
          default: return Math.max(0.005, f * (1 + (bot.bias[i] ?? 0) * (bot.strategy === 'conservative' ? 0.3 : 1)));
        }
      });
      const bs = belief.reduce((a, b) => a + b, 0) || 1;
      const nb = belief.map(x => x / bs);
      // pick the most mispriced outcome from this bot's view
      // choose the best *actionable* edge: buy an underpriced outcome, or sell an overpriced one we hold
      let best = -1, edge = 0, wantUp = true;
      for (let i = 0; i < nOut; i++) {
        const e = nb[i] - p[i];
        if (e > edge) { edge = e; best = i; wantUp = true; }
        else if (-e > edge && hold[i] > 0) { edge = -e; best = i; wantUp = false; }
      }
      const minEdge = bot.strategy === 'conservative' ? 0.06 : bot.strategy === 'speculative' ? 0.015 : 0.025;
      if (best < 0 || edge < minEdge) continue;
      const target = p[best] + (nb[best] - p[best]) * (bot.strategy === 'speculative' ? 0.8 : 0.5);
      let sh = Math.round(sharesToPrice(B.q, B.b, best, target));
      if (!wantUp) {
        sh = Math.max(sh, -hold[best]);
        if (sh >= 0) continue;
      } else {
        const remaining = bot.budget - bot.spent;
        if (remaining <= 1) continue;
        while (sh > 0 && tradeCost(B.q, B.b, best, sh) > remaining) sh = Math.floor(sh / 2);
        sh = Math.min(sh, bot.strategy === 'conservative' ? 20 : 60);
        if (sh <= 0) continue;
      }
      const c = tradeCost(B.q, B.b, best, sh);
      const cents = sh > 0 ? Math.ceil(c * 100) : Math.floor(c * 100);
      const fee = Math.ceil(Math.abs(cents) * FEE_RATE);
      hold[best] += sh;
      bot.spent = Math.max(0, bot.spent + cents / 100 + fee / 100);
      bot.pnl = (bot.pnl ?? 0) - cents - fee;
      B.q[best] += sh; B.mmCash += cents / 100;
      m.tick++;
      B.trades.push({ t: m.tick, who: bot.name, outcome: best, shares: sh, cents, fee, price: p[best], hand: m.match?.table.handNo ?? 0 });
      snapshot(m, B);
    }
  }
}

/** Start the canonical AI-only match backing this market. */
export function goLive(m: Market, rivals: Rival[], cfgIters = 70, reputation?: (id: string) => any) {
  if (m.status !== 'open') return;
  const rs = m.rivalIds.map(id => rivals.find(r => r.id === id)!);
  m.match = createMatch(rs.map(r => ({ id: r.id, name: r.name, isHuman: false, loadout: r.loadout, profile: r.profile, reputation: reputation?.(r.id) })), m.matchSeed, 'exhibition', undefined, m.id + 'x');
  m.match.aiIters = cfgIters;
  m.status = 'live';
}

/** Simulate the next hand (trading is locked while a hand is in progress). Returns true when the match ended. */
export function advanceHand(m: Market): boolean {
  if (m.status !== 'live' || !m.match) return false;
  runHand(m.match);
  lockResolvedBooks(m);
  if (!m.match.done) botsTrade(m, 1);
  else snapshot(m);
  return m.match.done;
}

/** Spectator: advance a single decision (or deal the next hand). Trading stays locked mid-hand. */
export function advanceAction(m: Market): { done: boolean; handEnded: boolean } {
  if (m.status !== 'live' || !m.match) return { done: false, handEnded: false };
  const mt = m.match;
  if (!mt.table.handActive) { beginHand(mt); if (mt.table.handActive) return { done: false, handEnded: false }; }
  else step(mt);
  if (!mt.table.handActive) {
    lockResolvedBooks(m);
    if (!mt.done) botsTrade(m, 1); else snapshot(m);
    return { done: mt.done, handEnded: true };
  }
  return { done: false, handEnded: false };
}

export interface Settlement { payout: number; key: string; already: boolean }

/** Idempotent settlement. Returns cents owed to the player (0 if already settled). */
export function settle(m: Market): Settlement {
  const key = `settle:${m.id}`;
  if (m.status === 'settled' || m.settledKeys.includes(key)) return { payout: 0, key, already: true };
  if (!m.match?.done) throw new Error('match not finished');
  const winnerId = m.match.placementIds[0];
  m.result = m.rivalIds.indexOf(winnerId);
  m.placements = m.rivalIds.map(id => m.match!.placementIds.indexOf(id));
  lockResolvedBooks(m);
  let payout = 0;
  for (const bk of allBooks(m)) {
    if (bk !== (m as unknown as Book) && bk.result < 0) continue;
    const res = bk === (m as unknown as Book) ? m.result : bk.result;
    const pos = bk.player;
    const pay = pos.shares[res] * 100;
    payout += pay;
    pos.realized += pay - pos.cost.reduce((a, b) => a + b, 0);
    bk.mmCash -= bk.q[res] - bk.q0[res]; // pays $1 per outstanding winning share
    pos.shares = pos.shares.map(() => 0); pos.cost = pos.cost.map(() => 0);
    for (const bot of m.bots) { const h = bot.books?.[bk.kind] ?? (bk.kind === 'winner' ? bot.shares : undefined); if (h) bot.pnl = (bot.pnl ?? 0) + (h[res] ?? 0) * 100; }
  }
  m.status = 'settled';
  m.settledKeys.push(key);
  return { payout, key, already: false };
}

/** Cancel a market (e.g. withdrawal before the match). Refunds the cost basis of open positions. */
export function cancel(m: Market, reason: string): number {
  if (m.status === 'settled' || m.status === 'cancelled') return 0;
  let refund = 0;
  for (const bk of allBooks(m)) { refund += bk.player.cost.reduce((a, b) => a + b, 0); bk.player.shares = bk.player.shares.map(() => 0); bk.player.cost = bk.player.cost.map(() => 0); }
  m.status = 'cancelled'; m.cancelReason = reason; m.refunded = refund;
  m.settledKeys.push(`cancel:${m.id}`);
  return refund;
}

export function bookValue(bk: Book): number {
  const p = bk.result >= 0 ? bk.labels.map((_, i) => (i === bk.result ? 1 : 0)) : marketPrices(bk);
  return bk.player.shares.reduce((s, sh, i) => s + sh * p[i] * 100, 0);
}
export function positionValue(m: Market): number { return allBooks(m).reduce((s, bk) => s + bookValue(bk), 0); }
export function positionCost(m: Market): number { return allBooks(m).reduce((s, bk) => s + bk.player.cost.reduce((a, b) => a + b, 0), 0); }
export function unrealized(m: Market): number { return positionValue(m) - positionCost(m); }
export function realizedTotal(m: Market): number { return allBooks(m).reduce((s, bk) => s + bk.player.realized, 0); }

/** Market maker's worst-case loss bound (dollars). */
export function mmLossBound(m: Market | Book): number { return m.b * Math.log(1 / Math.min(...m.prior)); }
export { cost };
