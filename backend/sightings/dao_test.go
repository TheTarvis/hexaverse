package sightings

// RED-phase tests for openspec change replace-observation-with-sightings,
// tasks.md 3.1/3.4 — the DAO layer of the sighting store: corp scoping and
// the paginated, ordered read (specs/sighting-records/spec.md — "A Sighting
// Is Readable Only By the Corporation That Holds It", "The Pile Is
// Paginated and Bounded Per Read").
//
// EXPECTED TO FAIL ON FIRST RUN: compile error — NewDaoWithClient, Dao, and
// Sighting do not exist (backend/sightings has no production files yet).
//
// CONTRACT THIS FILE PINS:
//
//	type Dao interface {
//	    Get(ctx, cid, id string) (*Sighting, error)
//	    List(ctx, cid string, limit int, cursor string) (records []Sighting, nextCursor string, err error)
//	}
//	func NewDaoWithClient(db common.FirestoreService) Dao
//
// Ordering is by AsOf descending (newest pulse-reach first — the pile's
// only time field; sighting-records "Records are ordered newest-minted-
// first"). The cursor's WIRE shape is deliberately left to the
// implementation (tasks.md 7.7 item 2 records this as an open minor) — this
// file treats a cursor as opaque: it round-trips whatever List(...) hands
// back as the next call's cursor argument, and never asserts its format.

import (
	"context"
	"testing"

	"hexaverse/common"
	"hexaverse/space"

	"github.com/google/uuid"
)

// seedSighting mints one record for cid via the SAME MintWrites +
// firestore.MergeAll path production will use (mint_test.go's setAtPath),
// with a fresh actionId so each call lands at a distinct deterministic
// document. Returns the record actually stored.
func seedSighting(t *testing.T, fs common.FirestoreService, cid string, asOf common.WorldMillis, targetId string) Sighting {
	t.Helper()
	rec := Sighting{
		CorporationId: cid,
		SystemId:      "sys-1",
		TargetId:      targetId,
		AsOf:          asOf,
		Position:      space.Vec3{X: float64(asOf)},
		HostId:        "gate-sys-2",
	}
	actionId := "action_" + uuid.NewString()
	rec.ActionId = actionId
	writes := MintWrites(cid, actionId, []Sighting{rec})
	if len(writes) != 1 {
		t.Fatalf("seedSighting: MintWrites returned %d writes, want 1", len(writes))
	}
	if err := setAtPath(context.Background(), fs, writes[0].Path, writes[0].Data); err != nil {
		t.Fatalf("seedSighting: applying write: %v", err)
	}
	return rec
}

// Scenario: A corporation reads its own pile
// Scenario: A corporation cannot read another corporation's pile
func TestDao_Scenario_CorpScopedReads(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "corporations")

	corpA := "corp-" + uuid.NewString()
	corpB := "corp-" + uuid.NewString()
	seedSighting(t, fs, corpA, 1000, "fleet_a")
	seedSighting(t, fs, corpB, 2000, "fleet_b")

	dao := NewDaoWithClient(fs)
	ctx := context.Background()

	gotA, _, err := dao.List(ctx, corpA, 10, "")
	if err != nil {
		t.Fatalf("List(corpA): %v", err)
	}
	if len(gotA) != 1 || gotA[0].TargetId != "fleet_a" {
		t.Errorf("List(corpA) = %+v, want exactly corpA's own record", gotA)
	}
	for _, r := range gotA {
		if r.CorporationId == corpB || r.TargetId == "fleet_b" {
			t.Errorf("sighting-records \"A corporation cannot read another corporation's pile\": corpA's read "+
				"returned corpB's record %+v", r)
		}
	}

	gotB, _, err := dao.List(ctx, corpB, 10, "")
	if err != nil {
		t.Fatalf("List(corpB): %v", err)
	}
	if len(gotB) != 1 || gotB[0].TargetId != "fleet_b" {
		t.Errorf("List(corpB) = %+v, want exactly corpB's own record", gotB)
	}
}

// Scenario: Records are ordered newest-minted-first
func TestDao_Scenario_OrderedNewestFirst(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "corporations")

	cid := "corp-" + uuid.NewString()
	// Seed out of chronological order on purpose.
	seedSighting(t, fs, cid, 5000, "fleet_mid")
	seedSighting(t, fs, cid, 1000, "fleet_oldest")
	seedSighting(t, fs, cid, 9000, "fleet_newest")

	dao := NewDaoWithClient(fs)
	got, _, err := dao.List(context.Background(), cid, 10, "")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("List returned %d records, want 3", len(got))
	}
	for i := 0; i+1 < len(got); i++ {
		if got[i].AsOf < got[i+1].AsOf {
			t.Fatalf("sighting-records \"Records are ordered newest-minted-first\": record %d (asOf=%d) sorts "+
				"before record %d (asOf=%d) — want strictly non-increasing AsOf. Full list: %+v",
				i, got[i].AsOf, i+1, got[i+1].AsOf, got)
		}
	}
	if got[0].AsOf != 9000 || got[len(got)-1].AsOf != 1000 {
		t.Errorf("List order = %v (by AsOf), want [9000 5000 1000]", asOfs(got))
	}
}

func asOfs(recs []Sighting) []common.WorldMillis {
	out := make([]common.WorldMillis, len(recs))
	for i, r := range recs {
		out[i] = r.AsOf
	}
	return out
}

// Scenario: A pile within the page maximum is returned in full
func TestDao_Scenario_PileWithinPageMaxReturnedInFull(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "corporations")

	cid := "corp-" + uuid.NewString()
	const n = 5
	for i := 0; i < n; i++ {
		seedSighting(t, fs, cid, common.WorldMillis(1000+i), uuid.NewString())
	}

	dao := NewDaoWithClient(fs)
	got, cursor, err := dao.List(context.Background(), cid, PageMax, "")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != n {
		t.Errorf("List returned %d records, want all %d (pile within the page maximum)", len(got), n)
	}
	if cursor != "" {
		t.Errorf("nextCursor = %q, want empty — a pile within the page maximum has no further page", cursor)
	}
}

// Scenario: A read without further parameters returns at most the page
// maximum
func TestDao_Scenario_ReadWithoutParametersBoundedToPageMax(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "corporations")

	cid := "corp-" + uuid.NewString()
	n := PageMax + 3 // deliberately over the named maximum
	for i := 0; i < n; i++ {
		seedSighting(t, fs, cid, common.WorldMillis(1000+i), uuid.NewString())
	}

	dao := NewDaoWithClient(fs)
	got, _, err := dao.List(context.Background(), cid, PageMax, "")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) > PageMax {
		t.Errorf("sighting-records \"A read without further parameters returns at most the page maximum\": "+
			"List returned %d records for a corp with %d, want no more than PageMax=%d", len(got), n, PageMax)
	}
}

// SDET-added (per the section's own standing instruction: "a continuation
// that enumerates the whole pile exactly once, no record repeated or
// skipped"). Not a scenario the shipped spec names directly — the spec pins
// only the no-continuation case (tasks.md 7.7 item 2) — but the pagination
// requirement is meaningless if pages 2+ can drop or duplicate a record, so
// this is exercised as a boundary probe on top of the two pinned scenarios
// above.
func TestDao_Scenario_ContinuationEnumeratesWholePileExactlyOnce(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	defer common.CleanupFirestoreTestData(t, client, "corporations")

	cid := "corp-" + uuid.NewString()
	const n = 7
	const pageSize = 3
	want := map[common.WorldMillis]bool{}
	for i := 0; i < n; i++ {
		rec := seedSighting(t, fs, cid, common.WorldMillis(1000+i), uuid.NewString())
		want[rec.AsOf] = true
	}

	dao := NewDaoWithClient(fs)
	ctx := context.Background()
	seen := map[common.WorldMillis]int{}
	cursor := ""
	pages := 0
	for {
		pages++
		if pages > n+2 {
			t.Fatalf("pagination did not terminate after %d pages walking a %d-record pile — cursor %q",
				pages, n, cursor)
		}
		page, next, err := dao.List(ctx, cid, pageSize, cursor)
		if err != nil {
			t.Fatalf("List(cursor=%q): %v", cursor, err)
		}
		if len(page) > pageSize {
			t.Fatalf("page %d returned %d records, want at most pageSize=%d", pages, len(page), pageSize)
		}
		for _, r := range page {
			seen[r.AsOf]++
		}
		if next == "" {
			break
		}
		cursor = next
	}

	if len(seen) != len(want) {
		t.Fatalf("continuation walk saw %d distinct records, want %d (whole pile). seen=%v want=%v",
			len(seen), len(want), seen, want)
	}
	for asOf, count := range seen {
		if !want[asOf] {
			t.Errorf("continuation walk returned an unexpected record asOf=%d", asOf)
		}
		if count != 1 {
			t.Errorf("record asOf=%d was returned %d times across pages, want exactly once", asOf, count)
		}
	}
	for asOf := range want {
		if seen[asOf] == 0 {
			t.Errorf("record asOf=%d was never returned across any page — skipped", asOf)
		}
	}
}
