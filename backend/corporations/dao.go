package corporations

import (
	"context"
	"errors"

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
)

// ErrAccountHasCorp means the account already owns a living corporation — the
// pointer create-if-absent lost the race (or a stale caller retried). The service
// treats it as "return the existing corp" (idempotent spawn).
var ErrAccountHasCorp = errors.New("account already has a living corporation")

//go:generate mockgen -destination=dao_mock.go -package=corporations -source=dao.go Dao

// accountPointer is corpByAccount/{accountId} — a one-field doc pointing at the
// account's current living corp.
type accountPointer struct {
	CorpId string `firestore:"corpId"`
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
	// CreateWithPointer writes the corp doc AND the account pointer in ONE
	// transaction (the spawn anchor, spec decision #1). The pointer is
	// create-if-absent: if the account already has a living corp the whole
	// transaction aborts with ErrAccountHasCorp and nothing is written.
	CreateWithPointer(ctx context.Context, corp Corporation) error
	// SetDiedAt stamps the death time on a corp doc. No slice path calls it
	// (nothing destroys a fleet); it exists so the death invariant is enforceable.
	SetDiedAt(ctx context.Context, id string, at common.WorldMillis) error
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
	corpRef := dao.corpDoc(corp.Id)
	ptrRef := dao.pointerDoc(corp.AccountId)
	return dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		// Create-if-absent on the pointer is the uniqueness guard: a living corp
		// for this account means the whole spawn aborts, nothing written.
		snap, err := tx.Get(ptrRef)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if snap != nil && snap.Exists() {
			return ErrAccountHasCorp
		}
		if err := tx.Set(corpRef, corp); err != nil {
			return err
		}
		return tx.Set(ptrRef, accountPointer{CorpId: corp.Id})
	})
}

func (dao *DaoImpl) SetDiedAt(ctx context.Context, id string, at common.WorldMillis) error {
	return dao.db.Update(ctx, corporationsCollection, id, []firestore.Update{
		{Path: "diedAt", Value: int64(at)},
	})
}
