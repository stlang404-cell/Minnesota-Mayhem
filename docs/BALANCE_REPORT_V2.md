# Minnesota Mayhem 2.0 (Imperial Ascension) — Balance Report
Generated 2026-10-31T22:03:13.611Z by `npm run balance` (seeded, reproducible).

## 1. Match duration & archetype win rates (AI-only, 4 archetypes per table)
Matches simulated: 720. Hands per match: mean 37.3, median 38, p10 28, p90 45, max 56.
Estimated human duration at 4.5s/hand: median 2.9 min (p10 2.1, p90 3.4). Target 3–6 min.
Hand-cap finishes: 0 (the documented chip-count safety rule).

Identical AI personalities; only the 5-ability archetype loadout differs (10 archetypes, 4 drawn per table). Fair share = 25%.

| Archetype | Peasant tier | Centurion tier | Imperator tier |
|---|---|---|---|
| Bluff | 20.2% (n=89) | 27.0% (n=111) | 23.2% (n=99) |
| Pressure | 30.8% (n=104) | 22.5% (n=89) | 25.9% (n=108) |
| Discipline | 25.2% (n=103) | 26.1% (n=92) | 36.5% (n=96) |
| Counterplay | 22.1% (n=95) | 20.4% (n=98) | 28.7% (n=80) |
| Momentum | 21.8% (n=87) | 24.2% (n=95) | 18.9% (n=95) |
| Economy | 25.0% (n=96) | 23.4% (n=94) | 25.3% (n=99) |
| Comeback | 33.7% (n=101) | 30.9% (n=97) | 25.8% (n=97) |
| Information | 23.1% (n=104) | 18.2% (n=88) | 21.4% (n=103) |
| Tournament | 21.4% (n=84) | 33.0% (n=94) | 24.7% (n=77) |
| Tactical | 24.7% (n=97) | 23.5% (n=102) | 20.8% (n=106) |

⚠ Archetypes above 36%: Discipline@Imperator

## 2. Career progression (simulated competent player, full game rules)
The "player" is driven by the same AI decision engine (skill 0.7, balanced profile) and uses arena / trial / recovery choices automatically. It buys one new ability every few matches and a Villa once affordable.

Careers: 6 × 140 matches.

| Rank | Careers reaching it | Median matches to reach |
|---|---|---|
| Peasant | 6/6 | 0 |
| Plebeian | 6/6 | 15 |
| Gladiator | 6/6 | 36 |
| Centurion | 6/6 | 57 |
| Praetor | 6/6 | 81 |
| Consul | 6/6 | 116 |
| Imperator | 4/6 | 90 |
| Caesar | 3/6 | 103 |
| Augustus | 2/6 | 125 |

Final ranks after 140 matches: Augustus, Augustus, Consul, Caesar, Imperator, Consul.
Promotion trials: 39/71 passed (55%).
Bankroll (median across careers) after 10/40/80/140 matches: $479.46 / $973.90 / $4168.32 / $18174.84.
Low-bankroll episodes: 0; recovery matches played: 0; episodes fully recovered: 0.

## 3. Bankruptcy & recovery (deliberately weak player)
Scenario: a timid, low-skill player who has fallen to $10 (below the $20 entry). Went broke in 5 episodes across 4 careers × 60 matches; a playable match was available every single time (never stuck).
Recovery matches needed to afford a ranked entry again: median 1, max 1.

## 4. Arena Exchange profitability
Each strategy buys 20 contracts pre-match in each of 150 markets (fees included).

| Strategy | Markets traded | Total P/L | P/L per market | Win % |
|---|---|---|---|---|
| Always buy the favourite | 150 | $-265.79 | $-1.77 | 21% |
| Always buy the longshot | 150 | $227.05 | $1.51 | 29% |
| Random outcome | 150 | $-96.17 | $-0.64 | 23% |
| Fair-value edge (Library model, only if edge > 4¢) | 4 | $-18.63 | $-4.66 | 0% |

Market maker (per market, incl. simulated traders): mean net $-109.03, worst $-182.51; LMSR loss-bound violations: 0. Cancelled (withdrawal) markets refunded: 32.
Fees (2%) and house-favouring rounding make naive strategies lose slowly; research-driven trading can profit only when the crowd misprices. There is no guaranteed-profit loop.

## 6. AI benchmark (AI 2.0 vs Version 1 AI and baseline strategies)
Two seats of each policy per table (seats alternate), no Arsenal, identical personality parameters. Win share = wins ÷ total wins of the two policies.

| Opponent policy | Matches | AI 2.0 win share | AI 2.0 avg place | Opponent avg place | AI 2.0 postflop bets+raises per decision | CPU ms / decision |
|---|---|---|---|---|---|---|
| Version 1 AI | 400 | 56.0% | 2.47 | 2.53 | 0.080 | 0.16 |
| station | 150 | 92.0% | 1.70 | 3.30 | 0.123 | 0.14 |
| rock | 150 | 91.3% | 2.29 | 2.71 | 0.084 | 0.15 |
| maniac | 150 | 67.3% | 1.93 | 3.07 | 0.089 | 0.14 |
| random | 150 | 82.0% | 1.98 | 3.02 | 0.106 | 0.14 |

Exploitability indicator: a policy that cannot be exploited by simple fixed strategies should beat all of them; AI 2.0 must also beat Version 1 to justify the upgrade.

## 7. Combo & fusion strength (one build vs three random archetype builds)
Fair share = 25%. n = 200 matches per build, seats rotated, opponents draw 5-ability archetype builds at level 2.

| Build | Win rate | Avg place |
|---|---|---|
| Imperial Conspiracy | 24.0% | 2.44 |
| Golden Legion | 28.0% | 2.37 |
| Frozen Empire | 24.5% | 2.39 |
| Senate Collapse | 24.5% | 2.44 |
| Caesar's Ascension (Ides of March + Wrath of Mars) | 27.5% | 2.38 |
| Iron Executioner (fusion) | 25.0% | 2.44 |
| Eternal Flame (fusion) | 30.5% | 2.34 |
| Phantom Tempo (fusion) | 27.0% | 2.33 |
| Oracle's Ledger (fusion) | 26.5% | 2.40 |
| No abilities (control) | 27.5% | 2.40 |

No combo or fusion exceeds 36% against three full archetype builds.

## 8. Exchange calibration & simulated trader profitability
Markets settled: 113. Brier score of the pre-match market price (lower is better; uninformed 4-way = 0.750, uninformed binary = 0.500):
* Match Winner: 0.752 (n=113)
* First Elimination: 0.750 (n=113)
* Long Match O/U 40.5: 0.495 (n=113)
* Match Winner priced live after hand 20: 0.717 (n=112) — public chip counts make live prices far more informative than pre-match ratings.

| Trader strategy | Bot-markets | Total P/L | P/L per market |
|---|---|---|---|
| conservative | 113 | $1430.78 | $12.66 |
| contrarian | 113 | $1304.93 | $11.55 |
| fundamental | 226 | $5727.23 | $25.34 |
| informed | 113 | $2766.11 | $24.48 |
| momentum | 226 | $-4025.50 | $-17.81 |
| noise | 113 | $132.18 | $1.17 |
| speculative | 113 | $2123.19 | $18.79 |
| whale | 113 | $4328.54 | $38.31 |

## 9. Mode economics (simulated competent player at Gladiator, 25 runs each)
| Mode | Avg net $ per run | Avg hands per match | Notes |
|---|---|---|---|
| arena | $15.86 | 39.2 | baseline |
| quick | $10.97 | 22.7 | half stakes, short stacks |
| highroller | $64.13 | 39.3 | 4× entry, sharper rivals |
| draft | $27.80 | 39.0 | temporary level-2 Arsenal |
| rival | $58.97 | 40.1 | bounty for beating the rival |
| gauntlet | $48.24 | 38.8 | cash out at stage 2 policy |
| tournament | $-28.44 | 39.6 | 16 players, heats + final |

## 10. Long-run world stability (200 simulated days, no player matches)
Rivals 121 → 135; total rival bankroll $312134.26 → $478754.70 (53.4%); mean rating 1375 → 1400; retirements 3; seasons closed 13; news items kept 120; save size 181 KB; 122 ms for 200 days.

## 11. Version 1 → Version 2 comparison
V1 figures are copied from `docs/BALANCE_REPORT_V1.md` (generated before this update); V2 figures from this report.

| Metric | Version 1 | Version 2 |
|---|---|---|
| Abilities / archetypes / fusions | 44 / 8 / 4 | 76 / 10 / 8 (+5 named combos) |
| Game modes | Ranked, Trial, Recovery, Club, Grand | + Quick Clash, High Roller, Draft, Gauntlet, Rival Challenge, Daily, Imperial Tournament |
| Rival population | 58 static (rebalanced to ≥4/rank) | ~120 with retirement, bankruptcy and rookies |
| Exchange books per match | 1 (winner) | 3 (winner, first elimination, long match) |
| Simulated trader strategies | 5 | 8 |
| Automated tests | 56 | see TEST_RESULTS.txt |

## 5. Property payback
| Asset | Level | Cost | Net/day | Payback (days = arena matches) |
|---|---|---|---|---|
| Lakeside Villa | 1 | $400.00 | $10.00 | 40 |
| Lakeside Villa | 2 | $600.00 | $16.00 | 38 |
| Lakeside Villa | 3 | $900.00 | $20.00 | 45 |
| Augur's Library | 1 | $350.00 | $-3.00 | utility (no income) |
| Augur's Library | 2 | $500.00 | $-5.00 | utility (no income) |
| Augur's Library | 3 | $800.00 | $-8.00 | utility (no income) |
| Card Club of St. Paul | 1 | $900.00 | $10.00 | 90 |
| Card Club of St. Paul | 2 | $1200.00 | $16.00 | 75 |
| Training Academy | 1 | $700.00 | $-4.00 | utility (no income) |
| Training Academy | 2 | $1100.00 | $-7.00 | utility (no income) |
| Tournament Arena | 1 | $3000.00 | $40.00 | 75 |
| Tournament Arena | 2 | $4000.00 | $55.00 | 73 |
| Sponsorship Office | 1 | $1500.00 | $-8.00 | utility (no income) |
| Sponsorship Office | 2 | $2000.00 | $-12.00 | utility (no income) |
| Imperial Estate | 1 | $5000.00 | $-25.00 | utility (no income) |
| Palace of the North Star | 1 | $2500.00 | $5.00 | 500 |
| Palace of the North Star | 2 | $3500.00 | $10.00 | 350 |

Maximum combined passive income with every asset fully developed: $110.00/day net, versus a $300 Augustus entry and $1,200 High Roller entry — property supplements but never replaces playing. Payback periods lengthen with each level (diminishing returns).

_Total harness runtime: 211s._
