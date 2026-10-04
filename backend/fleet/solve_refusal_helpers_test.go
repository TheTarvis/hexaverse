package fleet

// Shared scaffolding for openspec change fix-burn-order-geometry-refusals,
// fleet-movement refusal tests (tasks 2.1-2.9). The real Service sits behind
// the real Handler and the real ownership seam (commandedFleetId), with a mock
// DAO that serves clones of stored fleets and has NO write path: any DAO call
// other than Get fails the test, so "stored state unchanged" is proven by the
// absence of a write, and a refused order that touched a channel, an action or
// fuel fails through the fake action spine.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
	"hexaverse/system"

	"github.com/gin-gonic/gin"
	"go.uber.org/mock/gomock"
)

// The four served reason texts, typed out from design.md Decision 6 (and
// impl-contract 3.1). They are pinned literals, deliberately not read back
// from the sentinels, so a drifting sentinel text fails the suite.
const (
	reasonOrigin      = "fleet: burn origin is at or inside the star-clearance radius"
	reasonDestination = "fleet: burn destination is at or inside the star-clearance radius"
	reasonMinArc      = "fleet: burn curve is below the minimum arc length"
	reasonAbsent      = "fleet: target body is not present in this system"
)

const refusalOwnerCorp = "corp-user1"

type refusalEnv struct {
	t      *testing.T
	svc    *Service
	fa     *fakeActions
	clk    *fakeClock
	stored map[string]*Fleet
	snap   map[string]Fleet
}

func cloneFleet(f *Fleet) *Fleet {
	c := *f
	if f.Cargo != nil {
		c.Cargo = map[string]float64{}
		for k, v := range f.Cargo {
			c.Cargo[k] = v
		}
	}
	return &c
}

// newRefusalEnv wires the real Service over bt with the clock at now.
func newRefusalEnv(t *testing.T, now common.WorldMillis, bt *system.BodyTable, fleets ...*Fleet) *refusalEnv {
	t.Helper()
	ctrl := gomock.NewController(t)
	dao := NewMockDao(ctrl)
	fa := &fakeActions{}
	clk := &fakeClock{now: now}
	e := &refusalEnv{t: t, fa: fa, clk: clk, stored: map[string]*Fleet{}, snap: map[string]Fleet{}}
	for _, f := range fleets {
		e.stored[f.Id] = cloneFleet(f)
		e.snap[f.Id] = *cloneFleet(f)
	}
	dao.EXPECT().Get(gomock.Any(), gomock.Any()).DoAndReturn(func(_ context.Context, id string) (*Fleet, error) {
		f, ok := e.stored[id]
		if !ok {
			return nil, nil
		}
		return cloneFleet(f), nil
	}).AnyTimes()
	e.svc = NewServiceWith(dao, stubBodySourceFixed{bt: bt}, fakeGraphUnused{}, fa, clk)
	return e
}

// router serves the real handler for requester corp ("" = no corporation).
func (e *refusalEnv) router(corp string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "user1")
		if corp != "" {
			c.Set(common.CorpIdKey, corp)
		}
	})
	NewHandlerWith(e.svc, e.clk).RegisterRoutes(r.Group("/"))
	return r
}

func (e *refusalEnv) post(r *gin.Engine, path string, body []byte) (int, []byte) {
	e.t.Helper()
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w.Code, w.Body.Bytes()
}

func pointOrder(x, y, z float64) []byte {
	p := space.Vec3{X: x, Y: y, Z: z}
	b, _ := json.Marshal(OrderRequest{Point: &p})
	return b
}

func bodyOrder(id string) []byte {
	b, _ := json.Marshal(OrderRequest{BodyId: id})
	return b
}

// reasonOf decodes the `error` field of a refusal body ("" if absent).
func reasonOf(t *testing.T, body []byte) string {
	t.Helper()
	var out struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return ""
	}
	return out.Error
}

// assertRefused asserts status and the exact served `error` reason, and that
// the body is exactly {"error": "<reason>"} (no added field).
func assertRefused(t *testing.T, what string, status int, body []byte, wantStatus int, wantReason string) {
	t.Helper()
	if status != wantStatus {
		t.Errorf("%s: status = %d, want %d (body %q)", what, status, wantStatus, body)
		return
	}
	if got := reasonOf(t, body); got != wantReason {
		t.Errorf("%s: error reason = %q, want %q (body %q)", what, got, wantReason, body)
	}
	var m map[string]any
	if err := json.Unmarshal(body, &m); err != nil || len(m) != 1 {
		t.Errorf("%s: body = %q, want exactly {\"error\": ...} with no added field", what, body)
	}
}

// assertNothingChanged: no commit, no cancel, no spine resolve, and the stored
// record equals its snapshot (the mock DAO has no write path, so a write
// would already have failed the test).
func (e *refusalEnv) assertNothingChanged(id string) {
	e.t.Helper()
	if e.fa.committed != nil {
		e.t.Errorf("a refused request committed an action: %+v", e.fa.committed)
	}
	if len(e.fa.cancelled) != 0 || len(e.fa.resolved) != 0 {
		e.t.Errorf("a refused request touched the action spine: cancelled=%v resolved=%v", e.fa.cancelled, e.fa.resolved)
	}
	if !reflect.DeepEqual(*e.stored[id], e.snap[id]) {
		e.t.Errorf("stored fleet %s changed:\n got  %+v\n want %+v", id, *e.stored[id], e.snap[id])
	}
}

// parkedAtPoint is an owned fleet parked at a point on the +X axis, holding fuel.
func parkedAtPoint(id, corp string, x float64) *Fleet {
	return &Fleet{
		Id: id, CorporationId: corp, SystemId: "sys-0",
		Cargo: map[string]float64{"fuel": 500},
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: x}}},
	}
}

// driftingAt is an owned fleet coasting from pos at vel (epoch 0), holding fuel.
func driftingAt(id, corp string, pos, vel space.Vec3) *Fleet {
	return &Fleet{
		Id: id, CorporationId: corp, SystemId: "sys-0",
		Cargo: map[string]float64{"fuel": 500},
		State: space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{Anchor: pos, Velocity: vel, EpochMs: 0}},
	}
}

func ordersPath(id string) string  { return "/fleets/" + id + "/orders" }
func previewPath(id string) string { return "/fleets/" + id + "/orders/preview" }
func stopPath(id string) string    { return "/fleets/" + id + "/stop" }

// star size 6.0 => clearance 15.0 (space.StarClearanceRadius, factor 2.5).
const refusalStarSize = 6.0

func refusalClearance() float64 { return space.StarClearanceRadius(refusalStarSize) }

// solveInputsAt rebuilds, from the contract's own recipe (impl-contract 7.3
// step 1), the inputs solveOrder would hand the solver at world time now: the
// fleet's position, its normalised live velocity (nil when it has none), the
// derived acceleration ceiling and the star clearance. Used by the arrangement
// preconditions, which must not reference any fleet refusal sentinel.
func solveInputsAt(t *testing.T, bt *system.BodyTable, f *Fleet, now common.WorldMillis) (from space.Vec3, departDir *space.Vec3, accel, clearance float64) {
	t.Helper()
	from, err := space.StatePosition(bt, f.State, now)
	if err != nil {
		t.Fatalf("arrangement: fleet position: %v", err)
	}
	vel, err := currentVelocity(bt, f.State, now)
	if err != nil {
		t.Fatalf("arrangement: fleet velocity: %v", err)
	}
	if d, ok := vel.Normalize(); ok {
		departDir = &d
	}
	return from, departDir, DerivedAccelCeiling(*f, DefaultClassStats()), space.StarClearanceRadius(bt.StarSize())
}

func containsAny(s string, frags ...string) bool {
	for _, f := range frags {
		if strings.Contains(s, f) {
			return true
		}
	}
	return false
}

// isSpaceErr is errors.Is for the arrangement preconditions, which name only
// `space` sentinels (never a fleet sentinel, so they are green at red).
func isSpaceErr(err, target error) bool { return errors.Is(err, target) }
