package galaxy

// Fixture-driven test for openspec change replace-observation-with-sightings,
// tasks.md 4.13 / galaxy-view spec.md "A Galaxy Link's Id Is Its Lane's
// Stable Id" — "A cross-stack fixture pins the equality under the
// Go-sole-authority regime".
//
// STATUS NOTE FOR THE ORCHESTRATOR (read before treating this file as
// red-phase evidence for 4.13): every case here is ALREADY GREEN against
// the current, already-landed production code. LaneIdBetween (task 2.1) and
// the generator's own Lane.Id/AId/BId derivation (laneIdFor/SystemIdFor,
// field.go:400-407) already agree — they have since task 2.1/2.6 landed,
// well before this SDET pass. This file is a REGRESSION GUARD, not a
// red-to-green scenario for 4.13: task 4.13's own delta text says as much
// ("this equality is orthogonal to the jump-commit fix above ... and
// remains useful even though links[] is no longer handleJump's source").
// It pins an invariant the running system already satisfies so a future
// change to either derivation (LaneIdBetween's CellForSystemId parse, or
// the generator's own laneIdFor call inside laneOf) fails loud instead of
// drifting silently — exactly the deliverable galaxy-view's spec text asks
// for, even though it carries no failing-today assertion.
//
// Traceability: fixtures/galaxy/cases.json's laneIdEquality family, wired
// into .claude/scripts/check-mirror-map.sh's anti-mirror sweep via
// fixtures/galaxy/mirror-map.json (empty sharedNames — backend/galaxy is
// Go-sole-authority for this derivation, no TypeScript mirror now or ever).

import (
	"encoding/json"
	"os"
	"testing"
)

const galaxyFixturesPath = "../../fixtures/galaxy/cases.json"

type laneIdEqualityCase struct {
	Name       string `json:"name"`
	ASystemId  string `json:"aSystemId"`
	BSystemId  string `json:"bSystemId"`
	Bridge     bool   `json:"bridge"`
	WantLaneId string `json:"wantLaneId"`
	Note       string `json:"note"`
}

type galaxyFixtures struct {
	LaneIdEquality []laneIdEqualityCase `json:"laneIdEquality"`
}

func loadGalaxyFixtures(t *testing.T) galaxyFixtures {
	t.Helper()
	raw, err := os.ReadFile(galaxyFixturesPath)
	if err != nil {
		t.Fatalf("read %s: %v", galaxyFixturesPath, err)
	}
	var f galaxyFixtures
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("unmarshal %s: %v", galaxyFixturesPath, err)
	}
	if len(f.LaneIdEquality) == 0 {
		t.Fatalf("%s: laneIdEquality is empty", galaxyFixturesPath)
	}
	return f
}

// Scenario: A cross-stack fixture pins the equality under the Go-sole-
// authority regime (galaxy-view spec.md). Covers, at minimum: an ordinary
// lane between adjacent positive-coordinate systems, a lane with a
// negative-coordinate endpoint, a bridge lane (Bridge == true), and both
// orderings of one endpoint pair — per the requirement's own enumerated
// minimum case list.
func TestLaneIdBetween_Scenario_CrossStackFixture(t *testing.T) {
	fx := loadGalaxyFixtures(t)
	for _, c := range fx.LaneIdEquality {
		t.Run(c.Name, func(t *testing.T) {
			got := LaneIdBetween(c.ASystemId, c.BSystemId)
			if got != c.WantLaneId {
				t.Fatalf("LaneIdBetween(%q, %q) = %q, want %q", c.ASystemId, c.BSystemId, got, c.WantLaneId)
			}
		})
	}
}

// Scenario boundary (SDET-added): the fixture's swapped-order pair really
// does name the SAME crossing as its unswapped sibling — the "both
// orderings of one pair" minimum-case requirement is only meaningful if the
// two cases share an endpoint pair, not merely a coincidental wantLaneId.
func TestLaneIdBetween_Scenario_SwappedOrderingIsTheSameCrossing(t *testing.T) {
	fx := loadGalaxyFixtures(t)
	var a, b *laneIdEqualityCase
	for i := range fx.LaneIdEquality {
		switch fx.LaneIdEquality[i].Name {
		case "sameCrossing_orderA":
			a = &fx.LaneIdEquality[i]
		case "sameCrossing_orderB_swapped":
			b = &fx.LaneIdEquality[i]
		}
	}
	if a == nil || b == nil {
		t.Fatal("fixture is missing the sameCrossing_orderA/sameCrossing_orderB_swapped pair")
	}
	if a.ASystemId != b.BSystemId || a.BSystemId != b.ASystemId {
		t.Fatalf("sameCrossing cases do not actually swap the same endpoint pair: a=(%s,%s) b=(%s,%s)",
			a.ASystemId, a.BSystemId, b.ASystemId, b.BSystemId)
	}
	if a.WantLaneId != b.WantLaneId {
		t.Fatalf("swapped ordering must yield the same id: a.wantLaneId=%q b.wantLaneId=%q", a.WantLaneId, b.WantLaneId)
	}
}

// Scenario boundary (SDET-added): the fixture's bridge case really is a
// bridge lane in a live generated field, not merely claimed by the JSON's
// informational `bridge` flag — re-derives the SAME deterministic lane
// (seed 3, voidParams()) field_test.go's own TestField_BridgeConstruction
// exercises, and cross-checks it against the fixture's aId/bId/wantLaneId.
// A future generator change that moves or removes this specific bridge
// fails this test loud, rather than leaving a stale fixture case unnoticed.
func TestLaneIdBetween_Scenario_BridgeCaseIsARealBridgeLane(t *testing.T) {
	fx := loadGalaxyFixtures(t)
	var bridgeCase *laneIdEqualityCase
	for i := range fx.LaneIdEquality {
		if fx.LaneIdEquality[i].Bridge {
			bridgeCase = &fx.LaneIdEquality[i]
			break
		}
	}
	if bridgeCase == nil {
		t.Fatal("fixture carries no bridge==true case")
	}

	f := NewField(3, voidParams())
	found := false
	for bx := -20; bx <= 20 && !found; bx++ {
		for by := -20; by <= 20 && !found; by++ {
			for _, l := range f.bridgesFrom(Block{X: bx, Y: by}) {
				if l.AId == bridgeCase.ASystemId && l.BId == bridgeCase.BSystemId {
					found = true
					if !l.Bridge {
						t.Fatalf("lane %s: fixture claims bridge==true but the live generator disagrees", l.Id)
					}
					if l.Id != bridgeCase.WantLaneId {
						t.Fatalf("lane %s: generator's own Id disagrees with the fixture's wantLaneId %q", l.Id, bridgeCase.WantLaneId)
					}
				}
			}
		}
	}
	if !found {
		t.Fatalf("fixture's bridge case (aId=%s bId=%s) was not found in a live seed-3 voidParams() field — "+
			"fixture may be stale against a generator change", bridgeCase.ASystemId, bridgeCase.BSystemId)
	}
}
