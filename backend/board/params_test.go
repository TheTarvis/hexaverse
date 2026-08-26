package board

import "testing"

// board/params.go does not exist yet (Decision 4's codec — design.md, tasks.md
// 1.1). These tests pin the wire shape the codec must produce/accept:
// EncodeCell writes {"ring": int64, "slot": int64}; DecodeCell accepts a
// map[string]any with int/int64/float64 values (the shapes a Firestore
// round-trip and an in-memory literal both produce). EncodeTarget/DecodeTarget
// wrap a board.Target the same way action.Commit's Params channel will carry
// it (action-dispatch "An encoded coordinate map commits normally").
//
// SDET-added: not named as its own top-level scenario in any delta, but it is
// the codec every fleet-movement/action-dispatch/observation-fog-and-scan
// coordinate-in-Params scenario depends on, so it is pinned directly here
// rather than only indirectly through a consumer.

func TestEncodeCell_ProducesRingSlotInt64Map(t *testing.T) {
	got := EncodeCell(Cell{Ring: 5, Slot: 12})
	ring, ok := got["ring"].(int64)
	if !ok || ring != 5 {
		t.Fatalf(`EncodeCell(...)["ring"] = %v (%T), want int64(5)`, got["ring"], got["ring"])
	}
	slot, ok := got["slot"].(int64)
	if !ok || slot != 12 {
		t.Fatalf(`EncodeCell(...)["slot"] = %v (%T), want int64(12)`, got["slot"], got["slot"])
	}
	if len(got) != 2 {
		t.Fatalf("EncodeCell map has %d keys, want exactly 2 (ring, slot): %v", len(got), got)
	}
}

func TestEncodeCell_CoreCell(t *testing.T) {
	got := EncodeCell(Cell{Ring: 0, Slot: 0})
	if got["ring"] != int64(0) || got["slot"] != int64(0) {
		t.Fatalf("EncodeCell(core) = %v, want ring:0 slot:0", got)
	}
}

func TestDecodeCell_RoundTripsThroughEncode(t *testing.T) {
	want := Cell{Ring: 9, Slot: 41}
	encoded := EncodeCell(want)
	got, ok := DecodeCell(encoded)
	if !ok {
		t.Fatalf("DecodeCell(EncodeCell(%v)) failed to decode", want)
	}
	if got != want {
		t.Fatalf("round trip = %v, want %v", got, want)
	}
}

// The three numeric shapes a stored coordinate can come back as: an in-memory
// int (unit tests constructing a literal), a Firestore int64, and a JSON
// float64 (an HTTP body decode). DecodeCell must accept all three.
func TestDecodeCell_AcceptsIntInt64Float64(t *testing.T) {
	cases := []struct {
		name string
		v    map[string]any
	}{
		{"int", map[string]any{"ring": 3, "slot": 7}},
		{"int64", map[string]any{"ring": int64(3), "slot": int64(7)}},
		{"float64", map[string]any{"ring": float64(3), "slot": float64(7)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := DecodeCell(tc.v)
			if !ok {
				t.Fatalf("DecodeCell(%v) failed to decode", tc.v)
			}
			if got != (Cell{Ring: 3, Slot: 7}) {
				t.Fatalf("DecodeCell(%v) = %v, want {3 7}", tc.v, got)
			}
		})
	}
}

// Undecodable shapes must report ok=false, never panic — this is the
// `undecodable-shape` cause every consumer-level guard (fleet-movement's
// "Board Coordinates Outside the Live Schedule Are Rejected, Never Panicked",
// observation-fog-and-scan's "Running Scan Echo Disc") keys on.
func TestDecodeCell_RejectsUndecodableShapes(t *testing.T) {
	cases := map[string]any{
		"nil":               nil,
		"string":            "not a cell",
		"missing slot":      map[string]any{"ring": int64(3)},
		"missing ring":      map[string]any{"slot": int64(3)},
		"non-numeric ring":  map[string]any{"ring": "3", "slot": int64(0)},
		"empty map":         map[string]any{},
		"board.Cell struct": Cell{Ring: 1, Slot: 0},
	}
	for name, v := range cases {
		t.Run(name, func(t *testing.T) {
			if _, ok := DecodeCell(v); ok {
				t.Fatalf("DecodeCell(%v) (%s) unexpectedly decoded", v, name)
			}
		})
	}
}

func TestEncodeTarget_CellShapeRoundTrips(t *testing.T) {
	cell := Cell{Ring: 4, Slot: 2}
	want := Target{Cell: &cell}
	encoded := EncodeTarget(want)
	if _, hasFeature := encoded["featureId"]; hasFeature {
		t.Fatalf("a cell target must not carry a featureId key: %v", encoded)
	}
	got, ok := DecodeTarget(encoded)
	if !ok {
		t.Fatalf("DecodeTarget(%v) failed to decode", encoded)
	}
	if got.FeatureId != "" {
		t.Errorf("decoded featureId = %q, want empty", got.FeatureId)
	}
	if got.Cell == nil || *got.Cell != cell {
		t.Fatalf("decoded cell = %v, want %v", got.Cell, cell)
	}
}

func TestEncodeTarget_FeatureIdShapeRoundTrips(t *testing.T) {
	want := Target{FeatureId: "feat-planet"}
	encoded := EncodeTarget(want)
	if _, hasCell := encoded["cell"]; hasCell {
		t.Fatalf("a featureId target must not carry a cell key: %v", encoded)
	}
	got, ok := DecodeTarget(encoded)
	if !ok {
		t.Fatalf("DecodeTarget(%v) failed to decode", encoded)
	}
	if got.Cell != nil {
		t.Errorf("decoded cell = %v, want nil", got.Cell)
	}
	if got.FeatureId != "feat-planet" {
		t.Fatalf("decoded featureId = %q, want feat-planet", got.FeatureId)
	}
}

func TestDecodeTarget_RejectsUndecodableShapes(t *testing.T) {
	cases := map[string]any{
		"nil":              nil,
		"string":           "feat-planet",
		"neither key":      map[string]any{"foo": "bar"},
		"undecodable cell": map[string]any{"cell": "not a cell"},
	}
	for name, v := range cases {
		t.Run(name, func(t *testing.T) {
			if _, ok := DecodeTarget(v); ok {
				t.Fatalf("DecodeTarget(%v) (%s) unexpectedly decoded", v, name)
			}
		})
	}
}

// Firestore round-trips a Target's cell as a nested map[string]interface{},
// same as any other stored coordinate — pinning the shape the ACTUAL wire
// carries (see fleet/service.go's "target" param), not just the Go-side struct.
func TestDecodeTarget_AcceptsFirestoreRoundTripShape(t *testing.T) {
	stored := map[string]interface{}{
		"cell": map[string]interface{}{"ring": int64(2), "slot": int64(5)},
	}
	got, ok := DecodeTarget(stored)
	if !ok {
		t.Fatalf("DecodeTarget(%v) failed to decode the Firestore round-trip shape", stored)
	}
	if got.Cell == nil || *got.Cell != (Cell{Ring: 2, Slot: 5}) {
		t.Fatalf("decoded cell = %v, want {2 5}", got.Cell)
	}
}
