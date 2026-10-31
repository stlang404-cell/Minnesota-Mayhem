// For every ability: equip it (with its fusion partners / combo pieces) on seat 0 and count real triggers.
import { ABILITIES, SYNERGIES, ABILITY_MAP } from '../src/core/abilities';
import { createMatch, runUntilBlocked } from '../src/core/match';
import { Rng } from '../src/core/rng';
export function coverage(N = 40) {
  const prof = { aggression: 0.55, bluff: 0.3, tightness: 0.45, risk: 0.55, adaptation: 0.5, skill: 0.6 };
  const others = ['siege_engine', 'caesars_gambit', 'war_drums', 'tax_collector', 'fortress_wall'];
  const out: Record<string, number> = {};
  for (const a of ABILITIES) {
    let n = 0;
    for (let s = 0; s < N; s++) {
      const rng = new Rng(s * 31 + a.id.length);
      const lo = [{ defId: a.id, level: 2 }];
      const m = createMatch([0, 1, 2, 3].map(i => ({ id: 'p' + i, name: 'P' + i, isHuman: false, profile: prof,
        loadout: i === 0 ? lo : rng.shuffle([...others]).slice(0, 3).map(d => ({ defId: d, level: 2 })) })), 9000 + s);
      m.aiIters = 30; runUntilBlocked(m);
      n += m.events.filter(e => e.abilityId === a.id).length;
    }
    out[a.id] = n;
  }
  return out;
}
if (process.env.COVERAGE_MAIN) {
  const c = coverage();
  const dead = Object.entries(c).filter(([, v]) => v === 0).map(([k]) => k);
  console.log(JSON.stringify(c));
  console.log('never triggered:', dead.join(', ') || 'none', `(${ABILITIES.length} abilities)`);
}
