package fleet

// RED-phase test for openspec change add-scan-and-sightings-surface,
// tasks.md 3.13 (specs/focused-scan/spec.md's MODIFIED "A Sweep Resolves
// Into Sightings, Or Fizzles" — "A sweep already settled by a racing read
// carries its own reason code distinct from every geometry, system,
// transit, and host-resolution reason code").
//
// CONTRACT: `fleet/resolver.go`'s `f.Scan == nil` no-op path today returns
// `action.ResolveResult{Outcome: "scan already settled"}` with NO
// ReasonCode at all. Task 3.13 gives it the pinned code `alreadySettled`
// (design.md/tasks.md's own example spelling), so a consumer treating "any
// served reason code" as a fizzle (system-space-view "A Settled Sweep
// Reports Its Outcome") does not misreport this no-mint resolution as
// having filed records — the exact failure a MISSING reason code produces.
//
// EXPECTED RED TODAY: assertion failure (ReasonCode == ""), not a compile
// error — ScanResolver and the f.Scan==nil branch both already exist.
// Mirrors scan_resolver_test.go's own established fixture technique
// (scanningFleet, fakeShipSource) exactly.

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/space"
)

func TestScanResolver_Scenario_AlreadySettledCarriesItsOwnReasonCode(t *testing.T) {
	bodies := testBodyTable(t, "sys-0", 6.0)

	// A scanner whose stored Scan window is nil — a racing reader already
	// cleared it before THIS resolve attempt ran.
	state := EncodeKinematicState(space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 100}}})
	scanner := Fleet{Id: "scanner-1", CorporationId: "corp-me", SystemId: "sys-0", StateDoc: state, Scan: nil}

	ships := fakeShipSource{fleets: map[string][]Fleet{"sys-0": {}}}
	resolver := ScanResolver(ships, stubBodySourceFixed{bt: bodies})

	res, err := resolver(context.Background(), action.Resolution{
		At:     10_000,
		Action: action.Action{Id: "action_already_settled_1", Scope: "sys-0"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = scanner
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(res.Writes) != 0 {
		t.Errorf("an already-settled resolve minted %d writes, want 0: %+v", len(res.Writes), res.Writes)
	}
	if res.ReasonCode == "" {
		t.Fatalf("focused-scan \"A sweep already settled by a racing read carries its own reason code\": " +
			"ResolveResult.ReasonCode is empty for the f.Scan==nil no-op path — a consumer that treats any " +
			"served reason code as a fizzle would misreport this as having filed records")
	}
	if res.ReasonCode == "outOfRange" || res.ReasonCode == "occluded" || res.ReasonCode == "leftSystem" ||
		res.ReasonCode == "laneTransit" || res.ReasonCode == "hostUnresolved" {
		t.Errorf("already-settled ReasonCode = %q, want a code DISTINCT from every geometry/system/transit/"+
			"host-resolution code, e.g. %q", res.ReasonCode, "alreadySettled")
	}
}
