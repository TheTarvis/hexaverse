package main

// Shared test-only infrastructure for the replace-observation-with-sightings
// §1 (Traversability First) red-phase suite's two production-router tests:
// router_jump_wiring_test.go (tasks.md 8.2) and traversability_e2e_test.go
// (tasks.md 1.6). Both deliberately exercise SetupRouter() itself — the
// literal production wiring in router.go — rather than a package-scoped
// substitute, since the whole point of both tests is to catch the class of
// regression a hand-rolled composition or an injected fake would hide
// (design.md Decision 22/24; the prompt's own framing: "jump_verb_test.go
// injects a fakeGraph" is exactly why blocker 3 was invisible to CI).
//
// Getting an authenticated request to SetupRouter() therefore requires a
// REAL Firebase ID token verified by the REAL Admin SDK client
// (middlewares.InitializeFirebase), which in turn requires the Firebase Auth
// emulator — the same mechanism the frontend e2e stack already uses to
// authenticate against this exact emulator (firebase.test.json, port
// 20241). This is new test INFRASTRUCTURE, not new test PHILOSOPHY: no
// existing Go integration test in this repo drives a fully-authenticated
// HTTP request through the production-constructed router, because until
// this change nothing needed to distinguish "the service logic is right"
// from "the composition root actually wires it" — see the SDET handoff
// report for the finding this gap itself represents.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"

	"hexaverse/common"
	"hexaverse/middlewares"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
)

// requireE2EEmulators skips (matching common.SetupFirestoreTestClient's own
// -short convention) unless run with ENV=TEST against the isolated test
// emulator trio (firestore/auth/pubsub, firebase.test.json) this suite
// needs — see the handoff report for the exact command.
func requireE2EEmulators(t *testing.T) {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs the Firebase Auth + Firestore + Pub/Sub emulators; skipped with -short")
	}
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" || os.Getenv("FIREBASE_AUTH_EMULATOR_HOST") == "" {
		t.Skip("requires ENV=TEST (loads backend/.env.test's emulator hosts) with the test emulator trio up " +
			"(bash scripts/dev/ensure-test-emulators.sh from the repo root), e.g.:\n" +
			"  ENV=TEST go test . -run TestRouter -v   (from backend/)")
	}
}

// firestoreClient returns the SAME singleton *firestore.Client
// common.NewFirestoreService() hands to every production NewDao() call —
// i.e., exactly what SetupRouter()'s own internally-constructed services
// read and write. A test using a DIFFERENT client (e.g.
// common.SetupFirestoreTestClient's hardcoded "test" project id) would
// silently talk to a disjoint emulator namespace and never see the data
// SetupRouter() wrote, or vice versa.
func firestoreClient(t *testing.T) (common.FirestoreService, *firestore.Client) {
	t.Helper()
	fs := common.NewFirestoreService()
	base, ok := fs.(*common.FirestoreBaseService)
	if !ok {
		t.Fatalf("common.NewFirestoreService() returned %T, want *common.FirestoreBaseService", fs)
	}
	return fs, base.Client
}

var (
	firebaseInitOnce sync.Once
	firebaseInitErr  error
)

// ensureFirebaseInitialized runs middlewares.InitializeFirebase() exactly
// once per test binary — the identical call main() makes before
// SetupRouter() — pointed at the Auth emulator via
// FIREBASE_AUTH_EMULATOR_HOST/FIREBASE_PROJECT_ID (both loaded from
// backend/.env.test when ENV=TEST).
func ensureFirebaseInitialized(t *testing.T) {
	t.Helper()
	firebaseInitOnce.Do(func() { firebaseInitErr = middlewares.InitializeFirebase() })
	if firebaseInitErr != nil {
		t.Fatalf("middlewares.InitializeFirebase: %v", firebaseInitErr)
	}
}

// mintFirebaseIDToken creates a fresh emulator user via the Auth emulator's
// own Identity Toolkit REST surface and returns a genuine Firebase ID token
// for it — the SAME mechanism the frontend e2e stack uses to authenticate
// against this identical emulator. The Admin SDK's VerifyIDToken (wired by
// ensureFirebaseInitialized) trusts emulator-issued tokens unsigned when
// FIREBASE_AUTH_EMULATOR_HOST is set — this is not a bypass of
// authentication, it is authentication against the emulator instead of
// production Google infrastructure, exactly as the rest of the local/e2e
// stack already does.
func mintFirebaseIDToken(t *testing.T) string {
	t.Helper()
	host := os.Getenv("FIREBASE_AUTH_EMULATOR_HOST")
	if host == "" {
		t.Fatal("FIREBASE_AUTH_EMULATOR_HOST is not set")
	}
	email := fmt.Sprintf("sdet-%s@example.com", uuid.NewString())
	body, err := json.Marshal(map[string]any{
		"email": email, "password": "traversability-test-pw", "returnSecureToken": true,
	})
	if err != nil {
		t.Fatalf("marshal signUp body: %v", err)
	}
	url := fmt.Sprintf("http://%s/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key", host)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("minting a Firebase Auth emulator ID token (POST %s): %v", url, err)
	}
	defer resp.Body.Close()
	var out struct {
		IdToken string `json:"idToken"`
		Error   struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decoding auth emulator signUp response: %v", err)
	}
	if out.IdToken == "" {
		t.Fatalf("auth emulator signUp returned no idToken (HTTP %d, error %q)", resp.StatusCode, out.Error.Message)
	}
	return out.IdToken
}

// doJSON issues an authenticated JSON request against router and, if out is
// non-nil and the response is a success status, decodes the body into it.
func doJSON(t *testing.T, router http.Handler, method, path, token string, reqBody, out any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			t.Fatalf("marshal request body for %s %s: %v", method, path, err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if out != nil && w.Code >= 200 && w.Code < 300 {
		if err := json.Unmarshal(w.Body.Bytes(), out); err != nil {
			t.Fatalf("unmarshal response body for %s %s (status %d): %v\nbody: %s",
				method, path, w.Code, err, w.Body.String())
		}
	}
	return w
}
