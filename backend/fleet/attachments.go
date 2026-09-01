package fleet

import "sort"

// Attachments adapts a set of fleets into disclosure.Attachments (tasks.md
// 4.1): HostOf resolves a fleet's own stored attachment (Fleet.AttachedTo /
// DockedTo); AttachedTo resolves the reverse — every fleet id docked to a
// given host, in the stable, deterministic order disclosure.Attachments's
// own contract requires (an unstable order would make the same focused
// sweep mint records in a different order across identical resolves).
//
// Wired at the composition root: both the interior read's contact union
// (backend/system, via a FleetSource this package's ServiceInterface
// satisfies) and the focused-scan resolver (backend/fleet's own
// ScanResolver, task 5.8) build one of these over the fleet set they each
// already read, rather than the disclosure package ever reaching for
// Firestore itself — disclosure.Attachments is an interface precisely so
// neither consumer needs a second, divergent notion of "who is docked
// where."
type Attachments []Fleet

// HostOf implements disclosure.Attachments.
func (a Attachments) HostOf(id string) (string, bool) {
	for _, f := range a {
		if f.Id == id {
			return f.DockedTo()
		}
	}
	return "", false
}

// AttachedTo implements disclosure.Attachments.
func (a Attachments) AttachedTo(hostId string) []string {
	var out []string
	for _, f := range a {
		if host, ok := f.DockedTo(); ok && host == hostId {
			out = append(out, f.Id)
		}
	}
	sort.Strings(out)
	return out
}
