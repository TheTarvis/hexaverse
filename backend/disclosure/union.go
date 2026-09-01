package disclosure

import "hexaverse/common"

// DiscloseUnion evaluates a corporation's disclosure of a system's foreign
// presence as the union, across every one of the corporation's own fleets
// present in the system (observers), of what each alone would disclose as
// an observer (proximity-disclosure "Disclosure to a Corporation Is the
// Union Over Its Own Assets"). One Contact per target, in the order targets
// were given, so a caller sorting targets by a stable key gets a stable
// response — a target disclosed by more than one observer appears exactly
// once (the FIRST observer to disclose it wins; every Disclose call for the
// same (target, t) pair is required to agree by the package's own "same
// query, same answer" invariant, so which observer wins is unobservable),
// and a target disclosed by none is simply absent.
//
// This is deliberately a thin fold over the existing, already-tested
// Disclose predicate rather than a new disclosure decision: masking,
// occlusion, range, and lane-transit exclusion are exactly Disclose's own
// rules, unchanged. What this function adds is only the union-and-dedup
// shape "Disclosure to a Corporation Is the Union Over Its Own Assets"
// itself specifies.
//
// Observers are caller-resolved (this package never derives a fleet's own
// position beyond the canonical space.StatePosition path a caller already
// went through to build one) — a lane-transiting fleet contributes no
// observation because the caller building its Observer list has nothing to
// resolve a position from, not because this function special-cases it.
func DiscloseUnion(w World, observers []Observer, targets []Ship, t common.WorldMillis) ([]Contact, error) {
	out := make([]Contact, 0, len(targets))
	for _, target := range targets {
		var found bool
		var contact Contact
		for _, obs := range observers {
			c, ok, err := Disclose(w, obs, target, t)
			if err != nil {
				return nil, err
			}
			if ok {
				contact = c
				found = true
				break
			}
		}
		if found {
			out = append(out, contact)
		}
	}
	return out, nil
}
