import { useEffect, useState } from 'react';
import { exchangeTrade, GameState, marketFastForward, marketNextHand, startMarketMatch, ordinal } from '../core/game';
import { fairEstimate, marketPrices, mmLossBound, positionValue, quote, tradingOpen, unrealized, Market, FEE_RATE } from '../core/market';
import { RANKS } from '../core/ranks';
import { dispatch } from '../store';
import { sfx } from '../art/sound';
import { cents, money, Panel, pct, Portrait, RankBadge, SEAT_COLORS, Sparkline } from './common';

export function ExchangeTab({ g, toast }: { g: GameState; toast: (t: string, k?: string) => void }) {
  const [selId, setSelId] = useState(g.markets[0]?.id);
  const m = g.markets.find(x => x.id === selId) ?? g.markets[0];
  const [qty, setQty] = useState(10);
  const [auto, setAuto] = useState(false);
  const lib = g.empire.library ?? 0;

  useEffect(() => {
    if (!auto || !m || m.status === 'settled' || m.status === 'cancelled') { if (auto && m && m.status !== 'live' && m.status !== 'open') setAuto(false); return; }
    const id = setInterval(() => {
      const done = dispatch(g => marketNextHand(g, m.id));
      if (done) { setAuto(false); sfx.coin(); }
    }, g.settings.reducedMotion ? 300 : 650);
    return () => clearInterval(id);
  }, [auto, m?.id, m?.status]);

  const totalValue = g.markets.reduce((s, x) => s + (x.status === 'open' || x.status === 'live' ? positionValue(x) : 0), 0);
  const totalUnreal = g.markets.reduce((s, x) => s + (x.status === 'open' || x.status === 'live' ? unrealized(x) : 0), 0);
  const fees = g.ledgerTotals['sink:fees'] ?? 0;

  function trade(i: number, n: number) {
    const err = dispatch(g => exchangeTrade(g, m.id, i, n));
    if (err) { sfx.error(); toast(err, 'error'); } else { sfx.chip(); toast(`${n > 0 ? 'Bought' : 'Sold'} ${Math.abs(n)} × ${m.names[i]}`, 'trade'); }
  }

  return (
    <div className="tab exchange-tab">
      <Panel title="The Arena Exchange" right={<span className="muted">Fictional Dollars only · contracts pay $1 if the competitor wins</span>}>
        <div className="portfolio">
          <div><span>Open position value</span><b>{money(totalValue)}</b></div>
          <div><span>Unrealized P/L</span><b className={totalUnreal >= 0 ? 'pos' : 'neg'}>{money(totalUnreal)}</b></div>
          <div><span>Net cash from Exchange</span><b className={(g.ledgerTotals.exchange ?? 0) >= 0 ? 'pos' : 'neg'}>{money(g.ledgerTotals.exchange ?? 0)}</b></div>
          <div><span>Fees paid ({Math.round(FEE_RATE * 100)}%)</span><b>{money(fees)}</b></div>
          <div><span>Markets settled</span><b>{g.stats.marketsSettled}</b></div>
        </div>
      </Panel>
      <div className="market-list" role="tablist">
        {g.markets.map(x => {
          const p = marketPrices(x);
          return (
            <button key={x.id} role="tab" aria-selected={x.id === m?.id} className={`market-card${x.id === m?.id ? ' sel' : ''} st-${x.status}`} onClick={() => setSelId(x.id)}>
              <div className="mc-head"><b>{x.title}</b><span className={`status ${x.status}`}>{x.status.toUpperCase()}</span></div>
              <div className="mc-rows">{x.names.map((n, i) => <div key={i}><i style={{ background: SEAT_COLORS[i] }} />{short(n)}<span>{x.status === 'settled' ? (i === x.result ? 'WON' : '—') : cents(p[i])}</span></div>)}</div>
              {x.player.shares.some(s => s > 0) && <div className="mc-pos">Your position: {money(positionValue(x))}</div>}
            </button>
          );
        })}
      </div>
      {m && <MarketDetail g={g} m={m} qty={qty} setQty={setQty} trade={trade} auto={auto} setAuto={setAuto} lib={lib} toast={toast} />}
      {g.archive.length > 0 && (
        <Panel title="Settled Archive">
          <table className="ladder"><thead><tr><th>Market</th><th>Winner</th><th>Your P/L</th></tr></thead>
            <tbody>{[...g.archive].reverse().slice(0, 12).map(a => <tr key={a.id}><td>{a.title}</td><td>{a.status === 'cancelled' ? 'Cancelled' : a.names[a.result]}</td><td className={a.pnl >= 0 ? 'pos' : 'neg'}>{money(a.pnl)}</td></tr>)}</tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

const short = (n: string) => n.split(' ').slice(0, 2).join(' ');

function MarketDetail({ g, m, qty, setQty, trade, auto, setAuto, lib, toast }: {
  g: GameState; m: Market; qty: number; setQty: (n: number) => void; trade: (i: number, n: number) => void;
  auto: boolean; setAuto: (b: boolean) => void; lib: number; toast: (t: string, k?: string) => void;
}) {
  const p = marketPrices(m);
  const fair = fairEstimate(m);
  const open = tradingOpen(m);
  const rivals = m.rivalIds.map(id => g.rivals.find(r => r.id === id));
  const t = m.match?.table;
  const series = m.history.map(h => h.p);
  const handMarks = m.history.map((h, i) => (i > 0 && h.hand !== m.history[i - 1].hand ? i : -1)).filter(i => i >= 0 && m.history.length < 200);
  const totalChips = t ? t.seats.reduce((s, x) => s + x.stack + x.totalIn, 0) : 0;
  const pos = m.player;
  return (
    <Panel className="market-detail" title={<>{m.title} <RankBadge rank={m.rank} small /></>} right={<span className={`status ${m.status}`}>{m.status === 'live' ? `LIVE · hand ${t?.handNo ?? 0}` : m.status.toUpperCase()}</span>}>
      <div className="mk-controls">
        {m.status === 'open' && <button className="btn gold" onClick={() => { dispatch(g => startMarketMatch(g, m.id)); sfx.card(); }}>▶ Start match</button>}
        {(m.status === 'open' || m.status === 'live') && <>
          <button className="btn" onClick={() => dispatch(g => marketNextHand(g, m.id))}>Next hand</button>
          <button className={'btn' + (auto ? ' on' : '')} onClick={() => setAuto(!auto)}>{auto ? '❚❚ Pause' : '▶▶ Watch live'}</button>
          <button className="btn" onClick={() => { dispatch(g => marketFastForward(g, m.id)); sfx.coin(); }}>⏭ Fast-forward to result</button>
        </>}
        <span className="muted lock">{open ? '🔓 Trading open between hands' : m.status === 'live' ? '🔒 Locked during a hand' : m.status === 'settled' ? '🔒 Settled' : '🔒 Closed'}</span>
      </div>
      {m.status === 'settled' && (
        <div className="settled-banner">
          <b>{m.names[m.result]} wins!</b> Your P/L on this market: <b className={pos.realized >= 0 ? 'pos' : 'neg'}>{money(pos.realized)}</b> (fees {money(pos.fees)})
          <div className="placings-inline">{m.placements.map((pl, i) => ({ pl, i })).sort((a, b) => a.pl - b.pl).map(({ pl, i }) => <span key={i}>{ordinal(pl + 1)} {short(m.names[i])}</span>)}</div>
        </div>
      )}
      {m.status === 'cancelled' && <div className="settled-banner">Cancelled: {m.cancelReason}. Refunded {money(m.refunded ?? 0)} at cost.</div>}

      <div className="chart-wrap">
        <Sparkline series={series} colors={SEAT_COLORS} markers={handMarks} />
        <div className="chart-legend">{m.names.map((n, i) => <span key={i}><i style={{ background: SEAT_COLORS[i] }} />{short(n)} {cents(p[i])}</span>)}</div>
        <small className="muted">Every point is an executed trade on the LMSR market maker (b = {m.b}). Max market-maker loss bound: ${mmLossBound(m).toFixed(0)}.</small>
      </div>

      <div className="qty-row">
        <span>Contracts per order:</span>
        {[1, 5, 10, 25, 50, 100].map(n => <button key={n} className={qty === n ? 'on' : ''} onClick={() => setQty(n)}>{n}</button>)}
        <input type="number" min={1} max={1000} value={qty} onChange={e => setQty(Math.max(1, Math.min(1000, Math.floor(+e.target.value || 1))))} aria-label="Quantity" />
      </div>

      <div className="outcomes">
        {m.names.map((n, i) => {
          const rv = rivals[i];
          const qb = quote(m, i, qty);
          const canSell = Math.min(qty, pos.shares[i]);
          const qs = canSell > 0 ? quote(m, i, -canSell) : null;
          const seat = t?.seats[i];
          const out = seat?.out;
          return (
            <div key={i} className={`outcome${out ? ' out' : ''}${m.result === i ? ' won' : ''}`}>
              <div className="oc-who">
                <i className="swatch" style={{ background: SEAT_COLORS[i] }} />
                {rv && <Portrait seed={rv.portraitSeed} rank={rv.rank} style={rv.style} size={40} />}
                <div>
                  <b>{n}</b>
                  <div className="muted">{rv ? <>{RANKS[rv.rank].name} · {rv.rating} · {rv.career.wins}W/{rv.career.matches}</> : ''}</div>
                  {lib > 0 && rv && <div className="form-row">Form {rv.form.slice(-5).map((f, k) => <span key={k} className={`form f${f}`}>{f + 1}</span>)} · {rv.style}</div>}
                </div>
              </div>
              <div className="oc-price"><b>{m.status === 'settled' ? (m.result === i ? '$1.00' : '0¢') : cents(p[i])}</b>{lib > 0 && <small title="Augur's Library fair-value model (public info)">fair {pct(fair[i])}</small>}</div>
              {t && <div className="oc-stack"><div className="stackbar"><div style={{ width: pct(totalChips ? (seat!.stack + seat!.totalIn) / totalChips : 0), background: SEAT_COLORS[i] }} /></div><small>{out ? 'eliminated' : `${seat!.stack} chips`}</small></div>}
              <div className="oc-pos">{pos.shares[i] > 0 ? <>{pos.shares[i]} @ {cents(pos.cost[i] / pos.shares[i] / 100)}<small> value {money(pos.shares[i] * p[i] * 100)}</small></> : <span className="muted">no position</span>}</div>
              <div className="oc-trade">
                <button className="btn buy" disabled={!open || out} onClick={() => trade(i, qty)} title={`Cost ${money(qb.cents)} + fee ${money(qb.fee)} · avg ${cents(qb.avgPrice)} · price after ${cents(qb.newPrice)}`}>Buy {qty}<small>{money(qb.cents + qb.fee)}</small></button>
                <button className="btn sell" disabled={!open || canSell <= 0} onClick={() => trade(i, -canSell)}>Sell {canSell || ''}<small>{qs ? money(-qs.cents - qs.fee) : '—'}</small></button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid2">
        <div>
          <h4>Match feed</h4>
          <div className="hand-feed">
            {!m.match && <p className="muted">The match has not started. Research the competitors and take a position — prices move only when someone trades.</p>}
            {m.match && [...m.match.history].reverse().slice(0, 14).map(h => <div key={h.hand}><b>#{h.hand}</b> {h.text}</div>)}
            {m.match?.done && <div className="gold-text">Champion: {m.names[m.rivalIds.indexOf(m.match.placementIds[0])]}</div>}
          </div>
        </div>
        <div>
          <h4>Trade tape</h4>
          <div className="tape">
            {[...m.trades].reverse().slice(0, 14).map(tr => (
              <div key={tr.t} className={tr.who === 'You' ? 'mine' : ''}>
                <span>{tr.who}</span><span style={{ color: SEAT_COLORS[tr.outcome] }}>{tr.shares > 0 ? 'BUY' : 'SELL'} {Math.abs(tr.shares)} {short(m.names[tr.outcome]).split(' ')[0]}</span><span>{money(Math.abs(tr.cents))}</span>
                {lib >= 2 && <span className="muted">{m.bots.find(b => b.name === tr.who)?.strategy ?? ''}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {lib === 0 && <p className="muted hint">Tip: an Augur's Library (Empire) reveals a public-information fair-value model and rival form guides.</p>}
    </Panel>
  );
}
