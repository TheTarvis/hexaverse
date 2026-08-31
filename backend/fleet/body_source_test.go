package fleet

// RED-phase tests for tasks.md 3.5 — a `BodySource` interface
// (`BodyTable(ctx, systemID) (*system.BodyTable, error)`) on `fleet.Service`,
// satisfied by `system.Service`; resolved ONCE per request and threaded as a
// parameter through every burn solve/position read/resolve — never fetched
// per body, never memoized in package-level state, and never used to
// enumerate `Ids()` into a response (design.md Decision 16).
//
// CONTRACT this file assumes: `fleet.BodySource` is the interface name (a
// consumer-declared interface in `fleet`, mirroring `system.StationSource`'s
// own consumer-declared pattern), wired via `Service.WithBodies(BodySource)
// *Service` post-construction (mirroring `WithTravel`'s own pattern, since
// this dependency did not exist at NewServiceWith's original call sites).

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"hexaverse/space"
	"hexaverse/system"

	"go.uber.org/mock/gomock"
)

// spyBodySource counts BodyTable calls, so "resolved once per request" is an
// observable count rather than an assumption.
type spyBodySource struct {
	bt    *system.BodyTable
	calls int
}

func (s *spyBodySource) BodyTable(context.Context, string) (*system.BodyTable, error) {
	s.calls++
	return s.bt, nil
}

// Scenario (SDET-added; design.md Decision 16, not a named fleet-movement
// scenario, but load-bearing enough — "never fetched per body" — to pin
// directly): a single order request that must resolve more than one body
// (the star, for clearance, and the target body, for the intercept) calls
// BodySource.BodyTable EXACTLY ONCE, never once per body resolved.
func TestOrderTo_Scenario_BodySourceResolvedOncePerRequest(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	target := orbitingFeature("feat-body-a", 40, 2.0)
	bt := testBodyTable(t, "sys-0", 6.0, target)
	spy := &spyBodySource{bt: bt}
	svc.WithBodies(spy)

	f := freshParkedFleet()
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f, nil)

	if _, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{BodyId: "feat-body-a"}); err != nil {
		t.Fatalf("OrderTo: %v", err)
	}
	if spy.calls != 1 {
		t.Fatalf("BodySource.BodyTable called %d times for one order (which resolves both the star's "+
			"clearance and the target body's orbit) — want exactly 1, never per-body", spy.calls)
	}
}

// Scenario (SDET-added; design.md Decision 16 — "never memoized in
// package-level state"): two separate requests against the same system each
// resolve BodySource fresh — a second request sees a body table the fake
// changed between calls, proving nothing cached the first request's table
// at package scope.
func TestOrderTo_Scenario_BodySourceNotMemoizedAcrossRequests(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bt1 := testBodyTable(t, "sys-0", 6.0)
	spy := &spyBodySource{bt: bt1}
	svc.WithBodies(spy)

	f1 := freshParkedFleet()
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(f1, nil)
	point := space.Vec3{X: 60}
	if _, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &point}); err != nil {
		t.Fatalf("first OrderTo: %v", err)
	}
	if spy.calls != 1 {
		t.Fatalf("after the first request, BodySource calls = %d, want 1", spy.calls)
	}

	// A second, independent request against the same system: a memoized
	// (package-level or service-level-across-requests) table would answer
	// without calling the spy again.
	target := orbitingFeature("feat-body-b", 50, 2.0)
	bt2 := testBodyTable(t, "sys-0", 6.0, target)
	spy.bt = bt2

	f2 := freshParkedFleet()
	f2.Id = "fleet_2"
	dao.EXPECT().Get(gomock.Any(), "fleet_2").Return(f2, nil)
	if _, err := svc.OrderTo(context.Background(), "fleet_2", OrderRequest{BodyId: "feat-body-b"}); err != nil {
		t.Fatalf("second OrderTo against the newly-visible body: %v", err)
	}
	if spy.calls != 2 {
		t.Fatalf("after a second, independent request, BodySource calls = %d, want 2 — a memoized "+
			"table would have stalled at 1 and this order (against a body absent from the first "+
			"table) would have failed instead of succeeding", spy.calls)
	}
}

// Scenario (SDET-added, structural/static; system-body-table: "The Body
// Table Is an Unfiltered Internal Seam, Never a Response", restated for
// fleet by tasks.md 3.5's own text: "never used to enumerate Ids() into a
// response"). A source-scan guard: fleet's own package source never calls
// `.Ids()` on a *system.BodyTable. This is a regression guard, not a
// runtime scenario — it necessarily passes today (fleet calls BodyTable
// nowhere yet) and is included so a FUTURE handler/DTO change that reaches
// for Ids() fails loudly, mirroring this codebase's own established
// structural-guard pattern (disclosure/purity_test.go,
// .claude/scripts/check-fma-contraction.sh).
func TestFleetPackageSource_Scenario_NeverEnumeratesBodyTableIdsIntoAResponse(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("reading backend/fleet: %v", err)
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(".", name))
		if err != nil {
			t.Fatalf("reading %s: %v", name, err)
		}
		if strings.Contains(string(b), ".Ids()") {
			t.Errorf("%s calls .Ids() on a body table — system-body-table's unfiltered-seam rule "+
				"forbids enumerating it into any response fleet ultimately serves", name)
		}
	}
}
