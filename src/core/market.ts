import { cost, initialQ, prices, sharesToPrice, tradeCost } from './lmsr';
import { createMatch, MatchState, runHand } from './match';
import { Rival, winProbabilities } from './rivals';
import { mix, Rng } from './rng';

export const FEE_RATE = 0.02;
export type MarketStatus = 'open' | 'live' | 'settled' | 'cancelled';

export interface Position { shares: number[]; cost: number[] /* cents basis of open shares */; realized: number /* cents */; fees: number }
export interface TradeRecord { t: number; who: string; outcome: number; shares: number; cents: number; fee: number; price: number; hand: number }
export interface PricePoint { t: number; hand: number; p: number[] }

export interface TraderBot {
  id: string; name: string; strategy: 'fundamental' | 'momentum' | 'contrarian' | 'noise' | 'whale';
  bias: number[]; budget: number /* dollars */; shares: number[]; spent: number; aggressiveness: number;
}

export interface Market {
  id: string;
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
  const strategies: TraderBot['strategy'][] = ['fundamental', 'fundamental', 'fundamental', 'momentum', 'momentum', 'contrarian', 'contrarian', 'noise', 'noise', 'whale'];
  const bots: TraderBot[] = strategies.map((s, k) => ({
    id: `${id}b${k}`, name: ['Mercator', 'Argentarius', 'Negotiator', 'Spectator', 'Fortuna', 'Haruspex', 'Publicanus', 'Tabellarius', 'Lanista', 'Patronus'][k],
    strategy: s, bias: rivals.map(() => (rng.next() - 0.5) * (s === 'noise' ? 0.5 : 0.25)),
    budget: s === 'whale' ? 400 : 60 + rng.int(80), shares: [0, 0, 0, 0], spent: 0, aggressiveness: 0.3 + rng.next() * 0.5,
  }));
  return {
    id, title: `${RANK_TITLE(rank)} #${id.slice(1)}`,
    rivalIds: rivals.map(r => r.id), names: rivals.map(r => r.name), rank, b, q: q0.slice(), q0, status: 'open', prior,
    history: [{ t: 0, hand: 0, p: prices(q0, b) }], trades: [], bots, player: emptyPosition(), match: null, matchSeed: mix(seed, 'match'),
    result: -1, placements: [], mmCash: 0, tick: 0, createdDay: day, settledKeys: [],
  };
}
const RANK_TITLE = (r: number) => ['Snowfield Bout', 'Tavern Clash', 'Ludus Duel', 'Legion Contest', 'Praetorian Trial', 'Consular Games', 'Imperial Games', 'Caesarean Games', 'Divine Games'][r] ?? 'Exhibition';

export function marketPrices(m: Market): number[] { return prices(m.q, m.b); }

export interface Quote { shares: number; cents: number; fee: number; total: number; avgPrice: number; newPrice: number }

/** Executable quote: buys round cost UP to the cent, sells round proceeds DOWN (house-favouring). */
export function quote(m: Market, outcome: number, shares: number): Quote {
  const raw = tradeCost(m.q, m.b, outcome, shares);
  const cents = shares >= 0 ? Math.ceil(raw * 100 - 1e-9) : Math.floor(raw * 100 + 1e-9);
  const fee = Math.ceil(Math.abs(cents) * FEE_RATE);
  const total = shares >= 0 ? cents + fee : cents + fee; // buy: pay cents+fee; sell: cents negative, receive |cents|-fee
  const q2 = m.q.slice(); q2[outcome] += shares;
  return { shares, cents, fee, total, avgPrice: shares ? Math.abs(cents) / Math.abs(shares) / 100 : 0, newPrice: prices(q2, m.b)[outcome] };
}

export function tradingOpen(m: Market): boolean {
  return (m.status === 'open' || m.status === 'live') && !(m.match?.done) && !(m.match?.table.handActive);
}

export interface TradeResult { ok: boolean; error?: string; cashDelta: number /* cents, negative = paid */; fee: number }

/** Player trade. `cashAvailable` in cents. Shares are whole contracts. */
export function playerTrade(m: Market, outcome: number, shares: number, cashAvailable: number): TradeResult {
  if (!tradingOpen(m)) return { ok: false, error: 'Trading is locked', cashDelta: 0, fee: 0 };
  if (!Number.isInteger(shares) || shares === 0) return { ok: false, error: 'Whole contracts only', cashDelta: 0, fee: 0 };
  if (outcome < 0 || outcome >= m.q.length) return { ok: false, error: 'Bad outcome', cashDelta: 0, fee: 0 };
  const pos = m.player;
  if (shares < 0 && -shares > pos.shares[outcome]) return { ok: false, error: 'Cannot sell more contracts than you own (no naked shorts)', cashDelta: 0, fee: 0 };
  const qt = quote(m, outcome, shares);
  const price = marketPrices(m)[outcome];
  if (shares > 0) {
    const pay = qt.cents + qt.fee;
    if (pay > cashAvailable) return { ok: false, error: 'Insufficient Dollars', cashDelta: 0, fee: 0 };
    pos.shares[outcome] += shares; pos.cost[outcome] += qt.cents; pos.fees += qt.fee;
    m.q[outcome] += shares; m.mmCash += qt.cents / 100;
    m.trades.push({ t: ++m.tick, who: 'You', outcome, shares, cents: qt.cents, fee: qt.fee, price, hand: m.match?.table.handNo ?? 0 });
    snapshot(m);
    return { ok: true, cashDelta: -pay, fee: qt.fee };
  } else {
    const n = -shares;
    const proceeds = -qt.cents; // positive cents
    const receive = Math.max(0, proceeds - qt.fee);
    const avg = pos.cost[outcome] / pos.shares[outcome];
    const basis = Math.round(avg * n);
    pos.realized += receive - basis;
    pos.cost[outcome] -= basis; pos.shares[outcome] -= n; pos.fees += qt.fee;
    if (pos.shares[outcome] === 0) pos.cost[outcome] = 0;
    m.q[outcome] -= n; m.mmCash -= proceeds / 100;
    m.trades.push({ t: ++m.tick, who: 'You', outcome, shares, cents: qt.cents, fee: qt.fee, price, hand: m.match?.table.handNo ?? 0 });
    snapshot(m);
    return { ok: true, cashDelta: receive, fee: qt.fee };
  }
}

function snapshot(m: Market) {
  m.history.push({ t: m.tick, hand: m.match?.table.handNo ?? 0, p: marketPrices(m) });
  if (m.history.length > 400) m.history.splice(1, m.history.length - 400);
}

/** Probability model from PUBLIC state: prior skill blended with chip shares; eliminated = 0. */
export function fairEstimate(m: Market): number[] {
  if (!m.match || m.match.table.handNo === 0) return m.prior.slice();
  const seats = m.match.table.seats;
  const total = seats.reduce((s, x) => s + x.stack + x.totalIn, 0);
  const raw = seats.map((s, i) => s.out ? 0 : ((s.stack + s.totalIn) / total) * Math.pow(m.prior[i] * 4, 0.5));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map(x => x / sum);
}

/** Simulated traders react to public information and trade through the LMSR (never moving prices directly). */
export function botsTrade(m: Market, rounds = 1) {
  if (!tradingOpen(m)) return;
  const fair = fairEstimate(m);
  const rng = new Rng(mix(m.matchSeed, 'bots', m.tick, m.match?.table.handNo ?? 0));
  for (let r = 0; r < rounds; r++) {
    for (const bot of rng.shuffle([...m.bots])) {
      if (!rng.chance(bot.aggressiveness)) continue;
      const p = marketPrices(m);
      const last = m.history.length > 3 ? m.history[m.history.length - 4].p : p;
      const belief = fair.map((f, i) => {
        if (fair[i] === 0) return 0;
        switch (bot.strategy) {
          case 'momentum': return Math.max(0.005, p[i] + (p[i] - last[i]) * 1.5);
          case 'contrarian': return Math.max(0.005, p[i] - (p[i] - last[i]) * 1.0 + (f - p[i]) * 0.3);
          case 'noise': return Math.max(0.005, p[i] * (1 + (rng.next() - 0.5) * 0.4));
          default: return Math.max(0.005, f * (1 + bot.bias[i]));
        }
      });
      const bs = belief.reduce((a, b) => a + b, 0) || 1;
      const nb = belief.map(x => x / bs);
      // pick the most mispriced outcome from this bot's view
      let best = 0, edge = -1;
      for (let i = 0; i < 4; i++) { const e = Math.abs(nb[i] - p[i]); if (e > edge) { edge = e; best = i; } }
      if (edge < 0.025) continue;
      const wantUp = nb[best] > p[best];
      const target = p[best] + (nb[best] - p[best]) * 0.5;
      let sh = Math.round(sharesToPrice(m.q, m.b, best, target));
      if (!wantUp) {
        sh = Math.max(sh, -bot.shares[best]);
        if (sh >= 0) continue;
      } else {
        const remaining = bot.budget - bot.spent;
        if (remaining <= 1) continue;
        while (sh > 0 && tradeCost(m.q, m.b, best, sh) > remaining) sh = Math.floor(sh / 2);
        sh = Math.min(sh, 60);
        if (sh <= 0) continue;
      }
      const c = tradeCost(m.q, m.b, best, sh);
      const cents = sh > 0 ? Math.ceil(c * 100) : Math.floor(c * 100);
      const fee = Math.ceil(Math.abs(cents) * FEE_RATE);
      bot.shares[best] += sh;
      bot.spent += cents / 100 + fee / 100;
      m.q[best] += sh; m.mmCash += cents / 100;
      m.tick++;
      m.trades.push({ t: m.tick, who: bot.name, outcome: best, shares: sh, cents, fee, price: p[best], hand: m.match?.table.handNo ?? 0 });
      if (m.trades.length > 300) m.trades.splice(0, m.trades.length - 300);
      snapshot(m);
    }
  }
}

/** Start the canonical AI-only match backing this market. */
export function goLive(m: Market, rivals: Rival[], cfgIters = 70) {
  if (m.status !== 'open') return;
  const rs = m.rivalIds.map(id => rivals.find(r => r.id === id)!);
  m.match = createMatch(rs.map(r => ({ id: r.id, name: r.name, isHuman: false, loadout: r.loadout, profile: r.profile })), m.matchSeed, 'exhibition', undefined, m.id + 'x');
  m.match.aiIters = cfgIters;
  m.status = 'live';
}

/** Simulate the next hand (trading is locked while a hand is in progress). Returns true when the match ended. */
export function advanceHand(m: Market): boolean {
  if (m.status !== 'live' || !m.match) return false;
  runHand(m.match);
  if (!m.match.done) botsTrade(m, 1);
  else snapshot(m);
  return m.match.done;
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
  const pos = m.player;
  const payout = pos.shares[m.result] * 100;
  const basis = pos.cost.reduce((a, b) => a + b, 0);
  pos.realized += payout - basis;
  m.mmCash -= m.q[m.result] - m.q0[m.result]; // pays $1 per outstanding winning share issued by this market
  pos.shares = [0, 0, 0, 0]; pos.cost = [0, 0, 0, 0];
  m.status = 'settled';
  m.settledKeys.push(key);
  return { payout, key, already: false };
}

/** Cancel a market (e.g. withdrawal before the match). Refunds the cost basis of open positions. */
export function cancel(m: Market, reason: string): number {
  if (m.status === 'settled' || m.status === 'cancelled') return 0;
  const refund = m.player.cost.reduce((a, b) => a + b, 0);
  m.player.shares = [0, 0, 0, 0]; m.player.cost = [0, 0, 0, 0];
  m.status = 'cancelled'; m.cancelReason = reason; m.refunded = refund;
  m.settledKeys.push(`cancel:${m.id}`);
  return refund;
}

export function positionValue(m: Market): number {
  const p = marketPrices(m);
  return m.player.shares.reduce((s, sh, i) => s + sh * p[i] * 100, 0);
}
export function unrealized(m: Market): number { return positionValue(m) - m.player.cost.reduce((a, b) => a + b, 0); }

/** Market maker's worst-case loss bound (dollars). */
export function mmLossBound(m: Market): number { return m.b * Math.log(1 / Math.min(...m.prior)); }
export { cost };
