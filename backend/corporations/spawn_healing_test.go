package corporations

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/stations"
	"hexaverse/system"

	"cloud.google.com/go/firestore"
)

const testStartingCredits = int64(1000)

// fakeStations records which systems were asked to provision a station, and how
// many times — enough to prove idempotency without standing up the real station
// store inside the corporation tests.
type fakeStations struct {
	delegate StationSource
	mu       sync.Mutex
	provided map[string]int
	err      error
}

func newFakeStations() *fakeStations {
	return &fakeStations{provided: map[string]int{}}
}

func (f *fakeStations) EnsureStation(ctx context.Context, systemID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	f.provided[systemID]++
	if f.delegate != nil {
		return f.delegate.EnsureStation(ctx, systemID)
	}
	return nil
}

func (f *fakeStations) count(systemID string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.provided[systemID]
}

func (f *fakeStations) systems() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.provided)
}

// marketStack is spawnStack plus the #0011 spawn assets: a station provisioner
// and a live credit store.
func marketStack(t *testing.T) (*Service, *fakeStations, *firestore.Client, *fakeClock) {
	t.Helper()
	corpSvc, fogSvc, graph, clk := spawnStack(t)
	fs, client := common.SetupFirestoreTestDAO(t)
	st := newFakeStations()
	realStations := stations.NewServiceWith(stations.NewDaoWithClient(fs), graph, fogSvc, clk)
	st.delegate = realStations
	bodies := system.NewServiceWith(system.NewDaoWithClient(fs), graph, clk).WithStations(realStations)
	corpSvc.fleets.(*fleet.Service).WithBodies(bodies)
	corpSvc.WithCreditStore(NewCreditStoreWith(fs)).WithMarket(st, testStartingCredits)
	return corpSvc, st, client, clk
}

func ledgerCleanup(t *testing.T, client *firestore.Client, corpID string) {
	t.Helper()
	common.CleanupFirestoreTestData(t, client,
		fmt.Sprintf("%s/%s/%s", corporationsCollection, corpID, ledgerSubcollection),
		fmt.Sprintf("%s/%s/%s", corporationsCollection, corpID, reconciliationSubcollection))
}

func TestSpawn_GrantsOpeningBalanceAndHomeStation(t *testing.T) {
	corpSvc, stations, client, _ := marketStack(t)
	ctx := context.Background()

	res, err := corpSvc.Spawn(ctx, "account-market-1", "Trader")
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}
	defer ledgerCleanup(t, client, res.Corporation.Id)

	balance, err := corpSvc.Balance(ctx, res.Corporation.Id)
	if err != nil {
		t.Fatalf("Balance: %v", err)
	}
	if balance != testStartingCredits {
		t.Errorf("opening balance = %d, want %d", balance, testStartingCredits)
	}
	if got := stations.count(res.HomeSystem.Id); got != 1 {
		t.Errorf("home station provisioned %d times, want 1", got)
	}
}

func TestSpawn_RepeatCallNeverDoubleGrantsOrDoubleProvisions(t *testing.T) {
	corpSvc, _, client, _ := marketStack(t)
	ctx := context.Background()

	first, err := corpSvc.Spawn(ctx, "account-market-2", "Trader")
	if err != nil {
		t.Fatalf("first Spawn: %v", err)
	}
	defer ledgerCleanup(t, client, first.Corporation.Id)

	for i := 0; i < 3; i++ {
		if _, err := corpSvc.Spawn(ctx, "account-market-2", "Trader"); err != nil {
			t.Fatalf("repeat Spawn %d: %v", i, err)
		}
	}

	balance, err := corpSvc.Balance(ctx, first.Corporation.Id)
	if err != nil {
		t.Fatalf("Balance: %v", err)
	}
	if balance != testStartingCredits {
		t.Errorf("balance after 4 spawn calls = %d, want a single grant of %d", balance, testStartingCredits)
	}
	// The grant's derived "spawn:" key is what makes this idempotent, so exactly
	// one ledger entry may exist.
	page, err := corpSvc.Ledger(ctx, first.Corporation.Id, "", 50)
	if err != nil {
		t.Fatalf("Ledger: %v", err)
	}
	if len(page.Entries) != 1 {
		t.Errorf("ledger holds %d entries after 4 spawn calls, want 1", len(page.Entries))
	}
	if len(page.Entries) == 1 && page.Entries[0].Kind != EntryStartingGrant {
		t.Errorf("entry kind = %q, want %q", page.Entries[0].Kind, EntryStartingGrant)
	}
}

func TestGetForAccount_HealsAPreExistingCorporation(t *testing.T) {
	// The migration mechanism: a corporation that predates #0011 has no station
	// and no balance, and its client only ever calls the pure-read GET /me. That
	// read must heal it — no backfill script, no explicit re-spawn.
	corpSvc, stations, client, _ := marketStack(t)
	ctx := context.Background()

	res, err := corpSvc.Spawn(ctx, "account-market-3", "Legacy")
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}
	corpID := res.Corporation.Id
	defer ledgerCleanup(t, client, corpID)

	// Rewind to a pre-#0011 corporation: no balance, no ledger, no marker.
	ledgerCleanup(t, client, corpID)
	if _, err := client.Collection(corporationsCollection).Doc(corpID).Update(ctx, []firestore.Update{
		{Path: "credits", Value: int64(0)},
		{Path: "assetsCompleteAt", Value: int64(0)},
	}); err != nil {
		t.Fatalf("rewinding corporation: %v", err)
	}

	corp, err := corpSvc.GetForAccount(ctx, "account-market-3")
	if err != nil {
		t.Fatalf("GetForAccount: %v", err)
	}
	if corp.Credits != testStartingCredits {
		t.Errorf("credits after healing read = %d, want %d", corp.Credits, testStartingCredits)
	}
	if stations.count(res.HomeSystem.Id) < 1 {
		t.Error("the healing read did not provision the home station")
	}
}

func TestGetForAccount_HealedCorporationShortCircuitsOnTheMarker(t *testing.T) {
	corpSvc, stations, client, _ := marketStack(t)
	ctx := context.Background()

	res, err := corpSvc.Spawn(ctx, "account-market-4", "Trader")
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}
	defer ledgerCleanup(t, client, res.Corporation.Id)

	before := stations.count(res.HomeSystem.Id)
	for i := 0; i < 5; i++ {
		if _, err := corpSvc.GetForAccount(ctx, "account-market-4"); err != nil {
			t.Fatalf("GetForAccount %d: %v", i, err)
		}
	}
	// The marker short-circuits at entry, so a healed corp's later reads must not
	// re-run any per-asset check.
	if after := stations.count(res.HomeSystem.Id); after != before {
		t.Errorf("station provisioning ran %d extra times across 5 healed reads; the marker should short-circuit them",
			after-before)
	}
}

func TestSpawn_SpentToZeroIsNeverReGranted(t *testing.T) {
	// "Already granted" must be decided by the ledger entry, never by
	// Credits == 0 — a corporation can legitimately spend to exactly zero, and
	// re-granting it would be a silent, unbounded faucet.
	corpSvc, _, client, _ := marketStack(t)
	ctx := context.Background()

	res, err := corpSvc.Spawn(ctx, "account-market-5", "Spender")
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}
	corpID := res.Corporation.Id
	defer ledgerCleanup(t, client, corpID)

	// Spend the whole balance down to exactly zero, through the real path.
	if _, err := corpSvc.Credits().ApplyCredit(ctx, corpID, "spend-to-zero-0123456789", LedgerEntry{
		AccountId: "account-market-5", Kind: EntryAdjustment, Amount: -testStartingCredits,
	}, 2000); err != nil {
		t.Fatalf("spending down: %v", err)
	}
	if bal, _ := corpSvc.Balance(ctx, corpID); bal != 0 {
		t.Fatalf("balance = %d, want 0 before the re-spawn", bal)
	}

	if _, err := corpSvc.Spawn(ctx, "account-market-5", "Spender"); err != nil {
		t.Fatalf("re-spawn: %v", err)
	}

	if bal, _ := corpSvc.Balance(ctx, corpID); bal != 0 {
		t.Errorf("balance = %d after re-spawn, want 0 — a corp spent to zero must never be re-granted", bal)
	}
}

func TestGetForAccount_ConcurrentHealsProvisionExactlyOnce(t *testing.T) {
	corpSvc, stations, client, _ := marketStack(t)
	ctx := context.Background()

	res, err := corpSvc.Spawn(ctx, "account-market-6", "Racer")
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}
	corpID := res.Corporation.Id
	defer ledgerCleanup(t, client, corpID)

	// Rewind to unhealed, then race several session bootstraps at once.
	ledgerCleanup(t, client, corpID)
	if _, err := client.Collection(corporationsCollection).Doc(corpID).Update(ctx, []firestore.Update{
		{Path: "credits", Value: int64(0)},
		{Path: "assetsCompleteAt", Value: int64(0)},
	}); err != nil {
		t.Fatalf("rewinding corporation: %v", err)
	}

	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = corpSvc.GetForAccount(ctx, "account-market-6")
		}()
	}
	wg.Wait()

	balance, err := corpSvc.Balance(ctx, corpID)
	if err != nil {
		t.Fatalf("Balance: %v", err)
	}
	if balance != testStartingCredits {
		t.Errorf("balance after 4 concurrent heals = %d, want exactly one grant of %d", balance, testStartingCredits)
	}
	page, err := corpSvc.Ledger(ctx, corpID, "", 50)
	if err != nil {
		t.Fatalf("Ledger: %v", err)
	}
	if len(page.Entries) != 1 {
		t.Errorf("ledger holds %d entries after concurrent heals, want exactly 1", len(page.Entries))
	}
	if stations.systems() != 1 {
		t.Errorf("stations provisioned across %d systems, want 1", stations.systems())
	}
}
