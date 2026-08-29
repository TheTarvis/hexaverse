package system

// RED-phase tests for openspec change add-orbital-system-bodies —
// system-body-table's gate-specific requirements. Shares fakes/fixtures
// with bodies_test.go (same package).
//
// SDET-CHOSEN CONTRACT: `func gateOrbit(systemCoords, neighbourCoords
// galaxy.Coords, extent float64) space.Orbit` — Decision 13's fixture family
// is named `gateOrbit` with inputs "the two endpoint galaxy.Coords and the
// system extent"; tasks.md 7.2 states the same three-argument shape
// (`gateOrbit(systemCoords, neighbourCoords, extent)`). This is about as
// pinned as an unexported helper gets without being direct design-text
// quotation, so it is used verbatim rather than flagged as a dispute risk.
// GateSize is NOT part of Orbit (space.Orbit has no size field) — it is
// asserted at the space.Body level once BodyTable wraps a derived gate.

import (
	"context"
	"strings"
	"testing"

	"hexaverse/galaxy"
	"hexaverse/space"
)

// --- gateOrbit, the pure bearing/motion law --------------------------------

// Scenario: A gate's phase index matches the pinned bearing derivation.
func TestGateOrbit_Scenario_PhaseIndexMatchesPinnedBearingDerivation(t *testing.T) {
	from := galaxy.Coords{X: 0, Y: 0, Z: 0}
	to := galaxy.Coords{X: 30, Y: 40, Z: 999} // Z must be dropped (Decision 7: elevation is dropped)
	extent := 500.0

	got := gateOrbit(from, to, extent)
	wantIdx, _ := space.PhaseIndexOf(space.Vec3{X: to.X - from.X, Z: to.Y - from.Y})
	if got.Phase != wantIdx {
		t.Errorf("gateOrbit phase = %v, want space.PhaseIndexOf(horizontal projection) = %v", got.Phase, wantIdx)
	}
}

// Scenario: An exact tie resolves to the documented lower index.
//
// Constructed by placing the neighbour exactly on a pinned-table entry's own
// direction (here, straight along +X) — the documented tie-break case
// ("An offset that lies exactly on a table entry's direction SHALL resolve
// to that entry's own index").
func TestGateOrbit_Scenario_ExactTieResolvesToDocumentedLowerIndex(t *testing.T) {
	from := galaxy.Coords{X: 0, Y: 0}
	to := galaxy.Coords{X: 100, Y: 0} // exactly along the table's index-0 direction
	extent := 500.0

	got := gateOrbit(from, to, extent)
	wantIdx, _ := space.PhaseIndexOf(space.Vec3{X: 100, Z: 0})
	if got.Phase != wantIdx {
		t.Errorf("gateOrbit phase at an exact table-direction tie = %v, want %v (space.PhaseIndexOf's own documented tie-break)", got.Phase, wantIdx)
	}
}

// Scenario: A zero horizontal projection places the gate at the named
// default phase index.
func TestGateOrbit_Scenario_ZeroHorizontalProjectionUsesDefaultPhaseIndex(t *testing.T) {
	from := galaxy.Coords{X: 5, Y: 5, Z: 0}
	to := galaxy.Coords{X: 5, Y: 5, Z: 200} // only Z differs, which is dropped -> zero horizontal offset
	extent := 500.0

	got := gateOrbit(from, to, extent)
	if got.Phase != space.DefaultPhaseIndex {
		t.Errorf("gateOrbit phase at a zero horizontal projection = %v, want space.DefaultPhaseIndex = %v", got.Phase, space.DefaultPhaseIndex)
	}
}

// Scenario: A gate lies on the reference plane in every system.
func TestGateOrbit_Scenario_LiesOnReferencePlaneRegardlessOfDominantDirection(t *testing.T) {
	from := galaxy.Coords{X: 0, Y: 0}
	to := galaxy.Coords{X: -40, Y: 70}
	extent := 400.0

	got := gateOrbit(from, to, extent)
	if got.Inclination != 0 {
		t.Errorf("gate inclination = %v, want 0 (no side, no jitter)", got.Inclination)
	}
	if got.Node != 0 {
		t.Errorf("gate node = %v, want 0", got.Node)
	}
}

// --- "A Gate Is Motionless" -------------------------------------------------

func gateOrbitFixture() space.Orbit {
	return gateOrbit(galaxy.Coords{X: 0, Y: 0}, galaxy.Coords{X: 10, Y: 20}, 500.0)
}

// Scenario: A gate's position never changes.
func TestGateOrbit_Scenario_PositionNeverChanges(t *testing.T) {
	o := gateOrbitFixture()
	p1 := o.LocalPosition(0)
	p2 := o.LocalPosition(999_999_999)
	if p1 != p2 {
		t.Errorf("gate position at t=0 (%+v) differs from t=999999999 (%+v)", p1, p2)
	}
}

// Scenario: A gate's velocity is the zero vector.
func TestGateOrbit_Scenario_VelocityIsZeroVector(t *testing.T) {
	o := gateOrbitFixture()
	v := o.LocalVelocity(12_345)
	if v != (space.Vec3{}) {
		t.Errorf("gate velocity = %+v, want the zero vector", v)
	}
}

// Scenario: Evaluating a gate performs no division by its period.
//
// Observed structurally: a non-positive PeriodMs is the precondition
// space.Orbit's own LocalVelocity/PhaseAt use to skip their division
// entirely (space/orbit.go, space/park.go) — asserted here as the gate's own
// property, not re-derived from space's internals.
func TestGateOrbit_Scenario_NonPositivePeriodMeansNoDivision(t *testing.T) {
	o := gateOrbitFixture()
	if o.PeriodMs > 0 {
		t.Fatalf("gate PeriodMs = %v, want non-positive (motionless, no division performed)", o.PeriodMs)
	}
}

// --- BodyTable-level gate composition scenarios -----------------------------

// twoLaneGalaxy returns a stubGalaxyBT wired with two neighbours (both
// present in `known`), suitable for the multi-gate scenarios.
func twoLaneGalaxy() *stubGalaxyBT {
	return &stubGalaxyBT{
		meta:      &galaxy.Galaxy{Id: "gal_bt", Seed: 3},
		neighbors: []string{"sys-e", "sys-n"},
		known: map[string]galaxy.System{
			"sys-bt": {Id: "sys-bt", Coords: galaxy.Coords{X: 0, Y: 0}},
			"sys-e":  {Id: "sys-e", Coords: galaxy.Coords{X: 100, Y: 0}},
			"sys-n":  {Id: "sys-n", Coords: galaxy.Coords{X: 0, Y: 100}},
		},
	}
}

func gateIds(table *BodyTable, interiorFeatureIds map[string]bool) []string {
	var out []string
	for _, id := range table.Ids() {
		if !interiorFeatureIds[id] && !strings.Contains(id, "#") {
			out = append(out, id)
		}
	}
	return out
}

func interiorFeatureIdSet(feats []Feature) map[string]bool {
	m := map[string]bool{}
	for _, f := range feats {
		m[f.Id] = true
	}
	return m
}

// Scenario: A gate's radius exceeds every non-gate body's star-frame
// distance.
func TestBodyTable_Scenario_GateRadiusExceedsEveryNonGateBodysStarFrameDistance(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc := buildBTService(interior, feats, twoLaneGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	ids := interiorFeatureIdSet(feats)
	gates := gateIds(table, ids)
	if len(gates) == 0 {
		t.Fatal("no gates derived despite two live lanes")
	}

	// Max star-frame distance among non-gate bodies: the gas giant's own
	// radius (its moon's star-frame distance is parent radius + local
	// radius, still less than the giant's radius plus a small local moon
	// offset — computed exactly here rather than assumed).
	giant := ContinuousRadius(7)
	moonStarFrame := giant + 15.0 // parent radius + moon local radius (goodBodyTableInterior)
	belt := ContinuousRadius(4)
	maxNonGate := giant
	for _, d := range []float64{moonStarFrame, belt} {
		if d > maxNonGate {
			maxNonGate = d
		}
	}
	for _, gid := range gates {
		b, _ := table.Body(gid)
		if !(b.Orbit.Radius > maxNonGate) {
			t.Errorf("gate %s radius = %v, want strictly greater than the max non-gate star-frame distance %v", gid, b.Orbit.Radius, maxNonGate)
		}
	}
}

// Scenario: Every gate in one system shares the identical radius.
func TestBodyTable_Scenario_EveryGateSharesIdenticalRadius(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc := buildBTService(interior, feats, twoLaneGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	ids := interiorFeatureIdSet(feats)
	gates := gateIds(table, ids)
	if len(gates) < 2 {
		t.Fatalf("fixture: need at least 2 gates, got %d", len(gates))
	}
	first, _ := table.Body(gates[0])
	for _, gid := range gates[1:] {
		b, _ := table.Body(gid)
		if b.Orbit.Radius != first.Orbit.Radius {
			t.Errorf("gate %s radius %v != gate %s radius %v", gid, b.Orbit.Radius, gates[0], first.Orbit.Radius)
		}
	}
}

// Scenario: Every gate reports the configured gate size.
func TestBodyTable_Scenario_EveryGateReportsConfiguredSize(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc := buildBTService(interior, feats, twoLaneGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	ids := interiorFeatureIdSet(feats)
	for _, gid := range gateIds(table, ids) {
		b, _ := table.Body(gid)
		if b.Size != GateSize {
			t.Errorf("gate %s size = %v, want the configured GateSize = %v", gid, b.Size, GateSize)
		}
	}
}

// --- "Lane Gates Are Derived Fresh At Every Build, Never Persisted" --------

// Scenario: A lane materialized after interior generation still yields a
// gate.
func TestBodyTable_Scenario_LaneMaterializedAfterInteriorStillYieldsGate(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	ids := interiorFeatureIdSet(feats)

	gxBefore := &stubGalaxyBT{meta: &galaxy.Galaxy{Id: "gal_bt", Seed: 1}, known: map[string]galaxy.System{
		"sys-bt": {Id: "sys-bt", Coords: galaxy.Coords{X: 0, Y: 0}},
	}}
	svcBefore := buildBTService(interior, feats, gxBefore, nil)
	tBefore, err := svcBefore.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("build before lane: %v", err)
	}
	if len(gateIds(tBefore, ids)) != 0 {
		t.Fatalf("gates present before any lane was materialized: %v", gateIds(tBefore, ids))
	}

	gxAfter := &stubGalaxyBT{meta: &galaxy.Galaxy{Id: "gal_bt", Seed: 1}, neighbors: []string{"sys-e"}, known: map[string]galaxy.System{
		"sys-bt": {Id: "sys-bt", Coords: galaxy.Coords{X: 0, Y: 0}},
		"sys-e":  {Id: "sys-e", Coords: galaxy.Coords{X: 50, Y: 0}},
	}}
	svcAfter := buildBTService(interior, feats, gxAfter, nil)
	tAfter, err := svcAfter.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("build after lane: %v", err)
	}
	if len(gateIds(tAfter, ids)) == 0 {
		t.Fatal("no gate appeared after a new lane was materialized")
	}
}

// Scenario: Gate ids never collide with any other body in the table.
func TestBodyTable_Scenario_GateIdsNeverCollide(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc := buildBTService(interior, feats, twoLaneGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	seen := map[string]int{}
	for _, id := range table.Ids() {
		seen[id]++
	}
	for id, n := range seen {
		if n > 1 {
			t.Errorf("id %s appears %d times in the table", id, n)
		}
	}
}

// Scenario: Rebuilding against the same live lane set reproduces the same
// gate ids.
func TestBodyTable_Scenario_RebuildingSameLaneSetReproducesSameGateIds(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	ids := interiorFeatureIdSet(feats)
	svc1 := buildBTService(interior, feats, twoLaneGalaxy(), nil)
	svc2 := buildBTService(interior, feats, twoLaneGalaxy(), nil)
	t1, err := svc1.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("build 1: %v", err)
	}
	t2, err := svc2.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("build 2: %v", err)
	}
	g1, g2 := gateIds(t1, ids), gateIds(t2, ids)
	if len(g1) != len(g2) {
		t.Fatalf("gate count differs across rebuilds: %d vs %d", len(g1), len(g2))
	}
	set1 := map[string]bool{}
	for _, g := range g1 {
		set1[g] = true
	}
	for _, g := range g2 {
		if !set1[g] {
			t.Errorf("gate id %s present in rebuild 2 but not rebuild 1", g)
		}
	}
}

// Scenario: An unreadable destination yields no gate, never a default
// bearing.
func TestBodyTable_Scenario_UnreadableDestinationYieldsNoGate(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	ids := interiorFeatureIdSet(feats)
	gx := &stubGalaxyBT{
		meta:      &galaxy.Galaxy{Id: "gal_bt", Seed: 1},
		neighbors: []string{"sys-ghost"}, // a lane exists, but the destination never resolves
		known: map[string]galaxy.System{
			"sys-bt": {Id: "sys-bt", Coords: galaxy.Coords{X: 0, Y: 0}},
			// "sys-ghost" deliberately absent
		},
	}
	svc := buildBTService(interior, feats, gx, nil)

	var table *BodyTable
	var err error
	logged := captureLog(t, func() {
		table, err = svc.BodyTable(context.Background(), "sys-bt")
	})
	if err != nil {
		t.Fatalf("BodyTable failed outright over one unreadable destination: %v", err)
	}
	if len(gateIds(table, ids)) != 0 {
		t.Fatalf("a gate was derived for an unreadable destination: %v", gateIds(table, ids))
	}
	if !strings.Contains(logged, "sys-bt") || !strings.Contains(logged, "sys-ghost") {
		t.Errorf("captured log does not name both the gate's own system (sys-bt) and the unreadable destination (sys-ghost): %q", logged)
	}
}

// --- "Lane-Gate Derivation Cost Is Bounded Independent of Galaxy Size" ----

// Scenario: Gate derivation reads only the system's neighbourhood.
func TestBodyTable_Scenario_GateDerivationReadsOnlyNeighbourhood(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	gx := twoLaneGalaxy()
	// Populate `known` with many unrelated systems, simulating a large
	// materialized galaxy — none of them should be requested.
	for i := 0; i < 500; i++ {
		gx.known[galaxyFillerId(i)] = galaxy.System{Id: galaxyFillerId(i), Coords: galaxy.Coords{X: float64(i), Y: float64(i)}}
	}
	svc := buildBTService(interior, feats, gx, nil)
	if _, err := svc.BodyTable(context.Background(), "sys-bt"); err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	if len(gx.getLiveSystemsArgs) != 1 {
		t.Fatalf("GetLiveSystems called %d times, want exactly 1", len(gx.getLiveSystemsArgs))
	}
	got := gx.getLiveSystemsArgs[0]
	if len(got) != len(gx.neighbors)+1 {
		t.Fatalf("GetLiveSystems requested %d ids (%v), want exactly neighbours+self = %d", len(got), got, len(gx.neighbors)+1)
	}
}

func galaxyFillerId(i int) string {
	return "sys-filler-" + string(rune('a'+i%26)) + string(rune('0'+i%10))
}

// Scenario: Gate derivation cost does not grow with galaxy size.
func TestBodyTable_Scenario_GateDerivationCostIndependentOfGalaxySize(t *testing.T) {
	interior, feats := goodBodyTableInterior()

	small := twoLaneGalaxy()
	svcSmall := buildBTService(interior, feats, small, nil)
	if _, err := svcSmall.BodyTable(context.Background(), "sys-bt"); err != nil {
		t.Fatalf("small galaxy build: %v", err)
	}

	large := twoLaneGalaxy()
	for i := 0; i < 2000; i++ {
		large.known[galaxyFillerId(i)+"-large"] = galaxy.System{Id: galaxyFillerId(i) + "-large"}
	}
	svcLarge := buildBTService(interior, feats, large, nil)
	if _, err := svcLarge.BodyTable(context.Background(), "sys-bt"); err != nil {
		t.Fatalf("large galaxy build: %v", err)
	}

	if len(small.getLiveSystemsArgs[0]) != len(large.getLiveSystemsArgs[0]) {
		t.Errorf("GetLiveSystems request size grew with galaxy size: small=%d large=%d",
			len(small.getLiveSystemsArgs[0]), len(large.getLiveSystemsArgs[0]))
	}
}

// Scenario: Gate identity and order are unaffected by galaxy size.
func TestBodyTable_Scenario_GateIdentityAndOrderUnaffectedByGalaxySize(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	ids := interiorFeatureIdSet(feats)

	small := twoLaneGalaxy()
	svcSmall := buildBTService(interior, feats, small, nil)
	tSmall, err := svcSmall.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("small galaxy build: %v", err)
	}

	large := twoLaneGalaxy()
	for i := 0; i < 200; i++ {
		large.known[galaxyFillerId(i)+"-l2"] = galaxy.System{Id: galaxyFillerId(i) + "-l2"}
	}
	svcLarge := buildBTService(interior, feats, large, nil)
	tLarge, err := svcLarge.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("large galaxy build: %v", err)
	}

	gSmall, gLarge := gateIds(tSmall, ids), gateIds(tLarge, ids)
	if len(gSmall) != len(gLarge) {
		t.Fatalf("gate count differs: small=%d large=%d", len(gSmall), len(gLarge))
	}
	setSmall := map[string]bool{}
	for _, g := range gSmall {
		setSmall[g] = true
	}
	for _, g := range gLarge {
		if !setSmall[g] {
			t.Errorf("gate id %s appears only in the large-galaxy build", g)
		}
	}
}

// --- "A Degraded Build Is Recorded Distinguishably From Genuine Absence" --

// Scenario: A station-store degradation is recorded with its system id.
func TestBodyTable_Scenario_StationDegradationRecordedWithSystemId(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	st := &stubStationBT{err: assertErr}
	svc := buildBTService(interior, feats, noLanesGalaxy(), st)

	logged := captureLog(t, func() {
		if _, err := svc.BodyTable(context.Background(), "sys-bt"); err != nil {
			t.Fatalf("BodyTable: %v", err)
		}
	})
	if !strings.Contains(logged, "sys-bt") {
		t.Errorf("degradation record does not name the system id: %q", logged)
	}
	if !strings.Contains(strings.ToLower(logged), "station") {
		t.Errorf("degradation record does not identify the station as the omitted source: %q", logged)
	}
}

// Scenario: A lane-set degradation is recorded with its system id.
func TestBodyTable_Scenario_LaneSetDegradationRecordedWithSystemId(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	gx := &stubGalaxyBT{meta: &galaxy.Galaxy{Id: "gal_bt", Seed: 1}, neighbors: []string{"sys-e"}, systemsErr: assertErr, known: map[string]galaxy.System{}}
	svc := buildBTService(interior, feats, gx, nil)

	logged := captureLog(t, func() {
		if _, err := svc.BodyTable(context.Background(), "sys-bt"); err != nil {
			t.Fatalf("BodyTable: %v", err)
		}
	})
	if !strings.Contains(logged, "sys-bt") {
		t.Errorf("degradation record does not name the system id: %q", logged)
	}
	if !strings.Contains(strings.ToLower(logged), "lane") && !strings.Contains(strings.ToLower(logged), "gate") {
		t.Errorf("degradation record does not identify lane gates as the omitted source: %q", logged)
	}
}

// Scenario: A genuinely gate-less system produces no degradation record.
func TestBodyTable_Scenario_GenuinelyGatelessSystemProducesNoDegradationRecord(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	gx := noLanesGalaxy() // NeighborsOf returns (nil, nil) — a real, successful, empty read
	svc := buildBTService(interior, feats, gx, nil)

	logged := captureLog(t, func() {
		if _, err := svc.BodyTable(context.Background(), "sys-bt"); err != nil {
			t.Fatalf("BodyTable: %v", err)
		}
	})
	if strings.Contains(strings.ToLower(logged), "degrad") || strings.Contains(strings.ToLower(logged), "unavailable") {
		t.Errorf("a genuinely lane-less system produced what looks like a degradation record: %q", logged)
	}
}

// Scenario: A lane-set read failure is whole-system, not per-lane.
func TestBodyTable_Scenario_LaneSetFailureIsWholeSystemNotPerLane(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	ids := interiorFeatureIdSet(feats)
	gx := &stubGalaxyBT{
		meta:       &galaxy.Galaxy{Id: "gal_bt", Seed: 1},
		neighbors:  []string{"sys-e", "sys-n"}, // more than one lane
		systemsErr: assertErr,
		known:      map[string]galaxy.System{"sys-bt": {}, "sys-e": {}, "sys-n": {}},
	}
	svc := buildBTService(interior, feats, gx, nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	if got := gateIds(table, ids); len(got) != 0 {
		t.Fatalf("a lane-set read failure left %d gate(s) present, want zero (whole-system omission): %v", len(got), got)
	}
}
