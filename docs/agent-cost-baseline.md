# Agent cost baseline

Before-numbers for harness efficiency work, appended by
`tools/agent-token-usage.py --baseline`. Append-only: each block is a
measurement taken at a moment, never revised. Compare blocks, don't edit them.
ITE = input-token-equivalents; active/span/wall clock are defined in the
script's docstring.

## before harness efficiency work (SoL-Pi-inspired)

Measured 2026-09-19 by `tools/agent-token-usage.py --by agent`.
Window 2026-08-11 19:39 .. 2026-09-19 18:41. ITE weights {'in': 1.0, 'write': 1.25, 'read': 0.1, 'out': 5.0}. Idle gap 300s. Wall clock 116h58m, agent-time 182h50m.

| agent | turns | fresh in | cache write | cache read | output | ITE | % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| openspec-orchestrator | 10,229 | 641,647 | 544,114,386 | 3,279,222,120 | 2,826,710 | 1,022.8M | 38.9% |
| openspec-sdet | 14,866 | 29,728 | 98,647,172 | 3,374,026,770 | 5,688,344 | 489.2M | 18.6% |
| main thread | 8,370 | 90,238 | 46,350,244 | 1,715,602,086 | 9,885,054 | 279.0M | 10.6% |
| openspec-golang-dev | 8,266 | 16,532 | 42,337,728 | 1,866,197,814 | 2,495,250 | 252.0M | 9.6% |
| openspec-spec-writer | 10,342 | 20,676 | 46,668,262 | 1,213,988,275 | 3,393,533 | 196.7M | 7.5% |
| openspec-nextjs-dev | 4,876 | 9,750 | 33,680,626 | 1,322,760,160 | 1,219,420 | 180.5M | 6.9% |
| openspec-adversary | 4,737 | 9,467 | 22,541,990 | 429,695,958 | 2,243,832 | 82.4M | 3.1% |
| openspec-architect | 2,335 | 4,668 | 10,851,710 | 251,995,475 | 1,155,663 | 44.5M | 1.7% |
| openspec-qa | 974 | 1,948 | 4,781,861 | 149,329,356 | 206,733 | 21.9M | 0.8% |
| openspec-design-analyst | 934 | 1,868 | 5,206,546 | 119,643,641 | 435,225 | 20.7M | 0.8% |
| openspec-ux | 471 | 942 | 2,848,287 | 36,850,292 | 232,673 | 8.4M | 0.3% |
| openspec-reliability | 438 | 876 | 2,842,713 | 29,906,985 | 318,856 | 8.1M | 0.3% |
| openspec-security | 526 | 1,047 | 2,290,757 | 41,722,964 | 95,326 | 7.5M | 0.3% |
| openspec-validator | 635 | 5,138 | 1,235,535 | 28,475,929 | 73,867 | 4.8M | 0.2% |
| Explore | 331 | 6,911 | 1,629,086 | 17,459,635 | 114,991 | 4.4M | 0.2% |
| openspec-dba | 211 | 422 | 1,226,492 | 13,720,357 | 69,111 | 3.3M | 0.1% |
| general-purpose | 161 | 322 | 683,674 | 18,530,767 | 43,908 | 2.9M | 0.1% |
| fork | 26 | 52 | 84,195 | 5,945,306 | 45,458 | 0.9M | 0.0% |
| subagent | 1 | 0 | 0 | 0 | 0 | 0.0M | 0.0% |
| **total** | **68,729** | **842,232** | **868,021,264** | **13,915,073,890** | **30,543,954** | **2,630.1M** | |

| agent | runs | active | % of agent-time | span (idle incl.) | longest run | occupied |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| main thread | 56 | 50h04m | 27.4% | 509h21m | 10h27m | 48h16m |
| openspec-orchestrator | 16 | 33h00m | 18.1% | 234h55m | 8h21m | 33h00m |
| openspec-sdet | 87 | 32h09m | 17.6% | 56h16m | 2h56m | 31h12m |
| openspec-spec-writer | 122 | 16h43m | 9.1% | 33h31m | 31m50s | 15h52m |
| openspec-golang-dev | 45 | 16h28m | 9.0% | 32h12m | 1h46m | 16h28m |
| openspec-adversary | 75 | 11h21m | 6.2% | 11h34m | 17m15s | 10h40m |
| openspec-nextjs-dev | 28 | 10h13m | 5.6% | 22h57m | 2h14m | 10h13m |
| openspec-architect | 29 | 5h14m | 2.9% | 5h34m | 18m19s | 5h08m |
| openspec-design-analyst | 10 | 1h41m | 0.9% | 2h09m | 14m10s | 1h41m |
| openspec-qa | 8 | 1h21m | 0.7% | 1h32m | 26m13s | 1h21m |
| openspec-ux | 9 | 1h09m | 0.6% | 1h09m | 11m13s | 1h09m |
| openspec-reliability | 8 | 1h05m | 0.6% | 1h05m | 15m59s | 1h03m |
| openspec-security | 10 | 46m52s | 0.4% | 46m52s | 10m12s | 46m52s |
| Explore | 8 | 26m31s | 0.2% | 26m31s | 7m19s | 21m34s |
| openspec-dba | 4 | 22m42s | 0.2% | 22m42s | 7m00s | 22m42s |
| openspec-validator | 8 | 21m32s | 0.2% | 21m32s | 3m47s | 21m32s |
| general-purpose | 2 | 9m49s | 0.1% | 9m49s | 7m02s | 9m49s |
| fork | 1 | 8m53s | 0.1% | 8m53s | 8m53s | 8m53s |
| subagent | 1 | 0s | 0.0% | 0s | 0s | 0s |
| **total** | **527** | **182h50m** | | **914h37m** | | **116h58m** |

