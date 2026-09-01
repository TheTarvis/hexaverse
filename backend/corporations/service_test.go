package corporations

import (
	"context"
	"errors"
	"testing"
	"time"

	"hexaverse/action"
	"hexaverse/charts"
	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
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
func spawnStack(t *testing.T) (*Service, *charts.Service, *galaxy.Service, *fakeClock) {
	t.Helper()
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := &fakeClock{now: 1000}

	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	meta, err := gsvc.Seed(ctx, 42, spawnTestParams())
	if err != nil {
		t.Fatal(err)
	}
	gid := meta.Id
	t.Cleanup(func() {
		common.CleanupFirestoreTestData(t, client, append([]string{
			"galaxies", "galaxy_pointers", "fleets", "actions",
			corporationsCollection, accountPointerCollection, spawnClaimsCollection,
		}, galaxy.SubcollectionPaths(gid)...)...)
	})

	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), gsvc, clk)
	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	// gsvc — the real, seeded galaxy service — is the fleet stack's
	// GraphSource (the only production implementation of LaneCrossing), so
	// spawn's fleet service is wired exactly as router.go wires it.
	fsvc := fleet.NewServiceWith(fleet.NewDaoWithClient(fs), ssvc, gsvc, asvc, clk)
	fogSvc := charts.NewServiceWith(charts.NewDaoWithClient(fs), clk)
	corpSvc := NewServiceWith(NewDaoWithClient(fs), gsvc, fsvc, fogSvc, clk).
		WithSpawnParams(DefaultSpawnParams())
	return corpSvc, fogSvc, gsvc, clk
}

// spawnTestParams seeds a SMALL start area — one origin block — so the walk has
// to grow the world almost immediately. That is the point: the endless-galaxy
// pin is that consecutive wakes keep succeeding by materializing outward, and a
// generous start area would hide it.
func spawnTestParams() galaxy.GenerationParams {
	p := galaxy.DefaultParams()
	p.BlockSize = 4 // 4·78 = 312 > 180, strictly
	p.StartAreaBlockRadius = 0
	p.MinOriginComponentSystems = 2
	return p
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
	if !galaxy.HasMineableBody(res.HomeSystem) {
		t.Fatalf("home %s has no mineable body — softlock risk", home)
	}

	// Initial fog: home Explored — and NOTHING else. No onward rumor, no charted
	// lanes: a fresh spawn knows no roads until its first home scan.
	tiers, err := fogSvc.SystemTiers(ctx, res.Corporation.Id)
	if err != nil {
		t.Fatal(err)
	}
	if tiers[home] != charts.TierExplored {
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

// pocketGraph is a GraphSource whose lane-reachable component is a single
// non-mineable system — a deliberately POCKETED field (D4's residual risk made
// concrete). The walk exhausts the reachable graph and fails; there is no
// materialization that could rescue it.
type pocketGraph struct{}

func (pocketGraph) GetLiveSystem(_ context.Context, id string) (*galaxy.System, error) {
	if id != "sys_0_0" {
		return nil, galaxy.ErrSystemNotFound
	}
	return &galaxy.System{Id: id}, nil // no mineable body — never qualifies
}
func (pocketGraph) LiveGalaxyMeta(context.Context) (*galaxy.Galaxy, error) {
	return &galaxy.Galaxy{Id: "gal_pocket", OriginSystemId: "sys_0_0", Params: spawnTestParams()}, nil
}
func (g pocketGraph) GetLiveSystems(ctx context.Context, ids []string) ([]galaxy.System, error) {
	var out []galaxy.System
	for _, id := range ids {
		if sys, err := g.GetLiveSystem(ctx, id); err == nil {
			out = append(out, *sys)
		}
	}
	return out, nil
}
func (pocketGraph) LaneHorizonBlocks(context.Context, []string) ([]galaxy.Block, error) {
	return []galaxy.Block{{X: 0, Y: 0}}, nil
}
func (pocketGraph) EnsureBlocks(context.Context, ...galaxy.Block) error { return nil }
func (pocketGraph) NeighborsOfMany(context.Context, []string) (map[string][]string, error) {
	return nil, nil // a finite component: nowhere to expand
}

// TestSpawn_NoSpawnSite_LeavesAccountCorpless is the 2026-08-12 zombie-corp bug:
// a wake that fails site selection (503 no-spawn-site at the handler) must not
// commit the corp doc — the account stays corpless, gated back to the wake-up
// flow and free to retry, never stranded on a fleetless corp.
func TestSpawn_NoSpawnSite_LeavesAccountCorpless(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	t.Cleanup(func() {
		common.CleanupFirestoreTestData(t, client, corporationsCollection, accountPointerCollection, spawnClaimsCollection)
	})

	// Fleet/fog services are nil on purpose: a failed site pick must bail before
	// spawn touches either (or the corp DAO).
	corpSvc := NewServiceWith(NewDaoWithClient(fs), pocketGraph{}, nil, nil, &fakeClock{now: 1000})

	if _, err := corpSvc.Spawn(ctx, "account-1", "Bob"); !errors.Is(err, ErrNoSpawnSite) {
		t.Fatalf("Spawn on an exhausted world: err = %v, want ErrNoSpawnSite", err)
	}

	// The account must remain corpless: no doc, no pointer.
	if _, err := corpSvc.GetForAccount(ctx, "account-1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetForAccount after a failed wake: err = %v, want ErrNotFound", err)
	}
	if corpID, err := corpSvc.CorpForAccount(ctx, "account-1"); err != nil || corpID != "" {
		t.Fatalf("CorpForAccount after a failed wake = (%q, %v), want (\"\", nil)", corpID, err)
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
	fleetless := Corporation{Id: "corp_fleetless", AccountId: "account-z", Name: "Ghost", CreatedAt: clk.now,
		HomeSystemId: "sys_99_99"}
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
