# Minnesota Mayhem 3.0 (The Eternal Empire) — Balance Report
Generated 2026-11-01T00:10:35.668Z by `npm run balance` (seeded, reproducible).

## 1. Match duration & archetype win rates (AI-only, 4 archetypes per table)
Matches simulated: 720. Hands per match: mean 39.7, median 41, p10 32, p90 46, max 56.
Estimated human duration at 4.5s/hand: median 3.1 min (p10 2.4, p90 3.5). Target 3–6 min.
Hand-cap finishes: 0 (the documented chip-count safety rule).

Identical AI personalities; only the 5-ability archetype loadout differs (10 archetypes, 4 drawn per table). Fair share = 25%.

| Archetype | Peasant tier | Centurion tier | Imperator tier |
|---|---|---|---|
| Bluff | 25.8% (n=89) | 26.1% (n=111) | 24.2% (n=99) |
| Pressure | 21.2% (n=104) | 21.3% (n=89) | 30.6% (n=108) |
| Discipline | 29.1% (n=103) | 26.1% (n=92) | 37.5% (n=96) |
| Counterplay | 28.4% (n=95) | 27.6% (n=98) | 27.5% (n=80) |
| Momentum | 27.6% (n=87) | 22.1% (n=95) | 18.9% (n=95) |
| Economy | 22.9% (n=96) | 25.5% (n=94) | 21.2% (n=99) |
| Comeback | 26.7% (n=101) | 29.9% (n=97) | 30.9% (n=97) |
| Information | 21.2% (n=104) | 17.0% (n=88) | 21.4% (n=103) |
| Tournament | 17.9% (n=84) | 27.7% (n=94) | 19.5% (n=77) |
| Tactical | 28.9% (n=97) | 25.5% (n=102) | 17.9% (n=106) |

⚠ Archetypes above 36%: Discipline@Imperator

_Section 1 re-run after Discipline tuning (Frozen Legion L3 0.40→0.33, Fortress Wall L3 0.45→0.38 and 3→2 uses, Iron Discipline L3 needs 3 folds). Fresh-seed checks (seed offsets 50000 and 90000, before the final Fortress Wall change) showed Discipline@Imperator at 37.3% and 39.8%: a real but moderate top-tier strength; Discipline is 25–29% at the other tiers._

## 2. Career progression (simulated competent player, full game rules)
The "player" is driven by the same AI decision engine (skill 0.7, balanced profile) and uses arena / trial / recovery choices automatically. It buys one new ability every few matches and a Villa once affordable.

Careers: 6 × 140 matches.

| Rank | Careers reaching it | Median matches to reach |
|---|---|---|
| Peasant | 6/6 | 0 |
| Plebeian | 6/6 | 15 |
| Gladiator | 6/6 | 43 |
| Centurion | 6/6 | 67 |
| Praetor | 6/6 | 71 |
| Consul | 3/6 | 72 |
| Imperator | 3/6 | 100 |
| Caesar | 1/6 | 112 |
| Augustus | 1/6 | 118 |

Final ranks after 140 matches: Augustus, Praetor, Imperator, Praetor, Imperator, Praetor.
Promotion trials: 32/54 passed (59%).
Bankroll (median across careers) after 10/40/80/140 matches: $450.48 / $535.00 / $2899.15 / $6673.09.
Low-bankroll episodes: 0; recovery matches played: 0; episodes fully recovered: 0.

## 3. Bankruptcy & recovery (deliberately weak player)
Scenario: a timid, low-skill player who has fallen to $10 (below the $20 entry). Went broke in 5 episodes across 4 careers × 60 matches; a playable match was available every single time (never stuck).
Recovery matches needed to afford a ranked entry again: median 1, max 2.

## 4. Arena Exchange profitability
Each strategy buys 20 contracts pre-match in each of 150 markets (fees included).

| Strategy | Markets traded | Total P/L | P/L per market | Win % |
|---|---|---|---|---|
| Always buy the favourite | 150 | $-149.84 | $-1.00 | 24% |
| Always buy the longshot | 150 | $-107.50 | $-0.72 | 21% |
| Random outcome | 150 | $-79.61 | $-0.53 | 24% |
| Fair-value edge (Library model, only if edge > 4¢) | 4 | $2.02 | $0.51 | 25% |

Market maker (per market, incl. simulated traders): mean net $-99.76, worst $-160.44; LMSR loss-bound violations: 0. Cancelled (withdrawal) markets refunded: 16.
Fees (2%) and house-favouring rounding make naive strategies lose slowly; research-driven trading can profit only when the crowd misprices. There is no guaranteed-profit loop.

## 6. AI benchmark (AI 3.0 vs AI 2.0, Version 1 and baselines; 95% confidence intervals)
Two seats of each policy per table (seats alternate), no Arsenal, identical personality parameters. "Memory" carries each seat's public reputation (incl. bet-size memory) across matches. Win share = wins ÷ (wins of both policies).

| Matchup | Matches | AI 3.0 win share [95% CI] | AI 3.0 avg place | Opponent avg place | CPU ms / decision |
|---|---|---|---|---|---|
| AI 2.0 (with memory) | 800 | 54.4% [50.9, 57.8] | 2.474 | 2.526 | 0.16 |
| AI 2.0 (no memory) | 800 | 58.0% [54.6, 61.4] | 2.449 | 2.551 | 0.16 |
| Version 1 AI | 400 | 64.5% [59.8, 69.2] | 2.442 | 2.558 | 0.16 |
| station | 150 | 94.7% [91.1, 98.3] | 1.657 | 3.343 | 0.15 |
| rock | 150 | 92.0% [87.7, 96.3] | 2.290 | 2.710 | 0.16 |
| maniac | 150 | 73.3% [66.3, 80.4] | 1.880 | 3.120 | 0.16 |
| random | 150 | 89.3% [84.4, 94.3] | 1.913 | 3.087 | 0.15 |
| Null test: AI 2.0 vs itself (memory) | 800 | 51.7% [48.3, 55.2] | 2.467 | 2.533 | — |

Interpretation: an improvement is claimed only when the 95% interval excludes 50%. The null test shows the harness's own noise.

## 7. Combo & fusion strength (one build vs three random archetype builds)
Fair share = 25%. n = 200 matches per build, seats rotated, opponents draw 5-ability archetype builds at level 2.

| Build | Win rate | Avg place |
|---|---|---|
| Imperial Conspiracy | 23.5% | 2.48 |
| Golden Legion | 26.5% | 2.52 |
| Frozen Empire | 30.5% | 2.23 |
| Senate Collapse | 26.5% | 2.47 |
| Emperor's Gambit | 24.5% | 2.50 |
| Legion's Vow | 25.0% | 2.46 |
| Golden Cabal | 22.5% | 2.52 |
| Frozen Throne | 23.5% | 2.49 |
| Senate Overturned | 23.0% | 2.48 |
| Caesar's Ascension (Ides of March + Wrath of Mars) | 29.5% | 2.37 |
| Iron Executioner (fusion) | 26.5% | 2.47 |
| Eternal Flame (fusion) | 24.0% | 2.49 |
| Phantom Tempo (fusion) | 22.5% | 2.48 |
| Oracle's Ledger (fusion) | 24.5% | 2.46 |
| No abilities (control) | 22.5% | 2.52 |

No combo or fusion exceeds 36% against three full archetype builds.

## 8. Exchange calibration & simulated trader profitability
Markets settled: 116. Brier score of the pre-match market price (lower is better; uninformed 4-way = 0.750, uninformed binary = 0.500):
* Match Winner: 0.762 (n=116)
* First Elimination: 0.751 (n=116)
* Long Match O/U 40.5: 0.500 (n=116)
* Match Winner priced live after hand 20: 0.678 (n=114) — public chip counts make live prices far more informative than pre-match ratings.

| Trader strategy | Bot-markets | Total P/L | P/L per market |
|---|---|---|---|
| conservative | 116 | $2201.36 | $18.98 |
| contrarian | 116 | $1348.77 | $11.63 |
| fundamental | 232 | $4133.29 | $17.82 |
| informed | 116 | $3523.41 | $30.37 |
| momentum | 232 | $-2594.97 | $-11.19 |
| noise | 116 | $82.62 | $0.71 |
| speculative | 116 | $2589.94 | $22.33 |
| whale | 116 | $3359.59 | $28.96 |

## 9. Mode economics (simulated competent player at Gladiator, 25 runs each)
| Mode | Avg net $ per run | Avg hands per match | Notes |
|---|---|---|---|
| arena | $6.30 | 41.5 | baseline |
| quick | $7.06 | 20.0 | half stakes, short stacks |
| highroller | $127.98 | 42.2 | 4× entry, sharper rivals |
| draft | $25.83 | 42.9 | temporary level-2 Arsenal |
| rival | $53.84 | 42.8 | bounty for beating the rival |
| gauntlet | $-3.60 | 42.2 | cash out at stage 2 policy |
| tournament | $8.50 | 42.7 | 16 players, heats + final |

## 10. Long-run world stability (200 simulated days, no player matches)
Rivals 121 → 136; total rival bankroll $323960.92 → $447611.26 (38.2%); mean rating 1377 → 1389; retirements 4; seasons closed 13; news items kept 120; save size 723 KB; 15177 ms for 200 days.

## 11. Version 2 → Version 3 comparison
V2 figures from `docs/BALANCE_REPORT_V2.md` (archived before this update); V3 from this report and the code.

| Metric | Version 2 | Version 3 |
|---|---|---|
| Abilities / archetypes / legendary fusions / named combos | 76 / 10 / 8 / 5 | 122 / 10 / 16 / 10 (declarative rule engine) |
| Competitive structure | 8 modes, points-only seasons | + Imperial Circuit (6 event tiers, calendar) and real seasonal playoffs (top 16 + wildcard → Grand Championship) |
| AI | AI 2.0 | AI 3.0 (bet-size memory, push/fold vs ranges, stack discipline) — see §6 for CIs |
| Exchange | 3 match books | + 16-outcome tournament champion markets, limit orders, recalibrated priors (see MARKET_CALIBRATION.md) |
| Dynasty | properties | + sponsorship contracts, Championship Venue with hosting fees & focus |
| Save schema | 4 | 5 (migrations from 3 and 4, tested on archived fixtures) |

## 12. Investigation: Imperial Tournament expected value (V2 reported −$28.44 over 25 runs)
**Mathematics.** Entry E (2× rank entry); pool = 16E + 2E purse = 18E. Payouts: final table 40/22/13/9% (84%) + four heat runners-up × 4% (16%) = 100% of the pool — verified in code (`TOURNAMENT_SPLIT`, `TOURNAMENT_RUNNER_UP`) and by the ledger test. An entrant of exactly average skill therefore expects 18E/16 = **1.125E back for an E entry: +12.5% of entry**. Variance is very high: 84% of the pool goes to 4 of 16 players.
**Simulation.** 400 runs, simulated player at Gladiator (same AI engine as rivals, skill 0.7), entry $90.00: mean net $32.84 per run, 95% CI [$13.91, $51.76], standard deviation $193.08; cashed in 103/400 runs (26%). Theoretical average-skill expectation: +$11.25.

**Conclusion.** The tournament is profitable on average for this player; the V2 negative mean was small-sample noise. The payout table was therefore left unchanged — risk and loss remain meaningful.

## 13. Imperial Circuit, sponsorship and venue economics (120 simulated days)
Events completed: 80 (regional 24, invitational 5, local 32, qualifier 8, grand 7, highroller 2, revenge 2); total prize pools $134460.00; seasons with a crowned Grand Champion: 7.
Sponsorships: 12 contracts (one every 10 days), upfront paid $2415.60, revenue share received $2273.73 → net $-141.87 (-6% return). Sponsorship money moves between player and rival; nothing is created.
Championship Venue (level 2, profit focus): hosting fees $5893.20 over 120 days (ledger window may truncate very old lines) vs $1920.00 upkeep and $3200.00 purchase cost.
Simulation cost: 15673 ms for 120 days including every AI-only circuit event (131 ms/day).

## 14. Performance profile
* Full AI-only match (full Monte-Carlo AI, default iterations): 65 ms on this machine.
* World day (background bouts + rival evolution + circuit events + markets): 77 ms average over 300 days.
* Save size growth (bounded histories): day 100: 566 KB, day 200: 587 KB, day 300: 611 KB.
* Heap after 300 simulated days: 59 MB (Δ -9 MB, includes GC noise). Rivals: 135; news kept: 120; circuit events kept: 28.

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
| Championship Venue | 1 | $1200.00 | $-6.00 | utility (no income) |
| Championship Venue | 2 | $2000.00 | $-10.00 | utility (no income) |
| Championship Venue | 3 | $3200.00 | $-16.00 | utility (no income) |
| Palace of the North Star | 1 | $2500.00 | $5.00 | 500 |
| Palace of the North Star | 2 | $3500.00 | $10.00 | 350 |

Maximum combined passive income with every asset fully developed: $78.00/day net, versus a $300 Augustus entry and $1,200 High Roller entry — property supplements but never replaces playing. Payback periods lengthen with each level (diminishing returns).

_Total harness runtime: 627s._
