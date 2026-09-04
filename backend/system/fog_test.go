package system

// RED-phase tests for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 7.7 (design.md Decision 11; specs/system-interior/spec.md ADDED
// requirement "Interior Reads Are Fully Disclosed, A Deliberate Interim").
//
// `system`'s three-band fog projection (fog.go/fog_source.go/handler.go) is
// replaced by an unfogged interim read: every feature of a materialized
// interior ships in full — geometry, composition, threat detail — to every
// authenticated requester, computing no band assignment and omitting no
// feature.
//
// EXPECTED TO FAIL ON FIRST RUN (behavioral gap, not a compile error): as of
// this SDET pass, handler.go still branches on the requester's resolved corp
// id — a spawned requester with fog wired gets `projectFogged` (the doomed
// three-band projection, which drops a never-observed detail feature
// entirely and withholds composition from anything short of a scanned
// observation); only a corpless requester already gets the full read via
// `projectUnfogged`. These tests exercise the SPAWNED path specifically —
// with a fog wired that reports zero coverage and zero remembered features,
// the worst case for the doomed projection — because that is exactly where
// today's behavior and the interim requirement diverge.
//
// Reuses fakeSysSvc/sysTestClock from handler_test.go (same package, same
// test binary).

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"hexaverse/board"
	"hexaverse/common"

	"github.com/gin-gonic/gin"
)

// fullDisclosureInterior builds a materialized interior with three features:
// the star and a major body (both on the free astronomical layer even under
// the doomed projection — NOT what distinguishes the interim) and a belt
// that has never been scanned or ambiently swept (no stored observation at
// all) — the feature the doomed projection drops outright, and whose
// composition (Resources/Effects) the doomed projection would withhold even
// if it somehow shipped.
func fullDisclosureInterior() *GeneratedInterior {
	return &GeneratedInterior{
		Interior: SystemInterior{SystemId: "s1", Radius: 16},
		Features: []Feature{
			{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
			{Id: "feat-body-0", Type: FeatureRocky, Orbit: &Orbit{Ring: 3, Angle0: 0, Period: 0, Dir: 1},
				Footprint: []board.Cell{{Ring: 3, Slot: 0}},
				Resources: []Resource{{Kind: ResourceMetals, Richness: 0.7}}},
			{Id: "feat-belt-0", Type: FeatureBelt, Orbit: &Orbit{Ring: 8, Angle0: 1, Period: 0, Dir: 1},
				Footprint: []board.Cell{{Ring: 8, Slot: 0}},
				Resources: []Resource{{Kind: ResourceVolatiles, Richness: 0.9}},
				Effects:   &Effects{Block: true}},
		},
	}
}

type interimFeatureDTO struct {
	Id        string     `json:"id"`
	Resources []Resource `json:"resources,omitempty"`
	Effects   *Effects   `json:"effects,omitempty"`
}

type interimBody struct {
	Features []interimFeatureDTO `json:"features"`
}

// spawnedInteriorRequest performs GET /systems/s1 as an authenticated,
// spawned requester (a resolved corp id) with a fog wired that reports zero
// coverage and zero remembered features — the input a requester with no
// sensor history at all supplies.
func spawnedInteriorRequest(t *testing.T, gen *GeneratedInterior) interimBody {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user1")
		c.Set(common.CorpIdKey, "corp-user1")
	})
	NewHandlerWith(&fakeSysSvc{gen: gen}, sysTestClock{}).
		RegisterRoutes(r.Group("/"))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/systems/s1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var body interimBody
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return body
}

// corplessInteriorRequest performs GET /systems/s1 as an authenticated but
// corpless requester (no resolved corp id) — with the SAME fog wired, so
// only the requester's corp status differs from spawnedInteriorRequest.
func corplessInteriorRequest(t *testing.T, gen *GeneratedInterior) interimBody {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user1")
		// deliberately no CorpIdKey — common.ActorCorp(c) resolves ""
	})
	NewHandlerWith(&fakeSysSvc{gen: gen}, sysTestClock{}).
		RegisterRoutes(r.Group("/"))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/systems/s1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var body interimBody
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return body
}

// Scenario: An authenticated, spawned requester receives every feature in full
func TestGetInterior_Scenario_SpawnedRequesterReceivesEveryFeatureInFull(t *testing.T) {
	gen := fullDisclosureInterior()
	body := spawnedInteriorRequest(t, gen)

	if len(body.Features) != len(gen.Features) {
		t.Fatalf("spawned requester got %d features, want %d (every feature of the materialized interior, "+
			"regardless of sensor coverage or scan history)", len(body.Features), len(gen.Features))
	}
	byID := map[string]interimFeatureDTO{}
	for _, f := range body.Features {
		byID[f.Id] = f
	}
	body0 := byID["feat-body-0"]
	if len(body0.Resources) != 1 || body0.Resources[0].Kind != ResourceMetals {
		t.Errorf("feat-body-0 resources = %v, want full composition [metals], regardless of coverage", body0.Resources)
	}
	belt := byID["feat-belt-0"]
	if len(belt.Resources) != 1 || belt.Resources[0].Kind != ResourceVolatiles {
		t.Errorf("feat-belt-0 resources = %v, want full composition [volatiles]", belt.Resources)
	}
	if belt.Effects == nil || !belt.Effects.Block {
		t.Errorf("feat-belt-0 effects = %v, want threat detail (Block: true) shipped in full", belt.Effects)
	}
}

// Scenario: No feature is omitted for lack of a stored observation
func TestGetInterior_Scenario_NoFeatureOmittedForLackOfObservation(t *testing.T) {
	gen := fullDisclosureInterior() // feat-belt-0 has never been observed, scanned, or remembered
	body := spawnedInteriorRequest(t, gen)

	byID := map[string]interimFeatureDTO{}
	for _, f := range body.Features {
		byID[f.Id] = f
	}
	belt, present := byID["feat-belt-0"]
	if !present {
		t.Fatalf("feat-belt-0 (never observed) was omitted from the response — every feature must ship "+
			"in full regardless of stored-observation history, got features %v", body.Features)
	}
	if len(belt.Resources) == 0 {
		t.Errorf("feat-belt-0 shipped with no composition — a never-observed feature must still ship in full, " +
			"not reduced to astronomical-only geometry")
	}
}

// Scenario: The interim applies uniformly, corpless or not
func TestGetInterior_Scenario_InterimAppliesUniformlyCorplessOrNot(t *testing.T) {
	spawned := spawnedInteriorRequest(t, fullDisclosureInterior())
	corpless := corplessInteriorRequest(t, fullDisclosureInterior())

	normalize := func(b interimBody) map[string]interimFeatureDTO {
		m := map[string]interimFeatureDTO{}
		for _, f := range b.Features {
			m[f.Id] = f
		}
		return m
	}
	spawnedByID, corplessByID := normalize(spawned), normalize(corpless)

	if len(spawnedByID) != len(corplessByID) {
		t.Fatalf("spawned requester got %d features, corpless got %d — the interim must apply uniformly "+
			"(no per-requester band distinction)", len(spawnedByID), len(corplessByID))
	}
	for id, corplessFeat := range corplessByID {
		spawnedFeat, ok := spawnedByID[id]
		if !ok {
			t.Errorf("feature %s shipped to the corpless requester but omitted for the spawned one — "+
				"the interim must not distinguish by requester", id)
			continue
		}
		if len(spawnedFeat.Resources) != len(corplessFeat.Resources) {
			t.Errorf("feature %s: spawned requester's resources = %v, corpless requester's = %v — "+
				"must be identical (no per-requester band distinction)", id, spawnedFeat.Resources, corplessFeat.Resources)
		}
	}
}
