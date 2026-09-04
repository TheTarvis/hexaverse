package main

// RED-phase path-level integration tests for openspec change
// add-scan-and-sightings-surface, tasks.md 1.12, 1.13
// (openspec/changes/.../specs/action-dispatch/spec.md's MODIFIED "Exactly-
// Once Resolution" — "A resolver's reason code is persisted on the action
// and served" — and "Inbox by Actor Query Param" — "A settled-status read
// is ordered by resolve timestamp", "...is bounded, and its bound keeps the
// newest", "A running-status read is unaffected by the settled ordering",
// "A type-and-status filtered read composes both filters, ordered and
// bounded").
//
// TASK 1.12 IS EXPECTED TO ALREADY BE GREEN. Per the architect's
// implementation contract §0 and design.md Decision 18, `add-stationkeep-
// hold-verb` already landed `action.DaoImpl.ResolveOne` persisting
// `reasonCode` (action/dao.go's resolve transaction `tx.Update`) concurrently
// with this change's drafting. This file's own reasonCode test therefore
// exists as (a) the scan-side confirmation the contract calls out — the
// existing green coverage is mine-verb-only
// (stationkeep_mine_and_burn_e2e_test.go) — and (b) a permanent regression
// net asserting the read-back, never the resolver's return value.
//
// TASK 1.13 IS EXPECTED TO BE RED: `action.Dao.List`/`action.SettledPageMax`
// do not exist with ordering, a bound, or a `type` filter today
// (action/dao.go:148-177 is `Where("actor","==")` plus an optional status
// equality, with no OrderBy and no Limit) — this file's fixtures are sized
// specifically so a BARE, unordered limit fails (a naive `Limit(50)` with no
// `OrderBy` returns Firestore's own undefined order, which — for this
// fixture's monotonically-increasing document ids — coincides with the
// OLDEST 50, not the newest).
//
// Settled-action fixtures are seeded via DIRECT Firestore writes matching
// action.Action's own Firestore schema exactly (never through a real
// resolve, which this file has no reason to drive 70+ times over real
// wall-clock scan durations) — the actor named is a REAL, spawned fleet, so
// the authorization seam (ActorOwner) this endpoint gates through is
// exercised for real.

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"hexaverse/action"
	"hexaverse/fleet"
	"hexaverse/space"

	"cloud.google.com/go/firestore"
)

// seedSettledAction writes one `done` action doc directly, matching
// action.Action's Firestore tags (action/model.go) field-for-field.
func seedSettledAction(t *testing.T, client *firestore.Client, id, actor, actorCollection, actionType string, resolvedAt int64, reasonCode string) {
	t.Helper()
	data := map[string]interface{}{
		"id": id, "type": actionType, "kind": "mutating",
		"actor": actor, "actorCollection": actorCollection, "scope": "sys-fixture",
		"params": map[string]interface{}{}, "committedAt": resolvedAt - 1000, "eta": resolvedAt,
		"status": "done", "outcome": "fixture", "resolvedAt": resolvedAt,
	}
	if reasonCode != "" {
		data["reasonCode"] = reasonCode
	}
	if _, err := client.Collection("actions").Doc(id).Set(context.Background(), data); err != nil {
		t.Fatalf("seeding settled action %q: %v", id, err)
	}
}

// seedRunningAction writes one `running` action doc with NO resolvedAt key
// at all (Action.ResolvedAt is `firestore:"...,omitempty"`, so a genuinely
// running action's document never carries it).
func seedRunningAction(t *testing.T, client *firestore.Client, id, actor, actorCollection, actionType string) {
	t.Helper()
	data := map[string]interface{}{
		"id": id, "type": actionType, "kind": "mutating",
		"actor": actor, "actorCollection": actorCollection, "scope": "sys-fixture",
		"params": map[string]interface{}{}, "committedAt": int64(1), "eta": int64(999_999_999),
		"status": "running",
	}
	if _, err := client.Collection("actions").Doc(id).Set(context.Background(), data); err != nil {
		t.Fatalf("seeding running action %q: %v", id, err)
	}
}

type actionListResp struct {
	Actions []struct {
		Id         string `json:"id"`
		Type       string `json:"type"`
		Status     string `json:"status"`
		ResolvedAt int64  `json:"resolvedAt"`
		ReasonCode string `json:"reasonCode"`
	} `json:"actions"`
}

func inboxRead(t *testing.T, router http.Handler, token, query string) actionListResp {
	t.Helper()
	var out actionListResp
	w := doJSON(t, router, http.MethodGet, "/v1/actions?"+query, token, nil, &out)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/actions?%s: status = %d, body = %s", query, w.Code, w.Body.String())
	}
	return out
}

// --- 1.12: reasonCode persisted and served, read back from the store -----

// Scenario: A resolver's reason code is persisted on the action and served —
// scan-side confirmation (link8b-impl-contract.md §0: "the SDET still owes
// the scan-side read-back assertion").
func TestActionReasonCode_Scenario_ScanFizzlePersistedAndServed(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	ctx := context.Background()
	fs, client := firestoreClient(t)
	fdao := fleet.NewDaoWithClient(fs)

	token, corpId, fleetId, homeId := spawnForDisclosureTest(t, router, "SDET ReasonCode-Readback Corp")
	base := farFromStar(t, ctx, homeId)
	hostId := "host-reasoncode-" + fleetId
	placeFleet(t, fdao, ctx, fleetId, corpId, homeId, base)
	placeFleet(t, fdao, ctx, hostId, corpId, homeId, base.Add(space.Vec3{X: 5}))

	if w := scanReq(t, router, token, fleetId, hostId); w.Code < 200 || w.Code >= 300 {
		t.Fatalf("scan commit: status = %d, body = %s", w.Code, w.Body.String())
	}
	f := readFleet(t, fdao, ctx, fleetId)
	actionId := f.ActiveScanId

	// Force a "laneTransit" fizzle: the scanner enters lane transit before
	// the sweep's ETA is settled (resolver.go: `f.Jump != nil -> fizzle
	// ("laneTransit")`, checked before the system-scope check).
	f.Jump = &fleet.JumpTransit{LaneId: "lane-reasoncode", DestSystemId: "sys-elsewhere-reasoncode", DepartMs: 0, ArriveMs: 999_999_999}
	if err := fdao.Save(ctx, *f); err != nil {
		t.Fatalf("setting the fleet mid-jump directly: %v", err)
	}
	timeSkipAction(t, client, actionId)
	settleScope(t, router, token, homeId)

	// Read back from the STORE — never from a resolver return value, which
	// is exactly the assertion shape that already passed while this field
	// was silently dropped (fleet/scan_resolver_test.go:280,371; design.md
	// Decision 18).
	stored := rawAction(t, client, actionId)
	if stored["status"] != "done" {
		t.Fatalf("stored action status = %v, want \"done\" (the fizzle must still resolve the action)", stored["status"])
	}
	storedReason, _ := stored["reasonCode"].(string)
	if storedReason != "laneTransit" {
		t.Errorf("action-dispatch \"A resolver's reason code is persisted on the action and served\": "+
			"stored action's reasonCode = %q, want %q", storedReason, "laneTransit")
	}

	// And over GET /v1/actions/:id — the served surface.
	var served map[string]any
	if w := doJSON(t, router, http.MethodGet, "/v1/actions/"+actionId, token, nil, &served); w.Code != http.StatusOK {
		t.Fatalf("GET /v1/actions/%s: status = %d, body = %s", actionId, w.Code, w.Body.String())
	}
	servedReason, _ := served["reasonCode"].(string)
	if servedReason != "laneTransit" {
		t.Errorf("served action's reasonCode = %q, want %q", servedReason, "laneTransit")
	}
}

// --- 1.13: the settled inbox is ordered, bounded, and type-filterable ----

// Scenario: A settled-status read is ordered by resolve timestamp / A
// settled-status read is bounded, and its bound keeps the newest — a
// fixture sized so a BARE unordered limit fails it.
func TestActionSettledInbox_Scenario_OrderedAndBoundedKeepsTheNewest(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	_, client := firestoreClient(t)

	// The actor named by these fixtures must be a REAL fleet owned by the
	// requesting corp, since GET /v1/actions authorizes through ActorOwner
	// (a live fleet lookup) — so the requester's OWN spawned fleet id is
	// the actor under test.
	tok, _, actorFleetId, _ := spawnForDisclosureTest(t, router, "SDET Settled-Inbox-Order Corp")

	const nScans = 60
	const nBurns = 10
	for i := 0; i < nScans; i++ {
		seedSettledAction(t, client, fmt.Sprintf("settled-scan-%03d-%s", i, actorFleetId), actorFleetId, "fleets", "scan",
			1000+int64(i), "")
	}
	for i := 0; i < nBurns; i++ {
		// Deliberately the NEWEST resolvedAt values of the whole fixture.
		seedSettledAction(t, client, fmt.Sprintf("settled-burn-%02d-%s", i, actorFleetId), actorFleetId, "fleets", "burn",
			2000+int64(i), "")
	}

	t.Run("status=done unfiltered: newest 50 across types, most-recent first", func(t *testing.T) {
		resp := inboxRead(t, router, tok, "actor="+actorFleetId+"&status=done")
		const pageMax = action.SettledPageMax
		if len(resp.Actions) > pageMax {
			t.Fatalf("status=done served %d actions, want at most %d", len(resp.Actions), pageMax)
		}
		if len(resp.Actions) == 0 {
			t.Fatalf("status=done served no actions at all")
		}
		if resp.Actions[0].ResolvedAt != 2009 {
			t.Errorf("action-dispatch \"A settled-status read is ordered by resolve timestamp\": first-served "+
				"action's resolvedAt = %d, want the newest (2009)", resp.Actions[0].ResolvedAt)
		}
		for i := 0; i+1 < len(resp.Actions); i++ {
			if resp.Actions[i].ResolvedAt < resp.Actions[i+1].ResolvedAt {
				t.Fatalf("not ordered most-recently-settled-first: index %d (resolvedAt=%d) precedes index %d "+
					"(resolvedAt=%d)", i, resp.Actions[i].ResolvedAt, i+1, resp.Actions[i+1].ResolvedAt)
			}
		}
		if len(resp.Actions) == pageMax {
			oldestServed := resp.Actions[len(resp.Actions)-1].ResolvedAt
			// The newest 50 of {1000..1059, 2000..2009} (70 total) are
			// {1020..1059} U {2000..2009} — the oldest of THOSE is 1020.
			if oldestServed < 1020 {
				t.Errorf("action-dispatch \"A settled-status read is bounded, and its bound keeps the newest\": "+
					"the oldest served action's resolvedAt = %d, want >= 1020 — a bare/unordered limit would "+
					"instead keep the OLDEST 50 fixture rows", oldestServed)
			}
		}
	})

	t.Run("status=done&type=scan: only scans, ordered, bounded to the newest scans", func(t *testing.T) {
		resp := inboxRead(t, router, tok, "actor="+actorFleetId+"&status=done&type=scan")
		const pageMax = action.SettledPageMax
		if len(resp.Actions) > pageMax {
			t.Fatalf("status=done&type=scan served %d actions, want at most %d", len(resp.Actions), pageMax)
		}
		for _, a := range resp.Actions {
			if a.Type != "scan" {
				t.Fatalf("action-dispatch \"A type-and-status filtered read composes both filters\": served a "+
					"non-scan action %+v under type=scan", a)
			}
		}
		if len(resp.Actions) == pageMax {
			oldestServedScan := resp.Actions[len(resp.Actions)-1].ResolvedAt
			// The newest 50 of the 60 scans {1000..1059} are {1010..1059};
			// the oldest of those is 1010. A naive Limit(50) with no
			// OrderBy on this fixture's monotonically-increasing document
			// ids returns the OLDEST 50 ({1000..1049}) instead.
			if oldestServedScan < 1010 {
				t.Errorf("the oldest served SCAN's resolvedAt = %d, want >= 1010 (the newest 50 scans) — got "+
					"the wrong subset", oldestServedScan)
			}
		}
	})

	t.Run("status=running is unaffected by the settled ordering", func(t *testing.T) {
		seedRunningAction(t, client, "settled-running-"+actorFleetId, actorFleetId, "fleets", "scan")
		resp := inboxRead(t, router, tok, "actor="+actorFleetId+"&status=running")
		found := false
		for _, a := range resp.Actions {
			if a.Id == "settled-running-"+actorFleetId {
				found = true
			}
		}
		if !found {
			t.Errorf("action-dispatch \"A running-status read is unaffected by the settled ordering\": a "+
				"running action carrying no resolvedAt was dropped from a status=running read: %+v", resp.Actions)
		}
	})
}
