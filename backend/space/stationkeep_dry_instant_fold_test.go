package space

// RED-PHASE SDET SUITE for openspec change add-stationkeep-hold-verb —
// space-kinematics:
//
//   - MODIFIED "Idle Ships Park in Exactly One of Three Modes"
//     ("A station-keep park holds the exact stored offset" — now qualified
//     "both before its stored dry instant"; "A newly created station-keep
//     park stores its start time and dry instant")
//   - ADDED "A Station-Keeping Park Past Its Dry Instant Is Its Released
//     Orbit, With No Extra Persisted State" (all three scenarios)
//
// ============================================================================
// ASSUMED API CONTRACT (SDET-pinned; see helpers_test.go's own precedent)
// ============================================================================
// design.md's first Decision names the two new persisted fields in prose —
// "the hold's start world time" and "the dry instant" — but pins neither a Go
// field name nor a stored key. tasks.md 1.1 likewise says only "add the two
// new stationkeep-only Park fields". This suite therefore fixes ONE concrete
// choice, mirroring Park's existing `EpochMs`/`PeriodMs` and Burn's
// `DepartMs`/`ArriveMs` naming, so the tests compile into a single coherent
// contract:
//
//	type Park struct {
//	    ...                                  // unchanged
//	    HoldStartMs  common.WorldMillis      // stationkeep only
//	    DryInstantMs common.WorldMillis      // stationkeep only
//	}
//
// and, in codec_state.go, the two stored keys "holdStartMs" / "dryInstantMs"
// (see codec_stationkeep_park_test.go).
//
// Per the SDET protocol this choice IS the contract until the orchestrator
// adjudicates otherwise; a rename is a spec/contract change routed back
// through the SDET, not a unilateral developer edit.
//
// EXPECTED RED STATE: this file does not compile today — space.Park has no
// HoldStartMs/DryInstantMs field, and StateAt folds nothing for a park. That
// missing-symbol failure is the correct initial red state; no production
// symbol is stubbed into existence to make it compile.

import (
	"testing"

	"hexaverse/common"
)

// heldPark builds a stationkeep park with an explicit hold window. Every
// scenario below needs one; none of them needs the dry instant to have come
// from the fleet-side formula (that formula's own arithmetic is pinned in
// backend/fleet/stationkeep_hold_release_test.go, against the real verb).
func heldPark(bodyId string, offset Vec3, holdStart, dryInstant common.WorldMillis) Park {
	return Park{
		Kind:         ParkStationkeep,
		BodyId:       bodyId,
		Offset:       offset,
		HoldStartMs:  holdStart,
		DryInstantMs: dryInstant,
	}
}

// --- MODIFIED "Idle Ships Park in Exactly One of Three Modes" --------------

// Scenario: A newly created station-keep park stores its start time and dry
// instant.
//
// "it stores the world time it was created and a dry instant computed from
// the SPENDABLE FUEL HELD ABOVE THE RESERVE and the upkeep rate at that same
// instant" — AND "neither value changes with the mere passage of time, nor
// with any read of the park; the two change only together, and only where the
// holding capability restamps the hold at a mid-hold `fuel` mutation that
// leaves the hold open."
//
// The "computed from the spendable fuel above the reserve" half belongs to the
// fleet verb (backend/fleet/stationkeep_hold_release_test.go), and the "change
// only together" half to the refuel restamp
// (backend/stationkeep_refuel_e2e_test.go, which asserts BOTH stamps move —
// asserting either alone passes against a half-restamp). What THIS capability
// owns is that the park CARRIES both values and that nothing in this package's
// own evaluation of the park mutates them.
func TestPark_Scenario_ANewlyCreatedStationKeepParkStoresItsStartTimeAndDryInstant(t *testing.T) {
	bodies := testSystem()
	p := heldPark("planet1", Vec3{X: 4, Y: 1, Z: -3}, 10_000, 70_000)

	if p.HoldStartMs != 10_000 {
		t.Errorf("HoldStartMs = %d, want the world time the hold was created (10000)", p.HoldStartMs)
	}
	if p.DryInstantMs != 70_000 {
		t.Errorf("DryInstantMs = %d, want the stored dry instant (70000)", p.DryInstantMs)
	}
	if !(p.DryInstantMs > p.HoldStartMs) {
		t.Fatalf("fixture invariant: a stored dry instant must be strictly after its hold start "+
			"(holdStart=%d dryInstant=%d)", p.HoldStartMs, p.DryInstantMs)
	}

	// "STORES the world time it was created and a dry instant" — stores, not
	// merely holds in memory. A park that loses either field on its way
	// through the persistence boundary has stored neither, and every
	// settlement downstream then computes against a zero epoch.
	roundTripped, err := DecodePark(EncodePark(p))
	if err != nil {
		t.Fatalf("a newly created station-keep park failed to round-trip through the codec: %v", err)
	}
	if roundTripped.HoldStartMs != p.HoldStartMs || roundTripped.DryInstantMs != p.DryInstantMs {
		t.Errorf("space-kinematics \"A newly created station-keep park stores its start time and dry "+
			"instant\": the stored hold window did not survive the codec — encoded (holdStart=%d "+
			"dryInstant=%d), decoded (holdStart=%d dryInstant=%d). An implementer with nowhere to persist "+
			"the hold's start reaches for Fleet.UpdatedAt as a proxy, which unrelated writes re-stamp — the "+
			"silent-corruption bug design.md names explicitly.",
			p.HoldStartMs, p.DryInstantMs, roundTripped.HoldStartMs, roundTripped.DryInstantMs)
	}

	// "neither value changes with the mere passage of time, nor with any read
	// of the park" — evaluating the park is a pure read; it must never
	// restamp either field.
	for _, tm := range []common.WorldMillis{10_000, 30_000, 69_999} {
		if _, err := p.Position(bodies, tm); err != nil {
			t.Fatalf("Position at t=%d: %v", tm, err)
		}
		if _, err := StateAt(bodies, ShipState{Mode: ModeParked, Park: &p}, tm); err != nil {
			t.Fatalf("StateAt at t=%d: %v", tm, err)
		}
		if p.HoldStartMs != 10_000 || p.DryInstantMs != 70_000 {
			t.Fatalf("space-kinematics \"A newly created station-keep park stores its start time and dry "+
				"instant\": evaluating the park at t=%d changed its stored window (holdStart=%d dryInstant=%d), "+
				"want it unchanged — \"neither value changes with the mere passage of time, nor with any read "+
				"of the park\"", tm, p.HoldStartMs, p.DryInstantMs)
		}
	}
}

// Scenario: A station-keep park holds the exact stored offset
//
// MODIFIED wording: "evaluated at two different world times, BOTH BEFORE ITS
// STORED DRY INSTANT — THEN at each time it equals its body's position at
// that time plus the park's exact stored offset".
//
// Evaluated through StatePosition (the fold-then-position seam every consumer
// actually goes through), not Park.Position directly: the post-change reading
// of this scenario is precisely that the fold has NOT fired yet.
func TestPark_Scenario_StationKeepParkHoldsExactStoredOffsetBeforeItsDryInstant(t *testing.T) {
	bodies := testSystem()
	offset := Vec3{X: 4, Y: 1, Z: -3}
	p := heldPark("planet1", offset, 0, 50_000)
	s := ShipState{Mode: ModeParked, Park: &p}

	for _, tm := range []common.WorldMillis{0, 9_900, 49_999} {
		got, err := StatePosition(bodies, s, tm)
		requireNoError(t, err)
		bodyPos, err := Position(bodies, "planet1", tm)
		requireNoError(t, err)
		want := bodyPos.Add(offset)
		if got != want {
			t.Errorf("space-kinematics \"A station-keep park holds the exact stored offset\": t=%d "+
				"(strictly before the stored dry instant %d): position = %v, want body(%v) + offset = %v",
				tm, p.DryInstantMs, got, bodyPos, want)
		}
	}
}

// --- ADDED "A Station-Keeping Park Past Its Dry Instant Is Its Released
// Orbit, With No Extra Persisted State" --------------------------------------

// Scenario: A station-keep park is still held immediately before its dry
// instant and released immediately after.
//
// The one-millisecond boundary on either side, exactly as the sibling burn
// rule ("A Burn Past Its Arrival Is Its Settled Park") is pinned: an exact
// integer comparison, no epsilon.
func TestStateAt_Scenario_StationKeepHeldOneMsBeforeDryInstantAndReleasedOneMsAfter(t *testing.T) {
	bodies := testSystem()
	const dry common.WorldMillis = 50_000
	offset := Vec3{X: 12, Y: 4, Z: -9}
	p := heldPark("planet1", offset, 1_000, dry)
	s := ShipState{Mode: ModeParked, Park: &p}

	before, err := StateAt(bodies, s, dry-1)
	requireNoError(t, err)
	if before.Mode != ModeParked || before.Park == nil {
		t.Fatalf("one ms before the dry instant: mode = %v (park=%v), want a park", before.Mode, before.Park)
	}
	if before.Park.Kind != ParkStationkeep {
		t.Errorf("space-kinematics \"A station-keep park is still held immediately before its dry instant\": "+
			"kind at t=dryInstant-1 = %v, want ParkStationkeep", before.Park.Kind)
	}
	if before.Park.Offset != offset {
		t.Errorf("one ms before the dry instant: held offset = %v, want the exact stored offset %v",
			before.Park.Offset, offset)
	}

	after, err := StateAt(bodies, s, dry+1)
	requireNoError(t, err)
	if after.Mode != ModeParked || after.Park == nil {
		t.Fatalf("one ms after the dry instant: mode = %v (park=%v), want a park", after.Mode, after.Park)
	}
	if after.Park.Kind != ParkOrbit {
		t.Fatalf("space-kinematics \"... and released immediately after\": kind at t=dryInstant+1 = %v, want "+
			"ParkOrbit — a station-keep park observed at or after its stored dry instant IS its released orbit",
			after.Park.Kind)
	}

	// "at or after" — the dry instant itself is already released, exactly as
	// the burn rule's own "t >= arriveMs" boundary is.
	at, err := StateAt(bodies, s, dry)
	requireNoError(t, err)
	if at.Park == nil || at.Park.Kind != ParkOrbit {
		t.Errorf("at exactly the stored dry instant: kind = %v, want ParkOrbit — the requirement says "+
			"\"observed AT OR AFTER its stored dry instant\", the same inclusive boundary the burn-arrival "+
			"fold uses", at.Park)
	}
}

// Scenario: Folding at two later times gives identical results.
func TestStateAt_Scenario_PastDryInstantFoldingAtTwoLaterTimesGivesIdenticalResults(t *testing.T) {
	bodies := testSystem()
	p := heldPark("moon1", Vec3{X: 7, Y: -2, Z: 3}, 500, 20_000)
	s := ShipState{Mode: ModeParked, Park: &p}

	a, err := StateAt(bodies, s, 20_001)
	requireNoError(t, err)
	b, err := StateAt(bodies, s, 9_000_000)
	requireNoError(t, err)
	if a.Park == nil || b.Park == nil {
		t.Fatalf("one of the two folds produced no park: a=%+v b=%+v", a, b)
	}
	// Guard against a vacuous pass: with NO fold implemented at all, both
	// evaluations return the identical unfolded `stationkeep` park and the
	// equality below holds for entirely the wrong reason.
	if a.Park.Kind != ParkOrbit {
		t.Fatalf("at t=20001 (past the stored dry instant %d) the state is still %v, so the equality this "+
			"scenario asserts would hold vacuously — the park must fold to its released orbit first",
			p.DryInstantMs, a.Park.Kind)
	}
	if *a.Park != *b.Park {
		t.Errorf("space-kinematics \"Folding at two later times gives identical results\": t=20001 folded to "+
			"%+v, t=9000000 folded to %+v — the released orbit must be computed from the stored park alone, "+
			"so it cannot depend on the observation time", *a.Park, *b.Park)
	}
}

// Scenario: The released orbit matches ReleaseStationkeep's own output
// exactly.
func TestStateAt_Scenario_FoldedReleasedOrbitMatchesReleaseStationkeepExactly(t *testing.T) {
	bodies := testSystem()
	const dry common.WorldMillis = 33_333
	offset := Vec3{X: -14.5, Y: 6.25, Z: 21.75}
	p := heldPark("planet2", offset, 1_111, dry)

	folded, err := StateAt(bodies, ShipState{Mode: ModeParked, Park: &p}, dry+12_345)
	requireNoError(t, err)
	if folded.Park == nil {
		t.Fatalf("fold produced no park: %+v", folded)
	}
	want := ReleaseStationkeep(p.BodyId, offset, dry)
	if *folded.Park != want {
		t.Errorf("space-kinematics \"The released orbit matches ReleaseStationkeep's own output exactly\":\n"+
			"  folded = %+v\n  ReleaseStationkeep(%q, %v, dryInstant=%d) = %+v\n"+
			"The fold must use the DRY INSTANT as the release time, not the observation time.",
			*folded.Park, p.BodyId, offset, dry, want)
	}
}

// SDET-added (beyond the literal scenarios): the fold is a pure function of
// the STORED park — "no field beyond the park's own already-stored
// hold-start time, dry instant, body id, and offset SHALL be persisted to
// represent this transition". Folding must therefore never mutate the park it
// was handed, or a caller that re-reads its own value after a read would see
// a silently-rewritten hold window.
func TestStateAt_SDET_PastDryInstantFoldNeverMutatesTheStoredPark(t *testing.T) {
	bodies := testSystem()
	p := heldPark("planet1", Vec3{X: 3, Y: 0, Z: 4}, 2_000, 12_000)
	original := p

	if _, err := StateAt(bodies, ShipState{Mode: ModeParked, Park: &p}, 999_999); err != nil {
		t.Fatalf("StateAt: %v", err)
	}
	if p != original {
		t.Errorf("SDET-added: folding a past-dry-instant park MUTATED the stored park in place:\n"+
			"  before = %+v\n  after  = %+v\nThe fold is a derivation, not a write.", original, p)
	}
}

// SDET-added: a stationkeep park whose dry instant has NOT passed folds to
// itself, unchanged — the negative control for every assertion above. Without
// it, an implementation that folds unconditionally would satisfy the three
// "past the dry instant" scenarios while breaking every hold that is still
// live.
func TestStateAt_SDET_StationKeepBeforeItsDryInstantFoldsToItselfUnchanged(t *testing.T) {
	bodies := testSystem()
	p := heldPark("planet1", Vec3{X: 3, Y: 0, Z: 4}, 2_000, 120_000)

	for _, tm := range []common.WorldMillis{2_000, 60_000, 119_999} {
		got, err := StateAt(bodies, ShipState{Mode: ModeParked, Park: &p}, tm)
		requireNoError(t, err)
		if got.Park == nil || *got.Park != p {
			t.Errorf("SDET-added: at t=%d (strictly before dryInstant=%d) the fold returned %+v, want the "+
				"identical stored park %+v", tm, p.DryInstantMs, got.Park, p)
		}
	}
}
