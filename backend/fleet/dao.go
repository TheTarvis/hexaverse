package fleet

import (
	"context"
	"errors"

	"hexaverse/common"

	"github.com/rs/zerolog/log"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const firestoreCollection = "fleets"

//go:generate mockgen -destination=dao_mock.go -package=fleet -source=dao.go Dao

type Dao interface {
	Get(ctx context.Context, id string) (*Fleet, error)
	Save(ctx context.Context, f Fleet) error
	// ListByCorporation returns every fleet owned by a corporation — the input to
	// the fog domain's live sensor-union (coverage) computation.
	ListByCorporation(ctx context.Context, corporationID string) ([]Fleet, error)
	// ListBySystem returns every fleet currently in a system — the input to the
	// board's fleet layer (the requester's own units + audience-fogged foreigns).
	ListBySystem(ctx context.Context, systemID string) ([]Fleet, error)
}

type DaoImpl struct {
	db common.FirestoreService
}

func NewDao() Dao { return &DaoImpl{db: common.NewFirestoreService()} }

func NewDaoWithClient(db common.FirestoreService) Dao { return &DaoImpl{db: db} }

func (dao *DaoImpl) Get(ctx context.Context, id string) (*Fleet, error) {
	doc, err := dao.db.Get(ctx, firestoreCollection, id)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		log.Error().Ctx(ctx).Err(err).Str("id", id).Msg("Unable to fetch fleet")
		return nil, err
	}
	if !doc.Exists() {
		return nil, nil
	}
	var f Fleet
	if err := doc.DataTo(&f); err != nil {
		return nil, err
	}
	return &f, nil
}

func (dao *DaoImpl) Save(ctx context.Context, f Fleet) error {
	return dao.db.Set(ctx, firestoreCollection, f.Id, f)
}

func (dao *DaoImpl) ListByCorporation(ctx context.Context, corporationID string) ([]Fleet, error) {
	return dao.listWhere(ctx, "corporationId", corporationID)
}

func (dao *DaoImpl) ListBySystem(ctx context.Context, systemID string) ([]Fleet, error) {
	return dao.listWhere(ctx, "systemId", systemID)
}

func (dao *DaoImpl) listWhere(ctx context.Context, field, value string) ([]Fleet, error) {
	iter := dao.db.Collection(firestoreCollection).
		Where(field, "==", value).Documents(ctx)
	defer iter.Stop()

	var out []Fleet
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var f Fleet
		if err := doc.DataTo(&f); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, nil
}
