package corporations

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"hexaverse/galaxy"
)

// materializedCount is how many systems the world currently holds — the "the
// world grew" measure the never-exhaust pin rests on.
func materializedCount(t *testing.T, gsvc *galaxy.Service) int {
	t.Helper()
	live, err := gsvc.GetLive(context.Background())
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	return len(live.Systems)
}

// TestSpawn_ConsecutiveWakesNeverExhaustTheWorld is THE pin of the endless
// galaxy: the world is seeded with only the origin block, then more accounts
// wake than that block holds systems. Before this change the Nth wake 503'd with
// ErrNoSpawnSite (reproduced on dev 2026-08-12); now every wake succeeds and the
// materialized world strictly grows to make room.
func TestSpawn_ConsecutiveWakesNeverExhaustTheWorld(t *testing.T) {
	corpSvc, _, gsvc, _ := spawnStack(t)
	ctx := context.Background()

	start := materializedCount(t, gsvc)
	// More wakes than the start area could ever host under MinSpawnDistance.
	const wakes = 8
	homes := map[string]string{}
	prev := start
	grew := false
	for i := 0; i < wakes; i++ {
		acct := fmt.Sprintf("wake-%02d", i)
		res, err := corpSvc.Spawn(ctx, acct, "Corp "+acct)
		if err != nil {
			t.Fatalf("wake %d (%s) failed after %d successful wakes: %v", i, acct, i, err)
		}
		if res.HomeSystem == nil {
			t.Fatalf("wake %d returned no home system", i)
		}
		if other, dup := homes[res.HomeSystem.Id]; dup {
			t.Fatalf("wake %s shares home %s with %s — reservations must prevent that",
				acct, res.HomeSystem.Id, other)
		}
		homes[res.HomeSystem.Id] = acct

		now := materializedCount(t, gsvc)
		if now < prev {
			t.Fatalf("the materialized world shrank after wake %d: %d → %d", i, prev, now)
		}
		if now > prev {
			grew = true
		}
		prev = now
	}
	if !grew {
		t.Fatalf("%d wakes never grew the world past its initial %d systems — "+
			"the walk cannot have been materializing outward", wakes, start)
	}
}

// Every home must be lane-reachable from the recorded origin system: the play
// space IS the origin component, enforced structurally by the walk (D4). If a
// home ever landed outside it, that corporation could never meet anyone.
func TestSpawn_EveryHomeIsLaneReachableFromTheOrigin(t *testing.T) {
	corpSvc, _, gsvc, _ := spawnStack(t)
	ctx := context.Background()

	homes := map[string]bool{}
	for i := 0; i < 6; i++ {
		res, err := corpSvc.Spawn(ctx, fmt.Sprintf("reach-%d", i), "Corp")
		if err != nil {
			t.Fatalf("wake %d: %v", i, err)
		}
		homes[res.HomeSystem.Id] = true
	}

	meta, err := gsvc.LiveGalaxyMeta(ctx)
	if err != nil {
		t.Fatal(err)
	}
	live, err := gsvc.GetLive(ctx)
	if err != nil {
		t.Fatal(err)
	}
	adj := map[string][]string{}
	for _, l := range live.Lanes {
		adj[l.AId] = append(adj[l.AId], l.BId)
		adj[l.BId] = append(adj[l.BId], l.AId)
	}
	seen := map[string]bool{meta.OriginSystemId: true}
	queue := []string{meta.OriginSystemId}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, nb := range adj[cur] {
			if !seen[nb] {
				seen[nb] = true
				queue = append(queue, nb)
			}
		}
	}
	for home := range homes {
		if !seen[home] {
			t.Fatalf("home %s is not lane-reachable from the origin %s — it fell out of the play space",
				home, meta.OriginSystemId)
		}
	}
}

// The first corporation in a fresh world wakes at (or beside) the recorded
// origin, rather than failing on an empty claimed set.
func TestSpawn_FirstCorpWakesNearTheRecordedOrigin(t *testing.T) {
	corpSvc, _, gsvc, _ := spawnStack(t)
	ctx := context.Background()

	meta, err := gsvc.LiveGalaxyMeta(ctx)
	if err != nil {
		t.Fatal(err)
	}
	res, err := corpSvc.Spawn(ctx, "first", "First")
	if err != nil {
		t.Fatal(err)
	}
	if res.HomeSystem.Id != meta.OriginSystemId {
		// Not a hard requirement that it IS the origin (the origin may be
		// non-mineable), but it must be one hop away at most.
		neighbors, err := gsvc.NeighborsOf(ctx, meta.OriginSystemId)
		if err != nil {
			t.Fatal(err)
		}
		adjacent := false
		for _, id := range neighbors {
			if id == res.HomeSystem.Id {
				adjacent = true
			}
		}
		if !adjacent {
			t.Fatalf("first wake landed at %s, neither the origin %s nor a neighbour of it",
				res.HomeSystem.Id, meta.OriginSystemId)
		}
	}
}

// Two DIFFERENT accounts waking concurrently must not share a home: exactly one
// wins the create-if-absent reservation, and the loser re-runs selection against
// the now-visible claim.
func TestSpawn_ConcurrentAccountsLandDifferentHomes(t *testing.T) {
	corpSvc, _, _, _ := spawnStack(t)
	ctx := context.Background()

	const racers = 4
	var wg sync.WaitGroup
	results := make([]*SpawnResult, racers)
	errs := make([]error, racers)
	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = corpSvc.Spawn(ctx, fmt.Sprintf("racer-%d", i), "Racer")
		}(i)
	}
	wg.Wait()

	homes := map[string]int{}
	for i := range results {
		if errs[i] != nil {
			t.Fatalf("racer %d: %v", i, errs[i])
		}
		homes[results[i].HomeSystem.Id]++
	}
	for home, n := range homes {
		if n > 1 {
			t.Fatalf("%d concurrent spawns share home %s — the reservation did not hold", n, home)
		}
	}
}

// A same-account double-spawn is NOT reservation contention: the loser returns
// the winner's corporation without re-running selection or burning a re-pick.
func TestSpawn_SameAccountDoubleSpawnNeverRePicks(t *testing.T) {
	corpSvc, _, _, _ := spawnStack(t)
	ctx := context.Background()

	// A single re-pick budget: a same-account race that consumed re-picks would
	// exhaust it and fail here.
	corpSvc.WithSpawnParams(func() SpawnParams {
		p := DefaultSpawnParams()
		p.MaxSpawnRepicks = 1
		return p
	}())

	var wg sync.WaitGroup
	results := make([]*SpawnResult, 2)
	errs := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = corpSvc.Spawn(ctx, "same-account", "Twin")
		}(i)
	}
	wg.Wait()

	for i := range errs {
		if errs[i] != nil {
			t.Fatalf("call %d: %v", i, errs[i])
		}
	}
	if results[0].Corporation.Id != results[1].Corporation.Id {
		t.Fatalf("a same-account double-spawn minted two corps: %s and %s",
			results[0].Corporation.Id, results[1].Corporation.Id)
	}
	// Both calls succeeded on a one-attempt re-pick budget, which is the pin: the
	// loser returned the winner's corporation without re-running selection.
	//
	// Deliberately NOT asserted here: that only one HULL exists. Two concurrent
	// calls can both find zero fleets in ensureSpawnAssets and both seed one — a
	// pre-existing race in spawn-asset healing (SeedFleet has no per-corp
	// idempotency guard), untouched by this change and out of its scope.
}

// Healing must reuse the corporation's RECORDED home rather than re-running
// selection — otherwise a heal drifts to a new system (the world has moved on)
// and strands an orphaned reservation behind it.
func TestSpawn_HealingReusesTheRecordedHome(t *testing.T) {
	corpSvc, _, _, _ := spawnStack(t)
	ctx := context.Background()

	first, err := corpSvc.Spawn(ctx, "healer", "Heal Me")
	if err != nil {
		t.Fatal(err)
	}
	recorded := first.Corporation.HomeSystemId
	if recorded == "" {
		t.Fatal("spawn did not record a home system on the corp doc")
	}
	if recorded != first.HomeSystem.Id {
		t.Fatalf("recorded home %s != reported home %s", recorded, first.HomeSystem.Id)
	}

	// Other corporations claim space around it; a re-pick would now land
	// elsewhere. Healing must not care.
	for i := 0; i < 3; i++ {
		if _, err := corpSvc.Spawn(ctx, fmt.Sprintf("crowd-%d", i), "Crowd"); err != nil {
			t.Fatal(err)
		}
	}

	healed, err := corpSvc.Spawn(ctx, "healer", "Heal Me")
	if err != nil {
		t.Fatal(err)
	}
	if healed.HomeSystem.Id != recorded {
		t.Fatalf("healing moved the home from %s to %s", recorded, healed.HomeSystem.Id)
	}
	if healed.Fleet.Id != first.Fleet.Id {
		t.Fatalf("healing minted a second hull")
	}

	// And exactly one reservation exists for this corporation's home.
	claims, err := corpSvc.dao.ListSpawnClaims(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !claims[recorded] {
		t.Fatalf("the recorded home %s carries no reservation", recorded)
	}
}

// The defensive walk cap, configured artificially low, fails as ErrNoSpawnSite
// and leaves the account CORPLESS — the 2026-08-12 zombie-corp invariant, now
// guarding the one remaining failure mode.
func TestSpawn_LowWalkCapLeavesAccountCorpless(t *testing.T) {
	corpSvc, _, _, _ := spawnStack(t)
	ctx := context.Background()

	// Claim the world's origin neighbourhood, then fence the walk into it.
	if _, err := corpSvc.Spawn(ctx, "settler", "Settler"); err != nil {
		t.Fatal(err)
	}
	p := DefaultSpawnParams()
	p.MinSpawnDistance = 10_000 // nothing within reach can ever qualify
	p.MaxSpawnWalkBlocks = 1    // ... and the walk may not go looking
	corpSvc.WithSpawnParams(p)

	if _, err := corpSvc.Spawn(ctx, "fenced", "Fenced"); !errors.Is(err, ErrNoSpawnSite) {
		t.Fatalf("err = %v, want ErrNoSpawnSite", err)
	}
	if _, err := corpSvc.GetForAccount(ctx, "fenced"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetForAccount after a failed wake: err = %v, want ErrNotFound", err)
	}
	if corpID, err := corpSvc.CorpForAccount(ctx, "fenced"); err != nil || corpID != "" {
		t.Fatalf("CorpForAccount after a failed wake = (%q, %v), want (\"\", nil)", corpID, err)
	}
	// One settler spawned, so exactly one reservation may exist.
	claims, err := corpSvc.dao.ListSpawnClaims(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(claims) != 1 {
		t.Fatalf("reservations = %d, want exactly the settler's 1 — a failed wake must reserve nothing", len(claims))
	}
}
