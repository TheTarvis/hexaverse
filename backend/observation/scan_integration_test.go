package observation

import (
	"context"
	"strings"
	"testing"
	"time"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"

	"github.com/google/uuid"
)

// settableClock drives the resolve-time far past the eta.
type settableClock struct{ now common.WorldMillis }

func (c *settableClock) Now() common.WorldMillis               { return c.now }
func (c *settableClock) FromWall(time.Time) common.WorldMillis { return c.now }
func (c *settableClock) Scale() float64                        { return 1 }

// beamInteriors is a hand fake of InteriorSource.
type beamInteriors struct {
	feats map[string][]FeatureGeom
}

func (f beamInteriors) Features(_ context.Context, systemID string) ([]FeatureGeom, error) {
	return f.feats[systemID], nil
}

// beamLanes is a hand fake of LaneSource.
type beamLanes struct{ bySystem map[string][]LaneEnd }

func (f beamLanes) LanesOf(_ context.Context, systemID string) ([]LaneEnd, error) {
	return f.bySystem[systemID], nil
}

func testScanParams() ScanParams {
	return ScanParams{Duration: 1_000}
}

// seedScanFleet writes the actor doc the scan resolver decodes: owner, system,
// and the movement state (the legacy origin fallback; the sweep origin proper
// is the emission hex commitScan pins — #0006 Decision #26).
func seedScanFleet(t *testing.T, fs common.FirestoreService, id, corp, sys string, at board.Hex) {
	t.Helper()
	if err := fs.Set(context.Background(), "fleets", id, map[string]interface{}{
		"id": id, "corporationId": corp, "systemId": sys,
		"state": board.CoastAt(at, 0),
	}); err != nil {
		t.Fatalf("seed fleet %s: %v", id, err)
	}
}

// commitScan commits a sweep through the spine exactly as fleet.Scan does:
// sensor channel, origin system AND the emission hex pinned in params — no
// aim (#0006 Decisions #21/#26).
func commitScan(t *testing.T, svc *action.Service, fleetID, sys string, origin board.Hex, eta common.WorldMillis) *action.Action {
	t.Helper()
	a, err := svc.Commit(context.Background(), action.CommitSpec{
		Type: scanType, Actor: fleetID, ActorCollection: "fleets", Scope: sys,
		Slot:   action.SlotSensor,
		Params: map[string]interface{}{"systemId": sys, "origin": origin},
		Eta:    eta,
	})
	if err != nil {
		t.Fatalf("commit scan for %s: %v", fleetID, err)
	}
	return a
}

// TestScanResolver_SweepRevealsAndShadows drives the 360° sweep through the
// real commit→resolve path: the scan mints observations for every feature with
// clear line of sight — all around, no aim — while the star shadows what sits
// behind it (and is revealed itself). A second sweep from a clear angle
// reveals the hidden feature.
//
// Spec: 0006/S1
// Spec: 0006/S2
func TestScanResolver_SweepRevealsAndShadows(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "actions", "fleets", corporationsCollection)

	ctx := context.Background()
	clk := &settableClock{}
	actionSvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)

	corp := "corp-" + uuid.NewString()
	const sys = "sys-1"
	interiors := beamInteriors{feats: map[string][]FeatureGeom{
		sys: {
			{Id: "feat-star", Anchor: board.Hex{Q: 0, R: 0}, Astronomical: true, Occludes: true,
				Detail: &FeatureDetail{FeatureType: "star"}},
			{Id: "feat-mid", Anchor: board.Hex{Q: -2, R: 0},
				Detail: &FeatureDetail{FeatureType: "belt"}},
			{Id: "feat-hidden", Anchor: board.Hex{Q: 4, R: 0},
				Detail: &FeatureDetail{FeatureType: "belt"}},
			{Id: "feat-side", Anchor: board.Hex{Q: 0, R: 5},
				Detail: &FeatureDetail{FeatureType: "belt"}},
		},
	}}
	fog := NewServiceWith(NewDaoWithClient(fs), fakeFleets{}, interiors, beamLanes{}, clk).
		WithParams(DefaultSensorParams(), testScanParams())
	fog.RegisterResolvers(actionSvc)

	// First sweep from (-4,0): the star at (0,0) shadows (4,0); everything at a
	// clear angle — ahead, beside, anywhere around — is revealed.
	seedScanFleet(t, fs, "fleet-1", corp, sys, board.Hex{Q: -4, R: 0})
	clk.now = 0
	commitScan(t, actionSvc, "fleet-1", sys, board.Hex{Q: -4, R: 0}, 1_000)
	clk.now = 1_000
	if _, err := actionSvc.ResolveActive(ctx, "fleet-1"); err != nil {
		t.Fatalf("resolve first scan: %v", err)
	}

	dao := NewDaoWithClient(fs)
	feats, err := dao.ListFeatureObservations(ctx, corp, sys)
	if err != nil {
		t.Fatalf("feature observations: %v", err)
	}
	minted := map[string]FeatureObservation{}
	for _, fo := range feats {
		minted[fo.FeatureId] = fo
	}
	if _, ok := minted["feat-mid"]; !ok {
		t.Errorf("feature ahead with clear line of sight must be minted")
	}
	if _, ok := minted["feat-side"]; !ok {
		t.Errorf("feature at a side angle must be minted — the sweep is 360°, not aimed")
	}
	if _, ok := minted["feat-star"]; !ok {
		t.Errorf("the occluder itself must be minted (you see the planet, not past it)")
	}
	if _, ok := minted["feat-hidden"]; ok {
		t.Errorf("feature in the star's shadow must NOT be minted")
	}
	for id, fo := range minted {
		if fo.AsOf != 1_000 {
			t.Errorf("feature %s asOf = %d, want eta 1000", id, fo.AsOf)
		}
	}

	// Second sweep from (0,-4): the line to (4,0) misses the star — the hidden
	// feature is revealed from the clear position.
	seedScanFleet(t, fs, "fleet-2", corp, sys, board.Hex{Q: 0, R: -4})
	commitScan(t, actionSvc, "fleet-2", sys, board.Hex{Q: 0, R: -4}, 2_000)
	clk.now = 2_000
	if _, err := actionSvc.ResolveActive(ctx, "fleet-2"); err != nil {
		t.Fatalf("resolve second scan: %v", err)
	}
	feats, err = dao.ListFeatureObservations(ctx, corp, sys)
	if err != nil {
		t.Fatalf("feature observations after second scan: %v", err)
	}
	found := false
	for _, fo := range feats {
		if fo.FeatureId == "feat-hidden" {
			found = true
		}
	}
	if !found {
		t.Errorf("a sweep from a clear position must reveal the previously shadowed feature")
	}
}

// TestScanResolver_ChartsLanesAndRumorsNeighbors pins lanes-by-scanning
// (#0006 Decision #17/#20): any completed scan in a system charts all its
// lanes, rumors their far endpoints monotonically, and grants no graph tier
// beyond that — nothing ever writes `surveyed`.
//
// Spec: 0006/S5
func TestScanResolver_ChartsLanesAndRumorsNeighbors(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "actions", "fleets", corporationsCollection)

	ctx := context.Background()
	clk := &settableClock{}
	actionSvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)

	corp := "corp-" + uuid.NewString()
	const sys = "sys-L"
	lanes := beamLanes{bySystem: map[string][]LaneEnd{
		sys: {{LaneId: "lane-a", OtherSystemId: "sys-2"}, {LaneId: "lane-b", OtherSystemId: "sys-3"}},
	}}
	fog := NewServiceWith(NewDaoWithClient(fs), fakeFleets{}, beamInteriors{}, lanes, clk).
		WithParams(DefaultSensorParams(), testScanParams())
	fog.RegisterResolvers(actionSvc)

	// The corp already explored sys-3 — the rumor write must not lower it.
	if err := NewDaoWithClient(fs).UpsertSystemObservation(ctx, corp, SystemObservation{
		SystemId: "sys-3", Tier: TierExplored, AsOf: 1,
	}); err != nil {
		t.Fatalf("seed explored neighbour: %v", err)
	}

	seedScanFleet(t, fs, "fleet-L", corp, sys, board.Hex{Q: 1, R: 0})
	clk.now = 0
	commitScan(t, actionSvc, "fleet-L", sys, board.Hex{Q: 1, R: 0}, 1_000)
	clk.now = 1_000
	if _, err := actionSvc.ResolveActive(ctx, "fleet-L"); err != nil {
		t.Fatalf("resolve: %v", err)
	}

	charted, err := fog.ChartedLanes(ctx, corp)
	if err != nil {
		t.Fatalf("charted lanes: %v", err)
	}
	if !charted["lane-a"] || !charted["lane-b"] {
		t.Errorf("a completed scan must chart ALL the system's lanes, got %v", charted)
	}

	tiers, err := fog.SystemTiers(ctx, corp)
	if err != nil {
		t.Fatalf("tiers: %v", err)
	}
	if tiers["sys-2"] != TierRumored {
		t.Errorf("far endpoint tier = %q, want rumored", tiers["sys-2"])
	}
	if tiers["sys-3"] != TierExplored {
		t.Errorf("explored neighbour tier = %q, must stay explored (monotonic)", tiers["sys-3"])
	}
	if got, ok := tiers[sys]; ok && got != "" {
		t.Errorf("scan granted graph tier %q to the scanned system; it must grant none", got)
	}
	for id, tier := range tiers {
		if tier == TierSurveyed {
			t.Errorf("system %s = surveyed; no fog code path may write surveyed (market-reserved)", id)
		}
	}
}

// TestScanResolver_FizzlesAfterDeparture: a scan pinned to system A resolves
// with an interrupted outcome and mints nothing when the fleet has left A by
// the scan's eta.
//
// Spec: 0006/S9
func TestScanResolver_FizzlesAfterDeparture(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "actions", "fleets", corporationsCollection)

	ctx := context.Background()
	clk := &settableClock{}
	actionSvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)

	corp := "corp-" + uuid.NewString()
	const sys = "sys-F"
	lanes := beamLanes{bySystem: map[string][]LaneEnd{
		sys: {{LaneId: "lane-f", OtherSystemId: "sys-far"}},
	}}
	interiors := beamInteriors{feats: map[string][]FeatureGeom{
		sys: {{Id: "feat-f", Anchor: board.Hex{Q: 2, R: 0}, Detail: &FeatureDetail{FeatureType: "belt"}}},
	}}
	fog := NewServiceWith(NewDaoWithClient(fs), fakeFleets{}, interiors, lanes, clk).
		WithParams(DefaultSensorParams(), testScanParams())
	fog.RegisterResolvers(actionSvc)

	seedScanFleet(t, fs, "fleet-F", corp, sys, board.Hex{Q: 0, R: 1})
	clk.now = 0
	a := commitScan(t, actionSvc, "fleet-F", sys, board.Hex{Q: 0, R: 1}, 1_000)

	// The fleet departs: by eta it belongs to another system.
	if err := fs.Set(ctx, "fleets", "fleet-F", map[string]interface{}{"systemId": "sys-elsewhere"}); err != nil {
		t.Fatalf("move fleet: %v", err)
	}

	clk.now = 1_000
	if _, err := actionSvc.ResolveActive(ctx, "fleet-F"); err != nil {
		t.Fatalf("resolve: %v", err)
	}

	resolved, err := actionSvc.Get(ctx, a.Id)
	if err != nil {
		t.Fatalf("read resolved action: %v", err)
	}
	if resolved.Status != action.StatusDone {
		t.Errorf("fizzled scan status = %q, want done (it resolves, with nothing to show)", resolved.Status)
	}
	if !strings.Contains(strings.ToLower(resolved.Outcome), "interrupt") {
		t.Errorf("fizzled scan outcome = %q, want an interrupted note", resolved.Outcome)
	}

	feats, err := NewDaoWithClient(fs).ListFeatureObservations(ctx, corp, sys)
	if err != nil {
		t.Fatalf("feature observations: %v", err)
	}
	if len(feats) != 0 {
		t.Errorf("fizzled scan minted %d feature observations, want none", len(feats))
	}
	charted, err := fog.ChartedLanes(ctx, corp)
	if err != nil {
		t.Fatalf("charted lanes: %v", err)
	}
	if len(charted) != 0 {
		t.Errorf("fizzled scan charted %d lanes, want none", len(charted))
	}
}

// TestScan_LateResolveEvaluatesAtEta proves the #0005/#0006 late-resolve
// contract for the sweep: origin, occluder positions, and the feature set are
// all evaluated at the frozen eta, so a scan resolved hours late mints the
// identical snapshot. An orbiting planet that shadowed a feature AT ETA keeps
// it dark even though the planet has long since orbited away by resolve time.
//
// Spec: 0006/S10
func TestScan_LateResolveEvaluatesAtEta(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "actions", "fleets", corporationsCollection)

	ctx := context.Background()
	clk := &settableClock{}
	actionSvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)

	corp := "corp-" + uuid.NewString()
	const sys = "sys-T"
	const eta = common.WorldMillis(1_000)
	const lateBy = common.WorldMillis(9_999_999)

	// The occluder orbits; the shadowed feature sits at the core-side hex so
	// that AT ETA the occluder lies exactly between it and the fleet: the fleet
	// is seeded at 2×(occluder@eta), making the occluder the line's midpoint.
	orbit := board.Orbit{Ring: 3, Angle0: 0, Period: 24_000, Dir: 1}
	occAtEta := board.OrbState(orbit, eta)
	origin := board.Hex{Q: 2 * occAtEta.Q, R: 2 * occAtEta.R}
	if late := board.OrbState(orbit, eta+lateBy); late == occAtEta {
		t.Fatalf("test setup: the occluder must be elsewhere at resolve time for this to prove anything")
	} else if !board.LineOfSight(origin, board.Hex{Q: 0, R: 0}, map[board.Hex]bool{late: true}) {
		t.Fatalf("test setup: the late occluder position must leave the line clear")
	}

	interiors := beamInteriors{feats: map[string][]FeatureGeom{
		sys: {
			{Id: "feat-planet", Elements: &orbit, Occludes: true,
				Detail: &FeatureDetail{FeatureType: "rocky"}},
			{Id: "feat-shadowed", Anchor: board.Hex{Q: 0, R: 0},
				Detail: &FeatureDetail{FeatureType: "belt"}},
		},
	}}
	fog := NewServiceWith(NewDaoWithClient(fs), fakeFleets{}, interiors, beamLanes{}, clk).
		WithParams(DefaultSensorParams(), testScanParams())
	fog.RegisterResolvers(actionSvc)

	seedScanFleet(t, fs, "fleet-T", corp, sys, origin)
	clk.now = 0
	commitScan(t, actionSvc, "fleet-T", sys, origin, eta)

	// Resolve hours late — the planet has orbited on; the snapshot must not.
	clk.now = eta + lateBy
	if _, err := actionSvc.ResolveActive(ctx, "fleet-T"); err != nil {
		t.Fatalf("resolve: %v", err)
	}

	feats, err := NewDaoWithClient(fs).ListFeatureObservations(ctx, corp, sys)
	if err != nil {
		t.Fatalf("feature observations: %v", err)
	}
	minted := map[string]FeatureObservation{}
	for _, fo := range feats {
		minted[fo.FeatureId] = fo
	}
	planet, ok := minted["feat-planet"]
	if !ok {
		t.Fatalf("the occluding planet itself must be minted")
	}
	if planet.AsOf != eta {
		t.Errorf("planet asOf = %d, want the frozen eta %d", planet.AsOf, eta)
	}
	if _, ok := minted["feat-shadowed"]; ok {
		t.Errorf("feature shadowed AT ETA must stay dark — occluders are evaluated at eta, not at resolve time")
	}
}
