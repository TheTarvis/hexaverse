package disclosure

// RED-phase tests for openspec change replace-observation-with-sightings §5,
// tasks.md 5.1 (specs/focused-scan/spec.md — "A Sweep Emits For Its
// Duration"; specs/proximity-disclosure/spec.md ADDED "An Active Sweep Emits
// For Its Duration", the CANONICAL statement of this predicate that
// focused-scan's own requirement explicitly defers to).
//
// SIGNATURE NOTE (SDET judgment call, open to dispute): design.md Decision
// 11 says "disclosure.Ship gains a matching Scan field, and
// disclosure.Scanning(s, t) is the same exact integer interval test Emitting
// is — DepartMs <= t < ArriveMs" — without pinning an exact shape for the
// field. Emitting's own signature is `Emitting(s space.ShipState, t) bool`,
// reading `s.Burn.DepartMs`/`ArriveMs` off a sibling struct nested under
// ShipState. Ship has no analogous "mode" wrapper for a sweep — a fleet can
// scan and burn/park/drift independently, mirroring fleet.Fleet's own
// separate `State`/`Jump`/`Scan` fields (design.md Decision 11's own words:
// "mirroring fleet.Fleet.Scan *ScanWindow{HostId, DepartMs, ArriveMs,
// Range} field-for-field in shape and lifecycle"). Since disclosure can
// never import fleet (purity_test.go's closed allow-list), this file
// assumes disclosure grows its OWN small mirror of that shape rather than
// importing fleet.ScanWindow:
//
//	type ScanWindow struct {
//	    DepartMs common.WorldMillis
//	    ArriveMs common.WorldMillis
//	    Range    float64 // the commit-time distance to the host — the "d" in
//	                     // scanEmissionRadius(d) (design.md Decision 9); a
//	                     // frozen value disclosure cannot recompute since it
//	                     // never sees the host, only the sweeping ship.
//	}
//
//	type Ship struct {
//	    ... // existing fields unchanged
//	    Scan *ScanWindow
//	}
//
//	func Scanning(s Ship, t common.WorldMillis) bool {
//	    if s.Scan == nil { return false }
//	    return s.Scan.DepartMs <= t && t < s.Scan.ArriveMs
//	}
//
// See scan_emission_test.go for the sibling contract note on
// scanEmissionRadius/detectionRadius, which is what Range above exists to
// feed. A developer landing a materially different but scenario-equivalent
// shape (e.g. nesting DepartMs/ArriveMs under Ship.State somehow, or naming
// the predicate differently) should raise it as a test dispute — this bet
// is disclosed, not hidden.
//
// EXPECTED RED TODAY: compile error — Ship has no Scan field and Scanning
// does not exist. That is legitimate red evidence for a wholly new package
// surface (per the kickoff's own standing instruction), not a broken test.

import (
	"testing"

	"hexaverse/common"
)

// Scenario: Scanning is on during the sweep's committed interval
// (proximity-disclosure "An Active Sweep Emits For Its Duration"; restated
// at the verb level by focused-scan "A fleet is sweeping during its scan
// window").
//
// Scenario: The sweep's arrive instant ends scanning (proximity-disclosure;
// restated by focused-scan "Sweeping ends at the scan's arrival instant").
//
// Scenario: A ship with no stored sweep window is never reported as
// scanning (proximity-disclosure).
//
// Structured as one table, mirroring predicate_test.go's own
// TestEmitting_IsTheHalfOpenIntegerInterval exactly — same shape, same
// half-open convention, same reason for it (space.StateAt's "a burn past
// its arrival IS its settled park" convention).
func TestScanning_IsTheHalfOpenIntegerInterval(t *testing.T) {
	const depart, arrive common.WorldMillis = 2_000, 9_000
	sweeping := Ship{Id: "s", Scan: &ScanWindow{DepartMs: depart, ArriveMs: arrive}}

	cases := []struct {
		name string
		at   common.WorldMillis
		want bool
	}{
		{"one millisecond before depart", depart - 1, false},
		{"exactly at depart", depart, true},
		{"mid-sweep", (depart + arrive) / 2, true},
		{"one millisecond before arrive", arrive - 1, true},
		{"exactly at arrive", arrive, false},
		{"after arrive", arrive + 1, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Scanning(sweeping, c.at); got != c.want {
				t.Errorf("Scanning at %d = %v, want %v", c.at, got, c.want)
			}
		})
	}

	idle := Ship{Id: "idle"} // Scan is nil
	for _, at := range []common.WorldMillis{0, depart, arrive, 1 << 40} {
		if Scanning(idle, at) {
			t.Errorf("a ship with no stored sweep window reports scanning at %d", at)
		}
	}
}
