package fleet

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 6.4 — fleet-movement's ADDED requirement "Fleet Command Endpoints
// Are Restricted to the Owning Corporation".
//
// This file REPLACES fleet/ownership_defect_test.go, which asserted the
// defect (its test names literally read ForeignCorpCanOrderAnotherCorpsFleet
// and its failure messages said "want 200 — no ownership check is
// performed"). tasks.md 6.4 is explicit: "Delete fleet/ownership_defect_
// test.go; its scenarios become this requirement's positive ownership
// scenarios." Its five scenarios are re-expressed below as the positive
// assertions, plus scan (the sixth endpoint, new in this change), the
// corpless case, and the owner-succeeds case.
//
// LEVEL. These are the CHEAP level: the handler over a fake service, so the
// six endpoints are covered in `go test -short` and a regression is reported
// per-endpoint. They are NOT the acceptance criterion on their own — a
// handler wired into a hand-rolled gin engine proves nothing about the
// production composition root. The no-fake-at-all counterpart runs the same
// scenarios through SetupRouter() with the real middleware chain and real
// Firestore: backend/router_fleet_ownership_e2e_test.go.
//
// 404, NOT 403 — LOAD-BEARING. The requirement: "SHALL respond 404 Not Found
// — not 403 — when they do not match or when the requester has no
// corporation, matching the read endpoints' own absence semantics: a foreign
// fleet is indistinguishable from a nonexistent one, and a 403 would itself
// confirm the id exists (design.md Decision 21)." A 403 here is a
// FAILURE, not a near-miss: it is the disclosure the status choice exists to
// prevent.
//
// EXPECTED TO BE RED TODAY: fleet/handler.go's Order/Cancel/CutDrive/Stop/
// Jump/Scan call straight through to the service without consulting
// common.ActorCorp(c) at all (only Get and List check ownership).

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hexaverse/common"

	"github.com/gin-gonic/gin"
)

// ownedFleetId is the fleet under test; ownerCorp owns it, foreignCorp does
// not.
const (
	ownedFleetId = "f1"
	ownerCorp    = "corp-owner"
	foreignCorp  = "corp-intruder"
)

// recordingFleetSvc wraps handler_test.go's fakeFleetSvc and records which
// MUTATING command methods the handler actually invoked. It is the
// handler-level proxy for the scenarios' THEN clauses — "F's kinematic state
// is unchanged", "F's active movement order is unaffected", "no scan action
// is created, F's sensor-channel slot is unclaimed": a command the handler
// never dispatched cannot have changed anything. Get is deliberately NOT
// recorded — the handler must load the fleet to learn who owns it.
type recordingFleetSvc struct {
	fakeFleetSvc
	commands []string
}

func (r *recordingFleetSvc) OrderTo(ctx context.Context, id string, req OrderRequest) (*Fleet, error) {
	r.commands = append(r.commands, "OrderTo")
	return r.fakeFleetSvc.OrderTo(ctx, id, req)
}

func (r *recordingFleetSvc) Cancel(ctx context.Context, id string) (*Fleet, error) {
	r.commands = append(r.commands, "Cancel")
	return r.fakeFleetSvc.Cancel(ctx, id)
}

func (r *recordingFleetSvc) CutDrive(ctx context.Context, id string) (*Fleet, error) {
	r.commands = append(r.commands, "CutDrive")
	return r.fakeFleetSvc.CutDrive(ctx, id)
}

func (r *recordingFleetSvc) Stop(ctx context.Context, id string) (*Fleet, error) {
	r.commands = append(r.commands, "Stop")
	return r.fakeFleetSvc.Stop(ctx, id)
}

func (r *recordingFleetSvc) Jump(ctx context.Context, id, laneId string) (*Fleet, error) {
	r.commands = append(r.commands, "Jump")
	return r.fakeFleetSvc.Jump(ctx, id, laneId)
}

func (r *recordingFleetSvc) Scan(ctx context.Context, id, hostId string) (*Fleet, error) {
	r.commands = append(r.commands, "Scan")
	return r.fakeFleetSvc.Scan(ctx, id, hostId)
}

// commandRouter mirrors handler_test.go's newFleetRouter but lets the test
// choose the requester's resolved corporation. corpId == "" stands in for an
// authenticated but CORPLESS account: middlewares.ResolveCorporation leaves
// CorpIdKey unset in exactly that case (middlewares/corporation.go —
// "corpless continues"), so the stub must not set it either.
func commandRouter(svc ServiceInterface, corpId string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(common.AccountIdKey, "requester-account")
		if corpId != "" {
			c.Set(common.CorpIdKey, corpId)
		}
	})
	NewHandlerWith(svc, &fakeClock{}).RegisterRoutes(r.Group("/"))
	return r
}

// fleetCommand is one of the six mutating endpoints the requirement names,
// paired with the ServiceInterface method the handler must NOT reach when
// the requester does not own the fleet.
type fleetCommand struct {
	// scenario is the spec scenario title fragment this endpoint belongs to.
	scenario string
	path     string
	body     string
	method   string // the ServiceInterface method that must not be dispatched
}

// fleetCommands is the complete endpoint set named by "Fleet Command
// Endpoints Are Restricted to the Owning Corporation": POST
// /v1/fleets/:fleetId/{orders,cancel,cut-drive,stop,jump,scan}.
func fleetCommands() []fleetCommand {
	return []fleetCommand{
		{"A foreign corp cannot order another corp's fleet", "/fleets/" + ownedFleetId + "/orders", `{"point":{"x":10,"y":0,"z":0}}`, "OrderTo"},
		{"A foreign corp cannot cancel another corp's fleet", "/fleets/" + ownedFleetId + "/cancel", ``, "Cancel"},
		{"A foreign corp cannot cut another corp's fleet's drive", "/fleets/" + ownedFleetId + "/cut-drive", ``, "CutDrive"},
		{"A foreign corp cannot order another corp's fleet to stop in place", "/fleets/" + ownedFleetId + "/stop", ``, "Stop"},
		{"A foreign corp cannot order another corp's fleet to jump", "/fleets/" + ownedFleetId + "/jump", `{"laneId":"lane-1"}`, "Jump"},
		{"A foreign corp cannot commit a sweep with another corp's fleet", "/fleets/" + ownedFleetId + "/scan", `{"hostId":"body-1"}`, "Scan"},
	}
}

func postCommand(t *testing.T, r *gin.Engine, cmd fleetCommand) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if cmd.body == "" {
		req = httptest.NewRequest(http.MethodPost, cmd.path, nil)
	} else {
		req = httptest.NewRequest(http.MethodPost, cmd.path, strings.NewReader(cmd.body))
	}
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func ownedFleetFixture() *Fleet {
	return &Fleet{Id: ownedFleetId, CorporationId: ownerCorp, SystemId: "s1"}
}

// Scenario: A foreign corp cannot order another corp's fleet
// Scenario: A foreign corp cannot cancel another corp's fleet
// Scenario: A foreign corp cannot cut another corp's fleet's drive
// Scenario: A foreign corp cannot order another corp's fleet to stop in place
// Scenario: A foreign corp cannot order another corp's fleet to jump
// Scenario: A foreign corp cannot commit a sweep with another corp's fleet
//
// One subtest per named scenario, so a partial implementation reports which
// endpoint is still open rather than a single opaque failure.
func TestFleetCommands_Scenario_ForeignCorpIsRejectedOnEveryCommandEndpoint(t *testing.T) {
	cmds := fleetCommands()
	if len(cmds) != 6 {
		t.Fatalf("this test covers %d command endpoints; the requirement names six "+
			"(orders, cancel, cut-drive, stop, jump, scan) — the table drifted", len(cmds))
	}
	for _, cmd := range cmds {
		t.Run("Scenario: "+cmd.scenario, func(t *testing.T) {
			svc := &recordingFleetSvc{fakeFleetSvc: fakeFleetSvc{fleet: ownedFleetFixture()}}
			w := postCommand(t, commandRouter(svc, foreignCorp), cmd)

			if w.Code == http.StatusForbidden {
				t.Fatalf("%s: status = 403, want 404. The status choice is load-bearing, not cosmetic: "+
					"fleet-movement \"Fleet Command Endpoints Are Restricted to the Owning Corporation\" requires "+
					"404 \"— not 403 —\" because \"a 403 would itself confirm the id exists\" (design.md Decision "+
					"21). A 403 IS the disclosure this rule exists to prevent", cmd.path)
			}
			if w.Code != http.StatusNotFound {
				t.Fatalf("%s from a corporation that does not own fleet %s: status = %d, want 404 (body: %q)",
					cmd.path, ownedFleetId, w.Code, w.Body.String())
			}
			if len(svc.commands) != 0 {
				t.Errorf("%s from a foreign corporation dispatched %v to the fleet service — the scenario's THEN "+
					"requires the fleet be UNCHANGED (no order committed, no slot claimed, no masking stripped); "+
					"the ownership check must run BEFORE the command, not alongside it", cmd.path, svc.commands)
			}
			assertBodyLeaksNothing(t, w, cmd.path)
		})
	}
}

// Scenario: A corpless requester is rejected the same way
//
// "an authenticated but corpless account submits any movement command
// endpoint against an existing fleet — THEN the response is 404 Not Found."
// Covered across the whole endpoint set, not just one, because
// common.ActorCorp(c) == "" is a distinct branch from "resolved, but
// different" and a naive `actorCorp != f.CorporationId` check written
// against a fleet whose stored corporationId happened to be empty would pass
// the foreign case and fail this one.
func TestFleetCommands_Scenario_CorplessRequesterIsRejectedTheSameWay(t *testing.T) {
	for _, cmd := range fleetCommands() {
		t.Run("Scenario: A corpless requester is rejected the same way ("+cmd.method+")", func(t *testing.T) {
			svc := &recordingFleetSvc{fakeFleetSvc: fakeFleetSvc{fleet: ownedFleetFixture()}}
			w := postCommand(t, commandRouter(svc, ""), cmd)

			if w.Code != http.StatusNotFound {
				t.Fatalf("%s from an authenticated but CORPLESS account: status = %d, want 404 (body: %q)",
					cmd.path, w.Code, w.Body.String())
			}
			if len(svc.commands) != 0 {
				t.Errorf("%s from a corpless account dispatched %v to the fleet service; the fleet must be "+
					"untouched", cmd.path, svc.commands)
			}
			assertBodyLeaksNothing(t, w, cmd.path)
		})
	}
}

// TestFleetCommands_Scenario_CorplessRequesterAgainstAnUnownedFleetRecord is
// the guard against the cheapest wrong implementation of the rule above: a
// bare `common.ActorCorp(c) != f.CorporationId` comparison lets a corpless
// requester ("" ) command a fleet whose stored corporationId is also empty.
// The requirement's corpless clause is unconditional — "when the requester
// has no corporation" — with no exception for an unowned fleet record.
//
// SDET-ADDED boundary probe (empty-vs-empty), beyond the literal scenarios.
func TestFleetCommands_Scenario_CorplessRequesterAgainstAnUnownedFleetRecord(t *testing.T) {
	for _, cmd := range fleetCommands() {
		t.Run("SDET-added: corpless requester, corporationId-less fleet ("+cmd.method+")", func(t *testing.T) {
			svc := &recordingFleetSvc{fakeFleetSvc: fakeFleetSvc{
				fleet: &Fleet{Id: ownedFleetId, CorporationId: "", SystemId: "s1"},
			}}
			w := postCommand(t, commandRouter(svc, ""), cmd)

			if w.Code != http.StatusNotFound {
				t.Fatalf("%s: a corpless requester commanded a fleet whose stored corporationId is also empty and "+
					"got status %d, want 404. The requirement rejects \"when the requester has no corporation\" "+
					"unconditionally — an equality-only check (ActorCorp(c) != f.CorporationId) passes \"\" == \"\" "+
					"and hands every unowned fleet record to every corpless account", cmd.path, w.Code)
			}
			if len(svc.commands) != 0 {
				t.Errorf("%s dispatched %v despite a corpless requester", cmd.path, svc.commands)
			}
		})
	}
}

// Scenario: The owning corporation's jump order succeeds at the HTTP surface
//
// The positive half — without it, every assertion above is satisfied by a
// handler that 404s unconditionally. The jump sub-case is the one the
// requirement names by scenario; the other five are asserted here too
// because the same ownership check gates all six and a check written
// wrongly (e.g. comparing against the wrong field) would close the endpoint
// to its own owner.
//
// The end-to-end form of the jump scenario — a real committed ETA through
// the production router, never a 5xx — is tasks.md 8.2's
// router_jump_wiring_test.go; this is the HTTP-surface authorization half
// only.
func TestFleetCommands_Scenario_OwningCorporationsCommandsStillSucceed(t *testing.T) {
	for _, cmd := range fleetCommands() {
		t.Run("Scenario: The owning corporation's command succeeds ("+cmd.method+")", func(t *testing.T) {
			svc := &recordingFleetSvc{fakeFleetSvc: fakeFleetSvc{fleet: ownedFleetFixture()}}
			w := postCommand(t, commandRouter(svc, ownerCorp), cmd)

			if w.Code != http.StatusOK {
				t.Fatalf("%s from the OWNING corporation (%s): status = %d, want 200 — the ownership check must "+
					"reject foreign requesters without closing the endpoint to its owner (body: %q)",
					cmd.path, ownerCorp, w.Code, w.Body.String())
			}
			if len(svc.commands) != 1 || svc.commands[0] != cmd.method {
				t.Fatalf("%s from the owning corporation dispatched %v, want exactly [%s]",
					cmd.path, svc.commands, cmd.method)
			}
		})
	}
}

// assertBodyLeaksNothing pins the second half of the 404-not-403 choice: the
// rejection must not disclose the fleet's existence through the response
// body either. A 404 whose body reads {"error":"fleet f1 belongs to another
// corporation"} discloses exactly what the status code was chosen to hide.
func assertBodyLeaksNothing(t *testing.T, w *httptest.ResponseRecorder, path string) {
	t.Helper()
	body := w.Body.String()
	for _, secret := range []string{ownedFleetId, ownerCorp} {
		if strings.Contains(body, secret) {
			t.Errorf("%s: the rejection body %q names %q — a foreign fleet must be indistinguishable from a "+
				"nonexistent one (design.md Decision 21). Nothing about the fleet, its owner, or the reason for "+
				"the rejection may appear in the response", path, body, secret)
		}
	}
	for _, tell := range []string{"forbidden", "Forbidden", "not authorized", "unauthorized", "own", "corporation"} {
		if strings.Contains(body, tell) {
			t.Errorf("%s: the rejection body %q contains %q — a body that explains WHY is as disclosing as a 403: "+
				"it confirms the id exists and is simply someone else's", path, body, tell)
		}
	}
}
