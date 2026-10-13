package main

// Shared test-only infrastructure for the serve-orbital-elements-and-burn-
// preview RED-PHASE e2e suite (backend/burn_preview_e2e_test.go,
// backend/burn_quoted_cap_e2e_test.go,
// backend/stationkeep_upkeep_rate_e2e_test.go,
// backend/orbit_elements_wire_e2e_test.go).
//
// EVERY SCENARIO DRIVES THE REAL, PRODUCTION-COMPOSED SetupRouter() with a
// REAL Firebase Auth emulator token against REAL Firestore, for the reason
// this chain's handoff notes record eight times over: a green unit suite
// proves a unit correct while nothing in production reaches it. This change
// is dead code on arrival by its own design.md ("nothing calls the preview
// endpoint ... until build-production-space-view lands"), which makes it the
// single highest-risk change in the chain for exactly that failure mode. A
// preview handler that exists but is never wired into RegisterRoutes fails
// here, by construction.
//
// NAME-AGNOSTIC ASSERTIONS, DELIBERATELY. The spec delta names only three
// wire keys for the preview response: none. tasks.md 3.3 names `departMs`
// and `arriveMs` in backticks and describes the rest in prose ("the six
// control points", "delta-v", "fuel tons", "affordability", "the stranding
// indication"). Rather than invent five key names and make the whole suite
// fail on a naming disagreement instead of on behaviour, this file provides:
//
//   - numericLeaves / containsNumber — "this exact solved figure appears
//     somewhere in the response", which cannot be satisfied by an omitted or
//     wrong value, and does not care what it is called;
//   - boolLeaves / flippedBool — differential discovery of a boolean field
//     by observing it CHANGE between two arrangements that differ only in the
//     condition the field reports. A response with no such field, or with one
//     that does not flip, fails.
//
// `departMs`/`arriveMs` ARE looked up by name (numbersByKey), since tasks.md
// pins them. The two names this suite therefore constrains are exactly the
// two the change's own task list already wrote down.

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"hexaverse/space"
)

// previewPath is the endpoint the fleet-movement delta names verbatim:
// "POST /v1/fleets/:fleetId/orders/preview".
func previewPath(fleetId string) string { return "/v1/fleets/" + fleetId + "/orders/preview" }

// postPreview issues one preview and guards the single vacuity trap this
// whole suite would otherwise fall into: an UNREGISTERED Gin route answers a
// generic 404 for every caller and every arrangement, which would make every
// "the preview is rejected" scenario below pass without the endpoint existing
// at all (the handoff notes' Lesson two, second instance).
func postPreview(t *testing.T, router http.Handler, token, fleetId string, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	w := doJSON(t, router, http.MethodPost, previewPath(fleetId), token, body, nil)
	requireRouteImplemented(t, w)
	return w
}

// previewOK issues a preview that must succeed, and returns its decoded body.
func previewOK(t *testing.T, router http.Handler, token, fleetId string, body map[string]any) map[string]any {
	t.Helper()
	w := postPreview(t, router, token, fleetId, body)
	if w.Code != http.StatusOK {
		t.Fatalf("POST %s %v: status = %d, want 200 (body: %s)", previewPath(fleetId), body, w.Code, w.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("decoding the preview response: %v\nbody: %s", err, w.Body.String())
	}
	return out
}

// --- name-agnostic response probes ------------------------------------------

// numericLeaves collects every numeric leaf in a decoded JSON value, at any
// depth, so an assertion can say "this solved figure is served" without
// pinning where or under what name.
func numericLeaves(v any) []float64 {
	var out []float64
	var walk func(any)
	walk = func(v any) {
		switch t := v.(type) {
		case float64:
			out = append(out, t)
		case map[string]any:
			keys := make([]string, 0, len(t))
			for k := range t {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				walk(t[k])
			}
		case []any:
			for _, e := range t {
				walk(e)
			}
		}
	}
	walk(v)
	return out
}

// containsNumber reports whether want appears among leaves, within a relative
// tolerance (0 means exact). Solved figures crossing a JSON round trip are
// exact for every value this suite compares — float64 -> decimal -> float64 is
// lossless through encoding/json — so callers pass 0 unless they have a stated
// reason not to.
func containsNumber(leaves []float64, want, relTol float64) bool {
	for _, g := range leaves {
		if g == want {
			return true
		}
		if relTol > 0 && math.Abs(g-want) <= relTol*math.Max(1, math.Abs(want)) {
			return true
		}
	}
	return false
}

// requireNumbers asserts every one of want appears in body, naming what is
// missing. `label` describes the family (e.g. "the solved curve's control
// points") for the failure message.
func requireNumbers(t *testing.T, body map[string]any, label string, want []float64) {
	t.Helper()
	leaves := numericLeaves(body)
	var missing []float64
	for _, w := range want {
		if !containsNumber(leaves, w, 0) {
			missing = append(missing, w)
		}
	}
	if len(missing) > 0 {
		raw, _ := json.Marshal(body)
		t.Errorf("the preview response does not carry %s: %v of %d expected values are absent (missing %v).\n"+
			"Served numeric leaves: %v\nFull response: %s", label, len(missing), len(want), missing, leaves, raw)
	}
}

// curveCoords flattens a solved curve's six control points into the eighteen
// coordinates a response must carry for a client to draw the burn.
func curveCoords(c space.Curve) []float64 {
	var out []float64
	for _, p := range []space.Vec3{c.P0, c.C1, c.C2, c.C3, c.C4, c.P5} {
		out = append(out, p.X, p.Y, p.Z)
	}
	return out
}

// numbersByKey finds every numeric value stored under `key` (case-insensitively)
// at any depth. Used only for `departMs`/`arriveMs`, which tasks.md 3.3 names.
func numbersByKey(v any, key string) []float64 {
	var out []float64
	var walk func(any)
	walk = func(v any) {
		switch t := v.(type) {
		case map[string]any:
			for k, sub := range t {
				if strings.EqualFold(k, key) {
					if f, ok := sub.(float64); ok {
						out = append(out, f)
					}
				}
				walk(sub)
			}
		case []any:
			for _, e := range t {
				walk(e)
			}
		}
	}
	walk(v)
	return out
}

// oneNumberByKey requires exactly one value under `key`.
func oneNumberByKey(t *testing.T, body map[string]any, key string) float64 {
	t.Helper()
	got := numbersByKey(body, key)
	if len(got) != 1 {
		raw, _ := json.Marshal(body)
		t.Fatalf("the preview response carries %d values under a `%s` key, want exactly one "+
			"(tasks.md 3.3 names this field). Response: %s", len(got), key, raw)
	}
	return got[0]
}

// boolLeaves maps every boolean leaf's dotted path to its value.
func boolLeaves(v any) map[string]bool {
	out := map[string]bool{}
	var walk func(string, any)
	walk = func(path string, v any) {
		switch t := v.(type) {
		case bool:
			out[path] = t
		case map[string]any:
			for k, sub := range t {
				walk(strings.TrimPrefix(path+"."+k, "."), sub)
			}
		case []any:
			for i, e := range t {
				walk(fmt.Sprintf("%s[%d]", path, i), e)
			}
		}
	}
	walk("", v)
	return out
}

// flippedBool returns the paths of boolean fields that are `whenTrue` in
// bodyTrue and NOT `whenTrue` in bodyFalse — treating ABSENCE in bodyFalse as
// false, since a bool serialized with `omitempty` (fleet/handler.go's own
// existing `strandingWarning` does exactly this) disappears when false.
//
// This is the differential discovery that makes an unnamed boolean field
// testable: the two bodies differ only in the condition the field reports, so
// a field that flips with it is that field, and a response where NOTHING flips
// carries no such indication at all.
func flippedBool(bodyTrue, bodyFalse map[string]any) []string {
	tb := boolLeaves(bodyTrue)
	fb := boolLeaves(bodyFalse)
	var out []string
	for path, v := range tb {
		if !v {
			continue
		}
		if other, ok := fb[path]; !ok || !other {
			out = append(out, path)
		}
	}
	sort.Strings(out)
	return out
}

// --- stored-state probes ----------------------------------------------------

// storedFleetJSON renders a fleet's ENTIRE stored Firestore document as
// canonical JSON (encoding/json sorts map keys), so "byte-identical before and
// after" is a single string comparison over every field — not a hand-listed
// subset that would miss the one field an implementation actually touched.
//
// Asserting on the STORED document rather than on a returned struct is this
// chain's own hard-won rule: a `stop` branch mutated its fleet in memory and
// persisted nothing, and every assertion on the return value passed
// (handoffs/drift-stop-free-branch-no-write.md).
func storedFleetJSON(t *testing.T, fleetId string) string {
	t.Helper()
	b, err := json.Marshal(storedFleetDoc(t, fleetId))
	if err != nil {
		t.Fatalf("marshalling fleet %s's stored document: %v", fleetId, err)
	}
	return string(b)
}

// storedActiveActionId reads the movement channel's claimed slot straight from
// the actor document — the field action/dao.go's commitTx itself checks.
func storedActiveActionId(t *testing.T, fleetId string) string {
	t.Helper()
	v, _ := storedFleetDoc(t, fleetId)["activeActionId"].(string)
	return v
}

// storedStateMode reads the stored kinematic mode ("burn"/"parked"/"drift" —
// fleet.EncodeKinematicState's own tag).
func storedStateMode(t *testing.T, fleetId string) string {
	t.Helper()
	state, _ := storedFleetDoc(t, fleetId)["state"].(map[string]interface{})
	m, _ := state["mode"].(string)
	return m
}

// --- shared fixtures --------------------------------------------------------

// farPoint is the remote in-system destination the preview suite burns
// toward: far from the home station and from every lane gate (matching
// fuel_stranding_and_range_e2e_test.go's own choice), and comfortably outside
// the star's clearance radius.
var farPoint = map[string]any{"x": 500_000.0, "y": 500_000.0, "z": 500_000.0}

// previewAccel is a fixed commanded acceleration inside every seed hull's
// disclosed band, so a solve is never priced at a roster-derived ceiling that
// could drift between two calls in one test.
const previewAccel = 4.0

func pointOrder() map[string]any {
	return map[string]any{"point": farPoint, "accel": previewAccel}
}

// affordableNearbyOrder builds a point order the fleet can actually PAY FOR
// while still holding cargo room — a burn radially outward from wherever the
// fleet currently is, by `outward` units.
//
// Why this exists: a burn's fuel cost is 2*sqrt(length*accel)/DeltaVPerTon per
// hull, so the suite's ordinary far-point order costs several hundred tons —
// more than a seed hull's entire 200-ton hold. Any scenario that needs the
// fleet to hold fuel AND free hold at the same time (a running mine beside a
// burn order) must therefore burn somewhere near. Measured, not assumed: the
// first red run of the mine-held-channel scenario was rejected with
// ErrInsufficientFuel rather than the channel-conflict reason it is about,
// which would have made a preview/commit parity assertion pass for entirely
// the wrong reason.
func affordableNearbyOrder(t *testing.T, router http.Handler, token, fleetId string, outward float64) map[string]any {
	t.Helper()
	var read struct {
		Position space.Vec3 `json:"position"`
	}
	w := doJSON(t, router, http.MethodGet, "/v1/fleets/"+fleetId, token, nil, &read)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/fleets/%s to place a nearby target: status = %d", fleetId, w.Code)
	}
	dir, ok := read.Position.Normalize()
	if !ok {
		t.Fatalf("fleet %s reads a zero position; there is no outward direction to place a target along", fleetId)
	}
	target := read.Position.Add(space.Vec3{X: dir.X * outward, Y: dir.Y * outward, Z: dir.Z * outward})
	return map[string]any{
		"point": map[string]any{"x": target.X, "y": target.Y, "z": target.Z},
		"accel": previewAccel,
	}
}

// starFeatureId names the system's own star body through the real interior
// read — never a hardcoded "feat-star" literal.
func starFeatureId(t *testing.T, router http.Handler, token, systemId string) string {
	t.Helper()
	var interior struct {
		Features []struct {
			Id   string `json:"id"`
			Type string `json:"type"`
		} `json:"features"`
	}
	w := doJSON(t, router, http.MethodGet, "/v1/systems/"+systemId, token, nil, &interior)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d, body = %s", systemId, w.Code, w.Body.String())
	}
	for _, f := range interior.Features {
		if f.Type == "star" {
			return f.Id
		}
	}
	t.Fatalf("the interior read for %s served no star feature", systemId)
	return ""
}

// sameRejection asserts two responses are indistinguishable — the exact
// property "rejected with the same observable reason a committed order
// produces" and "the same named reason the commit path uses for that case"
// name. Also refuses to pass when BOTH succeeded, which is the way a parity
// assertion silently stops testing anything.
func sameRejection(t *testing.T, label string, preview, commit *httptest.ResponseRecorder) {
	t.Helper()
	if commit.Code == http.StatusOK {
		t.Fatalf("%s: the COMMIT succeeded (200), so there is no rejection for the preview to match. "+
			"This arrangement does not express the scenario's WHEN — the fixture is wrong, or the "+
			"scenario's premise about the commit path is (see the SDET handoff report)", label)
	}
	if preview.Code != commit.Code || preview.Body.String() != commit.Body.String() {
		t.Errorf("%s: the preview and the commit reject DIFFERENTLY.\n  preview: %d %s\n  commit:  %d %s\n"+
			"The preview SHALL be rejected exactly where a commit would be, with the same named reason "+
			"— insufficient fuel is the ONE stated exception, and this is not it",
			label, preview.Code, preview.Body.String(), commit.Code, commit.Body.String())
	}
}

// errorMessage pulls a rejection body's `error` string, or "" when the body is
// not a JSON object with one.
func errorMessage(w *httptest.ResponseRecorder) string {
	var out struct {
		Error string `json:"error"`
	}
	_ = jsonUnmarshalLenient(w.Body.Bytes(), &out)
	return out.Error
}

// solvedFuelCostOfCommit prices the order by COMMITTING it once with ample
// fuel, reading the price off the burn the commit itself solved, then
// cancelling that burn and rewinding the fleet to the exact pristine motion
// state it started from. Independent of the preview endpoint on purpose: the
// quoted-cap suite must stay red or green on the CAP's account, never on the
// preview's.
//
// Callers explicitly arrange a motionless point park, so the
// restored origin is the IDENTICAL origin and — with a point target, which
// does not move either — the second solve is the identical solve. That
// premise is asserted, not assumed, by every caller through the returned
// cost being re-checked against the second commit's own burn.
func solvedFuelCostOfCommit(t *testing.T, router http.Handler, sp fuelSpawn, order map[string]any) float64 {
	t.Helper()
	initial, _, code := fuelGetFleet(t, router, sp.token, sp.fleetId)
	if code != http.StatusOK || initial.State.Park == nil || initial.State.Park.Kind != space.ParkPoint || initial.AttachedTo != "" {
		t.Fatal("cost probe requires explicitly arranged unattached point park")
	}
	pristine := snapshotFleetMotion(t, sp.fleetId)
	setFleetFuel(t, sp.fleetId, 1_000_000)

	resp, _, code := postOrder(t, router, sp.token, sp.fleetId, order)
	if code != http.StatusOK || resp.State.Burn == nil {
		t.Fatalf("pricing probe: POST /orders %v returned %d (burn=%v) — the fixture cannot learn this "+
			"order's solved cost", order, code, resp.State.Burn)
	}
	cost := resp.State.Burn.DeltaV() / deltaVPerTonPlaceholder // hull count 1 on a fresh spawn
	if !(cost > 0) {
		t.Fatalf("pricing probe: the order priced %v tons, want strictly positive — a free burn makes "+
			"every cap assertion below meaningless", cost)
	}

	// Release the slot and cancel the probe action before rewinding, so no
	// orphaned running action is left for a later read's ResolveDue to settle
	// underneath an assertion.
	if w := doJSON(t, router, http.MethodPost, "/v1/fleets/"+sp.fleetId+"/cancel", sp.token, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("pricing probe: cancelling the probe burn: status = %d, body = %s", w.Code, w.Body.String())
	}
	restoreFleetMotion(t, sp.fleetId, pristine)
	if n := runningActionCount(t, sp.fleetId); n != 0 {
		t.Fatalf("pricing probe: %d running action(s) survived the probe — a later read would settle one "+
			"underneath this test's assertions", n)
	}
	return cost
}
