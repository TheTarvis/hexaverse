package main

// Regression-confirmation test for openspec change
// replace-observation-with-sightings, tasks.md 8.7 — "Regression-confirm
// trading-station's tier gate applies only to the direct station read
// (GET /v1/systems/:systemId/station) and never to the system-interior/board
// read, which serves a system's station unconditionally per system-interior's
// 'Bodies Are Public; Ships Are Disclosed'."
//
// (trading-station: "Home Station Visible On the Direct Station Read, No Scan
// Required" — "A freshly spawned corporation's first direct station read shows
// its home station"; "The board read serves the station regardless of tier".)
//
// WHY THIS IS NEW CODE FOR A CONFIRMATION TASK: the confirmation held on
// reading the source (system/service.go's spliceStation is ungated and takes no
// requester; stations.GetVisible — the DIRECT read's only path — is the sole
// tier-gated one; system/gates_deletion_test.go pins that no tier symbol
// survives anywhere in `system`'s production source). But the delta's own
// scenario "The board read serves the station regardless of tier" had NO
// behavioural test: `system/station_splice_test.go` exercises spliceStation
// with a fake station source, one layer below the interior read, and every
// existing tier test lives in `stations` on the direct read. Nothing anywhere
// drove BOTH endpoints with the SAME below-tier requester and compared them,
// which is the entire content of the corrected requirement. This test does
// exactly that, against the real production-constructed router, with two real
// spawned corporations and no fakes.
//
// The two corporations are load-bearing: a corporation's OWN home is always
// `explored`, so a below-tier requester for a station-bearing system can only
// be another corporation. Spawn site selection guarantees the two homes differ
// (minSpawnDistance), and the test fails loudly rather than skipping if they
// somehow don't.

import (
	"net/http"
	"testing"
)

type stationSpawn struct {
	token  string
	corpId string
	homeId string
}

// spawnCorp provisions a fresh account and corporation through the real HTTP
// surface, returning its token and home system id.
func spawnCorpWithHome(t *testing.T, router http.Handler, name string) stationSpawn {
	t.Helper()
	token := mintFirebaseIDToken(t)
	if w := doJSON(t, router, http.MethodPost, "/v1/accounts", token, map[string]any{}, nil); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/accounts for %s: status = %d, body = %s", name, w.Code, w.Body.String())
	}
	var spawn struct {
		Corporation struct{ Id string } `json:"corporation"`
		HomeSystem  struct{ Id string } `json:"homeSystem"`
	}
	if w := doJSON(t, router, http.MethodPost, "/v1/corporations", token,
		map[string]any{"name": name}, &spawn); w.Code != http.StatusOK {
		t.Fatalf("POST /v1/corporations for %s: status = %d, body = %s", name, w.Code, w.Body.String())
	}
	if spawn.HomeSystem.Id == "" {
		t.Fatalf("spawn response for %s carried no home system id: %+v", name, spawn)
	}
	return stationSpawn{token: token, corpId: spawn.Corporation.Id, homeId: spawn.HomeSystem.Id}
}

// interiorHasStation reports whether a system-interior read served as `token`
// carries a feature of type "station".
func interiorHasStation(t *testing.T, router http.Handler, token, systemId string) (bool, string) {
	t.Helper()
	var body struct {
		Features []struct {
			Id   string `json:"id"`
			Type string `json:"type"`
		} `json:"features"`
	}
	w := doJSON(t, router, http.MethodGet, "/v1/systems/"+systemId, token, nil, &body)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/systems/%s: status = %d, body = %s", systemId, w.Code, w.Body.String())
	}
	if len(body.Features) == 0 {
		t.Fatalf("GET /v1/systems/%s served zero features — the station assertion would be vacuous. Body: %s",
			systemId, w.Body.String())
	}
	for _, f := range body.Features {
		if f.Type == "station" {
			return true, w.Body.String()
		}
	}
	return false, w.Body.String()
}

func TestStationReads_Scenario_TierGateAppliesToTheDirectReadOnly(t *testing.T) {
	requireE2EEmulators(t)
	ensureFirebaseInitialized(t)

	router := SetupRouter()

	host := spawnCorpWithHome(t, router, "SDET Station Host Corp")
	stranger := spawnCorpWithHome(t, router, "SDET Station Stranger Corp")
	if host.homeId == stranger.homeId {
		t.Fatalf("both corporations woke in the same home system (%q) — site selection must place them "+
			"minSpawnDistance apart, and this test needs a station-bearing system the SECOND corp has not "+
			"explored", host.homeId)
	}

	// Scenario: A freshly spawned corporation's first direct station read shows
	// its home station (no scan, no other action — the read straight after
	// spawn).
	t.Run("Scenario: A freshly spawned corporation's first direct station read shows its home station", func(t *testing.T) {
		var st struct {
			SystemId  string `json:"systemId"`
			FeatureId string `json:"featureId"`
		}
		w := doJSON(t, router, http.MethodGet, "/v1/systems/"+host.homeId+"/station", host.token, nil, &st)
		if w.Code != http.StatusOK {
			t.Fatalf("trading-station \"A freshly spawned corporation's first direct station read shows its home "+
				"station\": GET /v1/systems/%s/station as its OWN corporation returned %d, want 200 (spawn sets "+
				"home to at least `explored`, which clears MinVisibilityTier). Body: %s",
				host.homeId, w.Code, w.Body.String())
		}
		if st.SystemId != host.homeId || st.FeatureId == "" {
			t.Errorf("direct station read returned %+v, want the home system's own station", st)
		}
	})

	// The gate's own precondition: the stranger really is below the minimum
	// tier for the host's home. Asserted through the gate's own observable —
	// the direct read 404s — so this test never claims "ungated" for a
	// requester that was, in fact, never gated.
	t.Run("Scenario: A system below the configured minimum tier is hidden on the DIRECT read", func(t *testing.T) {
		w := doJSON(t, router, http.MethodGet, "/v1/systems/"+host.homeId+"/station", stranger.token, nil, nil)
		if w.Code != http.StatusNotFound {
			t.Fatalf("GET /v1/systems/%s/station as a corporation that has never explored it returned %d, want "+
				"404 — the tier gate on the DIRECT read is trading-station's \"Station Existence Hidden Below "+
				"the Visibility Gate\", and it must still hold (this change scopes it to this endpoint, it does "+
				"not remove it). Body: %s", host.homeId, w.Code, w.Body.String())
		}
	})

	// Scenario: The board read serves the station regardless of tier — the SAME
	// requester, the SAME system, one endpoint over.
	t.Run("Scenario: The board read serves the station regardless of tier", func(t *testing.T) {
		found, body := interiorHasStation(t, router, stranger.token, host.homeId)
		if !found {
			t.Fatalf("trading-station \"The board read serves the station regardless of tier\": "+
				"GET /v1/systems/%s (the system-interior/board read) carries NO station feature for a "+
				"corporation whose graph tier for that system is below MinVisibilityTier — while the direct "+
				"station read for the same system, same requester, correctly 404s. The interior read computes no "+
				"tier gate over any body (system-interior \"Bodies Are Public; Ships Are Disclosed\"), so the "+
				"station must ship in full here like any other body. Body: %s", host.homeId, body)
		}
	})

	// And the owner's own board read serves it too — so a failure above is
	// unambiguously about the requester's tier rather than about the station
	// being absent from the interior for everyone.
	t.Run("SDET-added diagnostic: the board read serves the station to the owning corporation too", func(t *testing.T) {
		found, body := interiorHasStation(t, router, host.token, host.homeId)
		if !found {
			t.Fatalf("GET /v1/systems/%s (board read) carries no station feature even for the corporation whose "+
				"OWN home it is — the station is missing from the interior read entirely, independent of any "+
				"tier question. Body: %s", host.homeId, body)
		}
	})
}
