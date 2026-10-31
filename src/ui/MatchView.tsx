import { useEffect, useMemo, useRef, useState } from 'react';
import { ABILITY_MAP, resolveAbility } from '../core/abilities';
import { describe, evaluate } from '../core/handEval';
import { abilitiesOf, armable, MAX_RESOLVE, MatchState, step, runUntilBlocked } from '../core/match';
import { legalActions, potTotal, levelFor } from '../core/poker';
import { GameState, finishActiveMatch, forfeit, playerAct, playerActivate, playerSeat, MatchReport, ordinal } from '../core/game';
import { hashString } from '../core/rng';
import { RANKS } from '../core/ranks';
import { dispatch, touch } from '../store';
import { sfx } from '../art/sound';
import { AbilityIcon, AbilityTooltip, Modal, money, pct, PlayingCard, Portrait, RankBadge } from './common';

const delayFor = (speed: number) => [0, 650, 330, 120, 0][speed] ?? 650;

export function MatchView({ g, onReport }: { g: GameState; onReport: (r: MatchReport) => void }) {
  const a = g.active!;
  const m = a.match;
  const t = m.table;
  const hs = playerSeat(m);
  const [speed, setSpeed] = useState(g.settings.reducedMotion ? 2 : 1);
  const [raiseTo, setRaiseTo] = useState(0);
  const [tip, setTip] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; kind: string } | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const lastEvent = useRef(m.eventCounter);
  const lastLog = useRef(t.log[t.log.length - 1]);
  const human = m.players[hs];
  const myTurn = t.handActive && t.toAct === hs && !m.done;
  const L = legalActions(t, hs);
  const back = g.player.equipped.cardback;

  // seats in visual order: human at bottom, then clockwise
  const order = useMemo(() => [0, 1, 2, 3].map(k => (hs + k) % 4), [hs]);

  // feedback from new events
  useEffect(() => {
    const fresh = m.events.filter(e => e.n > lastEvent.current);
    lastEvent.current = m.eventCounter;
    for (const e of fresh) {
      if (e.kind === 'ability' && (e.seat === hs || e.text.includes('→ ' + human.name) || e.text.includes(human.name + ' →'))) { sfx.ability(); setFlash({ text: e.text, kind: 'ability' }); }
      else if (e.kind === 'bluff' && e.seat === hs) setFlash({ text: e.text.includes('caught') ? 'You were caught bluffing!' : 'Successful bluff! They folded.', kind: 'bluff' });
      else if (e.kind === 'elim') { sfx.elim(); setFlash({ text: e.text, kind: 'elim' }); }
      else if (e.kind === 'champion') { if (e.seat === hs) sfx.win(); setFlash({ text: e.text, kind: 'champion' }); }
      else if (e.kind === 'win' && e.seat === hs) sfx.win();
    }
    const idx = lastLog.current ? t.log.indexOf(lastLog.current) : -1;
    const logs = t.log.slice(idx + 1);
    lastLog.current = t.log[t.log.length - 1];
    if (logs.some(l => l.kind === 'raise' || l.kind === 'bet' || l.kind === 'call')) sfx.chip();
    else if (logs.some(l => l.kind === 'fold')) sfx.fold();
    if (logs.some(l => l.kind === 'hand' || l.kind === 'street')) sfx.card();
  });
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), 2200); return () => clearTimeout(id); }, [flash]);

  // default raise size
  useEffect(() => { if (myTurn) setRaiseTo(L.minRaiseTo); }, [myTurn, t.handNo, t.street, L.minRaiseTo]);

  // game loop: drive AI decisions with readable pacing
  useEffect(() => {
    if (m.done) return;
    if (t.seats[hs].out) {
      // eliminated: simulate the rest instantly
      const id = setTimeout(() => { runUntilBlocked(m); touch(); }, 900);
      return () => clearTimeout(id);
    }
    if (myTurn) return;
    let wait = delayFor(speed);
    if (!t.handActive && t.lastResult) wait = speed >= 3 ? 250 : t.lastResult.showdown ? 2300 / speed : 1100 / speed;
    if (!t.handActive && !t.lastResult) wait = 200;
    const id = setTimeout(() => {
      if (speed === 4) {
        // skip to next decision of the human (or end of hand)
        const h = t.handNo;
        let guard = 0;
        while (!m.done && guard++ < 500) { if (!step(m)) break; if (m.table.handNo !== h && !m.table.handActive) break; if (m.table.toAct === hs && m.table.handActive) break; }
        setSpeed(1);
      } else step(m);
      touch();
    }, wait);
    return () => clearTimeout(id);
  });

  // keyboard shortcuts
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!myTurn || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'f') doAct('fold');
      else if (e.key === 'c') doAct(L.canCheck ? 'check' : 'call');
      else if (e.key === 'r' && L.canRaise) doAct('raise');
      else if (e.key === 'a' && L.canRaise) doAct('allin');
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  function doAct(type: 'fold' | 'check' | 'call' | 'raise' | 'allin') {
    const err = dispatch(g => playerAct(g, type === 'raise' ? { type, amount: raiseTo } : { type }));
    if (err) { sfx.error(); setFlash({ text: err, kind: 'error' }); }
  }
  function arm(id: string) {
    const ok = dispatch(g => playerActivate(g, id));
    if (ok) { sfx.ability(); setFlash({ text: `${ABILITY_MAP[id].name} armed!`, kind: 'ability' }); }
  }
  function collect() {
    const r = dispatch(g => finishActiveMatch(g));
    if (r) { if (r.trial === 'passed') sfx.promote(); else if (r.prize > 0) sfx.coin(); onReport(r); }
  }

  const pot = potTotal(t) + (t.handActive ? 0 : 0);
  const res = t.lastResult;
  const showdownSeats = !t.handActive && res?.showdown ? Object.keys(res.scores).map(Number) : [];
  const winners = !t.handActive && res ? new Set(res.pots.flatMap(p => p.winners)) : new Set<number>();
  const me = t.seats[hs];
  const myHand = me.hole.length === 2 && t.board.length >= 3 ? describe(evaluate([...me.hole, ...t.board])) : '';
  const nextLevelIn = t.config.handsPerLevel - ((Math.max(1, t.handNo) - 1) % t.config.handsPerLevel);
  const nextLv = levelFor(t.config, t.handNo + nextLevelIn).level;
  const ins = m.arsenal[hs].insight?.hand === t.handNo ? m.arsenal[hs].insight : null;
  const myAbs = abilitiesOf(m, hs);
  const arm8 = armable(m, hs);
  const hasSpy = myAbs.some(x => x.def.id === 'spy_network' || x.def.id === 'scroll_of_records');
  const rival = (id: string) => g.rivals.find(r => r.id === id);
  const lastAction = (seat: number) => {
    for (let i = t.log.length - 1; i >= 0; i--) {
      const l = t.log[i];
      if (l.hand !== t.handNo) break;
      if (l.seat === seat && ['fold', 'check', 'call', 'bet', 'raise', 'blind'].includes(l.kind)) return l.text.replace(t.seats[seat].name + ' ', '');
    }
    return '';
  };
  const stepPot = (f: number) => Math.min(L.maxRaiseTo, Math.max(L.minRaiseTo, Math.round(t.currentBet + (pot + L.toCall) * f)));

  return (
    <div className={`match felt-${g.player.equipped.felt}`}>
      <div className="match-top">
        <div className="match-info">
          <b>{a.kind === 'trial' ? `PROMOTION TRIAL → ${RANKS[a.rankAtStart + 1]?.name}` : a.kind === 'recovery' ? 'BREAD & CIRCUSES' : RANKS[a.rankAtStart].arena}</b>
          <span>Hand {t.handNo} · Blinds {t.level.sb}/{t.level.bb}{t.level.ante ? ` · ante ${t.level.ante}` : ''} · next {nextLv.sb}/{nextLv.bb} in {nextLevelIn}</span>
        </div>
        <div className="speed" role="group" aria-label="Speed">
          {[1, 2, 3].map(s => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{['', '1×', '2×', '4×'][s]}</button>)}
          <button onClick={() => setSpeed(4)} title="Skip to your next decision">⏭</button>
          <button className="danger" onClick={() => setConfirmQuit(true)} title="Concede">⚑</button>
        </div>
      </div>

      <div className="table-area">
        <div className="table-oval">
          <div className="board">
            {[0, 1, 2, 3, 4].map(i => t.board[i] !== undefined ? <PlayingCard key={i + '-' + t.board[i]} card={t.board[i]} delay={i < 3 ? i * 90 : 0} /> : <div key={i} className="pcard slot" />)}
          </div>
          <div className="pot">POT <b>{pot || (res && !t.handActive ? res.pots.reduce((s, p) => s + p.amount, 0) : 0)}</b></div>
          {!t.handActive && res && <div className="hand-result">{t.log.filter(l => l.hand === res.hand && l.kind === 'win').slice(-2).map((l, i) => <div key={i}>{l.text}</div>)}</div>}
        </div>
        {order.map((si, k) => {
          const s = t.seats[si];
          const p = m.players[si];
          const rv = rival(p.id);
          const isHuman = si === hs;
          const reveal = isHuman || showdownSeats.includes(si);
          const st = m.stats[si];
          const ar = m.arsenal[si];
          return (
            <div key={si} className={`seat pos${k}${t.toAct === si && t.handActive ? ' acting' : ''}${s.folded && !s.out ? ' folded' : ''}${s.out ? ' out' : ''}${winners.has(si) ? ' winner' : ''}`}>
              <div className="seat-head">
                <Portrait seed={rv?.portraitSeed ?? hashString(p.name)} rank={rv?.rank ?? g.player.rank} style={rv?.style ?? 'player'} size={k === 0 ? 44 : 40} />
                <div className="seat-id">
                  <div className="seat-name">{p.name}{t.dealer === si && <span className="dbtn">D</span>}</div>
                  <div className="seat-stack">{s.out ? 'ELIMINATED' : s.stack.toLocaleString()}</div>
                  <div className="resolve-pips" title={`Resolve ${ar.resolve}/${MAX_RESOLVE}`}>{Array.from({ length: MAX_RESOLVE }, (_, i) => <i key={i} className={i < ar.resolve ? 'on' : ''} />)}</div>
                </div>
              </div>
              {!s.out && (
                <div className="seat-cards">
                  {s.hole.map((c, i) => <PlayingCard key={i + '-' + t.handNo} card={reveal ? c : undefined} hidden={!reveal} back={back} small={!isHuman} glow={winners.has(si) && reveal} delay={i * 80} />)}
                </div>
              )}
              <div className="seat-status">
                {s.committed > 0 && <span className="chips">● {s.committed}</span>}
                {s.allIn && !s.out && <span className="tag allin">ALL-IN</span>}
                {!s.out && <span className="act">{lastAction(si)}</span>}
                {showdownSeats.includes(si) && res?.scores[si] && <span className="tag hand">{res.scores[si].name}</span>}
                {ar.armed.map(id => <span key={id} className="tag armed" title={ABILITY_MAP[id]?.name}>⚡{ABILITY_MAP[id]?.name}</span>)}
              </div>
              {hasSpy && !isHuman && st.hands >= 3 && (
                <div className="spy" title="Public statistics (Spy Network / Scroll of Records)">
                  VPIP {pct(st.vpip / st.hands)} · PFR {pct(st.pfr / st.hands)} · F2R {st.foldToRaiseOpp ? pct(st.foldToRaise / st.foldToRaiseOpp) : '–'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hero-panel">
        <div className="arsenal-bar" role="toolbar" aria-label="Arsenal">
          {myAbs.map(ab => {
            const o = arm8.find(x => x.ab.def.id === ab.def.id);
            const armed = m.arsenal[hs].armed.includes(ab.def.id);
            const used = m.arsenal[hs].used[ab.def.id] ?? 0;
            const usable = !!o?.ok && myTurn;
            return (
              <button key={ab.def.id} className={`ab-slot ${ab.def.kind}${armed ? ' armed' : ''}${usable ? ' ready' : ''}`}
                onClick={() => (usable ? arm(ab.def.id) : setTip(tip === ab.def.id ? null : ab.def.id))}
                onMouseEnter={() => setTip(ab.def.id)} onMouseLeave={() => setTip(null)}
                aria-label={`${ab.def.name}${o ? `, costs ${o.cost} Resolve` : ''}`}>
                <AbilityIcon defId={ab.def.id} size={30} />
                <span className="ab-cost">{ab.def.kind === 'active' ? `${o?.cost ?? ab.cost}◆` : ab.uses ? `${Math.max(0, ab.uses - used)}` : '∞'}</span>
                {tip === ab.def.id && <div className="ab-pop"><AbilityTooltip inst={{ defId: ab.def.id, level: ab.level, sigil: ab.sigil }} />{o && !o.ok && <p className="why">{o.reason}</p>}{usable && <p className="why ok">Tap to arm</p>}</div>}
              </button>
            );
          })}
          <div className="resolve-meter" title="Resolve: per-match tactical resource">◆ {m.arsenal[hs].resolve}/{MAX_RESOLVE}</div>
        </div>
        {ins && (
          <div className="insight">
            <span>Equity vs random: <b>{pct(ins.equity ?? 0)}</b></span>
            {ins.potOdds ? <span>Pot odds: <b>{pct(ins.potOdds)}</b></span> : null}
            {ins.oracle?.map(o => <span key={o.seat}>vs {t.seats[o.seat].name.split(' ')[0]}: <b>{pct(o.equity)}</b></span>)}
          </div>
        )}
        <div className="hero-row">
          <div className="hero-hand">{myHand && <span className="made">{myHand}</span>}</div>
          {myTurn ? (
            <div className="actions">
              {L.canFold && <button className="btn fold" onClick={() => doAct('fold')}>Fold <kbd>F</kbd></button>}
              {L.canCheck ? <button className="btn check" onClick={() => doAct('check')}>Check <kbd>C</kbd></button>
                : <button className="btn call" onClick={() => doAct('call')}>Call {L.callAmount} <kbd>C</kbd></button>}
              {L.canRaise && (
                <div className="raise-box">
                  <div className="quick">
                    <button onClick={() => setRaiseTo(stepPot(0.5))}>½</button>
                    <button onClick={() => setRaiseTo(stepPot(0.75))}>¾</button>
                    <button onClick={() => setRaiseTo(stepPot(1))}>Pot</button>
                    <button onClick={() => setRaiseTo(L.maxRaiseTo)}>Max</button>
                  </div>
                  <input type="range" min={L.minRaiseTo} max={L.maxRaiseTo} step={Math.max(1, Math.round(t.level.bb / 4))} value={Math.min(Math.max(raiseTo, L.minRaiseTo), L.maxRaiseTo)} onChange={e => setRaiseTo(+e.target.value)} aria-label="Raise amount" />
                  <button className="btn raise" onClick={() => doAct(raiseTo >= L.maxRaiseTo ? 'allin' : 'raise')}>{raiseTo >= L.maxRaiseTo ? 'ALL-IN' : t.currentBet ? 'Raise to' : 'Bet'} {raiseTo >= L.maxRaiseTo ? L.maxRaiseTo : raiseTo} <kbd>R</kbd></button>
                </div>
              )}
            </div>
          ) : (
            <div className="waiting">{m.done ? '' : me.out ? 'You are out — the match is being resolved…' : t.handActive ? `${t.seats[t.toAct]?.name ?? ''} is thinking…` : 'Dealing…'}</div>
          )}
        </div>
        <div className="feed" aria-live="polite">
          {m.events.slice(-4).reverse().map(e => <div key={e.n} className={`ev ${e.kind}`}>{e.text}</div>)}
        </div>
      </div>

      {flash && <div className={`flash ${flash.kind}`} role="status">{flash.text}</div>}

      {m.done && (
        <Modal>
          <h2 className="title-gold">{m.placementIds[0] === 'player' ? 'VICTORIA!' : 'The Match Is Decided'}</h2>
          <ol className="placings">
            {m.placementIds.map((id, i) => <li key={id} className={id === 'player' ? 'me' : ''}>{ordinal(i + 1)} — {id === 'player' ? g.player.name : g.rivals.find(r => r.id === id)?.name}</li>)}
          </ol>
          <button className="btn big gold" onClick={collect} autoFocus>Collect Results</button>
        </Modal>
      )}
      {confirmQuit && !m.done && (
        <Modal onClose={() => setConfirmQuit(false)}>
          <h3>Concede the match?</h3>
          <p>You will be placed last (no prize, rating loss as 4th). The others will play it out.</p>
          <div className="row"><button className="btn" onClick={() => setConfirmQuit(false)}>Keep fighting</button><button className="btn danger" onClick={() => { dispatch(g => forfeit(g)); setConfirmQuit(false); }}>Concede</button></div>
        </Modal>
      )}
    </div>
  );
}

export function ReportModal({ r, g, onClose }: { r: MatchReport; g: GameState; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      {r.trial === 'passed' && <div className="promo-burst">PROMOTED!<br /><RankBadge rank={r.newRank!} /></div>}
      <h2 className="title-gold">{ordinal(r.place + 1)} Place</h2>
      <div className="report-grid">
        <div><span>Prize</span><b className={r.prize ? 'pos' : ''}>{money(r.prize)}</b></div>
        <div><span>Entry</span><b>{money(-r.entry)}</b></div>
        {r.bonusPct > 0 && <div><span>Arsenal bonus</span><b>+{r.bonusPct}%</b></div>}
        {r.rebate > 0 && <div><span>Rebate</span><b className="pos">{money(r.rebate)}</b></div>}
        {r.sponsor > 0 && <div><span>Sponsor</span><b className="pos">{money(r.sponsor)}</b></div>}
        <div><span>Rating</span><b className={r.ratingDelta >= 0 ? 'pos' : 'neg'}>{r.ratingDelta >= 0 ? '+' : ''}{r.ratingDelta} → {r.newRating}</b></div>
        <div><span>Glory</span><b>+{r.glory}</b></div>
        <div><span>Hands</span><b>{r.hands}</b></div>
        <div><span>Ability triggers</span><b>{r.abilityTriggers}</b></div>
      </div>
      {r.trial === 'failed' && <p className="warn">Trial failed — your rank is safe. Regroup and try again.</p>}
      <p className="muted">Bankroll now {money(g.player.bankroll)} · Day {g.day}</p>
      <button className="btn big gold" onClick={onClose} autoFocus>Continue</button>
    </Modal>
  );
}
export { resolveAbility };
