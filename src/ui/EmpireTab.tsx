import { useRef, useState } from 'react';
import { ASSETS, COSMETICS, dailyNet } from '../core/empire';
import { ascend, buyAsset, buyCosmetic, canAscend, equipCosmetic, GameState, netWorth, sellAsset } from '../core/game';
import { RANKS } from '../core/ranks';
import { dispatch, exportSave, importSave, closeGame, persist } from '../store';
import { wipeSave } from '../core/save';
import { setSound, sfx } from '../art/sound';
import { money, Panel, Sprite } from './common';

export function EmpireTab({ g, toast }: { g: GameState; toast: (t: string, k?: string) => void }) {
  const p = g.player;
  const { income, upkeep } = dailyNet(g.empire);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showLedger, setShowLedger] = useState(false);
  const run = (f: (g: GameState) => string | null, ok: string) => {
    const err = dispatch(f);
    if (err) { sfx.error(); toast(err, 'error'); } else { sfx.coin(); toast(ok, 'purchase'); }
  };
  const doExport = () => {
    const blob = new Blob([exportSave()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `minnesota-mayhem-${p.name}-day${g.day}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Save exported');
  };
  const doImport = async (f: File) => {
    try { importSave(await f.text()); toast('Save imported'); } catch (e) { sfx.error(); toast((e as Error).message, 'error'); }
  };

  return (
    <div className="tab empire-tab">
      <Panel title="Your Empire" right={<span className="muted">Day {g.day} · one day passes per arena match</span>}>
        <div className="portfolio">
          <div><span>Bankroll</span><b>{money(p.bankroll)}</b></div>
          <div><span>Net worth</span><b>{money(netWorth(g))}</b></div>
          <div><span>Daily income</span><b className="pos">{money(income)}</b></div>
          <div><span>Daily upkeep</span><b className="neg">{money(-upkeep)}</b></div>
          <div><span>Lifetime rent</span><b>{money(g.stats.propertyIncome)}</b></div>
        </div>
      </Panel>
      <div className="assets">
        {ASSETS.map(a => {
          const lv = g.empire[a.id] ?? 0;
          const next = a.levels[lv];
          const locked = p.rank < a.unlockRank;
          const net = next ? next.income - next.upkeep : 0;
          return (
            <div key={a.id} className={`asset${lv ? ' owned' : ''}${locked ? ' locked' : ''}`}>
              <div className="asset-art"><Sprite kind="building" name={a.icon} size={72} />{lv > 0 && <span className="lv">Lv {lv}</span>}</div>
              <div className="asset-body">
                <b>{a.name}</b>
                <p>{a.desc}</p>
                {lv > 0 && <p className="gold-text">Active: {a.levels.slice(0, lv).map(l => l.effect).join(' · ')}</p>}
                {next ? (
                  <>
                    <p className="muted">Next: {next.effect}{net > 0 ? ` · payback ≈ ${Math.ceil(next.cost / net)} days` : ''}</p>
                    <button className="btn gold" disabled={locked} onClick={() => run(g => buyAsset(g, a.id), `${a.name} ${lv ? 'expanded' : 'acquired'}!`)}>
                      {locked ? `🔒 ${RANKS[a.unlockRank].name}` : `${lv ? 'Expand' : 'Acquire'} · ${money(next.cost)}`}
                    </button>
                  </>
                ) : <p className="gold-text">Fully developed</p>}
                {lv > 0 && <button className="btn small danger" onClick={() => { if (confirm(`Sell ${a.name} level ${lv} for ${money(a.levels[lv - 1].cost / 2)}?`)) run(g => sellAsset(g, a.id), 'Sold'); }}>Sell level</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid2">
        <Panel title="Imperial Wardrobe">
          <div className="cosmetics">
            {COSMETICS.map(c => {
              const own = p.cosmetics.includes(c.id);
              const eq = p.equipped[c.kind] === c.id;
              return (
                <div key={c.id} className={`cosm ${c.kind}${own ? ' own' : ''}`}>
                  <span className={`cosm-swatch ${c.id}`} />
                  <span>{c.name}</span>
                  {own ? <button className={'btn small' + (eq ? ' on' : '')} onClick={() => dispatch(g => equipCosmetic(g, c.id))}>{eq ? (c.kind === 'title' ? 'Worn' : 'Equipped') : 'Equip'}</button>
                    : <button className="btn small gold" onClick={() => run(g => buyCosmetic(g, c.id), `${c.name} purchased`)}>{money(c.price)}{p.rank < c.unlockRank && p.prestige === 0 ? ` · 🔒${RANKS[c.unlockRank].name}` : ''}</button>}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Prestige">
          <p>Augustus may <b>Ascend</b>: return to Peasant with a permanent laurel, +10% Glory per Ascension, and a fresh climb. Ascension never grants competitive power.</p>
          <p className="muted">Ascensions: {p.prestige} · Glory: {p.glory.toLocaleString()}</p>
          <button className="btn gold" disabled={!canAscend(g)} onClick={() => { if (confirm('Ascend and return to Peasant?')) { run(g => ascend(g), 'ASCENDED!'); sfx.promote(); } }}>{canAscend(g) ? 'ASCEND' : `Requires Augustus at ${RANKS[8].threshold + 60}`}</button>
        </Panel>
      </div>

      <div className="grid2">
        <Panel title="Treasury Ledger" right={<button className="btn small" onClick={() => setShowLedger(!showLedger)}>{showLedger ? 'Hide' : 'Show'} entries</button>}>
          <div className="totals">{Object.entries(g.ledgerTotals).map(([k, v]) => <span key={k}>{k}: <b className={v >= 0 ? 'pos' : 'neg'}>{money(v)}</b></span>)}</div>
          {showLedger && <table className="ladder ledger"><thead><tr><th>Day</th><th>Reason</th><th>Amount</th><th>Balance</th></tr></thead>
            <tbody>{[...g.ledger].reverse().slice(0, 60).map(e => <tr key={e.id}><td>{e.day}</td><td>{e.reason}</td><td className={e.amount >= 0 ? 'pos' : 'neg'}>{money(e.amount)}</td><td>{money(e.balance)}</td></tr>)}</tbody></table>}
        </Panel>
        <Panel title="Settings & Saves">
          <label className="check"><input type="checkbox" checked={g.settings.sound} onChange={e => { dispatch(g => { g.settings.sound = e.target.checked; }); setSound(e.target.checked); }} /> Sound effects</label>
          <label className="check"><input type="checkbox" checked={g.settings.reducedMotion} onChange={e => dispatch(g => { g.settings.reducedMotion = e.target.checked; })} /> Reduced motion</label>
          <div className="row wrap">
            <button className="btn" onClick={doExport}>⬇ Export save</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Import save</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => e.target.files?.[0] && doImport(e.target.files[0])} />
            <button className="btn" onClick={() => { void persist(); toast('Saved'); }}>💾 Save now</button>
            <button className="btn danger" onClick={async () => { if (confirm('Delete this career permanently? Export a backup first!')) { await wipeSave(); closeGame(); } }}>Delete career</button>
          </div>
          <p className="muted small">Progress is stored in this browser's IndexedDB (with a backup copy). Clearing site data, private browsing, or iOS storage eviction can erase it — export a backup regularly.</p>
        </Panel>
      </div>
    </div>
  );
}
