# Fathom — sim report

- Seed: `42`
- Voyage length: 6 rounds
- Matches: 240 (requested 240)
- Result: **RED**

## Assertions

| Assertion | Result | Detail |
|---|---|---|
| Match length | ✅ | median 28 plies (band 18–34) |
| Draft symmetry / first player | ✅ | first player wins 49.6% (band 47–53%) |
| Card usage: twin_shot | ✅ | 19.7% of draftable plays where drafted (band 3–40%), n=343 |
| Card usage: line_probe | ✅ | 29.7% of draftable plays where drafted (band 3–40%), n=296 |
| Card usage: depth_charge | ✅ | 9.5% of draftable plays where drafted (band 3–40%), n=370 |
| Card usage: scatter | ✅ | 17.5% of draftable plays where drafted (band 3–40%), n=333 |
| Card usage: buoy | ✅ | 23.9% of draftable plays where drafted (band 3–40%), n=118 |
| Card usage: ballast | ✅ | 17.9% of draftable plays where drafted (band 3–40%), n=205 |
| Card usage: cross_salvo | ✅ | 12.3% of draftable plays where drafted (band 3–40%), n=186 |
| Card usage: sonar_sweep | ✅ | 26.3% of draftable plays where drafted (band 3–40%), n=204 |
| Card usage: torpedo | ✅ | 6.1% of draftable plays where drafted (band 3–40%), n=164 |
| Card usage: barrage | ✅ | 7.0% of draftable plays where drafted (band 3–40%), n=160 |
| Card usage: decoy | ❌ | 1.3% of draftable plays where drafted (band 3–40%), n=40 |
| Card usage: repair | ✅ | 14.2% of draftable plays where drafted (band 3–40%), n=88 |
| Card usage: satellite | ✅ | 19.2% of draftable plays where drafted (band 3–40%), n=80 |
| Card usage: saturation | ❌ | 1.1% of draftable plays where drafted (band 3–40%), n=75 |
| Card usage: wolfpack | ❌ | 1.3% of draftable plays where drafted (band 3–40%), n=66 |
| Card usage: dredge | ❌ | 1.9% of draftable plays where drafted (band 3–40%), n=35 |
| Ship win rate: skiff | ✅ | 55.1% (max 60%), n=323 |
| Ship win rate: cutter | ✅ | 50.9% (max 60%), n=171 |
| Ship win rate: reefrunner | ✅ | 51.5% (max 60%), n=204 |
| Ship win rate: tender | ✅ | 55.5% (max 60%), n=348 |
| Ship win rate: frigate | ✅ | 50.3% (max 60%), n=298 |
| Ship win rate: minelayer | ✅ | 44.6% (max 60%), n=242 |
| Ship win rate: sonarship | ✅ | 48.5% (max 60%), n=330 |
| Ship win rate: carrier | ✅ | 48.2% (max 60%), n=282 |
| Ship win rate: dreadnought | ✅ | 48.5% (max 60%), n=379 |
| Ship win rate: leviathan | ✅ | 48.6% (max 60%), n=319 |
| Endgame drag | ✅ | median 5 plies from last-ship to match over (max 6) |
| Profile sufficiency | ✅ | median 8 shots to sink the final ship (max 12) |
| No stalemates | ❌ | 4 stalemates, longest match 150 plies (cap 120) |
| Card diversity | ✅ | median 5 distinct cards played per match by full-tray players (min 4), n=400 |
| Economy shape: spend | ✅ | median 4.31 energy spent per turn (band 2–5) |
| Economy shape: bank | ✅ | median peak bank 5 (max 14) |
| Snowball check | ✅ | first-hit player wins 58.9% (max 62%), n=236 |
| Burn integrity | ✅ | 0 burned-card leaks in client-visible draft state |

## Match length by round

| Round | Median plies |
|---|---|
| 1 | 13 |
| 2 | 19 |
| 3 | 31.5 |
| 4 | 30 |
| 5 | 47 |
| 6 | 39 |

## Cards

_Usage share = a card's plays as a fraction of all draftable-card plays by players who drafted it (basic salvo excluded)._

| Card | Tier | Drafted in | Plays | Usage share |
|---|---|---|---|---|
| Twin Shot | T1 | 343 | 906 | 19.7% |
| Line Probe | T1 | 296 | 1149 | 29.7% |
| Depth Charge | T1 | 370 | 434 | 9.5% |
| Scatter | T1 | 333 | 710 | 17.5% |
| Buoy | T1 | 118 | 391 | 23.9% |
| Ballast | T1 | 205 | 502 | 17.9% |
| Cross Salvo | T2 | 186 | 323 | 12.3% |
| Sonar Sweep | T2 | 204 | 817 | 26.3% |
| Torpedo | T2 | 164 | 139 | 6.1% |
| Barrage | T2 | 160 | 156 | 7.0% |
| Decoy | T2 | 40 | 7 | 1.3% |
| Repair | T2 | 88 | 202 | 14.2% |
| Satellite | T3 | 80 | 225 | 19.2% |
| Saturation Fire | T3 | 75 | 13 | 1.1% |
| Wolfpack | T3 | 66 | 14 | 1.3% |
| EMP Burst | T3 | 20 | 7 | 2.0% |
| Dredge | T3 | 35 | 8 | 1.9% |
| Blockade | T3 | 6 | 3 | 2.8% |

## Ships

| Ship | Size | Drafted in | Wins | Win rate |
|---|---|---|---|---|
| Skiff | 1 | 323 | 178 | 55.1% |
| Cutter | 2 | 171 | 87 | 50.9% |
| Reefrunner | 2 | 204 | 105 | 51.5% |
| Tender | 3 | 348 | 193 | 55.5% |
| Frigate | 3 | 298 | 150 | 50.3% |
| Minelayer | 3 | 242 | 108 | 44.6% |
| Array Ship | 4 | 330 | 160 | 48.5% |
| Carrier | 4 | 282 | 136 | 48.2% |
| Dreadnought | 5 | 379 | 184 | 48.5% |
| Leviathan | 5 | 319 | 155 | 48.6% |

## Terrain modifiers

_Detection win rate = win rate of the player who drafted more detection cards, in matches under that modifier._

| Modifier | Matches | Detection-skewed | Detection win rate |
|---|---|---|---|
| Spring Tide | 17 | 12 | 50.0% |
| Burn-Off | 15 | 13 | 46.2% |
| Rolling Fog | 16 | 9 | 44.4% |
| Silted Up | 14 | 10 | 40.0% |
| Deep Water | 15 | 12 | 50.0% |
| Undertow | 13 | 7 | 57.1% |
| Breakers | 9 | 7 | 57.1% |
| Coral Growth | 18 | 13 | 46.2% |
| Sharp Shoals | 18 | 15 | 66.7% |
| Murky Water | 12 | 6 | 50.0% |
| Clear Water | 14 | 13 | 46.2% |
| Ebb Tide | 24 | 14 | 50.0% |
| Salvage Rights | 9 | 4 | 25.0% |
| Flotsam | 13 | 6 | 16.7% |
| Strong Current | 16 | 13 | 38.5% |
| False Lights | 17 | 12 | 41.7% |

_First-player win rate: 49.6%. Endgame drag median: 5. Shots-to-final-ship median: 8. Longest match: 150 plies. Burn leaks: 0._
