package system

// RED-phase test for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 3.11 — a calibration test mirroring
// TestCalibration_Scenario_NoStarSizePlacesBodyInsideClearanceShell
// (params_continuous_test.go) that reads space.StarClearanceRadius and
// space.InsertionStandoff DIRECTLY (never a copied literal) and asserts
// every star size this generator can emit is rejected with margin, so
// widening the star-size table can never silently make the star targetable
// (design.md Decision 14).
//
// UNLIKE most of this SDET pass's section-3 tests, this one does NOT
// require any not-yet-written production code — space.StarClearanceRadius,
// space.InsertionStandoff, and system.StarSize all already exist (sections
// 1-2 of this change, and prior work). It is a calibration/regression pin
// over ALREADY-SHIPPED functions, not an acceptance test for new fleet
// behavior, so it is EXPECTED TO PASS on its first run — that is not a
// broken test (the general "must fail before implementation exists" rule
// is about the BEHAVIOR under test, and here the behavior — the star's
// insertion standoff sitting inside its own clearance shell for every
// configured size — already exists and is exactly what design.md Decision
// 14 computed by hand ("at s=5.2 the standoff is 10.3 against a clearance
// of 13.0; at s=7.6 it is 13.9 against 19.0")). Its value is as a
// regression guard: if a future star-size-table widening ever lets
// InsertionStandoff catch up to StarClearanceRadius, THIS test goes red
// and is the signal that fleet-movement's "ordering the star's own body id
// is rejected by geometry" requirement (3.10) has silently stopped holding.

import (
	"testing"

	"hexaverse/space"
)

func TestCalibration_Scenario_StarsOwnInsertionStandoffNeverReachesItsClearanceShell(t *testing.T) {
	classes := []string{"O", "B", "A", "F", "G", "K", "M", "unrecognized"}
	for _, c := range classes {
		size := StarSize(c)
		clearance := space.StarClearanceRadius(size)
		standoff := space.InsertionStandoff(space.Body{Id: "the-star", Size: size})
		if !(standoff < clearance) {
			t.Fatalf("class %q: size=%v InsertionStandoff=%v StarClearanceRadius=%v — "+
				"want the standoff strictly inside the clearance shell (so a body-targeted burn to "+
				"the star is rejected by BuildCurve's endpoint-clearance guard, with margin)",
				c, size, standoff, clearance)
		}
	}
}

// SDET-added: pins the margin itself is comfortably positive across the
// table, not merely nonzero — a one-ULP margin would be a fragile pin.
func TestCalibration_Scenario_StarClearanceMarginIsComfortablyPositive(t *testing.T) {
	const minAcceptableMargin = 1.0 // world-distance units; a feel-dial sanity floor, not spec-pinned
	classes := []string{"O", "B", "A", "F", "G", "K", "M"}
	for _, c := range classes {
		size := StarSize(c)
		margin := space.StarClearanceRadius(size) - space.InsertionStandoff(space.Body{Id: "the-star", Size: size})
		if margin < minAcceptableMargin {
			t.Fatalf("class %q: clearance margin = %v, want at least %v of headroom before the "+
				"standoff and the clearance shell converge", c, margin, minAcceptableMargin)
		}
	}
}
