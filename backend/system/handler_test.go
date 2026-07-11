package system

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"

	"github.com/gin-gonic/gin"
)

type fakeSysSvc struct {
	gen   *GeneratedInterior
	err   error
	gates []LaneGate
}

func (f *fakeSysSvc) GetOrCreateInterior(context.Context, string) (*GeneratedInterior, error) {
	return f.gen, f.err
}
func (f *fakeSysSvc) LaneGates(context.Context, string, int) ([]LaneGate, error) {
	return f.gates, nil
}

type fakeBoardFog struct {
	cov        observation.Coverage
	remembered map[string]observation.FeatureMemory
	tiers      map[string]observation.Tier
}

func (f fakeBoardFog) Coverage(context.Context, string, string, common.WorldMillis) (observation.Coverage, error) {
	return f.cov, nil
}
func (f fakeBoardFog) RememberedFeatures(context.Context, string, string) (map[string]observation.FeatureMemory, error) {
	return f.remembered, nil
}
func (f fakeBoardFog) SystemTiers(context.Context, string) (map[string]observation.Tier, error) {
	return f.tiers, nil
}

type sysTestClock struct{}

func (sysTestClock) Now() common.WorldMillis               { return 0 }
func (sysTestClock) FromWall(time.Time) common.WorldMillis { return 0 }
func (sysTestClock) Scale() float64                        { return 1 }

// TestGetInterior_FogsToAstronomicalLayer proves an interior read with no
// coverage and no memory ships only the free astronomical layer (star + major
// bodies), dropping unseen detail features — server-authoritative filtering.
func TestGetInterior_FogsToAstronomicalLayer(t *testing.T) {
	gen := &GeneratedInterior{
		Interior: SystemInterior{SystemId: "s1"},
		Features: []Feature{
			{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []Hex{{Q: 0, R: 0}}},
			{Id: "feat-body-0", Type: FeatureRocky, Orbit: &Orbit{Ring: 3, Angle0: 0, Period: 0, Dir: 1}, Footprint: []Hex{{Q: 3, R: 0}}},
			{Id: "feat-belt-0", Type: FeatureBelt, Orbit: &Orbit{Ring: 5, Angle0: 0, Period: 0, Dir: 1}, Footprint: []Hex{{Q: 5, R: 0}}},
		},
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set(common.AccountIdKey, "user1") })
	NewHandlerWith(&fakeSysSvc{gen: gen}, sysTestClock{}).
		WithFog(fakeBoardFog{cov: observation.NewCoverage(0)}).
		RegisterRoutes(r.Group("/"))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/systems/s1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body struct {
		Features []struct {
			Id   string `json:"id"`
			Band string `json:"band"`
		} `json:"features"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	bands := map[string]string{}
	for _, f := range body.Features {
		bands[f.Id] = f.Band
	}
	if len(body.Features) != 2 {
		t.Fatalf("got %d features, want 2 (star + major body; belt is unseen)", len(body.Features))
	}
	if bands["feat-star"] != "astronomical" || bands["feat-body-0"] != "astronomical" {
		t.Errorf("major bodies should ship on the free astronomical layer, got %v", bands)
	}
	if _, leaked := bands["feat-belt-0"]; leaked {
		t.Errorf("an unseen detail feature leaked past the fog filter")
	}
}

// TestGetInterior_LaneGatesFogFilterToCharted proves the interior read ships lane
// gates, filtered to the requester's charted neighbours — a Rumored/Explored lane
// shows, an uncharted (star-visible) one never leaks.
func TestGetInterior_LaneGatesFogFilterToCharted(t *testing.T) {
	gen := &GeneratedInterior{Interior: SystemInterior{SystemId: "s1", Radius: 16}}
	gates := []LaneGate{
		{DestSystemId: "sys-known", Hex: board.Hex{Q: 16, R: 0}},
		{DestSystemId: "sys-dark", Hex: board.Hex{Q: -16, R: 0}},
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set(common.AccountIdKey, "user1") })
	NewHandlerWith(&fakeSysSvc{gen: gen, gates: gates}, sysTestClock{}).
		WithFog(fakeBoardFog{
			cov:   observation.NewCoverage(0),
			tiers: map[string]observation.Tier{"sys-known": observation.TierRumored},
		}).
		RegisterRoutes(r.Group("/"))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/systems/s1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body struct {
		LaneGates []struct {
			DestSystemId string `json:"destSystemId"`
		} `json:"laneGates"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(body.LaneGates) != 1 || body.LaneGates[0].DestSystemId != "sys-known" {
		t.Fatalf("gates = %+v, want only the charted sys-known", body.LaneGates)
	}
}
