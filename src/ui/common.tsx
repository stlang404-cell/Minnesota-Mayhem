import { ReactNode, useEffect, useState } from 'react';
import { ABILITY_MAP, ARCHETYPES, ResolvedAbility, resolveAbility, SIGILS, SigilId } from '../core/abilities';
import { Card, rankOf, suitOf, SUIT_SYMBOLS, RANK_CHARS } from '../core/cards';
import { RANKS, division } from '../core/ranks';
import { insigniaURL, portraitURL, spriteURL, Mood } from '../art/pixel';

export const money = (c: number) => (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (c: number) => (c < 0 ? '−' : '') + '$' + Math.round(Math.abs(c) / 100).toLocaleString();
export const pct = (p: number, d = 0) => (p * 100).toFixed(d) + '%';
export const cents = (p: number) => Math.round(p * 100) + '¢';

export function Portrait({ seed, rank, style, size = 48, title, mood, outfit, headgear, anim }: { seed: number; rank: number; style: string; size?: number; title?: string; mood?: Mood; outfit?: string; headgear?: string; anim?: string }) {
  return <img className={`portrait${anim ? ' anim-' + anim : ''}`} src={portraitURL(seed, rank, style, { mood, outfit, headgear })} width={size} height={size} alt={title ?? 'portrait'} title={title} />;
}

export function Sprite({ kind, name, size = 32, tint }: { kind: 'building' | 'icon'; name: string; size?: number; tint?: string }) {
  return <img className="sprite" src={spriteURL(kind, name, tint)} width={size} height={size} alt="" aria-hidden="true" />;
}

export function Insignia({ rank, size = 24 }: { rank: number; size?: number }) {
  return <img className="insignia" src={insigniaURL(rank)} width={size} height={size} alt={`${RANKS[rank].name} insignia`} />;
}
export function RankBadge({ rank, small, rating }: { rank: number; small?: boolean; rating?: number }) {
  const r = RANKS[rank];
  const div = rating !== undefined ? division(rank, rating) : '';
  return <span className={'rank-badge' + (small ? ' small' : '')} style={{ ['--rc' as any]: r.color }}><img src={insigniaURL(rank)} alt="" aria-hidden="true" />{r.name}{div && ` ${div}`}</span>;
}
export function Framed({ frame, children }: { frame?: string; children: ReactNode }) {
  return <span className={`frame ${frame ?? 'frame_bronze'}`}>{children}</span>;
}

export function PlayingCard({ card, hidden, back = 'back_crimson', small, glow, delay = 0 }: { card?: Card; hidden?: boolean; back?: string; small?: boolean; glow?: boolean; delay?: number }) {
  if (hidden || card === undefined) return <div className={`pcard back ${back}${small ? ' small' : ''}`} style={{ animationDelay: `${delay}ms` }} aria-label="face-down card" />;
  const r = RANK_CHARS[rankOf(card)];
  const s = suitOf(card);
  const red = s === 1 || s === 2;
  const label = r === 'T' ? '10' : r;
  return (
    <div className={`pcard face${red ? ' red' : ''}${small ? ' small' : ''}${glow ? ' glow' : ''}`} style={{ animationDelay: `${delay}ms` }} aria-label={`${label}${SUIT_SYMBOLS[s]}`}>
      <span className="cr">{label}</span>
      <span className="cs">{SUIT_SYMBOLS[s]}</span>
    </div>
  );
}

export function archColor(a: string) { return ARCHETYPES.find(x => x.id === a)?.color ?? '#888'; }

export function AbilityIcon({ defId, size = 28 }: { defId: string; size?: number }) {
  const d = ABILITY_MAP[defId];
  if (!d) return null;
  return (
    <span className={`ab-icon rar-${d.rarity}`} style={{ ['--ac' as any]: archColor(d.archetype), width: size, height: size }}>
      <Sprite kind="icon" name={d.archetype} size={size - 8} />
    </span>
  );
}

export function abilityText(r: ResolvedAbility): string { return r.def.text(r.value); }

export function AbilityTooltip({ inst }: { inst: { defId: string; level: number; sigil?: SigilId } }) {
  const r = resolveAbility(inst);
  const d = r.def;
  return (
    <div className="ab-tip">
      <div className="ab-tip-head"><AbilityIcon defId={d.id} /> <b>{d.name}</b> <span className={`rar rar-${d.rarity}`}>{d.rarity}</span></div>
      <div className="ab-tip-meta">{ARCHETYPES.find(a => a.id === d.archetype)?.name} · {d.kind === 'active' ? `Active · ${r.cost} Resolve · ${d.window}` : 'Passive'}{r.uses ? ` · ${r.uses} uses/match` : ''} · Lv {r.level}{r.sigil ? ` · ${SIGILS[r.sigil].name}` : ''}</div>
      <p>{abilityText(r)}</p>
      <p className="counter">Counterplay: {d.counter}</p>
    </div>
  );
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose} role="dialog" aria-modal="true">
      <div className={'modal' + (wide ? ' wide' : '')} onClick={e => e.stopPropagation()}>
        {onClose && <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>}
        {children}
      </div>
    </div>
  );
}

export function Bar({ value, max, color = '#f2c94c', label }: { value: number; max: number; color?: string; label?: string }) {
  const w = Math.max(0, Math.min(1, max ? value / max : 0));
  return <div className="bar" aria-label={label}><div className="bar-fill" style={{ width: pct(w), background: color }} />{label && <span className="bar-label">{label}</span>}</div>;
}

export function Panel({ title, children, className, right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={'panel ' + (className ?? '')}>
      {title && <header className="panel-head"><h3>{title}</h3>{right}</header>}
      {children}
    </section>
  );
}

export function useToastQueue() {
  const [items, setItems] = useState<{ id: number; text: string; kind: string }[]>([]);
  const push = (text: string, kind = 'info') => {
    const id = Math.random();
    setItems(x => [...x.slice(-3), { id, text, kind }]);
    setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 3600);
  };
  return { items, push };
}

export function Sparkline({ series, colors, height = 120, markers }: { series: number[][]; colors: string[]; height?: number; markers?: number[] }) {
  // series: list of points, each an array of values per outcome (0..1)
  const W = 400, Hh = height;
  if (series.length < 2) series = [series[0] ?? [0.25, 0.25, 0.25, 0.25], series[0] ?? [0.25, 0.25, 0.25, 0.25]];
  const n = series[0].length;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => Hh - 6 - v * (Hh - 12);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" role="img" aria-label="Price history chart">
      {[0.25, 0.5, 0.75].map(g => <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} className="grid" />)}
      {markers?.map((m, i) => <line key={'m' + i} x1={x(m)} x2={x(m)} y1={0} y2={Hh} className="marker" />)}
      {Array.from({ length: n }, (_, k) => (
        <polyline key={k} fill="none" stroke={colors[k]} strokeWidth={2.5} vectorEffect="non-scaling-stroke"
          points={series.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ')} />
      ))}
    </svg>
  );
}

export const SEAT_COLORS = ['#e8c33a', '#e0524a', '#4a8fe0', '#4bbf6a'];
