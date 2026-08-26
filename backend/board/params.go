package board

// Codec for board coordinates carried through action.Params
// (map[string]interface{}), the one place a board.Cell/board.Target must
// survive an untyped, Firestore-native round trip (design.md Decision 4).
// action.Commit's validator (backend/action) allows exactly the primitive
// shapes these functions produce; any consumer decoding a coordinate out of
// Params must go through DecodeCell/DecodeTarget rather than a type
// assertion to board.Cell/board.Target, because a Firestore round-trip never
// produces the domain struct — only this map shape.

// EncodeCell writes a Cell as the Firestore-native map shape action.Params
// carries: {"ring": int64, "slot": int64}. int64 (not int) because that is
// what a Firestore round trip returns for a stored integer field, and this
// map is the SAME shape whether it just came from Firestore or is about to be
// written there.
func EncodeCell(c Cell) map[string]any {
	return map[string]any{
		"ring": int64(c.Ring),
		"slot": int64(c.Slot),
	}
}

// DecodeCell accepts a map[string]any with "ring"/"slot" values of any of the
// three numeric shapes a stored coordinate can arrive as: an in-memory int
// (a unit test literal), a Firestore int64, or a JSON float64 (an HTTP body
// decode). Reports ok=false for anything else — including the domain struct
// itself, which this function is what replaces as a decode path (design.md
// Decision 4's dual-branch defect).
func DecodeCell(v any) (Cell, bool) {
	m, ok := v.(map[string]any)
	if !ok {
		return Cell{}, false
	}
	ring, ok := decodeInt(m["ring"])
	if !ok {
		return Cell{}, false
	}
	slot, ok := decodeInt(m["slot"])
	if !ok {
		return Cell{}, false
	}
	return Cell{Ring: ring, Slot: slot}, true
}

// decodeInt normalizes the three numeric shapes a decoded map value can carry.
func decodeInt(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	default:
		return 0, false
	}
}

// EncodeTarget writes a Target as exactly one of {"cell": {...}} or
// {"featureId": "..."} — never both keys, mirroring Target's own "exactly
// one of Cell/FeatureId" invariant.
func EncodeTarget(t Target) map[string]any {
	if t.Cell != nil {
		return map[string]any{"cell": EncodeCell(*t.Cell)}
	}
	return map[string]any{"featureId": t.FeatureId}
}

// DecodeTarget is EncodeTarget's inverse, accepting both an in-memory
// EncodeTarget result and the map[string]interface{} shape a Firestore round
// trip produces for the nested cell map (map[string]any and
// map[string]interface{} are the same type — any is interface{}'s alias —
// so one assertion covers both).
func DecodeTarget(v any) (Target, bool) {
	m, ok := v.(map[string]any)
	if !ok {
		return Target{}, false
	}
	if rawCell, has := m["cell"]; has {
		cell, ok := DecodeCell(rawCell)
		if !ok {
			return Target{}, false
		}
		return Target{Cell: &cell}, true
	}
	if rawFeature, has := m["featureId"]; has {
		featureId, ok := rawFeature.(string)
		if !ok {
			return Target{}, false
		}
		return Target{FeatureId: featureId}, true
	}
	return Target{}, false
}
