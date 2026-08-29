package system

// RED-phase tests for openspec change add-orbital-system-bodies —
// system-interior's decode/fail-closed/cascade requirements:
//   - "An Interior Predating This Capability Fails Closed, Never Silently"
//     (the non-star-feature-no-SpaceDoc-key scenario; the extent scenario is
//     covered in gate_body_test.go / bodies_test.go, since it is a
//     gate-derivation / BodyTable-build failure, not a readInterior one)
//   - "Interior Feature Decode Validates Its Orbital Element Set, Omitting
//     Rather Than Failing"
//   - "A Feature Omission Cascades to a Fixpoint Through the Parent Chain"
//
// Follows the exact MockDao + captureLog pattern already established by
// interior_decode_guard_test.go (the sibling, already-shipped ring-validation
// guard) for continuity of convention.
//
// SDET-CHOSEN CONTRACT: the decode step (space.DecodeOrbit over each
// feature's stored SpaceDoc) is assumed to run inside the SAME readInterior
// loop the ring guard already runs in (design.md: "exactly as readInterior's
// existing featureRingOK guard does"), populating Feature.Space on survivors;
// the parent-chain FIXPOINT CASCADE is assumed to run in GetOrCreateInterior
// AFTER spliceStation (tasks.md 4.9 states this explicitly: "run AFTER
// spliceStation... the station is a candidate body in the cascade"). Both are
// exercised here through the same public entry point
// (Service.GetOrCreateInterior) the existing sibling test uses — a
// differently-internally-shaped implementation is a mechanical detail, not a
// behavior dispute, as long as GetOrCreateInterior's observable output
// matches.

import (
	"context"
	"strings"
	"testing"

	"hexaverse/board"
	"hexaverse/galaxy"
	"hexaverse/space"
)

func extentOK() SystemInterior {
	return SystemInterior{SystemId: "sys-decode", Radius: 16, Extent: ContinuousRadius(16)}
}

func validSpaceDoc(parentId string, radius float64) map[string]any {
	o := space.Orbit{ParentId: parentId, Radius: radius, PeriodMs: 100_000, Phase: 0, Inclination: 0, Node: 0}
	return space.EncodeOrbit(o)
}

// --- "An Interior Predating This Capability Fails Closed..." --------------

// Scenario: A non-star feature with no orbital element set at all fails,
// never reads as parentless.
func TestReadInterior_Scenario_NoSpaceDocAtAllIsTreatedAsDecodeFailure(t *testing.T) {
	feats := []Feature{
		{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
		{Id: "feat-body-0", Type: FeatureRocky, Footprint: []board.Cell{{Ring: 3, Slot: 0}},
			Orbit: &Orbit{Ring: 3, Dir: 1}, SpaceDoc: nil /* no SpaceDoc key at all */},
		{Id: "feat-body-1", Type: FeatureRocky, Footprint: []board.Cell{{Ring: 5, Slot: 0}},
			Orbit: &Orbit{Ring: 5, Dir: 1}, SpaceDoc: validSpaceDoc("feat-star", ContinuousRadius(5))},
	}
	interior := extentOK()

	dao := newFakeDao(t, interior, feats)
	svc := NewServiceWith(dao, &fakeGalaxyDecode{meta: &galaxy.Galaxy{Id: "gal_1", Seed: 42}}, testClock())

	var gen *GeneratedInterior
	var err error
	logged := captureLog(t, func() {
		gen, err = svc.GetOrCreateInterior(context.Background(), "sys-decode")
	})
	if err != nil {
		t.Fatalf("GetOrCreateInterior: %v", err)
	}
	byId := map[string]bool{}
	for _, f := range gen.Features {
		byId[f.Id] = true
		if f.Id == "feat-body-0" {
			t.Fatalf("feature with no SpaceDoc key survived as a (spuriously parentless) body")
		}
	}
	if !byId["feat-body-1"] {
		t.Fatal("the unrelated good feature was dropped alongside the bad one")
	}
	if !strings.Contains(logged, "feat-body-0") {
		t.Errorf("captured log does not mention the offending feature id: %q", logged)
	}
}

// --- "Interior Feature Decode Validates..." --------------------------------

// Scenario: A feature with a malformed orbital element set is omitted, not
// fatal.
func TestReadInterior_Scenario_MalformedSpaceDocIsOmittedNotFatal(t *testing.T) {
	malformed := map[string]any{
		// "radius" key deliberately absent — a missing key, per Decision 12's
		// named failure mode.
		"parentId": "feat-star", "periodMs": int64(1000),
		"phase": int64(0), "inclination": int64(0), "node": int64(0),
	}
	feats := []Feature{
		{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
		{Id: "feat-body-bad", Type: FeatureRocky, Footprint: []board.Cell{{Ring: 3, Slot: 0}},
			Orbit: &Orbit{Ring: 3, Dir: 1}, SpaceDoc: malformed},
		{Id: "feat-body-good", Type: FeatureRocky, Footprint: []board.Cell{{Ring: 5, Slot: 0}},
			Orbit: &Orbit{Ring: 5, Dir: 1}, SpaceDoc: validSpaceDoc("feat-star", ContinuousRadius(5))},
	}
	interior := extentOK()
	dao := newFakeDao(t, interior, feats)
	svc := NewServiceWith(dao, &fakeGalaxyDecode{meta: &galaxy.Galaxy{Id: "gal_1", Seed: 42}}, testClock())

	var gen *GeneratedInterior
	var err error
	logged := captureLog(t, func() {
		gen, err = svc.GetOrCreateInterior(context.Background(), "sys-decode")
	})
	if err != nil {
		t.Fatalf("read failed outright, want the malformed feature merely omitted: %v", err)
	}
	var sawBad, sawGood, sawStar bool
	for _, f := range gen.Features {
		switch f.Id {
		case "feat-body-bad":
			sawBad = true
		case "feat-body-good":
			sawGood = true
		case "feat-star":
			sawStar = true
		}
	}
	if sawBad {
		t.Error("the malformed feature was not omitted")
	}
	if !sawGood || !sawStar {
		t.Error("a good feature was dropped alongside the malformed one")
	}
	if !strings.Contains(logged, "feat-body-bad") {
		t.Errorf("captured log does not mention the offending feature id: %q", logged)
	}
}

// --- "A Feature Omission Cascades to a Fixpoint..." ------------------------

// Scenario: Omitting a gas giant also omits its moons, recorded with both
// the moon's own id and the gas giant's id.
func TestGetOrCreateInterior_Scenario_OmittingGasGiantAlsoOmitsMoons(t *testing.T) {
	malformedGiant := map[string]any{"parentId": "feat-star", "periodMs": int64(1000)} // missing radius
	feats := []Feature{
		{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
		{Id: "feat-body-0", Type: FeatureGasGiant, Footprint: []board.Cell{{Ring: 7, Slot: 0}},
			Orbit: &Orbit{Ring: 7, Dir: 1}, SpaceDoc: malformedGiant},
		{Id: "feat-moon-0", Type: FeatureMoon, ParentId: "feat-body-0",
			Footprint: []board.Cell{{Ring: 0, Slot: 0}},
			SpaceDoc:  validSpaceDoc("feat-body-0", 10)},
		{Id: "feat-moon-1", Type: FeatureMoon, ParentId: "feat-body-0",
			Footprint: []board.Cell{{Ring: 0, Slot: 0}},
			SpaceDoc:  validSpaceDoc("feat-body-0", 15)},
		{Id: "feat-body-1", Type: FeatureRocky, Footprint: []board.Cell{{Ring: 3, Slot: 0}},
			Orbit: &Orbit{Ring: 3, Dir: 1}, SpaceDoc: validSpaceDoc("feat-star", ContinuousRadius(3))},
	}
	interior := extentOK()
	dao := newFakeDao(t, interior, feats)
	svc := NewServiceWith(dao, &fakeGalaxyDecode{meta: &galaxy.Galaxy{Id: "gal_1", Seed: 42}}, testClock())

	var gen *GeneratedInterior
	var err error
	logged := captureLog(t, func() {
		gen, err = svc.GetOrCreateInterior(context.Background(), "sys-decode")
	})
	if err != nil {
		t.Fatalf("GetOrCreateInterior: %v", err)
	}
	present := map[string]bool{}
	for _, f := range gen.Features {
		present[f.Id] = true
	}
	if present["feat-body-0"] || present["feat-moon-0"] || present["feat-moon-1"] {
		t.Fatalf("gas giant or its moons survived the cascade: %+v", present)
	}
	if !present["feat-star"] || !present["feat-body-1"] {
		t.Fatalf("unrelated good features were dropped alongside the cascade: %+v", present)
	}
	// The cascade record for each moon must name BOTH the moon's own id and
	// the gas giant's id — distinguishable from a direct decode failure
	// (which names only the offending feature's own id).
	for _, moonId := range []string{"feat-moon-0", "feat-moon-1"} {
		if !strings.Contains(logged, moonId) {
			t.Errorf("captured log does not mention cascaded moon id %q: %q", moonId, logged)
		}
	}
	if !strings.Contains(logged, "feat-body-0") {
		t.Errorf("captured log does not mention the ancestor (gas giant) id feat-body-0: %q", logged)
	}
}

// Scenario: Omitting a station's parent skeleton body also omits the
// station.
func TestGetOrCreateInterior_Scenario_OmittingStationParentAlsoOmitsStation(t *testing.T) {
	malformedParent := map[string]any{"parentId": "feat-star"} // missing radius AND periodMs
	feats := []Feature{
		{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
		{Id: "feat-body-0", Type: FeatureRocky, Footprint: []board.Cell{{Ring: 3, Slot: 0}},
			Orbit: &Orbit{Ring: 3, Dir: 1}, SpaceDoc: malformedParent},
	}
	interior := extentOK()
	dao := newFakeDao(t, interior, feats)

	station := &Feature{
		Id: "feat-station", Type: FeatureStation, ParentId: "", // continuous parent is the skeleton body
		Footprint: []board.Cell{{Ring: 6, Slot: 0}},
		SpaceDoc:  validSpaceDoc("feat-body-0", 10.75),
	}
	svc := NewServiceWith(dao, &fakeGalaxyDecode{meta: &galaxy.Galaxy{Id: "gal_1", Seed: 42}}, testClock()).
		WithStations(&fakeStationSourceDecode{feat: station})

	var gen *GeneratedInterior
	var err error
	logged := captureLog(t, func() {
		gen, err = svc.GetOrCreateInterior(context.Background(), "sys-decode")
	})
	if err != nil {
		t.Fatalf("GetOrCreateInterior: %v", err)
	}
	present := map[string]bool{}
	for _, f := range gen.Features {
		present[f.Id] = true
	}
	if present["feat-station"] {
		t.Fatal("station survived after its continuous parent was omitted")
	}
	if !strings.Contains(logged, "feat-station") {
		t.Errorf("captured log does not mention the cascaded station id: %q", logged)
	}
}

// Scenario: A cyclic stored parent chain is dropped, not preserved.
func TestGetOrCreateInterior_Scenario_CyclicStoredParentChainDropped(t *testing.T) {
	feats := []Feature{
		{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
		{Id: "feat-a", Type: FeatureRocky, Footprint: []board.Cell{{Ring: 3, Slot: 0}},
			Orbit: &Orbit{Ring: 3, Dir: 1}, SpaceDoc: validSpaceDoc("feat-b", 40)},
		{Id: "feat-b", Type: FeatureRocky, Footprint: []board.Cell{{Ring: 5, Slot: 0}},
			Orbit: &Orbit{Ring: 5, Dir: 1}, SpaceDoc: validSpaceDoc("feat-a", 60)},
		{Id: "feat-c", Type: FeatureRocky, Footprint: []board.Cell{{Ring: 7, Slot: 0}},
			Orbit: &Orbit{Ring: 7, Dir: 1}, SpaceDoc: validSpaceDoc("feat-star", ContinuousRadius(7))},
	}
	interior := extentOK()
	dao := newFakeDao(t, interior, feats)
	svc := NewServiceWith(dao, &fakeGalaxyDecode{meta: &galaxy.Galaxy{Id: "gal_1", Seed: 42}}, testClock())

	gen, err := svc.GetOrCreateInterior(context.Background(), "sys-decode")
	if err != nil {
		t.Fatalf("GetOrCreateInterior: %v", err)
	}
	present := map[string]bool{}
	for _, f := range gen.Features {
		present[f.Id] = true
	}
	if present["feat-a"] || present["feat-b"] {
		t.Fatalf("the mutually-cyclic pair survived the cascade: %+v", present)
	}
	if !present["feat-star"] || !present["feat-c"] {
		t.Fatalf("unrelated good features were dropped alongside the cyclic pair: %+v", present)
	}
	// The remaining invariant: every survivor resolves through space.Position.
	bodies := toBodies(*gen)
	for _, f := range gen.Features {
		if _, err := space.Position(bodies, f.Id, 0); err != nil {
			t.Errorf("surviving feature %s failed to resolve after the cascade: %v", f.Id, err)
		}
	}
}

// Scenario: A dropped belt feature mints no members (the fixpoint half; the
// derivation-order half is exercised at the BodyTable level in
// bodies_test.go).
func TestGetOrCreateInterior_Scenario_DroppedBeltCascadesOutOfTheRead(t *testing.T) {
	malformedBelt := map[string]any{"parentId": "feat-star"} // missing radius
	feats := []Feature{
		{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
		{Id: "feat-belt-0", Type: FeatureBelt, Footprint: []board.Cell{{Ring: 4, Slot: 0}},
			Orbit: &Orbit{Ring: 4, Dir: 1}, SpaceDoc: malformedBelt, Width: 5},
	}
	interior := extentOK()
	dao := newFakeDao(t, interior, feats)
	svc := NewServiceWith(dao, &fakeGalaxyDecode{meta: &galaxy.Galaxy{Id: "gal_1", Seed: 42}}, testClock())

	gen, err := svc.GetOrCreateInterior(context.Background(), "sys-decode")
	if err != nil {
		t.Fatalf("GetOrCreateInterior: %v", err)
	}
	for _, f := range gen.Features {
		if f.Id == "feat-belt-0" {
			t.Fatal("malformed belt feature survived the read")
		}
	}
	// No member ids of the form feat-belt-0#k can appear anywhere downstream
	// since the belt itself never survives to be a synthesis input — this is
	// asserted at the BodyTable composition level (bodies_test.go), which is
	// the actual point member synthesis happens (design.md Decision 5/9).
}

// Scenario (general invariant + SDET-added depth-bound boundary probe): every
// surviving body in a read resolves through space.Position with no error —
// including a hand-built, non-cyclic 5-node chain (star + 4 chained
// parents) that exceeds space's resolution depth bound (maxBodyDepth=4,
// which fails at depth>=4: resolving the 4th chained parent requires a
// depth-4 recursive call). This chain is impossible for the real generator
// to produce (chain depth here tops out at 3: station/moon -> body -> star),
// so it is hand-built rather than swept.
func TestGetOrCreateInterior_Scenario_HandBuiltOverDeepChainDroppedByCascade(t *testing.T) {
	feats := []Feature{
		{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
		{Id: "feat-p1", Footprint: []board.Cell{{Ring: 0, Slot: 0}}, SpaceDoc: validSpaceDoc("feat-star", 30)},
		{Id: "feat-p2", Footprint: []board.Cell{{Ring: 0, Slot: 0}}, SpaceDoc: validSpaceDoc("feat-p1", 5)},
		{Id: "feat-p3", Footprint: []board.Cell{{Ring: 0, Slot: 0}}, SpaceDoc: validSpaceDoc("feat-p2", 5)},
		{Id: "feat-p4", Footprint: []board.Cell{{Ring: 0, Slot: 0}}, SpaceDoc: validSpaceDoc("feat-p3", 5)},
	}
	interior := extentOK()
	dao := newFakeDao(t, interior, feats)
	svc := NewServiceWith(dao, &fakeGalaxyDecode{meta: &galaxy.Galaxy{Id: "gal_1", Seed: 42}}, testClock())

	gen, err := svc.GetOrCreateInterior(context.Background(), "sys-decode")
	if err != nil {
		t.Fatalf("GetOrCreateInterior: %v", err)
	}
	present := map[string]bool{}
	for _, f := range gen.Features {
		present[f.Id] = true
	}
	if present["feat-p4"] {
		t.Fatal("the over-deep chain's tail (feat-p4, whose resolution would require depth 4) survived the cascade")
	}
	if !present["feat-p1"] || !present["feat-p2"] || !present["feat-p3"] {
		t.Fatalf("a within-bound ancestor was dropped alongside the over-deep tail: %+v", present)
	}
	bodies := toBodies(*gen)
	for _, f := range gen.Features {
		if _, err := space.Position(bodies, f.Id, 0); err != nil {
			t.Errorf("surviving feature %s failed to resolve after the cascade: %v", f.Id, err)
		}
	}
}

// --- shared fakes for this file --------------------------------------------

// newFakeDao returns a MockDao pre-programmed with one interior + feature
// set, standing in for the Firestore round trip in these decode-focused
// tests (which are about the SERVICE's decode/cascade logic, not
// persistence itself — persistence round-trips are covered separately).
func newFakeDao(t *testing.T, interior SystemInterior, feats []Feature) Dao {
	t.Helper()
	return &stubDao{interior: interior, feats: feats}
}

// stubDao is a hand-rolled Dao (rather than gomock) so this file can be read
// without cross-referencing generated mock code — every method's behavior is
// visible right here.
type stubDao struct {
	interior SystemInterior
	feats    []Feature
}

func (d *stubDao) GetInterior(context.Context, string, string) (*SystemInterior, error) {
	i := d.interior
	return &i, nil
}
func (d *stubDao) ListFeatures(context.Context, string, string) ([]Feature, error) {
	return d.feats, nil
}
func (d *stubDao) CreateInterior(context.Context, string, GeneratedInterior) error {
	// The fast path (GetInterior returns non-nil) never calls this; present
	// only to satisfy the Dao interface.
	return nil
}

// fakeGalaxyDecode is a minimal galaxy.ServiceInterface stub for this file's
// tests — only LiveGalaxyMeta is exercised (the fast read path).
type fakeGalaxyDecode struct{ meta *galaxy.Galaxy }

func (f *fakeGalaxyDecode) Seed(context.Context, int64, galaxy.GenerationParams) (*galaxy.Galaxy, error) {
	return nil, nil
}
func (f *fakeGalaxyDecode) GetLive(context.Context) (*galaxy.GeneratedGalaxy, error) { return nil, nil }
func (f *fakeGalaxyDecode) GetLiveSystem(context.Context, string) (*galaxy.System, error) {
	return nil, nil
}
func (f *fakeGalaxyDecode) LiveGalaxyMeta(context.Context) (*galaxy.Galaxy, error) {
	return f.meta, nil
}
func (f *fakeGalaxyDecode) EnsureLaneHorizon(context.Context, string) error { return nil }
func (f *fakeGalaxyDecode) LaneHorizonBlocks(context.Context, []string) ([]galaxy.Block, error) {
	return nil, nil
}
func (f *fakeGalaxyDecode) EnsureBlocks(context.Context, ...galaxy.Block) error { return nil }
func (f *fakeGalaxyDecode) NeighborsOf(context.Context, string) ([]string, error) {
	return nil, nil
}
func (f *fakeGalaxyDecode) NeighborsOfMany(context.Context, []string) (map[string][]string, error) {
	return nil, nil
}
func (f *fakeGalaxyDecode) GetLiveSystems(context.Context, []string) ([]galaxy.System, error) {
	return nil, nil
}

// fakeStationSourceDecode stands in for the station store in this file's
// cascade test.
type fakeStationSourceDecode struct{ feat *Feature }

func (f *fakeStationSourceDecode) StationFeature(context.Context, string) (*Feature, error) {
	return f.feat, nil
}
