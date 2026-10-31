import { useEffect, useMemo, useState } from 'react';
import { exchangeTrade, GameState, marketFastForward, marketNextHand, marketStep, startMarketMatch, ordinal, toggleWatch } from '../core/game';
import { allBooks, Book, bookFair, bookOf, bookTitle, bookValue, fairEstimate, marketPrices, mmLossBound, positionCost, positionValue, quote, realizedTotal, tradingOpen, unrealized, Market, FEE_RATE } from '../core/market';
import { RANKS } from '../core/ranks';
import { winProbabilities } from '../core/rivals';
import { dispatch } from '../store';
import { sfx } from '../art/sound';
import { cents, money, Panel, pct, PlayingCard, Portrait, RankBadge, SEAT_COLORS, Sparkline } from './common';

const short = (n: string) => n.split(' ').slice(0, 2).join(' ');
const BOOK_COLORS = [['#6fdc8c', '#ff7a6e']];

export function ExchangeTab({ g, toast }: { g: GameState; toast: (t: string, k?: string) => void }) {
  const [selId, setSelId] = useState(g.markets[0]?.id);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'markets' | 'portfolio' | 'history'>('markets');
  const m = g.markets.find(x => x.id === selId) ?? g.markets[0];
  const lib = g.empire.library ?? 0;
  const live = g.markets.filter(x => x.status === 'open' || x.status === 'live');
  const totalValue = live.reduce((s, x) => s + positionValue(x), 0);
  const totalCost = live.reduce((s, x) => s + positionCost(x), 0);
  const fees = g.ledgerTotals['sink:fees'] ?? 0;
  const filtered = g.markets.filter(x => !q || x.title.toLowerCase().includes(q.toLowerCase()) || x.names.some(n => n.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="tab exchange-tab">
      <Panel title="The Arena Exchange" right={<div className="seg">{(['markets', 'portfolio', 'history'] as const).map(k => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{{ markets: 'Markets', portfolio: 'Portfolio', history: 'History' }[k]}</button>)}</div>}>
        <div className="portfolio">
          <div><span>Open position value</span><b>{money(totalValue)}</b></div>
          <div><span>Unrealized P/L</span><b className={totalValue - totalCost >= 0 ? 'pos' : 'neg'}>{money(totalValue - totalCost)}</b></div>
          <div><span>Exposure (max loss)</span><b>{money(totalCost)}</b></div>
          <div><span>Net cash from Exchange</span><b className={(g.ledgerTotals.exchange ?? 0) >= 0 ? 'pos' : 'neg'}>{money(g.ledgerTotals.exchange ?? 0)}</b></div>
          <div><span>Fees paid ({Math.round(FEE_RATE * 100)}%)</span><b>{money(fees)}</b></div>
          <div><span>Markets settled</span><b>{g.stats.marketsSettled}</b></div>
        </div>
      </Panel>

      {view === 'portfolio' && <PortfolioView g={g} lib={lib} onOpen={id => { setSelId(id); setView('markets'); }} />}
      {view === 'history' && <HistoryView g={g} />}
      {view === 'markets' && (
        <>
          <div className="market-tools">
            <input className="search" placeholder="Search markets or competitors…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search markets" />
            {g.watchlist.length > 0 && <span className="muted">★ watching {g.watchlist.length}</span>}
          </div>
          <div className="market-list" role="tablist">
            {filtered.map(x => {
              const p = marketPrices(x);
              const watched = x.rivalIds.some(id => g.watchlist.includes(id));
              return (
                <button key={x.id} role="tab" aria-selected={x.id === m?.id} className={`market-card${x.id === m?.id ? ' sel' : ''} st-${x.status}`} onClick={() => setSelId(x.id)}>
                  <div className="mc-head"><b>{watched && '★ '}{x.title}</b><span className={`status ${x.status}`}>{x.status === 'live' ? `LIVE #${x.match?.table.handNo ?? 0}` : x.status.toUpperCase()}</span></div>
                  <div className="mc-rows">{x.names.map((n, i) => <div key={i}><i style={{ background: SEAT_COLORS[i] }} />{short(n)}<span>{x.status === 'settled' ? (i === x.result ? 'WON' : '—') : cents(p[i])}</span></div>)}</div>
                  {positionCost(x) > 0 && <div className="mc-pos">Position: {money(positionValue(x))}</div>}
                </button>
              );
            })}
          </div>
          {m && <MarketDetail g={g} m={m} lib={lib} toast={toast} />}
        </>
      )}
    </div>
  );
}

function PortfolioView({ g, lib, onOpen }: { g: GameState; lib: number; onOpen: (id: string) => void }) {
  const rows = g.markets.flatMap(m => allBooks(m).flatMap((bk, bi) => bk.player.shares.map((sh, i) => ({ m, bk, bi: bi - 1, i, sh })).filter(r => r.sh > 0)));
  return (
    <Panel title="Open Positions" right={<span className="muted">{rows.length} position(s)</span>}>
      {rows.length === 0 ? <p className="muted">No open positions. Buy contracts in the Markets view.</p> : (
        <table className="ladder positions">
          <thead><tr><th>Market</th><th>Contract</th><th>Qty</th><th>Avg cost</th><th>Price</th><th>Value</th><th>Unrealized</th></tr></thead>
          <tbody>{rows.map(({ m, bk, i, sh }) => {
            const price = bk.result >= 0 ? (bk.result === i ? 1 : 0) : marketPrices(bk)[i];
            const cost = bk.player.cost[i];
            const val = sh * price * 100;
            return <tr key={m.id + bk.kind + i} onClick={() => onOpen(m.id)}><td>{m.title}</td><td>{bookTitle(bk)}: {bk.labels[i]}</td><td>{sh}</td><td>{cents(cost / sh / 100)}</td><td>{cents(price)}</td><td>{money(val)}</td><td className={val - cost >= 0 ? 'pos' : 'neg'}>{money(val - cost)}</td></tr>;
          })}</tbody>
        </table>
      )}
      {lib >= 3 && rows.length > 0 && (() => {
        const byMarket = g.markets.map(m => ({ m, c: positionCost(m) })).filter(x => x.c > 0);
        const total = byMarket.reduce((s, x) => s + x.c, 0);
        const worst = Math.max(...byMarket.map(x => x.c));
        return <p className="research">📚 Risk summary: total exposure {money(total)} across {byMarket.length} market(s); largest single-market exposure {money(worst)} ({pct(worst / Math.max(1, total))}); bankroll at risk {pct(total / Math.max(1, g.player.bankroll + total))}.</p>;
      })()}
      <h4>Settlement records</h4>
      <table className="ladder"><thead><tr><th>Market</th><th>Winner</th><th>Your P/L</th></tr></thead>
        <tbody>{[...g.markets.filter(x => x.status === 'settled' || x.status === 'cancelled').map(x => ({ id: x.id, title: x.title, w: x.status === 'cancelled' ? 'Cancelled' : x.names[x.result], pnl: realizedTotal(x) })),
          ...[...g.archive].reverse().map(a => ({ id: a.id, title: a.title, w: a.status === 'cancelled' ? 'Cancelled' : a.names[a.result], pnl: a.pnl }))].slice(0, 15).map(r => <tr key={r.id}><td>{r.title}</td><td>{r.w}</td><td className={r.pnl >= 0 ? 'pos' : 'neg'}>{money(r.pnl)}</td></tr>)}</tbody>
      </table>
    </Panel>
  );
}

function HistoryView({ g }: { g: GameState }) {
  return (
    <Panel title="Trading History" right={<span className="muted">last {g.tradeLog.length}</span>}>
      {g.tradeLog.length === 0 ? <p className="muted">No trades yet.</p> : (
        <table className="ladder"><thead><tr><th>Day</th><th>Market</th><th>Contract</th><th>Qty</th><th>Cash</th><th>Fee</th></tr></thead>
          <tbody>{[...g.tradeLog].reverse().map(t => <tr key={t.t}><td>{t.day}</td><td>{t.market}</td><td>{t.book}: {t.label}</td><td className={t.shares > 0 ? 'pos' : 'neg'}>{t.shares > 0 ? '+' : ''}{t.shares}</td><td>{money(t.cents)}</td><td>{money(t.fee)}</td></tr>)}</tbody>
        </table>
      )}
    </Panel>
  );
}

function MarketDetail({ g, m, lib, toast }: { g: GameState; m: Market; lib: number; toast: (t: string, k?: string) => void }) {
  const [bi, setBi] = useState(-1);
  const [qty, setQty] = useState(10);
  const [auto, setAuto] = useState<'off' | 'actions' | 'hands'>('off');
  const bk = bookOf(m, bi) ?? bookOf(m, -1);
  const p = marketPrices(bk);
  const fair = bk.kind === 'winner' ? fairEstimate(m) : bookFair(m, bk);
  const open = tradingOpen(m, bk);
  const rivals = m.rivalIds.map(id => g.rivals.find(r => r.id === id));
  const t = m.match?.table;
  const colors = bk.kind === 'long_match' ? BOOK_COLORS[0] : SEAT_COLORS;
  useEffect(() => { setBi(-1); setAuto('off'); }, [m.id]);
  useEffect(() => {
    if (auto === 'off' || !(m.status === 'open' || m.status === 'live')) { if (auto !== 'off' && m.status !== 'open' && m.status !== 'live') setAuto('off'); return; }
    const id = setInterval(() => {
      const r = auto === 'actions' ? dispatch(g => marketStep(g, m.id)) : { done: !!dispatch(g => marketNextHand(g, m.id)) };
      if (r?.done) { setAuto('off'); sfx.coin(); }
    }, auto === 'actions' ? (g.settings.reducedMotion ? 120 : 380) : (g.settings.reducedMotion ? 300 : 700));
    return () => clearInterval(id);
  }, [auto, m.id, m.status]);
  const trade = (i: number, n: number) => {
    const err = dispatch(g => exchangeTrade(g, m.id, i, n, bi));
    if (err) { sfx.error(); toast(err, 'error'); } else { sfx.chip(); toast(`${n > 0 ? 'Bought' : 'Sold'} ${Math.abs(n)} × ${bk.labels[i]}`, 'trade'); }
  };
  const h2h = useMemo(() => m.rivalIds.map(a => m.rivalIds.map(b => (a === b ? null : g.rivals.find(r => r.id === b)?.beatenBy[a] ?? 0))), [m.id, g.day]);
  const handMarks = bk.history.map((h, i) => (i > 0 && h.hand !== bk.history[i - 1].hand ? i : -1)).filter(i => i >= 0 && bk.history.length < 200);
  const lastActs = t ? t.log.filter(l => l.hand === t.handNo).slice(-5) : [];
  const showdown = t && !t.handActive && t.lastResult?.showdown ? Object.keys(t.lastResult.scores).map(Number) : [];
  return (
    <Panel className="market-detail" title={<>{m.title} <RankBadge rank={m.rank} small /></>} right={<span className={`status ${m.status}`}>{m.status === 'live' ? `LIVE · hand ${t?.handNo ?? 0}` : m.status.toUpperCase()}</span>}>
      <div className="seg books" role="tablist" aria-label="Contracts">
        {allBooks(m).map((b, i) => <button key={b.kind} role="tab" aria-selected={bi === i - 1} className={bi === i - 1 ? 'on' : ''} onClick={() => setBi(i - 1)}>{bookTitle(b)}{b.lockedAt !== undefined && m.status !== 'settled' ? ' 🔒' : ''}{b.player.shares.some(s => s > 0) ? ' •' : ''}</button>)}
      </div>
      <p className="rule">📜 <b>Rule:</b> {bk.rule}</p>
      <div className="mk-controls">
        {m.status === 'open' && <button className="btn gold" onClick={() => { dispatch(g => startMarketMatch(g, m.id)); sfx.card(); }}>▶ Start match</button>}
        {(m.status === 'open' || m.status === 'live') && <>
          <button className={'btn' + (auto === 'actions' ? ' on' : '')} onClick={() => setAuto(auto === 'actions' ? 'off' : 'actions')}>{auto === 'actions' ? '❚❚ Pause' : '👁 Spectate live'}</button>
          <button className="btn" onClick={() => dispatch(g => marketNextHand(g, m.id))}>Next hand</button>
          <button className={'btn' + (auto === 'hands' ? ' on' : '')} onClick={() => setAuto(auto === 'hands' ? 'off' : 'hands')}>{auto === 'hands' ? '❚❚' : '▶▶ Hands'}</button>
          <button className="btn" onClick={() => { setAuto('off'); dispatch(g => marketFastForward(g, m.id)); sfx.coin(); }}>⏭ Result</button>
        </>}
        <span className="muted lock">{open ? '🔓 Trading open between hands' : bk.lockedAt !== undefined && m.status === 'live' ? `🔒 Decided at hand ${bk.lockedAt}` : m.status === 'live' ? '🔒 Locked during a hand' : m.status === 'settled' ? '🔒 Settled' : '🔒 Closed'}</span>
      </div>
      {m.status === 'settled' && (
        <div className="settled-banner">
          <b>{m.names[m.result]} wins!</b> Your P/L on this match: <b className={realizedTotal(m) >= 0 ? 'pos' : 'neg'}>{money(realizedTotal(m))}</b>
          <div className="placings-inline">{m.placements.map((pl, i) => ({ pl, i })).sort((a, b) => a.pl - b.pl).map(({ pl, i }) => <span key={i}>{ordinal(pl + 1)} {short(m.names[i])}</span>)}</div>
          <div className="placings-inline">{(m.extra ?? []).map(b => <span key={b.kind}>{bookTitle(b)}: {b.result >= 0 ? b.labels[b.result] : '—'}</span>)}</div>
        </div>
      )}
      {m.status === 'cancelled' && <div className="settled-banner">Cancelled: {m.cancelReason}. Refunded {money(m.refunded ?? 0)} at cost.</div>}

      {t && m.status === 'live' && (
        <div className="spectator">
          <div className="spec-seats">
            {t.seats.map((s, i) => (
              <div key={i} className={`spec-seat${t.toAct === i && t.handActive ? ' acting' : ''}${s.folded && !s.out ? ' folded' : ''}${s.out ? ' out' : ''}`} style={{ borderColor: SEAT_COLORS[i] }}>
                {rivals[i] && <Portrait seed={rivals[i]!.portraitSeed} rank={rivals[i]!.rank} style={rivals[i]!.style} size={28} />}
                <div><b>{short(m.names[i])}</b><small>{s.out ? 'out' : s.stack}{s.committed ? ` · bet ${s.committed}` : ''}{t.dealer === i ? ' · D' : ''}</small></div>
                <div className="spec-cards">{!s.out && s.hole.map((c, k) => <PlayingCard key={k} card={showdown.includes(i) ? c : undefined} hidden={!showdown.includes(i)} small />)}</div>
              </div>
            ))}
          </div>
          <div className="spec-board">{[0, 1, 2, 3, 4].map(i => t.board[i] !== undefined ? <PlayingCard key={i + '-' + t.board[i]} card={t.board[i]} small /> : <div key={i} className="pcard small slot" />)}<span className="pot">POT {t.seats.reduce((a, s) => a + s.totalIn, 0) || (t.lastResult?.pots.reduce((a, p) => a + p.amount, 0) ?? 0)}</span></div>
          <div className="spec-log">{lastActs.map((l, i) => <div key={i}>{l.text}</div>)}</div>
        </div>
      )}

      <div className="chart-wrap">
        <Sparkline series={bk.history.map(h => h.p)} colors={colors} markers={handMarks} />
        <div className="chart-legend">{bk.labels.map((n, i) => <span key={i}><i style={{ background: colors[i] }} />{short(n)} {cents(p[i])}</span>)}</div>
        <small className="muted">Every point is an executed trade on this book's LMSR market maker (b = {bk.b}). Max market-maker loss bound: ${mmLossBound(bk).toFixed(0)}.</small>
      </div>

      <div className="qty-row">
        <span>Contracts:</span>
        {[1, 5, 10, 25, 50, 100].map(n => <button key={n} className={qty === n ? 'on' : ''} onClick={() => setQty(n)}>{n}</button>)}
        <input type="number" min={1} max={1000} value={qty} onChange={e => setQty(Math.max(1, Math.min(1000, Math.floor(+e.target.value || 1))))} aria-label="Quantity" />
        <span className="muted">Max per order you can afford on a 30¢ contract: {Math.floor(g.player.bankroll / 31)}</span>
      </div>

      <div className="outcomes">
        {bk.labels.map((n, i) => {
          const rv = bk.kind === 'long_match' ? undefined : rivals[i];
          const qb = quote(bk, i, qty);
          const pos = bk.player;
          const canSell = Math.min(qty, pos.shares[i]);
          const qs = canSell > 0 ? quote(bk, i, -canSell) : null;
          const seat = bk.kind !== 'long_match' ? t?.seats[i] : undefined;
          const out = seat?.out && bk.kind === 'winner';
          const totalChips = t ? t.seats.reduce((s, x) => s + x.stack + x.totalIn, 0) : 0;
          return (
            <div key={i} className={`outcome${out ? ' out' : ''}${(bk.kind === 'winner' ? m.result : bk.result) === i ? ' won' : ''}`}>
              <div className="oc-who">
                <i className="swatch" style={{ background: colors[i] }} />
                {rv && <Portrait seed={rv.portraitSeed} rank={rv.rank} style={rv.style} size={40} />}
                <div>
                  <b>{n}</b>
                  {rv && <button className="star" aria-label="Watch" onClick={() => dispatch(g => toggleWatch(g, rv.id))}>{g.watchlist.includes(rv.id) ? '★' : '☆'}</button>}
                  <div className="muted">{rv ? <>{RANKS[rv.rank].name} · {rv.rating} · {rv.career.wins}W/{rv.career.matches}</> : bk.kind === 'long_match' ? (i === 0 ? `Hand ${Math.ceil(40.5)} is dealt` : 'Champion before hand 41') : ''}</div>
                  {lib > 0 && rv && <div className="form-row">Form {rv.form.slice(-5).map((f, k) => <span key={k} className={`form f${f}`}>{f + 1}</span>)} · {rv.style}</div>}
                </div>
              </div>
              <div className="oc-price"><b>{m.status === 'settled' ? (((bk.kind === 'winner' ? m.result : bk.result) === i) ? '$1.00' : '0¢') : cents(p[i])}</b>{lib > 0 && <small title="Augur's Library model (public info only)">fair {pct(fair[i])}{lib >= 3 && m.status !== 'settled' ? ` ±${Math.round(100 * Math.sqrt(fair[i] * (1 - fair[i]) / Math.max(4, 8 + (rv?.career.matches ?? 0) / 4)))}` : ''}</small>}</div>
              {t && seat && bk.kind !== 'long_match' && <div className="oc-stack"><div className="stackbar"><div style={{ width: pct(totalChips ? (seat.stack + seat.totalIn) / totalChips : 0), background: colors[i] }} /></div><small>{seat.out ? 'eliminated' : `${seat.stack} chips`}</small></div>}
              <div className="oc-pos">{pos.shares[i] > 0 ? <>{pos.shares[i]} @ {cents(pos.cost[i] / pos.shares[i] / 100)}<small> value {money(pos.shares[i] * p[i] * 100)}</small></> : <span className="muted">no position</span>}</div>
              <div className="oc-trade">
                <button className="btn buy" disabled={!open || out} onClick={() => trade(i, qty)} title={`Cost ${money(qb.cents)} + fee ${money(qb.fee)} · avg ${cents(qb.avgPrice)} · price after ${cents(qb.newPrice)}`}>Buy {qty}<small>{money(qb.cents + qb.fee)} incl. fee</small></button>
                <button className="btn sell" disabled={!open || canSell <= 0} onClick={() => trade(i, -canSell)}>Sell {canSell || ''}<small>{qs ? money(-qs.cents - qs.fee) + ' net' : '—'}</small></button>
              </div>
            </div>
          );
        })}
      </div>

      {lib >= 3 && bk.kind === 'winner' && (
        <div className="research">
          <h4>📚 Library research — head-to-head (wins of row over column, all recorded matches)</h4>
          <table className="ladder h2h"><thead><tr><th></th>{m.names.map((n, i) => <th key={i}>{short(n).split(' ')[0]}</th>)}</tr></thead>
            <tbody>{m.names.map((n, i) => <tr key={i}><td>{short(n)}</td>{h2h[i].map((v, j) => <td key={j}>{v === null ? '—' : v}</td>)}</tr>)}</tbody></table>
          <p className="muted">Model confidence: the ± band shrinks with each rival's recorded career. Calibrated prior: {winProbabilities(rivals.filter(Boolean) as any).map(x => pct(x)).join(' / ')}.</p>
        </div>
      )}

      <div className="grid2">
        <div>
          <h4>Match feed</h4>
          <div className="hand-feed">
            {!m.match && <p className="muted">The match has not started. Research the competitors and take a position — prices move only when someone trades.</p>}
            {m.match && [...m.match.history].reverse().slice(0, 14).map(h => <div key={h.hand}><b>#{h.hand}</b> {h.text}</div>)}
          </div>
        </div>
        <div>
          <h4>Trade tape — {bookTitle(bk)}</h4>
          <div className="tape">
            {[...bk.trades].reverse().slice(0, 14).map(tr => (
              <div key={tr.t} className={tr.who === 'You' ? 'mine' : ''}>
                <span>{tr.who}</span><span style={{ color: colors[tr.outcome] }}>{tr.shares > 0 ? 'BUY' : 'SELL'} {Math.abs(tr.shares)} {short(bk.labels[tr.outcome]).split(' ')[0]}</span><span>{money(Math.abs(tr.cents))}</span>
                {lib >= 2 && <span className="muted">{m.bots.find(b => b.name === tr.who)?.strategy ?? ''}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {lib === 0 && <p className="muted hint">Tip: an Augur's Library (Empire) reveals the public fair-value model and form guides; level 3 adds head-to-head records, confidence bands and a portfolio risk summary.</p>}
    </Panel>
  );
}
export type { Book };
