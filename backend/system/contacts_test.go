package system

// Unit coverage for Contacts (tasks.md 4.4, 4.5), at this package's own
// grain rather than relying solely on the emulator-backed e2e suite
// (disclosure_wiring_e2e_test.go, package main) that exercises the same
// requirement through the full HTTP stack.

import (
	"context"
	"testing"

	"hexaverse/disclosure"
	"hexaverse/space"
)

// fakeFleetSource is a table-driven FleetSource fixture: a fixed set of
// presences and an attachments adapter, regardless of the systemId asked
// for (these tests never exercise multi-system fan-out).
type fakeFleetSource struct {
	presences   []FleetPresence
	attachments disclosure.Attachments
	err         error
}

func (f fakeFleetSource) FleetsInSystem(context.Context, string) ([]FleetPresence, disclosure.Attachments, error) {
	return f.presences, f.attachments, f.err
}

// noAttachments is the trivial disclosure.Attachments — nothing is docked
// to anything, which is all these tests need beyond the masking-specific
// cases.
type noAttachments struct{}

func (noAttachments) HostOf(string) (string, bool)    { return "", false }
func (noAttachments) AttachedTo(string) []string      { return nil }

// starOnlyBodyTable builds a minimal BodyTable — a star at the origin — for
// tests that only need disclosure's occlusion/position machinery to have
// something to resolve against.
func starOnlyBodyTable() *BodyTable {
	return &BodyTable{
		bodies:   map[string]space.Body{"star": {Id: "star", Size: 6}},
		starId:   "star",
		starSize: 6,
		extent:   1000,
		ids:      []string{"star"},
	}
}

func parkedShip(at space.Vec3) disclosure.Ship {
	return disclosure.Ship{
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: at}},
	}
}

func TestContacts_NoFleetSourceIsEmptyNotNil(t *testing.T) {
	s := &Service{}
	got, err := s.Contacts(context.Background(), "sys-1", "corp-a", starOnlyBodyTable(), 0)
	if err != nil {
		t.Fatalf("Contacts: %v", err)
	}
	if got == nil || len(got) != 0 {
		t.Errorf("Contacts with no FleetSource wired = %#v, want an empty, non-nil slice", got)
	}
}

func TestContacts_CorplessRequesterIsEmpty(t *testing.T) {
	s := (&Service{}).WithFleets(fakeFleetSource{
		presences: []FleetPresence{
			{Id: "foreign-1", CorporationId: "corp-foreign", Ship: parkedShip(space.Vec3{X: 40, Y: 0})},
		},
		attachments: noAttachments{},
	})
	got, err := s.Contacts(context.Background(), "sys-1", "", starOnlyBodyTable(), 0)
	if err != nil {
		t.Fatalf("Contacts: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("corpless requester's contacts = %#v, want empty", got)
	}
}

func TestContacts_OwnFleetDisclosesANearbyForeignTarget(t *testing.T) {
	s := (&Service{}).WithFleets(fakeFleetSource{
		presences: []FleetPresence{
			{Id: "own-1", CorporationId: "corp-a", Ship: parkedShip(space.Vec3{X: 100, Y: 0})},
			{Id: "foreign-1", CorporationId: "corp-foreign", Ship: parkedShip(space.Vec3{X: 108, Y: 0})},
		},
		attachments: noAttachments{},
	})
	got, err := s.Contacts(context.Background(), "sys-1", "corp-a", starOnlyBodyTable(), 0)
	if err != nil {
		t.Fatalf("Contacts: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d contacts, want exactly 1: %#v", len(got), got)
	}
}

func TestContacts_TwoOwnFleetsSeeingSameTargetDedupToOne(t *testing.T) {
	s := (&Service{}).WithFleets(fakeFleetSource{
		presences: []FleetPresence{
			{Id: "own-1", CorporationId: "corp-a", Ship: parkedShip(space.Vec3{X: 100, Y: 8})},
			{Id: "own-2", CorporationId: "corp-a", Ship: parkedShip(space.Vec3{X: 100, Y: -8})},
			{Id: "foreign-1", CorporationId: "corp-foreign", Ship: parkedShip(space.Vec3{X: 100, Y: 0})},
		},
		attachments: noAttachments{},
	})
	got, err := s.Contacts(context.Background(), "sys-1", "corp-a", starOnlyBodyTable(), 0)
	if err != nil {
		t.Fatalf("Contacts: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d contacts, want exactly 1 (deduped): %#v", len(got), got)
	}
}

func TestContacts_LaneTransitingOwnFleetContributesNothing(t *testing.T) {
	transiting := parkedShip(space.Vec3{X: 300, Y: 0})
	transiting.InLaneTransit = true
	s := (&Service{}).WithFleets(fakeFleetSource{
		presences: []FleetPresence{
			{Id: "own-transiting", CorporationId: "corp-a", Ship: transiting},
			{Id: "foreign-near-stale-position", CorporationId: "corp-foreign", Ship: parkedShip(space.Vec3{X: 305, Y: 0})},
		},
		attachments: noAttachments{},
	})
	got, err := s.Contacts(context.Background(), "sys-1", "corp-a", starOnlyBodyTable(), 0)
	if err != nil {
		t.Fatalf("Contacts: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("got %d contacts, want 0 — a lane-transiting fleet observes nothing: %#v", len(got), got)
	}
}

func TestContacts_MaskedDockedOwnFleetStillObserves(t *testing.T) {
	att := fakeSystemAttachments{"masked-observer": "star"}
	s := (&Service{}).WithFleets(fakeFleetSource{
		presences: []FleetPresence{
			{Id: "masked-observer", CorporationId: "corp-a", Ship: parkedShip(space.Vec3{X: 0, Y: 6})},
			{Id: "foreign-1", CorporationId: "corp-foreign", Ship: parkedShip(space.Vec3{X: 0, Y: 14})},
		},
		attachments: att,
	})
	got, err := s.Contacts(context.Background(), "sys-1", "corp-a", starOnlyBodyTable(), 0)
	if err != nil {
		t.Fatalf("Contacts: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d contacts, want exactly 1 — the observing fleet's own masked state must not suppress what "+
			"it observes: %#v", len(got), got)
	}
}

// fakeSystemAttachments is the same tiny fixture shape as disclosure's own
// test-only fakeAttachments — reimplemented here (not imported; it's a test
// file in another package) purely to exercise Contacts against a masked
// observer without needing disclosure's internal fixtures.
type fakeSystemAttachments map[string]string

func (f fakeSystemAttachments) HostOf(id string) (string, bool) {
	h, ok := f[id]
	return h, ok
}

func (f fakeSystemAttachments) AttachedTo(hostId string) []string {
	var out []string
	for child, host := range f {
		if host == hostId {
			out = append(out, child)
		}
	}
	return out
}
