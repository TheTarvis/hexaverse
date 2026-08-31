## Why

`backend/system`'s interior generator is architecture-dependent today: four
richness-computing expressions in `generator.go` fuse a multiply into an add
on `arm64` and do not on `amd64`/`GOAMD64=v1`, so 13 of roughly 500
`Resource.Richness` values (over `add-orbital-system-bodies`'s existing
80-case sweep) differ by 1 ULP depending on which machine materialized the
interior. This is a pre-existing bug, not one introduced by
`add-orbital-system-bodies`; that change's own widened local gate is what
exposed it. Stated plainly, because two prior reports got this wrong: the
byte-for-byte cross-target rule is currently enforced for `backend/system` in
**zero** places (not "asserted locally, pending CI" as previously claimed),
and `fixtures/system/` does not exist on any architecture. The enforcement
surface is **six** hand-maintained sites, not the three first reported —
`.gitlab-ci.yml`'s amd64 leg, its qemu arm64 leg (which prints a skip and
exits 0 when the runner image lacks `qemu-user`, i.e. green-by-absence),
`check.py`'s two `go test` command strings, and two changed-file predicates
inside `check.py` that decide whether those command strings and the mirror
check ever run at all — and `./system/` is in none of them. This change fixes
the generator and closes the enforcement gap before link 4 of the
continuous-space chain starts; link 4 does not begin until this lands.

## What Changes

- Guard the four richness-computing expressions in `backend/system/generator.go`
  (lines 129, 131, 247, 308) with explicit `float64(...)` conversions so
  arm64 and amd64/`GOAMD64=v1` round identically. Verified: with the guards
  applied, arm64 emits zero `FMADDD`/`FMSUBD` for the package and its
  lattice-projection digest converges to
  `e72176868246e64134791e642a9e495fcaa7e538f62f073b1e9d8078a006fbb6` on both
  targets — the value amd64 already produces today. **BREAKING** for
  already-generated worlds: arm64 was the outlier, so this fix moves every
  arm64-materialized interior's richness values (dev/emulator data only; prod
  is unused). Remedy is wipe-and-reseed (`make seed`, plus `cmd/seed
  start-area` if in use), never a backfill — no already-appended `mine` delta
  can be reconciled against a richness value computed by different
  arithmetic than the one it was appended against.
- Remove `fixtures/determinism-register.json` entries `[2..5]` (the four
  `system` sites) and update `docs/defects/2026-08-25-remaining-fma-sites.md`
  §1 to record the resolution — the doc's overall `**Status:** open` line
  stays open (its `market` and `mine` sites remain unfixed). This is
  independently verified, not caught by the check as a safety net:
  `check-fma-contraction.sh` treats a registered site that no longer emits
  FMA as a **warning**, not a failure — only a defect doc whose `**Status:**`
  line stops reading `open` invalidates an entry — so forgetting to remove
  these four entries would pass with four warnings, leaving four live
  suppressions pinned at exactly the lines this change fixes. Correct or
  annotate that doc's "Recommended fix" section, which proposes quantizing
  richness to basis points: quantizing an already-divergent float only
  lowers the probability the divergence survives rounding, converting a
  reliable 13-in-500 disagreement into a rare one that passes every test and
  then surfaces in one player's world, and it introduces a bare rounding
  call into a package `check-transcendental.sh` lints against for exactly
  that. The remedy is the explicit `float64(...)` conversion applied here.
- Retire `lattice_identity_test.go`'s const-digest golden master, whose
  failure message ("the second RNG stream has perturbed the first") is false
  on amd64 today — there is no stream leak, only the richness divergence this
  change fixes. Extract an unexported `generateWithStreams(seed int64, r, r2
  *rand.Rand, region string, skeleton galaxy.Skeleton, params
  GenerationParams) GeneratedInterior` (`Generate` delegates to it,
  constructing streams rather than reseeding one). The **primary** replacement
  assertion is present-vs-absent: generate the swept case set with continuous
  draws present and again with `r2 == nil` ("absent"), asserting the
  lattice-tier projection is byte-identical between the two runs. This is the
  same assertion `add-orbital-system-bodies`'s in-flight `system-interior`
  delta already specifies ("Adding continuous elements leaves every lattice
  placement unchanged"), and it is what actually catches a leak where
  continuous-element code draws from the lattice stream — verified against an
  injected one-line leak that a same-lattice-seed/two-continuous-seed
  property test does **not** catch. That two-seed property is **kept, but only
  as a supporting scenario**: it costs nothing and reads faster, but it is
  blind to a leak that shifts the lattice stream identically regardless of
  the continuous seed's value, so it must never be described as covering that
  class. A third, independent guard — a lattice draw-count pin, recorded per
  case in the `interiorElements` fixture family — catches the one leak shape
  present-vs-absent cannot see: a leak in the *last* continuous draw, after
  every lattice draw has already happened. `TestClampRing_StaysMonotonicNonDecreasing`,
  in the same file, is unrelated and stays.
- Record `fixtures/system/cases.json` with four families —
  `continuousRadius`, `starSizeForClass`, `beltMemberOrbit` (all exhaustive
  and enumerable), and `interiorElements` (the pinned 80-case sweep covering
  the lattice projection, the continuous element set, and the lattice draw
  count — the family that subsumes the retired golden master) — each
  carrying named per-case canonical output lines and a swept digest, and
  asserted by a new `backend/system/fixtures_test.go` (UPDATE_FIXTURES-gated
  recording, assertion by default, following `backend/space/fixtures_test.go`'s
  shape) so the fixture is actually read on every run, not merely committed.
  Also record `fixtures/system/mirror-map.json` in anti-mirror mode — `system`
  is designated Go-sole-authority, per shipped `cross-stack-determinism`,
  following the existing `fixtures/space/mirror-map.json` precedent rather
  than inventing a new mechanism. Three declared families (`keplerPeriodMs`'s
  full box, `gateOrbit`, `stationOrbit`) are deferred, routed as named
  `inventory` entries in `fixtures/system/mirror-map.json` plus a line in
  `docs/plans/continous_space/chain.md`'s Link 4 section — the owner is link
  4, `migrate-fleet-to-continuous-burns` (orchestrator ruling), which has no
  `openspec/changes/` folder yet, so the obligation lives in the fixture file
  and the chain doc until it does. This is a declared, spec-bound home with a
  named owner, not a passing check — `anti_mirror` never reads `inventory`.
- Enroll `./system/` in all **six** hand-maintained enforcement sites, in one
  commit, strictly after the fix → verify → record sequence lands (enrolling
  before the fix is exactly what turned the gate and pipeline red during
  `add-orbital-system-bodies`): `.gitlab-ci.yml`'s amd64 leg, its qemu arm64
  leg, `check.py`'s two `go test` command strings, `check.py`'s
  `determinism_trigger` changed-file predicate, `check.py`'s `mirror_trigger`
  changed-file predicate, and a generalized `system` pass in
  `check-mirror-map.sh`. In the same commit: add `./polar/` to
  `.gitlab-ci.yml`'s amd64 and qemu legs (already enforced by `check.py` but
  missing from CI — a pre-existing asymmetry this change closes in passing);
  add `backend/polar/**` and `backend/space/**` to `determinism_trigger`
  (already enrolled in the command but missing from the predicate that runs
  it — the same class of gap as `system`); and correct `mirror_trigger`'s
  stale `frontend/lib/hex` clause, a directory the polar migration deleted,
  since leaving a known-dead clause in a change whose subject is gate honesty
  is self-contradictory.
- Make the CI qemu arm64 leg's degradation legible instead of merely present.
  `.gitlab-ci.yml:366` already prints a skip line naming the condition and a
  remedy when the runner image lacks `qemu-user` — it does not exit silently,
  as a prior report claimed. What it lacks is a greppable marker, the names
  of the packages that went unchecked, and framing as a downgrade rather than
  a routine skip. Add the literal marker `DETERMINISM ARM64 LEG UNASSERTED`,
  the explicit package list (`./board/ ./space/ ./system/ ./polar/`), and the
  exact remedy command (`infra/docker/build-test-runner.sh`) to the else
  branch. It does not hard-fail — that would red a pipeline no code change
  here can clear.

## Impact

- Affected specs: `cross-stack-determinism`, `system-interior`
- Affected code: `backend/system/generator.go`,
  `backend/system/lattice_identity_test.go`, `backend/system/fixtures_test.go`
  (new), `fixtures/determinism-register.json`, `fixtures/system/cases.json`
  (new), `fixtures/system/mirror-map.json` (new),
  `docs/defects/2026-08-25-remaining-fma-sites.md`,
  `docs/plans/continous_space/chain.md`, `.gitlab-ci.yml`,
  `.claude/skills/code-quality-checks/check.py`,
  `.claude/scripts/check-mirror-map.sh`
- `observation-fog-and-scan` is a touched surface, not merely `system-interior`:
  richness is copied out of the interior into persisted fog memory
  (`system/fog_source.go:84` → `observation/model.go:128`,
  `firestore:"richness"`), and a `remembered`-band read serves that frozen
  copy back forever. The wipe-and-reseed below must drop the observation
  store together with `galaxies/`, not one without the other.
- Explicitly NOT in scope, and not claimed as done: `backend/system` is not
  made architecture-independent end to end — it consumes `galaxy.Skeleton`,
  and the open `opensimplex-go` residual (273 arm64 FMA sites, deciding which
  systems exist at all, tracked in
  `docs/defects/2026-08-25-galaxy-generation-arch-divergence.md`) is upstream
  and untouched. Only the interior generator's own arithmetic, given a
  skeleton, is pinned here. The CI arm64 leg remains **unasserted** after this
  change ships — enrolling `./system/` (and `./polar/`) in it changes nothing
  until Travis rebuilds the runner image (`infra/docker/build-test-runner.sh`,
  needs Artifact Registry push access); that is recorded as his environment
  task, not a task this change performs. Replacing the six hand-maintained
  enrollment copies with one declared package list is also out of scope,
  recorded as an open question with no owner yet. Separately, and left
  uncorrected by this change: counting every hand-maintained package list
  touching this capability (the six enrollment sites above, plus `check.py`'s
  `DETERMINISM_GO_PACKAGES`, plus `check-transcendental.sh:82`'s
  `RULE_BEARING_GO_PACKAGES`) arrives at eight lists, seven of which need no
  edit — `DETERMINISM_GO_PACKAGES` already contains `system`. Its own comment
  claims it must match `check-transcendental.sh`'s own gate; it does not:
  `check-transcendental.sh:82` also carries `polar`, `space`, and
  `disclosure`, which `DETERMINISM_GO_PACKAGES` lacks. Recorded as a known
  open item, not resolved by this change. This is an unplanned insert
  before link 4 of the continuous-space rewrite chain; link 4 does not start
  until this change lands.
