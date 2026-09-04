package main

// RED-phase test for openspec change replace-observation-with-sightings,
// tasks.md 3.4 — the read path (GET /v1/sightings) exercised through the
// REAL, production-constructed router (SetupRouter()), no fake, per the
// section's own standing instruction: "The read path (GET /v1/sightings)
// can and must get a real router-level path test now, with no fake,
// exercising the production-constructed router."
//
// (specs/sighting-records/spec.md — "A Sighting Is Readable Only By the
// Corporation That Holds It": "A corporation reads its own pile", "A
// corporation cannot read another corporation's pile"; "A Sighting Carries
// Its Own Provenance": "The target id is stored but never serialized to the
// client".)
//
// EXPECTED TO FAIL ON FIRST RUN: HTTP 404 — router.go does not wire
// GET /v1/sightings at all yet (no `sightings.NewHandler(...).
// RegisterRoutes(authorized)` call site exists), so every request below
// 404s before any handler runs.
//
// This file DELIBERATELY does NOT import hexaverse/sightings, unlike
// sightings/dao_test.go and sightings/mint_test.go — those already pin the
// store's Firestore round-trip contract at the package's own level (via the
// real MintWrites), so this router-level test doesn't need to re-derive it
// through that package. Avoiding the import keeps `package main`'s test
// binary compiling REGARDLESS of backend/sightings' own compile state,
// which matters here specifically: package main also holds §1's already-
// green traversability/jump-wiring tests, and a compile error in ANY file
// of a Go test package blocks EVERY test in that package from running.
// Coupling this file to backend/sightings' compile status would silently
// regress those unrelated, already-passing tests as a side effect of §3's
// own red phase — exactly the "broken harness" failure mode the SDET
// protocol distinguishes from genuine redness. Instead, this file seeds its
// fixture directly against the PINNED FIRESTORE SCHEMA below, so its own
// redness (once backend/sightings exists too) comes only from the router
// not being wired — a real HTTP 404 — never from a shared compile fault.
//
// PINNED FIRESTORE SCHEMA (the document backend/sightings/model.go and
// dao.go must decode into a Sighting for this test, and dao_test.go's
// TestDao_Scenario_* tests, to agree): a document at
// corporations/{cid}/sightings/{digest} — the opaque SHA-256 digest over
// (actionId, targetId) add-scan-and-sightings-surface's design.md Decision 1
// mandates in place of the retired {actionId}_{targetId} scheme (see
// sightingDocId below) — with fields corporationId, actionId, systemId,
// targetId, asOf (int64), hostId — see sightings/mint_test.go for the fuller
// payload shape (position/velocity/emitting/hullCount/hullTypes) MintWrites
// itself must also produce; this fixture only sets the subset this test's
// assertions need.
//
// REVISED 2026-09-03 (add-scan-and-sightings-surface, per the orchestrator's
// adjudication that this is the SDET's revision, not the Go developer's):
// only the document-id derivation changed, to track design.md Decision 1's
// digest. Every other assertion in this file is unchanged.
//
// This test deliberately makes NO assumption about the response envelope's
// exact key names (e.g. whether records are wrapped under "sightings" or
// something else) — see the SDET handoff report. It asserts on the RAW
// response body text instead: a corporation's own read must contain its
// own record's identifying (non-target) fields, a foreign corporation's
// read must contain NONE of another corp's data, and NEITHER corp's read
// may ever contain the sighted target's raw id — not as a "targetId" key,
// and not smuggled in via the record's own Firestore document id (the
// opaque SHA-256 digest add-scan-and-sightings-surface's design.md
// Decision 1 mandates, over the retired {actionId}_{targetId} scheme that
// embedded it verbatim), since either would be exactly the dereferenceable
// handle Decision 16 forbids.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"testing"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
)

// sightingDocId computes the opaque, deterministic document id
// add-scan-and-sightings-surface's design.md Decision 1 / architect
// implementation contract §1.3 mandates in place of the retired
// {actionId}_{targetId} scheme: hex(sha256("sighting/v1\x00"+actionId+
// "\x00"+targetId)[:16]). Mirrors backend/sightings/mint.go's own
// derivation (task 2.1) so this router-level fixture and the production
// MintWrites agree on a path without this file importing hexaverse/sightings
// at all (see the file's own doc comment for why that import is avoided).
func sightingDocId(actionId, targetId string) string {
	sum := sha256.Sum256([]byte("sighting/v1\x00" + actionId + "\x00" + targetId))
	return hex.EncodeToString(sum[:16])
}

// seedSightingFixture writes one sighting document directly via the raw
// production Firestore client, using this file's own pinned schema (see
// file doc comment) rather than sightings.MintWrites — see that same
// comment for why this file avoids importing hexaverse/sightings at all.
func seedSightingFixture(t *testing.T, client *firestore.Client, cid, actionId, targetId string, data map[string]interface{}) {
	t.Helper()
	docId := sightingDocId(actionId, targetId)
	ref := client.Collection("corporations").Doc(cid).Collection("sightings").Doc(docId)
	if _, err := ref.Set(context.Background(), data, firestore.MergeAll); err != nil {
		t.Fatalf("seeding sighting fixture at corporations/%s/sightings/%s: %v", cid, docId, err)
	}
}

func spawnCorp(t *testing.T, router http.Handler, name string) (token, corpId string) {
	t.Helper()
	token = mintFirebaseIDToken(t)
	if w := doJSON(t, router, http.MethodPost, "/v1/accounts", token, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/accounts: status = %d, body = %s", w.Code, w.Body.String())
	}
	var spawn struct {
		Corporation struct {
			Id string `json:"id"`
		} `json:"corporation"`
	}
	if w := doJSON(t, router, http.MethodPost, "/v1/corporations", token,
		map[string]any{"name": name}, &spawn); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/corporations: status = %d, body = %s", w.Code, w.Body.String())
	}
	if spawn.Corporation.Id == "" {
		t.Fatalf("spawn response missing corporation id")
	}
	return token, spawn.Corporation.Id
}

func TestRouter_Scenario_SightingPileReadIsCorpScopedAndHidesTheTargetId(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()
	_, client := firestoreClient(t)

	tokenA, corpA := spawnCorp(t, router, "SDET Sightings Corp A")
	tokenB, _ := spawnCorp(t, router, "SDET Sightings Corp B")

	// A distinctive, never-otherwise-appearing target id — the substring
	// this test hunts for in every response body below.
	secretTargetId := "fleet_secret_" + uuid.NewString()
	systemId := "sys_" + uuid.NewString()
	hostId := "gate_" + uuid.NewString()
	actionId := "action_" + uuid.NewString()

	seedSightingFixture(t, client, corpA, actionId, secretTargetId, map[string]interface{}{
		"corporationId": corpA,
		"actionId":      actionId,
		"systemId":      systemId,
		"targetId":      secretTargetId,
		"asOf":          int64(999_000),
		"hostId":        hostId,
		"hullCount":     int64(2),
		"hullTypes":     []string{"frigate"},
	})

	t.Run("Scenario: A corporation reads its own pile", func(t *testing.T) {
		w := doJSON(t, router, http.MethodGet, "/v1/sightings", tokenA, nil, nil)
		if w.Code >= 500 {
			t.Fatalf("GET /v1/sightings (owning corp) returned %d — never a 5xx. Body: %s", w.Code, w.Body.String())
		}
		if w.Code != http.StatusOK {
			t.Fatalf("GET /v1/sightings (owning corp) status = %d, want 200 (route not wired yet — tasks.md 3.4). "+
				"Body: %s", w.Code, w.Body.String())
		}
		body := w.Body.String()
		if !containsAll(body, systemId, hostId) {
			t.Errorf("GET /v1/sightings (owning corp) body does not contain the seeded record's own "+
				"systemId/hostId — the pile does not appear to be serving corpA's record at all. Body: %s", body)
		}
	})

	t.Run("Scenario: The target id is stored but never serialized to the client", func(t *testing.T) {
		w := doJSON(t, router, http.MethodGet, "/v1/sightings", tokenA, nil, nil)
		if w.Code != http.StatusOK {
			t.Skip("route not wired yet — covered by the sibling subtest above")
		}
		body := w.Body.String()
		if containsAll(body, secretTargetId) {
			t.Errorf("sighting-records \"The target id is stored but never serialized to the client\": "+
				"GET /v1/sightings' response body contains the literal target id %q — via a \"targetId\" field, "+
				"or smuggled in through the record's own document id (the digest, add-scan-and-sightings-surface's "+
				"design.md Decision 1). Body: %s", secretTargetId, body)
		}
	})

	t.Run("Scenario: A corporation cannot read another corporation's pile", func(t *testing.T) {
		w := doJSON(t, router, http.MethodGet, "/v1/sightings", tokenB, nil, nil)
		if w.Code >= 500 {
			t.Fatalf("GET /v1/sightings (foreign corp) returned %d — never a 5xx. Body: %s", w.Code, w.Body.String())
		}
		if w.Code != http.StatusOK {
			t.Skip("route not wired yet — covered by the first subtest above")
		}
		body := w.Body.String()
		if containsAll(body, systemId) || containsAll(body, hostId) || containsAll(body, secretTargetId) {
			t.Errorf("sighting-records \"A corporation cannot read another corporation's pile\": corpB's "+
				"GET /v1/sightings response contains corpA's record data. Body: %s", body)
		}
	})
}

func containsAll(body string, substrs ...string) bool {
	for _, s := range substrs {
		if !strings.Contains(body, s) {
			return false
		}
	}
	return true
}
