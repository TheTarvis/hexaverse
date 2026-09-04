package system

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"
	"hexaverse/space"

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

	// Features are written BEFORE the meta doc's create-if-absent claim —
	// deliberately reordered from a write-meta-then-features shape, which
	// left a window where a concurrent loser's ErrAlreadyExists sent it
	// straight into a read that could observe the meta doc already claimed
	// but the winner's feature batch not yet landed (a system with a star
	// feature at generation but zero features on that read). Writing
	// features first makes every RACER write the identical
	// (deterministically-generated) batch redundantly — harmless, since
	// every write is an idempotent overwrite by the same doc ids — so that
	// by the time ANY caller observes the meta doc existing, this system's
	// full feature set is unconditionally already there. This is what makes
	// two concurrent first-builds converge on one persisted interior with
	// both readers resolving the same bodies.
	writes := make([]common.BatchWrite, len(gen.Features))
	col := featuresPath(galaxyID, sid)
	for i, f := range gen.Features {
		// Space is `firestore:"-"` (in-memory only); SpaceDoc is the
		// persisted, storage-native form the codec produces (design.md
		// Decision 12). Every non-star feature this generator emits carries
		// a Space, so this is the one place it crosses the persistence
		// boundary on write.
		if f.Space != nil {
			f.SpaceDoc = space.EncodeOrbit(*f.Space)
		}
		writes[i] = common.BatchWrite{Collection: col, DocID: f.Id, Data: f}
	}
	if err := dao.db.BatchSet(ctx, writes); err != nil {
		return fmt.Errorf("writing features: %w", err)
	}

	// Create fails if the meta doc already exists — this is the atomic claim
	// that makes concurrent first-explores idempotent (deterministic generation
	// means the loser's would-be output is identical anyway).
	err := dao.db.Create(ctx, interiorPath(galaxyID, sid), interiorDoc, gen.Interior)
	if err != nil {
		if status.Code(err) == codes.AlreadyExists {
			return ErrAlreadyExists
		}
		return fmt.Errorf("claiming interior: %w", err)
	}

	log.Info().Ctx(ctx).Str("galaxyId", galaxyID).Str("systemId", sid).
		Int("features", len(gen.Features)).Msg("Materialized system interior")
	return nil
}
