## 1. Near-tie lane gate fixture case

- [x] 1.1 Construct a `selfX/selfY/neighborX/neighborY` pair whose bearing
      falls within ~1 ULP of exactly equidistant between two adjacent
      `RingHexes(GateRing(radius))` candidates (see design.md Decisions for
      how to derive such a pair).
      **Done (2026-08-25):** `(0, 0, 0, 100, 16)` — bearing exactly float64
      π/2, mathematically exactly equidistant between `(7,−13)` and
      `(6,−13)` by mirror symmetry; all atan2 inputs bit-identical across
      the seam.
- [ ] 1.2 Add it as a new case in the `laneGate` family, regenerated via
      `UPDATE_FIXTURES=1 go test ./board/... ` per
      `backend/board/fixtures_test.go`'s existing convention.
      **Deliberately deferred (2026-08-25):** the probe found the divergence
      1.4 anticipated, so recording this case would freeze Go's accidental
      winner and permanently fail the TS suite. The case lands with the
      `LaneGateHex` fix change — see the defect below. Per design.md, this
      is not a completion blocker for this change.
- [x] 1.3 Run both `backend/board/fixtures_test.go` and
      `frontend/lib/hex/fixtures.test.ts` against the regenerated fixture.
      **Done via temporary probe tests on the exact production functions**
      (fixture itself unchanged, per 1.2): Go `LaneGateHex(0,0,0,100,16)` →
      `(6,−13)`; TS `laneGateHex(0,0,0,100,16)` → `(7,−13)`.
- [x] 1.4 Record the outcome. If both languages select the same candidate,
      the scenario is confirmed as specified. If they diverge, this is a
      live production bug in `LaneGateHex`/`laneGateHex` (or in `GateRing`'s
      tie-break) — file it as a defect against `board-tactical-math`; do not
      silently loosen the fixture or the requirement to make it pass.
      **Outcome: DIVERGENCE.** Go's atan2 rounding splits the two deltas by
      one output-ULP (tie-break never fires → `(6,−13)`); V8's atan2 makes
      them bit-identical (tie-break fires → `(7,−13)`). Filed:
      `docs/defects/2026-08-25-lanegate-near-tie-divergence.md`, with the
      recommended integer cross-product fix. Fixture and requirement left
      untouched, as instructed.

## 2. Transcendental-drift enforcement mechanism (secondary check — see design.md's re-ranking)

- [x] 2.1 Implement the mechanism selected in design.md's Decisions section
      (recommended: a grep-based lint over `backend/board` and
      `frontend/lib/hex` flagging unreviewed calls to `sin`/`cos`/`tan`/
      `atan2`/`ln`/`log`/`exp`/`pow` outside an explicit allowlist of
      projection/sampling call sites and the one sanctioned `LaneGateHex`
      call site).
      **Done:** `.claude/scripts/check-transcendental.sh`, with the
      allowlist as colocated `determinism:allow(discretized|projection)`
      line pragmas (5 sites: 2× atan2 in `gate.go`, 2× in `gate.ts`,
      cos/sin in `pixel.ts`) so adding an exception is a visible,
      reviewable diff line.
- [x] 2.2 Wire the mechanism into `/check` (or the relevant per-directory
      test/lint command) so it runs on every change touching `backend/board`
      or `frontend/lib/hex`.
      **Done:** Check 8 in `check.py`'s changed-file validators
      (`check_transcendental`), same per-file JSON protocol as the other
      check scripts.
- [x] 2.3 Confirm the mechanism currently reports exactly the one sanctioned
      `atan2` call site (`LaneGateHex`/`laneGateHex`) and the projection call
      sites, and nothing else — a clean baseline run.
      **Done:** all 32 files in both packages pass (tests skipped by
      design); only the 5 pragma'd sites carry exceptions; negative probe
      (unpragma'd `math.Sin`) correctly fails with exit 2.
      **Note (2026-08-25):** this mechanism is textual and cannot see a
      contraction hazard (`a + b*c`) at all — it did not and could not have
      flagged `lerp` (`hex.go:73`), the site actually implicated in the
      `board.Line` divergence. Kept as a secondary, advisory check (see
      design.md's enforcement re-ranking); the primary mechanism for the
      larger hazard class is the cross-architecture differential run (Task
      4.4).
- [x] 2.4 Widen BOTH the pattern AND the scope gate of
      `.claude/scripts/check-transcendental.sh`. **A pattern change alone
      cannot reach these sites:** the check gates on package before it ever
      applies the pattern — `check-transcendental.sh`'s
      `backend/board`/`frontend/lib/hex` branch test, and `check.py`'s
      `seam_files` filter — so `mine/service.go`, `fleet/service.go` and
      `fleet/routing.go` return `pass` unread today. Widen the gate to the Go
      packages carrying rule-bearing values, or, if the scope is deliberately
      kept seam-only, give the Round clause an explicit scope in the spec and
      route those sites to the deviation register (Task 6.3) instead of to
      the check. Then widen the pattern to also
      flag a bare `math.Round`/`Math.round` call reaching a rule-bearing
      value, outside a colocated `determinism:allow(...)` pragma or a
      fixture case that exercises a negative half-integer input. This is
      the requirement's "The bare Round builtin diverges on every negative
      half-integer" scenario's observer — today's script does not match
      `Round`/`Floor`/`Trunc` at all (noted as a gap in
      `docs/defects/2026-08-25-lane-eta-arch-divergence.md`), so
      `mine/service.go:224` and `fleet/service.go:117`'s `math.Round`
      call sites currently pass with no check looking at them.
      **Done (2026-08-25):** took the widen-the-gate branch — scope is now the
      seven rule-bearing Go packages (`board|fleet|mine|galaxy|system|
      corporations|market`; a whole-backend grep found no math call sites
      outside them) plus `frontend/lib/hex`, and the pattern adds
      `math.Round`/`Math.round`. Known-defect sites route through the
      deviation register (`fixtures/determinism-register.json`): the script
      consults it per file, suppresses exactly the registered file:line sites
      for the `transcendental-drift` check, reports them in its pass output,
      and fails on an entry whose defect is no longer `open` (probe-verified
      both ways). `check.py`'s `seam_files` filter widened to match.
      Comment-only lines are skipped (`hex.ts:54`'s prose contains
      `Math.round(-2.5)`). One discovery past the task text:
      `pixel.ts:51–53`'s bare `Math.round` in `pixelToHex`'s cube-round —
      pragma'd `determinism:allow(discretized)` (the cube round IS the
      discretization step, and no Go twin recomputes the pick), and the
      file's stale "no game rule ever feeds through it" comment corrected to
      say the picked hex is a mutation input.
- [x] 2.5 Widen `.claude/scripts/check-transcendental.sh`'s `PATTERN` to
      also match `math\.Sqrt\(` (Go) and `Math\.sqrt\(` (TypeScript), so the
      script actually observes the `sqrt`-pinning requirement's "unreduced
      transcendental" scenario instead of only its own transcendental-minus-
      sqrt subset. Note the widened pattern matches FOUR sites in the
      two in-scope packages, not one — pragma each with the category shown:
      `backend/board/gate.go:54` `discretized`; `frontend/lib/hex/gate.ts:50`
      (the TS `hexDirection` mirror, currently unpragma'd) `discretized`;
      `frontend/lib/hex/pixel.ts:28` (`hexToPixel`) `projection`; and
      `frontend/lib/hex/pixel.ts:46` (`pixelToHex`) `discretized` — NOT
      `projection`: it is un-projection, cube-round is a discrete choice, and
      a click-picked target hex is transmitted as an input to a mutation.
      Add `determinism:allow(discretized)` to
      `backend/board/gate.go:54` (`math.Sqrt(3) * ...` inside `hexDirection`
      — it IS reduced: the value feeds `LaneGateHex`'s discretized argmin,
      the same carve-out the file's other pragma'd `atan2` calls already
      use). Delete the script's header note "`sqrt` is NOT flagged here — it
      is governed separately," which this widening makes false. Until this
      task lands, `Square Roots In Rules Are Pinned, Not Assumed` and the
      "An unreduced transcendental reaching a solve result is a violation"
      scenario's `sqrt` clause are enforced by code review only — see the
      spec's own scenario text for that sequencing, and do not read the
      script's current silence on `sqrt` as compliance.
      **Done (2026-08-25):** `Sqrt`/`sqrt` added to both language patterns;
      all four sites pragma'd with exactly the categories specified
      (`gate.go:54` and `gate.ts:50` `discretized`, `pixel.ts:28`
      `projection`, `pixel.ts:46` `discretized`); the "`sqrt` is NOT flagged
      here" header note deleted and the header rewritten around the
      pragma-vs-register split. Baseline green over all in-scope files;
      negative probe (planted `math.Sin`) fails exit 2.

## 3. Documentation pointer

- [x] 3.1 At archive time, replace the `## Notes for future maintainers`
      determinism bullet in `openspec/specs/board-tactical-math/spec.md`
      with a pointer to the `cross-stack-determinism` capability. NOT done by
      this change — `openspec/specs/` changes only on archive. Reverted once
      already (2026-08-25); do not re-apply pre-archive.
- [x] 3.2 After archive, replace the generated `## Purpose` placeholder in
      `openspec/specs/cross-stack-determinism/spec.md` with: "The Go
      backend and the TypeScript frontend independently compute the same
      board geometry, and the game is only coherent while they agree — as
      must every build target of each. This capability governs how a value
      is allowed to cross that seam: which arithmetic both languages are
      guaranteed to evaluate identically, how inexact arithmetic is
      admitted (only through a discretized choice or an authoritative
      side), reproducibility across build targets of the same language,
      and the golden-fixture discipline that proves it. It governs
      agreement of rule-bearing values across every language and build
      target the system runs on — including a same-language,
      cross-architecture divergence entirely inside one Go package with no
      TypeScript mirror at all (a persisted lane-leg ETA in `backend/fleet`,
      a persisted coordinate in `backend/galaxy`), which is not an
      'internal to one side' concern this capability excludes. What it
      leaves to other capabilities is narrower: the injectable world
      clock's time source, the seeded galaxy generator's seed choice, and
      the ETA-ordered action fold's ordering — genuinely single-side
      concerns, not the arithmetic those capabilities use to turn a seed
      or a clock reading into a rule-bearing value." (See
      `openspec/specs/mine-extraction/spec.md` for the kind of stale
      placeholder this is meant to preempt.)
      **Corrected (2026-08-25):** a prior draft of this Purpose text said
      the capability "governs the seam only" and excluded "the seeded
      galaxy generator" wholesale, directly contradicting `Rule-Bearing
      Values Are Reproducible Across Build Targets of the Same Language`
      (whose entire subject is same-language, cross-architecture
      determinism) and excluding a persisted, single-side arch-dependence
      hazard (`backend/galaxy/generator.go`'s trig/sqrt into persisted
      coordinates, 12 FMA sites, the most of any file — see proposal.md's
      "Known violations at landing"). Fixed above.
      **Correction (round 4):** the note above previously called this file
      "the largest single-side arch-dependence hazard found in this
      codebase" — that ranking claim is not supported once magnitude is
      measured: the galaxy defect's own header now reads "Real but narrow"
      (system count, lane count, ids, region classification, and lane
      topology matched 60/60 seeds; only low-bit coordinates differed), while
      `board.Line` — which does have a TypeScript mirror — carries a
      **measured 1.97% structural divergence** (2,160/109,561 pairs). The
      claim above is scoped to file count (12 FMA sites, the most of any
      file) rather than measured severity, which the retracted phrasing
      conflated.

## 4. Validation

**Note (2026-08-25):** 4.1–4.3 were run against a state where the
`Rule-Bearing Values Are Reproducible Across Build Targets of the Same
Language`, `The Golden Fixture Reproduces On Every Build Target`, and the
CI-filter half of `Shared Board Math Is Pinned By a Cross-Language Golden
Fixture` requirements were not yet enforced by tooling (4.4–4.8, 5.1–5.4,
6.1–6.2, and 7.1–7.2 below were still open). Their `[x]` marks the check surface
green *as of that partial state*, not that the full capability is
enforced — re-run 4.1–4.3 once 4.4–4.8 land, and do not read them as final
validation of this change.
**Re-run (2026-08-25, after 4.4–4.10, 6.1–6.3, 7.1–7.3 landed):** 4.1 green
on BOTH `arm64` and `amd64`/`GOAMD64=v1` (with the new `layoutConstants`
family and the `_meta` stamp excluded from comparison); 4.2 green — 55
fixture tests (54 + the sqrt(3) pin), 108 across `lib/hex`; 4.3 green —
file-based `check.py` passes end-to-end including the three new sections
(widened Determinism Seam lint, Determinism Cross-Target build matrix with
register print, Determinism Mirror Map). Frontend lint (ESLint + tsc)
clean. The two pre-existing reds noted under 4.3 (market world-time test,
best-effort e2e) are unchanged and out of scope. These marks are now
final-state, superseding the partial-state caveat above.

- [x] 4.1 `cd backend && go test ./board/... -short` passes with the new
      fixture case.
      **Passes** (fixture unchanged per 1.2's deferral; suite green with
      the pragma edits, `-count=1`).
- [x] 4.2 `cd frontend && npx vitest run lib/hex/fixtures.test.ts` passes
      with the new fixture case.
      **Passes** — 54 tests (fixture unchanged per 1.2's deferral).
- [x] 4.3 `python3 .claude/skills/code-quality-checks/check.py` passes,
      including the new lint/check mechanism from Task 2.
      **This change's surface is green:** all file-based checks including
      the new Determinism Seam validator pass; board/hex suites pass. The
      full gate is red on two failures that pre-date this change (its
      backend diff is comment-only): `market
      TestGetBoard_ReflectsADrainedRequestOnTheVeryNextRead` — a
      time-dependent test bug (cargo seeds `metals` but sells the station
      epoch's first-minted request kind, which rotates with world time) —
      and the best-effort e2e run. Both out of scope here; flagged to
      Travis 2026-08-25.
- [x] 4.4 `cd backend && GOARCH=amd64 GOAMD64=v1 go test ./board/ -short`
      passes (Rosetta on Apple Silicon locally; a native amd64 runner in
      CI), pinned explicitly at `GOAMD64=v1` rather than the toolchain's
      ambient default — `GOAMD64=v3` and higher emit FMA on `amd64` too,
      so an unpinned amd64 run is not reliably the non-contracting target
      this task needs. This is the named-matrix assertion the `The Golden
      Fixture Reproduces On Every Build Target` requirement obligates
      (`arm64`, `amd64`/`GOAMD64=v1`, and the JS runtime) — it must run on
      every change touching `backend/board`.
      **Done (2026-08-25):** green on both legs locally (amd64 via Rosetta).
      Runs as the "Determinism Cross-Target" section of `check.py`, which
      also runs the compiled-output FMA inspection
      (`.claude/scripts/check-fma-contraction.sh` — the primary mechanism:
      whole-module `-gcflags=-S` on both targets, per-site `file:line`
      extraction, register-bridged suppression, register printed every run)
      and the 4.8 build-pin check.
- [x] 4.5 Wire 4.4 into `/check` alongside the native-arch board tests, so
      the cross-architecture run is not an opt-in extra step.
      **Done:** runs under `--backend-tests`/`--run-all` (the default), and
      additionally on file-based-only runs whose changed files touch
      `backend/board` or `fixtures/`.
- [x] 4.6 Add a dedicated CI path-filter anchor covering `fixtures/**/*`
      that gates only the two fixture-suite jobs (`backend/board/
      fixtures_test.go`'s job and `frontend/lib/hex/fixtures.test.ts`'s
      job) — NOT `.backend-changes`/`.frontend-changes` directly. Those two
      anchors are also reused by `build-backend` (`.gitlab-ci.yml:331`) and
      `deploy-backend-dev` (`.gitlab-ci.yml:610-613`); widening them with
      `fixtures/**/*` would make a fixture-only commit build and deploy the
      backend, which is not the intent. The dedicated anchor is the
      instruction here, not an alternative to consider.
      **Done (2026-08-25):** `.fixtures-changes` anchor (`fixtures/**/*`)
      added as extra rules on `test-backend` and `test-frontend` only;
      `.backend-changes`/`.frontend-changes` untouched.
- [x] 4.7 Add a provenance stamp to `fixtures/board/cases.json` (and to the
      fixture-generation tooling that writes it): the `GOARCH` — and
      `GOAMD64` level where applicable — the file was last generated on.
      This is what makes `The Golden Fixture Reproduces On Every Build
      Target`'s "asserted on a target other than the one it was recorded
      on" claim checkable instead of assumed.
      **Done (2026-08-25):** `_meta.generatedOn` (`goarch` + `goamd64`)
      leads the file; the `UPDATE_FIXTURES=1` path stamps `runtime.GOARCH` +
      `$GOAMD64` automatically; the existing file is hand-stamped `arm64`
      (its historical recording target — current cases verified reproducing
      on amd64/v1 and V8 anyway). Excluded from the golden comparison
      (`golden.Meta = nil` before `reflect.DeepEqual`) exactly as this
      task's implementation note requires; the TS interface carries it
      unasserted. `layoutConstants` (task 6.2) was added in the same edit.
- [x] 4.8 Pin `GOARCH`/`GOAMD64` explicitly in the backend's build
      configuration (Dockerfile / CI build job), so the deployed backend's
      build target is a committed, reviewable value rather than whatever
      the build image's Go toolchain defaults to. Confirm the pinned value
      is `GOAMD64=v1` or another value verified non-contracting via
      `-gcflags=-S`. This IS `The Golden Fixture Reproduces On Every Build
      Target`'s "build-configuration check" — implement it as a check that
      fails (reporting the absent pin) when the Dockerfile/CI build job has
      no explicit `GOAMD64` set, not merely as a one-time manual edit.
      **Done (2026-08-25):** there was NO backend build config at all —
      CI's `build-backend` references `backend/Dockerfile`, which did not
      exist (the job could never have succeeded). Created it:
      `ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOAMD64=v1` with a
      load-bearing comment, distroless runtime. The standing check lives in
      `check.py`'s cross-target section: it FAILS reporting the absent pin
      when the Dockerfile is missing or lacks an explicit `GOAMD64=v<n>` /
      `GOARCH` — the scenario's build-configuration check, not a one-time
      edit.
- [x] 4.9 Add a CI step that runs after the fixture suites and fails if any
      file under `fixtures/` differs from its committed content
      (`git diff --exit-code -- fixtures/`), implementing `Shared Board Math
      Is Pinned By a Cross-Language Golden Fixture`'s "A fixture file that
      differs from its committed content fails CI" scenario. This replaces
      the earlier "automated regeneration job" framing, which described a CI
      job that doesn't exist and so could never fail.
      **Done (2026-08-25):** `git diff --exit-code -- fixtures/` appended to
      both fixture-suite jobs' scripts (after their test runs).
- [x] 4.10 `.gitlab-ci.yml:189,217` pin `saas-linux-medium-amd64` for the
      board/hex test jobs; there is no `arm64` runner and no qemu today, so
      the `arm64` leg of the build-target matrix (4.4) cannot run on the
      merge-request pipeline yet. Provide the missing leg — either an
      `arm64` GitLab runner, or `qemu-user` emulation added to
      `TEST_RUNNER_IMAGE` so `GOARCH=arm64` tests run under emulation on the
      existing `amd64` runner. Until this lands, the `arm64` leg is asserted
      only by the local `/check` gate, per `The Golden Fixture Reproduces On
      Every Build Target`'s explicit downgrade of that one leg.
      **Done (2026-08-25), qemu path, one Travis action outstanding:**
      `qemu-user-static` added to `infra/docker/test-runner.Dockerfile`;
      `test-backend` now runs the explicit `GOAMD64=v1` leg and, when the
      qemu binary is present in the image, cross-compiles the board suite
      (`CGO_ENABLED=0 GOARCH=arm64 go test -c`) and runs it under
      `qemu-aarch64-static` from `backend/board` (so the fixture's relative
      path resolves). Until the image is rebuilt the job PRINTS the stated
      downgrade instead of silently skipping. **Travis: rebuild + push the
      test-runner image (`infra/docker/build-test-runner.sh`) to activate
      the arm64 leg.**

## 5. Exhaustive-sweep fixture cases

- [x] 5.1 Inventory sweep-eligibility for all nine fixture families
      (`line`, `routeAround`, `orbState`, `solveHex`, `solveIntercept`,
      `laneGate`, `stateAt`, `lineOfSight`, `beam`) against the bound and
      construction design.md's sweep-case-schema Decision pins (enumerable
      within 10^6 inputs; for a hex-pair domain, all ordered pairs within
      radius 10). For each family not yet sweep-eligible or already
      blocked, name why and, where applicable, the change expected to
      record it:
      - `line` — sweep-eligible (hex-pair domain, 109,561 pairs). BLOCKED
        by `docs/defects/2026-08-25-line-fma-arch-divergence.md`; recorded
        by whichever `board-tactical-math` change fixes that defect.
      - `routeAround` — sweep-eligible (same hex-pair domain); calls `Line`
        directly, so it carries the identical divergence. BLOCKED by the
        same defect; recorded by the same fix change (already named in
        design.md's Migration Plan as one of the five re-recorded
        families).
      - `beam` and `lineOfSight` — both call `Line` directly for their
        spine (`visibility.go`), so both are sweep-eligible over a
        hex-pair domain (for `beam`, at a fixed `BeamParams`; for
        `lineOfSight`, over the origin/target pair with no occluders — the
        occluder-set dimension is not enumerable within the 10^6 bound and
        is out of scope for a sweep). Both carry the same `Line` divergence
        transitively. BLOCKED by the same defect; recorded by the same fix
        change.
      - `solveHex` and `solveIntercept` — call `RouteAround` (hence
        `Line`) internally, so they inherit the same divergence, but their
        own domains additionally include unbounded `WorldMillis` time
        parameters, so neither is sweep-eligible as a whole under the
        10^6 bound. Not blocked by a separate defect beyond `Line`'s; their
        existing hand-picked cases still need re-recording once the `Line`
        fix lands (already named in design.md's Migration Plan).
      - `orbState` — already integer-exact (no floating-point
        intermediate); its domain includes an unbounded `WorldMillis` time
        axis, so it is not sweep-eligible under the 10^6 bound as
        currently understood. Not blocked by any open defect.
      - `laneGate` — its domain (`selfX/selfY/neighborX/neighborY float64`)
        is continuous, not enumerable at any bound. Not sweep-eligible;
        governed instead by the discretized-choice requirement and its
        near-tie scenario, not by a sweep.
      - `stateAt` — its domain (`MovementState` × `WorldMillis`) is not
        naturally bounded (burn paths of unbounded length, unbounded time).
        Not sweep-eligible today. Not blocked by any open defect.
      **Done (2026-08-25):** inventory above confirmed against the code
      (call graphs verified: `routeAround`/`beam`/`lineOfSight` all reach
      `Line`; `solveHex`/`solveIntercept` reach it via `RouteAround`) and
      mirrored into the deviation register: the four blocked sweep families
      carry `golden-fixture-sweep` entries; `solveHex`/`solveIntercept`
      carry informational entries (under the open defect, but not
      sweep-eligible, so no check to bridge); `orbState`/`laneGate`/
      `stateAt` carry none, as inventoried. The new `layoutConstants`
      family (6.2) is a constant pin, not a swept function — no sweep
      obligation. 5.2–5.4 remain BLOCKED on the `lerp` fix, as specified.
- [ ] 5.2 Add an exhaustive-sweep case to the `line` fixture family per the
      schema design.md's sweep-case-schema Decision pins: the SHA-256
      digest, hex-encoded, of the newline-joined decimal `q,r`
      serialization of `board.Line`'s output over all ordered hex pairs
      within radius 10, in the fixed `RingHexes`-order enumeration that
      Decision specifies.
      **Do NOT record this on an arm64 (contracting) target, and do NOT
      record it at all until the `lerp` FMA-contraction defect
      (`docs/defects/2026-08-25-line-fma-arch-divergence.md`) is resolved.**
      Recording it now would freeze one architecture's answers for the
      2,160/109,561 pairs that currently disagree, defeating the purpose of
      the sweep. This task is intentionally left unchecked and blocked on
      that separate `board-tactical-math` fix landing first.
- [ ] 5.3 Once recorded, confirm the sweep case reproduces identically on
      Go/`arm64`, Go/`amd64` (Task 4.4), and the TypeScript mirror.
- [ ] 5.4 When the `Line` fix lands, add the same exhaustive-sweep
      construction to `routeAround`, `beam`, and `lineOfSight`'s
      no-occluder slice per 5.1's inventory, in the same change that
      records `line`'s sweep case (all four share the one blocking
      defect).

## 6. Deviation register and sqrt(3) pin

- [x] 6.1 Implement the ONE capability-level deviation register that
      `The Capability's Deviation Register Bridges Known Violations Across
      Its Checks` obligates (a file or a structured block every check that
      consults it — the cross-target check (Task 4.4), the sweep-case
      requirement, the discretized-choice requirement's carve-out, and the
      sqrt-pinning requirement (Task 6.2, and Task 2.5 once it lands) — reads
      before failing, and PRINTS on every run). Each entry SHALL
      carry: the site (`file.go:line` or function name), which requirement
      or check(s) it bridges (naming every check the site violates, not just
      one — see the requirement's own text on this), the date filed, the
      referenced open defect under `docs/defects/`, and its magnitude,
      stated as `unmeasured` or as `measured` with its basis. The check
      SHALL fail for an entry whose referenced defect's
      `**Status:**` line no longer reads `open`, and SHALL suppress failure
      for exactly the named site(s)-and-check(s) and nothing else. This
      requirement is system-wide (see proposal.md's "Known violations at
      landing"), so the register is not board-scoped either. Seed it with
      four entries (all four defects are already filed and stamped
      `**Status:** open`, so no backfill task is needed for that — it's
      done):
      - `board.Line`/`lerp`/`roundf` (`backend/board/hex.go`), bridging
        `Rule-Bearing Values Are Reproducible Across Build Targets of the
        Same Language` **and** `Shared Board Math Is Pinned By a
        Cross-Language Golden Fixture` (its exhaustive-sweep clause — the
        `line` family's sweep case cannot be recorded until this defect is
        fixed), referencing
        `docs/defects/2026-08-25-line-fma-arch-divergence.md`, filed
        2026-08-25, magnitude **measured** (exhaustive, 1.97%,
        2,160/109,561 pairs).
      - `RouteAround` (`backend/board/route.go`), bridging `Shared Board
        Math Is Pinned By a Cross-Language Golden Fixture` (sweep blocked),
        referencing `docs/defects/2026-08-25-line-fma-arch-divergence.md`,
        filed 2026-08-25, magnitude **unmeasured** (inherits `Line`'s
        divergence transitively; not separately swept).
      - `BeamHexes` (`backend/board/visibility.go`), bridging the same
        check, same defect, filed 2026-08-25, magnitude **unmeasured**
        (inherits `Line`).
      - `LineOfSight` (`backend/board/visibility.go`), bridging the same
        check, same defect, filed 2026-08-25, magnitude **unmeasured**
        (inherits `Line`). Note this one also decides disclosure, which
        `Rule-Bearing Values Cross the Seam By Exact Arithmetic or By
        Discretization` now covers — name that check too if the sweep
        confirms a divergence.
      - Decide in passing whether `SolveHex`/`SolveIntercept` (which Task
        5.1 rules inherit the divergence but are not sweep-eligible) count
        as "under an open cross-target divergence defect" for the register's
        purposes; today's spec text reads as yes.
      - `hexDirection` (`backend/board/gate.go:54`), bridging the same
        requirement, referencing the same defect document
        (`docs/defects/2026-08-25-line-fma-arch-divergence.md`, which
        covers `hex.go:73`/`93`/`95` and `gate.go:54` together), filed
        2026-08-25, magnitude **unmeasured**.
        **Round-4 correction:** proposal.md's "Known violations at landing"
        bullet for `hex.go`/`gate.go` already claimed this site was
        "Register-seeded by this change (Task 6.1)"; this entry is what
        makes that claim true — it was previously missing from this seed
        list even though proposal.md asserted it was seeded.
      - `fleet.legMs`/`fleet.laneLength` (`backend/fleet/routing.go:196`),
        bridging **three** checks this single site violates (per
        `docs/defects/2026-08-25-lane-eta-arch-divergence.md` §1–3 — do not
        seed only one; the site fails all three the moment their checks are
        wired up):
        1. `Rule-Bearing Values Are Reproducible Across Build Targets of the
           Same Language` — the `dx*dx+dy*dy+dz*dz` FMA contraction
           (verified: `FMADDD` × 5, `arm64` vs zero `amd64`).
        2. `Square Roots In Rules Are Pinned, Not Assumed` — a runtime
           `math.Sqrt` reaching a persisted ETA with no fixture family (see
           that requirement's Go-only-mirror scoping in design.md; this site
           is exactly that case — `fleet` has no TypeScript mirror).
        3. `Rule-Bearing Values Cross the Seam By Exact Arithmetic or By
           Discretization` — the bare `math.Round` call, which disagrees
           with `Math.round` on every negative half-integer.
        Referencing `docs/defects/2026-08-25-lane-eta-arch-divergence.md`,
        filed 2026-08-25, magnitude **unmeasured** — no sweep of real
        galaxy coordinates across both architectures has been run.
      - `galaxy.Generate`'s coordinate/acceptance math
        (`backend/galaxy/generator.go`), bridging
        `Rule-Bearing Values Are Reproducible Across Build Targets of the
        Same Language`, referencing
        `docs/defects/2026-08-25-galaxy-generation-arch-divergence.md`,
        filed 2026-08-25, magnitude **measured** (round 3): 60 seeds, both
        `GOARCH` values — system count, lane count, ids, region
        classification, and lane topology identical 0/60; coordinates
        differ 60/60, but only in the low bits (18/960 coordinates at
        seeds 1/42/424242, each one ULP). Compounds with the `fleet.legMs`
        entry above via `laneLength`. 60 seeds is an observation, not a
        proof.
      The remaining sites in proposal.md's "Known violations at landing"
      (`backend/system/generator.go:88,90,186,238` — four sites, not two;
      88/90 are the anomaly/ruin specials, 186 is the **belt** feature's
      richness (the primary mineable lode, a strictly larger persistence
      path than 88/90), and 238 is the shared `rich()` helper —
      `backend/corporations/siteselection.go:54,159`,
      `backend/market/provisioning.go:35,38` (round-4 correction: the
      emitting lines are 35 and 38, not `34-38` or `34,37` as two earlier
      drafts of this document said), `backend/mine/service.go:187`
      (`remainingAtNow := startTons + fold` — the across-statement FMA
      fusion, now localized; round-4 correction: this document previously
      said "its exact line is not yet localized"), and `mine/service.go:224`/
      `fleet/service.go:117`'s `math.Round`) are now filed in one
      consolidated document, `docs/defects/2026-08-25-remaining-fma-sites.md`
      (`**Status:** open`), but are NOT seeded here — a register entry is
      per-site follow-up work (Task 6.3); one document covering these
      bullets does not by itself seed a register entry per site — in
      particular, `system/generator.go`'s four call sites (88, 90, 186, 238)
      are four separate entries under Task 6.3's "one register entry per
      site, not one per file" rule, not one.
      Wire the register lookup into Task 4.4/4.5's cross-architecture run
      so it is live the moment that run lands, not a follow-up.
      **Done (2026-08-25):** `fixtures/determinism-register.json` — 20
      entries. Per-entry: site, per-check line lists (`checks` maps a check
      slug to the exact lines it suppresses in that file), filed date,
      defect ref, magnitude (`unmeasured` or `measured (<basis>)`). All the
      seeds above are in, including `hexDirection` (the round-4 correction)
      and `fleet.legMs` bridging its three checks; the SolveHex/
      SolveIntercept decision recorded as YES (informational entries under
      the open defect — not sweep-eligible, so nothing to suppress).
      Consulted (and printed) by `check-transcendental.sh`,
      `check-fma-contraction.sh`, and `check.py`; suppression is exactly
      site-and-check scoped; an entry whose defect's `**Status:**` is not
      `open` fails the consulting check (probe-verified). Live in the
      4.4/4.5 run from its first landing. Line numbers are load-bearing by
      design: drift fails the check until the entry is updated, keeping
      every suppression a reviewable diff.
- [x] 6.2 Add a fixture or test asserting the pointy-top `sqrt(3)` layout
      constant used by `hexDirection` (Go) and `hexDirection` (TypeScript)
      is the identical 64-bit float on both sides — no such assertion exists
      today, and neither function is exported on either side
      (`backend/board/gate.go:53`, `frontend/lib/hex/gate.ts:49`), so
      `fixtures.test.ts` cannot import it as-is. Do one of: (a) export
      `hexDirection` from both mirrors so a test can call it directly, or
      (b) add a `layoutConstants` fixture family (or equivalent) that
      records the raw `sqrt(3)` float itself rather than a call through the
      unexported function. This is the `Square Roots In Rules Are Pinned,
      Not Assumed` requirement's "board layout's root-three constant is
      asserted, not assumed" scenario.
      **Done (2026-08-25):** option (b) — a `layoutConstants` fixture family
      recording the raw float (`sqrt3` = `1.7320508075688772`), hand-authored
      WITHOUT running `UPDATE_FIXTURES=1` (safe to record despite the open
      FMA defect: `math.Sqrt` is correctly rounded, hence arch-independent
      in Go). Go's `computeFixtures` emits `math.Sqrt(3)`; the TS suite
      asserts `Math.sqrt(3)` reproduces the recorded 64 bits exactly.
      Green on arm64, amd64/`GOAMD64=v1`, and V8.
- [x] 6.3 Before implementation, re-run the mechanical sweep design.md's
      "Non-enumerable domains are checked by compiled-output inspection"
      Decision defines (`GOOS=linux GOARCH=arm64 go build -gcflags=-S ./...
      | grep -cE 'FMADDD|FMSUBD'` per file against the whole `backend/`
      module, cross-checked against a zero `GOARCH=amd64` count for the same
      file), since the eight-file list in proposal.md's "Known violations at
      landing" is a 2026-08-25 snapshot, not a standing guarantee. For each
      nonzero-count file the re-run finds: if a defect is already filed for
      it, add or refresh its register entry per Task 6.1's format; if not,
      file one before treating the file as register-eligible. One register
      entry per site, not one per file, where a file has more than one
      distinct call site.
      **State as of round 4:** all eight files in proposal.md's snapshot
      already have a filed defect — four (`backend/board/hex.go`,
      `backend/board/gate.go`, `backend/fleet/routing.go`,
      `backend/galaxy/generator.go`) seeded into the register by Task 6.1,
      the remaining four (`backend/system/generator.go`,
      `backend/corporations/siteselection.go`,
      `backend/market/provisioning.go`, `backend/mine/service.go`) filed in
      one consolidated document (`docs/defects/2026-08-25-remaining-fma-sites.md`)
      but not yet register-seeded. Those four files carry more than four
      call sites once counted per-site (`system/generator.go` alone has four:
      `:88,90,186,238`), so this task's remaining job, absent the re-run
      surfacing a new site, is registering one entry per site across those
      four files (and refreshing the four already seeded), not filing.
      **Done (2026-08-25):** sweep re-run at per-site (`file:line`)
      granularity. All snapshot sites confirmed, and the re-run REFINED the
      galaxy picture: the file's 12 instructions resolve to three sites —
      `generator.go:83`, `:136`, `:224` — distinct from the textual trig
      lines (`:131,134,135,224`); the register's galaxy entry carries both
      sets under their respective checks. Per-site entries registered for
      all four consolidated-doc files (system ×4, siteselection ×2,
      provisioning ×2, mine ×2 — the `:187` FMA and the `:224` Round are
      separate entries — plus `fleet/service.go:117`); the four 6.1-seeded
      files refreshed with re-run line numbers. amd64/`GOAMD64=v1`: zero
      FMA module-wide. This sweep is no longer a manual re-run task:
      `check-fma-contraction.sh` performs it mechanically on every /check,
      failing on any unregistered site.

## 7. Coverage inventory and mirror map

- [x] 7.1 Create the mirror map `Shared Board Math Is Pinned By a
      Cross-Language Golden Fixture` obligates: a file or structured block
      naming every function defined in both `backend/board` and
      `frontend/lib/hex`, whether or not exported on either side (the
      exported-pair predicate a prior draft used cannot name `lerp`,
      unexported on both sides, or `roundf`, unexported in Go and exported
      in TS — exactly the two call sites the FMA defect implicates). Seed it
      with today's known pairs, including the non-exported ones:
      `lerp`/`lerp`, `roundf`/`roundf`, `hexDirection`/`hexDirection`,
      `GateRing`/`gateRing`, `Distance`/`distance`, `Ring`/`ringOf`,
      `RingHexes`/`ringHexes`, `AngleOf`/`angleOf`,
      `OrbitThrough`/`orbitThrough`, `LaneFraction`/`laneFraction`,
      `BurnPos`/`burnPos`, `CoastAt`/`coastAt`, `ShipPos`/`shipPos`,
      `Arrived`/`arrived`, `Neighborhood`/`neighborhood`.
      **Done (2026-08-25):** `fixtures/board/mirror-map.json` — **31 pairs,
      not 24**: mechanical extraction found seven real pairs beyond this
      task's seed list — `angleDelta`, `cubeRound`, `pathHitsCore`,
      `snapToCellBoundary`, `toCube`, `toHex`/`cubeToHex`, and
      `HydratePeriod`/`orbitPeriod` (the last two pair under DIFFERENT
      names across the seam, which is why name-matching alone can never
      replace the declared map). One-sided functions listed under
      `goOnly`/`tsOnly` so the completeness check has a total universe.
- [x] 7.2 Create the coverage inventory: for each pair in the 7.1 mirror map
      with no fixture family covering it, list it with the change expected
      to cover it. Seed it with today's thirteen gaps —
      `GateRing`/`gateRing`, `Distance`/`distance`, `Ring`/`ringOf`,
      `RingHexes`/`ringHexes`, `roundf`/`roundf`, `AngleOf`/`angleOf`,
      `OrbitThrough`/`orbitThrough`, `LaneFraction`/`laneFraction`,
      `BurnPos`/`burnPos`, `CoastAt`/`coastAt`, `ShipPos`/`shipPos`,
      `Arrived`/`arrived`, `Neighborhood`/`neighborhood` — each pointed at
      the `board-tactical-math` change expected to cover it (unassigned
      where none is yet). (`ShipPos`, `LaneFraction`, and `RingHexes` are
      rule-bearing — `RingHexes` order IS the lane-gate tie-break — so their
      absence from any fixture family is a real gap, not a formality; per
      the requirement, a rule-bearing pair SHALL NOT remain in this
      inventory across more than one change that modifies its package,
      unlike the non-rule-bearing gaps, which have no such deadline.)
      `lerp`/`roundf`/`hexDirection` are NOT listed here — they are already
      covered by the `line`/`laneGate` fixture families' hand-picked cases
      (imperfectly, per the FMA defect), not absent from coverage.
      **Done (2026-08-25):** inventory carries **12** gaps, not thirteen —
      this task's "thirteen gaps" count and its closing "`roundf` is NOT
      listed here" sentence contradict each other (a post-verdict edit
      artifact; the count only reaches 13 WITH `roundf`). The exclusion
      sentence was followed, being the more specific instruction and
      consistent with 7.1's known-pairs framing: `roundf` is family:line
      covered, so the seeded gaps are the thirteen minus it.
      `RingHexes`/`LaneFraction`/`ShipPos` flagged `ruleBearing: true` with
      the one-change deadline noted; `RingHexes` points at the
      `LaneGateHex` near-tie fix change; the extra seven pairs from 7.1 are
      marked with the family that indirectly exercises them (e.g.
      `HydratePeriod`/`orbitPeriod` under `stateAt`, whose fixture comment
      already documents exactly that pin), not added to the inventory.
- [x] 7.3 Add the mechanical check `An uncovered mirrored function is
      caught by the coverage inventory check` obligates: for every pair in
      the 7.1 mirror map, confirm it appears either in a
      `fixtures/board/cases.json` family or in the 7.2 inventory; fail if a
      function in either mirror is absent from the map itself, or if a
      mapped pair is in neither the fixture families nor the inventory.
      Wire into `/check` alongside the transcendental-drift lint (Task 2).
      **Done (2026-08-25):** `.claude/scripts/check-mirror-map.sh` —
      extracts the actual `func`/`function` declarations from both packages
      (receiver methods included; tests excluded), fails on any name absent
      from the map, on stale map names, and on any pair that is neither a
      non-empty `cases.json` family nor an inventory entry (probe-verified
      with a planted orphan function). Wired into `/check` (runs on changes
      touching either mirror or `fixtures/`, and in every full run).
