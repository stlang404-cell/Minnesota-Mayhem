import { useEffect, useRef, useState } from 'react';
import { GameState, MatchReport } from './core/game';
import { RANKS } from './core/ranks';
import { boot, importSave, startNew, useGame } from './store';
import { setSound, sfx } from './art/sound';
import { ArenaScene } from './art/Scene';
import { ArenaTab, hashName } from './ui/ArenaTab';
import { ExchangeTab } from './ui/ExchangeTab';
import { ForgeTab } from './ui/ForgeTab';
import { EmpireTab } from './ui/EmpireTab';
import { MatchView, ReportModal } from './ui/MatchView';
import { Bar, money, Portrait, RankBadge, useToastQueue } from './ui/common';

type Tab = 'arena' | 'exchange' | 'forge' | 'empire';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'arena', label: 'ARENA', icon: '⚔' },
  { id: 'exchange', label: 'EXCHANGE', icon: '⚖' },
  { id: 'forge', label: 'FORGE', icon: '⚒' },
  { id: 'empire', label: 'EMPIRE', icon: '♛' },
];

export default function App() {
  const g = useGame();
  const [ready, setReady] = useState(false);
  const [warn, setWarn] = useState<string | undefined>();
  useEffect(() => { boot().then(w => { setWarn(w); setReady(true); }); }, []);
  if (!ready) return <div className="loading">Lighting the braziers…</div>;
  if (!g) return <TitleScreen warn={warn} />;
  return <Game g={g} warn={warn} />;
}

function Game({ g, warn }: { g: GameState; warn?: string }) {
  const [tab, setTab] = useState<Tab>('arena');
  const [report, setReport] = useState<MatchReport | null>(null);
  const toasts = useToastQueue();
  const seenNotice = useRef(g.notices[g.notices.length - 1]?.id ?? 0);
  useEffect(() => { setSound(g.settings.sound); }, [g.settings.sound]);
  useEffect(() => { if (warn) toasts.push(warn, 'warning'); }, []);
  useEffect(() => {
    const fresh = g.notices.filter(n => n.id > seenNotice.current);
    seenNotice.current = g.notices[g.notices.length - 1]?.id ?? seenNotice.current;
    for (const n of fresh) {
      toasts.push(n.text, n.kind);
      if (n.kind === 'settlement') sfx.coin();
      if (n.kind === 'unlock' || n.kind === 'achievement') sfx.ability();
    }
  });
  useEffect(() => { document.body.classList.toggle('reduced', g.settings.reducedMotion); }, [g.settings.reducedMotion]);
  const p = g.player;
  const r = RANKS[p.rank];
  const next = RANKS[p.rank + 1];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">MM</span><span className="brand-text">MINNESOTA <b>MAYHEM</b></span></div>
        <div className="hud">
          <div className="hud-item money" title="Bankroll"><span>Bankroll</span><b>{money(p.bankroll)}</b></div>
          <div className="hud-item" title="Rank"><span>Rank</span><RankBadge rank={p.rank} small /></div>
          <div className="hud-item rating" title="Competitive rating">
            <span>Rating {p.rating}</span>
            <Bar value={p.rating - (r.threshold - 40)} max={(next?.threshold ?? r.threshold + 60) - (r.threshold - 40)} color={r.color} />
          </div>
          <div className="hud-item who"><Portrait seed={hashName(p.name)} rank={p.rank} style="player" size={30} /></div>
        </div>
      </header>
      {g.active ? (
        <MatchView g={g} onReport={setReport} />
      ) : (
        <main className="content">
          {tab === 'arena' && <ArenaTab g={g} toast={toasts.push} />}
          {tab === 'exchange' && <ExchangeTab g={g} toast={toasts.push} />}
          {tab === 'forge' && <ForgeTab g={g} toast={toasts.push} />}
          {tab === 'empire' && <EmpireTab g={g} toast={toasts.push} />}
        </main>
      )}
      {!g.active && (
        <nav className="tabs" role="tablist" aria-label="Main navigation">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); sfx.card(); }}>
              <span className="ti">{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
      <div className="toasts" aria-live="polite">{toasts.items.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
      {report && <ReportModal r={report} g={g} onClose={() => setReport(null)} />}
    </div>
  );
}

function TitleScreen({ warn }: { warn?: string }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState(warn ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="title-screen">
      <ArenaScene rank={0} reduced={matchMedia('(prefers-reduced-motion: reduce)').matches} height={260} />
      <div className="title-card">
        <h1>MINNESOTA<br /><span>MAYHEM</span></h1>
        <p className="tagline">Roman Poker · Strategic Arsenals · The Arena Exchange · Empire</p>
        <form onSubmit={e => { e.preventDefault(); startNew(name.trim() || 'Lupus'); sfx.promote(); }}>
          <label htmlFor="nm">Name your competitor</label>
          <input id="nm" value={name} onChange={e => setName(e.target.value)} maxLength={18} placeholder="Lupus Borealis" autoFocus />
          <button className="btn big gold" type="submit">Begin Your Career</button>
        </form>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import a save file</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return;
          try { importSave(await f.text()); } catch (x) { setErr((x as Error).message); }
        }} />
        {err && <p className="warn">{err}</p>}
        <p className="fine">A fully offline game. Fictional Dollars only — no real-money wagering, no accounts, no ads.</p>
      </div>
    </div>
  );
}
