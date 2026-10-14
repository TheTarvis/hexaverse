package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/system"

	"cloud.google.com/go/firestore"
)

func TestDiscoveryHomeNamesAndOwnership(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	router := SetupRouter()
	token := mintFirebaseIDToken(t)
	doJSON(t, router, http.MethodPost, "/v1/accounts", token, map[string]any{}, nil)
	var spawn struct {
		Corporation struct{ Id string }
		HomeSystem  struct{ Id, Name string }
		Fleet       struct{ Id string }
	}
	w := doJSON(t, router, http.MethodPost, "/v1/corporations", token, map[string]any{"name": "Discovery Journey"}, &spawn)
	if w.Code != http.StatusOK {
		t.Fatalf("spawn: %d %s", w.Code, w.Body.String())
	}
	var interior struct {
		Features []struct {
			Id, Type, Name, CatalogueRef, OwnerCorpId string
			CanName                                   bool
		}
	}
	w = doJSON(t, router, http.MethodGet, "/v1/systems/"+spawn.HomeSystem.Id, token, nil, &interior)
	if w.Code != http.StatusOK {
		t.Fatalf("interior: %d %s", w.Code, w.Body.String())
	}
	star, station := false, false
	for _, f := range interior.Features {
		if f.Name == "" || f.CatalogueRef == "" {
			t.Fatalf("unlabelled object: %+v", f)
		}
		switch f.Type {
		case "star":
			star = true
			if f.Name != spawn.HomeSystem.Name || f.OwnerCorpId != spawn.Corporation.Id || f.CanName {
				t.Fatalf("home star: %+v", f)
			}
		case "station":
			station = true
			if f.Name != "Discovery Journey Station" || f.OwnerCorpId != spawn.Corporation.Id || f.CanName {
				t.Fatalf("home station: %+v", f)
			}
		default:
			if f.OwnerCorpId != "" {
				t.Fatalf("home star claimed child: %+v", f)
			}
		}
	}
	if !star || !station {
		t.Fatal("home star/station missing")
	}
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+spawn.Fleet.Id+"/survey", token, map[string]any{"bodyId": "missing-body"}, nil), 404)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/systems/missing-system/bodies/feat-star/name", token, map[string]any{"name": "Unreachable Haven", "confirmed": true}, nil), 404)

}

type discoveryClock struct{ at common.WorldMillis }

func (c *discoveryClock) Now() common.WorldMillis               { return c.at }
func (c *discoveryClock) Scale() float64                        { return 1 }
func (c *discoveryClock) FromWall(time.Time) common.WorldMillis { return c.at }

type discoveryPlayer struct{ token, corp, home, fleet string }

func spawnDiscoveryPlayer(t *testing.T, router http.Handler, name string) discoveryPlayer {
	t.Helper()
	token := mintFirebaseIDToken(t)
	w := doJSON(t, router, http.MethodPost, "/v1/accounts", token, map[string]any{}, nil)
	if w.Code != 200 {
		t.Fatalf("account: %d %s", w.Code, w.Body.String())
	}
	var spawn struct {
		Corporation struct{ Id string }
		HomeSystem  struct{ Id string }
		Fleet       struct{ Id string }
	}
	w = doJSON(t, router, http.MethodPost, "/v1/corporations", token, map[string]any{"name": name}, &spawn)
	if w.Code != 200 {
		t.Fatalf("spawn: %d %s", w.Code, w.Body.String())
	}
	return discoveryPlayer{token, spawn.Corporation.Id, spawn.HomeSystem.Id, spawn.Fleet.Id}
}
func parkDiscoveryFleet(t *testing.T, player discoveryPlayer, sid, bid string, at common.WorldMillis) {
	t.Helper()
	dao := fleet.NewDao()
	f, err := dao.Get(context.Background(), player.fleet)
	if err != nil {
		t.Fatal(err)
	}
	f.SystemId = sid
	f.Jump = nil
	f.AttachedTo = bid
	radius := 15.0
	if bid == "feat-star" {
		node, err := galaxy.NewService().GetLiveSystem(context.Background(), sid)
		if err != nil {
			t.Fatal(err)
		}
		radius = space.StarClearanceRadius(system.StarSize(node.Skeleton.StarClass)) + 2
	}
	f.State = space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkOrbit, BodyId: bid, Radius: radius, PeriodMs: 60000, EpochMs: at}}
	if err := dao.Save(context.Background(), *f); err != nil {
		t.Fatal(err)
	}
}
func discoveryBody(t *testing.T, router http.Handler, token, sid, bid string) map[string]any {
	t.Helper()
	interior := interiorBody(t, router, token, sid)
	for _, raw := range interior["features"].([]any) {
		f := raw.(map[string]any)
		if f["id"] == bid {
			return f
		}
	}
	t.Fatalf("body %s missing", bid)
	return nil
}
func requireDiscoveryStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("status=%d want=%d: %s", w.Code, want, w.Body.String())
	}
}

func TestDiscoverySurveyAndRemoteName(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	clock := &discoveryClock{common.WorldClock().Now()}
	router := setupRouterWithClock(clock)
	player := spawnDiscoveryPlayer(t, router, "Survey and Name")
	original := discoveryBody(t, router, player.token, player.home, "feat-star")
	nameURL := "/v1/systems/" + player.home + "/bodies/feat-star/name"
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, nameURL, player.token, map[string]any{"name": "Bright Haven", "confirmed": true}, nil), 403)
	parkDiscoveryFleet(t, player, player.home, "feat-star", clock.at)
	var survey fleet.Fleet
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/survey", player.token, map[string]any{"bodyId": "feat-star"}, &survey), 200)
	if survey.Survey == nil || survey.Survey.ArriveMs-survey.Survey.DepartMs != 30000 {
		t.Fatalf("wrong world duration: %+v", survey.Survey)
	}
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/scan", player.token, map[string]any{"hostId": "feat-star"}, nil), 409)
	clock.at += 30001
	body := discoveryBody(t, router, player.token, player.home, "feat-star")
	if body["canName"] != true {
		t.Fatalf("survey did not unlock naming: %+v", body)
	}
	// Move the fleet to another system before naming; entitlement is independent.
	other := spawnDiscoveryPlayer(t, router, "Foreign Viewer")
	parkDiscoveryFleet(t, player, other.home, "feat-star", clock.at)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, nameURL, other.token, map[string]any{"name": "Bright Haven", "confirmed": true}, nil), 403)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, nameURL, player.token, map[string]any{"name": "Bright Haven"}, nil), 400)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, nameURL, player.token, map[string]any{"name": "!", "confirmed": true}, nil), 400)
	for i := 0; i < 2; i++ {
		requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, nameURL, player.token, map[string]any{"name": "  Bright   Haven ", "confirmed": true}, nil), 200)
	}
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, nameURL, player.token, map[string]any{"name": "Another Haven", "confirmed": true}, nil), 409)
	renamed := discoveryBody(t, router, other.token, player.home, "feat-star")
	if renamed["name"] != "Bright Haven" || renamed["catalogueRef"] != original["catalogueRef"] || renamed["generatedName"] != original["generatedName"] {
		t.Fatalf("renaming lost identity/history: %+v", renamed)
	}
	var galaxy struct{ Systems []struct{ Id, Name string } }
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodGet, "/v1/galaxy", other.token, nil, &galaxy), 200)
	found := false
	for _, node := range galaxy.Systems {
		if node.Id == player.home {
			found = true
			if node.Name != "Bright Haven" {
				t.Fatalf("galaxy name=%q", node.Name)
			}
		}
	}
	if !found {
		t.Fatal("home absent from galaxy")
	}
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/corporations", player.token, map[string]any{"name": "Ignored Retry"}, nil), 200)
	if discoveryBody(t, router, player.token, player.home, "feat-star")["name"] != "Bright Haven" {
		t.Fatal("spawn retry erased confirmed name")
	}
}

func TestDiscoveryEarlierSurveyWinsWhenLaterFleetReadFirst(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	clock := &discoveryClock{common.WorldClock().Now()}
	router := setupRouterWithClock(clock)
	first := spawnDiscoveryPlayer(t, router, "Earlier Survey")
	later := spawnDiscoveryPlayer(t, router, "Later Survey")
	target := "feat-body-0"
	parkDiscoveryFleet(t, first, first.home, target, clock.at)
	parkDiscoveryFleet(t, later, first.home, target, clock.at)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+first.fleet+"/survey", first.token, map[string]any{"bodyId": target}, nil), 200)
	clock.at += 1000
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+later.fleet+"/survey", later.token, map[string]any{"bodyId": target}, nil), 200)
	clock.at += 31000
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodGet, "/v1/fleets/"+later.fleet, later.token, nil, nil), 200)
	body := discoveryBody(t, router, first.token, first.home, target)
	if body["ownerCorpId"] != first.corp || body["canName"] != true {
		t.Fatalf("earlier valid completion lost: %+v", body)
	}
	if discoveryBody(t, router, later.token, first.home, target)["canName"] != false {
		t.Fatal("losing survey earned naming rights")
	}
	if discoveryBody(t, router, first.token, first.home, "feat-star")["ownerCorpId"] != first.corp {
		t.Fatal("independent body claim changed home ownership")
	}
}

func TestDiscoverySurveyDepartureAndReturnCancels(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	clock := &discoveryClock{common.WorldClock().Now()}
	router := setupRouterWithClock(clock)
	player := spawnDiscoveryPlayer(t, router, "Return Survey")
	parkDiscoveryFleet(t, player, player.home, "feat-star", clock.at)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/survey", player.token, map[string]any{"bodyId": "feat-star"}, nil), 200)
	var moving fleet.Fleet
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/orders", player.token, map[string]any{"point": space.Vec3{X: 100}}, &moving), 200)
	if moving.State.Burn == nil {
		t.Fatal("movement channel unavailable during survey")
	}
	clock.at = moving.State.Burn.ArriveMs + 1
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/orders", player.token, map[string]any{"point": space.Vec3{X: 20}}, &moving), 200)
	clock.at = max(clock.at+30001, moving.State.Burn.ArriveMs+1)
	body := discoveryBody(t, router, player.token, player.home, "feat-star")
	if body["canName"] != false {
		t.Fatal("returning before resolution hid departure from range")
	}
	var settled fleet.Fleet
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodGet, "/v1/fleets/"+player.fleet, player.token, nil, &settled), 200)
	if settled.ActiveScanId != "" || settled.Survey != nil {
		t.Fatal("cancelled survey retained sensor slot")
	}
}

func TestDiscoverySurveyTiesAndCancelledContenders(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	for _, cancelEarlier := range []bool{false, true} {
		t.Run(fmt.Sprint("cancelEarlier=", cancelEarlier), func(t *testing.T) {
			clock := &discoveryClock{common.WorldClock().Now()}
			router := setupRouterWithClock(clock)
			a := spawnDiscoveryPlayer(t, router, "Tie Alpha")
			b := spawnDiscoveryPlayer(t, router, "Tie Beta")
			parkDiscoveryFleet(t, a, a.home, "feat-body-0", clock.at)
			parkDiscoveryFleet(t, b, a.home, "feat-body-0", clock.at)
			var first, later fleet.Fleet
			requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+a.fleet+"/survey", a.token, map[string]any{"bodyId": "feat-body-0"}, &first), 200)
			if cancelEarlier {
				requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/actions/"+first.ActiveScanId+"/cancel", a.token, map[string]any{}, nil), 200)
				clock.at += 1000
			}
			requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+b.fleet+"/survey", b.token, map[string]any{"bodyId": "feat-body-0"}, &later), 200)
			expected := a.corp
			if cancelEarlier || later.ActiveScanId < first.ActiveScanId {
				expected = b.corp
			}
			clock.at += 30001
			// Resolve the contender that loses first, including exact completion ties.
			loser := b
			if expected == b.corp {
				loser = a
			}
			requireDiscoveryStatus(t, doJSON(t, router, http.MethodGet, "/v1/fleets/"+loser.fleet, loser.token, nil, nil), 200)
			body := discoveryBody(t, router, a.token, a.home, "feat-body-0")
			if body["ownerCorpId"] != expected {
				t.Fatalf("winner=%v want %s", body["ownerCorpId"], expected)
			}
		})
	}
}

func TestDiscoveryConcurrentNamesReserveOneLocalWinner(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	clock := &discoveryClock{common.WorldClock().Now()}
	router := setupRouterWithClock(clock)
	player := spawnDiscoveryPlayer(t, router, "Name Race")
	for _, bid := range []string{"feat-star", "feat-body-0"} {
		parkDiscoveryFleet(t, player, player.home, bid, clock.at)
		requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/survey", player.token, map[string]any{"bodyId": bid}, nil), 200)
		clock.at += 30001
		if discoveryBody(t, router, player.token, player.home, bid)["canName"] != true {
			t.Fatalf("no entitlement for %s", bid)
		}
	}
	type result struct {
		bid    string
		status int
	}
	results := make(chan result, 2)
	for _, bid := range []string{"feat-star", "feat-body-0"} {
		go func(bid string) {
			name := "Quiet Anchorage"
			if bid == "feat-body-0" {
				name = "quiet anchorage"
			}
			w := doJSON(t, router, http.MethodPost, "/v1/systems/"+player.home+"/bodies/"+bid+"/name", player.token, map[string]any{"name": name, "confirmed": true}, nil)
			results <- result{bid, w.Code}
		}(bid)
	}
	successes := 0
	for i := 0; i < 2; i++ {
		r := <-results
		if r.status == 200 {
			successes++
		} else if r.status == 409 {
			if discoveryBody(t, router, player.token, player.home, r.bid)["canName"] != true {
				t.Fatal("conflict consumed naming entitlement")
			}
		} else {
			t.Fatalf("name race status %d", r.status)
		}
	}
	if successes != 1 {
		t.Fatalf("name race successes=%d", successes)
	}
	other := spawnDiscoveryPlayer(t, router, "Other Naming Scope")
	parkDiscoveryFleet(t, other, other.home, "feat-body-0", clock.at)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+other.fleet+"/survey", other.token, map[string]any{"bodyId": "feat-body-0"}, nil), 200)
	clock.at += 30001
	discoveryBody(t, router, other.token, other.home, "feat-body-0")
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/systems/"+other.home+"/bodies/feat-body-0/name", other.token, map[string]any{"name": "Quiet Anchorage", "confirmed": true}, nil), 200)
}

func TestDiscoveryArrivalCreditSurvivesAnotherCorporationsStarClaim(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	clock := &discoveryClock{common.WorldClock().Now()}
	router := setupRouterWithClock(clock)
	arrival := spawnDiscoveryPlayer(t, router, "First Arrival")
	surveyor := spawnDiscoveryPlayer(t, router, "First Star Survey")
	var interior struct {
		LaneGates []struct{ Id, DestSystemId, LaneId string }
	}
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodGet, "/v1/systems/"+arrival.home, arrival.token, nil, &interior), 200)
	destination, gate, lane := "", "", ""
	for _, g := range interior.LaneGates {
		body := discoveryBody(t, router, arrival.token, g.DestSystemId, "feat-star")
		if body["ownerCorpId"] == nil {
			destination, gate, lane = g.DestSystemId, g.Id, g.LaneId
			break
		}
	}
	if destination == "" {
		t.Fatal("no unclaimed neighbor for arrival journey")
	}
	if record := discoveryBody(t, router, arrival.token, destination, "feat-star")["discovery"]; record != nil {
		t.Fatalf("opening map earned discovery: %+v", record)
	}
	parkDiscoveryFleet(t, arrival, arrival.home, gate, clock.at)
	var jumping fleet.Fleet
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+arrival.fleet+"/jump", arrival.token, map[string]any{"laneId": lane}, &jumping), 200)
	clock.at = jumping.Jump.ArriveMs + 1
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodGet, "/v1/fleets/"+arrival.fleet, arrival.token, nil, nil), 200)
	before := discoveryBody(t, router, arrival.token, destination, "feat-star")
	if before["ownerCorpId"] != nil || before["canName"] != false {
		t.Fatal("arrival granted a claim or entitlement")
	}
	parkDiscoveryFleet(t, surveyor, destination, "feat-star", clock.at)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+surveyor.fleet+"/survey", surveyor.token, map[string]any{"bodyId": "feat-star"}, nil), 200)
	clock.at += 30001
	after := discoveryBody(t, router, surveyor.token, destination, "feat-star")
	history := after["discovery"].(map[string]any)
	if history["firstArrival"].(map[string]any)["corporationId"] != arrival.corp || history["firstSurvey"].(map[string]any)["corporationId"] != surveyor.corp || after["ownerCorpId"] != surveyor.corp {
		t.Fatalf("arrival and survey credit merged: %+v", after)
	}
}

func TestDiscoverySurveyChecksRangeBoundaryAndProtectedTargets(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	clock := &discoveryClock{common.WorldClock().Now()}
	router := setupRouterWithClock(clock)
	player := spawnDiscoveryPlayer(t, router, "Range Boundary")
	dao := fleet.NewDao()
	ctx := context.Background()
	for _, tc := range []struct {
		distance float64
		status   int
	}{{49, 409}, {48, 200}} {
		f, err := dao.Get(ctx, player.fleet)
		if err != nil {
			t.Fatal(err)
		}
		f.State = space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{Anchor: space.Vec3{X: tc.distance}, EpochMs: clock.at}}
		if err := dao.Save(ctx, *f); err != nil {
			t.Fatal(err)
		}
		requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/survey", player.token, map[string]any{"bodyId": "feat-star"}, nil), tc.status)
	}
	clock.at += 30001
	if discoveryBody(t, router, player.token, player.home, "feat-star")["canName"] != true {
		t.Fatal("range boundary did not complete")
	}
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/survey", player.token, map[string]any{"bodyId": "feat-station"}, nil), 409)
	meta, err := galaxy.NewService().LiveGalaxyMeta(ctx)
	if err != nil {
		t.Fatal(err)
	}
	db := common.NewFirestoreService()
	path := "galaxies/" + meta.Id + "/systems/" + player.home + "/features"
	if err := db.Update(ctx, path, "feat-body-0", []firestore.Update{{Path: "namingProtected", Value: true}, {Path: "name", Value: "Established Haven"}}); err != nil {
		t.Fatal(err)
	}
	parkDiscoveryFleet(t, player, player.home, "feat-body-0", clock.at)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/survey", player.token, map[string]any{"bodyId": "feat-body-0"}, nil), 409)
	body := discoveryBody(t, router, player.token, player.home, "feat-body-0")
	if body["name"] != "Established Haven" || body["namingProtected"] != true || body["canName"] != false {
		t.Fatalf("protected place changed: %+v", body)
	}
}

func TestDiscoverySurveyRejectsExcursionBetweenValidEndpoints(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	clock := &discoveryClock{common.WorldClock().Now()}
	router := setupRouterWithClock(clock)
	player := spawnDiscoveryPlayer(t, router, "Whole Interval Survey")
	dao := fleet.NewDao()
	f, err := dao.Get(context.Background(), player.fleet)
	if err != nil {
		t.Fatal(err)
	}
	// Arrange an already committed curved trajectory, as the other router geometry
	// fixtures do. Both endpoints are in range; the path goes far outside it.
	curve := space.Curve{P0: space.Vec3{X: 20}, C1: space.Vec3{X: 200}, C2: space.Vec3{X: 200}, C3: space.Vec3{X: 200}, C4: space.Vec3{X: 200}, P5: space.Vec3{X: 20}}
	endpoint := space.Vec3{X: 20}
	f.State = space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{Origin: endpoint, Target: space.Target{Point: &endpoint}, Intercept: endpoint, Curve: curve, Length: curve.Length(), DepartMs: clock.at, ArriveMs: clock.at + 20000, Accel: 8}}
	if err := dao.Save(context.Background(), *f); err != nil {
		t.Fatal(err)
	}
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/survey", player.token, map[string]any{"bodyId": "feat-star"}, nil), 200)
	clock.at += 30001
	body := discoveryBody(t, router, player.token, player.home, "feat-star")
	if body["canName"] != false {
		t.Fatal("checking only endpoints awarded an invalid survey")
	}
	var options struct {
		Outcome    string
		SensorBusy bool
	}
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodGet, "/v1/fleets/"+player.fleet+"/survey", player.token, nil, &options), 200)
	if options.SensorBusy || !strings.Contains(options.Outcome, "cancelled") {
		t.Fatalf("invalid survey did not release slot with a reason: %+v", options)
	}
}

func TestDiscoverySurveyMovementInsideRangeCompletes(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	clock := &discoveryClock{common.WorldClock().Now()}
	router := setupRouterWithClock(clock)
	player := spawnDiscoveryPlayer(t, router, "Moving Survey")
	parkDiscoveryFleet(t, player, player.home, "feat-star", clock.at)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/survey", player.token, map[string]any{"bodyId": "feat-star"}, nil), 200)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+player.fleet+"/orders", player.token, map[string]any{"point": space.Vec3{X: 20}}, nil), 200)
	clock.at += 30001
	if discoveryBody(t, router, player.token, player.home, "feat-star")["canName"] != true {
		t.Fatal("movement within range prevented a valid survey")
	}
}

func TestDiscoveryForeignHomeSurveyPreservesOwnerAndNamingRights(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)
	clock := &discoveryClock{common.WorldClock().Now()}
	router := setupRouterWithClock(clock)
	owner := spawnDiscoveryPlayer(t, router, "Home Authority")
	visitor := spawnDiscoveryPlayer(t, router, "Home Visitor")
	parkDiscoveryFleet(t, visitor, owner.home, "feat-star", clock.at)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+visitor.fleet+"/survey", visitor.token, map[string]any{"bodyId": "feat-star"}, nil), 200)
	clock.at += 30001
	body := discoveryBody(t, router, visitor.token, owner.home, "feat-star")
	if body["ownerCorpId"] != owner.corp || body["canName"] != false {
		t.Fatal("foreign survey took an existing home claim")
	}
	if discoveryBody(t, router, owner.token, owner.home, "feat-star")["canName"] != false {
		t.Fatal("foreign survey unlocked the owner's entitlement")
	}
	parkDiscoveryFleet(t, owner, owner.home, "feat-star", clock.at)
	requireDiscoveryStatus(t, doJSON(t, router, http.MethodPost, "/v1/fleets/"+owner.fleet+"/survey", owner.token, map[string]any{"bodyId": "feat-star"}, nil), 200)
	clock.at += 30001
	if discoveryBody(t, router, owner.token, owner.home, "feat-star")["canName"] != true {
		t.Fatal("owner's own survey did not unlock naming")
	}
}
