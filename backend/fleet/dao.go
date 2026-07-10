package fleet

import (
	"context"

	"hexaverse/common"

	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const firestoreCollection = "fleets"

//go:generate mockgen -destination=dao_mock.go -package=fleet -source=dao.go Dao

type Dao interface {
	Get(ctx context.Context, id string) (*Fleet, error)
	Save(ctx context.Context, f Fleet) error
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
