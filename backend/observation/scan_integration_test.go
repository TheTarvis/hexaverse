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
// is the emission cell commitScan pins — #0006 Decision #26).
func seedScanFleet(t *testing.T, fs common.FirestoreService, id, corp, sys string, at board.Cell) {
	t.Helper()
	if err := fs.Set(context.Background(), "fleets", id, map[string]interface{}{
		"id": id, "corporationId": corp, "systemId": sys,
		"state": board.CoastAt(at, 0, testSched()),
	}); err != nil {
		t.Fatalf("seed fleet %s: %v", id, err)
	}
}

// commitScan commits a sweep through the spine exactly as fleet.Scan does:
// sensor channel, origin system AND the emission cell pinned in params — no
// aim (#0006 Decisions #21/#26).
func commitScan(t *testing.T, svc *action.Service, fleetID, sys string, origin board.Cell, eta common.WorldMillis) *action.Action {
	t.Helper()
	a, err := svc.Commit(context.Background(), action.CommitSpec{
		Type: scanType, Actor: fleetID, ActorCollection: "fleets", Scope: sys,
		Slot:   action.SlotSensor,
		Params: map[string]interface{}{"systemId": sys, "origin": board.EncodeCell(origin)},
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
	sched := testSched()
	// Fleet fires from ring 4, slot 0; the star occludes the antipodal cell on
	// the same ring (the chord between two antipodal points passes through the
	// core). "Ahead" and "side" cells sit at open angles.
	fleetAt := board.Cell{Ring: 4, Slot: 0}
	hiddenAt := board.Cell{Ring: 4, Slot: sched.Slots(4) / 2}
	aheadAt := board.Cell{Ring: 2, Slot: 0}
	sideAt := board.Cell{Ring: 4, Slot: sched.Slots(4) / 4}
	interiors := beamInteriors{feats: map[string][]FeatureGeom{
		sys: {
			{Id: "feat-star", Anchor: board.Cell{Ring: 0, Slot: 0}, Astronomical: true, OcclusionRadius2: board.StarOcclusionRadius2,
				Detail: &FeatureDetail{FeatureType: "star"}},
			{Id: "feat-mid", Anchor: aheadAt,
				Detail: &FeatureDetail{FeatureType: "belt"}},
			{Id: "feat-hidden", Anchor: hiddenAt,
				Detail: &FeatureDetail{FeatureType: "belt"}},
			{Id: "feat-side", Anchor: sideAt,
				Detail: &FeatureDetail{FeatureType: "belt"}},
		},
	}}
	fog := NewServiceWith(NewDaoWithClient(fs), fakeFleets{}, interiors, beamLanes{}, clk).
		WithParams(DefaultSensorParams(), testScanParams())
	fog.RegisterResolvers(actionSvc)

	// First sweep from fleetAt: the star shadows the antipodal cell; everything
	// at a clear angle — ahead, beside, anywhere around — is revealed.
	seedScanFleet(t, fs, "fleet-1", corp, sys, fleetAt)
	clk.now = 0
	commitScan(t, actionSvc, "fleet-1", sys, fleetAt, 1_000)
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

	// Second sweep from a position with a clear line to hiddenAt (perpendicular
	// to the first fleet's ray): the hidden feature is revealed from the clear
	// position.
	clearAt := board.Cell{Ring: 4, Slot: sched.Slots(4) / 4}
	seedScanFleet(t, fs, "fleet-2", corp, sys, clearAt)
	commitScan(t, actionSvc, "fleet-2", sys, clearAt, 2_000)
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

	origin := board.Cell{Ring: 1, Slot: 0}
	seedScanFleet(t, fs, "fleet-L", corp, sys, origin)
	clk.now = 0
	commitScan(t, actionSvc, "fleet-L", sys, origin, 1_000)
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
		sys: {{Id: "feat-f", Anchor: board.Cell{Ring: 2, Slot: 0}, Detail: &FeatureDetail{FeatureType: "belt"}}},
	}}
	fog := NewServiceWith(NewDaoWithClient(fs), fakeFleets{}, interiors, lanes, clk).
		WithParams(DefaultSensorParams(), testScanParams())
	fog.RegisterResolvers(actionSvc)

	origin := board.Cell{Ring: 1, Slot: 1}
	seedScanFleet(t, fs, "fleet-F", corp, sys, origin)
	clk.now = 0
	a := commitScan(t, actionSvc, "fleet-F", sys, origin, 1_000)

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
	sched := testSched()

	corp := "corp-" + uuid.NewString()
	const sys = "sys-T"
	const eta = common.WorldMillis(1_000)
	const lateBy = common.WorldMillis(9_999_999)

	// The occluder orbits on ring 4; the shadowed feature sits at the CORE, and
	// the fleet fires from ring 8 on the SAME slot the occluder sits on at eta
	// — collinear through the core (CellCenter scales linearly with ring at a
	// fixed slot), so the occluder is exactly the chord's midpoint.
	orbit := board.Orbit{Ring: 4, Angle0: 0, Period: 24_000, Dir: 1}
	occAtEta := board.OrbState(orbit, eta, sched)
	shadowed := board.Cell{Ring: 0, Slot: 0}
	// Ring 8's slot count is an exact integer multiple of ring 4's (the
	// schedule's adjacent-ring ratio is always 1 or 2, so any outer/inner
	// ratio is an integer power of 2) — scale the slot index by that ratio so
	// `origin` sits at the SAME angle as occAtEta, twice as far out, keeping
	// the two collinear with the core.
	outerRing := 2 * occAtEta.Ring
	ratio := sched.Slots(outerRing) / sched.Slots(occAtEta.Ring)
	origin := board.Cell{Ring: outerRing, Slot: occAtEta.Slot * ratio}
	if late := board.OrbState(orbit, eta+lateBy, sched); late == occAtEta {
		t.Fatalf("test setup: the occluder must be elsewhere at resolve time for this to prove anything")
	} else if !board.LineOfSight(origin, shadowed, []board.Occluder{{Cell: late, Radius2: board.PlanetOcclusionRadius2}}, sched) {
		t.Fatalf("test setup: the late occluder position must leave the line clear")
	}

	interiors := beamInteriors{feats: map[string][]FeatureGeom{
		sys: {
			{Id: "feat-planet", Elements: &orbit, OcclusionRadius2: board.PlanetOcclusionRadius2,
				Detail: &FeatureDetail{FeatureType: "rocky"}},
			{Id: "feat-shadowed", Anchor: shadowed,
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
