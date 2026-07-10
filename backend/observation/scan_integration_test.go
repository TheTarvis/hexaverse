package observation

import (
	"context"
	"testing"
	"time"

	"hexaverse/action"
	"hexaverse/common"

	"github.com/google/uuid"
)

// settableClock drives the resolve-time far past the eta.
type settableClock struct{ now common.WorldMillis }

func (c *settableClock) Now() common.WorldMillis               { return c.now }
func (c *settableClock) FromWall(time.Time) common.WorldMillis { return c.now }
func (c *settableClock) Scale() float64                        { return 1 }

// TestScan_LateResolveSameSnapshot drives the real commit→resolve path through
// the action spine and proves the #0006/#0005 acceptance: a scan resolved hours
// late mints the SAME snapshot as one resolved on time, because the observation
// is stamped asOf:eta (the frozen effect time), not asOf:resolve-time.
func TestScan_LateResolveSameSnapshot(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "actions", "fleets", corporationsCollection)

	ctx := context.Background()
	clk := &settableClock{}
	actionSvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)

	corp := "corp-" + uuid.NewString()
	const sys = "sys-1"
	const fleetID = "fleet-scan"

	fog := NewServiceWith(NewDaoWithClient(fs), fakeFleets{}, sampleInterior(sys), clk)
	fog.RegisterResolvers(actionSvc)

	// Seed the scanning fleet actor doc with the fields the resolver decodes.
	if err := fs.Set(ctx, "fleets", fleetID, map[string]interface{}{
		"id": fleetID, "corporationId": corp, "systemId": sys,
	}); err != nil {
		t.Fatalf("seed fleet: %v", err)
	}

	const eta = common.WorldMillis(1_000)
	clk.now = 0
	if _, err := actionSvc.Commit(ctx, action.CommitSpec{
		Type: scanType, Actor: fleetID, ActorCollection: "fleets", Scope: sys, Eta: eta,
	}); err != nil {
		t.Fatalf("commit scan: %v", err)
	}

	// Resolve hours late — the clock is far past the eta.
	clk.now = eta + 9_999_999
	if _, err := actionSvc.ResolveActive(ctx, fleetID); err != nil {
		t.Fatalf("resolve: %v", err)
	}

	dao := NewDaoWithClient(fs)
	sysObs, err := dao.GetSystemObservation(ctx, corp, sys)
	if err != nil || sysObs == nil {
		t.Fatalf("system observation missing after resolve: %v", err)
	}
	if sysObs.Tier != TierSurveyed {
		t.Errorf("tier = %q, want surveyed", sysObs.Tier)
	}
	if sysObs.AsOf != eta {
		t.Errorf("system asOf = %d, want eta %d (a late resolve must still stamp asOf:eta)", sysObs.AsOf, eta)
	}

	feats, err := dao.ListFeatureObservations(ctx, corp, sys)
	if err != nil {
		t.Fatalf("feature observations: %v", err)
	}
	if len(feats) != 3 {
		t.Fatalf("minted %d feature observations, want 3", len(feats))
	}
	for _, fo := range feats {
		if fo.AsOf != eta {
			t.Errorf("feature %s asOf = %d, want eta %d", fo.FeatureId, fo.AsOf, eta)
		}
	}
}
