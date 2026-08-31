package fleet

// RED-phase test diagnosing the link-4 slice e2e's last failure
// (`slice.spec.ts`): the roster waits for a body-targeted burn to read
// "Docked" and never sees it, because the roster is now the ONLY fleet
// surface (SystemBoardView -> useMyFleets -> fleetService.listMine ->
// GET /v1/fleets?mine=true -> handler.List -> Service.ListForCorp), and
// ListForCorp — unlike Get (whose opportunistic settle sets AttachedTo via
// the action spine, service.go:206-221) — is documented read-only
// (ServiceInterface's own doc comment: "Read-only.") and never resolves a
// due arrival. A burn whose ArriveMs has long passed therefore stays
// `mode: burn`, `attachedTo: ""` forever from the roster's point of view.
//
// This is the third member of the stale-arrival family pinned in
// stale_arrival_integration_test.go (TestIntegration_OrderAfterUnsettled
// ArrivalDepartsFromLivePosition / TestIntegration_CancelAfterUnsettled
// ArrivalHoldsAtLivePosition, "Spec: 0004/S1" / "Spec: 0004/S2") — those
// pin the property on the two WRITE doors (order, cancel); this one pins it
// on the READ path the roster depends on. SDET-added: no fleet-movement
// scenario names ListForCorp's settle behavior directly (the spec is silent
// on whether a list read resolves due arrivals), but Get's own doc comment
// ("Resolution runs through the action spine ... so a docked-at-arrival
// fleet reads as docked without either package needing its own resolve
// trigger") states the property list reads must share for the roster to
// ever show "Docked" — this test asserts ListForCorp actually delivers it.
//
// ListInSystem is deliberately NOT given the same assertion here: its own
// doc comment already states, correctly, "Read-only: it never settles a due
// arrival" as its contract, and nothing in link 4's UI reads it any more
// (the board's own fleet layer was retired along with the lattice board —
// see CLAUDE.md's renderer-migration note). Extending this fixture to cover
// it too would be asserting a scenario nothing currently depends on.
//
// The assertion is placed at the SERVICE level (ListForCorp), not the
// handler: handler.List (handler.go) is a bare passthrough
// (`fleets, err = h.svc.ListForCorp(ctx, requesterCid)`) with no settle
// logic of its own, and the existing handler-level suite
// (read_visibility_test.go, handler_test.go) exercises it exclusively
// against a hand-fake ServiceInterface — a shape that cannot observe
// whether the REAL ListForCorp settles anything, since the fake simply
// returns whatever list literal the test hands it. The real settle behavior
// only exists to observe at the service+DAO+action-spine integration level,
// which is what this file uses (mirroring
// stale_arrival_integration_test.go's own harness).
//
// A design note for whoever fixes this: a list spans potentially many
// systems per corporation, so settling every due arrival in a list read
// means resolving a per-system BodySource for however many distinct
// SystemIds appear in the corp's fleets — NOT a single fixed body table.
// This fixture deliberately uses ONE system (matching every other fixture
// in this file's family) so it does not fabricate a multi-system body
// table; a real fix's own tests should decide how it wants to batch/cache
// that resolution across systems, which is real design information this
// SDET pass is surfacing, not prescribing.

import (
	"testing"

	"hexaverse/space"
)

// Spec: fleet-movement "Effective Position Resolution" / "In-System Burn
// Order to a Body or a Point" (AttachedTo set only at resolve); SDET-added
// for the READ path — see file header for why no single scenario heading
// names ListForCorp's settle contract directly.
func TestIntegration_ListForCorpAfterUnsettledArrival_SettlesBodyTargetedBurn(t *testing.T) {
	target := orbitingFeature("feat-body-a", 40, 2.0)
	bodies := testBodyTable(t, "sys-0", 6.0, target)
	svc, dao, clk, ctx := newStaleArrivalSvc(t, bodies)

	seeded := Fleet{
		Id: "fleet-stale-list-1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 150}}},
	}
	if err := dao.Save(ctx, seeded); err != nil {
		t.Fatal(err)
	}

	ordered, err := svc.OrderTo(ctx, seeded.Id, OrderRequest{BodyId: "feat-body-a"})
	if err != nil {
		t.Fatal(err)
	}
	if ordered.State.Mode != space.ModeBurn {
		t.Fatalf("expected burn, got %v", ordered.State.Mode)
	}
	if ordered.AttachedTo != "" {
		t.Fatalf("expected attachedTo cleared at commit, got %q", ordered.AttachedTo)
	}

	// Well past arrival — long enough that "still burning, still detached"
	// would visibly disagree with "arrived and docked at the target body" —
	// with no intervening settling read, so the doc still says burn.
	clk.now = ordered.State.Burn.ArriveMs + 60_000

	list, err := svc.ListForCorp(ctx, seeded.CorporationId)
	if err != nil {
		t.Fatal(err)
	}

	var got *Fleet
	for i := range list {
		if list[i].Id == seeded.Id {
			got = &list[i]
		}
	}
	if got == nil {
		t.Fatalf("ListForCorp(%q) did not return the seeded fleet %q at all: %+v",
			seeded.CorporationId, seeded.Id, list)
	}

	if got.State.Mode == space.ModeBurn {
		t.Errorf("ListForCorp still reports mode=burn for a fleet whose ArriveMs (%d) is long past the "+
			"read time (%d) — the roster's list read never settles a due arrival, so a fleet that has "+
			"actually docked reads as forever mid-burn (the diagnosed cause of the link-4 slice e2e's "+
			"180s roster-status timeout)", ordered.State.Burn.ArriveMs, clk.now)
	}
	if got.AttachedTo != "feat-body-a" {
		t.Errorf("ListForCorp reports attachedTo=%q, want %q — a body-targeted burn's AttachedTo is set "+
			"only at resolve (BurnResolver, fleet/resolver.go), and ListForCorp never triggers that "+
			"resolve, so roster-status.ts's 'Docked iff attachedTo is truthy' rule never fires for a "+
			"fleet the corp only ever sees through this list", got.AttachedTo, "feat-body-a")
	}
}
