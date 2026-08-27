package corporations

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	// corporationsCollection holds the corp docs. It shares its name with the fog
	// store's root (observations nest under corporations/{cid}/observations) —
	// same key by design: the corp id IS the fog partition key (#0006/#0009).
	corporationsCollection = "corporations"
	// accountPointerCollection maps an account to its ONE living corp. A
	// create-if-absent write here is the uniqueness anchor + the O(1) lookup the
	// ActorCorp seam uses every request.
	accountPointerCollection = "corpByAccount"
	// spawnClaimsCollection reserves a home system, keyed by system id. The
	// reservation is the AUTHORITATIVE concurrency signal for site selection,
	// because a living corporation's explored set is written only after its
	// commit transaction — so a spawn losing the race would otherwise re-derive
	// the identical pick forever. Reservations are permanent and corp-owned: one
	// outlives its corporation's death.
	spawnClaimsCollection = "spawnClaims"
)

// ErrAccountHasCorp means the account already owns a living corporation — the
// pointer create-if-absent lost the race (or a stale caller retried). The service
// treats it as "return the existing corp" (idempotent spawn).
var ErrAccountHasCorp = errors.New("account already has a living corporation")

// ErrSiteReserved means a DIFFERENT account's spawn already reserved the picked
// home system. The service re-runs selection, which now sees the reservation.
var ErrSiteReserved = errors.New("spawn site already reserved")

//go:generate mockgen -destination=dao_mock.go -package=corporations -source=dao.go Dao

// accountPointer is corpByAccount/{accountId} — a one-field doc pointing at the
// account's current living corp.
type accountPointer struct {
	CorpId string `firestore:"corpId"`
}

// spawnClaim is spawnClaims/{systemId} — a permanent, corp-owned reservation on
// a home system. Only its EXISTENCE is load-bearing; the fields are provenance.
type spawnClaim struct {
	SystemId  string `firestore:"systemId"`
	CorpId    string `firestore:"corpId"`
	AccountId string `firestore:"accountId"`
	ClaimedAt int64  `firestore:"claimedAt"`
}

type Dao interface {
	Get(ctx context.Context, id string) (*Corporation, error)
	// ListLiving returns every corporation without a death stamp — the set the
	// unclaimed-distance test unions explored space across. Filtered in code (a
	// living corp omits diedAt, so an equality query can't match it).
	ListLiving(ctx context.Context) ([]Corporation, error)
	// CorpIdForAccount returns the account's living corp id, or "" if none. One
	// cheap pointer read — the request-path lookup behind common.ActorCorp.
	CorpIdForAccount(ctx context.Context, accountId string) (string, error)
	// CreateWithPointer writes the corp doc, the account pointer, AND the home
	// system's spawn reservation in ONE transaction (the spawn anchor, spec
	// decision #1). Both the pointer and the reservation are create-if-absent:
	// an account that already has a living corp aborts with ErrAccountHasCorp
	// (checked FIRST — a same-account race returns the winner, never re-picks),
	// and a home another account already reserved aborts with ErrSiteReserved.
	// Either way nothing is written.
	CreateWithPointer(ctx context.Context, corp Corporation) error
	// ListSpawnClaims returns the reserved home systems — criterion (c) of site
	// selection. One collection read per wake; wakes are rare.
	ListSpawnClaims(ctx context.Context) (map[string]bool, error)
	// SetDiedAt stamps the death time on a corp doc. No slice path calls it
	// (nothing destroys a fleet); it exists so the death invariant is enforceable.
	SetDiedAt(ctx context.Context, id string, at common.WorldMillis) error
	// SetAssetsCompleteAt stamps the spawn-assets-complete marker (#0011), the
	// short-circuit every later healing pass checks first.
	SetAssetsCompleteAt(ctx context.Context, id string, at common.WorldMillis) error
}

type DaoImpl struct {
	db common.FirestoreService
}

func NewDao() Dao {
	return &DaoImpl{db: common.NewFirestoreService()}
}

func NewDaoWithClient(db common.FirestoreService) Dao {
	return &DaoImpl{db: db}
}

func (dao *DaoImpl) corpDoc(id string) *firestore.DocumentRef {
	return dao.db.Collection(corporationsCollection).Doc(id)
}

func (dao *DaoImpl) pointerDoc(accountId string) *firestore.DocumentRef {
	return dao.db.Collection(accountPointerCollection).Doc(accountId)
}

func (dao *DaoImpl) Get(ctx context.Context, id string) (*Corporation, error) {
	snap, err := dao.corpDoc(id).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, err
	}
	var corp Corporation
	if err := snap.DataTo(&corp); err != nil {
		return nil, err
	}
	return &corp, nil
}

func (dao *DaoImpl) ListLiving(ctx context.Context) ([]Corporation, error) {
	iter := dao.db.Collection(corporationsCollection).Documents(ctx)
	defer iter.Stop()

	var out []Corporation
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var corp Corporation
		if err := doc.DataTo(&corp); err != nil {
			return nil, err
		}
		if corp.Living() {
			out = append(out, corp)
		}
	}
	return out, nil
}

func (dao *DaoImpl) CorpIdForAccount(ctx context.Context, accountId string) (string, error) {
	snap, err := dao.pointerDoc(accountId).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return "", nil
		}
		return "", err
	}
	var p accountPointer
	if err := snap.DataTo(&p); err != nil {
		return "", err
	}
	return p.CorpId, nil
}

func (dao *DaoImpl) CreateWithPointer(ctx context.Context, corp Corporation) error {
	if corp.HomeSystemId == "" {
		// The home of record and its reservation commit WITH the corp or not at
		// all; a corp doc without one would be unhealable and unreserved.
		return fmt.Errorf("%w: corporation %s has no home system to reserve", ErrNoSpawnSite, corp.Id)
	}
	corpRef := dao.corpDoc(corp.Id)
	ptrRef := dao.pointerDoc(corp.AccountId)
	claimRef := dao.db.Collection(spawnClaimsCollection).Doc(corp.HomeSystemId)
	return dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		// Create-if-absent on the pointer is the uniqueness guard, and it is
		// checked FIRST: a same-account race must return the winner's corp, not
		// burn a re-pick on reservation contention it never caused.
		snap, err := tx.Get(ptrRef)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if snap != nil && snap.Exists() {
			return ErrAccountHasCorp
		}
		// Create-if-absent on the home reservation: a different account got there
		// first, so this spawn re-picks against the now-visible claim.
		claimSnap, err := tx.Get(claimRef)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if claimSnap != nil && claimSnap.Exists() {
			return ErrSiteReserved
		}
		if err := tx.Set(corpRef, corp); err != nil {
			return err
		}
		if err := tx.Set(ptrRef, accountPointer{CorpId: corp.Id}); err != nil {
			return err
		}
		return tx.Set(claimRef, spawnClaim{
			SystemId: corp.HomeSystemId, CorpId: corp.Id, AccountId: corp.AccountId,
			ClaimedAt: int64(corp.CreatedAt),
		})
	})
}

func (dao *DaoImpl) ListSpawnClaims(ctx context.Context) (map[string]bool, error) {
	iter := dao.db.Collection(spawnClaimsCollection).Documents(ctx)
	defer iter.Stop()

	out := map[string]bool{}
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		out[doc.Ref.ID] = true
	}
	return out, nil
}

func (dao *DaoImpl) SetDiedAt(ctx context.Context, id string, at common.WorldMillis) error {
	return dao.db.Update(ctx, corporationsCollection, id, []firestore.Update{
		{Path: "diedAt", Value: int64(at)},
	})
}

func (dao *DaoImpl) SetAssetsCompleteAt(ctx context.Context, id string, at common.WorldMillis) error {
	return dao.db.Update(ctx, corporationsCollection, id, []firestore.Update{
		{Path: "assetsCompleteAt", Value: int64(at)},
	})
}
