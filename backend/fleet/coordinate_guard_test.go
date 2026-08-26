package fleet

import (
	"bytes"
	"context"
	"strconv"
	"strings"
	"testing"

	"hexaverse/board"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"go.uber.org/mock/gomock"
)

// fleet-movement, ADDED requirement "Board Coordinates Outside the Live
// Schedule Are Rejected, Never Panicked" — scenario "A fleet's stored
// position exceeds the live board radius" and scenario "Coordinate
// rejections are countable per cause" (the fleet-read half; the
// action-parameter-decode half belongs to observation, see
// observation/coordinate_guard_test.go).
//
// task 3.11: the guard lives at "the fleet decode boundary (the fleet
// DAO/service read path...)" — Service.Get is exactly the function
// mine.FleetSource.Get and market.FleetSource.Get both ARE (both interfaces
// are satisfied directly by fleet.Service.Get, verified by reading
// mine/service.go and market/service.go's FleetSource declarations), which
// is why one test here, not three, covers "a fleet read, mine command, or
// sell command" — mine/market inherit through FleetSource.Get and need no
// guard of their own (tasks.md 3.11/6.1).
//
// SDET-CHOSEN SENTINEL NAME (not pinned elsewhere): fleet.ErrRingOutOfRange.
// If the developer names it differently, that is a mechanical rename, not a
// behavior dispute.

// captureLog swaps the global zerolog logger for the duration of fn — the
// only way to observe production's package-level log.Warn()/log.Error()
// calls from a black-box test.
func captureLog(t *testing.T, fn func()) string {
	t.Helper()
	var buf bytes.Buffer
	original := log.Logger
	log.Logger = zerolog.New(&buf)
	defer func() { log.Logger = original }()
	fn()
	return buf.String()
}

// corruptCoastFleet is a fleet whose stored coast orbit carries a ring far
// beyond any plausible board radius — simulating stored data written before
// a board-radius reduction (design.md Decision 3's risk), a migration
// mismatch, or plain corruption. Its ring is NOT a hardcoded "20"-style
// magic number: it is read live at test time, guaranteed above
// ProductionSchedule().MaxRing.
func corruptCoastFleet(t *testing.T) *Fleet {
	t.Helper()
	badRing := board.ProductionSchedule().MaxRing + 50
	return &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: board.MovementState{Mode: board.ModeCoast, Coast: &board.Orbit{Ring: badRing, Angle0: 0, Period: 1, Dir: 1}},
	}
}

// runRecovered calls fn and converts any panic into a reported value rather
// than crashing the test binary — required to observe "never panics" as a
// normal (non-fatal-to-the-suite) test failure.
func runRecovered(t *testing.T, fn func()) (panicked any) {
	t.Helper()
	defer func() { panicked = recover() }()
	fn()
	return
}

func TestServiceGet_Scenario_StoredRingBeyondLiveScheduleIsRejectedNotPanicked(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)
	clk := &fakeClock{now: 500_000}
	corrupt := corruptCoastFleet(t)
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(corrupt, nil).AnyTimes()

	svc := NewServiceWith(dao, &fakeSystem{}, &fakeActions{}, clk)

	var err error
	panicked := runRecovered(t, func() {
		_, err = svc.Get(context.Background(), "fleet_1")
	})
	if panicked != nil {
		t.Fatalf("Service.Get panicked on a stored ring beyond the live schedule: %v", panicked)
	}
	if err == nil {
		t.Fatalf("Service.Get returned no error for a fleet whose stored ring (%d) exceeds the live schedule's max (%d) — want a named sentinel error",
			corrupt.State.Coast.Ring, board.ProductionSchedule().MaxRing)
	}
}

func TestServicePosition_Scenario_StoredRingBeyondLiveScheduleIsRejectedNotPanicked(t *testing.T) {
	clk := &fakeClock{now: 500_000}
	svc := NewServiceWith(nil, &fakeSystem{}, &fakeActions{}, clk)
	corrupt := corruptCoastFleet(t)

	var err error
	var pos board.Cell
	panicked := runRecovered(t, func() {
		pos, err = svc.Position(context.Background(), corrupt)
	})
	if panicked != nil {
		t.Fatalf("Service.Position panicked on a stored ring beyond the live schedule: %v", panicked)
	}
	if err == nil {
		t.Fatalf("Service.Position returned (%v, nil) for a fleet whose stored ring exceeds the live schedule's max — want a named sentinel error, not a silent (possibly wrong) position", pos)
	}
}

// Scenario: Coordinate rejections are countable per cause. A fleet-read
// rejection (not an action-param decode) carries `cause: ring-out-of-range`
// and the offending `ring`, but NEVER `actionType`/an action id — "a
// fleet/mine/sell read has neither" per the 2026-08-26 cause-vocabulary
// correction.
func TestServiceGet_Scenario_RejectionRecordedWithCauseAndRing(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)
	clk := &fakeClock{now: 500_000}
	corrupt := corruptCoastFleet(t)
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(corrupt, nil).AnyTimes()

	svc := NewServiceWith(dao, &fakeSystem{}, &fakeActions{}, clk)

	logged := captureLog(t, func() {
		runRecovered(t, func() { _, _ = svc.Get(context.Background(), "fleet_1") })
	})

	if !strings.Contains(logged, "ring-out-of-range") {
		t.Errorf("captured log does not carry cause=ring-out-of-range: %q", logged)
	}
	if !strings.Contains(logged, strconv.Itoa(corrupt.State.Coast.Ring)) {
		t.Errorf("captured log does not carry the offending ring %d: %q", corrupt.State.Coast.Ring, logged)
	}
	if strings.Contains(logged, "actionType") {
		t.Errorf("a fleet read's rejection log carries actionType, but a fleet/mine/sell read has neither an action type nor an action id: %q", logged)
	}
}

// NOTE (not automated here): a structurally malformed stored `state` field
// (e.g. `state.mode` of the wrong JSON type) is already rejected by the
// Firestore SDK's own strict DataTo decode with an ordinary error, never a
// panic — that is existing, unrelated-to-this-migration behavior with no
// fleet-specific guard to pin. See the SDET handoff report's coverage table.
