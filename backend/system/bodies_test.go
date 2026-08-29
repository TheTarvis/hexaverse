package system

// RED-phase tests for openspec change add-orbital-system-bodies —
// system-body-table spec: table composition, identity, enumeration order,
// star handling, size invariant, degradation, and the unfiltered-seam rule.
// Gate-specific requirements live in gate_body_test.go (same package,
// sharing this file's fakes/fixtures).
//
// Every symbol referenced here (BodyTable, Body, StarId, StarSize, Extent,
// Ids, Service.BodyTable) is pinned VERBATIM by design.md Decision 9 — no
// SDET-chosen contract needed for the type itself.

import (
	"context"
	"strings"
	"sync"
	"testing"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
)

// --- shared fakes / fixtures ------------------------------------------------

// stubGalaxyBT is a configurable galaxy.ServiceInterface for BodyTable's
// gate-derivation dependency (Decision 8's bounded neighbourhood read):
// NeighborsOf + GetLiveSystems(append(neighbours, systemID)).
type stubGalaxyBT struct {
	meta *galaxy.Galaxy

	// GetLiveSystem/skeleton lookup, for the materialize-on-first-read path.
	system *galaxy.System
	sysErr error

	neighbors    []string
	neighborsErr error

	// known holds every system (including the BodyTable's own system) this
	// fake can resolve through GetLiveSystems. An id absent from this map is
	// "not present among the materialized systems" (the unreadable-
	// destination degenerate case).
	known      map[string]galaxy.System
	systemsErr error

	// getLiveSystemsCalls / neighborsOfCalls count invocations, for the
	// cost-bounded-independent-of-galaxy-size scenarios.
	mu                 sync.Mutex
	getLiveSystemsArgs [][]string
}

func (f *stubGalaxyBT) Seed(context.Context, int64, galaxy.GenerationParams) (*galaxy.Galaxy, error) {
	return nil, nil
}
func (f *stubGalaxyBT) GetLive(context.Context) (*galaxy.GeneratedGalaxy, error) { return nil, nil }
func (f *stubGalaxyBT) GetLiveSystem(context.Context, string) (*galaxy.System, error) {
	return f.system, f.sysErr
}
func (f *stubGalaxyBT) LiveGalaxyMeta(context.Context) (*galaxy.Galaxy, error) { return f.meta, nil }
func (f *stubGalaxyBT) EnsureLaneHorizon(context.Context, string) error        { return nil }
func (f *stubGalaxyBT) LaneHorizonBlocks(context.Context, []string) ([]galaxy.Block, error) {
	return nil, nil
}
func (f *stubGalaxyBT) EnsureBlocks(context.Context, ...galaxy.Block) error { return nil }
func (f *stubGalaxyBT) NeighborsOf(context.Context, string) ([]string, error) {
	return f.neighbors, f.neighborsErr
}
func (f *stubGalaxyBT) NeighborsOfMany(context.Context, []string) (map[string][]string, error) {
	return nil, nil
}
func (f *stubGalaxyBT) GetLiveSystems(_ context.Context, ids []string) ([]galaxy.System, error) {
	f.mu.Lock()
	f.getLiveSystemsArgs = append(f.getLiveSystemsArgs, append([]string{}, ids...))
	f.mu.Unlock()
	if f.systemsErr != nil {
		return nil, f.systemsErr
	}
	var out []galaxy.System
	for _, id := range ids {
		if s, ok := f.known[id]; ok {
			out = append(out, s)
		}
	}
	return out, nil
}

// stubStationBT is a configurable StationSource.
type stubStationBT struct {
	feat *Feature
	err  error
}

func (s *stubStationBT) StationFeature(context.Context, string) (*Feature, error) {
	return s.feat, s.err
}

// goodBodyTableInterior is a hand-built, fully-decodable interior: a star, a
// gas giant with one moon, and a belt — small enough to reason about by
// hand, large enough to exercise every family BodyTable composes.
//
// IMPORTANT: features sourced through stubDao (standing in for a real
// Firestore-backed Dao) carry their orbital elements as SpaceDoc — the
// persisted, pre-decode form — never as a pre-populated Space pointer.
// Space is `firestore:"-"`, so a genuine store read can never arrive with it
// already set; only the SERVICE's own decode step (space.DecodeOrbit over
// SpaceDoc) may populate it. This is deliberate and load-bearing: a fixture
// that set Space directly would silently bypass the very decode/validate
// logic these tests exist to exercise. (The trading-station's spliced
// feature is the one legitimate exception — see stubStationBT below — its
// continuous orbit is recomputed fresh on every splice, never persisted.)
func goodBodyTableInterior() (SystemInterior, []Feature) {
	interior := SystemInterior{SystemId: "sys-bt", Radius: 16, Extent: ContinuousRadius(16), StarClass: "G"}
	giantRadius := ContinuousRadius(7)
	beltRadius := ContinuousRadius(4)
	feats := []Feature{
		{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}, Size: StarSize("G")},
		{Id: "feat-body-0", Type: FeatureGasGiant, Footprint: []board.Cell{{Ring: 7, Slot: 0}},
			Orbit: &Orbit{Ring: 7, Dir: 1}, Size: 4.0,
			SpaceDoc: space.EncodeOrbit(space.Orbit{ParentId: "feat-star", Radius: giantRadius, PeriodMs: 400_000})},
		{Id: "feat-moon-0", Type: FeatureMoon, ParentId: "feat-body-0", Footprint: []board.Cell{{Ring: 0, Slot: 0}}, Size: 0.7,
			SpaceDoc: space.EncodeOrbit(space.Orbit{ParentId: "feat-body-0", Radius: 15.0, PeriodMs: space.InsertionPeriod(15.0)})},
		{Id: "feat-belt-0", Type: FeatureBelt, Footprint: []board.Cell{{Ring: 4, Slot: 0}, {Ring: 4, Slot: 1}},
			Orbit: &Orbit{Ring: 4, Dir: 1}, Size: 0.9, Width: BeltWidthFraction * beltRadius,
			SpaceDoc: space.EncodeOrbit(space.Orbit{ParentId: "feat-star", Radius: beltRadius, PeriodMs: 200_000})},
	}
	return interior, feats
}

// buildBTService assembles a Service wired to a stubDao (pre-populated with
// the given interior+features), a stubGalaxyBT, and an optional station
// source, for BodyTable tests.
func buildBTService(interior SystemInterior, feats []Feature, gx *stubGalaxyBT, st *stubStationBT) *Service {
	dao := &stubDao{interior: interior, feats: feats}
	svc := NewServiceWith(dao, gx, testClock())
	if st != nil {
		svc = svc.WithStations(st)
	}
	return svc
}

// noLanesGalaxy is the shared default for tests that don't care about gate
// derivation at all: no neighbors, no error.
func noLanesGalaxy() *stubGalaxyBT {
	return &stubGalaxyBT{meta: &galaxy.Galaxy{Id: "gal_bt", Seed: 7}, known: map[string]galaxy.System{}}
}

// --- "One Table Resolves Every Body In a System..." ------------------------

// Scenario: An unknown id resolves to absence, not an error.
func TestBodyTable_Scenario_UnknownIdResolvesToAbsence(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	b, ok := table.Body("feat-does-not-exist")
	if ok {
		t.Fatalf("unknown id resolved to a body: %+v", b)
	}
	if b != (space.Body{}) {
		t.Errorf("unknown id's returned body is not the zero value: %+v", b)
	}
}

// Scenario: No two bodies in one table share an id.
func TestBodyTable_Scenario_NoTwoBodiesShareAnId(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	seen := map[string]bool{}
	for _, id := range table.Ids() {
		if seen[id] {
			t.Errorf("duplicate id in table: %s", id)
		}
		seen[id] = true
	}
}

// Scenario: A built table's queries perform no storage read.
func TestBodyTable_Scenario_QueriesPerformNoStorageReadAfterBuild(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	dao := &stubDao{interior: interior, feats: feats}
	gx := noLanesGalaxy()
	svc := NewServiceWith(dao, gx, testClock())
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	// "Every store it was built from has become unavailable": poison the dao
	// and the galaxy fake so a further store read would panic/error, then
	// query the already-built table.
	dao.feats = nil
	dao.interior = SystemInterior{}
	gx.systemsErr = context.Canceled
	gx.neighborsErr = context.Canceled

	if _, ok := table.Body("feat-star"); !ok {
		t.Fatal("query against an already-built table failed after its sources became unavailable")
	}
	for _, id := range table.Ids() {
		if _, ok := table.Body(id); !ok {
			t.Errorf("Ids() reported %s but Body() cannot resolve it post-poisoning", id)
		}
	}
}

// Scenario: A shared id string resolves to this table's own body.
func TestBodyTable_Scenario_SharedIdResolvesToOwnTablesBody(t *testing.T) {
	interiorA, featsA := goodBodyTableInterior()
	interiorA.SystemId = "sys-a"
	interiorB, featsB := goodBodyTableInterior()
	interiorB.SystemId = "sys-b"
	// Give the gas giant in system B a different size, so a resolved body
	// value distinguishes which table answered.
	for i := range featsB {
		if featsB[i].Id == "feat-body-0" {
			featsB[i].Size = 999
		}
	}

	svcA := buildBTService(interiorA, featsA, noLanesGalaxy(), nil)
	svcB := buildBTService(interiorB, featsB, noLanesGalaxy(), nil)

	tableA, err := svcA.BodyTable(context.Background(), "sys-a")
	if err != nil {
		t.Fatalf("BodyTable A: %v", err)
	}
	tableB, err := svcB.BodyTable(context.Background(), "sys-b")
	if err != nil {
		t.Fatalf("BodyTable B: %v", err)
	}
	bodyA, _ := tableA.Body("feat-body-0")
	bodyB, _ := tableB.Body("feat-body-0")
	if bodyA.Size == bodyB.Size {
		t.Fatalf("both tables resolved feat-body-0 to the same size (%v) — no cross-system leakage should still distinguish them", bodyA.Size)
	}
	if bodyB.Size != 999 {
		t.Errorf("system B's table resolved feat-body-0 to size %v, want 999 (its own body)", bodyB.Size)
	}
}

// Scenario: Building a table for an unmaterialized system materializes it.
func TestBodyTable_Scenario_BuildingForUnmaterializedSystemMaterializesIt(t *testing.T) {
	dao := &stubDaoMaterialize{}
	gx := &stubGalaxyBT{
		meta:   &galaxy.Galaxy{Id: "gal_bt", Seed: 55},
		system: &galaxy.System{Id: "sys-fresh", Region: galaxy.RegionNormal, Skeleton: galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 2}}}},
		known:  map[string]galaxy.System{},
	}
	svc := NewServiceWith(dao, gx, testClock())

	table, err := svc.BodyTable(context.Background(), "sys-fresh")
	if err != nil {
		t.Fatalf("BodyTable on an unmaterialized system: %v", err)
	}
	if !dao.created {
		t.Fatal("BodyTable did not materialize (CreateInterior was never called)")
	}
	if _, ok := table.Body("feat-star"); !ok {
		t.Fatal("the newly materialized system's star is not resolvable in the table")
	}
}

// stubDaoMaterialize simulates "not yet materialized" (GetInterior returns
// nil, nil) then records the CreateInterior call.
type stubDaoMaterialize struct {
	created bool
	gen     GeneratedInterior
}

func (d *stubDaoMaterialize) GetInterior(context.Context, string, string) (*SystemInterior, error) {
	if d.created {
		return &d.gen.Interior, nil
	}
	return nil, nil
}
func (d *stubDaoMaterialize) ListFeatures(context.Context, string, string) ([]Feature, error) {
	if d.created {
		return d.gen.Features, nil
	}
	return nil, nil
}
func (d *stubDaoMaterialize) CreateInterior(_ context.Context, _ string, gen GeneratedInterior) error {
	d.created = true
	d.gen = gen
	return nil
}

// Scenario: Two concurrent first builds converge on one persisted interior.
//
// Genuinely involves persistence/transaction semantics (Firestore's
// create-if-absent race), so this is an emulator-backed integration test
// per the SDET skill's level-selection rule, rather than a mock — a mock
// DAO cannot honestly arbitrate a real race. Skipped under -short via
// common.SetupFirestoreTestDAO.
func TestBodyTable_Scenario_TwoConcurrentFirstBuildsConverge(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	dao := NewDaoWithClient(fs)
	const gid, sid = "gal_bt_race", "sys-race"
	defer common.CleanupFirestoreTestData(t, client, interiorPath(gid, sid), featuresPath(gid, sid))

	gx := &stubGalaxyBT{
		meta:   &galaxy.Galaxy{Id: gid, Seed: 99},
		system: &galaxy.System{Id: sid, Region: galaxy.RegionNormal, Skeleton: galaxy.Skeleton{StarClass: "K", Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 1}}}},
		known:  map[string]galaxy.System{},
	}
	svc := NewServiceWith(dao, gx, testClock())

	var wg sync.WaitGroup
	tables := make([]*BodyTable, 2)
	errs := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			tables[i], errs[i] = svc.BodyTable(ctx, sid)
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("build %d failed: %v", i, err)
		}
	}
	idsA, idsB := tables[0].Ids(), tables[1].Ids()
	if len(idsA) != len(idsB) {
		t.Fatalf("the two concurrent builds resolved different body counts: %d vs %d", len(idsA), len(idsB))
	}
	setA := map[string]bool{}
	for _, id := range idsA {
		setA[id] = true
	}
	for _, id := range idsB {
		if !setA[id] {
			t.Errorf("id %s present in build B's table but not build A's — the two builds diverged", id)
		}
	}
}

// --- "Body Identity Is System-Scoped, Not Galaxy-Unique" -------------------

// Scenario: Two systems may mint the same local body id independently.
// (Same evidence as the shared-id scenario above; restated per its own
// requirement for traceability.)
func TestBodyTable_Scenario_TwoSystemsMintSameLocalIdIndependently(t *testing.T) {
	TestBodyTable_Scenario_SharedIdResolvesToOwnTablesBody(t)
}

// --- "The Table Enumerates Every Body It Resolves, In a Deterministic
// Order" -----------------------------------------------------------------

// Scenario: The enumeration matches the resolvable set exactly.
func TestBodyTable_Scenario_EnumerationMatchesResolvableSetExactly(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	for _, id := range table.Ids() {
		if _, ok := table.Body(id); !ok {
			t.Errorf("Ids() reports %s but Body() does not resolve it", id)
		}
	}
	// Every INTERIOR feature must appear in Ids() (belt members/gates are
	// additional, not a replacement).
	for _, f := range feats {
		found := false
		for _, id := range table.Ids() {
			if id == f.Id {
				found = true
			}
		}
		if !found {
			t.Errorf("interior feature %s does not appear in Ids()", f.Id)
		}
	}
}

// Scenario: Two builds of the same system enumerate in the identical order.
func TestBodyTable_Scenario_TwoBuildsEnumerateIdenticalOrder(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc1 := buildBTService(interior, feats, noLanesGalaxy(), nil)
	svc2 := buildBTService(interior, feats, noLanesGalaxy(), nil)
	t1, err := svc1.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("build 1: %v", err)
	}
	t2, err := svc2.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("build 2: %v", err)
	}
	ids1, ids2 := t1.Ids(), t2.Ids()
	if len(ids1) != len(ids2) {
		t.Fatalf("different enumeration lengths: %d vs %d", len(ids1), len(ids2))
	}
	for i := range ids1 {
		if ids1[i] != ids2[i] {
			t.Fatalf("enumeration order differs at index %d: %s vs %s", i, ids1[i], ids2[i])
		}
	}
}

// --- "The Star Is the Table's Only Parentless Body" -------------------------

// Scenario: Only the star has no parent.
func TestBodyTable_Scenario_OnlyStarHasNoParent(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	for _, id := range table.Ids() {
		b, _ := table.Body(id)
		if b.Orbit == nil && id != table.StarId() {
			t.Errorf("body %s has no orbit (parentless) but is not the star (%s)", id, table.StarId())
		}
	}
}

// Scenario: The table reports the star's id and size.
func TestBodyTable_Scenario_ReportsStarIdAndSize(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	if table.StarId() != "feat-star" {
		t.Errorf("StarId() = %q, want feat-star", table.StarId())
	}
	if table.StarSize() != StarSize("G") {
		t.Errorf("StarSize() = %v, want %v", table.StarSize(), StarSize("G"))
	}
}

// --- "The Table Degrades to Fewer Bodies Rather Than a Failed Build" ------

// Scenario: A station-store outage omits only the station.
func TestBodyTable_Scenario_StationStoreOutageOmitsOnlyStation(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	st := &stubStationBT{err: assertErr}
	svc := buildBTService(interior, feats, noLanesGalaxy(), st)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable failed on a station-store outage, want it to degrade: %v", err)
	}
	if _, ok := table.Body("feat-star"); !ok {
		t.Error("star omitted alongside the station outage")
	}
	if _, ok := table.Body("feat-body-0"); !ok {
		t.Error("gas giant omitted alongside the station outage")
	}
}

// Scenario: A lane-set read failure omits only lane gates.
func TestBodyTable_Scenario_LaneSetReadFailureOmitsOnlyGates(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	gx := &stubGalaxyBT{meta: &galaxy.Galaxy{Id: "gal_bt", Seed: 1}, neighbors: []string{"sys-nb"}, systemsErr: assertErr, known: map[string]galaxy.System{}}
	svc := buildBTService(interior, feats, gx, nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable failed on a lane-set read failure, want it to degrade: %v", err)
	}
	if _, ok := table.Body("feat-star"); !ok {
		t.Error("star omitted alongside the lane-set failure")
	}
	for _, id := range table.Ids() {
		if isGateId(id) {
			t.Errorf("a gate (%s) survived a lane-set read failure", id)
		}
	}
}

// isGateId is a loose heuristic for this test file's own assertions only
// (production gate ids are not otherwise named by this spec beyond
// "deterministic for the live lane set"): none of goodBodyTableInterior's
// feature/member ids contain "gate", so any id containing it in these tests
// must be a derived gate.
func isGateId(id string) bool {
	for _, s := range []string{"feat-star", "feat-body-0", "feat-moon-0", "feat-belt-0"} {
		if id == s {
			return false
		}
	}
	// Belt members are "<id>#<k>".
	if len(id) > len("feat-belt-0#") && id[:len("feat-belt-0#")] == "feat-belt-0#" {
		return false
	}
	return true
}

// Scenario: An interior read failure fails the build.
func TestBodyTable_Scenario_InteriorReadFailureFailsTheBuild(t *testing.T) {
	dao := &stubDaoErr{err: assertErr}
	svc := NewServiceWith(dao, noLanesGalaxy(), testClock())
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err == nil {
		t.Fatal("BodyTable succeeded despite an interior read failure")
	}
	if table != nil {
		t.Errorf("BodyTable returned a non-nil table alongside an error: %+v", table)
	}
}

type stubDaoErr struct{ err error }

func (d *stubDaoErr) GetInterior(context.Context, string, string) (*SystemInterior, error) {
	return nil, d.err
}
func (d *stubDaoErr) ListFeatures(context.Context, string, string) ([]Feature, error) {
	return nil, d.err
}
func (d *stubDaoErr) CreateInterior(context.Context, string, GeneratedInterior) error { return d.err }

// Scenario: An interior predating this capability fails the build.
func TestBodyTable_Scenario_InteriorPredatingCapabilityFailsTheBuild(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	interior.Extent = 0 // absent/non-positive extent = predates this capability
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err == nil {
		t.Fatal("BodyTable succeeded over an interior with no stored Extent, want a named failure")
	}
	if table != nil {
		t.Errorf("BodyTable returned a non-nil (possibly partial) table: %+v", table)
	}
}

// --- "A Table Refuses to Build Without a Positively-Sized Star" -----------

// Scenario: An interior whose star carries no size fails the build.
func TestBodyTable_Scenario_StarWithNoSizeFailsTheBuild(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	for i := range feats {
		if feats[i].Type == FeatureStar {
			feats[i].Size = 0
		}
	}
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err == nil {
		t.Fatal("BodyTable succeeded over a zero-size star")
	}
	if table != nil {
		t.Error("BodyTable returned a non-nil table over a zero-size star")
	}
}

// Scenario: An interior with no star feature fails the build.
func TestBodyTable_Scenario_NoStarFeatureFailsTheBuild(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	var withoutStar []Feature
	for _, f := range feats {
		if f.Type != FeatureStar {
			withoutStar = append(withoutStar, f)
		}
	}
	svc := buildBTService(interior, withoutStar, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err == nil {
		t.Fatal("BodyTable succeeded over an interior with no star feature at all")
	}
	if table != nil {
		t.Error("BodyTable returned a non-nil table with no star feature")
	}
}

// Scenario: A built table always reports a strictly positive star size.
func TestBodyTable_Scenario_BuiltTableAlwaysReportsPositiveStarSize(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	if !(table.StarSize() > 0) {
		t.Errorf("StarSize() = %v, want strictly positive", table.StarSize())
	}
}

// --- "A Table Contains No Body With a Non-Positive Size" -------------------

// Scenario: No body in a successfully built table has a non-positive size.
func TestBodyTable_Scenario_NoBodyHasNonPositiveSize(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	st := &stubStationBT{feat: &Feature{
		Id: "feat-station", Type: FeatureStation, Size: 0.9,
		Space: &space.Orbit{ParentId: "feat-body-0", Radius: 10.75, PeriodMs: space.InsertionPeriod(10.75)},
	}}
	svc := buildBTService(interior, feats, noLanesGalaxy(), st)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	for _, id := range table.Ids() {
		b, _ := table.Body(id)
		if !(b.Size > 0) {
			t.Errorf("body %s has size %v, want strictly positive", id, b.Size)
		}
	}
}

// --- "Every Body a Built Table Contains Resolves Through space.Position" --

// Scenario: Every body in a built table resolves with no error.
func TestBodyTable_Scenario_EveryBodyResolvesWithNoError(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	st := &stubStationBT{feat: &Feature{
		Id: "feat-station", Type: FeatureStation, Size: 0.9,
		Space: &space.Orbit{ParentId: "feat-body-0", Radius: 10.75, PeriodMs: space.InsertionPeriod(10.75)},
	}}
	svc := buildBTService(interior, feats, noLanesGalaxy(), st)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	for _, id := range table.Ids() {
		if _, err := space.Position(table, id, 0); err != nil {
			t.Errorf("body %s failed to resolve through space.Position: %v", id, err)
		}
	}
}

// Scenario (system-interior): A per-feature decode failure does not fail a
// BodyTable build.
func TestBodyTable_Scenario_PerFeatureDecodeFailureDoesNotFailBuild(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	for i := range feats {
		if feats[i].Id == "feat-belt-0" {
			feats[i].SpaceDoc = map[string]any{"parentId": "feat-star"} // missing radius: malformed, not absent
		}
	}
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable failed outright on one malformed feature, want it merely omitted: %v", err)
	}
	if _, ok := table.Body("feat-belt-0"); ok {
		t.Fatal("the malformed belt feature survived into the table")
	}
	if _, ok := table.Body("feat-star"); !ok {
		t.Fatal("an unrelated good feature was dropped alongside the malformed one")
	}
}

// Scenario: A dropped belt feature mints no members (the BodyTable-level
// half — the decode-cascade half is interior_continuous_decode_test.go's
// TestGetOrCreateInterior_Scenario_DroppedBeltCascadesOutOfTheRead).
func TestBodyTable_Scenario_DroppedBeltMintsNoMembers(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	for i := range feats {
		if feats[i].Id == "feat-belt-0" {
			feats[i].SpaceDoc = nil // no SpaceDoc at all: decode failure
		}
	}
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	for _, id := range table.Ids() {
		if strings.Contains(id, "feat-belt-0#") {
			t.Errorf("a member (%s) was minted for a belt that was dropped by the decode cascade", id)
		}
	}
}

// Scenario: A cascaded omission never leaves a dangling body in the table.
func TestBodyTable_Scenario_CascadedOmissionNeverLeavesDanglingBody(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	// Corrupt the gas giant's SpaceDoc-equivalent by clearing its in-memory
	// Space (simulating what a decode failure leaves behind: no continuous
	// orbit), which must cascade to the moon that names it as parent.
	for i := range feats {
		if feats[i].Id == "feat-body-0" {
			feats[i].Space = nil
			feats[i].SpaceDoc = nil // no SpaceDoc at all — a decode failure per the fail-closed rule
		}
	}
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	if _, ok := table.Body("feat-body-0"); ok {
		t.Fatal("corrupted gas giant survived into the table")
	}
	if _, ok := table.Body("feat-moon-0"); ok {
		t.Fatal("moon of a dropped gas giant survived into the table (dangling)")
	}
	for _, id := range table.Ids() {
		if _, err := space.Position(table, id, 0); err != nil {
			t.Errorf("surviving body %s failed to resolve: %v", id, err)
		}
	}
}

// --- "The Body Table Is an Unfiltered Internal Seam, Never a Response" ----

// Scenario: The table carries bodies the requester could not see.
//
// BodyTable has no requester/fog parameter at all in its signature
// (design.md Decision 9) — it is unconditionally unfiltered by construction.
// This test demonstrates that a feature with NO resource richness/visibility
// hint (i.e. nothing marking it "observed") still resolves, since the table
// takes no such input to condition on.
func TestBodyTable_Scenario_TableCarriesBodiesRequesterCouldNotSee(t *testing.T) {
	interior, feats := goodBodyTableInterior()
	svc := buildBTService(interior, feats, noLanesGalaxy(), nil)
	table, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("BodyTable: %v", err)
	}
	// Every interior feature resolves regardless of any notion of
	// "observed" — the table's Body/Ids methods take no requester/fog
	// argument to condition on.
	for _, f := range feats {
		if _, ok := table.Body(f.Id); !ok {
			t.Errorf("feature %s did not resolve in the unfiltered table", f.Id)
		}
	}
}

// Scenario: No response field is derived from the unfiltered table.
//
// Verified by grep, per the requirement's own text ("Verify (grep) zero
// handler call sites reference BodyTable/Ids() directly"), rather than a
// runtime assertion — this is a STATIC property of the codebase.
func TestBodyTable_Scenario_NoHandlerReferencesBodyTableDirectly(t *testing.T) {
	assertNoHandlerReferences(t, "BodyTable")
	assertNoHandlerReferences(t, ".Ids()")
}
