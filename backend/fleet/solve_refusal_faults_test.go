package fleet

// RED-phase tests for fix-burn-order-geometry-refusals task 2.9: faults that
// are not player-causable stay 5xx with an error log, never a refusal.
//
// COMPOSED CASES (RULING 12, impl-contract section 0 and 7.4). A body-table
// cycle, and a present body whose parent is missing, cannot exist in a real
// *system.BodyTable (its builder drops every feature whose parent chain fails,
// and its fields are unexported), so the service cannot be handed one. These
// are covered at "helper + handler, composed": solveBurnClassified is called
// with a map-backed space.Bodies holding the fault, and the error it returns,
// wrapped as the call sites wrap it, is fed through the REAL handler on
// orders, orders/preview and stop. The real table carrying the fault is not
// exercised; production cannot produce it. The stored-host case needs no
// composition: it uses the real Service and a real table.

import (
	"errors"
	"fmt"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

type faultBodies map[string]space.Body

func (b faultBodies) Body(id string) (space.Body, bool) { v, ok := b[id]; return v, ok }

var faultSentinels = []struct {
	name string
	err  error
}{
	{"ErrTargetBodyAbsent", ErrTargetBodyAbsent},
	{"ErrOriginInsideClearance", ErrOriginInsideClearance},
	{"ErrDestinationInsideClearance", ErrDestinationInsideClearance},
	{"ErrBurnArcTooShort", ErrBurnArcTooShort},
}

func assertNoFleetSentinel(t *testing.T, err error) {
	t.Helper()
	for _, s := range faultSentinels {
		if errors.Is(err, s.err) {
			t.Errorf("a fault was classified as %s: %v", s.name, err)
		}
	}
}

// solveFaulty calls the pinned helper with a faulty table, a from outside the
// clearance and a target naming the faulty body, capturing its log.
func solveFaulty(t *testing.T, bodies faultBodies, target string) (error, string) {
	t.Helper()
	var err error
	out := captureLog(t, func() {
		_, err = solveBurnClassified(t.Context(), routeOrder, "fleet_1", "sys-0", bodies,
			space.Vec3{X: 150}, space.Target{BodyId: target}, common.WorldMillis(0), 8.0, nil, 15.0)
	})
	return err, out
}

// feedThroughHandler wraps err as the call sites do and serves it on all
// three routes through the real handler, asserting a bodyless 500, exactly
// one error-level entry, and no refusal cause on it.
func feedThroughHandler(t *testing.T, err error) {
	t.Helper()
	wrapped := fmt.Errorf("fleet: solving burn: %w", err)
	svc := &fakeFleetSvc{
		fleet:    &Fleet{Id: "f1", CorporationId: "corp-user1", SystemId: "sys-0"},
		orderErr: wrapped, previewErr: wrapped, stopErr: fmt.Errorf("fleet: solving stop burn: %w", err),
	}
	r := newFleetRouter(svc)
	for _, route := range []struct {
		name, path string
		body       []byte
	}{
		{"orders", "/fleets/f1/orders", pointOrder(150, 0, 0)},
		{"orders/preview", "/fleets/f1/orders/preview", pointOrder(150, 0, 0)},
		{"stop", "/fleets/f1/stop", nil},
	} {
		e := &refusalEnv{t: t}
		var status int
		var body []byte
		out := captureLog(t, func() { status, body = e.post(r, route.path, route.body) })
		if status != 500 || len(body) != 0 {
			t.Errorf("%s: status %d body %q, want a bodyless 500", route.name, status, body)
		}
		lines := parseLog(t, out)
		errorLines := 0
		for _, l := range lines {
			if l["level"] == "error" {
				errorLines++
			}
			if _, ok := l["refusalCause"]; ok {
				t.Errorf("%s: an entry names a refusal cause for an internal fault: %v", route.name, l)
			}
		}
		if errorLines != 1 {
			t.Errorf("%s: %d error-level entries, want exactly one: %s", route.name, errorLines, out)
		}
	}
}

// Scenario: A body-table cycle is still a 5xx with an error log
// Scenario: A served refusal is recorded once by cause below error level (the cycle AND: error-level, no cause)
func TestFaults_Scenario_BodyTableCycleIsStill5xxWithAnErrorLog_Composed(t *testing.T) {
	t.Run("Scenario: A body-table cycle is still a 5xx with an error log (helper + handler, composed)", func(t *testing.T) {
		bodies := faultBodies{
			"feat-star": {Id: "feat-star", Size: 6},
			"cyc-a":     {Id: "cyc-a", Size: 2, Orbit: &space.Orbit{ParentId: "cyc-b", Radius: 40, PeriodMs: 1000}},
			"cyc-b":     {Id: "cyc-b", Size: 2, Orbit: &space.Orbit{ParentId: "cyc-a", Radius: 40, PeriodMs: 1000}},
		}
		err, out := solveFaulty(t, bodies, "cyc-a")
		if err == nil {
			t.Fatal("a cyclic body table solved without error")
		}
		assertNoFleetSentinel(t, err)
		if !errors.Is(err, space.ErrBodyCycle) {
			t.Errorf("cycle error = %v, want it to keep tracing to space.ErrBodyCycle", err)
		}
		if strings.Contains(out, "burn solve refusal served") {
			t.Errorf("the helper logged a served refusal for a fault: %s", out)
		}
		feedThroughHandler(t, err)
	})
}

// Scenario: A present target whose parent is missing is a 5xx, not the absent-body 404
func TestFaults_Scenario_PresentTargetWithMissingParentIs5xx_Composed(t *testing.T) {
	t.Run("Scenario: A present target whose parent is missing is a 5xx, not the absent-body 404 (helper + handler, composed)", func(t *testing.T) {
		bodies := faultBodies{
			"feat-star": {Id: "feat-star", Size: 6},
			"orphan":    {Id: "orphan", Size: 2, Orbit: &space.Orbit{ParentId: "no-such-parent", Radius: 40, PeriodMs: 1000}},
		}
		err, out := solveFaulty(t, bodies, "orphan")
		if err == nil {
			t.Fatal("a body with a missing parent solved without error")
		}
		assertNoFleetSentinel(t, err)
		if !errors.Is(err, space.ErrUnknownBody) {
			t.Errorf("error = %v, want it to keep tracing to space.ErrUnknownBody", err)
		}
		if errors.Is(err, ErrTargetBodyAbsent) {
			t.Errorf("a present target with a missing parent was classified as the absent-body refusal")
		}
		if strings.Contains(out, "burn solve refusal served") {
			t.Errorf("the helper logged a served refusal for a fault: %s", out)
		}
		feedThroughHandler(t, err)
	})
}

// Scenario: A fleet whose stored host no longer resolves is still a 5xx
func TestFaults_Scenario_StoredHostNoLongerResolvesIs5xx(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize, orbitingFeature("feat-a", 60, 2.0))
	f := &Fleet{
		Id: "f1", CorporationId: refusalOwnerCorp, SystemId: "sys-0",
		Cargo: map[string]float64{"fuel": 500},
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{
			Kind: space.ParkOrbit, BodyId: "feat-gone", Radius: 5, PeriodMs: 10_000, Phase: 0, EpochMs: 0,
		}},
	}

	t.Run("service: the error is not the absent-body refusal", func(t *testing.T) {
		e := newRefusalEnv(t, 0, bt, f)
		_, err := e.svc.OrderTo(t.Context(), "f1", OrderRequest{BodyId: "feat-a"})
		if err == nil {
			t.Fatal("an order from a fleet with an unresolvable host succeeded")
		}
		assertNoFleetSentinel(t, err)
	})

	t.Run("Scenario: A fleet whose stored host no longer resolves is still a 5xx", func(t *testing.T) {
		for _, route := range []struct {
			name, path string
		}{{"orders", ordersPath("f1")}, {"orders/preview", previewPath("f1")}} {
			e := newRefusalEnv(t, 0, bt, f)
			var status int
			var body []byte
			out := captureLog(t, func() { status, body = e.post(e.router(refusalOwnerCorp), route.path, bodyOrder("feat-a")) })
			if status != 500 || len(body) != 0 {
				t.Errorf("%s: status %d body %q, want a bodyless 500 (not the absent-body 404)", route.name, status, body)
			}
			errorLines := 0
			for _, l := range parseLog(t, out) {
				if l["level"] == "error" {
					errorLines++
				}
			}
			if errorLines == 0 {
				t.Errorf("%s: no error-level log entry was written: %s", route.name, out)
			}
		}
	})
}
