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

// fakeBoardFog satisfies system.BoardFog — an empty interface{} since
// replace-observation-with-sightings tasks.md 1.3 deleted the interior
// read's tier lookup call site (design.md Decision 5). Its SystemTiers
// method is therefore dead — kept only so this fixture still reads as "a fog
// dependency" at the call site below — and its tier value type is a plain
// string (not charts.Tier) since nothing here ranks it.
type fakeBoardFog struct {
	tiers map[string]string
}

func (f fakeBoardFog) SystemTiers(context.Context, string) (map[string]string, error) {
	return f.tiers, nil
}

type sysTestClock struct{}

func (sysTestClock) Now() common.WorldMillis               { return 0 }
func (sysTestClock) FromWall(time.Time) common.WorldMillis { return 0 }
func (sysTestClock) Scale() float64                        { return 1 }

// TestGetInterior_LaneGatesFogFilterToCharted (DELETED — replace-observation-
// with-sightings tasks.md 1.3) used to prove the interior read filtered lane
// gates to the requester's charted neighbours. That is now the removed
// behavior: system-interior's own "Charted Lane Gate Filtering" requirement
// is REMOVED by this change (design.md Decision 5) — "every system's star
// already ships to everyone... standing next to a physical gate and reading
// the sign on it tells you where the road goes." This test asserted the
// OPPOSITE of the new "Bodies Are Public; Ships Are Disclosed" /
// system-body-table "unfiltered" requirements below, so it is deleted
// outright rather than inverted (test-immutability protocol: an authorized
// change, cause = the spec removed the requirement this test pinned).

// Scenario: No body is omitted for lack of stored knowledge (system-interior)
// / The table carries bodies the requester could not see (system-body-table)
// — applied to the interior read's laneGates array, replace-observation-
// with-sightings tasks.md 1.3, closing blocker 2. A corp with ZERO stored
// knowledge (no tier for either neighbour) must still see every lane-gate
// body — chartedGates' filtering is exactly what made a fresh corp's galaxy
// untraversable (every gate invisible, nothing to jump to).
func TestGetInterior_Scenario_NoLaneGateOmittedForLackOfCharting(t *testing.T) {
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
	// ZERO stored knowledge for either neighbour — this is exactly a freshly
	// spawned corporation's state (spawn charts no lanes, and the deleted
	// scan-charting writer means nothing else charts one either): the tier
	// map is present but empty, so chartedGates() (if it still ran) would
	// keep neither gate.
	NewHandlerWith(&fakeSysSvc{gen: gen, gates: gates}, sysTestClock{}).
		WithFog(fakeBoardFog{tiers: map[string]string{}}).
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
	if len(body.LaneGates) != 2 {
		t.Fatalf("gates = %+v, want BOTH gates present despite zero stored knowledge of either neighbour "+
			"(system-interior \"Bodies Are Public; Ships Are Disclosed\": \"No body is omitted for lack of "+
			"stored knowledge\") — a fresh corporation with zero charted lanes must still see every lane-gate "+
			"body to have anything to jump to (blocker 2)", body.LaneGates)
	}
}

// Scenario: The rule applies uniformly, corpless or not (system-interior
// "Bodies Are Public; Ships Are Disclosed") — NOT independently automated as
// a new red test here: today's handler.go already skips the whole
// tier/chartedGates block when no corp id resolves (`if cid := ...; cid !=
// ""`), so a corpless requester already sees every gate unfiltered before
// this change lands — this specific sub-scenario is incidentally green
// already, not newly red, and would only regress if a future edit moved the
// gating outside that guard. Recorded here rather than omitted silently; see
// the SDET handoff report's coverage table.

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
