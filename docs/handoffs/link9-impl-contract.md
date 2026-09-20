# Link 9 `delete-the-lattice` — implementation contract

**Authoritative over any in-file assumption made by an SDET or a developer.**
The specs pin *behaviour*; this file settles the names, the ordering, and the
acceptance evidence. Where this document disagrees with `openspec/specs/`, the
spec wins on behaviour and this file wins on names and sequence.

Written after reading `proposal.md`, `design.md`, `tasks.md` and all nine spec
deltas in full, plus `handoffs/README.md` (all six lessons),
`link9-adversary-r2.md` / `-r3.md`, `link7-impl-contract.md` and
`link8b-impl-contract.md`. **Every claim below was run against the tree**, not
inferred; the raw grep output is reproduced where it matters.

Tree state at authoring: `HEAD = c5ead84`, working tree carries link 8b
(`add-scan-and-sightings-surface`) implemented but **uncommitted and
unarchived**. `openspec/changes/` holds `add-scan-and-sightings-surface` and
`delete-the-lattice`. Section 1's preconditions are therefore *not yet met* —
8b must commit and archive first.

---

## 0. Verified state of the tree — what is already true, what is not

`openspec validate delete-the-lattice --strict` → **valid** (exit 0).
`python3 .claude/scripts/openspec-reconcile.py` → **`add-scan-and-sightings-surface: OK` / `delete-the-lattice: OK`** (exit 0).

### 0.1 The section-1 preconditions, run verbatim

**Task 1.1** — `grep -rnE "from '@/lib/(board|polar)'|require\('@/lib/(board|polar)'\)" frontend --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '^frontend/lib/board/' | grep -v '^frontend/lib/polar/'`

```
(no output — exit 1)
```

**PASSES.** Without the two exclusions it returns **14** hits, every one
`frontend/lib/board/*` importing `@/lib/polar`, exactly as r3's B3-R records. I
additionally ran a wider form the task does not — relative-path and dynamic
imports, plus `vitest.config.*` / `tsconfig.json` / `package.json` path
aliases — and it is also clean:

```
grep -rnE "from ['\"][^'\"]*(lib/(board|polar))['\"]|import\(['\"][^'\"]*lib/(board|polar)" frontend --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '^frontend/lib/board/' | grep -v '^frontend/lib/polar/'
(no output)
```

So `frontend/lib/board` and `frontend/lib/polar` are a closed, unreferenced
island. **The frontend deletion (6.2) has zero coupling to the Go work and can
run on day one.**

**Task 1.2** — `openspec/changes/` = `add-scan-and-sightings-surface`,
`archive`, `delete-the-lattice`. Archive contains
`2026-09-02-add-fuel-as-cargo`, `2026-09-02-add-stationkeep-hold-verb`,
`2026-09-03-serve-orbital-elements-and-burn-preview`,
`2026-09-03-build-production-space-view`. **Four of five archived; 8b is not.**
1.2 fails today by design.

**Task 1.3** — `openspec/specs/board-view/` does not exist; `grep -rn
"board-view" openspec/specs/` returns nothing. **PASSES.**

**Task 1.4** — `cd backend && grep -rln '"hexaverse/board"\|"hexaverse/polar"' --include='*.go' .` returns **34 files**:

```
action/commit_params_validator_test.go      system/bodies_test.go
board/board.go                              system/fog_source.go
board/board_test.go                         system/fog_test.go
board/fixtures_test.go                      system/generator.go
board/intercept.go                          system/generator_placement_test.go
board/orbit.go                              system/generator_test.go
board/ship.go                               system/interior_continuous_decode_test.go
board/ship_test.go                          system/interior_decode_guard_test.go
board/visibility.go                         system/interior_endpoint_contract_test.go
board/within_test.go                        system/interior_wire_lattice_removal_test.go
common/tuning_schedule_test.go              system/model.go
market/lattice_symbols_absent_test.go       system/service.go
mine/integration_test.go                    system/splice_completeness_test.go
mine/lattice_symbols_absent_test.go         system/spliced_body_complete_or_loud_test.go
stations/lattice_symbols_absent_test.go     system/station_splice_test.go
stations/orbit_guard_test.go
stations/placement.go
stations/placement_test.go
stations/service.go
```

Every one is reached by a section 2–5 task (the ten `board/` files by 5.1; the
`system/*_test.go` set by 2.10's mechanical grep or by 3.4). **1.4's baseline
holds — no unplanned importer.** The six production importers match the
proposal's corrected count exactly (`system/{fog_source,generator,model,service}.go`,
`stations/{placement,service}.go`).

**Task 2.10's mechanical grep** returns exactly **21** files, matching tasks.md:

```
system/{bodies_test, continuous_test, cross_target_test, dao_test, fixtures_test,
fog_test, gates_lane_id_test, gates_test, generate_streams_test,
generator_continuous_test, generator_placement_test, generator_test, handler_test,
interior_continuous_decode_test, interior_decode_guard_test,
interior_endpoint_contract_test, lattice_identity_test, model_test,
splice_completeness_test, spliced_body_complete_or_loud_test, station_splice_test}.go
```

`system/splice_completeness_test.go` — untracked at the time link 9 was
authored — **is** in that list. Good: the grep, not the enumeration, is the
contract.

### 0.2 Tasks already satisfied by the tree — verify and tick, do not redo

| Task | Status | Evidence |
| --- | --- | --- |
| **2.9, first half** (`fog.go`'s `fogFeatureDTO` lattice fields) | **DONE** — 8a-2 task 9.1 landed it | `backend/system/fog.go` `fogFeatureDTO` (`:25-48`) carries `Id/Type/Name/Resources/Space/Size/OrbitElements` and no `Orbit`, `ParentId`, `Fixed`, `Footprint`, `Band`, `Live`, `AsOf`. Only the *comment block* at `:16-26` and `:50-56` survives. That is a 10.2 hit, not a field. |
| **2.9, second half** (`BoardFog`) | **NOT done — real work** | `backend/system/handler.go:27` is still `type BoardFog interface{}`, with `Handler.fog` (`:41`) and `WithFog` (`:54-55`). Downstream: `backend/router.go:174`, `system/service.go:42,46` (comment), `system/handler_test.go:30,36,40,88` (`fakeBoardFog`), `system/fog_test.go:24,85,112`, `system/gates_deletion_test.go:5`. `galaxy.Handler.WithFog` takes `GraphFog` and is **out of scope** — do not touch it. |
| **8.10** (`components/board/webgl/` carve-out) | **NOT done — carve-out is live and now dead** | `frontend/components/board/` does not exist; `.claude/scripts/check-frontend-tests.sh:118` (comment) and `:126` (the `=~ /components/board/webgl/` predicate) survive. `grep -rn 'components/board' .claude/` returns those two lines only. `frontend/components/space/webgl/` exists and every module there already has a test, so removing the carve-out breaks nothing. See conflict **C7** before choosing delete-vs-repoint. |
| **10.3b** (`world-clock`'s widening already satisfied) | **DONE** | `grep -rn 'time\.Now()' backend/space backend/disclosure backend/charts --include='*.go' \| grep -v _test.go` returns exactly `backend/space/vec.go:10:// time.Now().` — a doc comment, no call. |
| **2.8's premise** (`occlusionRadius2` has no production caller) | **TRUE, but the stated grep does not prove it** | `grep -rn 'occlusionRadius2(' backend/` returns two lines: the definition (`system/fog_source.go:25`) and **one test caller, `system/fog_source_test.go:44`**. See conflict **C3**. |
| **4.2b's premise** (`MsPerTile` / `InterceptHorizon` have zero production readers) | **TRUE** | Every non-test hit is a field declaration, a `DefaultTuning`/`DefaultMovementParams` assignment, or a comment. No consumer. |
| **9.4's premise** (`docs/specs` scenario seam survives) | **TRUE** | `0004-movement-board.md` is `implemented` with 2 `### S` scenarios, both cited by `backend/fleet/stale_arrival_integration_test.go:84,107` (a file this change does not delete). `0007-hex-board-view.md` is `accepted` with **0** scenarios. `0006`/`0008` are `superseded` and therefore unenforced. |
| **7.5's cross-target rehearsal is runnable here** | **CONFIRMED** | Rosetta 2 is installed (`oahd` running, `/Library/Apple/usr/libexec/oah` present). `GOARCH=amd64 GOAMD64=v1 go test ./system/ -short -count=1` → `ok hexaverse/system 2.153s`; native arm64 → `ok 0.890s`. **Both targets reproduce today's `fixtures/system/cases.json` byte-for-byte.** README lesson five's stale prohibition is empirically dissolved for the *assert* direction; 7.5 still guards the *record* direction. |
| **`fixtures/determinism-register.json`'s five open entries are non-lattice** | **TRUE** | galaxy `dist` sqrt; `market.Params.ProvisionRequests` ×2; `mine.Service.Commit` ×2. None touched. |
| **8b introduces no new lattice coupling** | **CONFIRMED** | Every modified/untracked `.go` file was grepped for `"hexaverse/board"`, `"hexaverse/polar"`, `\b(board\|polar)\.[A-Za-z]` and `lattice`. Three hits, all comments: `backend/fleet/handler.go:37` ("the lattice-era radial scan link 4 deleted"), `backend/fleet/resolver.go:26` (`[]board.Cell` — already named by 10.1c), `backend/system/bodies.go:15` ("resolve through `board`; the lattice's own deletion is a later link"). `backend/fleet/scan_targets.go`, `system.EligibleIds` (`system/bodies.go:94`) and `system.IsDerivedBeltMember` (`system/belt.go:81`) are **clean** — no `board`/`polar` import, no lattice symbol, no lattice vocabulary. Every 8b TS file is clean too. |

### 0.3 What 8b's code moves under link 9's feet

Three concrete drifts the developers must not work around stale line numbers for:

1. **`queryKeys.systemBoard` readers moved.** Task 6.3 (from ruling M3) names
   `hooks/use-fleets.ts:32,115`. 8b edited that file: the second reader is now
   **`:140`**. Derive the list by grep (§3 below has the derived list).
2. **`queryKeys` gained three namespaces** — `fleets.scanTargets`,
   `actions.settled`, `sightings.*`. **No collision with `systemSpace`**:
   `grep -rn 'systemSpace' frontend` returns nothing, and `queryKeys.system`
   (health probe, `['system']`) stays distinct from `['systemSpace']`.
3. **New `frontend/components/space/` surfaces** — `ScanControl.tsx`,
   `SightingLog.tsx`, and eight new test files — plus
   `frontend/lib/{scan-copy,types/scan,types/sighting,services/sighting-service}.ts`
   and `hooks/{use-scan,use-sightings}.ts`. **None** matches `@/lib/(board|polar)`,
   `\b(board|polar)\.`, `lattice`, or `systemBoard`. They add nothing to any link 9
   sweep. `backend/system/belt_member_predicate_test.go` and
   `backend/fleet/scan_targets_test.go` likewise.

---

## 1. DECIDED HERE — the names this change leaves open

### 1.1 `common.GameTuning.BoardRadius` → **`MaxOrbitalIndex`** (design.md OQ-2)

**Pinned. Do not substitute a candidate from OQ-2's list.**

The rationale is arithmetic, not taste. The value is used at exactly three
kinds of site, and all three read it as an **inclusive maximum index**, never
as a count:

- `system/generator.go:92,305` — `ring := 1 + r.Intn(params.Radius)`, i.e. the
  drawn orbital index ranges over `[1, Radius]` **inclusive**;
- `system/generator.go:185` — `Extent: ContinuousRadius(params.Radius)`, where
  `ContinuousRadius(idx) = BaseOrbitRadius × RadiusGrowth^idx` (`system/continuous.go:79-85`)
  and index `0` is a legal shell;
- `system/params.go`'s calibration invariant —
  `galaxy.DefaultParams().MaxRings - 1 <= Radius`, an index comparison.

So the domain the knob bounds is `[0, 16]` — **seventeen** indices at value
16. `OrbitalShellCount` and `GeneratedOrbitCount` are therefore off by one in
meaning, and a count name invites the next reader to write `r.Intn(count)` on
an exclusive-bound reading and silently lose the outermost shell.
`MaxOrbitalIndex` says exactly what the number is, contains neither "board"
nor "ring", and reads correctly at every one of the three sites.

Rename sites (derived; `board/board.go:54-65` and
`board/production_schedule_test.go` are **excluded because they are deleted
first** — see §4, step G6):

| File | Line(s) |
| --- | --- |
| `backend/common/tuning.go` | `:98-103` (field + doc — rewrite the doc, it describes a cell grid), `:127` (`DefaultTuning`) |
| `backend/system/params.go` | `:57` |
| `backend/common/tuning_test.go` | `:52-53` |
| `backend/system/params_test.go` | `:11` (comment) |
| `backend/corporations/params_test.go` | `:40,47,50,51,54,62,63,65` — rewrite per task 4.3b, **keep the `system.DefaultParams().Radius == common.Tuning().MaxOrbitalIndex` leg in both tests** |

`system.GenerationParams.Radius` is **not** renamed by this change. It is
misleading (an index, not a distance) but it is not lattice vocabulary, and
task 4.3b's surviving guard reads it by name. Flagged as **C10**, not fixed.

### 1.2 `queryKeys.systemBoard` → `queryKeys.systemSpace` — the full derived site list

`grep -rn 'systemBoard' frontend --include='*.ts' --include='*.tsx' | grep -v node_modules` — **16 hits across 6 files**, all of them in scope:

| File | Lines | What changes |
| --- | --- | --- |
| `frontend/lib/query-keys.ts` | `:33` (namespace key), `:37` (`all: ['systemBoard']` — **the cache string itself**), `:38` (`detail` builder) | Rename all three. Also repoint the `:34-36` doc comment, which cites "#0007" (the retired hex-board-view numbered spec) and "the fogged interior read" |
| `frontend/hooks/use-system-space.ts` | `:21` | reader |
| `frontend/hooks/use-fleets.ts` | `:32`, **`:140`** (was `:115` before 8b) | two invalidations |
| `frontend/hooks/use-system-space.test.tsx` | `:47` | assertion |
| `frontend/hooks/use-fleets.test.tsx` | `:103`, `:176` | two assertions |
| `frontend/lib/query-keys.test.ts` | `:19` (`it()` title), `:20`, `:21`, `:23` (×2 on one line), `:25` (×2 on one line), `:28` (`it()` title), `:30` | five `expect` lines, two titles |

Acceptance: `grep -rn 'systemBoard' frontend --include='*.ts' --include='*.tsx' | grep -v node_modules` returns nothing, and `queryKeys.system.all` (`['system']`) is still `!==` `queryKeys.systemSpace.all`.

`queryKeys.market.board()` is the **market price board** and stays. Say so in
the commit message, as task 6.3 requires.

### 1.3 `fixtures/market/mirror-map.json` — the exact file (tasks 7.2 / 7.2b)

The Go census was generated by running task 7.2b's extractor verbatim. It
returns **28** names; three are the mirrored pair, so **25** go to `goOnly`,
exactly as design.md Decision 4 states:

```
BudgetCheck  Capacity  DefaultParams  DemandFor  EpochAt  FirstTonPrice  FloorFor
FoldSale  GetBoard  NewHandler  NewService  ObserveSale  ProvisionRequests
RegisterRoutes  Sell  blendedUnitPrice  checkGuards  dockedTo  ensureProvisioned
isContention  mix64  mixStation  regionOf  reject  settle  unitFloat
validateGuards  venueQuotes
```

The TS side, extracted by `check_mirror`'s own rule
(`^(export )?function [A-Za-z]` over non-test `*.ts` in the directory), returns
**4**: `bestPriceFor`, `capacity`, `firstTonPrice`, `foldSale`. (`capacity` is
top-level and *unexported* in `fold.ts` — that is why it is a legitimate pair,
per the requirement's "whether or not exported on either side".)

`fixtures/market/cases.json`'s non-empty top-level array keys are exactly
`fold` and `firstTonPrice` (`_comment` is a string and is filtered out), so
those are the only two legal `family:` values.

**Write this file:**

```json
{
  "$comment": [
    "Mirror map + coverage inventory for the backend/market <-> frontend/lib/market",
    "pair (openspec delete-the-lattice, design.md Decision 4; cross-stack-determinism's",
    "'Shared Board Math Is Pinned By a Cross-Language Golden Fixture'). This is the",
    "capability's ONLY mirrored-pair instance after the board and polar pairs were",
    "deleted, and it is what keeps check_mirror from losing its last call site.",
    "",
    "Names EVERY top-level function defined in either mirror, whether or not exported",
    "on either side, because check_mirror's rule-1 extractor enumerates every",
    "'^func ' in backend/market -- receiver methods and unexported helpers included.",
    "backend/market is an APPLICATION package, so goOnly is a whole-package census",
    "and goes stale the moment anyone adds a service method, a handler or a private",
    "helper. Regenerate it with the extractor, never by hand:",
    "",
    "  for f in backend/market/*.go; do case \"$f\" in *_test.go) continue;; esac; \\",
    "    grep -hE '^func ' \"$f\"; done \\",
    "  | sed -E 's/^func (\\([^)]*\\) )?//; s/[([].*$//; s/[[:space:]]*$//' \\",
    "  | grep -v '^$' | sort -u",
    "",
    "coverage values: 'family:<name>' -- asserted by that fixture family (directly, or",
    "indirectly as a callee of the family's function); 'inventory' -- no family",
    "exercises it, tracked as a gap below. The legal family names are the non-empty",
    "top-level keys of fixtures/market/cases.json: 'fold' and 'firstTonPrice'."
  ],
  "pairs": [
    { "go": "FoldSale", "ts": "foldSale", "coverage": "family:fold" },
    { "go": "FirstTonPrice", "ts": "firstTonPrice", "coverage": "family:firstTonPrice" },
    { "go": "Capacity", "ts": "capacity", "coverage": "family:fold", "note": "indirect (the per-entry remaining-capacity helper FoldSale/foldSale consume on every portion; every fold case exercises it)" }
  ],
  "goOnly": [
    "BudgetCheck", "DefaultParams", "DemandFor", "EpochAt", "FloorFor", "GetBoard",
    "NewHandler", "NewService", "ObserveSale", "ProvisionRequests", "RegisterRoutes",
    "Sell", "blendedUnitPrice", "checkGuards", "dockedTo", "ensureProvisioned",
    "isContention", "mix64", "mixStation", "regionOf", "reject", "settle",
    "unitFloat", "validateGuards", "venueQuotes"
  ],
  "tsOnly": ["bestPriceFor"],
  "inventory": []
}
```

Two mechanical notes that will otherwise cost an hour:

- **`inventory` must be present even when empty.** `check_mirror` runs
  `jq -r '.inventory[].pair' "$MAP"` and `jq '.inventory | length' "$MAP"`
  unconditionally under `set -euo pipefail`; a missing key makes jq error on
  `null` iteration and the script dies rather than failing cleanly.
- **`$comment` is the key the sibling maps use** (`fixtures/polar/mirror-map.json`),
  not `_comment`. `check_mirror` ignores unknown keys, but match the convention.

**Task 7.3's replacement call**, in place of `check-mirror-map.sh:365-375`:

```sh
check_mirror "market" \
    "$REPO_ROOT/fixtures/market/mirror-map.json" \
    "$REPO_ROOT/fixtures/market/cases.json" \
    "$REPO_ROOT/backend/market" \
    "$REPO_ROOT/frontend/lib/market"
```

Argument order is `LABEL MAP CASES GO_DIR TS_DIR` (`check-mirror-map.sh:64`).
The `PASS:` message at `:406` enumerates the anti-mirrored packages and must
lose nothing but the board/polar clause.

**Task 7.4's falsification proof** — the cheapest form that exercises rule 1
on the TS side:

```sh
printf '\nexport function neverMapped(x: number): number { return x }\n' >> frontend/lib/market/fold.ts
bash .claude/scripts/check-mirror-map.sh; echo "exit=$?"     # expect 2, naming neverMapped
git checkout -- frontend/lib/market/fold.ts
bash .claude/scripts/check-mirror-map.sh; echo "exit=$?"     # expect 0
```

Record both exit codes in the commit message. A check nobody has watched fail
has not been shown to check anything (README lesson two).

---

## 2. Task → owner → component

`GO` = golang-dev · `TS` = nextjs-dev · `SDET` = red-suite author ·
`ORCH` = orchestrator / Travis, manual.

### Section 2 — `backend/system` lattice tier → **GO**

| Task | Component | Note |
| --- | --- | --- |
| 2.1 | `system/model.go` | `Orbit` type + `Feature.{Orbit,ParentId,Fixed,Footprint}` + tags. Atomic with 2.2/2.4/2.5/3.1/3.2/3.2b — see §4 step G5. |
| 2.1b | `system/model.go:190`, `system/handler.go:115`, `system/service.go:249` | `SystemInterior.Radius`. Third reader (`service.go:249 board.Schedule(si.Radius)`) dies with 2.3. |
| 2.2 | `system/{continuous.go or model.go}`, `system/dao.go` | `PeriodFor` + the read-time `f.Orbit.Period` refill. Also removes the last reader of `common.GameTuning.OrbitBasePeriod`, so 4.2 depends on this. |
| 2.3 | `system/service.go:389` (`featureRingOK`), `system/service.go:227-249` (its call site + comment), `clampRing` and callers (`generator.go:76,149`) | |
| 2.4 | `system/generator.go` | Drop `board.Schedule/Canon/RingCells`, the `sched polar.Schedule` parameter on `orbitFeature`/`orbitFor`/`beltFeature`/`hazardFeature`, and the `Angle0` slot draw. `orbitFor` returns `system.Orbit` and therefore **ceases to exist** with 2.1 — see conflict **C8**. |
| 2.5 | `system/generator.go` | Re-source `continuousStarParented`'s `retrograde` from the `diskOrCaptured`/`DominantOrbitDirection` roll. **The single highest-risk edit in the change** — a `retrograde` that silently becomes always-false leaves every test green. 2.10b is its guard. |
| 2.6 | `system/generator.go`, `system/generate_streams_test.go`, `system/fixtures_test.go` (`computeInteriorElementsCase`) | Nil-`r2` mode + the lattice word counter. Couples to 7.5 (the `latticeDrawCount` fixture component). |
| 2.7 | `system/gates.go:109`, `system/service.go:29` (**interface decl**), `system/handler.go:115`, `fleet/fuel.go:107` (**interface decl**), `fleet/fuel.go:126` | tasks.md names the two *callers*; **there are two interface declarations too**, and the compiler will find them. |
| 2.8 | `system/fog_source.go:20-34`, `system/fog_source_test.go:44`, `system/model.go:46` (comment) | See conflict **C3** for the corrected verification grep and the test caller. |
| 2.9 | `system/handler.go:18-27,41,54-55`, `system/service.go:42,46`, `backend/router.go:174`, `system/handler_test.go:30,36,40,88`, `system/fog_test.go:24,85,112`, `system/gates_deletion_test.go:5` | **First half already done** (§0.2). `galaxy.Handler.WithFog` is out of scope. |
| 2.10 | The 21 files the grep returns | **Re-run the grep; do not use the list.** |
| 2.10b | `system/generator_continuous_test.go`, `system/continuous_test.go`, `system/lattice_identity_test.go` | Re-source, do not trim. The only thing standing behind 2.5. |
| **2.11** | **NEW TEST** — `system/` | → **SDET**. See §3. |
| 2.12 | — | `go test ./system/ -short -count=1` |

### Section 3 — `backend/stations` lattice tier → **GO**, except 3.2c → **TS**

| Task | Component | Note |
| --- | --- | --- |
| 3.1 | `backend/stations/placement.go` | The file is 88 lines and contains **exactly two functions**, `DeriveOrbit` (`:41`) and `mix64` (`:83`), both deleted, and `mix64` has no other user in the package. **`rm backend/stations/placement.go`** rather than leaving a header-comment-only file. Also reaches `stations/service_test.go:90`, `system/generator.go:135` (comment) and `system/station_continuous.go:6-7` (comment) — see **C4**. |
| 3.2 | `stations/service.go:202-243` | `ErrStationRingOutOfRange`, the ring check, `board.ProductionSchedule()`, `board.Canon`, `Footprint`. `FeatureOf` then cannot fail; keep or drop its `error` return as you like, but update `service.go:198` (`feat, _ := FeatureOf(st)`) either way. |
| 3.2b | `stations/model.go:33-35`, `stations/service.go:114,131-132` | Wire removal. `stations/handler.go` marshals the whole struct, so no handler edit is needed — but say "wire removal" in the commit. |
| **3.2c** | **TS** — `frontend/lib/types/market.ts:67-72`, `frontend/lib/services/market-service.test.ts:37` | **Plus three sites the task does not name** — see **C1**. Lands in the *same commit* as 3.2b. |
| 3.3 | `stations/service.go:52,77,85` | `gateRing` field + both assignments + the comment; and the `system.PeriodFor(orbit.Ring)` refill (with 2.2). |
| 3.4 | `stations/{lattice_symbols_absent,orbit_guard,placement}_test.go`, `mine/lattice_symbols_absent_test.go`, `market/lattice_symbols_absent_test.go`, `system/interior_wire_lattice_removal_test.go:192-223` | **`backend/fleet/lattice_symbols_absent_test.go` exists and is named nowhere** — see **C2**. |
| **3.5** | **NEW TEST** — `stations/` or root e2e | → **SDET**. See §3. |
| 3.6 | — | `go test ./stations/ ./mine/ ./market/ -short -count=1` |

### Section 4 — tuning, params, last test importers → **GO**

| Task | Component | Note |
| --- | --- | --- |
| 4.1 | See §1.1's table | **Runs AFTER 5.1**, so `board/board.go:54-65` and `board/production_schedule_test.go` never need renaming. |
| 4.2 | `common/tuning.go:82-86,120-124,132-160` | Depends on 2.2 + 3.3 having removed `PeriodFor`. |
| 4.2b | `common/tuning.go:69-71,75-78,115,117`; `fleet/params.go:9-14,17,18,41,42`; `fleet/roster.go:37`; `fleet/model.go:17,19`; `market/params.go:14,18`; `common/tuning_test.go:22-26,43-44`; `fleet/roster_test.go:170`; `fleet/resolver_test.go:23` | Verified: zero production readers for both knobs. |
| 4.3 | `fleet/params.go:24-30,44`, `fleet/fuel.go:126`, `fleet/params_test.go:13-19`, `common/tuning_test.go:52`, `system/params_test.go:11`, `corporations/params_test.go` | |
| 4.3b | `backend/corporations/params_test.go:50-58,65-78` | **Delete only the `fleet` legs (`:56-58`, `:76-78`); keep the `system.DefaultParams().Radius == common.Tuning().MaxOrbitalIndex` leg in both tests.** This is the only live guard that the renamed knob still drives generation radius. Deleting these tests to clear the compile error is the obvious repair and it silently removes 4.1's whole safety net. |
| 4.4 | `common/tuning_schedule_test.go` (delete), `action/commit_params_validator_test.go:37,47` | Repoint the rejected non-primitive to `space.Vec3` (`backend/space/vec.go:20`). |
| 4.4b | `action/commit_params_validator_test.go:98-116,122-155`, and `action/params_validator.go:7,15` (production doc comments — reached by 10.1c) | `space.EncodeVec` / `space.DecodeVec` are at `backend/space/params.go:34,47`. The `ActorState` case repoints at **`space.ShipState`** (`backend/space/state.go:21`), which is what `fleet.Fleet.State` carries (`fleet/model.go:82`). |
| 4.5 | `backend/mine/integration_test.go:99` | Second file correctly dropped: `backend/interior_additive_wire_e2e_test.go` does not exist at `HEAD` and no root e2e test imports `board`. |
| 4.6 | — | `go build ./... && go test ./... -p 1 -timeout 90m` — **but see §5 trap 2**; the root package is Travis's archive-time run, not a developer loop. |

### Section 5 — delete the packages → **GO**

5.1 / 5.2 / 5.3. No sub-ownership. `go vet ./...` must be clean, and
`grep -rn 'hexaverse/board\|hexaverse/polar' backend/` must return nothing
including comment prose.

### Section 6 — delete the TS mirrors → **TS**

| Task | Note |
| --- | --- |
| 6.1 | Re-run §0.1's task-1.1 grep. |
| 6.2 | `rm -rf frontend/lib/board frontend/lib/polar`. **Verified safe — zero external importers by any import form or path alias.** |
| 6.3 | The sweep, plus the `queryKeys` rename in §1.2. Its own grep `ring\b.*slot\b` does **not** match the station `orbit` shape (`ring`/`angle0`), which is why 3.2c exists separately. |
| 6.3b | **Unconditional half only** — rewrite `spike/space-3d/sim.ts:21-22`, `sim.ts:4`, `page.tsx:3,13,219`, `page.test.tsx:7`, and `spike/hex-board/mock-system.ts:235`. **Delete no spike on this change's authority.** OQ-5 is Travis's. |
| 6.4 | `npm run lint && npx vitest run`; Playwright separately (§5 trap 3). |

### Section 7 — fixtures, mirror maps, register → **GO** (7.1–7.6b) · **GO+TS** (7.4)

| Task | Note |
| --- | --- |
| 7.1 | `rm -rf fixtures/board fixtures/polar`. Its verification grep excludes `docs/plans/` and `archive/`; it does **not** exclude `docs/specs/`, `docs/handoffs/`, `fixtures/*/mirror-map.json`, `backend/space`, `backend/market` or `frontend/lib/market` — all of which cite `fixtures/board`. See **C5**. |
| 7.2 / 7.2b | §1.3, written out in full. **Never answer a `MISSING_GO` failure by switching `market` to `anti_mirror`.** |
| 7.3 | §1.3's call block. |
| 7.4 | §1.3's falsification recipe. Record both exit codes. |
| **7.5 / 7.6** | **These move INTO the Go generator step (§4 step G5), not section 7's own step.** See **C6** — the moment 2.4/2.5/2.6 land, `interiorElements` no longer reproduces and `./system/` is red. |
| 7.6b | The surviving-sqrt audit. Minimum call-site set: `system.keplerPeriodMs` (`system/continuous.go:87`, already pinned by `family:keplerPeriodMs` with the documented negative-radius exclusion) and `backend/space`'s flight-time and delta-v solve. Each needs a colocated `determinism:allow(pinned)` pragma naming its family. |
| 7.7 | `fixtures/determinism-register.json`'s `cross-target` and `sqrt-pinning` legend entries. `golden-fixture-sweep`'s legend names *Shared Board Math Is Pinned By a Cross-Language Golden Fixture*, a title Decision 1 deliberately keeps — **do not "fix" it**. The five open entries stay untouched (verified non-lattice). |

### Section 8 — enforcement → **GO** (they are repo-infra, and they must land with the Go deletions)

Every site verified line-exact against the tree:

| Task | Site | Verified |
| --- | --- | --- |
| 8.1 | `.gitlab-ci.yml:342` (`GOAMD64=v1 go test ./board/`), `:343-347` (polar comment + leg) | ✔ leaves `./space/ ./system/` |
| 8.2 | `.gitlab-ci.yml:370-373` (board and polar compile-and-run), `:379` (the `DETERMINISM ARM64 LEG UNASSERTED` string) | ✔ **note `:371` is `(cd board && …)` and is NOT returned by 10.1b's pattern** — remove it by reading the block, not by chasing the sweep |
| 8.3 | `.gitlab-ci.yml:68-71` | ✔ glob is correct; only prose dies |
| 8.4 | `check.py:223`, `check-transcendental.sh:82` | ✔ **same commit** — `test_check_determinism_lists.py` fails if they disagree |
| 8.5 | `check.py:258-259`, `check-transcendental.sh:44-46,88` | ✔ **see conflict C9 before deleting the TS predicate** |
| 8.6 | `check.py:1052-1055` (docstring), `:1080` and `:1094` (both command strings), `:1078,1090` (+ two more result messages) | ✔ |
| 8.7 | `check.py:1491-1492` (`determinism_trigger`), `:1510-1514` (`mirror_trigger`) — **add `backend/market` and `frontend/lib/market` to `mirror_trigger`** | ✔ a pass whose trigger never fires is not enforced |
| 8.8 | `check.py:1160-1162` | ✔ |
| 8.9 | `check-mirror-map.sh:5-11` (header), `:406` (`PASS:`). **Site 18 at `:181` stays** unless OQ-5 rules "delete `space-3d`" | ✔ |
| 8.10 | `check-frontend-tests.sh:118,126` | ✔ live and dead — **C7** |
| 8.11 | `test_check_determinism_lists.py:9-20` ("STATE OF THE TREE" names all ten packages) | ✔ then run it standalone |
| 8.12 | `python3 .claude/skills/code-quality-checks/check.py --backend-tests` | the de-enrolment falsification proof → **SDET verifies** |
| 8.13 | `infra/docker/test-runner.Dockerfile:5` | ✔ **not reached by 10.1b's pattern either** — bare word `board`, no quotes/parens |
| 8.14 | `check.py:250` ("the TS board-math mirror") | ✔ third distinct docstring |
| 8.15 | `fixtures/system/mirror-map.json:58,59,60,71` | ✔ exact. **`orbitFor` at `:63` also dies with 2.4/C8** — re-derive the whole `coverage` list against the post-change Go surface rather than deleting the two named entries |

### Section 9 — docs and defects → **GO** writes 9.1–9.3, 9.5, 9.6; **ORCH** rules 9.4

| Task | Note |
| --- | --- |
| 9.1 / 9.2 | Status flip + dissolution note. Neither carries a register entry (confirmed). |
| 9.3 | **Predicted outcome: file a new open defect.** `fixtures/system/cases.json`'s `gateOrbitSweep` is a randomized sweep drawing two independent `galaxy.Coords` uniformly from `[-2000, 2000]³` boxes — the probability of landing within one ULP of an exact tie between adjacent sub-turn phase indices is effectively zero. The `gateOrbit` **hand** family has 7 cases including *"an exact tie (straight along the table's index-0 direction) resolves to the documented lower index"* — an **exact** tie, which both build targets agree on by construction, not the **near**-tie the successor question asks about. So the honest answer to 9.3 is "it does not", and the task's own instruction applies: file it, do not close the old defect silently. |
| 9.4 | Record, do not decide (OQ-4). Facts to record are in §0.2. |
| 9.5 | Root `CLAUDE.md` — the `board/` bullet (`:206-247`) plus `system/`, `fleet/`, `stations/` lattice citations. **Replace the `board/` bullet, do not delete it**, so a reader learns the lattice was removed. |
| 9.6 | `docs/plans/continous_space/chain.md` link 9 row + section. |

### Section 10 — whole-tree sweep → **SDET runs it; GO/TS repair what it finds**

This is the acceptance gate, not a task. See §3.3 for the full list and §6 for
the residues no section 2–9 task reaches.

### Section 11 — validation → **GO+TS**, then **ORCH**

11.1 · 11.2 (**the re-expression audit — the whole mitigation for the six
`REMOVED`+`ADDED` pairs; README lesson four**) · 11.3 · 11.4 · 11.5.
11.2 and 11.3 are prose-diff work, best done by whoever wrote the deltas;
assign to **ORCH** if the spec writer is available, **GO** otherwise. **Re-run
11.2 after any edit to an ADDED requirement.**

### Section 12 — archive rehearsal → **ORCH**

12.1–12.5b, on a scratch copy. 12.5's retired-title list is **33 lines**: 22
from `board-tactical-math` (confirmed count), the 6 `REMOVED`+`ADDED`
originals, and the 5 pure `REMOVED`.

### Section 13 — post-archive manual → **ORCH**

13.1–13.4. **Order matters and tasks.md states it: the `## Purpose` edits run
BEFORE the `board-tactical-math` directory deletion**, so 12.4's grep runs
against a tree from which every stale citation has already gone.

---

## 3. The red suite — what it is, and what it explicitly is not

**This is a deletion change. Most of it is not verified by tests at all — it is
verified by greps that must return nothing and by existing suites staying
green.** Say that plainly to the SDET rather than letting them look for a
157-scenario red suite that does not exist here (contrast link 8b).

### 3.1 The genuine red set — five new tests, plus three falsification proofs

| Task | Test | Where | Red-for-the-right-reason |
| --- | --- | --- | --- |
| **2.11** | Phase-reachability across many seeds: (a) collected phases occupy **every quadrant** of `[0, SubTurn)`; (b) **gcd of the pairwise differences** is 1 | `backend/system/` | Must fail against a generator drawing `phase = wrapSubTurnFraction(float64(r.Intn(16))/16)` (fails (a)) **and** against `phase = c + k·(SubTurn/16)` with odd `c` (passes (a), fails (b)). Write both fakes in a scratch copy and watch each leg go red. Leg (b) computed over **raw phases** is the wrong test and passes both fakes. `SubTurn = 1<<20 = 1048576`. |
| **3.5** | A fleet parked coincident with the station's live continuous position but with no matching `attachedTo` is **not docked**, and every dock-gated verb (sell, refuel, jump) rejects it | `backend/stations/` or root e2e | Must fail against an implementation that reads position coincidence as attachment. |
| **4.4** | `Commit` rejects a `space.Vec3` in `Params` with `ErrNonPrimitiveParam` | `backend/action/commit_params_validator_test.go` | tasks.md is explicit: *confirm it fails when the validator's allowlist is widened*. Do that, don't assert it. |
| **4.4b** | `space.EncodeVec` round-trips through the stored params to `space.DecodeVec`; `ActorState` carrying `space.ShipState` still commits | same file | The current acceptance half asserts `gotOrigin["ring"] == 4 && gotOrigin["slot"] == 9` against a hand-built map — **green forever against a shape nothing writes** once the change lands. That is precisely the vacuous-pass species README lesson two catalogues. |
| **7.4** | `check_mirror market` **exits 2** on an unmapped TS function | `.claude/scripts/check-mirror-map.sh` invocation | §1.3's recipe. Record both exit codes. |
| **8.12** | The determinism cross-target matrix **still runs** and still names `./space/ ./system/ ./galaxy/` after de-enrolment | `check.py --backend-tests` | A silently-skipped matrix is indistinguishable from a passing one. |
| — | **2.10b's re-sourced retrograde assertions** | `system/{generator_continuous,continuous,lattice_identity}_test.go` | Not a new test, but the same discipline: after repointing at the `DominantOrbitDirection`/`diskOrCaptured` roll, force `retrograde` to `false` in a scratch copy and confirm the assertions go red. Without that, 2.5 ships unguarded. |

**Record the red manifest before any developer starts** (README lesson six):

```
.claude/scripts/openspec-red-manifest.sh record delete-the-lattice \
  backend/system/<phase_reachability>_test.go \
  backend/stations/<position_coincidence>_test.go \
  backend/action/commit_params_validator_test.go
```

The manifest cannot cover 7.4 or 8.12 (they are script invocations, not
files); record their observed exit codes in the change's commit message
instead.

### 3.2 Everything else is verified by existing suites staying green

- `cd backend && go test ./system/ ./stations/ ./mine/ ./market/ ./action/ ./fleet/ ./common/ ./corporations/ -short -count=1 -p 1`
- `cd frontend && npm run lint && npx vitest run`
- `cd frontend && npx vitest run lib/spec-scenarios.test.ts` (task 9.4's seam)
- `bash .claude/scripts/check-mirror-map.sh`
- `python3 .claude/skills/code-quality-checks/test_check_determinism_lists.py`
- `python3 .claude/skills/code-quality-checks/check.py`

### 3.3 The acceptance checks are greps. Here they are, as a runnable block

Every one must return **nothing** (or only its stated exemption). This block is
the change's real acceptance criterion — paste it into the QA gate.

```sh
# --- packages and paths gone -------------------------------------------------
grep -rn 'hexaverse/board\|hexaverse/polar' backend/                        # 5.2
grep -rn 'fixtures/board\|fixtures/polar' . --exclude-dir=node_modules \
  --exclude-dir=.git --exclude-dir=archive                                  # 7.1 (+C5 exemptions)

# --- symbols gone (backend) --------------------------------------------------
grep -rn 'Footprint\|\.Fixed\b\|f\.Orbit\|Orbit \*Orbit' backend/system      # 2.1
grep -rn 'Interior\.Radius\|si\.Radius' backend/                            # 2.1b
grep -rn 'PeriodFor' backend/                                               # 2.2
grep -rn 'featureRingOK\|clampRing' backend/                                # 2.3
grep -rn 'r2 == nil\|latticeDrawCount' backend/system                       # 2.6
grep -rn 'BoardFog' backend/                                                # 2.9
grep -rn 'DeriveOrbit' backend/                                             # 3.1
grep -rn '\.Orbit\b' backend/stations/                                      # 3.2b
grep -rn 'OrbitBasePeriod\|OrbitPeriod' backend/                            # 4.2
grep -rn 'MsPerTile\|InterceptHorizon' backend/                             # 4.2b
grep -rn 'BoardRadius' backend/                                             # 4.3 + 4.1

# --- symbols gone (frontend) -------------------------------------------------
grep -rn 'angle0' frontend --include='*.ts' --include='*.tsx' \
  | grep -v node_modules                                                    # 3.2c
grep -rn 'systemBoard\|lib/board\|lib/polar\|ring\b.*slot\b' frontend \
  --include='*.ts' --include='*.tsx' | grep -v node_modules                 # 6.3

# --- whole-tree ---------------------------------------------------------------
grep -rn 'backend/board\|backend/polar\|frontend/lib/board\|frontend/lib/polar\|fixtures/board\|fixtures/polar\|board-tactical-math\|polar-lattice-math' \
  . --exclude-dir=node_modules --exclude-dir=.git                           # 10.1
grep -rnE '"board"|"polar"|\(board |[( ]polar[) ]|\./board/|\./polar/' \
  .claude .gitlab-ci.yml infra                                              # 10.1b
grep -rnE '\b(board|polar)\.[A-Za-z]' backend --include='*.go'              # 10.1c
grep -rnE '\b(board|polar)\.[A-Za-z]' frontend --include='*.ts' \
  --include='*.tsx' | grep -v node_modules                                  # 10.1c
grep -rni 'lattice' backend frontend .claude fixtures --exclude-dir=node_modules  # 10.2
grep -rn 'components/board' .claude/                                        # 8.10
grep -n 'clampRing\|generateWithStreams\|Lattice' fixtures/system/mirror-map.json # 8.15
grep -F -f /tmp/retired-titles.txt -rn . --exclude-dir=node_modules \
  --exclude-dir=.git --exclude-dir=archive --exclude-dir=handoffs \
  --exclude-dir=plans                                                       # 12.5b
```

**10.1b misses two of its own targets**, verified: `.gitlab-ci.yml:371`
(`(cd board && …)`) and `infra/docker/test-runner.Dockerfile:5` (bare word
`board`). Remove both by reading the file, not by chasing the sweep to green.

---

## 4. Sequencing

### The shape of it

Three tracks. **TS is unblocked from day one** (§0.1 proves the frontend
mirrors are an unreferenced island). GO carries the compile-coupled core. The
enforcement/fixture work is GO's and must land *with* the deletions it
de-enrols, never after.

```
        1.x preconditions (ORCH: commit + archive 8b first)
                    │
        ┌───────────┴────────────┬──────────────────────────┐
    SDET red set              GO track                   TS track
    (2.11, 3.5,          G1 → G2 → G3 → G4 → G5 → G6 → G7   T1 → T2 → T3
     4.4/4.4b, 2.10b)                │                        │
                                     └──── 3.2b/3.2c ─────────┘  (one commit)
                    │
             §8 enforcement + §7 mirror map (GO)
                    │
             §9 docs · §10 sweeps · §11 validation
                    │
        §12 rehearsal · archive · §13 hand-steps (ORCH)
```

### Preconditions — **ORCH, before anyone starts**

1. Commit link 8b and run `openspec archive add-scan-and-sightings-surface --yes`.
2. Re-run task 1.2. Then 1.1, 1.3, 1.4 (they pass today; re-run anyway).
3. Task 1.5's green baseline. **Use `-p 1`.** Treat the root `hexaverse` e2e
   package as Travis's one archive-time run (§5 trap 2), not part of the
   baseline.
4. Rule **OQ-1**, **OQ-2** (this contract pins `MaxOrbitalIndex` — confirm or
   override), **OQ-3**, **OQ-4**, **OQ-5**. OQ-5 gates task 6.3b's second half,
   task 8.9's site-18 clause and task 13.1's Purpose edit.

### GO track — the deletion order, so the build is never broken between steps

Each step below **compiles and its package tests pass at its end**. Do not
interleave.

**G1 — `occlusionRadius2` (2.8).** Self-contained. Touches
`system/fog_source.go` and its one test caller. Nothing else depends on it.

**G2 — `BoardFog` (2.9 second half).** Self-contained across
`system/handler.go`, `system/service.go` comments, `backend/router.go`,
`system/{handler_test,fog_test,gates_deletion_test}.go`.

**G3 — the radius parameter chain (2.1b + 2.3 + 2.7 + 4.3 + 4.3b's fleet leg).**
One commit, because they are one compile unit:
`SystemInterior.Radius` → `system/handler.go:115` → `LaneGates`' `radius`
argument → both interface declarations (`system/service.go:29`,
`fleet/fuel.go:107`) → `fleet.Params.BoardRadius` → `fleet/fuel.go:126` →
`corporations/params_test.go`'s fleet legs. `featureRingOK`/`clampRing` ride
along because `system/service.go:249`'s `board.Schedule(si.Radius)` is the
third reader of the field.
*Nothing else in the change is reachable from here — do this early, it is the
cheapest real deletion.*

**G4 — the dead knobs (4.2b) and the validator repoints (4.4, 4.4b).**
Independent of the Orbit core. 4.4 deletes `common/tuning_schedule_test.go`
(a `board` importer), which is required before G6 anyway.

**G5 — THE ATOMIC CORE. One commit. Everything here must land together or the
tree does not compile.**

| Sub-task | Why it cannot be separated |
| --- | --- |
| 2.1 `system.Orbit` + `Feature.{Orbit,ParentId,Fixed,Footprint}` | the type every other item below references |
| 2.2 `PeriodFor` + the `dao.go` refill | fills `Orbit.Period` |
| 2.4 generator rewrite | builds `Orbit` and `Footprint` |
| 2.5 retrograde re-source | reads `f.Orbit.Dir` |
| 2.6 nil-`r2` mode + word counter | same function |
| 2.10 + 2.10b the 21 test files | compile against all of the above |
| 3.1 `DeriveOrbit` (+ `rm placement.go`) | returns `system.Orbit` |
| 3.2 `FeatureOf`'s ring check / `Footprint` | builds `system.Feature` |
| 3.2b `stations.Station.Orbit` | typed `system.Orbit` |
| 3.3 `gateRing` + the `PeriodFor` refill | `DeriveOrbit`'s only argument source |
| 3.4 the four `lattice_symbols_absent_test.go` + `orbit_guard_test.go` + `placement_test.go` + `interior_wire_lattice_removal_test.go:192-223` | assert on symbols now gone |
| 4.2 `OrbitBasePeriod` / `OrbitPeriod` | last reader was `PeriodFor` |
| 4.5 `mine/integration_test.go:99` | builds a `Feature{Footprint: ...}` |
| **3.2c** (TS) the client `Station.orbit` type + **five** fixtures (§C1) | the other half of one wire removal |
| **7.5 + 7.6** the `interiorElements` re-record | **see C6 — the family goes red the instant 2.4/2.5/2.6 land** |
| **2.11** the new phase-reachability test | replaces the coverage 2.6/2.4 remove |

**G6 — `rm -rf backend/board backend/polar` (5.1–5.3).** Only after G5.
`go build ./... && go vet ./...` clean.

**G7 — the tuning rename (4.1).** **Deliberately last**, after G6, so
`board/board.go:54-65` and `board/production_schedule_test.go` — which read
`common.Tuning().BoardRadius` five times between them — never need renaming
on a package that is about to be deleted. Blast radius shrinks to five files
(§1.1).

### TS track — starts immediately, no dependency on GO

**T1 — 6.2 + 6.3.** `rm -rf frontend/lib/board frontend/lib/polar`, then the
sweep and the `queryKeys.systemBoard` → `systemSpace` rename (§1.2). Verified
zero external importers, so this is a same-day change.

**T2 — 6.3b's unconditional half.** The six comment rewrites in
`spike/space-3d/` and `spike/hex-board/mock-system.ts:235`, plus
`GalaxyView.test.tsx:498-512` (10.1c) and the three `board.MovementState`
comment citations in `components/fleet/` (§C2's second half).

**T3 — 3.2c**, landed inside GO's G5 commit. Prepare the edit in T1's window;
merge it when G5 is ready.

**File-collision map**

| Path | Owner |
| --- | --- |
| `backend/**` | GO, exclusively |
| `.claude/**`, `.gitlab-ci.yml`, `infra/**`, `fixtures/**` | GO, exclusively |
| `frontend/**` | TS, exclusively — **except** `frontend/lib/types/market.ts` and its five fixture sites, which TS writes but GO's G5 commit carries |
| `openspec/**`, `docs/**` | ORCH (§9 docs to GO) |

### Then, in order

1. **§7 mirror map** (7.1–7.4, 7.6b, 7.7) — after G6, because 7.1 deletes the
   fixtures the deleted packages asserted, and 7.3 removes the `check_mirror`
   calls that point at them.
2. **§8 enforcement** — must land in the same push as G6/§7. Between G6 and
   §8 the tree is *broken* for `/check`: `check.py:1080` runs
   `go test ./board/ ./polar/ …` against directories that no longer exist. Do
   not leave that gap across a review boundary.
3. **§9 docs**, **§10 sweeps**, **§11 validation**.
4. **§12 rehearsal**, real archive, **§13 hand-steps**. `board-tactical-math`
   is retired by **hand-delete AFTER the archive succeeds** — a capability
   cannot be retired through `REMOVED` deltas, and neither `--strict` nor
   `openspec-reconcile.py` catches a missing hand-delete.

---

## 5. The fixture re-record (task 7.5) — exact commands

**Runnable on this machine.** Rosetta 2 is installed and
`GOARCH=amd64 GOAMD64=v1 go test` executes natively-emulated; both targets
already reproduce today's `fixtures/system/cases.json` byte-for-byte (§0.2).

### The recording command

`system/fixtures_test.go:15` states it, `:688` implements it:

```sh
cd backend && UPDATE_FIXTURES=1 go test ./system/ -run TestFixtures -count=1
```

This rewrites `fixtures/system/cases.json` in place. Run it **only after**
G5's generator edits (2.4/2.5/2.6) are complete — recording before the code
change freezes the old stream into the contract.

Before recording, delete the `latticeProjection` and `latticeDrawCount`
components from `computeInteriorElementsCase`'s serialization
(`system/fixtures_test.go`), so the re-record emits `interiorElements` over
its surviving `continuousLine` component alone, and recomputes
`interiorElementsSweep`'s digest and `serialization` string. Today's
`interiorElements` case keys are exactly:
`continuousLine`, `latticeDrawCount`, `latticeProjection`, `note`, `region`, `seed`.

### The byte-identity matrix — run all four legs

```sh
cd backend

# leg 1 — record on native arm64
UPDATE_FIXTURES=1 go test ./system/ -run TestFixtures -count=1
shasum -a 256 ../fixtures/system/cases.json | tee /tmp/link9-arm64.sha

# leg 2 — the recording must ASSERT clean on the target that recorded it
go test ./system/ -short -count=1

# leg 3 — the recording must ASSERT clean on the non-contracting target
GOARCH=amd64 GOAMD64=v1 go test ./system/ -short -count=1

# leg 4 — RE-RECORD on amd64 and compare the file byte-for-byte
GOARCH=amd64 GOAMD64=v1 UPDATE_FIXTURES=1 go test ./system/ -run TestFixtures -count=1
shasum -a 256 ../fixtures/system/cases.json | tee /tmp/link9-amd64.sha
diff /tmp/link9-arm64.sha /tmp/link9-amd64.sha && echo "BYTE-IDENTICAL — safe to commit"
```

Leg 4 is the one that matters and the one a "record then run the suite twice"
reading of 7.5 skips. Legs 2 and 3 prove the file *asserts* on both targets;
only leg 4 proves the *recording* is target-independent, which is the property
`pin-system-generation-determinism` existed to establish.

### The stop-and-report rule — non-negotiable

**If `diff` reports a difference, or if either assert leg fails: STOP. Do not
commit `fixtures/system/cases.json`. Do not commit a one-architecture
recording. Report to the orchestrator with both hashes and the failing case
name.** A family recorded on one architecture and never checked against the
other is exactly the defect `pin-system-generation-determinism` closed
(README lesson five), and this change would be re-opening it under a deletion
label.

### If the amd64 leg cannot run

It can, here — but the fallback, in order of preference:

1. `softwareupdate --install-rosetta --agree-to-license`, then retry.
2. **Compile-only differential:** `GOARCH=amd64 GOAMD64=v1 go vet ./system/`
   plus `bash .claude/scripts/check-fma-contraction.sh` (the compiled-output
   FMADDD/FMSUBD inspector the register's `cross-target` legend names). This
   proves no contraction-sensitive instruction is emitted, which is the
   *mechanism* behind the divergence — weaker than byte-identity, and it must
   be recorded as weaker in the commit message and in `_meta`.
3. Hand the recording to CI's amd64 runner (`.gitlab-ci.yml`'s `test-backend`
   job is amd64-native) and compare its artifact. Slowest, strongest.

**Never** commit under fallback 2 without saying so.

### Task 7.6 — `_meta` honesty

Update `_meta.generatedOn` and `_meta.serialization` to name **both** targets
the byte-for-byte check ran against — `GOARCH=arm64` and
`GOARCH=amd64 GOAMD64=v1`. Recording only one leaves a one-architecture
recording indistinguishable from a two-architecture one after the fact, which
is the whole point of the note.

---

## 6. Residues no section 2–9 task reaches

I ran 10.1, 10.1b, 10.1c and 10.2 against the tree. The named tasks cover most
hits. **These do not have a task, and each of them fails an acceptance grep as
written.** They are work, not commentary — assign them.

### 6.1 Task 10.1 residue — `fixtures/board` / `fixtures/polar` / `board-tactical-math` citations outside the allow-list

10.1 allows hits only under `openspec/changes/archive/`, `docs/plans/`,
`docs/handoffs/`, `docs/defects/`. These are outside it:

| Site | Text | Owner |
| --- | --- | --- |
| `fixtures/space/mirror-map.json:9-10` | "the INVERSE of fixtures/board/mirror-map.json and fixtures/polar/mirror-map.json" | GO |
| `fixtures/galaxy/mirror-map.json:17-18` | same | GO |
| `fixtures/fleet/mirror-map.json:13-14` | same | GO |
| `fixtures/disclosure/mirror-map.json:26-27` | same | GO |
| `fixtures/market/cases.json:2` | "Mirrors fixtures/board/cases.json's precedent" | GO |
| `backend/space/turn_table_record_test.go:17-19,75` | "mirroring backend/board's coordtable.json / fixtures/board/coordinate-table.json precedent (backend/board/fixtures_test.go)" | GO |
| `backend/space/fixtures_test.go:220` | "exactly as backend/polar/fixtures_test.go does" | GO |
| `backend/system/fixtures_test.go:68` | "the convention backend/space/fixtures_test.go and backend/polar/fixtures_test.go" | GO |
| `backend/market/fixtures_test.go:14` | "established with fixtures/board/cases.json" | GO |
| `frontend/lib/market/fold.ts:6` | "the same discipline fixtures/board/cases.json" | TS |
| `frontend/lib/market/fold.test.ts:9` | "the cross-stack rule fixtures/board/cases.json already" | TS |
| `docs/specs/0004-movement-board.md:161` | "`routeAround` cases in `/fixtures/board/cases.json`" | ORCH (OQ-4) |
| `docs/specs/0006-scan-and-fog.md:293,474` | `/fixtures/board/cases.json`, `frontend/lib/hex` — **status `superseded`** | ORCH |
| `docs/specs/0008-movement-galaxy.md:380` | "`backend/board/ship.go` carries the `laneTransit`" — **status `superseded`** | ORCH |
| `docs/openspec-retrofit-report.md:13` | lists `board-tactical-math` among capabilities | ORCH |
| **`openspec/specs/system-interior/spec.md:1085`** | **"Their removal is what allows `backend/board` and `backend/polar` to be deleted"** — inside the LIVE requirement *Interior Read Serves Continuous Bodies*, which this change's delta does **not** MODIFY | **ORCH — this is conflict C11** |

The four `fixtures/*/mirror-map.json` entries are the same species as design.md
site 32: they run in `anti_mirror` mode, which reads only `.sharedNames` and
never `.$comment`, so a stale citation there **cannot fail** — the
silently-inert record Goal 2 forbids.

### 6.2 Task 10.1c residue — symbol citations no task names

10.1c lists nine "confirmed sites at authoring". Running it now returns **far
more**, all of them comments in packages sections 2–5 do not otherwise touch.
Exempt (price board / filename matches) per r3's M1-R:
`backend/market/board_integration_test.go` (8 hits, `board.Venues` /
`board.RefreshCadenceMs`), `frontend/components/market/MarketBoardPanel.tsx:213,218`,
`frontend/app/spike/hex-board/mock-system.ts:3,6`,
`frontend/lib/types/system-space.ts:12`. **Everything else must be rewritten:**

Backend (GO), beyond the nine named:
`corporations/spawn_position.go:11` · `corporations/params_test.go:31` ·
`fleet/seed_test.go:4` · `fleet/integration_test.go:19-21` ·
`fleet/coordinate_guard_test.go:15-16` · `fleet/service_test.go:125` ·
`fleet/roster_legacy_integration_test.go:38` · `fleet/dao_test.go:55` ·
`fleet/stale_arrival_integration_test.go:22` ·
`fleet/space_testutil_test.go:96` · `fleet/resolver_test.go:15,24`

Frontend (TS), beyond the two named:
`components/fleet/FleetRoster.test.tsx:9` ·
`components/fleet/roster-status.test.ts:113` ·
`components/fleet/roster-status.ts:6` — all three cite `board.MovementState`.

### 6.3 Task 10.2 residue — the biggest gap in the change

`grep -rni 'lattice' backend frontend .claude fixtures --exclude-dir=node_modules`
returns hits in **72 files** today. Excluding the six directories this change
deletes outright, and excluding every file some task already names, roughly
**35 surviving files** still carry the word `lattice` and are named by no task:

```
backend/disclosure/{purity_test.go,world.go}   backend/disclosure_wiring_e2e_test.go
backend/fleet/{dao_test,handler,integration_test,jump_deletion_test,
  lattice_symbols_absent_test,list_stale_arrival_integration_test,
  routing_deletion_test,service_test,stale_arrival_integration_test,
  star_destination_identity_absent_test}.go
backend/galaxy/model.go                        backend/space/turn_test.go
backend/{interior_continuous_wire_e2e_test,interior_gate_body_id_e2e_test,
  orbit_elements_wire_e2e_test}.go
backend/system/{bodies,continuous,gates,station_continuous}.go
backend/system/{gates_deletion_test,orbit_elements_and_extent_wire_test}.go
frontend/components/space/{space-camera.ts,space-camera.test.ts}
frontend/e2e/helpers/space-view.ts
frontend/e2e/tests/{jump-commit,new-user,refuel-commit,slice,space-journey}.spec.ts
frontend/hooks/use-system-space.ts
frontend/lib/services/{system-service.ts,system-service.test.ts}
frontend/lib/types/system-space.ts
fixtures/system/cases.json  (242 hits — mostly the two components 7.5 removes)
```

Task 10.2's acceptance is that the sweep returns **`TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse` alone**. As written, that is
achievable only by rewriting all ~35 files' prose. **That is the change's
largest single body of undeclared work and it must be budgeted, not
discovered.** Most of it is one-line comment repointing ("the lattice-era X"
→ "the pre-continuous X"), but the e2e/spec files and `fixtures/system/cases.json`
need care. See conflict **C12**.

---

## 7. Traps — every one of these has already cost this project time

1. **`-p 1` on every multi-package Go run.** `cd backend && go test ./... -p 1`.
   The root `TestMain` wipes the shared emulator project while Go runs packages
   in parallel; without it you get ~18 phantom failures.
2. **The root `hexaverse` e2e package runs ONCE per change, at archive time —
   Travis's policy.** It is ~40 minutes and growing (README addendum;
   `ls backend/*_e2e_test.go` = 32 files today). Developers verify with
   package-level short tests (`go test ./system/ ./stations/ ./market/ -short -p 1`)
   and **targeted root tests by name** (`go test . -run TestX -timeout 20m`).
   Never `go test .` for the whole root package during development. If a full
   root run is unavoidable, `-timeout 90m` — **a timeout is not an assertion
   failure**, and `FAIL hexaverse 600.704s` at go's default looks exactly like
   one.
3. **Never run Playwright while backend emulator tests are running.** One
   shared test emulator project; concurrent runs corrupt each other's state.
   Task 6.4's `npm run e2e` and any backend emulator run must be serialized.
   Task 11.5 runs both — sequence them.
4. **`check_mirror`'s `MISSING_GO` failure must NEVER be answered by moving
   `market` to `anti_mirror` mode** (task 7.2b). `anti_mirror` reads only
   `.sharedNames` (empty), so it passes trivially, leaves `check_mirror` with
   zero call sites anyway, and defeats Decision 4 entirely while `/check`
   reports green. When `MISSING_GO` fires, re-run the extractor and add the
   name to `goOnly`.
5. **The archiver refuses a MODIFIED block missing a live scenario heading —
   `--strict` does not.** Measured (README, 2026-09-02): the archiver names
   every dropped heading and changes nothing, so a failed archive is free — but
   it fires at the worst moment. Run
   `python3 .claude/scripts/openspec-reconcile.py delete-the-lattice` early and
   often. It exits 0 today.
6. **`.claude/scripts/openspec-reconcile.py` cannot see a re-ADD.** It parses
   MODIFIED blocks (and, since `6edb831`, resolves `RENAMED`); a requirement
   re-expressed through `REMOVED` + `ADDED` under a new name is invisible to it
   *and* to the archiver. This change carries **six** such pairs, and that
   structure cost link 8a **six load-bearing losses** (README lesson four).
   **Task 11.2's mechanical diff is the only guard.** Re-run it whenever any
   ADDED requirement is edited, including after a review round.
7. **`board-tactical-math` is retired by hand-delete AFTER the archive**
   (task 13.3). A capability cannot be retired through `REMOVED` deltas;
   precedents are `polar-lattice-math`, `observation-fog-and-scan` and
   `board-view`. Neither `--strict` nor `reconcile` catches a forgotten
   hand-delete — task 12.4's grep is the only guard.
8. **`fixtures/determinism-register.json` is line-numbered** for its `entries`
   sites. Inserting code above a registered site silently breaks `check.py`'s
   determinism checks; re-locate by grep and update the entry rather than
   "fixing" the code. G5's generator rewrite moves lines inside
   `system/generator.go`, which carries **no** register entry today — but the
   five open entries name `market/provisioning.go:35,38` and
   `mine/service.go:329,366`, and 4.2b touches `market/params.go`. Re-check
   after any market edit.
9. **The stale-arm64-fixture prohibition is dissolved, and I re-derived it
   rather than trusting either side** (README lesson five). Both targets
   reproduce `fixtures/system/cases.json` today (§0.2). That does **not**
   license skipping §5's leg 4.
10. **`test_check_determinism_lists.py` fails if `check.py`'s
    `DETERMINISM_GO_PACKAGES` and `check-transcendental.sh`'s
    `RULE_BEARING_GO_PACKAGES` disagree.** Task 8.4's two edits must be in the
    same commit. That is the point of the check, not an inconvenience.
11. **`check_mirror`'s TS extractor reads only top-level `*.ts` in the
    directory, matching `^(export )?function`.** `frontend/lib/market` has one
    non-test file and four such functions. An arrow-function export added
    there would be *missed* (unlike `anti_mirror`, which fails closed on an
    unclassifiable form). Not this change's problem to fix — but do not be
    surprised by the asymmetry when 7.4's falsification uses a `function`
    declaration.
12. **`jq -r '.inventory[].pair'` runs unconditionally.** A mirror map with no
    `inventory` key kills `check-mirror-map.sh` under `set -e` with a jq error
    rather than a clean failure. Always emit `"inventory": []`.

---

## 8. Conflicts, ambiguities and findings — for the orchestrator, not resolved here

Numbered. **None is fixed in code by me; I wrote only this file.**

1. **C1 — Task 3.2c's enumeration is short by three files, and its own
   verification grep proves it.** 3.2c names
   `frontend/lib/types/market.ts:67` and `market-service.test.ts`'s station
   fixture. Its stated check —
   `grep -rn 'angle0' frontend --include='*.ts' --include='*.tsx' | grep -v node_modules` —
   returns three further `Station`-literal sites that no task names:
   `frontend/components/space/FleetActionsPanel.test.tsx:91`,
   `frontend/components/space/SystemSpaceView.test.tsx:81`,
   `frontend/hooks/use-market.test.tsx:41`. Because `orbit` is a **required**
   property today, deleting it from the interface makes all three excess-property
   errors, so `npm run lint` catches them — but the task reads as complete
   after two edits. Add them by name.

2. **C2 — `backend/fleet/lattice_symbols_absent_test.go` exists, is Decision
   6 retire-branch material, and is named in no task.** Task 3.4 deletes the
   `stations`, `mine` and `market` copies. The `fleet` copy (7 `lattice` hits)
   is the same species — a guard asserting a package is not imported, unfailable
   once that package does not exist — and it is caught only by task 10.2's
   sweep, where it looks like prose to repoint rather than a file to delete.
   Symmetrically: `backend/stations/no_lattice_dock_predicate_test.go` is named
   only inside task **12.5b**, at archive-validation time, which is very late
   for a file deletion. Both should be named in section 3.
   *(Related, frontend side: the three `board.MovementState` comment citations
   in `components/fleet/` — §6.2 — are named nowhere.)*

3. **C3 — Task 2.8's stated verification can never pass, as written.** It
   says: *"Verified before deleting by `grep -rn 'occlusionRadius2' backend/ | grep -v _test.go` returning nothing"*. Run today it returns **four** lines —
   the function definition itself (`system/fog_source.go:25`) plus three
   comments (`fog_source.go:14,20`, `system/model.go:46`). The intent is "no
   production **caller**", which is true, and the honest form is
   `grep -rn 'occlusionRadius2(' backend/ | grep -v _test.go | grep -v '^backend/system/fog_source.go:25'`.
   Separately, the task misses the one real caller,
   **`backend/system/fog_source_test.go:44`**, which will not compile after the
   deletion.
   *Secondary observation, out of scope:* the sibling `isAstronomical` in the
   same file also has **zero** production callers — a tenth "built, unit-tested,
   never called" instance. After 2.8, `fog_source.go` is a file containing one
   uncalled unexported function and a header comment describing a purpose it no
   longer has. Worth a ruling, not an agent's call.

4. **C4 — Three `DeriveOrbit` sites outside task 3.1's stated scope.**
   `backend/stations/service_test.go:90` (`want := DeriveOrbit(...)` with
   `svc.gateRing` — a compile error after 3.1/3.3, and `service_test.go` is
   named in no task), `backend/system/generator.go:135` (comment) and
   `backend/system/station_continuous.go:6-7` (comment; that file is named in
   no task at all). 3.1's own grep finds all three, so this is an enumeration
   gap rather than a hole — but `station_continuous.go` is production code with
   four `lattice` hits and belongs in section 2's list.

5. **C5 — Task 7.1's verification excludes `docs/plans/` and `archive/` but
   not `docs/specs/`, `docs/handoffs/`, `fixtures/*/mirror-map.json`,
   `backend/space`, `backend/market`, `backend/system/fixtures_test.go` or
   `frontend/lib/market`** — all of which cite `fixtures/board` or
   `fixtures/polar` (§6.1, sixteen sites). Either the exclusion list widens or
   the sixteen sites get repointed. Recommend repointing: five of them are
   `fixtures/*/mirror-map.json` `$comment` blocks that `anti_mirror` mode
   **cannot fail on**, which is exactly design.md site 32's silently-inert
   record species — Goal 2 forbids leaving them.

6. **C6 — Tasks 7.5/7.6 are sequenced after section 6, but the fixture they
   re-record goes red the moment section 2 lands.** `system/generator.go`'s
   `orbitFor` slot draw is on the primary RNG stream (Decision 3), so 2.4/2.5/2.6
   change every downstream draw and `fixtures/system/cases.json`'s
   `interiorElements` family stops reproducing immediately. Following tasks.md's
   numbering literally leaves `go test ./system/` red across sections 3, 4, 5 and
   6 — during which task 2.12, 3.6, 4.6 and 5.3 all demand green. **7.5 and 7.6
   must execute inside the section-2/3 commit** (this contract's step G5).
   Recommend the task text move rather than the implementer improvising.

7. **C7 — Task 8.10 deletes a carve-out whose *policy* is still load-bearing.**
   `check-frontend-tests.sh:112-127` is one comment block: a general "the WebGL
   render layer is exempt because a unit test for it degrades to a tautology"
   rationale, plus the pairing rule ("`webgl/` holds GL PLUMBING ONLY; anything
   that DECIDES lives outside and is tested there"), plus the now-dead
   `components/board/webgl/` predicate. `frontend/components/space/webgl/`
   exists and inherits exactly that policy — and today every module there has a
   test, so deleting the predicate breaks nothing. But the task's verification
   (`grep -rn 'components/board' .claude/` returns nothing) is equally satisfied
   by **repointing** the predicate to `/components/space/webgl/`. Deleting a
   true carve-out note is how an exemption becomes folklore — the same reasoning
   task 8.9 uses to *keep* site 18. **Ruling needed: delete, or repoint?**

8. **C8 — Task 2.4's description of `orbitFor` understates the deletion.**
   2.4 says to drop `orbitFor`'s `sched polar.Schedule` parameter; but
   `orbitFor` **returns `system.Orbit`** (`generator.go:221`), the type task 2.1
   deletes, so the function ceases to exist entirely — as does `orbitFeature`'s
   `Orbit`/`Footprint` construction. Consequence: `fixtures/system/mirror-map.json`'s
   `coverage` array names `orbitFor` (`:63`) as well as the two entries task
   8.15 removes. 8.15's list is short by at least one, and because that map runs
   in `anti_mirror` mode **nothing will ever surface it**. The instruction should
   be "re-derive the whole `coverage` list against the post-change Go surface",
   not "delete these two entries".

9. **C9 — Tasks 8.5 and 8.14 contradict each other about the TypeScript
   determinism seam.** 8.5 removes `check.py:258-259`'s
   `frontend/lib/board` / `frontend/lib/polar` clauses **and**
   `check-transcendental.sh:88`'s `frontend/lib/(board|polar)` predicate — after
   which **no TypeScript file anywhere is determinism-governed**, and
   `check-transcendental.sh` falls to its `else` branch for every `.ts` input.
   Task 8.14 then says to repoint `check.py:250`'s docstring "at the surviving
   TS seam" — but 8.5 has left none. Meanwhile Decision 4's entire argument
   (don't leave a working check with zero call sites) applies verbatim, and
   `frontend/lib/market` is a rule-bearing TS mirror (`foldSale`,
   `firstTonPrice`, `capacity`) that is about to be enrolled in `check_mirror`.
   **Recommend: repoint both predicates to `frontend/lib/market` rather than
   delete them**, which makes 8.14's docstring true and keeps the transcendental
   lint alive on the one TS mirror that remains. That is a scope decision, not
   an implementer's call.

10. **C10 — `system.GenerationParams.Radius` keeps a name that is wrong for
    what it holds.** With the tuning knob renamed to `MaxOrbitalIndex` (§1.1),
    `Radius` is the only survivor calling an inclusive orbital *index* a
    radius, and it is the field `SystemInterior.Extent = ContinuousRadius(Radius)`
    reads. Not lattice vocabulary, so out of this change's declared scope, and
    task 4.3b's surviving guard cites it by name. Recorded, not fixed —
    a cheap follow-up.

11. **C11 — A live requirement this change does not modify will cite two
    deleted packages after archive.** `openspec/specs/system-interior/spec.md:1085`,
    inside *Interior Read Serves Continuous Bodies* (added by
    `build-production-space-view`, deliberately untouched here per the proposal's
    "Deliberately untouched" list): *"Their removal is what allows `backend/board`
    and `backend/polar` to be deleted: while this response promised them, a caller
    could still be reading them."* After this change those paths do not exist and
    the sentence is a forward reference to work already done. **Task 10.1's sweep
    covers `openspec/specs/` and will return this hit**, so the change cannot
    reach its own acceptance without addressing it. Fixing it means a MODIFIED
    block reproducing every one of that requirement's live scenario headings
    verbatim — non-trivial, and it touches the one requirement the proposal
    explicitly protects (Decision 6's "keep a guard expressed on an artifact that
    still exists"). **Ruling needed: MODIFY the requirement, or widen 10.1's
    allow-list to `openspec/specs/` and record the residue.**

12. **C12 — Task 10.2's acceptance criterion is roughly 35 files of
    undeclared work.** The sweep must return
    `TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse` **alone**.
    Today it returns hits in 72 files; ~35 of those survive the change and are
    named by no task (§6.3), spread across `backend/{disclosure,fleet,galaxy,
    space,system}`, five root e2e files, six Playwright specs and eight frontend
    modules. Almost all are one-line comment repoints of the form "the
    lattice-era X". This is not a defect in the criterion — the criterion is
    right, and it is the only thing that makes Goal 1 measurable — but it is a
    materially larger change than "32 sites across 15 files" suggests, and it
    should be budgeted before the developers start rather than discovered at
    task 10.2. Recommend either a task enumerating the file set mechanically
    (the way 2.10 does) or an explicit orchestrator acknowledgement of the
    volume.

13. **C13 — Task 9.3's successor question resolves to "file a new defect", and
    the task should say so.** `fixtures/system/cases.json`'s `gateOrbitSweep`
    draws two independent `galaxy.Coords` uniformly from `[-2000, 2000]³`; the
    chance any drawn bearing lands within one ULP of an exact tie between
    adjacent sub-turn phase indices is effectively zero. The `gateOrbit` hand
    family's tie case is an **exact** tie, which is deterministic on both build
    targets by construction and is not the hazard. So `space.PhaseIndexOf`'s
    cross-build-target near-tie behaviour **is not covered**, and
    `cross-stack-determinism`'s *"Authority does not cover a same-side
    cross-target disagreement"* applies. Expect a new `docs/defects/` entry and
    a deviation-register line, not a closure. Worth pre-authorizing so the
    developer does not wave it through.

14. **C14 — Two enforcement triggers remain false-green after 8.7, for
    packages outside this change.** `mirror_trigger` (`check.py:1510-1514`)
    gates the mirror-map check on `backend/board`, `backend/polar`,
    `backend/system`, `frontend/lib/{board,polar}` and `fixtures/`. Task 8.7
    correctly adds `backend/market` / `frontend/lib/market` — but
    `backend/space`, `backend/fleet`, `backend/galaxy` and `backend/disclosure`
    all have `anti_mirror` maps that `check-mirror-map.sh` runs and that this
    predicate has never fired for. Same species as
    `pin-system-generation-determinism`'s sharpest finding, one level out.
    Out of scope; recorded so it is not re-discovered a fourth time.

15. **C15 — Task 10.1b cannot verify two of the sites section 8 de-enrols.**
    Run against the tree, its pattern
    (`'"board"|"polar"|\(board |[( ]polar[) ]|\./board/|\./polar/'`) returns 24
    hits and misses `.gitlab-ci.yml:371` (`(cd board && "$QEMU" …)` — no
    `./board/`, no `(board `) and `infra/docker/test-runner.Dockerfile:5` (bare
    word `board` in prose, task 8.13's site). Both are removed by their own
    tasks, so nothing is lost if those tasks are done — but 10.1b is advertised
    as the leg that stops section 8 being self-attested, and for those two sites
    it does not.

---

*Written 2026-09-03 against `HEAD = c5ead84` with link 8b uncommitted in the
working tree. Every grep in §0, §1, §3.3 and §6 was executed, not inferred.
Where this document disagrees with `openspec/specs/`, the spec wins on
behaviour and this file wins on names and sequence.*
