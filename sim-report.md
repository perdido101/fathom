# Fathom — sim report

- Seed: `42`
- Voyage length: 6 rounds
- Matches: 1998 (requested 2000)
- Result: **RED**

## Assertions

| Assertion | Result | Detail |
|---|---|---|
| Match length | ✅ | median 22 plies (band 18–34) |
| Draft symmetry / first player | ✅ | first player wins 49.8% (band 47–53%) |
| Card usage: twin_shot | ✅ | 20.6% of draftable plays where drafted (band 3–40%), n=3037 |
| Card usage: line_probe | ✅ | 29.8% of draftable plays where drafted (band 3–40%), n=2491 |
| Card usage: depth_charge | ✅ | 8.3% of draftable plays where drafted (band 3–40%), n=3065 |
| Card usage: scatter | ✅ | 13.0% of draftable plays where drafted (band 3–40%), n=2721 |
| Card usage: buoy | ✅ | 18.3% of draftable plays where drafted (band 3–40%), n=982 |
| Card usage: ballast | ✅ | 11.4% of draftable plays where drafted (band 3–40%), n=1604 |
| Card usage: cross_salvo | ✅ | 8.9% of draftable plays where drafted (band 3–40%), n=1537 |
| Card usage: sonar_sweep | ✅ | 33.8% of draftable plays where drafted (band 3–40%), n=1535 |
| Card usage: torpedo | ✅ | 4.1% of draftable plays where drafted (band 3–40%), n=1427 |
| Card usage: barrage | ✅ | 6.4% of draftable plays where drafted (band 3–40%), n=1307 |
| Card usage: decoy | ✅ | 11.2% of draftable plays where drafted (band 3–40%), n=418 |
| Card usage: repair | ✅ | 15.7% of draftable plays where drafted (band 3–40%), n=768 |
| Card usage: satellite | ✅ | 32.4% of draftable plays where drafted (band 3–40%), n=695 |
| Card usage: saturation | ✅ | 5.3% of draftable plays where drafted (band 3–40%), n=646 |
| Card usage: wolfpack | ✅ | 5.5% of draftable plays where drafted (band 3–40%), n=561 |
| Card usage: emp | ✅ | 8.4% of draftable plays where drafted (band 3–40%), n=229 |
| Card usage: dredge | ✅ | 6.7% of draftable plays where drafted (band 3–40%), n=234 |
| Card usage: blockade | ✅ | 21.4% of draftable plays where drafted (band 3–40%), n=66 |
| Ship win rate: skiff | ✅ | 50.1% (max 60%), n=2606 |
| Ship win rate: cutter | ✅ | 47.3% (max 60%), n=1381 |
| Ship win rate: reefrunner | ✅ | 49.9% (max 60%), n=1794 |
| Ship win rate: tender | ✅ | 54.9% (max 60%), n=2830 |
| Ship win rate: frigate | ✅ | 53.1% (max 60%), n=2387 |
| Ship win rate: minelayer | ✅ | 48.8% (max 60%), n=2076 |
| Ship win rate: sonarship | ✅ | 49.2% (max 60%), n=2537 |
| Ship win rate: carrier | ✅ | 50.2% (max 60%), n=2451 |
| Ship win rate: dreadnought | ✅ | 47.2% (max 60%), n=3163 |
| Ship win rate: leviathan | ✅ | 48.8% (max 60%), n=2737 |
| Endgame drag | ✅ | median 4 plies from last-ship to match over (max 6) |
| Profile sufficiency | ✅ | median 5 shots to sink the final ship (max 12) |
| No stalemates | ❌ | 0 stalemates, longest match 137 plies (cap 120) |
| Card diversity | ✅ | median 5 distinct cards played per match by full-tray players (min 4), n=3330 |
| Economy shape: spend | ✅ | median 4.85 energy spent per turn (band 2–5) |
| Economy shape: bank | ✅ | median peak bank 5 (max 14) |
| Snowball check | ✅ | first-hit player wins 57.6% (max 62%), n=1998 |
| Burn integrity | ✅ | 0 burned-card leaks in client-visible draft state |

## Match length by round

| Round | Median plies |
|---|---|
| 1 | 13 |
| 2 | 18 |
| 3 | 28 |
| 4 | 28 |
| 5 | 25 |
| 6 | 21 |

## Cards

_Usage share = a card's plays as a fraction of all draftable-card plays by players who drafted it (basic salvo excluded)._

| Card | Tier | Drafted in | Plays | Usage share |
|---|---|---|---|---|
| Twin Shot | T1 | 3037 | 7214 | 20.6% |
| Line Probe | T1 | 2491 | 8864 | 29.8% |
| Depth Charge | T1 | 3065 | 2807 | 8.3% |
| Scatter | T1 | 2721 | 3958 | 13.0% |
| Buoy | T1 | 982 | 2195 | 18.3% |
| Ballast | T1 | 1604 | 2155 | 11.4% |
| Cross Salvo | T2 | 1537 | 1702 | 8.9% |
| Sonar Sweep | T2 | 1535 | 7043 | 33.8% |
| Torpedo | T2 | 1427 | 693 | 4.1% |
| Barrage | T2 | 1307 | 1036 | 6.4% |
| Decoy | T2 | 418 | 599 | 11.2% |
| Repair | T2 | 768 | 1791 | 15.7% |
| Satellite | T3 | 695 | 2842 | 32.4% |
| Saturation Fire | T3 | 646 | 416 | 5.3% |
| Wolfpack | T3 | 561 | 377 | 5.5% |
| EMP Burst | T3 | 229 | 258 | 8.4% |
| Dredge | T3 | 234 | 181 | 6.7% |
| Blockade | T3 | 66 | 216 | 21.4% |

## Ships

| Ship | Size | Drafted in | Wins | Win rate |
|---|---|---|---|---|
| Skiff | 1 | 2606 | 1306 | 50.1% |
| Cutter | 2 | 1381 | 653 | 47.3% |
| Reefrunner | 2 | 1794 | 896 | 49.9% |
| Tender | 3 | 2830 | 1553 | 54.9% |
| Frigate | 3 | 2387 | 1268 | 53.1% |
| Minelayer | 3 | 2076 | 1013 | 48.8% |
| Array Ship | 4 | 2537 | 1247 | 49.2% |
| Carrier | 4 | 2451 | 1231 | 50.2% |
| Dreadnought | 5 | 3163 | 1494 | 47.2% |
| Leviathan | 5 | 2737 | 1335 | 48.8% |

## Terrain modifiers

_Detection win rate = win rate of the player who drafted more detection cards, in matches under that modifier._

| Modifier | Matches | Detection-skewed | Detection win rate |
|---|---|---|---|
| Spring Tide | 126 | 84 | 41.7% |
| Burn-Off | 112 | 81 | 39.5% |
| Rolling Fog | 127 | 89 | 40.4% |
| Silted Up | 118 | 89 | 37.1% |
| Deep Water | 124 | 88 | 39.8% |
| Undertow | 127 | 73 | 42.5% |
| Breakers | 127 | 91 | 41.8% |
| Coral Growth | 127 | 86 | 34.9% |
| Sharp Shoals | 127 | 87 | 35.6% |
| Murky Water | 110 | 81 | 45.7% |
| Clear Water | 120 | 86 | 41.9% |
| Ebb Tide | 135 | 96 | 41.7% |
| Salvage Rights | 113 | 71 | 36.6% |
| Flotsam | 126 | 85 | 41.2% |
| Strong Current | 135 | 91 | 47.3% |
| False Lights | 144 | 104 | 40.4% |

_First-player win rate: 49.8%. Endgame drag median: 4. Shots-to-final-ship median: 5. Longest match: 137 plies. Burn leaks: 0._
