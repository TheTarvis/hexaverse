package fleet

// RED-phase tests for openspec change serve-orbital-elements-and-burn-preview,
// tasks.md 1.10 / 5.4 — fleet-movement's ADDED requirement "Fleet Reads Serve
// the Simulation Clock's Scale Alongside Their World Time".
//
// WHY AT THE HANDLER LEVEL RATHER THAN e2e. The scenario's GIVEN is "a world
// whose simulation clock runs at a scale other than 1". The process-wide clock
// (common.WorldClock()) is a sync.Once singleton built from
// config.ServiceConfig.WorldTimeScale, which the test environment fixes at 1
// (backend/.env.test sets no WORLD_TIME_SCALE) and which cannot be re-scaled
// inside one test binary. fleet.NewHandlerWith's injected clock is therefore
// the ONLY seam in this codebase that can express a warped world at all — an
// e2e variant of this scenario could assert nothing beyond "scale == 1", which
// is the OTHER scenario. Both are covered here; the unwarped one is
// additionally covered end to end, through the production router, in
// backend/burn_preview_e2e_test.go's fleet-read assertions.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"hexaverse/common"
	"hexaverse/space"

	"github.com/gin-gonic/gin"
)

// scaleClock reports whatever scale a test asks for.
type scaleClock struct {
	now   common.WorldMillis
	scale float64
}

func (c scaleClock) Now() common.WorldMillis               { return c.now }
func (c scaleClock) FromWall(time.Time) common.WorldMillis { return c.now }
func (c scaleClock) Scale() float64                        { return c.scale }

// scaledFleetRouter mirrors newFleetRouter (handler_test.go) but with a clock
// whose scale a test controls, and with an optional corpless requester so the
// list read's own corpless early-return branch — which emits its OWN
// worldTime, separately from the main path — is reachable.
func scaledFleetRouter(svc ServiceInterface, clk common.WorldTime, corpless bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user1")
		if !corpless {
			c.Set(common.CorpIdKey, "corp-user1")
		}
	})
	NewHandlerWith(svc, clk).RegisterRoutes(r.Group("/"))
	return r
}

func scaleFleetFixture() *fakeFleetSvc {
	f := &Fleet{
		Id: "fleet_1", CorporationId: "corp-user1", SystemId: "s1",
		Cargo: map[string]float64{"fuel": 10},
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 1e6}}},
	}
	return &fakeFleetSvc{fleet: f, list: []Fleet{*f}}
}

// readScale issues one request and returns the raw top-level object, so
// "key absent" is distinguishable from "present and zero".
func readScale(t *testing.T, r *gin.Engine, path string) map[string]json.RawMessage {
	t.Helper()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("GET %s: status = %d, body = %s", path, w.Code, w.Body.String())
	}
	var out map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("GET %s: decoding response as a raw object: %v\nbody: %s", path, err, w.Body.String())
	}
	if _, ok := out["worldTime"]; !ok {
		t.Fatalf("GET %s carries no `worldTime` at all — this response is not one of the reads the "+
			"requirement is about, so the fixture is wrong, not the behaviour", path)
	}
	return out
}

func assertScale(t *testing.T, body map[string]json.RawMessage, path string, want float64) {
	t.Helper()
	raw, ok := body["scale"]
	if !ok {
		keys := make([]string, 0, len(body))
		for k := range body {
			keys = append(keys, k)
		}
		t.Errorf("GET %s carries no `scale` key alongside its `worldTime` (world clock scale = %v). A "+
			"client anchoring to this reading and extrapolating live world time between reads projects "+
			"at an assumed rate of 1. Served keys: %v", path, want, keys)
		return
	}
	var got float64
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Errorf("GET %s: decoding `scale`: %v (raw %s)", path, err, string(raw))
		return
	}
	if got != want {
		t.Errorf("GET %s: scale = %v, want %v — the scale served must be the scale of the SAME clock "+
			"that read's worldTime was taken from", path, got, want)
	}
}

// Scenario: A fleet read carries the world clock's scale
func TestFleetRead_Scenario_AFleetReadCarriesTheWorldClocksScale(t *testing.T) {
	const warped = 12.5
	r := scaledFleetRouter(scaleFleetFixture(), scaleClock{now: 90_000, scale: warped}, false)

	for _, path := range []string{
		"/fleets/fleet_1",
		"/fleets?mine=true",
		"/fleets?systemId=s1",
	} {
		body := readScale(t, r, path)
		assertScale(t, body, path, warped)
	}
}

// Scenario: The scale is served even on an unwarped world
func TestFleetRead_Scenario_TheScaleIsServedEvenOnAnUnwarpedWorld(t *testing.T) {
	r := scaledFleetRouter(scaleFleetFixture(), scaleClock{now: 90_000, scale: 1}, false)

	for _, path := range []string{
		"/fleets/fleet_1",
		"/fleets?mine=true",
		"/fleets?systemId=s1",
	} {
		body := readScale(t, r, path)
		if _, ok := body["scale"]; !ok {
			t.Errorf("GET %s omits `scale` on a world running at exactly 1. The requirement is that it is "+
				"served UNCONDITIONALLY, \"so a client never has to distinguish \\\"scale 1\\\" from "+
				"\\\"scale absent\\\"\"", path)
			continue
		}
		assertScale(t, body, path, 1)
	}
}

// SDET-ADDED (beyond the literal scenarios, same requirement): the list read's
// CORPLESS branch returns early with its own hand-built
// `{"fleets": [], "worldTime": ...}` literal, on a different line of
// handler.go from the main path. A `scale` added only to the main path leaves
// exactly the shape the requirement forbids — a fleet-read response carrying a
// worldTime with no scale beside it — on the branch a player hits during the
// wake-up flow.
func TestFleetRead_SDETAdded_TheCorplessListBranchAlsoCarriesTheScale(t *testing.T) {
	const warped = 3.0
	r := scaledFleetRouter(scaleFleetFixture(), scaleClock{now: 5, scale: warped}, true)
	body := readScale(t, r, "/fleets?mine=true")
	assertScale(t, body, "/fleets?mine=true (corpless)", warped)
}
