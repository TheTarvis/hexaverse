package corporations

import (
	"context"
	"testing"
	"time"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/observation"
	"hexaverse/system"
)

type fakeClock struct{ now common.WorldMillis }

func (c *fakeClock) Now() common.WorldMillis               { return c.now }
func (c *fakeClock) FromWall(time.Time) common.WorldMillis { return c.now }
func (c *fakeClock) Scale() float64                        { return 1 }

// spawnStack wires the full M9 stack against the emulator: a real generated
// galaxy + the fleet/fog/corporation services spawn orchestrates through. Returns
// the corporation service under test plus the fog service (for asserting the
// initial observations) and the live galaxy.
func spawnStack(t *testing.T) (*Service, *observation.Service, *galaxy.GeneratedGalaxy, *fakeClock) {
	t.Helper()
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := &fakeClock{now: 1000}

	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	gen, err := gsvc.Generate(ctx, 42, galaxy.DefaultParams())
	if err != nil {
		t.Fatal(err)
	}
	gid := gen.Galaxy.Id
	t.Cleanup(func() {
		common.CleanupFirestoreTestData(t, client,
			"galaxies", "galaxy_pointers", "fleets", "actions",
			corporationsCollection, accountPointerCollection,
			"galaxies/"+gid+"/systems", "galaxies/"+gid+"/lanes")
	})

	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), gsvc, clk)
	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	fsvc := fleet.NewServiceWith(fleet.NewDaoWithClient(fs), ssvc, asvc, clk)
	fogSvc := observation.NewServiceWith(observation.NewDaoWithClient(fs), fsvc, ssvc, gsvc, clk)
	corpSvc := NewServiceWith(NewDaoWithClient(fs), gsvc, fsvc, fogSvc, clk)
	return corpSvc, fogSvc, gen, clk
}

// TestSpawn_CreatesCorpFleetAndFog covers acceptance #1 + the starting-package and
// initial-fog criteria: one wake creates the corp (account-linked), exactly one
// fleet owned by it, and the home observation at Explored — with NO lanes charted
// and no other system known (#0006 Decision #17, 2026-07-14: the first home scan
// finds the roads). The home carries the bootstrap-mineable guarantee.
// Spec: 0009/S1
// Spec: 0006/S6
func TestSpawn_CreatesCorpFleetAndFog(t *testing.T) {
	corpSvc, fogSvc, _, _ := spawnStack(t)
	ctx := context.Background()

	res, err := corpSvc.Spawn(ctx, "account-1", "Bob")
	if err != nil {
		t.Fatal(err)
	}

	// Corp: account-linked, living, named.
	if res.Corporation.AccountId != "account-1" || res.Corporation.Name != "Bob" {
		t.Fatalf("corp = %+v, want accountId=account-1 name=Bob", res.Corporation)
	}
	if !res.Corporation.Living() {
		t.Fatal("fresh corp should be living")
	}

	// Exactly one fleet, owned by the corp, in the home system.
	if res.Fleet == nil || res.Fleet.CorporationId != res.Corporation.Id {
		t.Fatalf("fleet = %+v, want one owned by %s", res.Fleet, res.Corporation.Id)
	}
	fleets, err := (fleetLister{corpSvc}).list(ctx, res.Corporation.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(fleets) != 1 {
		t.Fatalf("fleet count = %d, want exactly 1", len(fleets))
	}
	home := res.HomeSystem.Id
	if res.Fleet.SystemId != home {
		t.Fatalf("fleet in %s, home is %s", res.Fleet.SystemId, home)
	}

	// Bootstrap guarantee: home has a mineable body on the skeleton.
	if !hasMineableBody(res.HomeSystem) {
		t.Fatalf("home %s has no mineable body — softlock risk", home)
	}

	// Initial fog: home Explored — and NOTHING else. No onward rumor, no charted
	// lanes: a fresh spawn knows no roads until its first home scan.
	tiers, err := fogSvc.SystemTiers(ctx, res.Corporation.Id)
	if err != nil {
		t.Fatal(err)
	}
	if tiers[home] != observation.TierExplored {
		t.Fatalf("home tier = %q, want explored", tiers[home])
	}
	if len(tiers) != 1 {
		t.Fatalf("spawn charted %d systems (%v), want exactly home — no onward rumor", len(tiers), tiers)
	}
	charted, err := fogSvc.ChartedLanes(ctx, res.Corporation.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(charted) != 0 {
		t.Fatalf("spawn charted %d lanes (%v), want zero — the first scan finds the roads", len(charted), charted)
	}
}

// TestSpawn_Idempotent covers acceptance #3: a second wake returns the same living
// corp and the same single fleet — no duplicate corps or fleets.
// Spec: 0009/S2
func TestSpawn_Idempotent(t *testing.T) {
	corpSvc, _, _, _ := spawnStack(t)
	ctx := context.Background()

	first, err := corpSvc.Spawn(ctx, "account-1", "Bob")
	if err != nil {
		t.Fatal(err)
	}
	second, err := corpSvc.Spawn(ctx, "account-1", "Bob Again")
	if err != nil {
		t.Fatal(err)
	}
	if second.Corporation.Id != first.Corporation.Id {
		t.Fatalf("second spawn minted a new corp %s (first %s)", second.Corporation.Id, first.Corporation.Id)
	}
	if second.Fleet.Id != first.Fleet.Id {
		t.Fatalf("second spawn minted a new fleet %s (first %s)", second.Fleet.Id, first.Fleet.Id)
	}
	fleets, err := (fleetLister{corpSvc}).list(ctx, first.Corporation.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(fleets) != 1 {
		t.Fatalf("after two spawns, fleet count = %d, want 1", len(fleets))
	}
}

// TestSpawn_TwoAccountsTwoCorps covers ownership isolation: distinct accounts get
// distinct corps and distinct fleets, and each account resolves to its own corp.
// Spec: 0009/S4
func TestSpawn_TwoAccountsTwoCorps(t *testing.T) {
	corpSvc, _, _, _ := spawnStack(t)
	ctx := context.Background()

	a, err := corpSvc.Spawn(ctx, "account-a", "Aye")
	if err != nil {
		t.Fatal(err)
	}
	b, err := corpSvc.Spawn(ctx, "account-b", "Bee")
	if err != nil {
		t.Fatal(err)
	}
	if a.Corporation.Id == b.Corporation.Id {
		t.Fatal("two accounts share a corp")
	}
	if a.Fleet.Id == b.Fleet.Id {
		t.Fatal("two accounts share a fleet")
	}
	for acct, want := range map[string]string{"account-a": a.Corporation.Id, "account-b": b.Corporation.Id} {
		got, err := corpSvc.CorpForAccount(ctx, acct)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("CorpForAccount(%s) = %s, want %s", acct, got, want)
		}
	}
}

// TestDeathInvariant covers acceptance #6: a corp with a living fleet cannot be
// marked dead; a corp with zero fleets can.
// Spec: 0009/S5
func TestDeathInvariant(t *testing.T) {
	corpSvc, _, _, clk := spawnStack(t)
	ctx := context.Background()

	spawned, err := corpSvc.Spawn(ctx, "account-1", "Bob")
	if err != nil {
		t.Fatal(err)
	}
	// Living fleet ⇒ death refused.
	if err := corpSvc.MarkDead(ctx, spawned.Corporation.Id); err != ErrHasLivingFleet {
		t.Fatalf("MarkDead with a living fleet: err = %v, want ErrHasLivingFleet", err)
	}

	// A corp with no fleet (minted directly) ⇒ death allowed and stamped.
	fleetless := Corporation{Id: "corp_fleetless", AccountId: "account-z", Name: "Ghost", CreatedAt: clk.now}
	if err := corpSvc.dao.CreateWithPointer(ctx, fleetless); err != nil {
		t.Fatal(err)
	}
	if err := corpSvc.MarkDead(ctx, fleetless.Id); err != nil {
		t.Fatalf("MarkDead with zero fleets: %v", err)
	}
	dead, err := corpSvc.dao.Get(ctx, fleetless.Id)
	if err != nil {
		t.Fatal(err)
	}
	if dead.Living() {
		t.Fatal("corp with zero fleets should be marked dead")
	}
}

// fleetLister reaches the fleet service the corp service holds, to count a corp's
// fleets in assertions without re-plumbing the stack.
type fleetLister struct{ s *Service }

func (f fleetLister) list(ctx context.Context, corpID string) ([]fleet.Fleet, error) {
	return f.s.fleets.ListForCorp(ctx, corpID)
}
