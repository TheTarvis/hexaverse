package system

import (
	"reflect"
	"sort"
	"strings"
	"testing"
)

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `system-interior`, requirement *Interior Read Serves Continuous
// Bodies*, scenario "Lattice-only fields are absent from the response"
// (tasks.md 9.1, 9.2).
//
// WHY REFLECTION OVER THE STRUCT TAGS RATHER THAN A MARSHALLED SAMPLE.
// Several of the fields this change removes carry `omitempty` (`orbit`,
// `parentId`, `fixed`, `asOf`), so a zero-valued instance marshals WITHOUT
// them and a JSON-of-an-instance assertion would report a pass while the
// fields were still on the type and still populated for a real body. Walking
// the type's own json tags sees every field regardless of value, which is
// what "the response SHALL carry no ..." actually means.
//
// This test compiles both BEFORE and AFTER the removal: it names no field
// identifier, only json tag strings. Before the removal it fails, listing the
// surviving retired keys. After it passes, and it then keeps passing only
// while nothing reintroduces one.
//
// VACUITY NOTE: the assertions are EXACT SET EQUALITY, not "does not
// contain". A test asserting only absence would pass against a DTO that had
// also lost `orbitElements`, `extent` or `space` — i.e. against a response
// that broke the renderer this change exists to build. Equality catches both
// directions.

// jsonKeys returns the json tag name of every field on a struct type, in
// declaration order, ignoring `-` and embedded-anonymous cases (there are
// none on these DTOs).
func jsonKeys(t *testing.T, v any) []string {
	t.Helper()
	rt := reflect.TypeOf(v)
	if rt.Kind() != reflect.Struct {
		t.Fatalf("jsonKeys: %T is not a struct", v)
	}
	out := make([]string, 0, rt.NumField())
	for i := 0; i < rt.NumField(); i++ {
		f := rt.Field(i)
		tag := f.Tag.Get("json")
		if tag == "-" || tag == "" {
			continue
		}
		name := strings.Split(tag, ",")[0]
		if name == "" {
			continue
		}
		out = append(out, name)
	}
	return out
}

func assertKeySet(t *testing.T, what string, got, want []string) {
	t.Helper()
	g := append([]string(nil), got...)
	w := append([]string(nil), want...)
	sort.Strings(g)
	sort.Strings(w)
	if !reflect.DeepEqual(g, w) {
		t.Errorf("%s wire keys mismatch\n  got:  %v\n  want: %v", what, g, w)
	}
}

// Scenario: Lattice-only fields are absent from the response
func TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse(t *testing.T) {
	// The keys that change deletes, named exactly as the requirement and
	// tasks.md 9.1 name them.
	removedFromBody := []string{"footprint", "orbit", "parentId", "fixed", "band", "live", "asOf"}
	removedFromGate := []string{"cell"}
	removedFromResponse := []string{"radius"}

	t.Run("Scenario: Lattice-only fields are absent from the response (a feature body)", func(t *testing.T) {
		keys := jsonKeys(t, fogFeatureDTO{})
		for _, k := range removedFromBody {
			for _, got := range keys {
				if got == k {
					t.Errorf("a feature body still serves the retired key %q; %v", k, keys)
				}
			}
		}
		// EXACT survivors (tasks.md 9.1). `ownerCorpId` is deliberately NOT
		// here: it lives on the `system.Feature` domain model and has never
		// been on this DTO, so there is nothing to preserve.
		assertKeySet(t, "fogFeatureDTO", keys, []string{
			"id", "type", "resources", "effects", "space", "size", "orbitElements", "catalogueRef", "generatedName", "name", "namingProtected", "ownerCorpId", "canName", "discovery",
		})
	})

	t.Run("Scenario: Lattice-only fields are absent from the response (a lane-gate body)", func(t *testing.T) {
		keys := jsonKeys(t, LaneGate{})
		for _, k := range removedFromGate {
			for _, got := range keys {
				if got == k {
					t.Errorf("a lane-gate body still serves the retired key %q; %v", k, keys)
				}
			}
		}
		// `id` joins the survivor set as of tasks.md 9.1b (adjudicated
		// 2026-09-03, AFTER this file's red handoff): the gate body id is
		// the string a burn order names and the string fleet.AttachedTo
		// reports, and once `cell` is gone it is the ONLY identity a client
		// has for a gate. It is served, never re-derived client-side —
		// interior_gate_body_id_e2e_test.go pins the equality that makes
		// this key load-bearing rather than decorative.
		assertKeySet(t, "LaneGate", keys, []string{
			"id", "destSystemId", "laneId", "space", "size", "orbitElements", "name", "catalogueRef",
		})
	})

	t.Run("Scenario: Lattice-only fields are absent from the response (the top-level response)", func(t *testing.T) {
		keys := jsonKeys(t, interiorDTO{})
		for _, k := range removedFromResponse {
			for _, got := range keys {
				if got == k {
					t.Errorf("the interior response still serves the retired key %q — the continuous "+
						"`extent` is its successor, and serving both leaves a consumer free to scale "+
						"continuous space off the retired ordinal; keys: %v", k, keys)
				}
			}
		}
		assertKeySet(t, "interiorDTO", keys, []string{
			"systemId", "extent", "character", "starClass",
			"features", "laneGates", "contacts", "worldTime", "scale",
		})
	})
}

// The continuous half of the same requirement, pinned in the same place so a
// removal that overshoots is caught by the change that performs it.
//
// Scenario: The read carries the interior's continuous extent
// Scenario: The read carries the world clock's scale alongside its world time
// Scenario: A non-star body's read carries its full orbital element set
// Scenario: A lane-gate body's read carries its full orbital element set
func TestInteriorRead_ContinuousFieldsSurviveTheRemoval(t *testing.T) {
	t.Run("Scenario: The read carries the interior's continuous extent", func(t *testing.T) {
		if !hasKey(jsonKeys(t, interiorDTO{}), "extent") {
			t.Fatal("the interior response must still carry the continuous `extent` — it is what a " +
				"client scales its camera, pan bound and pick radius against once the discrete " +
				"`radius` is gone")
		}
	})

	t.Run("Scenario: The read carries the world clock's scale alongside its world time", func(t *testing.T) {
		keys := jsonKeys(t, interiorDTO{})
		if !hasKey(keys, "scale") || !hasKey(keys, "worldTime") {
			t.Fatalf("the interior response must carry both `scale` and `worldTime`; got %v", keys)
		}
	})

	t.Run("Scenario: A non-star body's read carries its full orbital element set", func(t *testing.T) {
		if !hasKey(jsonKeys(t, fogFeatureDTO{}), "orbitElements") {
			t.Fatal("a feature body must still carry `orbitElements`")
		}
		assertKeySet(t, "orbitElementsDTO", jsonKeys(t, orbitElementsDTO{}), []string{
			"parentId", "radius", "periodMs", "phase", "inclination", "node",
		})
	})

	t.Run("Scenario: A lane-gate body's read carries its full orbital element set", func(t *testing.T) {
		if !hasKey(jsonKeys(t, LaneGate{}), "orbitElements") {
			t.Fatal("a lane-gate body must still carry `orbitElements`")
		}
	})

	t.Run("Scenario: A materialized system's read carries every body's continuous position and size", func(t *testing.T) {
		for _, c := range []struct {
			what string
			keys []string
		}{
			{"fogFeatureDTO", jsonKeys(t, fogFeatureDTO{})},
			{"LaneGate", jsonKeys(t, LaneGate{})},
		} {
			if !hasKey(c.keys, "space") || !hasKey(c.keys, "size") {
				t.Errorf("%s must carry both `space` and `size`; got %v", c.what, c.keys)
			}
		}
	})
}

func hasKey(keys []string, want string) bool {
	for _, k := range keys {
		if k == want {
			return true
		}
	}
	return false
}
