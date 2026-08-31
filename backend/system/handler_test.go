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
	tiers map[string]observation.Tier
}

func (f fakeBoardFog) SystemTiers(context.Context, string) (map[string]observation.Tier, error) {
	return f.tiers, nil
}

type sysTestClock struct{}

func (sysTestClock) Now() common.WorldMillis               { return 0 }
func (sysTestClock) FromWall(time.Time) common.WorldMillis { return 0 }
func (sysTestClock) Scale() float64                        { return 1 }

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
