package galaxy

import (
	"strings"
	"testing"
)

// A system's identity IS its field coordinate, and its name follows from that
// identity rather than from any generation order — the property that lets two
// worlds with different materialization histories agree on what a system is
// called.
func TestNaming_IdentityAndNameAreStable(t *testing.T) {
	cell := Cell{X: 3, Y: -7}
	id := SystemIdFor(cell)
	if id != "sys_3_-7" {
		t.Fatalf("system id = %q, want sys_3_-7", id)
	}
	got, ok := CellForSystemId(id)
	if !ok || got != cell {
		t.Fatalf("round-trip = %+v ok=%v, want %+v", got, ok, cell)
	}
	if _, ok := CellForSystemId("station-3"); ok {
		t.Fatal("a non-field id parsed as a cell")
	}

	// The name follows the FIELD IDENTITY, not a generation index — so two
	// worlds with different materialization histories agree.
	if a, b := systemName(42, cell), systemName(42, cell); a != b {
		t.Fatalf("name not deterministic: %q vs %q", a, b)
	}
	if a, b := systemName(42, cell), systemName(43, cell); a == b {
		t.Fatalf("name did not diverge across seeds: %q", a)
	}
	if a, b := systemName(42, cell), systemName(42, Cell{X: 3, Y: -6}); a == b {
		t.Fatalf("name did not diverge across cells: %q", a)
	}
}

func TestGeneratedStarNamesAreUniqueAndIndependentOfReadOrder(t *testing.T) {
	field := NewField(42, DefaultParams())
	systems := field.Systems(CellRect{MinX: -35, MinY: -35, MaxX: 35, MaxY: 35})
	if len(systems) < 100 {
		t.Fatalf("insufficient generated sample: %d", len(systems))
	}
	seen := map[string]bool{}
	for i := len(systems) - 1; i >= 0; i-- {
		node := systems[i]
		key := strings.ToLower(node.Name)
		if seen[key] {
			t.Fatalf("duplicate generated star name %q", node.Name)
		}
		seen[key] = true
		cell, _ := CellForSystemId(node.Id)
		other := NewField(42, DefaultParams()).SystemAt(cell)
		if other == nil || other.Name != node.Name {
			t.Fatalf("reading in reverse order changed %s", node.Id)
		}
	}
}
