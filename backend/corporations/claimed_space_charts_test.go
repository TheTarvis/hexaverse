package corporations

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 2.6/2.10 (design.md Decision 1's rewiring list names
// corporations/service.go; specs/galaxy-knowledge/spec.md — "The
// Corporation's Visited-System Set Is the Spawn-Distance Input"; the
// adversary finding M4 this task's own text records: claimedSpace already
// measures against "every OTHER living corporation" via its existing
// exceptCorpID parameter — see corporations/service.go:511's own doc
// comment — so this pins that CORRECT existing behavior at the new
// charts.Tier type, not a new algorithm.
//
// This is a WHITE-BOX test (package corporations) so it can call the
// unexported claimedSpace method directly, mirroring the existing
// unexported-method access pattern corporations/service_test.go's own
// pocketGraph-based tests already use.
//
// EXPECTED TO FAIL ON FIRST RUN: a COMPILE error, not a behavioral one — this
// is the expected red for a rename. corporations.FogSource is declared today
// (corporations/service.go) as:
//
//	SystemTiers(ctx context.Context, cid string) (map[string]observation.Tier, error)
//
// fakeChartsFog below implements SystemTiers returning
// map[string]charts.Tier instead, so it does NOT satisfy FogSource until
// task 2.6 rewires the interface to charts.Tier — producing exactly the
// "cannot use fakeChartsFog{} (... ) as FogSource value" compile error that
// evidences the rewrite has not happened yet, per the SDET brief's own
// instruction for rename-shaped red.

import (
	"context"
	"testing"

	"hexaverse/charts"
	"hexaverse/common"

	"github.com/google/uuid"
)

// fakeChartsFog is a minimal FogSource-shaped fake keyed on charts.Tier.
type fakeChartsFog struct {
	tiersByCorp map[string]map[string]charts.Tier
}

func (f *fakeChartsFog) RevealArrival(ctx context.Context, cid, destSystemID string, at common.WorldMillis) error {
	return nil
}

func (f *fakeChartsFog) SystemTiers(ctx context.Context, cid string) (map[string]charts.Tier, error) {
	return f.tiersByCorp[cid], nil
}

// Scenario: A corporation's explored systems count toward claimed space
func TestClaimedSpace_Scenario_ExploredSystemsOfOtherLivingCorpsCountAsClaimed(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection, accountPointerCollection, spawnClaimsCollection)
	ctx := context.Background()

	corpA := "corp-" + uuid.NewString()
	corpB := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(fs)
	if err := dao.CreateWithPointer(ctx, Corporation{Id: corpA, AccountId: "acct-" + uuid.NewString(), Name: "A", CreatedAt: 1000, HomeSystemId: "sys-a-home-" + uuid.NewString()}); err != nil {
		t.Fatalf("seed corpA: %v", err)
	}
	if err := dao.CreateWithPointer(ctx, Corporation{Id: corpB, AccountId: "acct-" + uuid.NewString(), Name: "B", CreatedAt: 1000, HomeSystemId: "sys-b-home-" + uuid.NewString()}); err != nil {
		t.Fatalf("seed corpB: %v", err)
	}

	fog := &fakeChartsFog{tiersByCorp: map[string]map[string]charts.Tier{
		corpA: {"sys-x": charts.TierExplored, "sys-y": charts.TierRumored},
	}}
	svc := NewServiceWith(dao, nil, nil, fog, common.WorldClock())

	// Siting a THIRD corp (neither A nor B) — both A and B are "other living
	// corporations" whose explored space counts.
	claimed, err := svc.claimedSpace(ctx, "corp-being-sited")
	if err != nil {
		t.Fatalf("claimedSpace: %v", err)
	}
	if !claimed["sys-x"] {
		t.Errorf("claimed = %v, want sys-x present (corpA's explored system)", claimed)
	}
	if claimed["sys-y"] {
		t.Errorf("claimed = %v, want sys-y ABSENT — rumored does not count toward claimed space, only explored+", claimed)
	}
}

// Scenario: A re-pick under reservation contention measures against every
// other living corporation
//
// Pins the adversary-corrected reading precisely: exceptCorpID excludes ONLY
// the corporation currently being (re-)sited — never every corporation, and
// never a fixed exclusion list. corpA's own explored system must NOT appear
// in its own claimed-space set when corpA is the one being sited, while
// corpB's (a DIFFERENT living corporation) explored system still does.
func TestClaimedSpace_Scenario_RepickMeasuresAgainstEveryOtherLivingCorporation(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, corporationsCollection, accountPointerCollection, spawnClaimsCollection)
	ctx := context.Background()

	corpA := "corp-" + uuid.NewString()
	corpB := "corp-" + uuid.NewString()
	dao := NewDaoWithClient(fs)
	if err := dao.CreateWithPointer(ctx, Corporation{Id: corpA, AccountId: "acct-" + uuid.NewString(), Name: "A", CreatedAt: 1000, HomeSystemId: "sys-a-home-" + uuid.NewString()}); err != nil {
		t.Fatalf("seed corpA: %v", err)
	}
	if err := dao.CreateWithPointer(ctx, Corporation{Id: corpB, AccountId: "acct-" + uuid.NewString(), Name: "B", CreatedAt: 1000, HomeSystemId: "sys-b-home-" + uuid.NewString()}); err != nil {
		t.Fatalf("seed corpB: %v", err)
	}

	fog := &fakeChartsFog{tiersByCorp: map[string]map[string]charts.Tier{
		corpA: {"sys-a-explored": charts.TierExplored},
		corpB: {"sys-b-explored": charts.TierExplored},
	}}
	svc := NewServiceWith(dao, nil, nil, fog, common.WorldClock())

	// corpA is being re-picked: its OWN explored space must not fence it out.
	claimed, err := svc.claimedSpace(ctx, corpA)
	if err != nil {
		t.Fatalf("claimedSpace: %v", err)
	}
	if claimed["sys-a-explored"] {
		t.Errorf("claimed = %v, want corpA's own sys-a-explored ABSENT — a re-pick must not fence itself out of its own space", claimed)
	}
	if !claimed["sys-b-explored"] {
		t.Errorf("claimed = %v, want corpB's sys-b-explored present — every OTHER living corporation's explored space still counts", claimed)
	}
}
