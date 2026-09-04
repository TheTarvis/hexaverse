package action

import "errors"

// ErrNonPrimitiveParam is returned by Commit when spec.Params carries a value
// outside the Firestore-native allowlist (design.md Decision 4, part 2). The
// bug class this closes: a domain struct (space.Vec3, a park descriptor, or
// anything future) silently round-trips differently in a same-process unit
// test (the struct survives in memory) than it does through Firestore (it
// serializes to a map the struct-typed reader never expected) — so the
// mistake is invisible until integration. Validating structurally, at
// Commit, makes the class of bug impossible rather than merely findable.
//
// This governs Params ONLY. ActorState is exempt — it legitimately carries
// domain structs like space.ShipState, merged onto the actor doc by the
// actor domain's own stored shapes.
var ErrNonPrimitiveParam = errors.New("action: params value is not a Firestore-native primitive")

// validateParams recursively checks that every value in params is one of the
// allowlisted shapes: nil, string, bool, int, int64, float64, []string,
// []int64, []float64, []any, map[string]any (recursed into). Anything else —
// a domain struct, a pointer, an unsupported slice element type — fails.
func validateParams(params map[string]interface{}) error {
	for _, v := range params {
		if err := validateParamValue(v); err != nil {
			return err
		}
	}
	return nil
}

func validateParamValue(v interface{}) error {
	switch val := v.(type) {
	case nil, string, bool, int, int64, float64:
		return nil
	case []string, []int64, []float64:
		return nil
	case []interface{}:
		for _, elem := range val {
			if err := validateParamValue(elem); err != nil {
				return err
			}
		}
		return nil
	case map[string]interface{}:
		return validateParams(val)
	default:
		return ErrNonPrimitiveParam
	}
}
