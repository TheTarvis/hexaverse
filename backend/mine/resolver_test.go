package mine

import (
	"context"
	"strings"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/system"
)

// mine-extraction spec: "Resolve Clamps Yield to Reality", "Exactly-Once
// Lode Delta", "One Resource Kind Per Run" (tasks 2.3, 4.2, 4.4). Pure
// function tests against mine.Resolver — no Firestore needed (the resolver
// only reads through action.Resolution's DecodeActor/Remaining closures,
// which these tests fabricate by hand). All red now: Resolver is a stub
// (errNotImplemented) regardless of input.

const resolveKind = system.ResourceMetals

func frozenParams(tons, rate, startTons float64) map[string]interface{} {
	return map[string]interface{}{
		"featureId": testFeatureID,
		"kind":      string(resolveKind),
		"tons":      tons,
		"rate":      rate,
		"startTons": startTons,
	}
}

// decodeActorFleet returns a Resolution.DecodeActor closure that copies f into
// the resolver's target — mirroring how a real Firestore actor read decodes.
func decodeActorFleet(f fleet.Fleet) func(interface{}) error {
	return func(target interface{}) error {
		ptr, ok := target.(*fleet.Fleet)
		if !ok {
			return errNotImplemented
		}
		*ptr = f
		return nil
	}
}

// resolveWith builds a Resolution for the given fold value and actor fleet,
// and runs mine.Resolver against it.
func resolveWith(t *testing.T, tons, rate, startTons, fold float64, actor fleet.Fleet) (action.ResolveResult, error) {
	t.Helper()
	stats := map[fleet.ShipClass]fleet.ClassStats{fleet.ClassSeed: {HoldCapacity: 100}}
	resolver := Resolver(MineParams{}, stats, common.WorldClock())
	return resolver(context.Background(), action.Resolution{
		Action:      action.Action{Id: "action_resolve_test", Params: frozenParams(tons, rate, startTons)},
		At:          5000,
		DecodeActor: decodeActorFleet(actor),
		Remaining:   func(common.WorldMillis) (float64, error) { return fold, nil },
	})
}

func emptyCargoFleet() fleet.Fleet {
	return fleet.Fleet{Id: testFleetID, Ships: []fleet.ShipEntry{{Class: fleet.ClassSeed}}}
}

// Scenario: A clean run takes the full target.
func TestResolver_Scenario_CleanRunTakesFullTarget(t *testing.T) {
	res, err := resolveWith(t, 40, 10, 100, 0 /* nothing taken yet */, emptyCargoFleet())
	if err != nil {
		t.Fatalf("resolver errored: %v", err)
	}
	if res.ReasonCode != string(ReasonClean) {
		t.Errorf("reasonCode = %q, want %q", res.ReasonCode, ReasonClean)
	}
	if res.Delta == nil || res.Delta.Amount != -40 {
		t.Fatalf("delta = %+v, want amount -40", res.Delta)
	}
	if !strings.Contains(res.Outcome, "40") {
		t.Errorf("outcome %q must name the taken tonnage (40)", res.Outcome)
	}
	assertCargoCredited(t, res, 40)
}

// Scenario: A dry lode clamps to what remains.
func TestResolver_Scenario_DryLodeClampsToRemaining(t *testing.T) {
	// startTons 100, fold -70 (70 already taken) ⇒ remainingAtEta = 30 < 40 requested.
	res, err := resolveWith(t, 40, 10, 100, -70, emptyCargoFleet())
	if err != nil {
		t.Fatalf("resolver errored: %v", err)
	}
	if res.ReasonCode != string(ReasonLodeDry) {
		t.Errorf("reasonCode = %q, want %q", res.ReasonCode, ReasonLodeDry)
	}
	if res.Delta == nil || res.Delta.Amount != -30 {
		t.Fatalf("delta = %+v, want amount -30 (clamped to the 30 remaining)", res.Delta)
	}
	if !strings.Contains(strings.ToLower(res.Outcome), "dry") {
		t.Errorf("outcome %q must record that the lode ran dry", res.Outcome)
	}
	assertCargoCredited(t, res, 30)
}

// Scenario: A full hold clamps to free capacity.
func TestResolver_Scenario_FullHoldClampsToFreeCapacity(t *testing.T) {
	// Capacity 100 (stats fixture), fleet already holds 90 ⇒ free hold 10 < 40.
	full := emptyCargoFleet()
	full.Cargo = map[string]float64{string(resolveKind): 90}
	res, err := resolveWith(t, 40, 10, 100, 0, full)
	if err != nil {
		t.Fatalf("resolver errored: %v", err)
	}
	if res.ReasonCode != string(ReasonHoldFull) {
		t.Errorf("reasonCode = %q, want %q", res.ReasonCode, ReasonHoldFull)
	}
	if res.Delta == nil || res.Delta.Amount != -10 {
		t.Fatalf("delta = %+v, want amount -10 (clamped to the 10 free hold)", res.Delta)
	}
	if !strings.Contains(strings.ToLower(res.Outcome), "hold") {
		t.Errorf("outcome %q must record that the hold filled", res.Outcome)
	}
	assertCargoCredited(t, res, 100) // 90 held + 10 taken = capacity
}

// Scenario: An already-exhausted lode resolves to a zero take, not a
// negative one (also "Exactly-Once Lode Delta"'s "A zero-take resolve
// appends no delta but still resolves done").
func TestResolver_Scenario_AlreadyExhaustedLodeFloorsAtZero(t *testing.T) {
	// startTons 100, fold -150 (over-depleted) ⇒ remainingAtEta = max(0, -50) = 0.
	res, err := resolveWith(t, 40, 10, 100, -150, emptyCargoFleet())
	if err != nil {
		t.Fatalf("resolver must not error on a zero-take resolve: %v", err)
	}
	if res.Delta != nil {
		t.Fatalf("delta = %+v, want nil — a zero-take resolve appends NO delta document, not a zero-amount one", res.Delta)
	}
	if res.ReasonCode != string(ReasonLodeDry) {
		t.Errorf("reasonCode = %q, want %q (the lode bound the take to zero)", res.ReasonCode, ReasonLodeDry)
	}
	if res.Outcome == "" {
		t.Errorf("outcome must still be set (honest) even on a zero-take resolve")
	}
	if cargoPatch, ok := res.ActorState["cargo"]; ok {
		if m, ok := cargoPatch.(map[string]interface{}); ok {
			if v, present := m[string(resolveKind)]; present {
				t.Errorf("cargo patch for %s = %v, want no credit at all on a zero-take resolve", resolveKind, v)
			}
		}
	}
}

// Scenario: A single run yields only its named kind ("One Resource Kind Per
// Run").
func TestResolver_Scenario_SingleRunYieldsOnlyItsNamedKind(t *testing.T) {
	res, err := resolveWith(t, 40, 10, 100, 0, emptyCargoFleet())
	if err != nil {
		t.Fatalf("resolver errored: %v", err)
	}
	cargoPatch, ok := res.ActorState["cargo"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected an ActorState cargo patch, got %+v", res.ActorState)
	}
	if _, present := cargoPatch[string(system.ResourceVolatiles)]; present {
		t.Errorf("a %s run must not touch any other kind's cargo, got %+v", resolveKind, cargoPatch)
	}
	if _, present := cargoPatch[string(resolveKind)]; !present {
		t.Errorf("expected a credit for the run's own kind %s, got %+v", resolveKind, cargoPatch)
	}
}

// assertCargoCredited checks the resolver credited the fleet's cargo pool for
// resolveKind to exactly `want` tons (fresh fleet ⇒ credited == taken; a
// fleet with pre-existing cargo must be credited on TOP of what it already
// held — callers pass the post-resolve total they expect).
func assertCargoCredited(t *testing.T, res action.ResolveResult, want float64) {
	t.Helper()
	cargoPatch, ok := res.ActorState["cargo"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected an ActorState cargo patch, got %+v", res.ActorState)
	}
	got, ok := cargoPatch[string(resolveKind)]
	if !ok {
		t.Fatalf("cargo patch has no %s entry: %+v", resolveKind, cargoPatch)
	}
	gotF, ok := got.(float64)
	if !ok || gotF != want {
		t.Fatalf("cargo.%s = %v, want %v", resolveKind, got, want)
	}
}
