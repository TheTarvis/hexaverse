## 1. Fix

- [x] 1.1 Wrap `generator.go:129`'s anomaly-richness product
      (`0.6*r.Float64()*dial.RichnessMult`) in an explicit `float64(...)`
      conversion, with the codebase's standard "do not simplify — a bare
      local does NOT inhibit fusion" comment.
- [x] 1.2 Wrap `generator.go:131`'s ruin-richness product
      (`0.5*r.Float64()*dial.RichnessMult`) the same way.
- [x] 1.3 Wrap `generator.go:247`'s belt-primary-lode richness product
      (`0.5*r.Float64()*dial.RichnessMult`) the same way.
- [x] 1.4 In `rich()` (`generator.go:308`), guard the inner add's product
      (`(hi-lo)*r.Float64()`) with `float64(...)`, and guard the outer
      product (`(...) * mult`) defensively as well, so a later edit adding a
      downstream term cannot silently re-open the site.

## 2. Verify

- [x] 2.1 `GOOS=linux GOARCH=arm64 go build -gcflags=-S ./system/ | grep -E
      'FMADDD|FMSUBD'` prints nothing.
- [x] 2.2 With the four register entries `[2..5]` still present, confirm
      `bash .claude/scripts/check-fma-contraction.sh` still passes (sites
      are gone; entries are about to become stale — do not remove them
      before this check).
- [x] 2.3 Confirm the generator's output is byte-identical between
      `GOARCH=arm64` and `GOARCH=amd64 GOAMD64=v1` over the **full**
      `interiorElements` projection — the lattice projection AND the
      continuous element set (`Extent`, per-feature `Size`, `Width`,
      `Space`) — not the lattice projection alone (covers `system-interior`
      › Interior Generation Reproduces Across Build Targets, both
      scenarios). A passing test suite alone is not verification — recorded
      cases can dodge divergent inputs; this step is the compiler-output and
      cross-target-run check, not a test run. (Measured in design.md: the
      continuous surface converges to `4cdcb881167666cb2b1ed9c44d497e4fef9404d73280adaa87473cd1e0bfcfa8`
      on both targets — confirm this step is what establishes that, not an
      assumption carried over from the lattice-only sweep.)
- [x] 2.4 Remove entries `[2..5]` from `fixtures/determinism-register.json`
      and run `check-fma-contraction.sh` again. Confirm **both** that it
      exits 0 **and** that its output contains **no**
      `WARN: registered cross-target site 'backend/system/generator.go:`
      line. The WARN grep is the assertion that proves the register was
      discharged — the exit code alone does not: a registered site that no
      longer emits FMA prints a warning, not a failure (only a defect doc
      whose `**Status:**` line stops reading `open` invalidates an entry), so
      forgetting this removal would exit 0 with four warnings live.
- [x] 2.5 Update `docs/defects/2026-08-25-remaining-fma-sites.md` §1 to
      record the `system` sites as resolved, in the style §2's
      `siteselection.go` resolution already uses. The doc's overall
      `**Status:** open` line stays `open` — its `market` and `mine` sites
      remain unfixed; only §1 changes.
- [x] 2.6 Correct or annotate that doc's "Recommended fix" section, which
      currently proposes quantizing richness to basis points: state plainly
      that quantizing an already-divergent float only lowers the probability
      the divergence survives rounding (converting a reliable disagreement
      into a rare one that surfaces in exactly one player's world) and would
      introduce a bare rounding call `check-transcendental.sh` lints
      against; the remedy applied is the explicit `float64(...)` conversion
      from Section 1.
- [x] 2.7 Steps 2.4–2.6 land in the same commit as Section 1's fix (and with
      Section 3 and Section 4 — see Decision 7 / task 4.8 below, this is a
      four-section commit, not a two-task one). This is **not** because a
      stale register entry would fail `check-fma-contraction.sh` by
      design — it would not, per 2.4's note. Discharging the register is an
      independently verified obligation: the assertion is the *absence* of
      the `WARN: registered cross-target site 'backend/system/generator.go:`
      lines (task 2.4), not the script's exit code.

## 3. Replace the golden-master test

- [x] 3.1 Extract `Generate`'s body into an unexported
      `generateWithStreams(seed int64, r, r2 *rand.Rand, region string,
      skeleton galaxy.Skeleton, params GenerationParams) GeneratedInterior`;
      `Generate` becomes `generateWithStreams(seed, newRand(seed),
      newRand(continuousSeed(seed)), region, skeleton, params)`. Streams are
      threaded as parameters (not seeds) because both 3.2's nil-stream mode
      and 3.5's counting stream need to *construct* a `*rand.Rand`, and
      neither should require a test-only knob in production code. `seed`
      stays a parameter because `DominantOrbitDirection(seed)` and
      `Interior.Seed` consume it directly.
- [x] 3.2 Add the three guards `r2 == nil` ("continuous draws absent") mode
      needs — the set is closed, verified by making the change and
      compiling — and comment each with the scenario it serves, so a future
      cleanup does not delete load-bearing test infrastructure as dead code:
      - `continuousStarParented` early-returns on `r2 == nil` (covers the
        skeleton-body, extra-planet, special, belt, and hazard call sites).
      - the moon loop in `Generate` skips only `generator.go:104-115`'s
        `Space`/`Size` block when `r2 == nil`; the moon's
        `resourcesFor(BandOuter, FeatureMoon, dial.RichnessMult, r)` draw
        (`generator.go:102`) and the `append` that adds the moon feature must
        still run — they consume the **lattice** stream, and absent-mode must
        consume it identically. The tempting wrong repair is narrowing the
        projection to exclude moons instead; that silently guts the primary
        assertion (3.3) rather than fixing the skip.
      - `beltFeature`'s `f.Width = float64(BeltWidthFraction *
        f.Space.Radius)` guards on `f.Space != nil` first — it panics on
        nil otherwise, the one non-obvious site, found only by running it.
- [x] 3.3 Add the **primary** assertion: over the existing 80-case swept set,
      generate each case with continuous draws present (a live `r2`) and
      again with them absent (`r2 == nil`), and assert every feature's
      lattice ring, start angle, direction, footprint, resources, effects,
      id, and generation order are identical between the two runs, for every
      case (covers `system-interior` › Lattice Placement Is Independent Of
      The Continuous Stream › "Lattice placement is unchanged whether
      continuous draws are present or absent"). Before trusting this as the
      replacement, verify it **fails** against the one-line leak design.md
      Decision 2 describes (`m.Size = drawFeatureSize(FeatureMoon, r)`
      instead of `r2`, in the moon loop) — it must, since this is the
      assertion the retired golden master existed to make.
- [x] 3.4 Add the two-seed property as a **supporting**, not primary, test in
      the same file: same lattice seed, two different continuous seeds,
      asserting (a) the lattice projection is identical (covers "Differing
      continuous seeds leave the lattice projection unchanged") and (b) at
      least one feature's continuous elements differ between the two runs
      (covers "Differing continuous seeds produce differing continuous
      elements"). Do not name or comment this test as covering the
      stream-leak class — design.md Decision 2 demonstrates both of its
      scenarios pass with that exact leak live; it is retained because it is
      cheap and states a differently-readable property, not because it
      substitutes for 3.3.
- [x] 3.5 Add the lattice draw-count guard: a `countingSource` wrapping
      `rand.Source64`, incrementing a counter on every draw. It **must**
      embed `rand.Source64` and implement **both** `Int63` and `Uint64` —
      `rand.Rand` type-asserts for `Source64`, and a wrapper missing either
      method would silently change the sequence the moment any lattice draw
      goes through `Uint64`; the byte-for-byte assertion below is what makes
      that failure loud today. Assert the counted run reproduces the uncounted run's
      projection byte-for-byte (so that mistake fails loudly instead of
      quietly re-recording a different world), then record the draw count
      per case as part of the `interiorElements` fixture family (task 4.5).
      This is an independent guard: 3.3 detects a leak by the downstream
      shift it causes, so a leak in the *last* continuous draw — after every
      lattice draw is already done — moves nothing and slips past it; the
      draw count catches it.
- [x] 3.6 Delete `lattice_identity_test.go`'s `wantLatticeDigest` constant
      and its "the second (continuous) RNG stream has perturbed the FIRST"
      `Fatalf` message, in the same commit that adds the `interiorElements`
      fixture family (task 4.5) — never in a commit that leaves the package
      with neither pinning mechanism in place (design.md Decision 7: the
      const fails on **both** targets the instant Section 1's fix lands, so
      there is no commit at which deferring this deletion keeps the suite
      green anywhere). Covers `cross-stack-determinism` › "Recorded
      Cross-Target Values Live In Fixtures, Not Test Constants" › "A retired
      test-file constant is replaced by a fixture family" and "A hand-copied
      digest constant in a test file is a violation" — this task is what
      removes the violation the second scenario describes.
      `TestClampRing_StaysMonotonicNonDecreasing`, in the same file, is
      unrelated to this retirement and stays untouched.

## 4. Record

- [x] 4.1 Record `fixtures/system/cases.json` `_meta`: `generatedOn.goarch`
      and `.goamd64`, `buildTargetMatrix` ("GOARCH=arm64 and GOARCH=amd64
      with GOAMD64=v1"), `serialization`, and a stated `jsRuntimeLeg` of
      "none — `backend/system` is Go-sole-authority with no TypeScript
      mirror by design."
- [x] 4.1b Record `fixtures/system/mirror-map.json` in **anti-mirror** mode,
      following `fixtures/space/mirror-map.json`'s shape exactly: a
      `$comment` stating the Go-sole-authority designation, `sharedNames: []`,
      a `coverage` array over the package's **rule-bearing surface only** —
      the functions in `generator.go`, `continuous.go`, `belt.go`,
      `bodies.go`, `params_continuous.go`, `station_continuous.go` — each
      `family:<name>` or `inventory`. DAO, handler, service and generated
      mock functions are not rule-bearing and are out of scope. State in the
      file's `$comment` that `anti_mirror` reads only `sharedNames`, and that
      for `system` it does not read even that (the `frontend/lib/system`-
      absent branch returns before opening the map): `coverage` and
      `inventory` here are declared, greppable documentation with a named
      owner, not an asserted check. Route the three deferred families as
      `inventory` entries:
      - `keplerPeriodMs` (full R¹ box), `gateOrbit`, `stationOrbit` — each
        naming `migrate-fleet-to-continuous-burns` (link 4) as
        `expectedChange`, per the orchestrator's ruling. Word these
        honestly: `anti_mirror` never reads `inventory` (only `check_mirror`
        does, and `system` has no `pairs`), so this is a declared,
        greppable, spec-bound home with a named owner — **not** a failing
        check, and must not be described as one.
- [x] 4.1c Add a line to `docs/plans/continous_space/chain.md`'s Link 4
      section (`migrate-fleet-to-continuous-burns`) naming the three deferred
      fixture families as an obligation that link inherits, so the
      obligation is visible from the chain document, not only from
      `mirror-map.json`.
- [x] 4.2 Record the `continuousRadius` family: exhaustive sweep, index
      domain `[0, 64]` (65 inputs), named cases plus a swept digest.
- [x] 4.3 Record the `starSizeForClass` family: exhaustive sweep over `O B A
      F G K M` plus one unrecognized input (8 inputs), named cases plus a
      swept digest.
- [x] 4.4 Record the `beltMemberOrbit` family: exhaustive sweep over
      `feat-belt-0…7 × k ∈ [0, AsteroidsPerBelt)` (64 inputs), named cases
      plus a swept digest.
- [x] 4.5 Record the `interiorElements` family, reusing
      `lattice_identity_test.go`'s existing 80-case cross (4 skeletons × 4
      regions × 5 seeds): named cases plus a swept digest, covering the
      lattice projection, the continuous element set, **and the lattice draw
      count** (task 3.5), in generation order (covers `system-interior` ›
      Interior Generation Reproduces Across Build Targets › "The same seed
      produces the same interior on both targets", and is the fixture that
      subsumes the retired golden master).
- [x] 4.5b Add `backend/system/fixtures_test.go` asserting every recorded
      case and every family's swept digest in `fixtures/system/cases.json`
      byte-for-byte, following `backend/space/fixtures_test.go`'s shape
      (`UPDATE_FIXTURES=1` gates recording; assertion runs by default). This
      test is what Section 5's enrollment sites actually run — without it,
      the fixture file is committed but nothing reads it, and an
      implementer could tick every box in this file while shipping a
      one-shot recorder with no enforcement behind it.
- [x] 4.6 Record all four families, and write 4.5b's test, only after
      Section 1's fix is verified on both targets (per Section 2) and
      Section 3's const deletion (3.6) has landed — recording before the fix
      lands would freeze arm64's fused answers into the contract, and
      confirming the suite is "green" before 3.6 is unsatisfiable
      (`wantLatticeDigest` fails on **both** targets the instant the fix
      lands; design.md Decision 7). Confirm `go test ./system/ -short` is
      green on both `GOARCH=arm64` and `GOARCH=amd64 GOAMD64=v1` **after**
      3.6, immediately before committing the fixture file.
- [x] 4.7 The three deferred families are tracked via 4.1b's
      `mirror-map.json` inventory entries and 4.1c's chain-doc line — not as
      a future tasks.md line item, since `migrate-fleet-to-continuous-burns`
      has no `openspec/changes/` folder yet to carry one.
- [x] 4.8 Sections 1–4 (this task file's tasks 1.1 through 4.7) land as
      **one commit** (design.md Decision 7): any split leaves a commit where
      `backend/system`'s test suite is red on both build targets, because
      the fix (Section 1) and the golden-master deletion (3.6) must be
      atomic with each other and with the fixture that replaces it (Section
      4). Section 5 (enrollment) is a second, separate commit.

## 5. Enroll

- [x] 5.1 Add `./system/` and `./polar/` to `.gitlab-ci.yml`'s amd64
      enumeration (~:342-352). (`./polar/` is already enforced locally by
      `check.py` but missing from CI — a pre-existing asymmetry this change
      closes in the same edit.)
- [x] 5.2 Add `./system/` and `./polar/` to `.gitlab-ci.yml`'s qemu arm64
      leg (~:358-367).
- [x] 5.3 Add `./system/` to `.claude/skills/code-quality-checks/check.py`'s
      two `go test` command strings (~:1078, ~:1087):
      `./board/ ./polar/ ./space/` → `./board/ ./polar/ ./space/ ./system/`.
- [x] 5.4 Add `backend/system/**` to `check.py`'s `determinism_trigger`
      changed-file predicate (~:1426-1432). In the same edit add
      `backend/polar/**` and `backend/space/**`, which are already enrolled
      in 5.3's command strings but missing from this predicate — the same
      class of gap `system` would otherwise repeat: enrolling a package in
      the command a gate does not invoke is exactly the false-enforcement
      pattern this change exists to end.
- [x] 5.5 Add `backend/system/**` to `check.py`'s `mirror_trigger`
      changed-file predicate (~:1435-1441). In the same edit, repoint the
      stale `frontend/lib/hex/**` clause to `frontend/lib/board/**` and
      `frontend/lib/polar/**` — the two TypeScript mirrors `check_mirror`
      actually compares against. Deleting the clause is **not** the fix: it
      leaves a mirror-side edit unable to trigger the mirror check at all.
      `check.py:258` carries the identical dead clause in
      `check_transcendental`'s `seam_files` filter; correct it in the same
      edit. In the same edit also add `backend/polar/**`, which
      `check_mirror polar` covers but this predicate never triggers on — the
      same gap 5.4 closes for `determinism_trigger`.
- [x] 5.6 Generalize `.claude/scripts/check-mirror-map.sh`'s
      `anti_mirror_space` function into a parameterized `anti_mirror <label>
      <map> <go_dir> <ts_dir>`, preserving its current behavior exactly, and
      call it twice: once for `space` (unchanged arguments) and once for
      `system` (`fixtures/system/mirror-map.json`, `backend/system`,
      `frontend/lib/system`). `frontend/lib/system` does not exist, so the
      `system` call takes the function's existing directory-absent branch
      and prints a stated trivial pass — the same shape `space` had before
      its own TypeScript directory existed.
- [x] 5.7 Confirm 5.1–5.6 land in **one commit**, separate from task 4.8's
      commit (design.md Decision 7), so a reviewer sees all six enrollment
      edits (four sites plus the `polar` CI addition plus the
      `check-mirror-map.sh` generalization) adjacent — the only thing that
      would have caught this change's own sites 4, 5, and 6 the first time.
      This commit is sequenced strictly after task 4.8's fixture-recording
      commit, never before (fix → verify → record → enroll). Section 6's
      commit may ride either.

## 6. CI qemu leg loud-failure

- [x] 6.1 Change `.gitlab-ci.yml`'s qemu arm64 leg's `else` branch (taken
      when the runner image lacks `qemu-user`) from its current skip line to
      one that also contains the literal greppable marker
      `DETERMINISM ARM64 LEG UNASSERTED`, names exactly which packages went
      unchecked (`./board/ ./space/ ./system/ ./polar/`), and names the
      command that clears it (`infra/docker/build-test-runner.sh`).
- [x] 6.2 Confirm the leg still does not hard-fail the pipeline when qemu is
      absent (per design.md Decision 4) — this step makes the degradation
      legible, it does not red the gate.
- [x] 6.3 Covers `cross-stack-determinism` › A Cross-Target Leg That Cannot
      Execute Reports Loudly, Not Silently (all three scenarios).

## 7. Environment task — Travis, not this change

- [ ] 7.1 **NOT performed by this change; recorded here so it is not lost.**
      Rebuild and push `infra/docker/test-runner.Dockerfile`'s image via
      `infra/docker/build-test-runner.sh` (it already installs
      `qemu-user-static` at line 10 — nothing to write, only to rebuild and
      push). Requires `GOOGLE_PROJECT`, authenticated `gcloud`, and Artifact
      Registry push rights that an implementing agent does not have. This
      change's claims must read "enrolled in all six sites; the CI arm64 leg
      is enrolled but unasserted pending the image rebuild" — never "asserted
      on both legs" — until this task is done.

## 8. Local world reset

- [ ] 8.1 After this change lands, clear local Firestore emulator data —
      dropping `galaxies/` **and** the observation store together (Decision
      6: dropping only one leaves fog memory serving pre-fix richness, since
      `system/fog_source.go:84` copies `Resource.Richness` into persisted
      `observation.ResourceReading` and a `remembered`-band read serves that
      frozen copy back forever) — and re-run `make seed` (plus `cmd/seed
      start-area` if `frontend/public/galaxy/start-area.json` is in use).
      This is a wipe-and-reseed, never a backfill: an already-generated
      arm64 interior's richness values move, and no already-appended `mine`
      delta can be reconciled against a value computed by different
      arithmetic than the one it was appended against. Any dev corporation
      re-spawns through the existing idempotent spawn path.
