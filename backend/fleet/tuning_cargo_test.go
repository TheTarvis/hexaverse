package fleet

import "testing"

func TestTrimCargoIncludesFuelAndHandlesZeroCapacity(t *testing.T) {
	cargo := map[string]float64{"fuel": 100, "metals": 60, "water": 40}
	TrimCargo(cargo, 100)
	if cargo["fuel"] != 50 || cargo["metals"] != 30 || cargo["water"] != 20 {
		t.Fatalf("cargo = %v", cargo)
	}
	TrimCargo(cargo, 0)
	for _, v := range cargo {
		if v != 0 {
			t.Fatalf("zero capacity retained cargo: %v", cargo)
		}
	}
}
