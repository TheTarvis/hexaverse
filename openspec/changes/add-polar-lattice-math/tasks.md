## 1. Go implementation

- [ ] 1.1 Create a new Go package `backend/polar/` (sibling to, not inside,
      `backend/board`) implementing ring-and-slot cell coordinates, slot
      normalization, and the configured slot-schedule validation (positive
      integer counts; ring 0 fixed at 1; every ring at or above ring 1 at
      least 2; non-decreasing; total over the board's rings; constant per
      band and exact double at each boundary among rings at ring 1 or
      above; the ring-0-to-ring-1 step exempt from the ratio rule)
- [ ] 1.2 Implement ring-to-radius projection: every cell on a given ring
      maps to that ring's single configured radius, a function of ring
      index alone — not necessarily a uniform multiple of a fixed unit,
      since non-uniform radial spacing remains an open lever on the
      slot-schedule decision (design.md) — and ring 0 maps to radius zero
- [ ] 1.3 Implement `arcPath`-equivalent path computation: rational-turns
      integer/exact-rational interpolation in ring and angle, round-ring-
      then-angle ordering, shorter-direction sweep, the three fixed
      tie-breaks including the zero-sweep angular tie (resolve to the
      higher slot index — every purely radial path, including any with the
      core as an endpoint, hits this), one sample per cell the path must
      cross sized against the **finest — outermost — ring the path spans**,
      not the mean ring (see design.md's corrected per-cell-sampling
      decision), core-reachable only at an endpoint with no inserted or
      altered cell for avoidance, and the core-endpoint case following the
      non-core endpoint's bearing to within half a cell width rather than
      exactly
- [ ] 1.4 Implement orbital advance: truncating integer division over the
      ring's slot count, direction encoded as `+1`/`−1` with `0` coerced to
      `+1`, world time measured from the world epoch and non-negative,
      motionless for period ≤ 0, ring 0 always the core
- [ ] 1.5 Implement the orbit back-solve: given a settle cell and world
      time, back-solve the epoch slot index using the same truncating
      integer arithmetic as 1.4, with no floating-point intermediate, so
      evaluating the resulting orbit at that world time reproduces the
      settle cell exactly
- [ ] 1.6 Implement adjacency (`isAdjacent`-equivalent) as the pure integer
      predicate the Lattice Adjacency Is an Integer Predicate requirement
      defines (ring-difference-≤1 test plus the wrapped angular-separation
      comparison scaled to the coarser ring's cell width, corner contact
      included, core ring-difference-only rule), verified to reproduce the
      spike's float `isAdjacent` (with its `* 1.01` fudge) on all ±1-ring
      pairs
- [ ] 1.7 Audit every function in this package for floating-point
      intermediates on any path that produces a stored value, solve result,
      or ETA; trig and `sqrt` are permitted only in projection/rendering-
      sampling functions kept outside this package's rule-bearing surface
      (design.md's Open Questions records that this bars `sqrt` outright
      from this package's rule-bearing surface, stricter than
      `cross-stack-determinism`'s pinned-and-fixtured allowance — no
      intercept solve or delta-v computation needing a runtime root can
      live in this package without a spec change)
- [ ] 1.8 Extend `check-transcendental.sh`'s scope (or add a second scoped
      invocation) to cover this package's Go files and the TypeScript
      mirror's files, so the same automated guardrail that watches
      `backend/board`/`frontend/lib/hex` also watches this capability's
      rule-bearing surface on every future change to it; widen the matched
      pattern too, not only the directories — it currently omits `Round`
      (`math.Round` vs `Math.round` disagree on every negative
      half-integer); `Floor` and `Trunc` agree across the seam and SHALL
      NOT be added to the pattern (design.md's Risks/Trade-offs)

## 2. TypeScript mirror

- [ ] 2.1 Create a new TypeScript module `frontend/lib/polar/` mirroring
      the Go package's rule-bearing functions (coordinates, schedule
      validation, ring-to-radius projection, `arcPath`, orbital advance,
      the orbit back-solve, adjacency), using `BigInt` for
      truncating-integer-division parity with Go's `int64` semantics
      (matching the existing pattern in `frontend/lib/hex/orbit.ts`) — but
      reducing modulo the slot count **in `BigInt` before** converting to
      `Number`, unlike `polar.ts:220-223` and the incumbent
      `lib/hex/orbit.ts:34-36`, which convert to `Number` first; this
      mirror SHALL NOT inherit that shape by copy, even though it is
      unreachable at plausible world times
- [ ] 2.2 Keep this module separate from `frontend/lib/hex/` (the incumbent
      hex mirror) and from `frontend/app/spike/polar-board/polar.ts` (the
      exploratory bench, which stays float-based and rendering-oriented per
      its own comments) — this is the production-shaped mirror the fixture
      suite asserts against

## 3. Cross-language fixture family

- [ ] 3.1 Design the new fixture family's case shape (one family per
      shared function or closely related group, per the
      `cross-stack-determinism` capability's convention) and record it in a
      new sibling file (e.g. `fixtures/polar/cases.json`) — not
      `fixtures/board/cases.json`, whose Go-side owner
      (`backend/board/fixtures_test.go`'s `TestFixtures_MatchGolden`) fully
      rewrites it from a fixed struct on `UPDATE_FIXTURES=1`, and this
      change is barred from touching any file under `backend/board`; every
      recorded case names the slot schedule it was generated under
- [ ] 3.2 Record hand-selected cases for cell normalization, schedule
      validation (including a rejected 0-slot and 1-slot ring, and a
      ring-1-slot-count-greater-than-two acceptance), adjacency (including
      an adjacent same-ring pair with wrap, a non-adjacent two-ring-apart
      pair, a core-to-ring-1 pair, and a doubling-boundary pair on each
      side of the loose-vs-true-corner-contact fork design.md's Open
      Questions records), `arcPath` (including a same-ring transfer, a
      core-touching endpoint, a band-boundary crossing, a
      coarse-inner-ring-to-fine-outer-ring crossing exercising finest-ring
      sampling, an exact half-turn sweep, an exact ring-tie sample, an
      exact angular-slot-tie sample, and an exact zero-sweep angular tie
      including the ring-wrap case where the tie candidates are the ring's
      last slot and slot 0), orbital advance (full period, half period,
      non-positive period, ring 0, direction `0`, direction `−1`), and the
      orbit back-solve (settle-then-reproduce for a representative
      ring/slot/period/direction, and a settle onto the core). Ring-radius
      projection is deliberately **not** listed here: the rule-bearing
      property it pins (one radius per ring) is asserted directly on the
      configured radius values, not on a pixel-space projection, which is
      render-side and outside the byte-identical-reproduction scenario
- [ ] 3.3 Record an exhaustive-sweep case for `arcPath`, for adjacency, and
      for orbital advance and the orbit back-solve (as two sweeps over
      their own distinct domain tuples — `(ring, epochSlot, period,
      direction)` × offset for advance, `(ring, settleSlot, period,
      direction, at)` for the back-solve), per the Sweep Domain Is Bounded
      requirement: a concrete, named maximum ring, the schedule's implied
      slot counts up to it, a concrete, named, finite period list, and —
      for orbital advance/back-solve — the fixed period-relative
      world-time offsets (`0`, 1/4, 1/2, 3/4, 1× period, each computed as
      `floor(period × k ÷ 4)`). The adjacency sweep serializes `0`/`1` per
      ordered pair, in the same enumeration order as the `arcPath` sweep.
      Every sweep's digest is the SHA-256 hex digest of its serialized
      enumeration. Name the concrete bound chosen (e.g. `maxRing = 10`)
      in the fixture file and in this task once decided
- [ ] 3.4 Assert every case from both `backend`'s new fixture test and
      `frontend`'s new fixture test
- [ ] 3.5 **Gate: if Go↔TS parity does not hold on any recorded case,
      STOP and escalate rather than adjusting the case to match — per the
      handoff's step 3, parity not holding means the migration does not
      proceed to `board/`-equivalent rewrite work (a separate, future
      change)**
- [ ] 3.6 Reconcile the fixture family list against this package's full
      exported (and, where reasonably enumerable, unexported) mirrored
      surface in both `backend/polar/` and `frontend/lib/polar/`; list any
      mirrored function left uncovered by a family in the capability's
      coverage inventory (`cross-stack-determinism`'s coverage-inventory
      artifact) rather than silently omitting it

## 4. Cross-build-target reproducibility

- [ ] 4.1 Run the new fixture family's Go suite compiled for `GOARCH=amd64`
      in addition to the native (`arm64` dev machine) target, per the
      `cross-stack-determinism` capability's cross-build-target requirement
- [ ] 4.2 Diff an exhaustive sweep of `arcPath` and orbital advance across
      `GOARCH=arm64` and `GOARCH=amd64` builds (not just the recorded
      fixture cases — `docs/defects/2026-08-25-line-fma-arch-divergence.md`
      shows a passing fixture suite on both architectures is not evidence
      of parity when the recorded cases happen to dodge the divergent
      inputs)
- [ ] 4.3 If a cross-target divergence is found, fix it (per this
      capability's Rule-Bearing Values requirement — no floating-point
      intermediate) rather than registering it as a tolerated deviation
- [ ] 4.4 Wire a `GOARCH=amd64` test run of the new polar package into
      `/check` (or the equivalent backend gate), scoped to run on every
      change touching the new package's files — not merely once at
      authoring time — mirroring `pin-cross-stack-determinism-seam` task
      4.5. This change does **not** gate on
      `pin-cross-stack-determinism-seam` tasks 4.4–4.6 landing first (see
      proposal.md): this task stands up the equivalent CI wiring for the
      polar package independently, since those pin tasks are currently
      unchecked.
- [ ] 4.5 Add a dedicated CI path-filter anchor covering the new
      `fixtures/polar/**` path that gates only this capability's two new
      fixture-suite jobs, mirroring `pin-cross-stack-determinism-seam` task
      4.6's board-fixture anchor — not the general `.backend-changes`/
      `.frontend-changes` anchors, for the same reason that change's design
      gives (avoiding an unrelated fixture-only commit triggering a full
      backend build/deploy)
- [ ] 4.6 Add a provenance stamp to the new `fixtures/polar/cases.json`
      (and to whatever tooling writes it): the `GOARCH` — and `GOAMD64`
      level where applicable — and JavaScript runtime it was last generated
      and verified on, per the Polar Fixture File Reproduces On Every Build
      Target requirement

## 5. Tuning bench

- [ ] 5.1 Confirm `frontend/app/spike/polar-board` (`/spike/polar-board`)
      still builds and its 44 pinned tests (`polar.test.ts`, `page.test.tsx`,
      `mock-system.test.ts`) still pass, unmodified by this change — it
      remains the bench where slot-schedule and smoothing questions get
      re-litigated (handoff Section 10), independent of the new production
      package this change adds. Note: this production package's finest-ring
      sampling now measures differently on the inbound-transfer smoothing
      case than the mean-ring formula the spike still uses (design.md), so
      the 16.5° figure design.md records for that spike comparison describes
      the spike, not this package — do not attempt to reconcile them here.
      Correction: `page.test.tsx` itself pins only the inequality
      `expect(turnFor('polar')).toBeGreaterThan(turnFor('hex'))` on that
      case, not the 16.5° value — do not cite it as pinning that number
- [ ] 5.2 Re-bench the inbound-transfer smoothing case under this change's
      actually-specified realization (exact-rational interpolation,
      finest-ring sampling, ring ties toward the destination ring) rather
      than the spike's float `Math.round`-tie quantizer, using the bench's
      own smoothing code (design.md's per-cell-sample-count Decision and
      its Major-8 annotation). Record the result and confirm or correct
      the adversarially-measured, unverified 12.6° figure **before**
      Decision 3 (design.md Open Questions) is escalated to Travis on the
      strength of the 27.3°-vs-16.5° comparison

## 6. Validation

- [ ] 6.1 `cd backend && make test` passes with the new package and fixture
      family
- [ ] 6.2 `cd frontend && npx vitest run` passes with the new mirror and
      fixture family, and the existing 998+ tests remain green
- [ ] 6.3 `openspec validate add-polar-lattice-math --strict` passes
- [ ] 6.4 Confirm no file under `backend/board/`, `frontend/lib/hex/`,
      `backend/fleet/`, `backend/observation/`, `backend/system/`,
      `backend/corporations/`, `backend/mine/`, `backend/market/`,
      `frontend/components/board/`, `frontend/components/webgl/`, or
      `frontend/components/galaxy/` was touched by this change
- [ ] 6.5 `python3 .claude/skills/code-quality-checks/check.py` passes,
      per the handoff's Section 10 verification list

## 7. Archive follow-up

- [ ] 7.1 At archive time, write the `polar-lattice-math` capability's
      `## Purpose` (the generated placeholder otherwise ships stale — see
      `openspec/specs/mine-extraction/spec.md` for the precedent this
      pre-empts): state explicitly that the capability has **zero
      consumers** as of this change, that `board-tactical-math` remains the
      lattice every shipped consumer (`fleet`, `observation`, `system`, the
      renderer) actually uses, and point to
      `docs/handoffs/2026-08-24-polar-lattice-migration.md` Section 9 and
      this change's design.md capability-boundary Decision (including its
      Exit note) for the migration and eventual-removal plan
