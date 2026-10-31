/**
 * 3.0 LIMIT ORDERS on match markets (every contract book).
 * - BUY: reserves ceil(qty × limit × (1 + fee)) cents in escrow. Fills only while the LMSR price is below the limit,
 *   and only as many contracts as keep the marginal price ≤ limit → average fill price < limit (partial fills).
 * - SELL: reserves the shares (they cannot be sold twice). Fills while price > limit, down to the limit.
 * - Fills happen only when trading is open (between hands). Orders expire at a chosen hand or at match end /
 *   settlement / cancellation; unused escrow is refunded exactly once (idempotent ledger keys).
 */
import type { GameState } from './game';
import { ledger } from './game';
import { bookOf, FEE_RATE, marketPrices, playerTrade, tradingOpen } from './market';
import { sharesToPrice } from './lmsr';

export interface LimitOrder {
  id: string; marketId: string; bookIdx: number; outcome: number; side: 'buy' | 'sell';
  limit: number; qty: number; filled: number; reserve: number; status: 'open' | 'filled' | 'cancelled' | 'expired';
  createdDay: number; expiresHand: number | null; fills: { shares: number; cents: number; hand: number }[];
}

export function reservedShares(g: GameState, marketId: string, bookIdx: number, outcome: number): number {
  return g.orders.filter(o => o.status === 'open' && o.side === 'sell' && o.marketId === marketId && o.bookIdx === bookIdx && o.outcome === outcome).reduce((s, o) => s + (o.qty - o.filled), 0);
}

export function placeLimit(g: GameState, marketId: string, bookIdx: number, outcome: number, side: 'buy' | 'sell', limitCents: number, qty: number, expiresHand: number | null = null): string | null {
  const m = g.markets.find(x => x.id === marketId); if (!m) return 'No market';
  const bk = bookOf(m, bookIdx); if (!bk) return 'No such contract';
  if (m.status !== 'open' && m.status !== 'live') return 'Market closed';
  if (bk.lockedAt !== undefined) return 'This contract is already decided';
  if (!Number.isInteger(qty) || qty <= 0 || qty > 2000) return 'Quantity must be 1–2000 whole contracts';
  if (!Number.isInteger(limitCents) || limitCents < 1 || limitCents > 99) return 'Limit must be 1–99¢';
  if (outcome < 0 || outcome >= bk.q.length) return 'Bad outcome';
  const id = `lo${++g.counter}`;
  let reserve = 0;
  if (side === 'buy') {
    reserve = Math.ceil(qty * limitCents * (1 + FEE_RATE)) + 1;
    if (!ledger(g, -reserve, 'escrow', `Limit BUY ${qty} × ${bk.labels[outcome]} @ ${limitCents}¢ (reserved)`, `esc:${id}`)) return 'Insufficient Dollars to reserve';
  } else {
    const free = bk.player.shares[outcome] - reservedShares(g, marketId, bookIdx, outcome);
    if (qty > free) return 'Not enough unreserved contracts (no naked shorts)';
  }
  g.orders.push({ id, marketId, bookIdx, outcome, side, limit: limitCents / 100, qty, filled: 0, reserve, status: 'open', createdDay: g.day, expiresHand, fills: [] });
  processOrders(g, marketId);
  return null;
}

function close(g: GameState, o: LimitOrder, status: LimitOrder['status']) {
  if (o.status !== 'open') return;
  o.status = status;
  if (o.side === 'buy' && o.reserve > 0) { ledger(g, o.reserve, 'escrow', `Escrow released (${status}) — order ${o.id}`, `escrel:${o.id}`); o.reserve = 0; }
}
export function cancelOrder(g: GameState, id: string): string | null {
  const o = g.orders.find(x => x.id === id); if (!o) return 'No order';
  if (o.status !== 'open') return 'Order is not open';
  close(g, o, 'cancelled');
  return null;
}
export function expireOrders(g: GameState, marketId: string) {
  for (const o of g.orders) if (o.marketId === marketId && o.status === 'open') close(g, o, 'expired');
  pruneOrders(g);
}
function pruneOrders(g: GameState) { const done = g.orders.filter(o => o.status !== 'open'); if (done.length > 60) g.orders = g.orders.filter(o => o.status === 'open' || done.slice(-60).includes(o)); }

/** Try to fill open orders on a market at current prices. Safe to call any time. */
export function processOrders(g: GameState, marketId: string) {
  const m = g.markets.find(x => x.id === marketId); if (!m) return;
  for (const o of g.orders) {
    if (o.status !== 'open' || o.marketId !== marketId) continue;
    const bk = bookOf(m, o.bookIdx);
    const hand = m.match?.table.handNo ?? 0;
    if (bk.lockedAt !== undefined || (o.expiresHand !== null && hand >= o.expiresHand)) { close(g, o, 'expired'); continue; }
    if (!tradingOpen(m, bk)) continue;
    const p = marketPrices(bk)[o.outcome];
    const left = o.qty - o.filled;
    if (o.side === 'buy' && p < o.limit) {
      let n = Math.min(left, Math.floor(sharesToPrice(bk.q, bk.b, o.outcome, o.limit)));
      while (n > 0) {
        const r = playerTrade(m, o.outcome, n, o.reserve, o.bookIdx);
        if (r.ok) { o.reserve += r.cashDelta; o.filled += n; o.fills.push({ shares: n, cents: -r.cashDelta, hand }); g.ledgerTotals['sink:fees'] = (g.ledgerTotals['sink:fees'] ?? 0) + r.fee; break; }
        n = Math.floor(n / 2);
      }
    } else if (o.side === 'sell' && p > o.limit) {
      const own = bk.player.shares[o.outcome];
      let n = Math.min(left, own, Math.floor(-sharesToPrice(bk.q, bk.b, o.outcome, o.limit)));
      if (n > 0) {
        const r = playerTrade(m, o.outcome, -n, 0, o.bookIdx);
        if (r.ok) { ledger(g, r.cashDelta, 'exchange', `Limit SELL fill ${n} × ${bk.labels[o.outcome]} (order ${o.id})`); o.filled += n; o.fills.push({ shares: -n, cents: r.cashDelta, hand }); g.ledgerTotals['sink:fees'] = (g.ledgerTotals['sink:fees'] ?? 0) + r.fee; }
      }
    }
    if (o.filled >= o.qty) close(g, o, 'filled');
  }
}
