## 1. Squared-distance affordance in `backend/space`

- [ ] 1.1 Add `Vec3.DistSq(o Vec3) float64` to `backend/space/vec.go`,
      computed as the sum of three explicitly `float64(...)`-guarded squared
      component differences, with no `math.Sqrt` — mirroring `Length`'s
      guarding discipline (design.md Decision 2)
- [ ] 1.2 Document at the call site that `DistSq` exists so that no caller
      hand-rolls subtract-and-dot, which is where an unguarded multiply-add
      would reappear
- [ ] 1.3 Table-driven test: `DistSq(a,b)` equals `b.Sub(a).Dot(b.Sub(a))`
      bit-for-bit across the fixture domain, and equals `Length()` squared
      to within the documented tolerance
- [ ] 1.4 Cross-target assertion: `DistSq` results are byte-identical under
      `GOARCH=amd64 GOAMD64=v1` and native `arm64`

## 2. Placeholder knob constants

- [ ] 2.1 Create the capability's `params.go` with `PassiveRange` (12),
      `PlumeFloor` (20), `PlumePerDriveOutput` (8.0), `MinCommandedAccel`
      (1.0), and `FocusedScanRange` (48) as named constants, each carrying
      the design.md Decision 6 rationale in its comment and none of them
      appearing as a bare literal at any call site
- [ ] 2.2 Header comment stating these are feel-tuning placeholders, not
      spec-pinned values — mirroring `space/params_const.go`'s own preamble
- [ ] 2.3 Assert the floor invariant in a test rather than a comment:
      `PlumeFloor > PassiveRange`, so ignition is always an event

## 3. The disclosure predicates

- [ ] 3.1 Implement the passive proximity predicate as `distSq <= rangeSq`,
      inclusive at exact equality, taking both positions as arguments rather
      than resolving them itself (keeps the canonical-path rule enforceable
      at the caller)
- [ ] 3.2 Implement the emission-interval predicate as
      `departTime <= T < arriveTime` over `common.WorldMillis`, with no
      floating-point operand anywhere in its evaluation
- [ ] 3.3 Implement plume radius as
      `max(PlumeFloor, PlumePerDriveOutput * engineClass * commandedAccel)`,
      reading both inputs as stored fields rather than re-deriving either
      from motion, with each product `float64(...)`-guarded
- [ ] 3.4 Implement plume disclosure as a squared comparison against
      `(PassiveRange + plumeRadius)²`
- [ ] 3.5 Scenario test: squared distance exactly equal to squared range
      discloses
- [ ] 3.6 Scenario test: the next representable float above `rangeSq` does
      not disclose — constructed with `math.Nextafter`, not a hand-typed
      literal
- [ ] 3.7 Scenario test: emission is on at `departTime`, off at exactly
      `arriveTime`, and off for a parked fleet at any time
- [ ] 3.8 Scenario test: a lower commanded acceleration yields a strictly
      smaller radius unless both are clamped to the floor; a larger engine
      class at equal acceleration yields a strictly larger one
- [ ] 3.9 Scenario test: a burn at `MinCommandedAccel` still produces a
      radius no smaller than `PlumeFloor`

## 4. Canonical-path and live-disclosure-purity enforcement

- [ ] 4.1 Scenario test: a position reached directly and a position reached
      through the effective-state fold at the same world time are
      bit-identical in every component, with the two routes constructed
      independently rather than sharing a helper (design.md Risks)
- [ ] 4.2 Scenario test: evaluating the same (requester, target, world time)
      twice through independently constructed calls returns the same result
- [ ] 4.3 Scenario test: a target disclosed at T and out of detection radius
      at T' is not disclosed at T' — no carry-forward
- [ ] 4.4 Assert no write occurs on a live disclosure path: the predicate
      package imports no Firestore client and takes no writer
- [ ] 4.5 Scenario test: a corporation holding a sighting record for a
      target does not live-disclose that target when it is outside every
      live detection radius — the stored pile never feeds the live path

## 5. Star occlusion

- [ ] 5.1 Implement segment-vs-sphere occlusion against the star only:
      clamp the segment parameter to `[0,1]`, compare the squared distance
      from the star's centre to the clamped closest point against the
      squared star size, strictly (`<`) so a tangent sightline is clear
- [ ] 5.2 Guard the zero-length segment before dividing by the segment's
      squared length
- [ ] 5.3 Apply occlusion to the passive channel, the plume channel, and
      focused-scan targeting alike
- [ ] 5.4 Scenario test: a fleet behind the star is not disclosed, in range
      and while emitting
- [ ] 5.5 Scenario test: a tangent sightline discloses — the inverted-
      polarity tie rule, constructed with `math.Nextafter` around the
      boundary rather than a hand-typed literal
- [ ] 5.6 Scenario test: a planet, moon, or station on the segment does not
      occlude
- [ ] 5.7 Scenario test: a star beyond the target along the extended line
      does not occlude — the clamp is load-bearing
- [ ] 5.8 Scenario test: coincident observer and target is not occluded and
      performs no division

## 6. Masking

- [ ] 6.1 Implement masking: a ship with a host attachment is excluded from
      every live disclosure channel
- [ ] 6.2 Implement transitive chain resolution to the outermost host, with
      cycle detection that errors rather than looping
- [ ] 6.3 Ensure a host's disclosure is computed without reference to what
      is masked at it — no size, count, or signature term derived from its
      attached ships
- [ ] 6.4 Wire masking to the emission interval so that a ship is unmasked
      from `departTime` and re-masked when a burn resolves into a docked park
- [ ] 6.5 Scenario test: two otherwise identical hosts, one loaded and one
      empty, disclose field-for-field identically
- [ ] 6.6 Scenario test: a ship docked to a carrier docked to a body
      discloses as the body; neither ship nor carrier appears
- [ ] 6.7 Scenario test: an attachment cycle errors
- [ ] 6.8 Scenario test: departure unmasks at `departTime`; arrival re-masks
- [ ] 6.9 Focused scan mints records for every ship in the chain beneath its
      target, mints a clean-sweep record when there are none, and is
      rejected beyond `FocusedScanRange`

## 7. Sighting records as historical claims

- [ ] 7.1 Scenario test: a minted sighting keeps its `asOf` stamp and every
      field unchanged after the sighted fleet has moved
- [ ] 7.2 Scenario test: the scan-mint predicate applies the same inclusive
      squared-comparison boundary rule — a target exactly at the echo radius
      when the pulse reaches it is minted
- [ ] 7.3 Assert sighting records are append-only: no update or delete path
      exists on the store
- [ ] 7.4 Include hull count and hull types on the sighting record, frozen
      at mint
- [ ] 7.5 Scenario test: a live contact's wire type has no hull-count, hull-
      type, or owner field, and no field from which either is derivable
- [ ] 7.6 Scenario test: a sighting's composition does not change after the
      sighted fleet gains or loses hulls

## 8. Determinism check integration

- [ ] 8.1 Extend the transcendental-drift check to cover the new package,
      confirming the scoping widening `add-space-kinematics` made is
      parameterized rather than hard-coded to `space` (that change's
      finding D-4 was exactly this class of gap)
- [ ] 8.2 Confirm no `sqrt` call site exists in the package outside a
      colocated pragma, and that introducing one fails the build
- [ ] 8.3 Confirm the capability contributes zero new entries to the
      determinism deviation register

## 9. Validation

- [ ] 9.1 `openspec validate add-proximity-disclosure --strict` passes
- [ ] 9.2 `go test ./space/...` green on both build-target legs
- [ ] 9.3 Full gate: `python3 .claude/skills/code-quality-checks/check.py`
- [ ] 9.4 Confirm `backend/observation` and `frontend/` are untouched by
      this change — `git status` shows no file under either
