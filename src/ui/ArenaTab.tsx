import { useState } from 'react';
import { ABILITY_MAP, activeSynergies, setBonuses, ARCHETYPES } from '../core/abilities';
import { arenaOptions, GameState, loadoutEntries, nextObjective, startArena, ArenaKind, ACHIEVEMENTS } from '../core/game';
import { RANKS } from '../core/ranks';
import { dispatch } from '../store';
import { ArenaScene } from '../art/Scene';
import { sfx } from '../art/sound';
import { AbilityIcon, AbilityTooltip, Bar, money, Panel, Portrait, RankBadge } from './common';

export function ArenaTab({ g, toast }: { g: GameState; toast: (t: string, k?: string) => void }) {
  const p = g.player;
  const r = RANKS[p.rank];
  const next = RANKS[p.rank + 1];
  const opts = arenaOptions(g);
  const [sel, setSel] = useState<ArenaKind>(opts.find(o => o.kind === 'trial' && o.available)?.kind ?? (opts[0].available ? 'arena' : 'recovery'));
  const chosen = opts.find(o => o.kind === sel) ?? opts[0];
  const [rivalOpen, setRivalOpen] = useState<string | null>(null);
  const lo = loadoutEntries(g);
  const syn = activeSynergies(lo.map(l => l.defId));
  const sets = setBonuses(lo.map(l => l.defId));
  const play = () => {
    const err = dispatch(g => startArena(g, chosen.kind));
    if (err) { sfx.error(); toast(err, 'error'); } else sfx.card();
  };
  const progressLo = r.threshold - 40, progressHi = next ? next.threshold : r.threshold + 60;
  const ladder = [...g.rivals].filter(x => Math.abs(x.rank - p.rank) <= 1).sort((a, b) => b.rating - a.rating).slice(0, 10);
  const rv = rivalOpen ? g.rivals.find(x => x.id === rivalOpen) : null;

  return (
    <div className="tab arena-tab">
      <div className="hero">
        <ArenaScene rank={p.rank} reduced={g.settings.reducedMotion} height={170} />
        <div className="hero-overlay">
          <div className="hero-title">{r.arena}</div>
          <div className="hero-motto">“{r.motto}”</div>
        </div>
      </div>

      <div className="objective" role="status"><span>OBJECTIVE</span> {nextObjective(g)}</div>

      <div className="play-zone">
        <div className="arena-options" role="radiogroup" aria-label="Match type">
          {opts.map(o => (
            <button key={o.kind} role="radio" aria-checked={sel === o.kind} className={`arena-opt${sel === o.kind ? ' sel' : ''}${o.available ? '' : ' off'} k-${o.kind}`} onClick={() => setSel(o.kind)}>
              <b>{o.name}</b>
              <span>{o.entry ? `Entry ${money(o.entry)}` : 'Free entry'} · 1st {money(o.prizes[0])}</span>
              <small>{o.available ? o.desc : o.reason}</small>
            </button>
          ))}
        </div>
        <button className={`play-btn${chosen.available ? '' : ' disabled'}`} onClick={play} disabled={!chosen.available} aria-label="Play">
          <span>PLAY</span>
          <small>{chosen.kind === 'trial' ? 'Promotion Trial' : chosen.name}</small>
        </button>
        <div className="prize-line">Prizes: {chosen.prizes.filter(x => x > 0).map((x, i) => <span key={i}>{['1st', '2nd', '3rd'][i]} {money(x)}</span>)}</div>
      </div>

      <div className="grid2">
        <Panel title="Your Career">
          <div className="career">
            <Portrait seed={hashName(p.name)} rank={p.rank} style="player" size={64} />
            <div>
              <div className="cname">{p.name} {p.equipped.title && <em>“{titleOf(p.equipped.title)}”</em>}</div>
              <RankBadge rank={p.rank} /> {p.prestige > 0 && <span className="laurel">✦ Ascension {p.prestige}</span>}
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
            <div><span>Trials</span><b>{p.trialsPassed}/{p.trialsPassed + p.trialsFailed}</b></div>
          </div>
          <div className="rank-ladder" aria-label="Rank ladder">
            {RANKS.map((x, i) => <div key={x.name} className={`rung${i === p.rank ? ' cur' : ''}${i < p.rank ? ' done' : ''}`} style={{ ['--rc' as any]: x.color }} title={`${x.name} — ${x.threshold}+ · unlocks ${x.unlock}`}>{x.name.slice(0, 3)}</div>)}
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
        <Panel title="Rivals of Your Circle">
          <table className="ladder">
            <thead><tr><th></th><th>Rival</th><th>Rank</th><th>Rating</th><th>W/M</th><th>vs You</th></tr></thead>
            <tbody>
              {ladder.map(x => (
                <tr key={x.id} onClick={() => setRivalOpen(x.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setRivalOpen(x.id)}>
                  <td><Portrait seed={x.portraitSeed} rank={x.rank} style={x.style} size={28} /></td>
                  <td>{x.name}{x.rivalry >= 3 && <span className="tag rivalry" title="Rivalry">⚔</span>}</td>
                  <td><RankBadge rank={x.rank} small /></td>
                  <td>{x.rating}</td>
                  <td>{x.career.wins}/{x.career.matches}</td>
                  <td>{x.vsPlayer.wins}–{x.vsPlayer.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Achievements" right={<span className="muted">{g.achievements.length}/{ACHIEVEMENTS.length}</span>}>
          <div className="achievements">
            {ACHIEVEMENTS.map(a => <div key={a.id} className={g.achievements.includes(a.id) ? 'got' : ''} title={a.desc}><b>{a.name}</b><small>{a.desc}</small></div>)}
          </div>
        </Panel>
      </div>

      {rv && (
        <div className="modal-bg" onClick={() => setRivalOpen(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-x" onClick={() => setRivalOpen(null)}>✕</button>
            <div className="career">
              <Portrait seed={rv.portraitSeed} rank={rv.rank} style={rv.style} size={96} />
              <div><h3>{rv.name}</h3><RankBadge rank={rv.rank} /> <span className="muted">Rating {rv.rating}</span><p className="muted">{rv.bio}</p></div>
            </div>
            <div className="stat-grid">
              <div><span>Matches</span><b>{rv.career.matches}</b></div><div><span>Wins</span><b>{rv.career.wins}</b></div>
              <div><span>Earnings</span><b>{money(rv.career.earnings)}</b></div><div><span>Bankroll</span><b>{money(rv.bankroll)}</b></div>
              <div><span>Aggression</span><b>{Math.round(rv.profile.aggression * 100)}</b></div><div><span>Bluffing</span><b>{Math.round(rv.profile.bluff * 100)}</b></div>
              <div><span>Patience</span><b>{Math.round(rv.profile.tightness * 100)}</b></div><div><span>Risk</span><b>{Math.round(rv.profile.risk * 100)}</b></div>
            </div>
            <p>Form: {rv.form.length ? rv.form.map((f, i) => <span key={i} className={`form f${f}`}>{f + 1}</span>) : 'no matches yet'}</p>
            {rv.nemesis && <p>Nemesis: {g.rivals.find(x => x.id === rv.nemesis)?.name}</p>}
            <div className="arsenal-strip small">{rv.loadout.map((l, i) => <div key={i} className="strip-ab" tabIndex={0}><AbilityIcon defId={l.defId} size={26} /><span>{ABILITY_MAP[l.defId]?.name}</span><div className="ab-pop"><AbilityTooltip inst={l} /></div></div>)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

import { hashString } from '../core/rng';
import { COSMETICS } from '../core/empire';
export const hashName = (n: string) => hashString(n);
const titleOf = (id: string) => COSMETICS.find(c => c.id === id)?.name.replace(/^Title: "|"$/g, '') ?? '';
