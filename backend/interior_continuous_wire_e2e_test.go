package main

// Wire guard for the system interior read, at the REAL router.
//
// HISTORY, and what this file now asserts. It began (openspec change
// replace-observation-with-sightings, tasks.md 8.1) as the ADDITIVE guard for
// link 8a-1: the interior read had to keep serving features[].footprint,
// features[].band, features[].live and laneGates[].cell alongside the new
// space/size/contacts fields, because the discrete board was the only
// playable view "until a later link deletes these". Link 8a-2 —
// build-production-space-view, tasks.md 9.1 — IS that later link. It deletes
// every one of those fields, and it retires the requirement that carried the
// scenario this test was named for: `system-interior`'s *Interior Read
// Endpoint* > "Pre-existing wire fields are unchanged" is REMOVED, re-added as
// *Interior Read Serves Continuous Bodies*, whose *Lattice-only fields are
// absent from the response* asserts the exact opposite.
//
// The four presence assertions were therefore RETARGETED, not weakened: the
// same real-router, real-generated-system, key-presence guard now pins those
// fields ABSENT (system-interior: "Lattice-only fields are absent from the
// response") and the continuous fields PRESENT AND RESOLVED
// (system-interior: "A materialized system's read carries every body's
// continuous position and size"), plus the served lane-gate `id` that 9.1b
// added in the same section (system-interior: "Every lane-gate body carries a
// non-empty, distinct id"). Nothing else in the file changed.
//
// WHY AT THIS LEVEL, AGAINST THE REAL ROUTER: every handler-level test in
// `system` builds its interior from a hand-written fixture, so a field that
// survives serialization only for a three-body fixture — or a continuous
// position that resolves only for one — is invisible there. This test drives
// SetupRouter() itself: the production composition, real Firestore emulator,
// real Firebase Auth emulator token, real generated system, and assertions on
// the raw JSON object keys rather than on a Go struct that would silently
// decode a missing field as a zero value. The absence half needs that same
// level for the mirror-image reason: one of those fields re-added to the DTO
// by a merge would be served here and nowhere a fixture-driven test could see
// it.
//
// Non-vacuity: the feature and lane-gate counts are asserted non-zero before
// anything else, so an empty response can never satisfy a per-element loop.

import (
	"encoding/json"
	"net/http"
	"sort"
	"testing"

	"hexaverse/space"
)

// rawInterior decodes the interior read one level deep: every feature and
// every lane gate stays a raw JSON object, so KEY PRESENCE (not Go zero
// values) is what the assertions below see.
type rawInterior struct {
	SystemId  string                       `json:"systemId"`
	Features  []map[string]json.RawMessage `json:"features"`
	LaneGates []map[string]json.RawMessage `json:"laneGates"`
	// Contacts is a pointer so "key absent"/"null" is distinguishable from
	// "present and empty" — the requirement says the array is always served.
	Contacts *[]json.RawMessage `json:"contacts"`
}

func TestInteriorRead_Scenario_ContinuousBodiesServedAndRetiredFieldsAbsent(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	token := mintFirebaseIDToken(t)

	if w := doJSON(t, router, http.MethodPost, "/v1/accounts", token, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/accounts: status = %d, body = %s", w.Code, w.Body.String())
	}
	var spawn struct {
		HomeSystem struct{ Id string } `json:"homeSystem"`
	}
	if w := doJSON(t, router, http.MethodPost, "/v1/corporations", token,
		map[string]any{"name": "SDET Additive-Wire Corp"}, &spawn); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/corporations: status = %d, body = %s", w.Code, w.Body.String())
	}
	homeId := spawn.HomeSystem.Id
	if homeId == "" {
		t.Fatalf("spawn response carried no home system id: %+v", spawn)
	}

	var body rawInterior
	w := doJSON(t, router, http.MethodGet, "/v1/systems/"+homeId, token, nil, &body)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d, body = %s", homeId, w.Code, w.Body.String())
	}

	// Non-vacuity: a real materialized interior has bodies, and every home
	// system has at least one lane gate (backend/traversability_e2e_test.go
	// pins that structurally). Without these, every loop below would pass over
	// an empty list.
	if len(body.Features) == 0 {
		t.Fatalf("the interior read for %q served ZERO features — every assertion below would be vacuous. "+
			"Body: %s", homeId, w.Body.String())
	}
	if len(body.LaneGates) == 0 {
		t.Fatalf("the interior read for %q served ZERO lane gates — the laneGates[] assertions below would "+
			"be vacuous. Body: %s", homeId, w.Body.String())
	}

	// --- features[]: the continuous fields, and none of the retired ones ----
	anyNonZeroSpace := false
	starSize := 0.0
	for i, f := range body.Features {
		id := rawString(t, f["id"])
		// RETARGETED (was: footprint/band/live must be PRESENT). 9.1 deleted
		// them; a field that reappears here is a merge that undid the
		// removal, and only a serialized real response can see it.
		for _, key := range []string{"footprint", "band", "live", "orbit", "parentId", "fixed", "asOf"} {
			if _, ok := f[key]; ok {
				t.Errorf("system-interior \"Lattice-only fields are absent from the response\": feature #%d (%q) "+
					"still carries the retired key %q. The continuous position/size/orbitElements set is the "+
					"body's only placement now. Keys served: %v", i, id, key, jsonKeys(f))
			}
		}

		// --- the continuous fields, on the same object ---------------------
		for _, key := range []string{"space", "size"} {
			if _, ok := f[key]; !ok {
				t.Errorf("system-interior \"A materialized system's read carries every body's continuous position "+
					"and size\": feature #%d (%q) carries no %q key. Keys served: %v", i, id, key, jsonKeys(f))
			}
		}
		var pos space.Vec3
		if raw, ok := f["space"]; ok {
			if err := json.Unmarshal(raw, &pos); err == nil && (pos.X != 0 || pos.Y != 0 || pos.Z != 0) {
				anyNonZeroSpace = true
			}
		}
		if rawString(t, f["type"]) == "star" {
			if raw, ok := f["size"]; ok {
				_ = json.Unmarshal(raw, &starSize)
			}
		}
	}
	// Presence alone proves nothing: if `space` were served but never
	// resolved, every body would sit at the origin and the key would be a lie
	// told with a zero value — which, now that the discrete footprint is gone,
	// is a system with every body stacked on its star.
	if !anyNonZeroSpace {
		t.Errorf("every feature's `space` is the zero vector — the continuous position is on the wire but was " +
			"never resolved, and it is now the ONLY placement a client has")
	}
	if starSize <= 0 {
		t.Errorf("the star feature's `size` = %v, want a positive radius (the size field must carry a real "+
			"value, not a placeholder zero)", starSize)
	}

	// --- laneGates[]: no cell, and the served body id -----------------------
	//
	// RETARGETED (was: every gate must carry `cell`). 9.1 deleted it and 9.1b
	// put the served body `id` in its place as the gate's only identity, so
	// the two are asserted together: the field that went and the field that
	// replaced it.
	gateIds := map[string]int{}
	for i, g := range body.LaneGates {
		dest := rawString(t, g["destSystemId"])
		if _, ok := g["cell"]; ok {
			t.Errorf("system-interior \"Lattice-only fields are absent from the response\": lane gate #%d (to %q) "+
				"still carries a `cell`. A gate is placed by `space`/`orbitElements` like any other body. "+
				"Keys served: %v", i, dest, jsonKeys(g))
		}
		for _, key := range []string{"id", "laneId", "space", "size"} {
			if _, ok := g[key]; !ok {
				t.Errorf("lane gate #%d (to %q) carries no %q key. Keys served: %v", i, dest, key, jsonKeys(g))
			}
		}
		if laneId := rawString(t, g["laneId"]); laneId == "" {
			t.Errorf("lane gate to %q: laneId is empty — it is a pure function of two known system ids and must "+
				"never zero-value", dest)
		}
		gateId := rawString(t, g["id"])
		if gateId == "" {
			t.Errorf("system-interior \"Every lane-gate body carries a non-empty, distinct id\": lane gate #%d "+
				"(to %q) has an empty `id` — with `cell` gone this is the only identity a client has for the "+
				"gate, and the string a burn order must name", i, dest)
			continue
		}
		gateIds[gateId]++
	}
	for id, n := range gateIds {
		if n > 1 {
			t.Errorf("system-interior \"Every lane-gate body carries a non-empty, distinct id\": %d lane gates "+
				"share the id %q", n, id)
		}
	}

	// --- contacts[]: always served, even when empty -------------------------
	if body.Contacts == nil {
		t.Errorf("system-interior \"Foreign Presence Is Served As System Contacts\": the response carries no "+
			"`contacts` array at all (absent or null). It is always present, never omitted, even when empty. "+
			"Body: %s", w.Body.String())
	}
}

// jsonKeys lists an object's served keys, sorted — a failure message naming
// what WAS served is what makes a dropped field diagnosable at a glance
// (dumping the raw json.RawMessage values prints byte slices).
func jsonKeys(obj map[string]json.RawMessage) []string {
	keys := make([]string, 0, len(obj))
	for k := range obj {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// rawString decodes a raw JSON value as a string, returning "" for an absent
// or non-string value rather than failing — the callers above report the
// absence themselves, with their own scenario-named message.
func rawString(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return ""
	}
	return s
}
