package fleet

// RED-phase test for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 4.11 — pins the NaN/±infinity/zero/negative commanded-
// acceleration REJECTION cross-target in a fixture family, per that task's
// own explicit instruction: "nan > ceiling and nan < floor are both false,
// so an unguarded path reaches int64(math.Ceil(NaN*1000))" —
// space.QuantizeArrival's own expression (space/burn.go:169) — "which is 0
// on arm64 and -9223372036854775808 on amd64 ... exactly the divergence
// class pin-system-generation-determinism was created to eliminate."
//
// FIXTURE-FORM CHOICE, stated explicitly (per the SDET brief's own
// instruction to do so):
//
// This family is filed under a NEW fixtures/fleet/cases.json rather than
// fixtures/space, even though the brief's default is "fixtures/space (or
// fixtures/fleet, if one exists by then)". Reasoning: the guard this family
// pins does not and must not live in backend/space — design.md Decision 9
// places the ceiling/floor/non-finite validation in fleet.OrderTo, one
// layer above space.SolveBurn, specifically so that a bad value is REJECTED
// before it ever reaches space's own (correctly pinned, unguarded-by-design)
// arithmetic. Filing this family under fixtures/space would misattribute
// the fixture to a package that owns no part of the check it exercises.
// fixtures/fleet/cases.json is new as of this SDET pass; it carries no
// mirror-map.json because .claude/scripts/check-mirror-map.sh enumerates a
// fixed, hard-coded set of fixture directories (board/polar/space/system)
// and does not scan fixtures/ generically — creating this directory does
// not (and, without further wiring, cannot) participate in that check. That
// wiring, if wanted, is outside this SDET pass's remit; flagged in the
// handoff report.
//
// Mirroring task 9.7's own resolution of the SAME class for
// backend/system's keplerPeriodMs (design.md: "Do not add the NaN case to
// the golden family... Assert the rejection in an ordinary unit test
// instead"): the family below never records a value derived from the
// unguarded conversion. It records `wantErr`, a Go sentinel-error IDENTITY
// NAME — architecture-invariant by construction, because a correct
// implementation intercepts before the divergent conversion ever runs. That
// is what makes recording a value here safe, unlike keplerPeriodMs's
// excluded NaN case.

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strconv"
	"testing"

	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

const fleetFixturesPath = "../../fixtures/fleet/cases.json"

type accelRejectionCase struct {
	Name    string `json:"name"`
	Input   string `json:"input"`
	WantErr string `json:"wantErr"`
}

type fleetFixtures struct {
	CommandedAccelRejection []accelRejectionCase `json:"commandedAccelRejection"`
}

func loadFleetFixtures(t *testing.T) fleetFixtures {
	t.Helper()
	raw, err := os.ReadFile(fleetFixturesPath)
	if err != nil {
		t.Fatalf("read %s: %v", fleetFixturesPath, err)
	}
	var f fleetFixtures
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("unmarshal %s: %v", fleetFixturesPath, err)
	}
	if len(f.CommandedAccelRejection) == 0 {
		t.Fatalf("%s: commandedAccelRejection is empty", fleetFixturesPath)
	}
	return f
}

// parseFixtureAccel decodes the fixture's string-encoded input — JSON has no
// native NaN/Infinity literal, so the family stores them as the same
// strings strconv.ParseFloat accepts for them ("NaN", "+Inf", "-Inf" all
// parse natively).
func parseFixtureAccel(t *testing.T, s string) float64 {
	t.Helper()
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		t.Fatalf("fixture input %q does not parse as a float: %v", s, err)
	}
	return v
}

// Scenario: A non-finite or non-positive commanded acceleration is
// rejected — cross-target fixture form (tasks.md 4.11).
//
// Every case's `wantErr` is asserted as a Go sentinel-error IDENTITY via
// errors.Is — not a numeric value derived from evaluating the bad input —
// which is what makes this table safe to assert unconditionally on
// whichever architecture actually runs `go test` (the CI matrix runs both
// amd64 and the arm64 leg; this test's assertions do not change shape on
// either, by construction, since a correctly-guarded OrderTo never lets the
// bad value reach the one expression (space.QuantizeArrival) that would
// diverge).
func TestOrderTo_Scenario_CommandedAccelRejection_CrossTargetFixture(t *testing.T) {
	fx := loadFleetFixtures(t)

	sentinelsByName := map[string]error{
		"ErrAccelAboveCeiling": ErrAccelAboveCeiling,
		"ErrAccelBelowFloor":   ErrAccelBelowFloor,
	}

	for _, c := range fx.CommandedAccelRejection {
		t.Run(c.Name, func(t *testing.T) {
			wantErr, ok := sentinelsByName[c.WantErr]
			if !ok {
				t.Fatalf("fixture names unknown sentinel %q", c.WantErr)
			}

			clk := &fakeClock{now: 0}
			svc, dao, fa, ctrl := fleetWithAccelCeiling(t, clk, 8.0)
			defer ctrl.Finish()
			dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(freshParkedFleet(), nil)

			accel := parseFixtureAccel(t, c.Input)
			point := space.Vec3{X: 400}
			_, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &point, Accel: &accel})
			if !errors.Is(err, wantErr) {
				t.Fatalf("input=%q (parsed %v): err = %v, want it to trace to %s", c.Input, accel, err, c.WantErr)
			}
			if fa.committed != nil {
				t.Fatalf("input=%q: a rejected order must not commit an action (which would mean the value "+
					"reached space.SolveBurn's flight-time quantization — the exact int64(NaN)-style divergence "+
					"this fixture family exists to keep unreachable): %+v", c.Input, fa.committed)
			}
		})
	}
}
