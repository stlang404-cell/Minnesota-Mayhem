import { useState } from 'react';
import { CircuitEvent, enterEvent, eventTrade, eventTradingOpen, playEvent, PLAYOFF_SIZE, poolOf, SPLIT, sponsor, sponsorOffer, topSeasonIds } from '../core/circuit';
import { GameState, netWorth, ordinal } from '../core/game';
import { marketPrices, quote } from '../core/market';
import { RANKS } from '../core/ranks';
import { SEASON_LENGTH, nameOf } from '../core/world';
import { dispatch } from '../store';
import { sfx } from '../art/sound';
import { fanfare } from '../art/music';
import { cents, Modal, money, Panel, pct, Portrait, RankBadge, SEAT_COLORS } from './common';

const TIER: Record<string, string> = { local: 'Local', regional: 'Regional', invitational: 'Invitational', highroller: 'High Roller', revenge: 'Rival Night', qualifier: 'Qualifier', grand: 'GRAND CHAMPIONSHIP' };

export function CircuitPanel({ g, toast }: { g: GameState; toast: (t: string, k?: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const upcoming = g.circuit.events.filter(e => e.status !== 'done').sort((a, b) => a.day - b.day).slice(0, 8);
  const done = [...g.circuit.events.filter(e => e.status === 'done')].reverse().slice(0, 6);
  const qualified = topSeasonIds(g, PLAYOFF_SIZE);
  const myPlace = Object.entries(g.season.points).sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === 'player');
  const ev = open ? g.circuit.events.find(e => e.id === open) : null;
  const run = (f: (g: GameState) => string | null, ok?: string) => { const e = dispatch(f); if (e) { sfx.error(); toast(e, 'error'); } else if (ok) { sfx.coin(); toast(ok); } };
  return (
    <Panel title="The Imperial Circuit" right={<span className="muted">Season {g.season.n} · day {g.day - g.season.start + 1}/{SEASON_LENGTH}</span>}>
      <div className="season-bar">
        <div><span>Your standing</span><b>{myPlace >= 0 ? ordinal(myPlace + 1) : '—'}</b></div>
        <div><span>Playoff line</span><b>Top {PLAYOFF_SIZE}{qualified.includes('player') ? ' ✓ qualifying' : ''}</b></div>
        <div><span>Wildcard</span><b>{g.circuit.wildcard ? nameOf(g, g.circuit.wildcard) : 'Last Chance Qualifier'}</b></div>
        <div><span>Titles</span><b>{g.trophies.length}</b></div>
      </div>
      <table className="ladder circuit">
        <thead><tr><th>Day</th><th>Event</th><th>Pool</th><th>Entry</th><th></th></tr></thead>
        <tbody>
          {upcoming.map(e => {
            const canReg = e.status === 'scheduled' && e.playerEligible && !e.playerEntered && g.day >= e.day - 2;
            const canPlay = e.playerEntered && g.day >= e.day && e.heats.length === 0 && !g.active;
            return (
              <tr key={e.id} className={`tier-${e.tier}`}>
                <td>{e.day === g.day ? 'TODAY' : e.day}</td>
                <td><b>{e.name}</b> <span className={`tier-tag ${e.tier}`}>{TIER[e.tier]}</span><br /><small className="muted">{e.eligibility}</small></td>
                <td>{money(poolOf(e))}</td>
                <td>{e.entry ? money(e.entry) : 'Free'}</td>
                <td>
                  {canPlay && <button className="btn small gold" onClick={() => { run(g => playEvent(g, e.id)); fanfare(); }}>Take your seat</button>}
                  {canReg && <button className="btn small" onClick={() => run(g => enterEvent(g, e.id), `Registered for ${e.name}`)}>Register</button>}
                  {e.playerEntered && !canPlay && <span className="tag armed">Registered</span>}
                  {!e.playerEligible && <span className="muted small">Not eligible</span>}
                  <button className="btn small" onClick={() => setOpen(e.id)}>Field</button>
                </td>
              </tr>
            );
          })}
          {upcoming.length === 0 && <tr><td colSpan={5} className="muted">The heralds are preparing the next events…</td></tr>}
        </tbody>
      </table>
      {done.length > 0 && <>
        <h4>Recent results</h4>
        <ul className="news">{done.map(e => <li key={e.id}><span>Day {e.day}</span><button className="linkish" onClick={() => setOpen(e.id)}>{e.name}</button> — 🏆 {nameOf(g, e.final!.order[0])}{e.payouts.player ? ` · you won ${money(e.payouts.player)}` : ''}</li>)}</ul>
      </>}
      {ev && <BracketModal g={g} ev={ev} onClose={() => setOpen(null)} />}
    </Panel>
  );
}

export function BracketModal({ g, ev, onClose }: { g: GameState; ev: CircuitEvent; onClose: () => void }) {
  const [replay, setReplay] = useState<{ t: number; i: number } | null>(null);
  const tables = ev.status === 'done' ? [...ev.heats, ev.final!] : [];
  const rec = replay ? tables[replay.t] : null;
  const rv = (id: string) => g.rivals.find(r => r.id === id);
  return (
    <Modal onClose={onClose} wide>
      <h2 className="title-gold">{ev.name}</h2>
      <p className="muted">{ev.eligibility} · Day {ev.day} · Pool {money(poolOf(ev))} (champion {Math.round(SPLIT.champion * 100)}%, runner-up {Math.round(SPLIT.runnerUp * 100)}%, 3rd {Math.round(SPLIT.third * 100)}%, 4th {Math.round(SPLIT.fourth * 100)}%, heat 2nd/3rd {Math.round(SPLIT.heat2 * 100)}%/{Math.round(SPLIT.heat3 * 100)}%)</p>
      {ev.status !== 'done' ? (
        <div className="field-grid">{ev.roster.map(id => { const r = rv(id); return <div key={id} className={id === 'player' ? 'me' : ''}>{r && <Portrait seed={r.portraitSeed} rank={r.rank} style={r.style} size={28} />}<span>{nameOf(g, id)}</span>{r && <RankBadge rank={r.rank} small />}</div>; })}</div>
      ) : (
        <div className="bracket">
          {ev.heats.map((h, i) => (
            <div key={i} className="heat">
              <b>Heat {i + 1}</b>
              <ol>{h.order.map(id => <li key={id} className={id === 'player' ? 'me' : ''}>{nameOf(g, id)}</li>)}</ol>
              <button className="btn small" onClick={() => setReplay({ t: i, i: 0 })}>Replay ({h.hands} hands)</button>
            </div>
          ))}
          <div className="heat final">
            <b>FINAL TABLE</b>
            <ol>{ev.final!.order.map(id => <li key={id} className={id === 'player' ? 'me' : ''}>{nameOf(g, id)}{ev.payouts[id] ? ` — ${money(ev.payouts[id])}` : ''}</li>)}</ol>
            <button className="btn small gold" onClick={() => setReplay({ t: 4, i: 0 })}>Watch the final ({ev.final!.hands} hands)</button>
          </div>
        </div>
      )}
      {rec && replay && (
        <div className="replay-box">
          <div className="row"><b>{replay.t === 4 ? 'Final' : `Heat ${replay.t + 1}`} — after hand {replay.i + 1}/{rec.stacks.length}</b>
            <button className="btn small" disabled={replay.i <= 0} onClick={() => setReplay({ ...replay, i: replay.i - 1 })}>◀</button>
            <button className="btn small" disabled={replay.i >= rec.stacks.length - 1} onClick={() => setReplay({ ...replay, i: replay.i + 1 })}>▶</button>
            <button className="btn small" onClick={() => setReplay({ ...replay, i: rec.stacks.length - 1 })}>⏭</button></div>
          {rec.table.map((id, k) => { const st = rec.stacks[replay.i]?.[k] ?? 0; const tot = rec.stacks[replay.i]?.reduce((a, b) => a + b, 0) || 1; return <div key={id} className="stackrow"><span>{nameOf(g, id)}</span><div className="stackbar"><div style={{ width: pct(st / tot), background: SEAT_COLORS[k] }} /></div><small>{st}</small></div>; })}
          <ul className="highlights">{rec.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </div>
      )}
      {ev.market && ev.status === 'done' && ev.market.result >= 0 && <p className="gold-text">Champion market settled: {ev.market.labels[ev.market.result]} (pre-event price {cents(ev.market.prior[ev.market.result])}).</p>}
    </Modal>
  );
}

export function EventMarkets({ g, toast }: { g: GameState; toast: (t: string, k?: string) => void }) {
  const evs = g.circuit.events.filter(e => e.market && e.status === 'scheduled').sort((a, b) => a.day - b.day);
  const [sel, setSel] = useState(evs[0]?.id);
  const [qty, setQty] = useState(10);
  const ev = evs.find(e => e.id === sel) ?? evs[0];
  if (!ev) return <Panel title="Tournament Champion Markets"><p className="muted">No circuit event is open for trading right now. Markets open when events are announced (up to 6 days ahead) and close when play starts.</p></Panel>;
  const bk = ev.market!;
  const p = marketPrices(bk);
  const lock = eventTradingOpen(g, ev);
  const trade = (i: number, n: number) => { const e = dispatch(g => eventTrade(g, ev.id, i, n)); if (e) { sfx.error(); toast(e, 'error'); } else sfx.chip(); };
  const rows = bk.labels.map((l, i) => ({ l, i, p: p[i] })).sort((a, b) => b.p - a.p);
  return (
    <Panel title="Tournament Champion Markets" right={<div className="seg">{evs.map(e => <button key={e.id} className={e.id === ev.id ? 'on' : ''} onClick={() => setSel(e.id)}>D{e.day} {e.name.slice(0, 18)}</button>)}</div>}>
      <p className="rule">📜 <b>Rule:</b> {bk.rule} 16 outcomes, LMSR b = {bk.b}. Trading closes when the event starts. {lock && <b className="warn"> {lock}</b>}</p>
      <div className="qty-row"><span>Contracts:</span>{[1, 5, 10, 25].map(n => <button key={n} className={qty === n ? 'on' : ''} onClick={() => setQty(n)}>{n}</button>)}</div>
      <table className="ladder champ">
        <thead><tr><th>Competitor</th><th>Price</th><th>Prior</th><th>Held</th><th></th></tr></thead>
        <tbody>{rows.map(({ l, i }) => {
          const q = quote(bk, i, qty);
          return <tr key={i}><td>{l}</td><td className="gold-text">{cents(p[i])}</td><td className="muted">{cents(bk.prior[i])}</td><td>{bk.player.shares[i] || ''}</td>
            <td><button className="btn small buy" disabled={!!lock} onClick={() => trade(i, qty)}>Buy {money(q.cents + q.fee)}</button>
              <button className="btn small sell" disabled={!!lock || bk.player.shares[i] <= 0} onClick={() => trade(i, -Math.min(qty, bk.player.shares[i]))}>Sell</button></td></tr>;
        })}</tbody>
      </table>
    </Panel>
  );
}

export function DynastyPanel({ g, toast }: { g: GameState; toast: (t: string, k?: string) => void }) {
  const lv = g.empire.sponsor ?? 0;
  const active = g.sponsorships.filter(s => s.end >= g.day);
  const offers = [...g.rivals].filter(r => Math.abs(r.rank - g.player.rank) <= 1 && !active.some(s => s.rivalId === r.id)).sort((a, b) => b.rating - a.rating).slice(0, 6);
  return (
    <Panel title="Dynasty: Sponsorships & Venue" right={<span className="muted">Sponsored rivals play independently — you cannot control them, and you may not trade markets involving them.</span>}>
      {!lv ? <p className="muted">Acquire a Sponsorship Office to sign contracts with rivals: pay upfront, receive 25% of their prize money for 10 days.</p> : (
        <>
          <h4>Active contracts ({active.length}/{lv + 1})</h4>
          {active.length === 0 && <p className="muted">None.</p>}
          {active.map(s => <div key={s.rivalId} className="contract">{nameOf(g, s.rivalId)} · days {s.start}–{s.end} · paid {money(s.upfront)} · earned {money(s.earned)} ({s.earned >= s.upfront ? 'in profit' : `${pct(s.earned / s.upfront)} recouped`})</div>)}
          <h4>Offers</h4>
          {offers.map(r => { const o = sponsorOffer(g, r); return <div key={r.id} className="contract"><Portrait seed={r.portraitSeed} rank={r.rank} style={r.style} size={24} /> {r.name} <RankBadge rank={r.rank} small /> form {r.form.slice(-5).map(f => f + 1).join('')} · {money(o.upfront)} for {o.days} days, {o.sharePct}% of prizes <button className="btn small gold" onClick={() => { const e = dispatch(g => sponsor(g, r.id)); if (e) toast(e, 'error'); else { sfx.coin(); toast(`Sponsoring ${r.name}`); } }}>Sign</button></div>; })}
        </>
      )}
      {(g.empire.venue ?? 0) > 0 && (
        <div className="row wrap"><b>Championship Venue focus:</b>
          {(['profit', 'prestige'] as const).map(f => <button key={f} className={'btn small' + ((g.businessFocus.venue ?? 'profit') === f ? ' on' : '')} onClick={() => dispatch(g => { g.businessFocus.venue = f; })}>{f === 'profit' ? 'Profit (+1% fee)' : 'Prestige (+150 Glory/event)'}</button>)}
          <span className="muted">Hosting fees so far: {money(g.ledger.filter(l => l.reason.startsWith('Hosting fee')).reduce((s, l) => s + l.amount, 0))} (recent ledger)</span>
        </div>
      )}
    </Panel>
  );
}

export function LegacyPanel({ g }: { g: GameState }) {
  const L = g.legacy, p = g.player;
  const fav = Object.entries(L.buildUses).sort((a, b) => b[1] - a[1])[0];
  const rivals = [...g.rivals].filter(r => r.vsPlayer.wins + r.vsPlayer.losses > 0).sort((a, b) => b.vsPlayer.wins + b.vsPlayer.losses - (a.vsPlayer.wins + a.vsPlayer.losses)).slice(0, 5);
  return (
    <Panel title="Legacy: Career, Trophies & Timeline">
      <div className="stat-grid">
        <div><span>Career winnings</span><b>{money(L.careerWinnings)}</b></div><div><span>Net worth</span><b>{money(netWorth(g))}</b></div>
        <div><span>Highest rank</span><b>{RANKS[Math.max(L.highestRank, p.rank)].name}</b></div><div><span>Win rate</span><b>{p.matches ? pct(p.wins / p.matches) : '—'}</b></div>
        <div><span>Largest bluff</span><b>{L.largestBluff ? `${L.largestBluff} chips` : '—'}</b></div><div><span>Biggest comeback</span><b>{L.biggestComeback ? `${L.biggestComeback}%` : '—'}</b></div>
        <div><span>Favourite build</span><b>{fav ? fav[0] : '—'}</b></div><div><span>Exchange net</span><b className={(g.ledgerTotals.exchange ?? 0) >= 0 ? 'pos' : 'neg'}>{money(g.ledgerTotals.exchange ?? 0)}</b></div>
        <div><span>Properties</span><b>{Object.values(g.empire).filter(v => v > 0).length}</b></div><div><span>Ascensions</span><b>{p.prestige}</b></div>
      </div>
      <h4>🏆 Trophy room ({g.trophies.length})</h4>
      <div className="trophies">{g.trophies.length ? g.trophies.map(t => <div key={t.id} className={`trophy t-${t.tier}`}><span>{t.tier === 'grand' ? '👑' : '🏆'}</span><b>{t.name}</b><small>Season {t.season} · day {t.day}</small></div>) : <p className="muted">Win an Imperial Circuit event to place your first trophy here.</p>}</div>
      {rivals.length > 0 && <><h4>Rivalry records</h4><ul className="news">{rivals.map(r => <li key={r.id}>{r.name}: {r.vsPlayer.losses}–{r.vsPlayer.wins} (you–them){(p.rivalWins[r.id] ?? 0) ? ` · ${p.rivalWins[r.id]} Rival Challenge win(s)` : ''}</li>)}</ul></>}
      <h4>Timeline</h4>
      <ul className="news timeline">{[...g.timeline].reverse().slice(0, 15).map((t, i) => <li key={i}><span>Day {t.day}</span>{t.icon} {t.text}</li>)}{g.timeline.length === 0 && <li className="muted">Your story begins with your first match.</li>}</ul>
    </Panel>
  );
}
