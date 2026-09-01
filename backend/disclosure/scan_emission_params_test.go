package disclosure

// RED-phase test for openspec change replace-observation-with-sightings §5,
// task 5.6 — "Add params_test.go pins: ScanEmissionFloor > PassiveRange, and
// ScanEmissionPerRange × FocusedScanRange strictly less than a nominal
// class-2 burn's plume, mirroring the existing PlumeFloor > PassiveRange
// pin."
//
// Deliberately a NEW file rather than an edit to the existing, committed
// params_test.go (§2's TestPlumeFloorExceedsPassiveRange lives there) — the
// kickoff's standing rule is "do not touch §1-4's committed tests", and
// tasks.md 5.6's own instruction to "add... pins" is satisfied by a sibling
// file asserting the identical relationship for the two new constants,
// without editing that file's existing content.
//
// The nominal class-2 burn plume figure (128) is params.go's own worked
// example in PlumePerDriveOutput's doc comment: "engine classes 1/2/3 at
// accel 8 give radii of 64, 128, and 192" — reproduced here via
// PlumeRadius(2, 8) rather than a bare literal, so this test tracks the
// live curve rather than a stale copy of one calibration.
//
// EXPECTED RED TODAY: compile error — ScanEmissionFloor and
// ScanEmissionPerRange do not exist yet.

import "testing"

// Scenario (params-pin, design.md Decision 9): the sweep-emission floor
// exceeds passive range, exactly as the plume floor does — a sweeping fleet
// is always at least as detectable, cold, as one somebody could already see
// unaided.
func TestScanEmissionFloorExceedsPassiveRange(t *testing.T) {
	if !(ScanEmissionFloor > PassiveRange) {
		t.Fatalf("ScanEmissionFloor (%v) must exceed PassiveRange (%v)", ScanEmissionFloor, PassiveRange)
	}
}

// Scenario (params-pin, design.md Decision 9): even at the sweep's own
// maximum range, its emission stays strictly quieter than a nominal
// class-2 burn — "a thorough search is the most detectable thing a fleet
// can do short of burning" is a claim about ORDERING, not just a floor, and
// this is the relationship that keeps it true.
func TestScanEmissionAtMaxRangeStaysBelowANominalClass2BurnPlume(t *testing.T) {
	nominalClass2Plume := PlumeRadius(2, 8)
	atMaxRange := ScanEmissionPerRange * FocusedScanRange
	if !(atMaxRange < nominalClass2Plume) {
		t.Fatalf("ScanEmissionPerRange (%v) * FocusedScanRange (%v) = %v, want strictly less than a nominal "+
			"class-2 burn's plume radius %v — the loudest possible sweep must stay quieter than an ordinary burn",
			ScanEmissionPerRange, FocusedScanRange, atMaxRange, nominalClass2Plume)
	}
}
