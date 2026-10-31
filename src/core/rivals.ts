import { ABILITIES, Archetype, ARCHETYPES } from './abilities';
import { AIProfile } from './ai';
import { LoadoutEntry } from './match';
import { EPITHETS, NOMINA, PRAENOMINA } from './names';
import { RANKS, ratingDeltas } from './ranks';
import { Rng } from './rng';

export interface Rival {
  id: string;
  name: string;
  portraitSeed: number;
  rank: number;
  rating: number;
  bankroll: number; // cents
  style: Archetype;
  profile: AIProfile;
  loadout: LoadoutEntry[];
  career: { matches: number; wins: number; top2: number; earnings: number; titles: number; trialWins: number };
  form: number[];           // last 10 placements (0 = 1st)
  rivalry: number;          // rivalry intensity with the player
  vsPlayer: { wins: number; losses: number };
  nemesis?: string;         // rival id that beats them most
  beatenBy: Record<string, number>;
  bio: string;
}

const STYLE_PROFILE: Record<Archetype, Partial<AIProfile>> = {
  bluff: { aggression: 0.65, bluff: 0.6, tightness: 0.35 },
  pressure: { aggression: 0.8, bluff: 0.35, tightness: 0.4, risk: 0.65 },
  discipline: { aggression: 0.35, bluff: 0.1, tightness: 0.8, risk: 0.3 },
  counterplay: { aggression: 0.45, bluff: 0.2, tightness: 0.55, adaptation: 0.8 },
  momentum: { aggression: 0.6, bluff: 0.3, tightness: 0.45, risk: 0.6 },
  economy: { aggression: 0.45, bluff: 0.2, tightness: 0.6, risk: 0.4 },
  comeback: { aggression: 0.5, bluff: 0.3, tightness: 0.5, risk: 0.75 },
  information: { aggression: 0.5, bluff: 0.25, tightness: 0.55, adaptation: 0.9 },
  tournament: { aggression: 0.55, bluff: 0.2, tightness: 0.6, risk: 0.45, adaptation: 0.6 },
  tactical: { aggression: 0.6, bluff: 0.35, tightness: 0.5, risk: 0.5, adaptation: 0.7 },
};

const clamp = (x: number) => Math.max(0.02, Math.min(0.98, x));

export function makeProfile(style: Archetype, rank: number, rng: Rng): AIProfile {
  const base = STYLE_PROFILE[style];
  const j = () => (rng.next() - 0.5) * 0.2;
  return {
    aggression: clamp((base.aggression ?? 0.5) + j()),
    bluff: clamp((base.bluff ?? 0.25) + j()),
    tightness: clamp((base.tightness ?? 0.5) + j()),
    risk: clamp((base.risk ?? 0.5) + j()),
    adaptation: clamp((base.adaptation ?? 0.45) + j() + rank * 0.03),
    skill: clamp(RANKS[rank].aiSkill + (rng.next() - 0.5) * 0.08),
  };
}

/** AI loadout: ~5 abilities of its style plus supporting picks, levels rising with rank. */
export function makeLoadout(style: Archetype, rank: number, rng: Rng): LoadoutEntry[] {
  const pool = ABILITIES.filter(a => !a.fusion && a.unlockRank <= Math.max(0, rank));
  const own = rng.shuffle(pool.filter(a => a.archetype === style));
  const other = rng.shuffle(pool.filter(a => a.archetype !== style));
  const picks = [...own.slice(0, Math.min(own.length, 3 + Math.floor(rank / 3))), ...other].slice(0, Math.min(8, 4 + Math.ceil(rank / 2)));
  return picks.map(a => ({ defId: a.id, level: Math.min(3, 1 + Math.floor((rank + rng.int(3)) / 3)) }));
}

export function makeRival(rng: Rng, idx: number, rank: number, used: Set<string>): Rival {
  let name = '';
  for (let k = 0; k < 20; k++) {
    name = `${rng.pick(PRAENOMINA)} ${rng.pick(NOMINA)}`;
    if (rng.chance(0.25)) name += ' ' + rng.pick(EPITHETS);
    if (!used.has(name)) break;
  }
  used.add(name);
  const style = rng.pick(ARCHETYPES).id;
  const r = RANKS[rank];
  const next = RANKS[rank + 1]?.threshold ?? r.threshold + 90;
  const sty = ARCHETYPES.find(a => a.id === style)!;
  return {
    id: `r${idx}`, name, portraitSeed: rng.nextU32(), rank,
    rating: Math.round(r.threshold + rng.next() * (next - r.threshold) * 0.8),
    bankroll: Math.round(r.entry * (12 + rng.next() * 20)), style,
    profile: makeProfile(style, rank, rng), loadout: makeLoadout(style, rank, rng),
    career: { matches: 0, wins: 0, top2: 0, earnings: 0, titles: 0, trialWins: 0 },
    form: [], rivalry: 0, vsPlayer: { wins: 0, losses: 0 }, beatenBy: {},
    bio: `${r.name} of the ${sty.name} school. ${sty.motto}`,
  };
}

export function makePopulation(rng: Rng, perRank = 13): Rival[] {
  const used = new Set<string>();
  const out: Rival[] = [];
  let idx = 0;
  RANKS.forEach((_, rank) => {
    const count = rank <= 1 ? perRank + 2 : perRank;
    for (let k = 0; k < count; k++) out.push(makeRival(rng, idx++, rank, used));
  });
  return out;
}

/** Strength used for summarised background matches and market priors. */
export function strength(r: Rival): number {
  return 10 ** (r.rating / 400) * (0.7 + 0.6 * r.profile.skill);
}

/** Plackett-Luce winner probabilities from strengths, softened (exponent 0.5) — calibrated by
 * log-loss against 500 fully simulated matches (see docs/BALANCE_REPORT.md). */
export function winProbabilities(rs: Rival[]): number[] {
  const s = rs.map(r => Math.sqrt(strength(r)));
  const tot = s.reduce((a, b) => a + b, 0);
  return s.map(x => x / tot);
}

export function samplePlacement(rs: Rival[], rng: Rng): number[] {
  // returns placement index per rival (0 = winner) via sequential Plackett-Luce
  const remaining = rs.map((r, i) => i);
  const s = rs.map(strength);
  const place = Array(rs.length).fill(0);
  let p = 0;
  while (remaining.length) {
    const tot = remaining.reduce((a, i) => a + s[i], 0);
    let x = rng.next() * tot;
    let k = 0;
    for (; k < remaining.length - 1; k++) { x -= s[remaining[k]]; if (x <= 0) break; }
    place[remaining[k]] = p++;
    remaining.splice(k, 1);
  }
  return place;
}

/** Record a finished match (real or summarised) into rival careers. */
export function recordRivalResult(rivals: Rival[], ids: string[], placement: number[], prizes: number[], entry: number, ratingsIn?: number[]) {
  const rs = ids.map(id => rivals.find(r => r.id === id));
  const ratings = ratingsIn ?? rs.map(r => r?.rating ?? 1000);
  const d = ratingDeltas(ratings, placement);
  rs.forEach((r, i) => {
    if (!r) return;
    r.career.matches++;
    if (placement[i] === 0) r.career.wins++;
    if (placement[i] <= 1) r.career.top2++;
    const prize = prizes[placement[i]] ?? 0;
    r.career.earnings += prize - entry;
    r.bankroll = Math.max(0, r.bankroll + prize - entry);
    r.rating = Math.max(RANKS[r.rank].threshold - 80, r.rating + d[i]);
    r.form.push(placement[i]); if (r.form.length > 10) r.form.shift();
    const winnerIdx = placement.indexOf(0);
    if (winnerIdx >= 0 && winnerIdx !== i && ids[winnerIdx] && !ids[winnerIdx].startsWith('player')) {
      r.beatenBy[ids[winnerIdx]] = (r.beatenBy[ids[winnerIdx]] ?? 0) + 1;
      const top = Object.entries(r.beatenBy).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2) r.nemesis = top[0];
    }
  });
}

/** Rivals promote/demote and slowly develop their Arsenal. */
export function evolveRivals(rivals: Rival[], rng: Rng): { id: string; name: string; rank: number; up: boolean }[] {
  const events: { id: string; name: string; rank: number; up: boolean }[] = [];
  for (const r of rivals) {
    const next = RANKS[r.rank + 1];
    if (next && r.rating >= next.threshold + 25) {
      r.rank++;
      r.career.trialWins++;
      r.profile.skill = Math.min(0.97, Math.max(r.profile.skill, RANKS[r.rank].aiSkill - 0.03));
      r.loadout = makeLoadout(r.style, r.rank, rng);
      events.push({ id: r.id, name: r.name, rank: r.rank, up: true });
    } else if (r.rank > 0 && r.rating < RANKS[r.rank].threshold - 70) {
      r.rank--;
      r.profile.skill = Math.max(0.15, r.profile.skill - 0.04);
      events.push({ id: r.id, name: r.name, rank: r.rank, up: false });
    }
    // experience: tiny skill growth, bounded by rank ceiling
    if (r.career.matches % 10 === 9) r.profile.skill = Math.min(RANKS[r.rank].aiSkill + 0.05, r.profile.skill + 0.01);
    // spend on upgrades
    if (r.bankroll > RANKS[r.rank].entry * 40) {
      const up = r.loadout.find(l => l.level < 3);
      if (up) { up.level++; r.bankroll -= RANKS[r.rank].entry * 5; }
    }
  }
  return events;
}

/** Keep each rank populated so the player always finds opponents. */
export function rebalancePopulation(rivals: Rival[], rng: Rng, target = 12, maxNew = 3) {
  const used = new Set(rivals.map(r => r.name));
  let added = 0;
  RANKS.forEach((_, rank) => {
    const n = rivals.filter(r => r.rank === rank).length;
    const want = n < 4 ? 4 : target;
    for (let k = n; k < want && (n + (k - n) < 4 || added < maxNew); k++, added++) {
      const idx = rivals.reduce((m, r) => Math.max(m, parseInt(r.id.slice(1), 10)), 0) + 1;
      rivals.push(makeRival(rng, idx, rank, used));
    }
  });
}

export function pickOpponents(rivals: Rival[], rank: number, rng: Rng, n = 3, exclude: string[] = []): Rival[] {
  const near = rivals.filter(r => !exclude.includes(r.id) && Math.abs(r.rank - rank) <= 0);
  const wider = rivals.filter(r => !exclude.includes(r.id) && Math.abs(r.rank - rank) === 1);
  const pool = rng.shuffle([...near]);
  const pick: Rival[] = [];
  // prefer a rival with high rivalry intensity for drama
  const nem = pool.filter(r => r.rivalry >= 3).sort((a, b) => b.rivalry - a.rivalry)[0];
  if (nem && rng.chance(0.5)) pick.push(nem);
  for (const r of pool) { if (pick.length >= n) break; if (!pick.includes(r)) pick.push(r); }
  const w = rng.shuffle([...wider]);
  for (const r of w) { if (pick.length >= n) break; if (!pick.includes(r)) pick.push(r); }
  return pick.slice(0, n);
}
