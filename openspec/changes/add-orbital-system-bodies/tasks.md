## 1. The orbital-element codec (discharge of an existing requirement)

- [x] 1.1 Add `space.EncodeOrbit`/`space.DecodeOrbit` to
  `backend/space/params.go`, following `EncodeVec`/`DecodeVec`'s existing
  shape and error discipline (`ErrNonFiniteCoordinate`,
  `ErrCoordinateOutOfExtent`, routing `radius` through `checkedCoordinate`
  and every angle through `DecodeSubTurns`). `DecodeSubTurns` accepts any
  in-range `int64`/`float64`/`int` shape unchanged — it does not reject an
  out-of-range angle (it wraps via `CosSin`), so decode failure is scoped to
  a non-finite radius or a missing key, never an "out-of-range angle" case.
- [ ] 1.2 Add a `fixtures/space/` fixture family covering `EncodeOrbit`/
  `DecodeOrbit` round-trips (hand-selected cases; this is a small,
  enumerable-shape function, not a continuous sweep).

## 2. The second RNG stream and the lattice-identity guard

- [x] 2.1 Add `continuousSeed(systemSeed)` (the salted splitmix64 finalizer,
  distinct constant from `DominantOrbitDirection`'s and `stations.mix64`'s)
  to `backend/system`.
- [x] 2.2 Thread a second `*rand.Rand`, seeded by `continuousSeed`, through
  `Generate` alongside the existing lattice stream, drawing zero values from
  it yet.
- [x] 2.3 Write the golden lattice-identity test first: `Generate`'s
  lattice-only output (ring, angle0, dir, footprint, resources, effects,
  ids, order) is byte-identical before and after the second stream is
  introduced, across a swept seed set. This is the acceptance-gate test
  behind system-interior's *Interiors Emit Continuous Orbital Elements For
  Every Body* → "Adding continuous elements leaves every lattice placement
  unchanged" scenario. **STOP and do not proceed past this section until
  this test is green.**

## 3. The pure element laws

- [x] 3.1 `ContinuousRadius(idx) = BaseOrbitRadius × RadiusGrowth^idx`
  (`BaseOrbitRadius = 24.0`, `RadiusGrowth = 1.23`) over the per-family
  **orbital index** (Decision 2) — the raw, un-clamped skeleton ring
  `[0, MaxRings)` for a skeleton major body; the feature's own
  already-drawn lattice ring `[1, params.Radius]` for every other
  star-parented feature (extra body, belt, anomaly, ruin, hazard); **never
  called** for a body-parented feature (moon, station), which follows its
  own law instead (tasks 3.4, 6.2). Explicit `float64(...)`-guarded
  multiplies, fixed trip count bounded by `params.Radius`. Table-driven
  tests: strict ascent and `MinOrbitSpacing = RadiusGrowth` scoped to
  skeleton majors only, in raw-ring order; two skeleton bodies at raw
  ordinals 0 and 1 that the lattice's `clampRing` maps to the identical
  clamped ring still receive strictly different continuous radii; a detail
  feature sharing a skeleton major's orbital index is a legal co-orbital
  tie, not a rejected case (system-interior: *Orbital Radii Ascend With the
  Skeleton Ordinal and Are Separated*).
- [x] 3.2 `keplerPeriodMs(radius)` — the Kepler law via one `math.Sqrt`
  (`determinism:allow(pinned)`), `math.Ceil` quantization, clamped to a
  1 ms minimum. Tests: non-decreasing monotonicity (`r2 >= r1 ⟹
  period2 >= period1`), strict increase across one `RadiusGrowth` step
  (`period(r×RadiusGrowth) > period(r)`), and strict positivity
  (system-interior: *A Body-Parented Orbit's Continuous Period Follows a
  Named Law of Its Radius, Fixed at Generation Time*).
- [x] 3.3 Wire moon/body-parented periods through the already-shipped
  `space.InsertionPeriod` (no new law).
- [x] 3.4 `MoonOrbitLocalRadius(parent space.Body, u float64)` — the named
  band law (Decision 16): `parentSize + space.InsertionStandoff(parent) +
  MoonOrbitMin + u×(MoonOrbitMax−MoonOrbitMin)`, `MoonOrbitMin = 4.0`,
  `MoonOrbitMax = 8.0`. Table-driven tests: every derived radius clears
  `parentSize + space.InsertionStandoff(parent)`; the configured ceiling
  (`maxGiantSize + space.InsertionStandoff(maxGiantSize) + MoonOrbitMax`)
  is strictly less than `BaseOrbitRadius`; a moon's total distance from the
  star (resolved through `space.Position`) never exceeds the interior's
  `Extent` (system-interior: *A Body-Parented Child's Local Radius Clears
  Its Parent Within a Named Band*).
- [x] 3.5 `StarSize(class string)` — the pinned table over
  `galaxy.rollStarClass`'s classes (`O 7.6, B 7.0, A 6.6, F 6.2, G 6.0,
  K 5.6, M 5.2`, default `6.0`). `MaxFeatureSize(FeatureType) float64` —
  the exported, pure per-type size ceiling table (gas giant 4.2, ice 2.7,
  rocky 2.4, moon 1.0, anomaly/ruin 1.6, hazard 3.0, belt-feature 0.9,
  station 0.9) — and the per-type size bands it ceilings (gas giant
  3.4–4.2, ice 1.9–2.7, rocky 1.6–2.4, moon 0.5–1.0, anomaly/ruin 0.8–1.6,
  hazard 1.0–3.0), drawn from the continuous stream. `featureTypeForBody
  (galaxy.BodyType) FeatureType` — the pure galaxy-tier mapping Decision 6
  also consumes. Tests: every drawn size falls within its own type's
  configured band and never exceeds that type's `MaxFeatureSize`;
  `MaxFeatureSize` returns a strictly positive ceiling for every non-star
  `FeatureType` the generator emits; two interiors generated from different
  seeds with the same star class carry the identical star size
  (system-interior: *Feature Size Is Drawn From a Per-Type Band With a
  Pinned, Exported Ceiling*).
- [x] 3.6 The inclination convention (Decisions 1, 17): configured
  `MaxInclinationJitter`, strictly less than `SubTurn/8`; prograde band
  `[0, MaxInclinationJitter]`, retrograde band
  `[SubTurn/2 − MaxInclinationJitter, SubTurn/2]`. A feature carrying a
  lattice orbital direction (a skeleton body, belt, hazard, or
  capture-plausible detail feature — extra body, anomaly, ruin) reads its
  prograde/retrograde side from `sign(f.Orbit.Dir)`, never re-rolling it on
  the continuous stream; a moon or the station (no lattice direction) reads
  its side from `DominantOrbitDirection(seed)`. Only the jitter magnitude
  is drawn from the continuous stream. Tests: every generated inclination
  falls inside one of the two bands, never strictly between them; a
  retrograde/prograde pair at the same node has opposite-signed vertical
  `cross(localOffset, localVelocity)` components, each non-zero (never a
  `Y == 0` assertion); a feature's continuous side agrees with the sign of
  its own lattice `Dir`; `RetrogradeChance` 0 and 1 sweeps (system-interior:
  *A Retrograde Orbit Is Expressed By Inclination, Never By a Non-Positive
  Period*).
- [ ] 3.7 Record the **exhaustive** `fixtures/system/cases.json` families:
  `continuousRadius` (integer orbital index `[0, 64]`, 65 inputs) and
  `starSizeForClass` (the 7 classes in `StarClassWeights`, enumerated in
  their recorded order, plus one unrecognized-class input pinning the
  default; 8 inputs) — per Decision 13's per-family sweep table.
- [ ] 3.8 Record the **pinned randomized** `keplerPeriodMs` fixture family:
  splitmix64 on a pinned `int64` seed, box `[1.0, 2000.0]`, 100,000 cases,
  draw mapping `lo + float64(f*(hi-lo))` with `f = float64(u >> 11) *
  0x1p-53`, one generator word per case, SHA-256 digest over the
  newline-joined canonical (`strconv.FormatFloat(v, 'b', -1, 64)`)
  serialization, asserted byte-for-byte on both `GOARCH` legs.

## 4. Generator emission

- [x] 4.1 `Feature` gains `Space *space.Orbit` (`firestore:"-"`),
  `SpaceDoc map[string]any` (`firestore:"spaceOrbit,omitempty"`), and
  `Size float64` (`firestore:"size,omitempty"`); a belt feature additionally
  gains `Width float64` (`firestore:"width,omitempty"`, strictly positive on
  belts, absent on every other feature type); `SystemInterior` gains
  `Extent float64`.
- [x] 4.2 Every feature `Generate` produces (star, skeleton bodies, moons,
  belts, hazards, detail features) gets a continuous element set (or none,
  for the star) and a size, drawn from the continuous stream, parented
  within the same interior. A belt additionally computes and persists
  `Width = BeltWidthFraction × baseRadius` (`BeltWidthFraction = 0.06`,
  full radial thickness, not a half-width) at generation time — never
  re-derived on read (system-interior: *Interiors Emit Continuous Orbital
  Elements For Every Body*, *A Generated Parent Chain Never Exceeds the
  Resolver's Depth Bound*, *A Belt's Members Are Discrete Mineable Bodies On
  a Shared Radius*).
- [x] 4.3 The DAO calls `space.EncodeOrbit` on write and `space.DecodeOrbit`
  on read; a feature whose `SpaceDoc` fails to decode is omitted and logged
  with **both the system id and its own feature id**, mirroring
  `featureRingOK`'s existing guard — never failing the whole read. Treat a
  non-star feature whose document carries no `SpaceDoc` key at all as this
  same decode-failure case (never as a legitimate parentless body — that
  reading is reserved for the star alone) (system-interior: *An Interior
  Predating This Capability Fails Closed, Never Silently*, *Interior Feature
  Decode Validates Its Orbital Element Set...*).
- [x] 4.4 `SystemInterior.Extent = ContinuousRadius(params.Radius)`,
  persisted at generation time.
- [x] 4.5 Add the five Decision 14 calibration tests in `system`, each
  reading the other package's live constant, never a copied literal:
  (a) `ContinuousRadius(0) > disclosure.PassiveRange`; (b) the degenerate
  single-body-at-ordinal-0 system's outermost-equals-innermost skeleton
  radius `> disclosure.PlumeFloor`; (c) `space.StarClearanceRadius(max(StarSize
  table)) < BaseOrbitRadius`; (d) `1 + BeltWidthFraction/2 < RadiusGrowth`;
  (e) the galaxy's configured `MaxRings - 1 <= GenerationParams.Radius`
  (system-interior: *Generated Orbits Satisfy Their Cross-Capability and
  Internal Clearance Invariants*, including its added "No skeleton ring can
  exceed the index Extent is computed at" scenario).
- [ ] 4.6 Record the `interiorContinuousElements` fixture family — the
  whole generated element set for a seed, in generation order, with the
  **pinned randomized** 10,000-seed splitmix64-seeded sweep and its
  SHA-256 digest (Decision 13).
- [x] 4.7 Add a table-driven test asserting no generated feature id (star,
  skeleton body, extra, belt, moon, special, hazard) contains a `#`
  character — the reserved belt-member separator (system-interior: *A
  Belt's Members Are Discrete Mineable Bodies On a Shared Radius*, added
  scenario).
- [x] 4.8 Do **not** extend `fogFeatureDTO` (`backend/system/fog.go:16-34`)
  with `Space`/`Size` — this change makes no wire-shape change. Leave a code
  comment at the DTO stating the omission is deliberate (link 5 wires
  disclosure), so an implementer doesn't "helpfully" add the fields here.
- [x] 4.9 Implement the decode-omission fixpoint cascade in the interior-read
  path, run **after** `spliceStation` (the station is a candidate body in the
  cascade, not decoded alongside the DAO's own features — `spliceStation`
  runs later in the service, `system/service.go:81,121`): iterate the
  surviving non-star bodies (including the spliced station once present),
  dropping any whose orbit names a parent id not present among the
  survivors, or for which `space.Position` over the surviving set returns
  an error (which drops any cyclic, self-referencing, or over-deep stored
  chain), repeated to a fixpoint. Record each cascaded omission with
  both its own feature id and the id of the ancestor that caused it,
  distinguishably from a direct decode failure. Tests: omitting a gas giant
  also omits its moons; omitting a station's parent skeleton body also omits
  the station; a stored chain in which two features name each other as
  parents (or one names itself) is dropped rather than preserved; a
  hand-built, non-cyclic 5-node stored chain (star + 4 chained parents,
  exceeding `space`'s resolution depth) is dropped by the cascade rather
  than surviving with an unresolvable tail, since the swept-seed generator
  never produces a chain this deep; omitting a
  belt feature mints no members for it; every surviving body's parent chain
  resolves through `space.Position` with no error, over a swept seed set
  (system-interior: *A Feature Omission Cascades to a Fixpoint Through the
  Parent Chain*).

## 5. Belt member derivation

- [x] 5.1 `beltMemberOrbit(beltFeatureId, k)` — derives a member's radius
  (`baseRadius + (u − 0.5) × Width`, within the belt's stored full-width
  `Width`), phase, inclination jitter, and size (`BeltMemberSizeMin = 0.3`
  … `BeltMemberSizeMax = 0.9`) from `(beltFeatureId, k)` via the splitmix64
  finalizer; every member shares the belt's own period.
- [x] 5.2 Wire member synthesis into the body-table build (section 7), not
  into persisted generation output — the persisted interior stays one
  feature per belt, and synthesis runs only after the omission-cascade
  fixpoint (task 4.9) so a dropped belt mints no members
  (system-interior: *A Belt's Members Are Discrete Mineable Bodies On a
  Shared Radius*).
- [ ] 5.3 Record the **exhaustive** `beltMemberOrbit` fixture family: the
  realizable id space `feat-belt-0` … `feat-belt-7` × `k ∈ [0,
  AsteroidsPerBelt)`, 64 inputs, enumerated by belt index then `k`,
  ascending, with all output components (radius, phase, inclination, size)
  on one line — per Decision 13.

## 6. The station's continuous derivation

- [ ] 6.1 Extend `stations.DeriveOrbit`'s signature to accept the system's
  skeleton body count and the chosen parent's `galaxy.BodyType` (both
  galaxy-tier inputs, no store read) and return the station's continuous
  orbit alongside its existing lattice one.
- [x] 6.2 Implement the parent choice
  (`k = mix64(mix64(systemSeed)) mod skeletonBodyCount`), the type-keyed
  local-radius ceiling (`MaxFeatureSize(featureTypeForBody(parentType)) +
  space.InsertionStandoff(that ceiling) + StationStandoff` with
  `StationStandoff = 1.5`, giving 14.5 / 10.75 / 10.0 for gas giant / ice /
  rocky), `space.InsertionPeriod` for the period, and the
  `DominantOrbitDirection`-sourced inclination (never a lattice `Dir` — the
  station has none); implement the empty-skeleton star-parented fallback at
  the configured constant `StationFallbackRadius`, chosen so it is strictly
  greater than `space.StarClearanceRadius` evaluated at the star-size
  table's largest configured entry and strictly less than the interior's
  `Extent`. Export the law from `system`
  (`StationContinuousOrbit(galaxySeed, systemId string, skeleton
  galaxy.Skeleton) space.Orbit`); `stations.DeriveContinuousOrbit` delegates
  in one line — no new rule-bearing float law in `stations`. Test that
  `StationFallbackRadius` satisfies both bounds (trading-station: *A Station's
  Continuous Orbit Is Derived, Never Rolled*).
- [ ] 6.3 Test that the derived local radius is bit-identical whether or
  not the system's interior has ever been materialized (it never reads the
  interior's actual per-feature size draw). Record the **pinned randomized**
  `stationOrbit` fixture family (mixed integer/string domain: an `int64`
  galaxy seed from one generator word, a system id from the pinned corpus
  form `sys-%08d` over a recorded index box, a skeleton body count from
  `[1, MaxBodies]`, and a parent `galaxy.BodyType` from the recorded
  six-element ordered table; 50,000 cases; word-consumption order
  recorded); assert a healed re-derivation is identical and that resolution
  through `space.Position` succeeds within the depth bound.

## 7. Lane gates and `system.BodyTable`

- [ ] 7.1 Move gate synthesis to the bounded neighbourhood read
  (`galaxy.NeighborsOf` + `galaxy.GetLiveSystems`), sorted by destination
  system id (Decision 8) — no observable behaviour change to gate identity
  or order.
- [x] 7.2 `gateOrbit(systemCoords, neighbourCoords, extent)` — bearing via
  `space.PhaseIndexOf` on the horizontal projection between galaxy
  coordinates, radius `extent × GateRadiusFactor` (identical for every gate
  in the same system, never per-lane), `PeriodMs = 0` (motionless),
  star-parented, zero inclination and zero node (never a
  `DominantOrbitDirection`-sourced side, never an inclination jitter), size
  `GateSize = 1.2`. Handle the two named degenerate cases explicitly: a lane
  whose destination system is absent from the materialized set read yields
  **no gate** for that lane plus a record naming both the gate's own system
  id and the unreadable destination system id; a lane whose horizontal
  projection is exactly zero places the gate at `space.DefaultPhaseIndex`.
  Tests: every gate's continuous radius strictly exceeds the maximum
  star-frame distance among every non-gate body in the same system's table
  (a body-parented body's star-frame distance is its parent's radius plus
  its own local radius); every gate in a system with two or more lanes
  shares the identical radius; a gate derived in a retrograde-dominant
  system and one derived in a prograde-dominant system both carry zero
  inclination and zero node, with the resolved position unmirrored
  (system-body-table: *A Gate's Bearing Is Derived From the Galaxy Layout,
  Never Runtime Trigonometry*, *A Gate Is Motionless*, *A Gate Carries a
  Strictly Positive, Named Size*, *A Gate Sits Outside Every Generated
  Orbit*).
- [ ] 7.3 Record the **pinned randomized** `gateOrbit` fixture family:
  continuous R³ × R¹, box `[-200, 200]³` for each galaxy-coordinate
  endpoint and `[24, 1000]` for extent, 100,000 cases, word-consumption
  order `fromX, fromY, fromZ, toX, toY, toZ, extent`.
- [x] 7.4 `system/bodies.go`: `BodyTable` (unexported bodies map, starId,
  starSize, extent) implementing `space.Bodies`, with `StarId()`,
  `StarSize()`, `Extent()`, and `Ids()` returning a **deterministic total
  order**, identical across two builds of the same interior, station, and
  live lane set (never a bare `for k := range map` iteration); and
  `Service.BodyTable(ctx, systemID)` composing, in order, the interior read
  (which materializes an unmaterialized system through the same
  `GetOrCreateInterior` create-if-absent path — never a second, divergent
  answer to "what is in this system"), the station splice, the task-4.9
  decode-omission fixpoint cascade (over interior features and the spliced
  station together), belt member synthesis, and gate derivation
  (system-body-table: *One Table Resolves Every Body...*, *Body Identity Is
  System-Scoped...*, *The Table Enumerates Every Body It Resolves, In a
  Deterministic Order*, *The Star Is the Table's Only Parentless Body*).
  Test that `Ids()`'s enumeration exactly matches the set `Body` resolves,
  with no id omitted or fabricated; that a shared id string minted by two
  different systems resolves, in each table, to that table's own body with
  no cross-system leakage; and that two concurrent first builds of a
  never-before-read system converge on one persisted interior with both
  tables resolving the
  same bodies.
- [x] 7.5 Implement the three independent degradation paths: station-store
  failure omits only the station; lane-set read failure omits only gates;
  interior read failure fails the whole build (system-body-table: *The
  Table Degrades to Fewer Bodies Rather Than a Failed Build*).
- [x] 7.6 A compile-time assertion that `*BodyTable` satisfies
  `space.Bodies` and can construct a `disclosure.World`.
- [x] 7.7 Fail a `BodyTable` build with a named error, producing no table,
  when the interior yields no star body or a star whose size is not
  strictly positive — never substitute a default. Test both the
  missing-star and the zero/negative-size-star cases, and assert
  `StarSize()` on any successfully built table is always strictly positive
  (system-body-table: *A Table Refuses to Build Without a Positively-Sized
  Star*).
- [x] 7.8 Validate `SystemInterior.Extent` at the interior-read boundary
  `BodyTable` consumes: an absent or non-positive extent fails the whole
  build by name — treated the same as an interior-read failure, not a
  gate-only degradation — so gate derivation never computes a zero-radius
  gate from a zero extent (system-interior: *An Interior Predating This
  Capability Fails Closed, Never Silently*; system-body-table: *The Table
  Degrades to Fewer Bodies Rather Than a Failed Build*, added scenario).
- [x] 7.9 Test that a non-star feature whose document carries no `SpaceDoc`
  key at all is treated as a decode failure (omitted and logged with the
  system id and feature id) and never surfaces in a table as a second
  parentless body alongside the star (system-interior: *An Interior
  Predating This Capability Fails Closed, Never Silently*).
- [x] 7.10 Test that gate derivation reads only `galaxy.NeighborsOf` +
  `galaxy.GetLiveSystems` over the system and its immediate neighbours:
  gate ids, order, and count are unaffected by unrelated systems
  materialized elsewhere in the galaxy, and the number of systems/lanes
  read depends only on this system's own incident lanes (system-body-table:
  *Lane-Gate Derivation Cost Is Bounded Independent of Galaxy Size*).
- [x] 7.11 Emit a structured degradation record naming the system id and the
  omitted source (`station` or `lane gates`) exactly when the station-store
  read or the live lane-set read fails during a `BodyTable` build; emit no
  such record when the live lane set reads successfully and is empty
  (system-body-table: *A Degraded Build Is Recorded Distinguishably From
  Genuine Absence*).
- [x] 7.12 Test that a live lane-set read failure omits every lane gate for
  that system, not only the gate for the lane whose neighbour read failed
  (system-body-table: same requirement, whole-system-granularity scenario).
- [x] 7.13 Document `BodyTable` and `Ids()` in a doc comment as an
  unfiltered, requester-agnostic internal seam never to be serialized into
  any response, in whole, in part, or as a derived count/aggregate — a
  consumer needing positions for a response projects the table through a
  disclosure filter first. Add a unit test building a table for a system
  with unobserved features and uncharted lane destinations, asserting every
  such body and gate still resolves in the table regardless of any
  requester's fog state. Verify (grep) zero handler call sites reference
  `BodyTable`/`Ids()` directly (system-body-table: *The Body Table Is an
  Unfiltered Internal Seam, Never a Response*).
- [x] 7.14 Test that a `BodyTable` build for a system containing one feature
  with an undecodable `SpaceDoc` succeeds, omitting only that feature, and
  is not treated as the interior-read failure that fails the whole build
  (system-interior: *Interior Feature Decode Validates Its Orbital Element
  Set...*, added scenario).
- [x] 7.15 Test that no body in a successfully built table — star, interior
  feature, belt member, station, or gate — ever has a non-positive size
  (system-body-table: *A Table Contains No Body With a Non-Positive Size*).
- [x] 7.16 Test, over a swept set of generated seeds, that every body a
  successfully built table returns from `Body`/`Ids` resolves through
  `space.Position` with no error, including after a decode-omission
  cascade has dropped one or more descendants (system-body-table: *Every
  Body a Built Table Contains Resolves Through space.Position*).

## 8. `galaxy-generation` skeleton ordinal clarification

- [x] 8.1 Update the doc comment on `galaxy.Body.Ring` (and any docstring
  referencing it) to state it is an ordinal orbital position ascending
  outward, not a lattice ring or a distance — no code or behavior change,
  since the field's type and generation are unchanged.

## 9. Determinism gates

- [x] 9.1 Audit every new multiply-add in the generation math (radius loop,
  Kepler expression, size/jitter scalings, belt-member derivation, gate
  bearing) for an explicit `float64(...)` conversion around each product.
  Acceptance: zero new arm64 `FMADDD`/`FMSUBD` sites in `backend/system`
  (`check-fma-contraction.sh` already builds the whole module).
- [x] 9.2 Confirm `check-transcendental.sh` passes with no new unreviewed
  call sites (`system` is already in `RULE_BEARING_GO_PACKAGES`; the
  `pinned` pragma is already accepted vocabulary).
- [ ] 9.3 Assert every `fixtures/system/cases.json` family (`continuousRadius`,
  `starSizeForClass`, `beltMemberOrbit` exhaustive; `keplerPeriodMs`,
  `gateOrbit`, `stationOrbit`, `interiorContinuousElements` pinned
  randomized — sections 3, 4, 5, 6) byte-for-byte on both `GOARCH=arm64`
  and `GOARCH=amd64`/`GOAMD64=v1`. Record `_meta.generatedOn.jsRuntime`
  with the stated "no JS leg by design" sentence.
- [x] 9.4 Add `./system/` to the amd64 cross-target package enumeration in
  `.gitlab-ci.yml` (alongside `./board/` and `./space/`, `.gitlab-ci.yml:342-352`)
  — without this, this change's byte-for-byte fixture assertion never runs
  in CI, even though the local suite enforces it. (`fixtures/**/*` at
  `.gitlab-ci.yml:74-76` is already family-agnostic and needs no edit for
  `fixtures/system/**` specifically.)
- [ ] 9.5 Add the `system-arm64.test` build-and-run to the qemu block
  (`.gitlab-ci.yml:358-367`), alongside `board-arm64.test` and
  `space-arm64.test`, and verify the test-runner image actually provides
  `qemu-aarch64-static`/`qemu-aarch64` (rebuild via
  `infra/docker/build-test-runner.sh` if it does not) — the block currently
  prints a skip and exits 0 when qemu is absent, which asserts nothing on
  that leg while looking green.
- [ ] 9.6 **Hard stop**: if any `fixtures/system/` family or the
  lattice-identity golden test (2.3) does not go green byte-for-byte on both
  Go build-target legs, stop and do not proceed to link 4. Until 9.4 and 9.5
  land, this stop rule is enforced only by the local `/check` gate — it is
  NOT yet a CI-enforced gate, since `./system/` is absent from both legs of
  the pipeline's cross-target matrix.

## 10. Validation

- [x] 10.1 `go test ./backend/space/... ./backend/system/... ./backend/stations/... -short`
  green.
- [x] 10.2 `python3 .claude/skills/code-quality-checks/check.py --backend-tests`
  green (FMA + transcendental + fixture path filters).
- [x] 10.3 `openspec validate add-orbital-system-bodies --strict` passes.
