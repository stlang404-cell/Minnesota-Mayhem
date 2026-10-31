import { useState } from 'react';
import { ABILITIES, ABILITY_MAP, activeSynergies, ARCHETYPES, resolveAbility, setBonuses, SIGILS, SigilId, SYNERGIES, upgradeCost } from '../core/abilities';
import { applySigil, buyAbility, dismantle, fuse, fusionRecipes, GameState, loadPreset, priceOf, removeSigil, savePreset, toggleEquip, upgradeAbility } from '../core/game';
import { RANKS } from '../core/ranks';
import { dispatch } from '../store';
import { sfx } from '../art/sound';
import { AbilityIcon, AbilityTooltip, archColor, money, Panel } from './common';

export function ForgeTab({ g, toast }: { g: GameState; toast: (t: string, k?: string) => void }) {
  const p = g.player;
  const [filter, setFilter] = useState<string>('all');
  const [sel, setSel] = useState<string>(p.owned[0]?.defId ?? ABILITIES[0].id);
  const [presetName, setPresetName] = useState('');
  const owned = (id: string) => p.owned.find(o => o.defId === id);
  const equippedIds = p.loadout.map(u => p.owned.find(o => o.uid === u)?.defId).filter(Boolean) as string[];
  const d = ABILITY_MAP[sel];
  const inst = owned(sel);
  const run = (f: (g: GameState) => string | null, ok: string) => {
    const err = dispatch(f);
    if (err) { sfx.error(); toast(err, 'error'); } else { sfx.coin(); if (ok) toast(ok, 'purchase'); }
  };
  const list = ABILITIES.filter(a => (filter === 'all' || a.archetype === filter) && (!a.fusion || owned(a.id)));
  const sets = setBonuses(equippedIds);
  const syn = activeSynergies(equippedIds);
  const would = !equippedIds.includes(sel) ? activeSynergies([...equippedIds, sel]).filter(s => !syn.some(x => x.id === s.id)) : [];
  const partners = SYNERGIES.filter(s => s.needs.includes(sel));
  const total = ABILITIES.filter(a => !a.fusion).length;

  return (
    <div className="tab forge-tab">
      <Panel title="Your Arsenal" right={<span className="muted">{p.loadout.length}/8 equipped · Collection {p.owned.length}/{total}{p.owned.some(o => ABILITY_MAP[o.defId]?.fusion) ? ' +fusions' : ''}</span>}>
        <div className="slots8">
          {Array.from({ length: 8 }, (_, i) => {
            const o = p.owned.find(x => x.uid === p.loadout[i]);
            return o ? (
              <button key={i} className={`slot8${o.defId === sel ? ' sel' : ''}`} onClick={() => setSel(o.defId)} style={{ ['--ac' as any]: archColor(ABILITY_MAP[o.defId].archetype) }}>
                <AbilityIcon defId={o.defId} size={36} /><span>{ABILITY_MAP[o.defId].name}</span><small>Lv{o.level}{o.sigil ? ' ✦' : ''}</small>
              </button>
            ) : <div key={i} className="slot8 empty">Slot {i + 1}</div>;
          })}
        </div>
        <div className="synergies">
          {sets.length === 0 && syn.length === 0 && <span className="muted">Equip 3 abilities of one archetype for a set bonus, or pair specific abilities for synergies.</span>}
          {sets.map(s => <span key={s.archetype} className="syn" style={{ borderColor: archColor(s.archetype) }}>{ARCHETYPES.find(a => a.id === s.archetype)?.name} ×{s.count}: +{s.startResolve} starting Resolve</span>)}
          {syn.map(s => <span key={s.id} className="syn gold">⚭ {s.name}: {s.desc}</span>)}
        </div>
        <div className="presets">
          <input placeholder="Build name" value={presetName} onChange={e => setPresetName(e.target.value)} maxLength={20} aria-label="Preset name" />
          <button className="btn" onClick={() => { dispatch(g => savePreset(g, presetName.trim())); toast('Build saved'); }}>Save build</button>
          {p.presets.map((pr, i) => <button key={i} className="btn small" onClick={() => { dispatch(g => loadPreset(g, i)); toast(`Loaded ${pr.name}`); }}>{pr.name}</button>)}
        </div>
      </Panel>

      <div className="forge-main">
        <Panel title="Collection" className="collection">
          <div className="filters" role="tablist">
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
            {ARCHETYPES.map(a => <button key={a.id} className={filter === a.id ? 'on' : ''} style={{ ['--ac' as any]: a.color }} onClick={() => setFilter(a.id)}>{a.name}</button>)}
          </div>
          <div className="ab-grid">
            {list.map(a => {
              const o = owned(a.id);
              const locked = a.unlockRank > p.rank && !o;
              return (
                <button key={a.id} className={`ab-card rar-${a.rarity}${o ? ' owned' : ''}${locked ? ' locked' : ''}${sel === a.id ? ' sel' : ''}${equippedIds.includes(a.id) ? ' equipped' : ''}`} onClick={() => setSel(a.id)} style={{ ['--ac' as any]: archColor(a.archetype) }}>
                  <AbilityIcon defId={a.id} size={34} />
                  <b>{a.name}</b>
                  <small>{o ? `Lv ${o.level}${equippedIds.includes(a.id) ? ' · equipped' : ''}` : locked ? `🔒 ${RANKS[a.unlockRank].name}` : money(priceOf(g, a.price))}</small>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="The Anvil" className="anvil">
          {d && (
            <>
              <AbilityTooltip inst={{ defId: d.id, level: inst?.level ?? 1, sigil: inst?.sigil }} />
              <table className="levels">
                <thead><tr><th>Level</th>{[1, 2, 3].map(l => <th key={l} className={inst?.level === l ? 'cur' : ''}>{l}</th>)}</tr></thead>
                <tbody><tr><td>Magnitude</td>{[1, 2, 3].map(l => <td key={l} className={inst?.level === l ? 'cur' : ''}>{resolveAbility({ defId: d.id, level: l, sigil: inst?.sigil }).value}</td>)}</tr></tbody>
              </table>
              {would.length > 0 && <p className="syn gold">Equipping activates: {would.map(s => `${s.name} (${s.desc})`).join(', ')}</p>}
              {partners.length > 0 && <p className="muted">Synergy partners: {partners.map(s => `${s.name} with ${s.needs.filter(n => n !== sel).map(n => ABILITY_MAP[n].name).join(', ')}`).join(' · ')}</p>}
              <div className="anvil-actions">
                {!inst && !d.fusion && <button className="btn gold" disabled={d.unlockRank > p.rank} onClick={() => run(g => buyAbility(g, d.id), '')}>Buy · {money(priceOf(g, d.price))}</button>}
                {inst && <button className="btn" onClick={() => { const e = dispatch(g => toggleEquip(g, inst.uid)); if (e) toast(e, 'error'); else sfx.card(); }}>{p.loadout.includes(inst.uid) ? 'Unequip' : 'Equip'}</button>}
                {inst && inst.level < 3 && <button className="btn gold" onClick={() => run(g => upgradeAbility(g, inst.uid), '')}>Upgrade → Lv{inst.level + 1} · {money(priceOf(g, upgradeCost(d, inst.level + 1)))}</button>}
                {inst && <button className="btn danger small" onClick={() => { if (confirm(`Dismantle ${d.name}? You recover ${money(Math.round(d.price * 0.4))}.`)) run(g => dismantle(g, inst.uid), 'Dismantled'); }}>Dismantle</button>}
              </div>
              {inst && (
                <div className="sigils">
                  <h4>Sigils {p.rank < 2 && <small className="muted">(unlock at Gladiator)</small>}</h4>
                  <p className="muted">Bind one sigil to trade raw power for flexibility. Rebinding replaces the old sigil.</p>
                  {(Object.keys(SIGILS) as SigilId[]).map(s => {
                    const sg = SIGILS[s];
                    const ok = sg.appliesTo(d);
                    return (
                      <button key={s} className={`btn small sigil${inst.sigil === s ? ' on' : ''}`} disabled={!ok || p.rank < 2 || inst.sigil === s} onClick={() => run(g => applySigil(g, inst.uid, s), `${sg.name} bound`)} title={sg.desc}>
                        {sg.name} · {money(priceOf(g, sg.price))}<small>{sg.desc}</small>
                      </button>
                    );
                  })}
                  {inst.sigil && <button className="btn small" onClick={() => run(g => removeSigil(g, inst.uid), 'Sigil removed')}>Remove sigil</button>}
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      <Panel title="Legendary Fusions" right={<span className="muted">Combine two abilities into one legendary (both are consumed)</span>}>
        <div className="fusions">
          {fusionRecipes().map(f => {
            const [a, b] = f.fusion!;
            const have = !!owned(a) && !!owned(b);
            const done = !!owned(f.id);
            return (
              <div key={f.id} className={`fusion${done ? ' done' : ''}`}>
                <div className="recipe"><AbilityIcon defId={a} /> + <AbilityIcon defId={b} /> → <AbilityIcon defId={f.id} size={34} /></div>
                <b>{f.name}</b>
                <small>{f.text(f.values[0])}</small>
                <small className="muted">{ABILITY_MAP[a].name} + {ABILITY_MAP[b].name}</small>
                <button className="btn gold small" disabled={done || !have || p.rank < f.unlockRank} onClick={() => run(g => fuse(g, f.id), '')}>
                  {done ? 'Forged' : p.rank < f.unlockRank ? `🔒 ${RANKS[f.unlockRank].name}` : `Forge · ${money(priceOf(g, f.price))}`}
                </button>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
