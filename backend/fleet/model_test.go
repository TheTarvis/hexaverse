package fleet

// RED-phase tests for tasks.md 3.2 — `fleet.Fleet.State` becomes
// `space.ShipState`; `AttachedTo string` gains a `DockedTo() (string, bool)`
// accessor (design.md Decision 4, Decision 13). The State-type change itself
// is exercised pervasively by every other section-3 test file (they all
// construct a Fleet with a space.ShipState-typed State); this file's own
// job is the DockedTo() accessor specifically, since no fleet-movement
// scenario names it directly by itself — it is a structural building block
// design.md Decision 13 pins the exact signature of, reused by mine/market's
// link-6 one-line re-point (out of this change's scope) and by 3.7's
// position resolution. SDET-added: no scenario names DockedTo() in
// isolation, but design.md Decision 13 pins its exact signature literally
// ("func (f Fleet) DockedTo() (string, bool) { return f.AttachedTo,
// f.AttachedTo != "" }"), so a boundary-value pin here is cheap and closes a
// real gap.
import "testing"

func TestFleet_DockedTo_Scenario_EmptyAttachedToReportsNotDocked(t *testing.T) {
	f := Fleet{}
	host, ok := f.DockedTo()
	if ok || host != "" {
		t.Fatalf("DockedTo() = (%q, %v), want (\"\", false) for an empty AttachedTo", host, ok)
	}
}

func TestFleet_DockedTo_Scenario_SetAttachedToReportsDocked(t *testing.T) {
	f := Fleet{AttachedTo: "feat-station-1"}
	host, ok := f.DockedTo()
	if !ok || host != "feat-station-1" {
		t.Fatalf("DockedTo() = (%q, %v), want (\"feat-station-1\", true)", host, ok)
	}
}
