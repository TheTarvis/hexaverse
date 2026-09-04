package system

// RED-phase tests for openspec change serve-orbital-elements-and-burn-preview,
// tasks.md 1.1 / 1.2 / 1.10 / 1.11 — the `system-interior` half of the wire
// contract: `orbitElements` on every non-star feature body and every lane-gate
// body, the star carrying none, the interior's continuous `extent`, the
// simulation clock's `scale`, and the non-regression guard over every
// pre-existing discrete-position field.
//
// WHY AT THIS LEVEL. Every scenario here is a claim about the SERIALIZED
// interior response, so each one asserts on the raw JSON object keys of a
// response produced by the real `system.Handler` over a real `system.Service`
// — never on a Go struct that would decode a missing field as a zero value,
// and never on a hand-built DTO (which would assert the struct literal the
// test itself wrote — the tautology class this chain has already shipped
// twice). The service is REAL: a stubbed Dao and a stubbed galaxy graph feed
// `GetOrCreateInterior`, `LaneGates` and `BodyTable`, so a lane gate's element
// set arrives from the body table's OWN `gateOrbit` derivation, exactly as
// tasks.md 2.3 requires, rather than from a fixture field this file set.
//
// The `-short`-safe half of the contract lives here; the same claims against a
// REAL generated system through the production router live in
// backend/orbit_elements_wire_e2e_test.go. Both are needed: this file can
// inject a warped clock (the process-wide `common.WorldClock()` singleton
// cannot be re-scaled inside one test binary), and the e2e file can prove the
// elements actually reproduce a generated body's served position.

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"

	"github.com/gin-gonic/gin"
)

// --- fixture ---------------------------------------------------------------

// stubGalaxyWire is a galaxy.ServiceInterface that answers BOTH graph reads
// the interior read path makes: `GetLive` (Service.LaneGates' whole-graph
// lane scan) and `NeighborsOf`/`GetLiveSystems` (BodyTable.addGates' bounded
// neighbourhood read). stubGalaxyBT (bodies_test.go) answers only the second —
// its GetLive returns (nil, nil), which panics LaneGates — so this file
// declares its own rather than weakening a shared one.
type stubGalaxyWire struct {
	self      galaxy.System
	neighbour galaxy.System
}

func newStubGalaxyWire() *stubGalaxyWire {
	return &stubGalaxyWire{
		self:      galaxy.System{Id: "sys-bt", Coords: galaxy.Coords{X: 0, Y: 0}},
		neighbour: galaxy.System{Id: "sys-e", Coords: galaxy.Coords{X: 100, Y: 40}},
	}
}

func (g *stubGalaxyWire) meta() *galaxy.Galaxy { return &galaxy.Galaxy{Id: "gal_wire", Seed: 11} }

func (g *stubGalaxyWire) Seed(context.Context, int64, galaxy.GenerationParams) (*galaxy.Galaxy, error) {
	return nil, nil
}
func (g *stubGalaxyWire) GetLive(context.Context) (*galaxy.GeneratedGalaxy, error) {
	return &galaxy.GeneratedGalaxy{
		Galaxy:  *g.meta(),
		Systems: []galaxy.System{g.self, g.neighbour},
		Lanes:   []galaxy.Lane{{Id: galaxy.LaneIdBetween(g.self.Id, g.neighbour.Id), AId: g.self.Id, BId: g.neighbour.Id}},
	}, nil
}
func (g *stubGalaxyWire) GetLiveSystem(context.Context, string) (*galaxy.System, error) {
	s := g.self
	return &s, nil
}
func (g *stubGalaxyWire) LiveGalaxyMeta(context.Context) (*galaxy.Galaxy, error) {
	return g.meta(), nil
}
func (g *stubGalaxyWire) EnsureLaneHorizon(context.Context, string) error { return nil }
func (g *stubGalaxyWire) LaneHorizonBlocks(context.Context, []string) ([]galaxy.Block, error) {
	return nil, nil
}
func (g *stubGalaxyWire) EnsureBlocks(context.Context, ...galaxy.Block) error { return nil }
func (g *stubGalaxyWire) NeighborsOf(context.Context, string) ([]string, error) {
	return []string{g.neighbour.Id}, nil
}
func (g *stubGalaxyWire) NeighborsOfMany(context.Context, []string) (map[string][]string, error) {
	return nil, nil
}
func (g *stubGalaxyWire) GetLiveSystems(context.Context, []string) ([]galaxy.System, error) {
	return []galaxy.System{g.self, g.neighbour}, nil
}

// scaledClock is a WorldTime whose Scale() is whatever a test asks for. The
// process-wide clock (common.WorldClock()) is a sync.Once singleton built from
// config.ServiceConfig.WorldTimeScale, so "a world whose simulation clock runs
// at a scale other than 1" is unreachable through it inside one test binary —
// the handler's own injected clock (NewHandlerWith's second parameter) is the
// only seam that can express that scenario at all.
type scaledClock struct {
	now   common.WorldMillis
	scale float64
}

func (c scaledClock) Now() common.WorldMillis               { return c.now }
func (c scaledClock) FromWall(time.Time) common.WorldMillis { return c.now }
func (c scaledClock) Scale() float64                        { return c.scale }

// wireInteriorRead serves one GET /systems/sys-bt through the real handler
// over a real Service (stub Dao + stub galaxy), with contacts/body-table
// resolution wired iff withBodyTable, and returns the decoded response with
// every feature and lane gate left as a RAW JSON object so key PRESENCE, not a
// Go zero value, is what the assertions see.
func wireInteriorRead(t *testing.T, clk common.WorldTime, withBodyTable bool) (map[string]json.RawMessage, []map[string]json.RawMessage, []map[string]json.RawMessage, *Service) {
	t.Helper()
	interior, feats := wireFixture()
	gx := newStubGalaxyWire()
	// NOT buildBTService (bodies_test.go): that helper hardcodes stubGalaxyBT,
	// whose GetLive returns nil — which nil-derefs inside Service.LaneGates.
	svc := NewServiceWith(&stubDao{interior: interior, feats: feats}, gx, clk)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user-wire")
		c.Set(common.CorpIdKey, "corp-wire")
	})
	h := NewHandlerWith(svc, clk)
	if withBodyTable {
		h = h.WithContacts(svc)
	}
	h.RegisterRoutes(r.Group("/"))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/systems/sys-bt", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("GET /systems/sys-bt: status = %d, body = %s", w.Code, w.Body.String())
	}

	var top map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &top); err != nil {
		t.Fatalf("decoding the interior response as a raw object: %v\nbody: %s", err, w.Body.String())
	}
	var feat []map[string]json.RawMessage
	if err := json.Unmarshal(top["features"], &feat); err != nil {
		t.Fatalf("decoding features: %v", err)
	}
	var gates []map[string]json.RawMessage
	if err := json.Unmarshal(top["laneGates"], &gates); err != nil {
		t.Fatalf("decoding laneGates: %v", err)
	}
	// Non-vacuity: every per-element loop below is meaningless over an empty
	// list, and the fixture's whole point is that both lists are populated.
	if len(feat) == 0 {
		t.Fatal("fixture invariant: the interior read served ZERO features — every per-feature assertion " +
			"below would pass vacuously")
	}
	if len(gates) == 0 {
		t.Fatal("fixture invariant: the interior read served ZERO lane gates — every per-gate assertion " +
			"below would pass vacuously")
	}
	return top, feat, gates, svc
}

// wireFixture is goodBodyTableInterior (bodies_test.go) with DISTINCT,
// NON-ZERO phase / inclination / node on every stored element set.
//
// That shared fixture leaves all three angles at zero, which makes a DTO that
// drops or hardcodes any of them indistinguishable from a correct one — a
// mutation zeroing `phase` passed every element assertion in this file until
// this was added, and was caught only by the e2e file's real generated bodies.
// The values are arbitrary and coprime-ish; nothing depends on their
// magnitudes, only on their being distinct and non-zero.
func wireFixture() (SystemInterior, []Feature) {
	interior, feats := goodBodyTableInterior()
	for i := range feats {
		if feats[i].SpaceDoc == nil {
			continue
		}
		o, err := space.DecodeOrbit(map[string]any(feats[i].SpaceDoc))
		if err != nil {
			panic("wireFixture: goodBodyTableInterior's stored element set does not decode: " + err.Error())
		}
		o.Phase = space.SubTurns(11_311 * (i + 1))
		o.Inclination = space.SubTurns(4_099 * (i + 2))
		o.Node = space.SubTurns(27_733 * (i + 3))
		feats[i].SpaceDoc = space.EncodeOrbit(o)
	}
	return interior, feats
}

// orbitElementsWire is the six-field element set the requirement pins by name.
// The names are NOT an SDET invention: they are space.EncodeOrbit's own
// persisted key set (space/params.go), which the requirement quotes verbatim.
type orbitElementsWire struct {
	ParentId    string  `json:"parentId"`
	Radius      float64 `json:"radius"`
	PeriodMs    int64   `json:"periodMs"`
	Phase       int64   `json:"phase"`
	Inclination int64   `json:"inclination"`
	Node        int64   `json:"node"`
}

// decodeElements pulls `orbitElements` out of one raw body object, asserting
// the key is present AND that all six sub-keys are present under their pinned
// names (a struct decode alone would read an absent key as a zero value, which
// is exactly the "partially-populated element set" the requirement says this
// wire has no case for).
func decodeElements(t *testing.T, body map[string]json.RawMessage, label string) orbitElementsWire {
	t.Helper()
	raw, ok := body["orbitElements"]
	if !ok {
		t.Fatalf("%s carries no `orbitElements` key. Served keys: %v", label, rawKeys(body))
	}
	var sub map[string]json.RawMessage
	if err := json.Unmarshal(raw, &sub); err != nil {
		t.Fatalf("%s: `orbitElements` is not a JSON object: %v (raw: %s)", label, err, string(raw))
	}
	for _, k := range []string{"parentId", "radius", "periodMs", "phase", "inclination", "node"} {
		if _, ok := sub[k]; !ok {
			t.Errorf("%s: `orbitElements` is missing the `%s` field. Served: %v", label, k, rawKeys(sub))
		}
	}
	var out orbitElementsWire
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("%s: decoding orbitElements: %v (raw: %s)", label, err, string(raw))
	}
	return out
}

func rawKeys(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func rawString(t *testing.T, m map[string]json.RawMessage, key string) string {
	t.Helper()
	var s string
	if err := json.Unmarshal(m[key], &s); err != nil {
		t.Fatalf("decoding %q as a string: %v", key, err)
	}
	return s
}

// --- Scenario: A non-star body's read carries its full orbital element set --

func TestGetInterior_Scenario_ANonStarBodysReadCarriesItsFullOrbitalElementSet(t *testing.T) {
	_, feats, _, _ := wireInteriorRead(t, scaledClock{now: 5_000, scale: 1}, true)

	// The expectation is the STORED element set, decoded independently of the
	// response — never a value this test also fed into the DTO.
	_, storedFeats := wireFixture()
	want := map[string]space.Orbit{}
	for _, f := range storedFeats {
		if f.SpaceDoc == nil {
			continue
		}
		o, err := space.DecodeOrbit(map[string]any(f.SpaceDoc))
		if err != nil {
			t.Fatalf("fixture invariant: stored element set for %s does not decode: %v", f.Id, err)
		}
		want[f.Id] = o
	}
	if len(want) == 0 {
		t.Fatal("fixture invariant: no stored element sets to compare against")
	}

	checked := 0
	for _, f := range feats {
		id := rawString(t, f, "id")
		if rawString(t, f, "type") == string(FeatureStar) {
			continue
		}
		got := decodeElements(t, f, "feature "+id)
		w, ok := want[id]
		if !ok {
			t.Errorf("feature %s was served but has no stored element set to compare against", id)
			continue
		}
		if got.ParentId != w.ParentId || got.Radius != w.Radius ||
			got.PeriodMs != int64(w.PeriodMs) || got.Phase != int64(w.Phase) ||
			got.Inclination != int64(w.Inclination) || got.Node != int64(w.Node) {
			t.Errorf("feature %s orbitElements = %+v, want the stored element set %+v", id, got, w)
		}
		checked++
	}
	if checked == 0 {
		t.Fatal("no non-star feature body was checked — the assertion above never ran")
	}
}

// --- Scenario: The star carries no orbital element set ---------------------

func TestGetInterior_Scenario_TheStarCarriesNoOrbitalElementSet(t *testing.T) {
	_, feats, _, _ := wireInteriorRead(t, scaledClock{now: 5_000, scale: 1}, true)

	stars := 0
	for _, f := range feats {
		if rawString(t, f, "type") != string(FeatureStar) {
			continue
		}
		stars++
		if raw, ok := f["orbitElements"]; ok {
			t.Errorf("the star's response entry carries an `orbitElements` key (%s) — the requirement is "+
				"that it carries NONE (it is parentless and positioned at the origin)", string(raw))
		}
	}
	if stars != 1 {
		t.Fatalf("fixture invariant: expected exactly one star feature in the response, got %d", stars)
	}
}

// --- Scenario: A body served without a resolvable continuous position is
//               still element-complete ------------------------------------

func TestGetInterior_Scenario_ABodyWithNoResolvablePositionIsStillElementComplete(t *testing.T) {
	// withBodyTable=false: no ContactsSource is wired, which is precisely
	// GetInterior's own "no body table was available" degradation — every
	// feature is served with a zero-valued `space` position.
	_, feats, _, _ := wireInteriorRead(t, scaledClock{now: 5_000, scale: 1}, false)

	zeroPositions := 0
	elementComplete := 0
	for _, f := range feats {
		id := rawString(t, f, "id")
		if rawString(t, f, "type") == string(FeatureStar) {
			continue
		}
		var pos space.Vec3
		if raw, ok := f["space"]; ok {
			if err := json.Unmarshal(raw, &pos); err != nil {
				t.Fatalf("feature %s: decoding `space`: %v", id, err)
			}
		}
		if pos != (space.Vec3{}) {
			t.Fatalf("fixture invariant: feature %s was served a NON-zero continuous position (%+v) with no "+
				"body table wired — this fixture cannot express the scenario's GIVEN and the assertion "+
				"below would prove nothing", id, pos)
		}
		zeroPositions++
		got := decodeElements(t, f, "feature "+id+" (no body table)")
		if got.ParentId == "" || !(got.Radius > 0) {
			t.Errorf("feature %s: orbitElements = %+v — elements are STORED data, not a resolution result, "+
				"so they must be served in full even though the position could not be resolved", id, got)
		}
		elementComplete++
	}
	if zeroPositions == 0 || elementComplete == 0 {
		t.Fatal("no non-star feature was served with an unresolvable position — the scenario never ran")
	}
}

// --- Scenario: A lane-gate body's read carries its full orbital element set -

func TestGetInterior_Scenario_ALaneGateBodysReadCarriesItsFullOrbitalElementSet(t *testing.T) {
	_, _, gates, svc := wireInteriorRead(t, scaledClock{now: 5_000, scale: 1}, true)

	// The expectation comes from the SYSTEM'S OWN BODY TABLE — the same
	// derivation tasks.md 2.3 requires the read to source from, and NOT from
	// any field this test wrote onto a LaneGate fixture (which would be the
	// tautology this file exists to avoid).
	bt, err := svc.BodyTable(context.Background(), "sys-bt")
	if err != nil {
		t.Fatalf("building the body table to derive the expected gate element set: %v", err)
	}

	for _, g := range gates {
		dest := rawString(t, g, "destSystemId")
		body, ok := bt.Body("gate-" + dest)
		if !ok {
			t.Fatalf("fixture invariant: the body table resolves no gate body for destination %q", dest)
		}
		if body.Orbit == nil {
			t.Fatalf("fixture invariant: the body table's gate body for %q carries no orbit", dest)
		}
		got := decodeElements(t, g, "lane gate -> "+dest)
		w := *body.Orbit
		if got.ParentId != w.ParentId || got.Radius != w.Radius ||
			got.PeriodMs != int64(w.PeriodMs) || got.Phase != int64(w.Phase) ||
			got.Inclination != int64(w.Inclination) || got.Node != int64(w.Node) {
			t.Errorf("lane gate -> %s orbitElements = %+v, want the element set the system's body table "+
				"derived for that gate: %+v", dest, got, w)
		}
	}
}

// --- Scenario: The read carries the interior's continuous extent -----------

func TestGetInterior_Scenario_TheReadCarriesTheInteriorsContinuousExtent(t *testing.T) {
	top, _, _, _ := wireInteriorRead(t, scaledClock{now: 0, scale: 1}, true)

	interior, _ := wireFixture()
	if !(interior.Extent > 0) {
		t.Fatalf("fixture invariant: the stored interior carries no positive Extent (%v) — the assertion "+
			"below could be satisfied by an absent field decoding to zero", interior.Extent)
	}

	raw, ok := top["extent"]
	if !ok {
		t.Fatalf("the interior read carries no `extent` key. Served keys: %v", rawKeys(top))
	}
	var got float64
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decoding `extent`: %v (raw %s)", err, string(raw))
	}
	if got != interior.Extent {
		t.Errorf("extent = %v, want the value the interior's stored document holds (%v)", got, interior.Extent)
	}

	// `extent` was served ALONGSIDE the discrete `radius` while both existed.
	// openspec build-production-space-view (tasks.md 9.1) removed `radius`:
	// `extent` is its successor, and serving both would leave a consumer free
	// to keep scaling continuous space off the retired ordinal.
	if _, ok := top["radius"]; ok {
		t.Error("the interior read still carries the retired `radius`; the continuous `extent` is its " +
			"successor and the retired ordinal must not survive alongside it")
	}
}

// --- Scenario: The read carries the world clock's scale alongside its world
//               time ------------------------------------------------------

func TestGetInterior_Scenario_TheReadCarriesTheWorldClocksScale(t *testing.T) {
	const warped = 7.5
	top, _, _, _ := wireInteriorRead(t, scaledClock{now: 123_456, scale: warped}, true)

	raw, ok := top["scale"]
	if !ok {
		t.Fatalf("the interior read carries no `scale` key on a world whose clock runs at %v. Served "+
			"keys: %v", warped, rawKeys(top))
	}
	var got float64
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decoding `scale`: %v (raw %s)", err, string(raw))
	}
	if got != warped {
		t.Errorf("scale = %v, want %v — the scale served must be the scale of the SAME clock the "+
			"response's worldTime was read from", got, warped)
	}
	// "alongside the `worldTime` it already serves", from that same clock.
	var wt common.WorldMillis
	if err := json.Unmarshal(top["worldTime"], &wt); err != nil {
		t.Fatalf("decoding `worldTime`: %v", err)
	}
	if wt != 123_456 {
		t.Errorf("worldTime = %v, want the injected clock's own instant 123456 — scale and worldTime must "+
			"come from one clock", wt)
	}
}

// The unwarped half: a scale of exactly 1 is served EXPLICITLY, never omitted
// and left for a client to assume. (`system-interior` states the scale is
// carried unconditionally; tasks.md 2.7 spells it out — "unconditionally
// rather than only when it differs from 1".)
func TestGetInterior_Scenario_TheScaleIsServedEvenOnAnUnwarpedWorld(t *testing.T) {
	top, _, _, _ := wireInteriorRead(t, scaledClock{now: 10, scale: 1}, true)
	raw, ok := top["scale"]
	if !ok {
		t.Fatalf("the interior read omits `scale` on a world running at exactly 1. It must be served "+
			"explicitly so a client never has to distinguish \"scale 1\" from \"scale absent\". Served "+
			"keys: %v", rawKeys(top))
	}
	var got float64
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decoding `scale`: %v", err)
	}
	if got != 1 {
		t.Errorf("scale = %v, want 1", got)
	}
}

// --- Scenario: Pre-existing wire fields are unchanged (REMOVED) ------------
//
// `TestGetInterior_Scenario_PreExistingWireFieldsAreUnchanged` lived here and
// asserted that the discrete half of the interior wire — `footprint`, `band`,
// `live`, the discrete `orbit` object, and a lane gate's `cell` — was still
// served. Its scenario is REMOVED by openspec build-production-space-view
// (system-interior's *Interior Read Endpoint* is retired and re-added as
// *Interior Read Serves Continuous Bodies*), and tasks.md 9.1 is the task
// that drops those fields. The test is deleted rather than relaxed: it
// asserted the presence of exactly what this change removes, so there is
// nothing left of it to keep. The interior wire-removal suite in this package
// is its successor and asserts the inverse.

// --- Scenario: A materialized system's read carries every body's continuous
//               position and size ------------------------------------------

func TestGetInterior_Scenario_EveryBodyCarriesAContinuousPositionAndSize(t *testing.T) {
	_, feats, gates, _ := wireInteriorRead(t, scaledClock{now: 5_000, scale: 1}, true)

	for _, f := range feats {
		id := rawString(t, f, "id")
		if _, ok := f["space"]; !ok {
			t.Errorf("feature %s carries no continuous `space` position", id)
		}
		if _, ok := f["size"]; !ok && rawString(t, f, "type") != string(FeatureStar) {
			t.Errorf("feature %s carries no `size`", id)
		}
	}
	for _, g := range gates {
		dest := rawString(t, g, "destSystemId")
		// `cell` was in this list until build-production-space-view removed
		// the discrete position from this wire (tasks.md 9.1); the continuous
		// pair is what every body, gate bodies included, carries now.
		for _, k := range []string{"space", "size"} {
			if _, ok := g[k]; !ok {
				t.Errorf("lane gate -> %s carries no `%s`", dest, k)
			}
		}
	}
}

// --- The element set actually reproduces the served position ---------------
//
// SDET-ADDED (beyond the literal scenarios). The four element scenarios above
// pin that six numbers are served and that they equal the stored/derived ones.
// This one pins the property the renderer half actually depends on: evaluating
// the SERVED elements at the response's own worldTime reproduces the SERVED
// continuous position. A response that carried a complete but WRONG element
// set — the star's phase on every body, say — satisfies every scenario above
// and fails here.
func TestGetInterior_SDETAdded_ServedElementsReproduceTheServedPosition(t *testing.T) {
	top, feats, gates, _ := wireInteriorRead(t, scaledClock{now: 5_000, scale: 1}, true)

	var now common.WorldMillis
	if err := json.Unmarshal(top["worldTime"], &now); err != nil {
		t.Fatalf("decoding worldTime: %v", err)
	}

	// A space.Bodies built ENTIRELY from what the wire served.
	bodies := wireBodies{m: map[string]space.Body{}}
	served := map[string]space.Vec3{}
	add := func(id string, raw map[string]json.RawMessage, isStar bool) {
		var pos space.Vec3
		if r, ok := raw["space"]; ok {
			_ = json.Unmarshal(r, &pos)
		}
		served[id] = pos
		if isStar {
			bodies.m[id] = space.Body{Id: id}
			return
		}
		e := decodeElements(t, raw, id)
		bodies.m[id] = space.Body{Id: id, Orbit: &space.Orbit{
			ParentId: e.ParentId, Radius: e.Radius, PeriodMs: common.WorldMillis(e.PeriodMs),
			Phase: space.SubTurns(e.Phase), Inclination: space.SubTurns(e.Inclination), Node: space.SubTurns(e.Node),
		}}
	}
	for _, f := range feats {
		add(rawString(t, f, "id"), f, rawString(t, f, "type") == string(FeatureStar))
	}
	for _, g := range gates {
		add("gate-"+rawString(t, g, "destSystemId"), g, false)
	}

	checked := 0
	for id, want := range served {
		if want == (space.Vec3{}) {
			continue // the star, at the origin, and any degraded body
		}
		got, err := space.Position(&bodies, id, now)
		if err != nil {
			t.Errorf("resolving %s from the SERVED element sets alone: %v — a client must be able to "+
				"evaluate a body's position at any world time from the served elements alone, with no "+
				"further read", id, err)
			continue
		}
		if !vecNear(got, want, 1e-6) {
			t.Errorf("%s: evaluating the SERVED orbitElements at the response's own worldTime gives %+v, "+
				"but the response's own `space` position is %+v — the served element set does not "+
				"describe the served body", id, got, want)
		}
		checked++
	}
	if checked == 0 {
		t.Fatal("no body had both a served position and a resolvable element set — the assertion never ran")
	}
}

type wireBodies struct{ m map[string]space.Body }

func (b *wireBodies) Body(id string) (space.Body, bool) {
	v, ok := b.m[id]
	return v, ok
}

func vecNear(a, b space.Vec3, tol float64) bool {
	return math.Abs(a.X-b.X) <= tol && math.Abs(a.Y-b.Y) <= tol && math.Abs(a.Z-b.Z) <= tol
}
