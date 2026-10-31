import { useEffect, useState } from 'react';
import { GameState, TUTORIAL, tutorialEvent } from '../core/game';
import { RANKS } from '../core/ranks';
import { ArenaScene } from '../art/Scene';
import { sfx } from '../art/sound';
import { dispatch } from '../store';
import { Insignia } from './common';

/** Full-screen promotion ceremony: the new arena, its insignia and what it unlocks. */
export function Ceremony({ g }: { g: GameState }) {
  const rank = g.ceremony!;
  const r = RANKS[rank];
  useEffect(() => { sfx.promote(); }, []);
  return (
    <div className="ceremony" role="dialog" aria-modal="true" aria-label={`Promoted to ${r.name}`}>
      <ArenaScene rank={rank} reduced={g.settings.reducedMotion} height={300} banner={g.player.equipped.banner} />
      <div className="ceremony-card">
        <div className="laurel-burst" aria-hidden="true" />
        <Insignia rank={rank} size={96} />
        <p className="ceremony-kicker">BY DECREE OF THE SENATE</p>
        <h1>{r.name.toUpperCase()}</h1>
        <p className="ceremony-motto">“{r.motto}”</p>
        <div className="ceremony-unlocks"><b>New arena:</b> {r.arena}<br /><b>Unlocked:</b> {r.unlock}<br /><b>Entry:</b> ${(r.entry / 100).toFixed(0)} · AI skill tier {Math.round(r.aiSkill * 100)}</div>
        <button className="btn big gold" autoFocus onClick={() => dispatch(g => { g.ceremony = null; })}>Enter the {r.arena}</button>
      </div>
    </div>
  );
}

/** Learn-by-doing tutorial coach: one short card per step, advanced by real actions. */
export function TutorialCoach({ g, where }: { g: GameState; where: string }) {
  const [min, setMin] = useState(false);
  const t = g.tutorial;
  if (!t || t.done || t.step >= TUTORIAL.length) return null;
  const s = TUTORIAL[t.step];
  if (s.tab !== where) {
    if (where !== 'match' && s.tab !== 'match') return <div className="coach mini" role="note">📜 Tutorial: go to <b>{s.tab.toUpperCase()}</b> — {s.title}</div>;
    return null;
  }
  if (min) return <button className="coach mini" onClick={() => setMin(false)}>📜 Tutorial ({t.step + 1}/{TUTORIAL.length})</button>;
  return (
    <div className={`coach${where === 'match' ? ' in-match' : ''}`} role="note" aria-live="polite">
      <div className="coach-head"><span>TUTORIAL {t.step + 1}/{TUTORIAL.length}</span><b>{s.title}</b></div>
      <p>{s.text}</p>
      <div className="row">
        {(t.step === 2 || t.step === 3 || t.step === 6 || t.step === 7) && <button className="btn small gold" onClick={() => dispatch(g => tutorialEvent(g, 'next'))}>Got it</button>}
        <button className="btn small" onClick={() => setMin(true)}>Hide</button>
        <button className="btn small" onClick={() => dispatch(g => tutorialEvent(g, 'skip'))}>Skip tutorial</button>
      </div>
    </div>
  );
}
