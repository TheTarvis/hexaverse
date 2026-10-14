package system

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"
	"hexaverse/space"

	"cloud.google.com/go/firestore"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	// The interior nests under the galaxy's system node:
	//   galaxies/{gid}/systems/{sid}/interior/meta   — the metadata doc
	//   galaxies/{gid}/systems/{sid}/features/{fid}   — the feature subcollection
	interiorSubcol = "interior"
	interiorDoc    = "meta"
	featuresSubcol = "features"
)

// ErrAlreadyExists signals the create-if-absent claim lost the race (another
// resolver materialized the interior first).
var ErrAlreadyExists = errors.New("interior already exists")

//go:generate mockgen -destination=dao_mock.go -package=system -source=dao.go Dao

type Dao interface {
	GetInterior(ctx context.Context, galaxyID, systemID string) (*SystemInterior, error)
	ListFeatures(ctx context.Context, galaxyID, systemID string) ([]Feature, error)
	// CreateInterior claims the interior with a create-if-absent write on the
	// meta doc (the race guard), then writes the features. Returns
	// ErrAlreadyExists if another resolver already claimed it.
	CreateInterior(ctx context.Context, galaxyID string, gen GeneratedInterior) error
}

type DaoImpl struct {
	db common.FirestoreService
}

func NewDao() Dao { return &DaoImpl{db: common.NewFirestoreService()} }

func NewDaoWithClient(db common.FirestoreService) Dao { return &DaoImpl{db: db} }

func interiorPath(galaxyID, systemID string) string {
	return fmt.Sprintf("galaxies/%s/systems/%s/%s", galaxyID, systemID, interiorSubcol)
}

func featuresPath(galaxyID, systemID string) string {
	return fmt.Sprintf("galaxies/%s/systems/%s/%s", galaxyID, systemID, featuresSubcol)
}

func (dao *DaoImpl) GetInterior(ctx context.Context, galaxyID, systemID string) (*SystemInterior, error) {
	doc, err := dao.db.Get(ctx, interiorPath(galaxyID, systemID), interiorDoc)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, err
	}
	if !doc.Exists() {
		return nil, nil
	}
	var si SystemInterior
	if err := doc.DataTo(&si); err != nil {
		return nil, err
	}
	return &si, nil
}

func (dao *DaoImpl) ListFeatures(ctx context.Context, galaxyID, systemID string) ([]Feature, error) {
	docs, err := dao.db.GetAll(ctx, featuresPath(galaxyID, systemID))
	if err != nil {
		return nil, err
	}
	features := make([]Feature, 0, len(docs))
	for _, doc := range docs {
		var f Feature
		if err := doc.DataTo(&f); err != nil {
			return nil, err
		}
		// A body's period is no longer refilled from live tuning here: it is
		// its own Keplerian element, drawn from its continuous radius at
		// generation time and persisted with the rest of the element set
		// (SpaceDoc, decoded by readInterior). There is no global orbital law
		// left to re-pace an already-materialized system with.
		features = append(features, f)
	}
	return features, nil
}

func (dao *DaoImpl) CreateInterior(ctx context.Context, galaxyID string, gen GeneratedInterior) error {
	sid := gen.Interior.SystemId

	// Claim metadata and create features atomically. A concurrent materializer
	// must never overwrite names or other state written after the first create.
	err := dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		ref := dao.db.Collection(interiorPath(galaxyID, sid)).Doc(interiorDoc)
		if _, err := tx.Get(ref); err == nil {
			return ErrAlreadyExists
		} else if status.Code(err) != codes.NotFound {
			return err
		}
		for _, f := range gen.Features {
			if f.Space != nil {
				f.SpaceDoc = space.EncodeOrbit(*f.Space)
			}
			if err := tx.Create(dao.db.Collection(featuresPath(galaxyID, sid)).Doc(f.Id), f); err != nil {
				return err
			}
		}
		return tx.Create(ref, gen.Interior)
	})
	if err != nil {
		return err
	}

	log.Info().Ctx(ctx).Str("galaxyId", galaxyID).Str("systemId", sid).
		Int("features", len(gen.Features)).Msg("Materialized system interior")
	return nil
}
