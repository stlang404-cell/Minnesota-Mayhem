import { useState } from 'react';
import { ABILITY_MAP, activeSynergies, setBonuses, ARCHETYPES } from '../core/abilities';
import { arenaOptions, cashOutGauntlet, draftPick, GameState, loadoutEntries, nextObjective, startArena, startDraft, ArenaKind, ACHIEVEMENTS, toggleWatch, ordinal } from '../core/game';
import { GAUNTLET_PAYOUT, GAUNTLET_STAGES } from '../core/modes';
import { RANKS } from '../core/ranks';
import { SEASON_LENGTH, standings } from '../core/world';
import { dispatch } from '../store';
import { ArenaScene } from '../art/Scene';
import { sfx } from '../art/sound';
import { AbilityIcon, AbilityTooltip, Bar, Framed, Insignia, Modal, money, Panel, pct, Portrait, RankBadge } from './common';
import { hashString } from '../core/rng';
import { COSMETICS } from '../core/empire';
import { CircuitPanel } from './Circuit';

export const hashName = (n: string) => hashString(n);
const titleOf = (id: string) => COSMETICS.find(c => c.id === id)?.name.replace(/^Title: "|"$/g, '') ?? '';

export function ArenaTab({ g, toast }: { g: GameState; toast: (t: string, k?: string) => void }) {
  const p = g.player;
  const r = RANKS[p.rank];
  const next = RANKS[p.rank + 1];
  const opts = arenaOptions(g);
  const core = opts.filter(o => o.group === 'core');
  const modes = opts.filter(o => o.group === 'modes');
  const defaultSel = opts.find(o => o.kind === 'trial' && o.available)?.kind ?? (g.gauntlet ? 'gauntlet' : opts[0].available ? 'arena' : 'recovery');
  const [sel, setSel] = useState<ArenaKind>(defaultSel);
  const chosen = opts.find(o => o.kind === sel) ?? opts[0];
  const [rivalOpen, setRivalOpen] = useState<string | null>(null);
  const [worldTab, setWorldTab] = useState<'news' | 'season' | 'hall' | 'tour'>('news');
  const lo = loadoutEntries(g);
  const syn = activeSynergies(lo.map(l => l.defId));
  const sets = setBonuses(lo.map(l => l.defId));
  const play = () => {
    if (chosen.kind === 'draft' && (!g.draft || g.draft.picks.length < 8)) { dispatch(g => startDraft(g)); return; }
    const err = dispatch(g => startArena(g, chosen.kind));
    if (err) { sfx.error(); toast(err, 'error'); } else sfx.card();
  };
  const progressLo = r.threshold - 40, progressHi = next ? next.threshold : r.threshold + 60;
  const ladder = [...g.rivals].filter(x => Math.abs(x.rank - p.rank) <= 1).sort((a, b) => b.rating - a.rating).slice(0, 10);
  const rv = rivalOpen ? g.rivals.find(x => x.id === rivalOpen) : null;
  const table = standings(g);
  const myPlace = table.findIndex(x => x.id === 'player');
  const daysLeft = SEASON_LENGTH - (g.day - g.season.start);

  return (
    <div className="tab arena-tab">
      <div className="hero">
        <ArenaScene rank={p.rank} reduced={g.settings.reducedMotion} height={180} banner={p.equipped.banner} />
        <div className="hero-overlay">
          <Insignia rank={p.rank} size={44} />
          <div>
            <div className="hero-title">{r.arena}</div>
            <div className="hero-motto">“{r.motto}”</div>
          </div>
        </div>
      </div>

      <div className="objective" role="status"><span>OBJECTIVE</span> {nextObjective(g)}</div>

      {g.gauntlet && g.gauntlet.stage > 0 && !g.active && (
        <div className="gauntlet-bar">
          <div className="g-stages">{Array.from({ length: GAUNTLET_STAGES }, (_, i) => <i key={i} className={i < g.gauntlet!.stage ? 'done' : i === g.gauntlet!.stage ? 'next' : ''}>{i + 1}</i>)}</div>
          <div><b>Survival Gauntlet</b> — stage {g.gauntlet.stage} cleared. Cash out now for <b>{money(Math.round(GAUNTLET_PAYOUT[g.gauntlet.stage - 1] * g.gauntlet.entry))}</b>, or risk it for <b>{money(Math.round(GAUNTLET_PAYOUT[g.gauntlet.stage] * g.gauntlet.entry))}</b>.</div>
          <div className="row"><button className="btn gold" onClick={() => { dispatch(g => cashOutGauntlet(g)); sfx.coin(); }}>Cash out</button><button className="btn danger" onClick={() => { setSel('gauntlet'); const e = dispatch(g => startArena(g, 'gauntlet')); if (e) toast(e, 'error'); }}>Fight stage {g.gauntlet.stage + 1}</button></div>
        </div>
      )}

      <div className="play-zone">
        <div className="arena-options" role="radiogroup" aria-label="Match type">
          {core.map(o => (
            <button key={o.kind} role="radio" aria-checked={sel === o.kind} className={`arena-opt${sel === o.kind ? ' sel' : ''}${o.available ? '' : ' off'} k-${o.kind}`} onClick={() => setSel(o.kind)}>
              <b>{o.icon} {o.name}</b>
              <span>{o.entry ? `Entry ${money(o.entry)}` : 'Free entry'} · 1st {money(o.prizes[0])}</span>
              <small>{o.available ? o.desc : o.reason}</small>
            </button>
          ))}
        </div>
        <button className={`play-btn${chosen.available ? '' : ' disabled'}`} onClick={play} disabled={!chosen.available} aria-label="Play">
          <span>PLAY</span>
          <small>{chosen.icon} {chosen.name}</small>
        </button>
        <div className="prize-line">{chosen.kind === 'gauntlet' ? 'Cash-out ladder:' : chosen.kind === 'tournament' ? 'Final table:' : 'Prizes:'} {chosen.prizes.filter(x => x > 0).map((x, i) => <span key={i}>{chosen.kind === 'gauntlet' ? `S${i + 1}` : ordinal(i + 1)} {money(x)}</span>)}</div>
      </div>

      <CircuitPanel g={g} toast={toast} />

      {p.matches >= 1 && (
        <Panel title="Game Modes" right={<span className="muted">{modes.filter(m => m.unlocked).length}/{modes.length} unlocked</span>}>
          <div className="modes-grid">
            {modes.map(o => (
              <button key={o.kind} className={`mode-card${sel === o.kind ? ' sel' : ''}${o.unlocked ? '' : ' locked'}`} onClick={() => setSel(o.kind)} aria-pressed={sel === o.kind}>
                <span className="mode-icon">{o.unlocked ? o.icon : '🔒'}</span>
                <b>{o.name}</b>
                <small>{o.unlocked ? o.desc : o.reason}</small>
                <em>{o.entry ? `Entry ${money(o.entry)}` : 'Free'}{o.unlocked && !o.available && o.reason ? ` · ${o.reason}` : ''}</em>
              </button>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid2">
        <Panel title="Your Career">
          <div className="career">
            <Framed frame={p.equipped.frame}><Portrait seed={hashName(p.name)} rank={p.rank} style="player" size={64} outfit={p.equipped.outfit} headgear={p.equipped.headgear} anim="idle" /></Framed>
            <div>
              <div className="cname">{p.name} {p.equipped.title && <em>“{titleOf(p.equipped.title)}”</em>}</div>
              <RankBadge rank={p.rank} rating={p.rating} /> {p.prestige > 0 && <span className="laurel">✦ Ascension {p.prestige}</span>}
              <div className="rating-line">Rating <b>{p.rating}</b>{next && <> · next trial at {next.threshold}</>}</div>
              <Bar value={p.rating - progressLo} max={progressHi - progressLo} color={r.color} />
            </div>
          </div>
          <div className="stat-grid">
            <div><span>Matches</span><b>{p.matches}</b></div>
            <div><span>Wins</span><b>{p.wins}</b></div>
            <div><span>Top 2</span><b>{p.matches ? Math.round((p.top2 / p.matches) * 100) : 0}%</b></div>
            <div><span>Glory</span><b>{p.glory.toLocaleString()}</b></div>
            <div><span>Peak</span><b>{p.peakRating}</b></div>
            <div><span>Titles</span><b>{p.titles}</b></div>
            <div><span>Hands won</span><b>{p.career.handsWon}/{p.career.hands}</b></div>
            <div><span>Biggest pot</span><b>{p.career.biggestPot.toLocaleString()}</b></div>
          </div>
          <div className="rank-ladder" aria-label="Rank ladder">
            {RANKS.map((x, i) => <div key={x.name} className={`rung${i === p.rank ? ' cur' : ''}${i < p.rank ? ' done' : ''}`} style={{ ['--rc' as any]: x.color }} title={`${x.name} — ${x.threshold}+ · unlocks ${x.unlock}`}><Insignia rank={i} size={16} /><span>{x.name.slice(0, 3)}</span></div>)}
          </div>
        </Panel>

        <Panel title="Current Arsenal" right={<span className="muted">{lo.length}/8</span>}>
          <div className="arsenal-strip">
            {lo.map((l, i) => (
              <div key={i} className="strip-ab" tabIndex={0}>
                <AbilityIcon defId={l.defId} size={34} />
                <span>{ABILITY_MAP[l.defId].name}</span>
                <small>Lv{l.level}</small>
                <div className="ab-pop"><AbilityTooltip inst={l} /></div>
              </div>
            ))}
            {Array.from({ length: 8 - lo.length }, (_, i) => <div key={'e' + i} className="strip-ab empty">empty</div>)}
          </div>
          {(syn.length > 0 || sets.length > 0) && (
            <div className="synergies">
              {sets.map(s => <span key={s.archetype} className="syn">{ARCHETYPES.find(a => a.id === s.archetype)?.name} ×{s.count}: +{s.startResolve} starting Resolve</span>)}
              {syn.map(s => <span key={s.id} className="syn gold">{s.name}: {s.desc}</span>)}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid2">
        <Panel title="The Roman World" right={<div className="seg">{(['news', 'season', 'hall', 'tour'] as const).map(k => <button key={k} className={worldTab === k ? 'on' : ''} onClick={() => setWorldTab(k)}>{{ news: 'News', season: 'Season', hall: 'Hall', tour: 'Tournaments' }[k]}</button>)}</div>}>
          {worldTab === 'news' && (
            <ul className="news">
              {[...g.news].reverse().slice(0, 12).map(n => <li key={n.id} className={`n-${n.kind}`}><span>Day {n.day}</span>{n.text}</li>)}
              {g.news.length === 0 && <li className="muted">The criers have nothing to announce yet. Play a match or watch the Exchange.</li>}
            </ul>
          )}
          {worldTab === 'season' && (
            <>
              <p className="muted">Season {g.season.n} · {daysLeft} day(s) left · points: 1st 10, 2nd 6, 3rd 3, 4th 1 (Quick Clash and background bouts count half). Top 10 earn rewards.</p>
              <table className="ladder"><tbody>
                {table.slice(0, 10).map((x, i) => <tr key={x.id} className={x.id === 'player' ? 'me' : ''}><td>{i + 1}</td><td>{x.name}</td><td>{x.points}</td></tr>)}
                {myPlace >= 10 && <tr className="me"><td>{myPlace + 1}</td><td>{p.name}</td><td>{table[myPlace].points}</td></tr>}
              </tbody></table>
            </>
          )}
          {worldTab === 'hall' && (
            <ul className="news">{[...g.hall].reverse().map(h => <li key={h.season}><span>Season {h.season}</span>🏆 {h.name} ({h.points} pts){h.playerPlace ? ` · you: ${ordinal(h.playerPlace)}` : ''}</li>)}{g.hall.length === 0 && <li className="muted">No season has ended yet (every {SEASON_LENGTH} days).</li>}</ul>
          )}
          {worldTab === 'tour' && (
            <ul className="news">{[...g.tournamentHistory].reverse().map(t => <li key={t.id}><span>Day {t.day}</span>🏆 {g.rivals.find(r => r.id === t.champion)?.name ?? (t.champion === 'player' ? p.name : 'retired champion')} — you: {t.playerResult <= 4 ? ordinal(t.playerResult) : t.playerResult === 5 ? 'heat runner-up' : 'heats'}</li>)}{g.tournamentHistory.length === 0 && <li className="muted">No Imperial Tournaments yet.</li>}</ul>
          )}
        </Panel>
        <Panel title="Rivals of Your Circle" right={<span className="muted">★ = watchlist</span>}>
          <table className="ladder">
            <thead><tr><th></th><th>Rival</th><th>Rank</th><th>Rating</th><th>Form</th><th>vs You</th></tr></thead>
            <tbody>
              {ladder.map(x => (
                <tr key={x.id} onClick={() => setRivalOpen(x.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setRivalOpen(x.id)}>
                  <td><Portrait seed={x.portraitSeed} rank={x.rank} style={x.style} size={28} /></td>
                  <td>{g.watchlist.includes(x.id) && '★ '}{x.name}{x.rivalry >= 3 && <span className="tag rivalry" title="Rivalry">⚔</span>}</td>
                  <td><RankBadge rank={x.rank} small /></td>
                  <td>{x.rating}</td>
                  <td>{x.form.slice(-3).map((f, i) => <span key={i} className={`form f${f}`}>{f + 1}</span>)}</td>
                  <td>{x.vsPlayer.wins}–{x.vsPlayer.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Achievements" right={<span className="muted">{g.achievements.length}/{ACHIEVEMENTS.length}</span>}>
        <div className="achievements">
          {ACHIEVEMENTS.map(a => <div key={a.id} className={g.achievements.includes(a.id) ? 'got' : ''} title={a.desc}><b>{a.name}</b><small>{a.desc}</small></div>)}
        </div>
      </Panel>

      {g.draft && <DraftModal g={g} toast={toast} />}

      {rv && (
        <Modal onClose={() => setRivalOpen(null)}>
          <div className="career">
            <Portrait seed={rv.portraitSeed} rank={rv.rank} style={rv.style} size={96} />
            <div><h3>{rv.name}</h3><RankBadge rank={rv.rank} rating={rv.rating} /> <span className="muted">Rating {rv.rating}</span><p className="muted">{rv.bio}</p>
              <button className="btn small" onClick={() => dispatch(g => toggleWatch(g, rv.id))}>{g.watchlist.includes(rv.id) ? '★ Watching' : '☆ Watch'}</button></div>
          </div>
          <div className="stat-grid">
            <div><span>Matches</span><b>{rv.career.matches}</b></div><div><span>Wins</span><b>{rv.career.wins}</b></div>
            <div><span>Titles</span><b>{rv.career.titles}</b></div><div><span>Earnings</span><b>{money(rv.career.earnings)}</b></div>
            <div><span>Bankroll</span><b>{money(rv.bankroll)}</b></div><div><span>vs You</span><b>{rv.vsPlayer.wins}–{rv.vsPlayer.losses}</b></div>
            <div><span>Aggression</span><b>{Math.round(rv.profile.aggression * 100)}</b></div><div><span>Bluffing</span><b>{Math.round(rv.profile.bluff * 100)}</b></div>
          </div>
          {g.reputation[rv.id] && g.reputation[rv.id].hands > 0 && (() => { const s = g.reputation[rv.id]; return <p className="muted">Public record: VPIP {pct(s.vpip / s.hands)} · PFR {pct(s.pfr / s.hands)} · fold-to-raise {s.foldToRaiseOpp ? pct(s.foldToRaise / s.foldToRaiseOpp) : '—'} · bluffs shown {s.bluffsShown}/{s.showdowns}</p>; })()}
          <p>Form: {rv.form.length ? rv.form.map((f, i) => <span key={i} className={`form f${f}`}>{f + 1}</span>) : 'no matches yet'}</p>
          {rv.nemesis && <p>Nemesis: {g.rivals.find(x => x.id === rv.nemesis)?.name}</p>}
          {(p.rivalWins[rv.id] ?? 0) > 0 && <p className="gold-text">Rival Challenges won against them: {p.rivalWins[rv.id]}</p>}
          <div className="arsenal-strip small">{rv.loadout.map((l, i) => <div key={i} className="strip-ab" tabIndex={0}><AbilityIcon defId={l.defId} size={26} /><span>{ABILITY_MAP[l.defId]?.name}</span><div className="ab-pop"><AbilityTooltip inst={l} /></div></div>)}</div>
        </Modal>
      )}
    </div>
  );
}

function DraftModal({ g, toast }: { g: GameState; toast: (t: string, k?: string) => void }) {
  const d = g.draft!;
  const round = d.picks.length;
  return (
    <Modal wide>
      <h2 className="title-gold">Draft Arena</h2>
      <p className="muted">Pick 1 of 3, eight times. Drafted abilities fight at level 2 for this match only. Entry is charged when you enter.</p>
      <button className="btn small" onClick={() => dispatch(g => { g.draft = null; })}>Abandon draft</button>
      <div className="draft-picks">{Array.from({ length: 8 }, (_, i) => d.picks[i] ? <AbilityIcon key={i} defId={d.picks[i]} size={34} /> : <span key={i} className="draft-empty">{i + 1}</span>)}</div>
      {round < 8 ? (
        <div className="draft-options">
          {d.options[round].map(id => (
            <button key={id} className="draft-card" disabled={d.picks.includes(id)} onClick={() => { const e = dispatch(g => draftPick(g, id)); if (e) toast(e, 'error'); else sfx.card(); }}>
              <AbilityTooltip inst={{ defId: id, level: 2 }} />
            </button>
          ))}
        </div>
      ) : (
        <button className="btn big gold" autoFocus onClick={() => { const e = dispatch(g => startArena(g, 'draft')); if (e) toast(e, 'error'); }}>Enter the Draft Arena</button>
      )}
    </Modal>
  );
}
