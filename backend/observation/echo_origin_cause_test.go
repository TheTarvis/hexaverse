package observation

import (
	"bytes"
	"context"
	"strconv"
	"strings"
	"testing"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// observation-fog-and-scan, MODIFIED requirement "Running Scan Echo Disc" —
// scenario "A present but undecodable origin falls back distinguishably",
// corrected 2026-08-26 (adversarial pass on this change) to the SAME
// three-cause vocabulary fleet-movement's "Board Coordinates Outside the Live
// Schedule Are Rejected, Never Panicked" uses:
//
//	origin-absent      — no origin param recorded at all (a legacy scan)
//	undecodable-shape  — an origin param is present but not a decodable cell
//	ring-out-of-range  — origin decodes to a cell whose ring exceeds the
//	                     live schedule's maximum
//
// Log fields: `cause` always; `ring` only for ring-out-of-range; `actionType`
// plus the action id only when the rejection came from decoding an action
// parameter (which THIS is — a scan's own origin param — unlike
// fleet-movement's fleet-read case, which has neither).

// captureLog swaps the global zerolog logger so production's log.Warn()/
// log.Error() calls (through github.com/rs/zerolog/log) can be observed.
func captureLog(t *testing.T, fn func()) string {
	t.Helper()
	var buf bytes.Buffer
	original := log.Logger
	log.Logger = zerolog.New(&buf)
	defer func() { log.Logger = original }()
	fn()
	return buf.String()
}

// commitScanWithRawParams commits a scan with attacker/corruption-controlled
// params (bypassing commitScan's normal board.EncodeCell), so the fixture can
// hand the resolver exactly the malformed shapes each cause targets.
func commitScanWithRawParams(t *testing.T, svc *action.Service, fleetID, sys string, params map[string]interface{}, eta common.WorldMillis) *action.Action {
	t.Helper()
	a, err := svc.Commit(context.Background(), action.CommitSpec{
		Type: scanType, Actor: fleetID, ActorCollection: "fleets", Scope: sys,
		Slot: action.SlotSensor, Params: params, Eta: eta,
	})
	if err != nil {
		t.Fatalf("commit scan for %s: %v", fleetID, err)
	}
	return a
}

// scanCauseFixture wires a fog service + action service against the emulator,
// seeds a fleet at fleetAt with a feature also AT fleetAt (so a resolve that
// truly falls back to the fleet's live position — rather than failing
// outright — mints it, proving the fallback actually ran).
func scanCauseFixture(t *testing.T) (actionSvc *action.Service, clk *settableClock, corp, sys string, fleetAt board.Cell, dao Dao, cleanup func()) {
	t.Helper()
	fsClient, client := common.SetupFirestoreTestDAO(t)
	clk = &settableClock{}
	actionSvc = action.NewServiceWith(action.NewDaoWith(fsClient, clk), clk, nil)

	corp = "corp-" + uuid.NewString()
	sys = "sys-cause-" + uuid.NewString()
	fleetAt = board.Cell{Ring: 2, Slot: 0}
	interiors := beamInteriors{feats: map[string][]FeatureGeom{
		sys: {{Id: "feat-here", Anchor: fleetAt, Detail: &FeatureDetail{FeatureType: "belt"}}},
	}}
	dao = NewDaoWithClient(fsClient)
	fog := NewServiceWith(dao, fakeFleets{}, interiors, beamLanes{}, clk).
		WithParams(DefaultSensorParams(), testScanParams())
	fog.RegisterResolvers(actionSvc)

	seedScanFleet(t, fsClient, "fleet-cause", corp, sys, fleetAt)
	clk.now = 0
	return actionSvc, clk, corp, sys, fleetAt, dao, func() {
		common.CleanupFirestoreTestData(t, client, "actions", "fleets", corporationsCollection)
	}
}

// resolveAndGet advances the clock to eta, resolves the actor's due action,
// and re-reads the settled action by id.
func resolveAndGet(t *testing.T, actionSvc *action.Service, clk *settableClock, fleetID string, a *action.Action, eta common.WorldMillis) *action.Action {
	t.Helper()
	clk.now = eta
	if _, err := actionSvc.ResolveActive(context.Background(), fleetID); err != nil {
		t.Fatalf("resolve: %v", err)
	}
	resolved, err := actionSvc.Get(context.Background(), a.Id)
	if err != nil {
		t.Fatalf("re-reading resolved action: %v", err)
	}
	return resolved
}

// assertFellBackToLivePosition proves the scan resolved NORMALLY (minted the
// feature at the fleet's live position) rather than failing outright — the
// scenario's "the scan still resolves using the fleet's live position rather
// than failing outright" clause.
func assertFellBackToLivePosition(t *testing.T, corp, sys string, fs Dao) {
	t.Helper()
	feats, err := fs.ListFeatureObservations(context.Background(), corp, sys)
	if err != nil {
		t.Fatalf("feature observations: %v", err)
	}
	for _, fo := range feats {
		if fo.FeatureId == "feat-here" {
			return
		}
	}
	t.Fatalf("feat-here (at the fleet's live position) was not minted — the scan did not fall back to the live position")
}

func TestScanResolver_Scenario_OriginAbsentFallsBackAndIsRecorded(t *testing.T) {
	actionSvc, clk, corp, sys, _, dao, cleanup := scanCauseFixture(t)
	defer cleanup()
	const eta = common.WorldMillis(1_000)

	var resolved *action.Action
	logged := captureLog(t, func() {
		a := commitScanWithRawParams(t, actionSvc, "fleet-cause", sys, map[string]interface{}{"systemId": sys}, eta)
		resolved = resolveAndGet(t, actionSvc, clk, "fleet-cause", a, eta)
	})

	if !strings.Contains(strings.ToLower(resolved.Outcome), "origin-absent") {
		t.Errorf("resolved outcome text = %q, want it to name cause origin-absent", resolved.Outcome)
	}
	if !strings.Contains(logged, "origin-absent") {
		t.Errorf("captured log does not carry cause=origin-absent: %q", logged)
	}
	if strings.Contains(logged, "\"ring\"") {
		t.Errorf("origin-absent must not carry a ring field: %q", logged)
	}
	if !strings.Contains(logged, "actionType") {
		t.Errorf("an action-parameter decode rejection must carry actionType: %q", logged)
	}
	if !strings.Contains(logged, scanType) {
		t.Errorf("captured log does not carry the action type %q: %q", scanType, logged)
	}
	assertFellBackToLivePosition(t, corp, sys, dao)
}

func TestScanResolver_Scenario_UndecodableOriginFallsBackAndIsRecorded(t *testing.T) {
	actionSvc, clk, corp, sys, _, dao, cleanup := scanCauseFixture(t)
	defer cleanup()
	const eta = common.WorldMillis(1_000)

	var resolved *action.Action
	logged := captureLog(t, func() {
		a := commitScanWithRawParams(t, actionSvc, "fleet-cause", sys,
			map[string]interface{}{"systemId": sys, "origin": "not-a-cell"}, eta)
		resolved = resolveAndGet(t, actionSvc, clk, "fleet-cause", a, eta)
	})

	if !strings.Contains(strings.ToLower(resolved.Outcome), "undecodable-shape") {
		t.Errorf("resolved outcome text = %q, want it to name cause undecodable-shape", resolved.Outcome)
	}
	if !strings.Contains(logged, "undecodable-shape") {
		t.Errorf("captured log does not carry cause=undecodable-shape: %q", logged)
	}
	if !strings.Contains(logged, "actionType") {
		t.Errorf("an action-parameter decode rejection must carry actionType: %q", logged)
	}
	assertFellBackToLivePosition(t, corp, sys, dao)
}

func TestScanResolver_Scenario_RingOutOfRangeOriginFallsBackAndIsRecorded(t *testing.T) {
	actionSvc, clk, corp, sys, _, dao, cleanup := scanCauseFixture(t)
	defer cleanup()
	const eta = common.WorldMillis(1_000)

	badRing := board.ProductionSchedule().MaxRing + 7
	var resolved *action.Action
	logged := captureLog(t, func() {
		a := commitScanWithRawParams(t, actionSvc, "fleet-cause", sys,
			map[string]interface{}{"systemId": sys, "origin": board.EncodeCell(board.Cell{Ring: badRing, Slot: 0})}, eta)
		resolved = resolveAndGet(t, actionSvc, clk, "fleet-cause", a, eta)
	})

	if !strings.Contains(strings.ToLower(resolved.Outcome), "ring-out-of-range") {
		t.Errorf("resolved outcome text = %q, want it to name cause ring-out-of-range", resolved.Outcome)
	}
	if !strings.Contains(logged, "ring-out-of-range") {
		t.Errorf("captured log does not carry cause=ring-out-of-range: %q", logged)
	}
	if !strings.Contains(logged, strconv.Itoa(badRing)) {
		t.Errorf("captured log does not carry the offending ring %d: %q", badRing, logged)
	}
	if !strings.Contains(logged, "actionType") {
		t.Errorf("an action-parameter decode rejection must carry actionType: %q", logged)
	}
	assertFellBackToLivePosition(t, corp, sys, dao)
}
