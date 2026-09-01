package main

// RED-phase end-to-end tests for openspec change
// replace-observation-with-sightings, tasks.md 6.4 — fleet-movement's ADDED
// requirement "Fleet Command Endpoints Are Restricted to the Owning
// Corporation".
//
// NO FAKE ANYWHERE. This file drives the REAL, production-constructed router
// (SetupRouter()) with REAL Firebase Auth emulator tokens through the REAL
// middleware chain — including middlewares.ResolveCorporation, the seam
// common.ActorCorp(c) reads — against REAL Firestore documents. Two
// corporations are actually spawned; the intruder is a genuine, living,
// authenticated corporation with its own fleet, not a context key set by a
// test stub. Its counterpart at the cheap level (handler over a fake service,
// one subtest per endpoint, runs under -short) is
// backend/fleet/ownership_test.go. This file exists because that one cannot
// see a composition-root mistake: this chain has already found five units
// that were correct, unit-tested, green, and reached by nothing.
//
// EVERY SCENARIO IS ARRANGED TO SUCCEED TODAY. Each subtest first puts the
// victim's fleet into the exact state that makes the attacked verb
// ADMISSIBLE (a live burn to cut, a gate attachment with a real lane id to
// jump, an own-corp host in range to sweep) before the intruder's request.
// Without that, three of the six would be "red" only because the verb itself
// rejected the request for an unrelated reason — cut-drive on a parked fleet
// (500), jump on a nonexistent lane (500), scan of an unresolvable host (a
// legitimate 404 that would make the scan subtest pass VACUOUSLY today, for
// entirely the wrong reason). Arranged this way, every one of the six is a
// live demonstration of the defect: today the intruder actually re-tasks,
// cancels, cuts, stops, jumps, and sweeps with a fleet it does not own.
//
// EXPECTED TO BE RED TODAY: fleet/handler.go's Order/Cancel/CutDrive/Stop/
// Jump/Scan never consult common.ActorCorp(c) — only Get and List do.

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/space"

	"github.com/google/uuid"
)

// --- fixture -----------------------------------------------------------------

// fleetOwnershipVictim is the corporation whose fleet the intruder attacks,
// plus everything needed to put that fleet into an attackable state.
type fleetOwnershipVictim struct {
	router   http.Handler
	fdao     fleet.Dao
	ctx      context.Context
	token    string
	corpId   string
	fleetId  string
	systemId string
	// laneId/gateId name one real lane incident to the victim's home system —
	// the crossing an arranged jump would take.
	laneId string
	gateId string
}

func newFleetOwnershipVictim(t *testing.T, router http.Handler, name string) fleetOwnershipVictim {
	t.Helper()
	token, corpId, fleetId, systemId := spawnForDisclosureTest(t, router, name)

	fs, _ := firestoreClient(t)
	ctx := context.Background()
	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), common.WorldClock())
	lanes, err := gsvc.LanesOf(ctx, systemId)
	if err != nil {
		t.Fatalf("LanesOf(%s): %v", systemId, err)
	}
	if len(lanes) == 0 {
		t.Fatalf("test-environment issue, not the behaviour under test: the victim's home system %q has no "+
			"incident lanes, so there is no gate to attach to and no lane to jump", systemId)
	}
	return fleetOwnershipVictim{
		router: router, fdao: fleet.NewDaoWithClient(fs), ctx: ctx,
		token: token, corpId: corpId, fleetId: fleetId, systemId: systemId,
		laneId: lanes[0].LaneId, gateId: "gate-" + lanes[0].OtherSystemId,
	}
}

// driftAt puts the victim's fleet at an exact, controlled position as a free
// coast at zero velocity — its position at every world time is exactly `at`,
// with no dependency on whatever body layout this system happened to roll.
func (v fleetOwnershipVictim) driftAt(t *testing.T, at space.Vec3) {
	t.Helper()
	driftFleet(t, v.fdao, v.ctx, v.fleetId, v.corpId, v.systemId, at)
}

// burning commits a REAL burn on the victim's own fleet, through the real
// endpoint with the victim's own token, toward a point far enough away that
// the burn is still live for the whole test — so cancel and cut-drive have
// something real to destroy.
func (v fleetOwnershipVictim) burning(t *testing.T) {
	t.Helper()
	// Depart from x=1e6, not the origin: the origin sits inside the star's
	// clearance radius and space.SolveBurn refuses to solve from there.
	v.driftAt(t, space.Vec3{X: 1e6})
	w := doJSON(t, v.router, http.MethodPost, "/v1/fleets/"+v.fleetId+"/orders", v.token,
		map[string]any{"point": map[string]any{"x": 1.1e7, "y": 0.0, "z": 0.0}}, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("arranging a live burn on the victim's own fleet: POST /orders as its OWNER returned %d "+
			"(body: %s) — the fixture is broken, not the behaviour under test", w.Code, w.Body.String())
	}
	f, err := v.fdao.Get(v.ctx, v.fleetId)
	if err != nil || f == nil {
		t.Fatalf("re-reading the victim fleet after arranging its burn: %v", err)
	}
	if f.State.Mode != space.ModeBurn || f.ActiveActionId == "" {
		t.Fatalf("arranged victim fleet is not burning with a claimed movement slot (mode=%v activeActionId=%q)",
			f.State.Mode, f.ActiveActionId)
	}
}

// attachedToGate parks the victim's fleet on its home lane's own gate body —
// mirroring router_jump_wiring_test.go's established "as if BurnResolver had
// already run" arrangement — so a jump naming v.laneId is genuinely eligible.
func (v fleetOwnershipVictim) attachedToGate(t *testing.T) {
	t.Helper()
	f, err := v.fdao.Get(v.ctx, v.fleetId)
	if err != nil || f == nil {
		t.Fatalf("loading the victim fleet to attach it to its gate: %v", err)
	}
	f.AttachedTo = v.gateId
	f.State = space.ShipState{Mode: space.ModeParked, Park: &space.Park{
		Kind: space.ParkOrbit, BodyId: v.gateId, Radius: 300,
	}}
	f.StateDoc = fleet.EncodeKinematicState(f.State)
	f.ActiveActionId = ""
	f.Jump = nil
	if err := v.fdao.Save(v.ctx, *f); err != nil {
		t.Fatalf("attaching the victim fleet to its gate: %v", err)
	}
}

// withOwnHostInSweepRange drifts the victim's fleet and a SECOND fleet owned
// by the same (victim) corporation 10 units away — well inside
// disclosure.FocusedScanRange (48) and nowhere near the star, so range and
// occlusion both admit the sweep. Returns the host's id.
//
// The host must belong to the VICTIM's corporation, not the intruder's:
// fleet.Service.resolveScanHost resolves an own-fleet host relative to the
// SCANNING fleet's corporation, which is the victim's. This is precisely the
// attack the requirement describes — "an unchecked scan would let a foreign
// corporation claim a victim fleet's sensor-channel slot and strip its
// masking on demand ... for a duration the attacker picks by naming a distant
// host".
func (v fleetOwnershipVictim) withOwnHostInSweepRange(t *testing.T) string {
	t.Helper()
	hostId := "fleet_sdet_sweep_host_" + uuid.NewString()
	v.driftAt(t, space.Vec3{X: 1e6})
	driftFleet(t, v.fdao, v.ctx, hostId, v.corpId, v.systemId, space.Vec3{X: 1e6 + 10})
	return hostId
}

// --- the endpoint table ------------------------------------------------------

// fleetCommandCase is one of the six endpoints the requirement names, with
// the arrangement that makes its verb admissible against the victim's fleet.
type fleetCommandCase struct {
	scenario string // the spec scenario title, verbatim
	suffix   string // the path segment after /v1/fleets/:fleetId
	// arrange puts the victim's fleet into an attackable state and returns
	// the request body to send.
	arrange func(t *testing.T, v fleetOwnershipVictim) map[string]any
}

func fleetCommandCases() []fleetCommandCase {
	return []fleetCommandCase{
		{"A foreign corp cannot order another corp's fleet", "orders",
			func(t *testing.T, v fleetOwnershipVictim) map[string]any {
				v.driftAt(t, space.Vec3{X: 1e6})
				return map[string]any{"point": map[string]any{"x": 1.0e6 + 5000.0, "y": 0.0, "z": 0.0}}
			}},
		{"A foreign corp cannot cancel another corp's fleet", "cancel",
			func(t *testing.T, v fleetOwnershipVictim) map[string]any {
				v.burning(t)
				return map[string]any{}
			}},
		{"A foreign corp cannot cut another corp's fleet's drive", "cut-drive",
			func(t *testing.T, v fleetOwnershipVictim) map[string]any {
				v.burning(t)
				return map[string]any{}
			}},
		{"A foreign corp cannot order another corp's fleet to stop in place", "stop",
			func(t *testing.T, v fleetOwnershipVictim) map[string]any {
				v.burning(t)
				return map[string]any{}
			}},
		{"A foreign corp cannot order another corp's fleet to jump", "jump",
			func(t *testing.T, v fleetOwnershipVictim) map[string]any {
				v.attachedToGate(t)
				return map[string]any{"laneId": v.laneId}
			}},
		{"A foreign corp cannot commit a sweep with another corp's fleet", "scan",
			func(t *testing.T, v fleetOwnershipVictim) map[string]any {
				return map[string]any{"hostId": v.withOwnHostInSweepRange(t)}
			}},
	}
}

// fleetStateSnapshot is everything the six scenarios' THEN clauses say must
// be UNCHANGED by a rejected command: "F's kinematic state is unchanged",
// "F's active movement order is unaffected", "F's burn is unaffected", "no
// jump is committed", "no scan action is created, F's sensor-channel slot is
// unclaimed, and F's masked state is unchanged" (masking is a function of
// AttachedTo and the sweep window, hence both).
//
// Rendered through encoding/json rather than %+v: %+v prints POINTER
// ADDRESSES for State.Burn/Park/Drift, which differ on every read of an
// identical document and would make this comparison a false-positive
// generator.
type fleetStateSnapshot struct {
	State          space.ShipState    `json:"state"`
	AttachedTo     string             `json:"attachedTo"`
	ActiveActionId string             `json:"activeActionId"`
	ActiveScanId   string             `json:"activeScanId"`
	Jump           *fleet.JumpTransit `json:"jump"`
	Scan           *fleet.ScanWindow  `json:"scan"`
}

func snapshotFleet(t *testing.T, dao fleet.Dao, ctx context.Context, id string) string {
	t.Helper()
	f, err := dao.Get(ctx, id)
	if err != nil {
		t.Fatalf("reading fleet %q to snapshot its state: %v", id, err)
	}
	if f == nil {
		t.Fatalf("fleet %q does not exist; the fixture is broken, not the behaviour under test", id)
	}
	b, err := json.Marshal(fleetStateSnapshot{
		State: f.State, AttachedTo: f.AttachedTo,
		ActiveActionId: f.ActiveActionId, ActiveScanId: f.ActiveScanId,
		Jump: f.Jump, Scan: f.Scan,
	})
	if err != nil {
		t.Fatalf("marshalling the fleet snapshot: %v", err)
	}
	return string(b)
}

// --- the scenarios -----------------------------------------------------------

// Scenario: A foreign corp cannot order another corp's fleet
// Scenario: A foreign corp cannot cancel another corp's fleet
// Scenario: A foreign corp cannot cut another corp's fleet's drive
// Scenario: A foreign corp cannot order another corp's fleet to stop in place
// Scenario: A foreign corp cannot order another corp's fleet to jump
// Scenario: A foreign corp cannot commit a sweep with another corp's fleet
func TestRouter_Scenario_ForeignCorporationCannotCommandAnotherCorpsFleet(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	victim := newFleetOwnershipVictim(t, router, "SDET Ownership Victim Corp")
	intruderToken, _, _, _ := spawnForDisclosureTest(t, router, "SDET Ownership Intruder Corp")

	for _, tc := range fleetCommandCases() {
		t.Run("Scenario: "+tc.scenario, func(t *testing.T) {
			body := tc.arrange(t, victim)
			before := snapshotFleet(t, victim.fdao, victim.ctx, victim.fleetId)

			path := "/v1/fleets/" + victim.fleetId + "/" + tc.suffix
			w := doJSON(t, router, http.MethodPost, path, intruderToken, body, nil)

			if w.Code == http.StatusForbidden {
				t.Fatalf("POST %s from a foreign corporation: status = 403, want 404. The status choice is "+
					"load-bearing: fleet-movement \"Fleet Command Endpoints Are Restricted to the Owning "+
					"Corporation\" requires 404 \"— not 403 —\" because \"a 403 would itself confirm the id "+
					"exists\" (design.md Decision 21)", path)
			}
			if w.Code != http.StatusNotFound {
				t.Errorf("POST %s from a foreign corporation: status = %d, want 404 (body: %s)",
					path, w.Code, w.Body.String())
			}
			assertNoFleetDisclosure(t, w.Body.String(), path, victim.fleetId, victim.corpId)

			if after := snapshotFleet(t, victim.fdao, victim.ctx, victim.fleetId); after != before {
				t.Errorf("POST %s from a foreign corporation CHANGED the victim fleet:\n  before: %s\n  after:  %s\n"+
					"The scenario's THEN requires the fleet be untouched — no order committed, no burn cut, no "+
					"slot claimed, no masking stripped.", path, before, after)
			}
		})
	}
}

// TestRouter_Scenario_AForeignFleetIsIndistinguishableFromANonexistentOne is
// the requirement's own stated REASON for choosing 404 over 403, asserted
// directly rather than inferred: "a foreign fleet is indistinguishable from a
// nonexistent one". Status AND body must match between a command against
// another corporation's real fleet and a command against an id that has never
// existed. Anything that differs is the oracle the status choice exists to
// deny.
func TestRouter_Scenario_AForeignFleetIsIndistinguishableFromANonexistentOne(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	victim := newFleetOwnershipVictim(t, router, "SDET Indistinguishability Victim Corp")
	intruderToken, _, _, _ := spawnForDisclosureTest(t, router, "SDET Indistinguishability Intruder Corp")

	ghostFleetId := "fleet_" + uuid.NewString() // never written to Firestore

	for _, tc := range fleetCommandCases() {
		t.Run("Scenario: A foreign fleet is indistinguishable from a nonexistent one ("+tc.suffix+")", func(t *testing.T) {
			body := tc.arrange(t, victim)

			foreign := doJSON(t, router, http.MethodPost,
				"/v1/fleets/"+victim.fleetId+"/"+tc.suffix, intruderToken, body, nil)
			ghost := doJSON(t, router, http.MethodPost,
				"/v1/fleets/"+ghostFleetId+"/"+tc.suffix, intruderToken, body, nil)

			if foreign.Code != ghost.Code {
				t.Errorf("POST .../%s: another corporation's real fleet answered %d, a fleet id that has never "+
					"existed answered %d. The two must be indistinguishable — the difference alone tells an "+
					"attacker which fleet ids are real (design.md Decision 21)", tc.suffix, foreign.Code, ghost.Code)
			}
			if foreign.Body.String() != ghost.Body.String() {
				t.Errorf("POST .../%s: response bodies differ between a foreign fleet and a nonexistent one:\n"+
					"  foreign: %q\n  ghost:   %q\nA body that distinguishes them discloses exactly what the 404 "+
					"was chosen to hide", tc.suffix, foreign.Body.String(), ghost.Body.String())
			}
		})
	}
}

// Scenario: A corpless requester is rejected the same way
//
// "an authenticated but corpless account submits any movement command
// endpoint against an existing fleet — THEN the response is 404 Not Found."
// The corpless account here is real: a genuine Firebase identity with a real
// backend account record that has simply never called POST /v1/corporations,
// so middlewares.ResolveCorporation leaves the corporation unset exactly as
// it does for a player mid-wake-up-flow.
func TestRouter_Scenario_CorplessRequesterIsRejectedFromEveryFleetCommand(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	victim := newFleetOwnershipVictim(t, router, "SDET Corpless-Victim Corp")

	corplessToken := mintFirebaseIDToken(t)
	if w := doJSON(t, router, http.MethodPost, "/v1/accounts", corplessToken, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/accounts for the corpless requester: status = %d, body = %s", w.Code, w.Body.String())
	}
	// Deliberately NOT spawning a corporation for this token.

	for _, tc := range fleetCommandCases() {
		t.Run("Scenario: A corpless requester is rejected the same way ("+tc.suffix+")", func(t *testing.T) {
			body := tc.arrange(t, victim)
			before := snapshotFleet(t, victim.fdao, victim.ctx, victim.fleetId)

			path := "/v1/fleets/" + victim.fleetId + "/" + tc.suffix
			w := doJSON(t, router, http.MethodPost, path, corplessToken, body, nil)

			if w.Code != http.StatusNotFound {
				t.Errorf("POST %s from an authenticated but CORPLESS account: status = %d, want 404 (body: %s)",
					path, w.Code, w.Body.String())
			}
			assertNoFleetDisclosure(t, w.Body.String(), path, victim.fleetId, victim.corpId)

			if after := snapshotFleet(t, victim.fdao, victim.ctx, victim.fleetId); after != before {
				t.Errorf("POST %s from a corpless account CHANGED the victim fleet:\n  before: %s\n  after:  %s",
					path, before, after)
			}
		})
	}
}

// Scenario: The owning corporation's jump order succeeds at the HTTP surface
// (authorization half — the committed-ETA half is tasks.md 8.2's
// router_jump_wiring_test.go).
//
// The positive control for every rejection above: without it, a handler that
// 404s unconditionally satisfies the whole requirement. Every endpoint is
// arranged to be genuinely admissible for its owner, so a 200 is the correct
// expectation for all six and there is no "not 404" fudge hiding a verb that
// rejected for its own reasons.
func TestRouter_Scenario_OwningCorporationsCommandsStillSucceed(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	owner := newFleetOwnershipVictim(t, router, "SDET Owner-Succeeds Corp")

	for _, tc := range fleetCommandCases() {
		t.Run("Scenario: The owning corporation's command succeeds ("+tc.suffix+")", func(t *testing.T) {
			body := tc.arrange(t, owner)

			path := "/v1/fleets/" + owner.fleetId + "/" + tc.suffix
			w := doJSON(t, router, http.MethodPost, path, owner.token, body, nil)

			if w.Code == http.StatusNotFound {
				t.Fatalf("POST %s from the corporation that OWNS the fleet: status = 404. The ownership check "+
					"must reject foreign requesters without closing the endpoint to its owner (body: %s)",
					path, w.Body.String())
			}
			if w.Code != http.StatusOK {
				t.Errorf("POST %s from the owning corporation: status = %d, want 200 — the command is arranged to "+
					"be genuinely admissible (body: %s)", path, w.Code, w.Body.String())
			}
		})
	}
}

// assertNoFleetDisclosure pins the body half of the absence semantics: the
// rejection must not name the fleet, its owner, or the reason.
func assertNoFleetDisclosure(t *testing.T, body, path, fleetId, corpId string) {
	t.Helper()
	for _, secret := range []string{fleetId, corpId} {
		if secret != "" && strings.Contains(body, secret) {
			t.Errorf("POST %s: the rejection body %q names %q — a foreign fleet must be indistinguishable from a "+
				"nonexistent one", path, body, secret)
		}
	}
	for _, tell := range []string{"forbidden", "Forbidden", "not authorized", "unauthorized", "another corporation", "own this"} {
		if strings.Contains(body, tell) {
			t.Errorf("POST %s: the rejection body %q contains %q — a body that explains WHY is as disclosing as a "+
				"403", path, body, tell)
		}
	}
}
