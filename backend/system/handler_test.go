package system

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"hexaverse/action"
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
		Interior: SystemInterior{SystemId: "s1", Radius: 16},
		Features: []Feature{
			{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
			{Id: "feat-body-0", Type: FeatureRocky, Orbit: &Orbit{Ring: 3, Angle0: 0, Period: 0, Dir: 1}, Footprint: []board.Cell{{Ring: 3, Slot: 0}}},
			{Id: "feat-belt-0", Type: FeatureBelt, Orbit: &Orbit{Ring: 5, Angle0: 0, Period: 0, Dir: 1}, Footprint: []board.Cell{{Ring: 5, Slot: 0}}},
		},
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user1")
		c.Set(common.CorpIdKey, "corp-user1") // #0009: ActorCorp now reads the resolved corp id
	})
	NewHandlerWith(&fakeSysSvc{gen: gen}, sysTestClock{}).
		WithFog(fakeBoardFog{cov: observation.NewCoverage(0, board.ProductionSchedule())}).
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
		{DestSystemId: "sys-known", Cell: board.Cell{Ring: 16, Slot: 0}},
		{DestSystemId: "sys-dark", Cell: board.Cell{Ring: 16, Slot: 48}},
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user1")
		c.Set(common.CorpIdKey, "corp-user1") // #0009: ActorCorp now reads the resolved corp id
	})
	NewHandlerWith(&fakeSysSvc{gen: gen, gates: gates}, sysTestClock{}).
		WithFog(fakeBoardFog{
			cov:   observation.NewCoverage(0, board.ProductionSchedule()),
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

type fakeDueActions struct{ scopes []string }

func (f *fakeDueActions) ResolveDue(_ context.Context, scope string) ([]action.Action, error) {
	f.scopes = append(f.scopes, scope)
	return nil, nil
}

// TestGetInterior_RunsTheReadFold proves the interior read resolves the
// scope's due actions BEFORE serving (#0005): a scan that finished on a quiet
// board settles — slot freed, reveal minted — on the very read the client's
// poll/eta refetch issues, instead of waiting for another verb or the sweep.
func TestGetInterior_RunsTheReadFold(t *testing.T) {
	gen := &GeneratedInterior{Interior: SystemInterior{SystemId: "s1", Radius: 16}}
	due := &fakeDueActions{}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	NewHandlerWith(&fakeSysSvc{gen: gen}, sysTestClock{}).
		WithActions(due).
		RegisterRoutes(r.Group("/"))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/systems/s1", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if len(due.scopes) != 1 || due.scopes[0] != "s1" {
		t.Fatalf("read fold ran for scopes %v, want exactly [s1]", due.scopes)
	}
}
