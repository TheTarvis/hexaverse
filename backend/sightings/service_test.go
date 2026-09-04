package sightings

// RED-phase unit tests for openspec change replace-observation-with-sightings,
// tasks.md 3.4 — Service's page-size bounding, isolated from Firestore via a
// hand-rolled fake Dao (specs/sighting-records/spec.md — "The Pile Is
// Paginated and Bounded Per Read": "the system SHALL bound every read... to
// a page no larger than a named maximum").
//
// EXPECTED TO FAIL ON FIRST RUN: compile error — Service, Dao, NewServiceWith,
// and PageMax do not exist yet.
//
// This is the UNIT half of the standing "path tests, not just unit tests"
// rule: it proves Service.List's own bounding logic in isolation (a fake Dao
// records what limit it was actually asked for), while dao_test.go's
// TestDao_Scenario_ReadWithoutParametersBoundedToPageMax and
// router_sightings_read_test.go's router-level test prove the same property
// through progressively more real layers underneath it.
//
// CONTRACT: Service.List(ctx, cid string, limit int, cursor string) — same
// argument order as Dao.List (mint_test.go / dao_test.go), so the two never
// silently disagree on which positional argument means what.

import (
	"context"
	"testing"
)

// fakeDao is a minimal in-memory stand-in recording what Service actually
// asked for, so these tests are about Service's own logic, not Firestore's.
type fakeDao struct {
	gotLimit  int
	gotCursor string
	toReturn  []Sighting
	cursorOut string
}

func (f *fakeDao) Get(ctx context.Context, cid, id string) (*Sighting, error) { return nil, nil }

func (f *fakeDao) List(ctx context.Context, cid string, limit int, cursor string, systemId ...string) ([]Sighting, string, error) {
	f.gotLimit = limit
	f.gotCursor = cursor
	return f.toReturn, f.cursorOut, nil
}

// Scenario: A read without further parameters returns at most the page
// maximum (the Service-level half: an unspecified/zero limit must resolve
// to PageMax before it ever reaches the Dao).
func TestService_Scenario_UnspecifiedLimitDefaultsToPageMax(t *testing.T) {
	dao := &fakeDao{}
	svc := NewServiceWith(dao)

	if _, _, err := svc.List(context.Background(), "corp-1", 0, ""); err != nil {
		t.Fatalf("List: %v", err)
	}
	if dao.gotLimit != PageMax {
		t.Errorf("Service.List(limit=0) asked the Dao for limit=%d, want the named page maximum PageMax=%d",
			dao.gotLimit, PageMax)
	}
}

// Scenario (SDET-added; direct consequence of "no unbounded single-response
// read" in the same requirement): a caller-requested limit ABOVE the page
// maximum is clamped, not honored — the bound is a hard ceiling on the read
// surface, not merely a default a caller can override.
func TestService_Scenario_OversizedLimitIsClampedToPageMax(t *testing.T) {
	dao := &fakeDao{}
	svc := NewServiceWith(dao)

	if _, _, err := svc.List(context.Background(), "corp-1", PageMax*10, ""); err != nil {
		t.Fatalf("List: %v", err)
	}
	if dao.gotLimit != PageMax {
		t.Errorf("Service.List(limit=%d) asked the Dao for limit=%d, want it clamped to PageMax=%d",
			PageMax*10, dao.gotLimit, PageMax)
	}
}

// Scenario: A corporation reads its own pile (the Service-level plumbing
// half: cid and cursor pass through to the Dao unchanged).
func TestService_Scenario_ScopesToTheCallersCorporationAndThreadsTheCursor(t *testing.T) {
	want := []Sighting{{CorporationId: "corp-1", TargetId: "fleet_a"}}
	dao := &fakeDao{toReturn: want, cursorOut: "next-page-token"}
	svc := NewServiceWith(dao)

	got, nextCursor, err := svc.List(context.Background(), "corp-1", 5, "prior-cursor")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if dao.gotCursor != "prior-cursor" {
		t.Errorf("Dao received cursor %q, want the caller-supplied cursor threaded through unchanged", dao.gotCursor)
	}
	if len(got) != 1 || got[0].TargetId != "fleet_a" {
		t.Errorf("List returned %+v, want the Dao's own records passed through unchanged", got)
	}
	if nextCursor != "next-page-token" {
		t.Errorf("nextCursor = %q, want the Dao's own cursor passed through unchanged", nextCursor)
	}
}
