package space

import (
	"hexaverse/common"
	"testing"
)

type customPeriodBodies struct{ Bodies }

func (customPeriodBodies) ParkingPeriod(float64) common.WorldMillis { return 90000 }
func TestCustomPeriodLawIsSharedByBurnSolveAndArrival(t *testing.T) {
	bodies := customPeriodBodies{testSystem()}
	result, err := SolveBurn(bodies, Vec3{X: 90, Z: 90}, bodyTarget("planet1"), 1000, 8, nil, noStarClearance, testRounds)
	if err != nil {
		t.Fatal(err)
	}
	state, err := StateAt(bodies, ShipState{Mode: ModeBurn, Burn: &result.Burn}, result.Burn.ArriveMs)
	if err != nil {
		t.Fatal(err)
	}
	if state.Park == nil || state.Park.PeriodMs != 90000 {
		t.Fatalf("arrival ignored injected period: %+v", state.Park)
	}
	position, err := state.Park.Position(bodies, result.Burn.ArriveMs)
	if err != nil {
		t.Fatal(err)
	}
	if position.Sub(result.Burn.Intercept).Length() > 1e-9 {
		t.Fatal("arrival did not preserve solved intercept")
	}
}
