package main

// Additive-wire guard for openspec change replace-observation-with-sightings,
// tasks.md 8.1 — "the interior read continues to serve features[].footprint,
// features[].band (constant \"visible\"), features[].live (constant true), and
// laneGates[].cell unchanged alongside the new space/size/contacts fields —
// the live board is the only playable view until a later link deletes these."
// (system-interior: "Interior Read Endpoint" — "Pre-existing wire fields are
// unchanged"; the same requirement's "A materialized system's read carries
// every body's continuous position and size" is the ALONGSIDE half asserted
// here too, since "additive" is a claim about the two field sets TOGETHER and
// is not provable by testing either one alone.)
//
// WHY AT THIS LEVEL, AGAINST THE REAL ROUTER: the risk this guard exists for
// is a tidy-up — someone deleting `Band`/`Live`/`Footprint` from
// system/fog.go's DTO, or `Cell` from system.LaneGate, on the reasonable-
// sounding grounds that continuous space has superseded the lattice. Every
// handler-level test in `system` builds its interior from a hand-written
// fixture, so a field dropped from the DTO can only be caught by asserting on
// the SERIALIZED response of a REAL, generated, materialized interior. This
// test therefore drives SetupRouter() itself — the production composition,
// real Firestore emulator, real Firebase Auth emulator token, real generated
// system — and asserts on the raw JSON object keys, not on a Go struct that
// would silently decode a missing field as a zero value.
//
// Non-vacuity: the feature and lane-gate counts are asserted non-zero before
// anything else, so an empty response can never satisfy a per-element loop.

import (
	"encoding/json"
	"net/http"
	"sort"
	"testing"

	"hexaverse/board"
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

func TestInteriorRead_Scenario_PreExistingWireFieldsAreUnchanged(t *testing.T) {
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
		t.Fatalf("the interior read for %q served ZERO lane gates — the laneGates[].cell assertions below would "+
			"be vacuous. Body: %s", homeId, w.Body.String())
	}

	// --- features[]: the pre-existing lattice fields, unchanged -------------
	anyNonZeroSpace := false
	starSize := 0.0
	for i, f := range body.Features {
		id := rawString(t, f["id"])
		for _, key := range []string{"footprint", "band", "live"} {
			if _, ok := f[key]; !ok {
				t.Errorf("system-interior \"Pre-existing wire fields are unchanged\": feature #%d (%q) carries NO "+
					"%q key. The live board is the only playable view until a later link deletes these fields — "+
					"dropping one is a broken game, not a tidy-up. Keys served: %v", i, id, key, jsonKeys(f))
				continue
			}
		}
		// The two constants, by value — a field kept but emptied is the same
		// regression as a field deleted.
		if band := rawString(t, f["band"]); band != "visible" {
			t.Errorf("feature %q: band = %q, want the constant \"visible\"", id, band)
		}
		var live bool
		if raw, ok := f["live"]; ok {
			if err := json.Unmarshal(raw, &live); err != nil {
				t.Errorf("feature %q: live is not a bool (%s): %v", id, raw, err)
			} else if !live {
				t.Errorf("feature %q: live = false, want the constant true", id)
			}
		}
		var footprint []board.Cell
		if raw, ok := f["footprint"]; ok {
			if err := json.Unmarshal(raw, &footprint); err != nil {
				t.Errorf("feature %q: footprint does not decode as []board.Cell (%s): %v", id, raw, err)
			} else if len(footprint) == 0 {
				t.Errorf("feature %q: footprint is empty — the lattice footprint is what the live board draws "+
					"from, so an empty one is a body the player cannot see", id)
			}
		}

		// --- ALONGSIDE: the new continuous fields, on the same object -------
		for _, key := range []string{"space", "size"} {
			if _, ok := f[key]; !ok {
				t.Errorf("system-interior \"A materialized system's read carries every body's continuous position "+
					"and size\": feature #%d (%q) carries no %q key alongside its lattice footprint", i, id, key)
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
	// The additive claim is about BOTH sets being real at once: if `space` were
	// present but never resolved, every body would sit at the origin and the
	// "alongside" half would be a lie told with a zero value.
	if !anyNonZeroSpace {
		t.Errorf("every feature's `space` is the zero vector — the continuous position is on the wire but was "+
			"never resolved, so the new fields are not in fact serving alongside the lattice ones")
	}
	if starSize <= 0 {
		t.Errorf("the star feature's `size` = %v, want a positive radius (the new size field must carry a real "+
			"value, not a placeholder zero)", starSize)
	}

	// --- laneGates[]: the pre-existing cell, unchanged ----------------------
	for i, g := range body.LaneGates {
		dest := rawString(t, g["destSystemId"])
		if _, ok := g["cell"]; !ok {
			t.Errorf("system-interior \"Pre-existing wire fields are unchanged\": lane gate #%d (to %q) carries "+
				"NO `cell` key — the live board draws every gate from it. Keys served: %v", i, dest, jsonKeys(g))
			continue
		}
		var cell board.Cell
		if err := json.Unmarshal(g["cell"], &cell); err != nil {
			t.Errorf("lane gate to %q: cell does not decode as a board.Cell (%s): %v", dest, g["cell"], err)
			continue
		}
		if cell.Ring <= 0 {
			t.Errorf("lane gate to %q: cell = %+v, want a gate-ring cell (board.GateRing(radius) is >= 1, never "+
				"the core cell) — a zeroed cell is a dropped field wearing a zero value", dest, cell)
		}
		for _, key := range []string{"laneId", "space", "size"} {
			if _, ok := g[key]; !ok {
				t.Errorf("lane gate #%d (to %q) carries no %q key alongside its cell", i, dest, key)
			}
		}
		if laneId := rawString(t, g["laneId"]); laneId == "" {
			t.Errorf("lane gate to %q: laneId is empty — it is a pure function of two known system ids and must "+
				"never zero-value", dest)
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
