package observation

import (
	"testing"
)

// ArrivalWrites reveals the destination as Explored and charts the lanes the
// trip actually crossed `via: traveled` — and nothing else (#0006 Decision
// #17, 2026-07-14): no onward-lane rumor, no tier for anything but the
// destination. Explored is the top tier, so the blind MergeAll never lowers it.
func TestArrivalWrites_ExploredDestAndTraveledLanes(t *testing.T) {
	svc := &Service{}
	writes := svc.ArrivalWrites("corp", "dest", []string{"lane-1", "lane-2"}, 5000)

	// Destination write is always present and Explored.
	if len(writes) != 3 {
		t.Fatalf("expected the destination write + 2 lane writes, got %d", len(writes))
	}
	if got := writes[0].Data["tier"]; got != string(TierExplored) {
		t.Fatalf("destination tier = %v, want explored", got)
	}
	if writes[0].Path[len(writes[0].Path)-1] != "dest" {
		t.Fatalf("first write should target the destination, got %v", writes[0].Path)
	}

	// The crossed lanes are charted `via: traveled`; no other tier writes exist.
	charted := map[string]string{}
	for _, w := range writes[1:] {
		if w.Path[len(w.Path)-2] != lanesCollection {
			t.Fatalf("arrival minted a non-lane write beyond the destination: %v (onward rumor is scanning's job)", w.Path)
		}
		charted[w.Path[len(w.Path)-1]] = w.Data["via"].(string)
	}
	if charted["lane-1"] != ViaTraveled || charted["lane-2"] != ViaTraveled {
		t.Fatalf("crossed lanes should be charted via traveled, got %v", charted)
	}
}
