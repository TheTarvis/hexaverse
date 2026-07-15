package observation

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
)

// fakeActionSource is a hand fake of ActionSource: running scans by id.
type fakeActionSource struct{ byId map[string]*action.Action }

func (f fakeActionSource) Get(_ context.Context, id string) (*action.Action, error) {
	return f.byId[id], nil
}

// echoFixture builds a service whose corp has one fleet mid-scan at fleetHex:
// window = ScanDuration, so at t the echo front has reached
// BoardRadius × t/duration hexes — centred on the emission hex pinned in the
// scan's params (#0006 Decision #26), wherever the fleet has moved since.
func echoFixture(scan *action.Action, fleetHex board.Hex) *Service {
	// A minimal interior with a REAL occluder: the star at the core shadows
	// (sampleInterior leaves Occludes unset — no shadow to test against).
	interior := fakeInteriors{feats: map[string][]FeatureGeom{
		"sys-1": {
			{Id: "feat-star", Anchor: board.Hex{Q: 0, R: 0}, Astronomical: true, Occludes: true,
				Detail: &FeatureDetail{FeatureType: "star"}},
		},
	}}
	svc := NewServiceWith(nil,
		fakeFleets{byCorp: map[string][]FleetPos{
			"corp-a": {{Id: "fa", CorporationId: "corp-a", SystemId: "sys-1", Hex: fleetHex, ActiveScanId: "scan-1"}},
		}},
		interior,
		nil,
		nil,
	)
	svc.actions = fakeActionSource{byId: map[string]*action.Action{"scan-1": scan}}
	return svc
}

func runningScan(committedAt, eta common.WorldMillis, origin board.Hex) *action.Action {
	return &action.Action{
		Id: "scan-1", Type: "scan", Actor: "fa", Scope: "sys-1",
		Status: action.StatusRunning, CommittedAt: committedAt, Eta: eta,
		// The Firestore round-trip shape: a {q, r} map of int64s.
		Params: map[string]interface{}{
			"systemId": "sys-1",
			"origin":   map[string]interface{}{"q": int64(origin.Q), "r": int64(origin.R)},
		},
	}
}

// TestCoverage_EchoFrontGrowsWithElapsed: mid-scan, the live union includes
// everything within the returned-echo front of the scanning fleet — and
// nothing beyond it. ScanDuration is the rim round-trip, so
// front = R × elapsed/duration.
func TestCoverage_EchoFrontGrowsWithElapsed(t *testing.T) {
	at := board.Hex{Q: 0, R: 0}
	duration := common.Tuning().ScanDuration
	svc := echoFixture(runningScan(0, duration, at), at)

	rim := common.Tuning().BoardRadius
	half := common.WorldMillis(int64(duration) / 2)

	cov, err := svc.Coverage(context.Background(), "corp-a", "sys-1", half)
	if err != nil {
		t.Fatal(err)
	}
	// Front at half time = rim/2 hexes. (0,0)→(rim/2,0) has the star at the
	// fleet's own hex — the emitter's own hex never shadows — so LOS is clear.
	inside := board.Hex{Q: rim / 2, R: 0}
	beyond := board.Hex{Q: rim/2 + 1, R: 0}
	if !cov.Covers(inside) {
		t.Errorf("hex at the front (distance %d) must be live mid-scan", rim/2)
	}
	if cov.Covers(beyond) {
		t.Errorf("hex beyond the front (distance %d) must still be dark", rim/2+1)
	}

	// Early on, the same hex is beyond the front.
	early, err := svc.Coverage(context.Background(), "corp-a", "sys-1", common.WorldMillis(int64(duration)/8))
	if err != nil {
		t.Fatal(err)
	}
	if early.Covers(inside) {
		t.Errorf("echoes from distance %d cannot have returned at 1/8 of the window", rim/2)
	}
}

// TestCoverage_EchoPinnedAtOrigin: the front is centred on the EMISSION HEX
// pinned at commit — a fleet that burns or orbits mid-scan leaves its pulse
// behind and still collects the returns (#0006 Decision #26, superseding the
// live-centred antenna of #22).
func TestCoverage_EchoPinnedAtOrigin(t *testing.T) {
	duration := common.Tuning().ScanDuration
	rim := common.Tuning().BoardRadius
	// The scan was fired from the core; mid-scan the fleet has moved to (-6,6).
	// The front must be measured from the EMISSION hex, not the live one.
	emission := board.Hex{Q: 0, R: 0}
	here := board.Hex{Q: -6, R: 6}
	svc := echoFixture(runningScan(0, duration, emission), here)

	cov, err := svc.Coverage(context.Background(), "corp-a", "sys-1", duration/2)
	if err != nil {
		t.Fatal(err)
	}
	// The front's reach from the emission hex, on a star-free line: live.
	// (The star sits ON the emission hex — the emitter's own hex never shadows.)
	nearOrigin := board.Hex{Q: rim / 2, R: 0}
	if !cov.Covers(nearOrigin) {
		t.Errorf("the echo front must be centred on the pinned emission hex")
	}
	// The same reach measured from the fleet's live position is dark — unless
	// the ambient bubble covers it, so probe past the bubble.
	farFromOrigin := board.Hex{Q: -6, R: 6 + rim/2}
	if board.Distance(emission, farFromOrigin) <= rim/2 {
		t.Fatalf("fixture broken: probe hex must be beyond the front from the emission hex")
	}
	if cov.Covers(farFromOrigin) {
		t.Errorf("the echo front must not ride the fleet's live position")
	}
}

// TestCoverage_EchoLegacyFallsBackToLiveHex: a scan committed before the
// emission hex was pinned (no origin param) still contributes a front — from
// the unit's live hex, the pre-#26 behavior.
func TestCoverage_EchoLegacyFallsBackToLiveHex(t *testing.T) {
	duration := common.Tuning().ScanDuration
	rim := common.Tuning().BoardRadius
	here := board.Hex{Q: -6, R: 6}
	legacy := runningScan(0, duration, board.Hex{})
	legacy.Params = map[string]interface{}{"systemId": "sys-1"}
	svc := echoFixture(legacy, here)

	cov, err := svc.Coverage(context.Background(), "corp-a", "sys-1", duration/2)
	if err != nil {
		t.Fatal(err)
	}
	if !cov.Covers(board.Hex{Q: -6, R: 6 + rim/2}) {
		t.Errorf("a legacy scan without a pinned origin must fall back to the live hex")
	}
}

// TestCoverage_EchoRespectsOcclusion: a hex behind the star relative to the
// scanning fleet stays dark even once the front has passed its distance —
// echoes are line-of-sight like everything else (#0006 Decision #16).
func TestCoverage_EchoRespectsOcclusion(t *testing.T) {
	at := board.Hex{Q: -4, R: 0} // the star at (0,0) sits between the fleet and +x
	duration := common.Tuning().ScanDuration
	svc := echoFixture(runningScan(0, duration, at), at)

	cov, err := svc.Coverage(context.Background(), "corp-a", "sys-1", duration)
	if err != nil {
		t.Fatal(err)
	}
	if !cov.Covers(board.Hex{Q: 0, R: 0}) {
		t.Errorf("the occluder itself is seen (first body on the line)")
	}
	if cov.Covers(board.Hex{Q: 4, R: 0}) {
		t.Errorf("a hex in the star's shadow must stay dark inside the front")
	}
}

// TestCoverage_NoEchoForForeignScopeOrDoneScan: a scan in another system, or
// one no longer running, contributes no disc here.
func TestCoverage_NoEchoForForeignScopeOrDoneScan(t *testing.T) {
	at := board.Hex{Q: 0, R: 0}
	duration := common.Tuning().ScanDuration
	rim := common.Tuning().BoardRadius
	probe := board.Hex{Q: rim / 2, R: 0}

	elsewhere := runningScan(0, duration, at)
	elsewhere.Scope = "sys-9"
	svc := echoFixture(elsewhere, at)
	cov, _ := svc.Coverage(context.Background(), "corp-a", "sys-1", duration/2)
	if cov.Covers(probe) {
		t.Errorf("a scan running in another system must not light this one")
	}

	done := runningScan(0, duration, at)
	done.Status = action.StatusDone
	svc = echoFixture(done, at)
	cov, _ = svc.Coverage(context.Background(), "corp-a", "sys-1", duration/2)
	if cov.Covers(probe) {
		t.Errorf("a resolved scan owns no live front — its memory is durable now")
	}
}
