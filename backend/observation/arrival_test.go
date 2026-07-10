package observation

import (
	"testing"
)

// ArrivalWrites reveals the destination as Explored and its onward neighbours as
// Rumored — but only neighbours not already at least Rumored, so a blind MergeAll
// never lowers a system you already know better (monotonicity without a per-doc
// read).
func TestArrivalWrites_ExploredDestAndFilteredOnward(t *testing.T) {
	svc := &Service{}
	tiers := map[string]Tier{
		"nb-explored": TierExplored, // already known — must be skipped
		"nb-surveyed": TierSurveyed, // already ≥ rumored — must be skipped
		"nb-new":      TierStarVisible,
	}
	writes := svc.ArrivalWrites("corp", "dest", []string{"nb-explored", "nb-surveyed", "nb-new", "dest"}, tiers, 5000)

	// Destination write is always present and Explored.
	if len(writes) == 0 {
		t.Fatal("expected at least the destination write")
	}
	if got := writes[0].Data["tier"]; got != string(TierExplored) {
		t.Fatalf("destination tier = %v, want explored", got)
	}
	if writes[0].Path[len(writes[0].Path)-1] != "dest" {
		t.Fatalf("first write should target the destination, got %v", writes[0].Path)
	}

	// Only nb-new is charted to Rumored; the already-known neighbours and the
	// destination itself are filtered out.
	revealed := map[string]string{}
	for _, w := range writes[1:] {
		revealed[w.Path[len(w.Path)-1]] = w.Data["tier"].(string)
	}
	if len(revealed) != 1 {
		t.Fatalf("expected exactly one onward reveal, got %v", revealed)
	}
	if revealed["nb-new"] != string(TierRumored) {
		t.Fatalf("nb-new should be Rumored, got %v", revealed)
	}
}
