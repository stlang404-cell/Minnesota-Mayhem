/** Empire assets. Every level has explicit cost, income and upkeep; returns diminish by level. */
export interface AssetLevel { cost: number; income: number; upkeep: number; effect: string }
export interface AssetDef { id: string; name: string; icon: string; unlockRank: number; desc: string; levels: AssetLevel[] }

export const ASSETS: AssetDef[] = [
  { id: 'villa', name: 'Lakeside Villa', icon: 'villa', unlockRank: 0, desc: 'A warm hearth on the frozen shore. Modest, reliable rent.',
    levels: [
      { cost: 40000, income: 1200, upkeep: 200, effect: '+$10/day net' },
      { cost: 60000, income: 2000, upkeep: 400, effect: '+$16/day net' },
      { cost: 90000, income: 2600, upkeep: 600, effect: '+$20/day net' },
    ] },
  { id: 'library', name: "Augur's Library", icon: 'library', unlockRank: 1, desc: 'Scribes compile rival records: unlocks fair-price estimates, form guides and head-to-head data on the Exchange.',
    levels: [
      { cost: 35000, income: 0, upkeep: 300, effect: 'Exchange research: fair-value model & rival form' },
      { cost: 50000, income: 0, upkeep: 500, effect: 'Also shows the trader order flow by strategy' },
    ] },
  { id: 'club', name: 'Card Club of St. Paul', icon: 'club', unlockRank: 2, desc: 'Hosts Club Nights: an arena variant with a 25% richer Senate purse. Earns a little door money.',
    levels: [
      { cost: 90000, income: 1500, upkeep: 500, effect: 'Unlocks Club Night; +$10/day net' },
      { cost: 120000, income: 2400, upkeep: 800, effect: 'Club Night purse +40%; +$16/day net' },
    ] },
  { id: 'academy', name: 'Training Academy', icon: 'academy', unlockRank: 2, desc: 'Lanistae drill your Arsenal. Reduces all Forge costs.',
    levels: [
      { cost: 70000, income: 0, upkeep: 400, effect: 'Forge costs −10%' },
      { cost: 110000, income: 0, upkeep: 700, effect: 'Forge costs −18%' },
    ] },
  { id: 'arena', name: 'Tournament Arena', icon: 'arena', unlockRank: 3, desc: 'Your own colosseum. Earns gate receipts and hosts the Grand Games every 5th day (double purse).',
    levels: [
      { cost: 300000, income: 6000, upkeep: 2000, effect: '+$40/day net; Grand Games' },
      { cost: 400000, income: 8500, upkeep: 3000, effect: '+$55/day net' },
    ] },
  { id: 'sponsor', name: 'Sponsorship Office', icon: 'sponsor', unlockRank: 4, desc: 'Patrons offer contracts: bonus Dollars for finishing top 2 in your next arena match.',
    levels: [
      { cost: 150000, income: 0, upkeep: 800, effect: 'Sponsor bonus: 40% of entry for a top-2 finish' },
      { cost: 200000, income: 0, upkeep: 1200, effect: 'Sponsor bonus: 70% of entry for a top-2 finish' },
    ] },
  { id: 'estate', name: 'Imperial Estate', icon: 'estate', unlockRank: 5, desc: 'A palace above the Mississippi. Pure prestige: +Glory per victory and golden cosmetics.',
    levels: [
      { cost: 500000, income: 0, upkeep: 2500, effect: '+25% Glory; golden laurel title' },
    ] },
];
export const ASSET_MAP = Object.fromEntries(ASSETS.map(a => [a.id, a]));

export function dailyNet(levels: Record<string, number>): { income: number; upkeep: number } {
  let income = 0, upkeep = 0;
  for (const a of ASSETS) {
    const lv = levels[a.id] ?? 0;
    for (let k = 0; k < lv; k++) { income += a.levels[k].income; upkeep += a.levels[k].upkeep; }
  }
  return { income, upkeep };
}
export function totalInvested(levels: Record<string, number>): number {
  let s = 0;
  for (const a of ASSETS) for (let k = 0; k < (levels[a.id] ?? 0); k++) s += a.levels[k].cost;
  return s;
}
export const SELL_REFUND = 0.5;

export interface Cosmetic { id: string; name: string; kind: 'cardback' | 'felt' | 'title'; price: number; unlockRank: number; requires?: string }
export const COSMETICS: Cosmetic[] = [
  { id: 'back_crimson', name: 'Crimson Legion card back', kind: 'cardback', price: 0, unlockRank: 0 },
  { id: 'back_frost', name: 'Frostbitten card back', kind: 'cardback', price: 8000, unlockRank: 1 },
  { id: 'back_gold', name: 'Aureus card back', kind: 'cardback', price: 30000, unlockRank: 6 },
  { id: 'back_purple', name: 'Imperial Purple card back', kind: 'cardback', price: 20000, unlockRank: 4 },
  { id: 'felt_green', name: 'Forum Green felt', kind: 'felt', price: 0, unlockRank: 0 },
  { id: 'felt_snow', name: 'Snowdrift felt', kind: 'felt', price: 10000, unlockRank: 1 },
  { id: 'felt_marble', name: 'Marble Hall felt', kind: 'felt', price: 25000, unlockRank: 3 },
  { id: 'felt_gold', name: 'Golden Palatine felt', kind: 'felt', price: 60000, unlockRank: 7, requires: 'estate' },
  { id: 'title_wolf', name: 'Title: "Wolf of the North"', kind: 'title', price: 5000, unlockRank: 0 },
  { id: 'title_dictator', name: 'Title: "Dictator Perpetuo"', kind: 'title', price: 50000, unlockRank: 5 },
  { id: 'title_divine', name: 'Title: "Divi Filius"', kind: 'title', price: 100000, unlockRank: 8 },
];
