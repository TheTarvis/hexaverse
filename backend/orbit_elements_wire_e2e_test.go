package main

// RED-phase end-to-end tests for openspec change
// serve-orbital-elements-and-burn-preview, tasks.md 1.1 / 1.10 / 1.11 / 1.12 —
// the `system-interior` wire contract, asserted against a REAL generated,
// materialized system served by the REAL production router.
//
// WHY BOTH THIS AND backend/system/orbit_elements_and_extent_wire_test.go.
// The handler-level file can inject a warped clock and can build a body table
// with no emulator, but every body it serves comes from a hand-written
// fixture. This file's bodies come from the generator: real moons parented to
// real planets, real belts, a real station splice, and real lane gates derived
// from real galaxy coordinates. A DTO change that works for a three-body
// fixture and drops the moon's parent chain fails here and nowhere else.
//
// EXPECTED TO BE RED TODAY: system/fog.go's fogFeatureDTO and system.LaneGate
// serialize no element set, and system/handler.go's interiorDTO carries
// neither `extent` nor `scale`.

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"hexaverse/charts"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/market"
	"hexaverse/space"
	"hexaverse/stations"
	"hexaverse/system"
)

// interiorRaw decodes the interior read one level deep so KEY PRESENCE, not a
// Go zero value, is what the assertions see.
type interiorRaw struct {
	SystemId  string                       `json:"systemId"`
	Features  []map[string]json.RawMessage `json:"features"`
	LaneGates []map[string]json.RawMessage `json:"laneGates"`
	WorldTime common.WorldMillis           `json:"worldTime"`
	top       map[string]json.RawMessage
}

func readInteriorRaw(t *testing.T, router http.Handler, token, systemId string) interiorRaw {
	t.Helper()
	w := doJSON(t, router, http.MethodGet, "/v1/systems/"+systemId, token, nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d, body = %s", systemId, w.Code, w.Body.String())
	}
	var out interiorRaw
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("decoding the interior read: %v\nbody: %s", err, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out.top); err != nil {
		t.Fatalf("decoding the interior read as a raw object: %v", err)
	}
	if len(out.Features) == 0 {
		t.Fatalf("GET /v1/systems/%s served ZERO features — every per-body assertion would pass "+
			"vacuously", systemId)
	}
	return out
}

func rawStr(t *testing.T, m map[string]json.RawMessage, key string) string {
	t.Helper()
	var s string
	if raw, ok := m[key]; ok {
		if err := json.Unmarshal(raw, &s); err != nil {
			t.Fatalf("decoding %q as a string: %v", key, err)
		}
	}
	return s
}

func rawKeyList(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

// wireElements is the six-field element set, decoded with its six sub-keys
// asserted present by name (space.EncodeOrbit's own persisted key set, which
// the requirement quotes verbatim).
type wireElements struct {
	ParentId    string  `json:"parentId"`
	Radius      float64 `json:"radius"`
	PeriodMs    int64   `json:"periodMs"`
	Phase       int64   `json:"phase"`
	Inclination int64   `json:"inclination"`
	Node        int64   `json:"node"`
}

func requireElements(t *testing.T, body map[string]json.RawMessage, label string) wireElements {
	t.Helper()
	raw, ok := body["orbitElements"]
	if !ok {
		t.Fatalf("%s carries no `orbitElements` key. Served keys: %v", label, rawKeyList(body))
	}
	var sub map[string]json.RawMessage
	if err := json.Unmarshal(raw, &sub); err != nil {
		t.Fatalf("%s: `orbitElements` is not an object: %v", label, err)
	}
	for _, k := range []string{"parentId", "radius", "periodMs", "phase", "inclination", "node"} {
		if _, ok := sub[k]; !ok {
			t.Errorf("%s: `orbitElements` is missing `%s`. Served: %v", label, k, rawKeyList(sub))
		}
	}
	var out wireElements
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("%s: decoding orbitElements: %v", label, err)
	}
	return out
}

// homeSystemService composes a system.Service the SAME way router.go does —
// including the station splice — so a body table built here resolves every
// body the production interior read serves. Without WithStations the spliced
// station body is served on the wire and absent from the comparison table,
// which reads as a wire defect and is not one. (Measured against a scratch
// implementation, which is exactly what that verification pass is for.)
func homeSystemService(t *testing.T) *system.Service {
	t.Helper()
	fs, _ := firestoreClient(t)
	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), common.WorldClock())
	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), gsvc, common.WorldClock())
	ssvc.WithStations(stations.NewService(gsvc, charts.NewService()).
		WithMinVisibilityTier(market.DefaultParams().MinVisibilityTier))
	return ssvc
}

func homeBodyTable(t *testing.T, systemId string) *system.BodyTable {
	t.Helper()
	bt, err := homeSystemService(t).BodyTable(context.Background(), systemId)
	if err != nil {
		t.Fatalf("building system %s's body table: %v", systemId, err)
	}
	return bt
}

// Scenario: A non-star body's read carries its full orbital element set
// Scenario: A lane-gate body's read carries its full orbital element set
// Scenario: The star carries no orbital element set
func TestInteriorWire_Scenario_EveryBodyCarriesItsOrbitalElementSet(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Orbit Elements Wire Corp")
	got := readInteriorRaw(t, router, sp.token, sp.homeId)
	if len(got.LaneGates) == 0 {
		t.Skipf("test-environment issue, not the behaviour under test: home system %s has no incident "+
			"lanes, so there is no lane-gate body to assert against", sp.homeId)
	}

	// The independent expectation: the SAME body table the read resolves
	// through, built here from the same stored documents. A gate's element set
	// is the one the body table derived (tasks.md 2.3 — never re-derived at
	// read time); a feature's is the one it stores.
	bt := homeBodyTable(t, sp.homeId)

	stars, nonStars := 0, 0
	for _, f := range got.Features {
		id := rawStr(t, f, "id")
		if rawStr(t, f, "type") == "star" {
			stars++
			if raw, ok := f["orbitElements"]; ok {
				t.Errorf("the star (%s) carries an `orbitElements` key (%s) — it is parentless and "+
					"positioned at the origin, and SHALL carry none", id, string(raw))
			}
			continue
		}
		nonStars++
		e := requireElements(t, f, "feature "+id)
		body, ok := bt.Body(id)
		if !ok || body.Orbit == nil {
			// The station splice is present on the read but its own element
			// set is derived, not stored; the body table is still the
			// authority, so an unresolvable body here is a real inconsistency.
			t.Errorf("feature %s is served on the interior read but the system's own body table resolves "+
				"no orbit for it (ok=%v)", id, ok)
			continue
		}
		compareElements(t, "feature "+id, e, *body.Orbit)
	}
	if stars != 1 {
		t.Errorf("the interior read served %d star features, want exactly 1", stars)
	}
	if nonStars == 0 {
		t.Fatal("the interior read served no non-star body — the element assertions never ran")
	}

	for _, g := range got.LaneGates {
		dest := rawStr(t, g, "destSystemId")
		e := requireElements(t, g, "lane gate -> "+dest)
		body, ok := bt.Body("gate-" + dest)
		if !ok || body.Orbit == nil {
			t.Errorf("lane gate -> %s is served but the body table resolves no orbit for it", dest)
			continue
		}
		compareElements(t, "lane gate -> "+dest, e, *body.Orbit)
	}
}

func compareElements(t *testing.T, label string, got wireElements, want space.Orbit) {
	t.Helper()
	if got.ParentId != want.ParentId || got.Radius != want.Radius ||
		got.PeriodMs != int64(want.PeriodMs) || got.Phase != int64(want.Phase) ||
		got.Inclination != int64(want.Inclination) || got.Node != int64(want.Node) {
		t.Errorf("%s orbitElements = %+v, want the element set the system's body table holds: %+v",
			label, got, want)
	}
}

// SDET-ADDED (beyond the literal scenarios). The property the renderer half
// actually depends on, over a REAL generated body hierarchy including moons
// parented to planets: evaluating the SERVED elements at the response's own
// worldTime reproduces the SERVED continuous position, resolving the parent
// chain from served data alone. A complete-but-wrong element set passes every
// scenario above and fails here.
func TestInteriorWire_SDETAdded_ServedElementsResolveThroughTheServedParentChain(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Orbit Elements Resolve Corp")
	got := readInteriorRaw(t, router, sp.token, sp.homeId)

	bodies := servedBodies{m: map[string]space.Body{}}
	positions := map[string]space.Vec3{}
	collect := func(id string, raw map[string]json.RawMessage, isStar bool) {
		var pos space.Vec3
		if r, ok := raw["space"]; ok {
			_ = json.Unmarshal(r, &pos)
		}
		positions[id] = pos
		if isStar {
			bodies.m[id] = space.Body{Id: id}
			return
		}
		e := requireElements(t, raw, id)
		bodies.m[id] = space.Body{Id: id, Orbit: &space.Orbit{
			ParentId: e.ParentId, Radius: e.Radius, PeriodMs: common.WorldMillis(e.PeriodMs),
			Phase: space.SubTurns(e.Phase), Inclination: space.SubTurns(e.Inclination),
			Node: space.SubTurns(e.Node),
		}}
	}
	for _, f := range got.Features {
		collect(rawStr(t, f, "id"), f, rawStr(t, f, "type") == "star")
	}
	for _, g := range got.LaneGates {
		collect("gate-"+rawStr(t, g, "destSystemId"), g, false)
	}

	checked := 0
	for id, want := range positions {
		if want == (space.Vec3{}) {
			continue
		}
		res, err := space.Position(&bodies, id, got.WorldTime)
		if err != nil {
			t.Errorf("resolving %s from the SERVED element sets alone: %v — \"a client can evaluate that "+
				"body's position at any world time from the served elements alone without a further read "+
				"per rendered frame\"", id, err)
			continue
		}
		if math.Abs(res.X-want.X) > 1e-6 || math.Abs(res.Y-want.Y) > 1e-6 || math.Abs(res.Z-want.Z) > 1e-6 {
			t.Errorf("%s: the served elements evaluate to %+v at the response's own worldTime (%d), but "+
				"the response's own `space` position is %+v", id, res, got.WorldTime, want)
		}
		checked++
	}
	if checked == 0 {
		t.Fatal("no served body had both a position and a resolvable element set — the assertion never ran")
	}
}

type servedBodies struct{ m map[string]space.Body }

func (b *servedBodies) Body(id string) (space.Body, bool) {
	v, ok := b.m[id]
	return v, ok
}

// Scenario: The read carries the interior's continuous extent
func TestInteriorWire_Scenario_TheReadCarriesTheInteriorsContinuousExtent(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Interior Extent Corp")
	got := readInteriorRaw(t, router, sp.token, sp.homeId)

	// The stored value, read through the same DAO that persisted it.
	gen, err := homeSystemService(t).GetOrCreateInterior(context.Background(), sp.homeId)
	if err != nil {
		t.Fatalf("reading system %s's stored interior: %v", sp.homeId, err)
	}
	if !(gen.Interior.Extent > 0) {
		t.Fatalf("fixture invariant: the stored interior carries Extent = %v; an absent `extent` field "+
			"would decode to the same zero and the assertion would be vacuous", gen.Interior.Extent)
	}

	raw, ok := got.top["extent"]
	if !ok {
		t.Fatalf("the interior read carries no `extent`. Served keys: %v", rawKeyList(got.top))
	}
	var extent float64
	if err := json.Unmarshal(raw, &extent); err != nil {
		t.Fatalf("decoding `extent`: %v", err)
	}
	if extent != gen.Interior.Extent {
		t.Errorf("extent = %v, want the value the interior's stored document holds (%v)",
			extent, gen.Interior.Extent)
	}
	if _, ok := got.top["radius"]; !ok {
		t.Error("the interior read no longer carries the lattice `radius` — `extent` is served ALONGSIDE " +
			"it, never in place of it")
	}
}

// Scenario: The read carries the world clock's scale alongside its world time
//
// The test world runs at scale exactly 1 (backend/.env.test sets no
// WORLD_TIME_SCALE, and common.WorldClock() is a process-wide sync.Once
// singleton), so this file covers only the unwarped half — which is the half
// that catches an `omitempty` float64. The warped half is
// backend/system/orbit_elements_and_extent_wire_test.go's, over an injected
// clock.
func TestInteriorWire_Scenario_TheReadCarriesTheWorldClocksScale(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Interior Scale Corp")
	got := readInteriorRaw(t, router, sp.token, sp.homeId)

	raw, ok := got.top["scale"]
	if !ok {
		t.Fatalf("the interior read carries no `scale` alongside its `worldTime`. It is served "+
			"UNCONDITIONALLY, on a world running at any scale — a `float64` with `omitempty` disappears "+
			"at exactly the value every world runs at today, which is the shape that ships correct-and-"+
			"absent. Served keys: %v", rawKeyList(got.top))
	}
	var scale float64
	if err := json.Unmarshal(raw, &scale); err != nil {
		t.Fatalf("decoding `scale`: %v", err)
	}
	if want := common.WorldClock().Scale(); scale != want {
		t.Errorf("scale = %v, want the process clock's own scale %v", scale, want)
	}
}

// --- tasks.md 1.12: the golden wire sample ---------------------------------

// goldenWireDir is where the recorded payloads land, under the backend test
// tree, so build-production-space-view's TypeScript types are written against
// a REAL payload rather than a paraphrase of design.md.
const goldenWireDir = "testdata/serve-orbital-elements-and-burn-preview"

// TestGoldenWireSample_RecordOneInteriorReadAndOnePreviewResponse records both
// payloads. It is a RECORDER, not an assertion of shape — but it fails when
// either payload is missing the fields the recording exists to publish, so it
// cannot silently record a pre-change response and call it a contract.
func TestGoldenWireSample_RecordOneInteriorReadAndOnePreviewResponse(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()

	sp := spawnFuelCorp(t, router, "SDET Golden Wire Sample Corp")
	setFleetFuel(t, sp.fleetId, 1_000_000)

	if err := os.MkdirAll(goldenWireDir, 0o755); err != nil {
		t.Fatalf("creating %s: %v", goldenWireDir, err)
	}

	iw := doJSON(t, router, http.MethodGet, "/v1/systems/"+sp.homeId, sp.token, nil, nil)
	if iw.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d", sp.homeId, iw.Code)
	}
	writeGolden(t, filepath.Join(goldenWireDir, "interior-read.json"), iw.Body.Bytes())

	pw := postPreview(t, router, sp.token, sp.fleetId, pointOrder())
	if pw.Code != http.StatusOK {
		t.Fatalf("POST %s: status = %d, body = %s — there is no preview payload to record",
			previewPath(sp.fleetId), pw.Code, pw.Body.String())
	}
	writeGolden(t, filepath.Join(goldenWireDir, "preview-response.json"), pw.Body.Bytes())

	// The recording must actually carry this change's own additions, or the
	// sample is a paraphrase of the PREVIOUS contract with a new filename.
	var interior map[string]json.RawMessage
	if err := json.Unmarshal(iw.Body.Bytes(), &interior); err != nil {
		t.Fatalf("decoding the recorded interior read: %v", err)
	}
	for _, k := range []string{"extent", "scale", "features", "laneGates", "worldTime", "radius"} {
		if _, ok := interior[k]; !ok {
			t.Errorf("the recorded interior sample carries no `%s` — a golden payload missing this "+
				"change's own additions is not a contract for build-production-space-view to type "+
				"against", k)
		}
	}
	var features []map[string]json.RawMessage
	_ = json.Unmarshal(interior["features"], &features)
	sawElements := false
	for _, f := range features {
		if _, ok := f["orbitElements"]; ok {
			sawElements = true
		}
	}
	if !sawElements {
		t.Error("the recorded interior sample carries no `orbitElements` on any feature body")
	}
}

func writeGolden(t *testing.T, path string, raw []byte) {
	t.Helper()
	var pretty json.RawMessage = raw
	buf, err := json.MarshalIndent(pretty, "", "  ")
	if err != nil {
		buf = raw
	}
	if err := os.WriteFile(path, append(buf, '\n'), 0o644); err != nil {
		t.Fatalf("writing %s: %v", path, err)
	}
	t.Logf("recorded golden wire sample: %s (%d bytes)", path, len(buf))
}
