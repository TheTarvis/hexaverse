package main

// TestMain for the root e2e package: wipe the test emulator project and
// re-seed the live galaxy ONCE, before any test in this package runs.
//
// WHY THIS EXISTS
//
// Every test file in this package spawns corporations through the real
// router (POST /v1/corporations) and leaves them behind — no test in the
// package calls common.CleanupFirestoreTestData at all. Leftover
// corporations are not inert: corporations.Service.claimedSpace reads EVERY
// living corporation's charted-system set on every spawn, and
// selectSpawnSite then runs its outward walk from that whole claimed set,
// materializing each visited system's full lane horizon (spawnWalk.
// ensureHorizons) before expanding past it. So each accumulated corporation
// widens the next spawn's search frontier AND makes it write more galaxy
// blocks. Cost is therefore accumulated-state cost, not per-test cost, and
// it compounds across runs against a long-lived emulator: measured at
// ~0.5-3s per test on a fresh project and ~70s per test on a dirty one,
// until the package crosses Go's default 600s per-package timeout and
// reports "FAIL hexaverse 600.xxxs" with zero failing tests — a timeout
// indistinguishable, in the output, from an assertion failure.
//
// Wiping here (rather than per test) also removes an UNDOCUMENTED
// PRECONDITION this package used to carry: it required the emulator to
// already hold a live galaxy pointer, which a human had to remember to
// establish with `ENV=TEST go run ./cmd/seed`. Establishing the world is now
// the suite's own job.
//
// SAFETY — see wipeGuard below. This file deletes data. Four independent
// conditions must ALL hold before it deletes anything, and any one of them
// failing is enough to make a production or dev wipe impossible.
//
// CONCURRENCY. This package and the frontend Playwright stack share one
// emulator project (frontend/e2e/setup/backend-stack.ts wipes the same
// project in its globalSetup, for the same reason). Don't run them at the
// same time — the caveat already documented there now cuts both ways.

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"hexaverse/common"
	"hexaverse/config"
	"hexaverse/galaxy"
)

// e2eGalaxySeed is cmd/seed's own default seed, so the world this package
// builds for itself is the world `ENV=TEST go run ./cmd/seed` would have
// built. Fixed (never randomized) so a failure here is reproducible.
const e2eGalaxySeed int64 = 1

// realProjects can never be wiped by this file, whatever else is configured.
// These are the two projects that hold data a human would care about
// (CLAUDE.md: dev = hexaverse-game-dev, prod = hexaverse).
var realProjects = []string{"hexaverse", "hexaverse-game-dev"}

func TestMain(m *testing.M) {
	// testing.Short() is only readable after flags are parsed; m.Run() parses
	// them too, and parsing twice is harmless. Without this, `go test -short`
	// (the repo's unit-test command) would wipe the emulator for a run in
	// which every test in this package skips.
	flag.Parse()

	prepared, err := prepareE2EWorld()
	if err != nil {
		fmt.Fprintf(os.Stderr, "\ne2e world preparation failed: %v\n", err)
		os.Exit(1)
	}

	code := m.Run()

	// The loud-failure guard for backend/CLAUDE.md's registry rule. This suite
	// starts from a wiped project and drives the real router, so whatever is in
	// Firestore now is exactly what production code wrote during this run — the
	// one moment in the repo where "which collections does this backend actually
	// create?" has an authoritative answer. Anything unregistered fails the
	// package rather than accumulating silently, which is how `charts`,
	// `chartedLanes` and `sightings` went unregistered for three chain links.
	if prepared && code == 0 {
		if err := reportUnregisteredCollections(); err != nil {
			fmt.Fprintf(os.Stderr, "\n%v\n", err)
			code = 1
		}
	}
	os.Exit(code)
}

func reportUnregisteredCollections() error {
	base, ok := common.NewFirestoreService().(*common.FirestoreBaseService)
	if !ok {
		return nil // not the real client; nothing to scan
	}
	found, err := common.UnregisteredCollections(context.Background(), base.Client)
	if err != nil {
		return fmt.Errorf("scanning the emulator for unregistered collections: %w", err)
	}
	if len(found) == 0 {
		return nil
	}
	return fmt.Errorf("UNREGISTERED FIRESTORE COLLECTIONS: %v\n"+
		"These exist in the emulator after this suite ran, so production code creates them, "+
		"but common.RegisteredTopLevelCollections / common.RegisteredSubcollections do not name them.\n"+
		"Add them there (backend/CLAUDE.md's Testing rule), or every suite that cleans their parent "+
		"will orphan them from here on.", found)
}

// prepareE2EWorld clears the test emulator project and seeds a fresh live
// galaxy, reporting whether it actually did so. It is a NO-OP whenever this
// package's tests would skip anyway — under -short, or with no emulator
// configured — so the no-emulator path behaves exactly as it did before this
// file existed: every test skips with requireE2EEmulators's own message, and
// nothing is deleted.
//
// The one path whose behaviour DOES change is "emulator configured but not the
// test one" — plain `go test .` picks up backend/.env.local, which points at the
// DEV emulator. That used to run this suite against dev data; it now refuses
// with a message naming the right command, and deletes nothing. Note that
// .env.local names the same project id as .env.test, so it is the ENV=TEST
// check, not the project deny-list, that catches this case.
func prepareE2EWorld() (bool, error) {
	if testing.Short() {
		return false, nil
	}
	fsHost := os.Getenv("FIRESTORE_EMULATOR_HOST")
	authHost := os.Getenv("FIREBASE_AUTH_EMULATOR_HOST")
	if fsHost == "" || authHost == "" {
		// Same condition requireE2EEmulators skips on. Not an error: `go test .`
		// with no emulator configured must stay a clean, fast skip.
		return false, nil
	}

	// The Firestore client every service in this binary talks to is built for
	// config.ServiceConfig.FirebaseProjectID (common.initFirestoreService), so
	// that is the project we must clear — asking any other question here would
	// risk clearing a project the tests don't even read.
	project := config.ServiceConfig.FirebaseProjectID
	if err := wipeGuard(project, fsHost, authHost); err != nil {
		return false, err
	}

	if err := clearEmulatorProject(project, fsHost, authHost); err != nil {
		return false, err
	}

	start := time.Now()
	meta, err := galaxy.NewService().Seed(context.Background(), e2eGalaxySeed, galaxy.DefaultParams())
	if err != nil {
		return false, fmt.Errorf("seeding the live galaxy into project %q: %w", project, err)
	}
	fmt.Printf("[e2e] seeded live galaxy %s (seed %d, origin %s) in %s\n",
		meta.Id, e2eGalaxySeed, meta.OriginSystemId, time.Since(start).Round(time.Millisecond))
	return true, nil
}

// wipeGuard is the ONLY thing standing between this file and someone's real
// data. It requires ALL FOUR of:
//
//  1. ENV=TEST — read from the environment directly, not from parsed config,
//     so a config/flag-parsing failure cannot satisfy it by accident. ENV=TEST
//     is what makes config's init() load backend/.env.test, which is what
//     points every host and project id below at the isolated test emulator.
//  2. The target project is NOT one of the two real projects. This is a
//     categorical deny, and it doubles as the backstop for a config-parse
//     failure: FIREBASE_PROJECT_ID's compiled-in default is "hexaverse", so a
//     run where .env.test did not load refuses to wipe instead of wiping prod.
//  3. Both emulator hosts are loopback. A non-loopback host means something
//     other than a local emulator is configured, and we stop.
//  4. (structural, not checked here) The delete goes to the emulator-only
//     /emulator/v1/... REST surface, built from FIRESTORE_EMULATOR_HOST /
//     FIREBASE_AUTH_EMULATOR_HOST — routes that exist on the emulator and on
//     nothing else. Google's production Firestore has no such endpoint, so
//     even a guard bug cannot turn this into a production delete.
func wipeGuard(project, fsHost, authHost string) error {
	if !strings.EqualFold(strings.TrimSpace(os.Getenv("ENV")), "TEST") {
		return fmt.Errorf("refusing to clear emulator data: ENV=%q, want ENV=TEST "+
			"(run this package as: ENV=TEST go test .)", os.Getenv("ENV"))
	}
	for _, real := range realProjects {
		if project == real {
			return fmt.Errorf("refusing to clear project %q: it is a real (non-emulator) project. "+
				"This usually means backend/.env.test did not load and FIREBASE_PROJECT_ID fell back "+
				"to its compiled-in default", project)
		}
	}
	if project == "" {
		return fmt.Errorf("refusing to clear emulator data: no Firestore project id is configured")
	}
	for label, host := range map[string]string{
		"FIRESTORE_EMULATOR_HOST": fsHost, "FIREBASE_AUTH_EMULATOR_HOST": authHost,
	} {
		if !isLoopbackHostPort(host) {
			return fmt.Errorf("refusing to clear emulator data: %s=%q is not a loopback address", label, host)
		}
	}
	return nil
}

// isLoopbackHostPort reports whether host:port names this machine.
func isLoopbackHostPort(hostPort string) bool {
	host, _, err := net.SplitHostPort(hostPort)
	if err != nil {
		host = hostPort
	}
	host = strings.Trim(host, "[]")
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// clearEmulatorProject calls the Firestore and Auth emulators' own clear
// endpoints — the exact mechanism the frontend e2e stack already uses
// (frontend/e2e/setup/backend-stack.ts, wipeProject).
func clearEmulatorProject(project, fsHost, authHost string) error {
	firestoreClear := fmt.Sprintf("http://%s/emulator/v1/projects/%s/databases/(default)/documents", fsHost, project)
	authClear := fmt.Sprintf("http://%s/emulator/v1/projects/%s/accounts", authHost, project)

	if err := deleteURL(firestoreClear, nil); err != nil {
		return fmt.Errorf("clearing Firestore emulator project %q: %w", project, err)
	}
	// Auth emulator admin operations accept the literal "owner" bearer token.
	if err := deleteURL(authClear, map[string]string{"Authorization": "Bearer owner"}); err != nil {
		return fmt.Errorf("clearing Auth emulator project %q: %w", project, err)
	}
	fmt.Printf("[e2e] wiped emulator project %q (Firestore %s + Auth %s)\n", project, fsHost, authHost)
	return nil
}

func deleteURL(url string, headers map[string]string) error {
	req, err := http.NewRequest(http.MethodDelete, url, nil)
	if err != nil {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("DELETE %s: %w", url, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("DELETE %s: status %d", url, resp.StatusCode)
	}
	return nil
}
