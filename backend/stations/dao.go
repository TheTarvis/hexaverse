package stations

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	// The station nests under the galaxy's system node, in its OWN subcollection
	// — distinct from interior/ and features/, which system.CreateInterior's
	// atomic claim owns and never shares:
	//   galaxies/{gid}/systems/{sid}/station/meta
	galaxiesCollection = "galaxies"
	systemsSubcol      = "systems"
	stationSubcol      = "station"
	stationDoc         = "meta"
)

// ErrAlreadyExists signals the create-if-absent claim lost the race — another
// caller provisioned this system's station first. The service treats it as
// success (that is what idempotent provisioning means), never as a failure.
var ErrAlreadyExists = errors.New("station already exists")

// ErrNotFound means no station exists for that system.
var ErrNotFound = errors.New("station not found")

type Dao interface {
	Get(ctx context.Context, galaxyID, systemID string) (*Station, error)
	// Create claims the station with a create-if-absent write, mirroring
	// system.dao's CreateInterior claim discipline. Returns ErrAlreadyExists if
	// another caller won.
	Create(ctx context.Context, galaxyID string, st Station) error
	// Ref exposes the station document for transaction-scoped composition (a
	// sale's request decrement rides the caller's transaction).
	Ref(galaxyID, systemID string) *firestore.DocumentRef
	// RunTransaction opens a transaction on the same client the station store
	// uses, so a sale can compose station writes with other domains' writes.
	RunTransaction(ctx context.Context, f func(context.Context, *firestore.Transaction) error) error
}

type DaoImpl struct {
	db common.FirestoreService
}

func NewDao() Dao { return &DaoImpl{db: common.NewFirestoreService()} }

func NewDaoWithClient(db common.FirestoreService) Dao { return &DaoImpl{db: db} }

func (dao *DaoImpl) Ref(galaxyID, systemID string) *firestore.DocumentRef {
	return dao.db.Collection(galaxiesCollection).Doc(galaxyID).
		Collection(systemsSubcol).Doc(systemID).
		Collection(stationSubcol).Doc(stationDoc)
}

func (dao *DaoImpl) RunTransaction(ctx context.Context, f func(context.Context, *firestore.Transaction) error) error {
	return dao.db.RunTransaction(ctx, f)
}

func (dao *DaoImpl) Get(ctx context.Context, galaxyID, systemID string) (*Station, error) {
	snap, err := dao.Ref(galaxyID, systemID).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("reading station: %w", err)
	}
	var st Station
	if err := snap.DataTo(&st); err != nil {
		return nil, fmt.Errorf("decoding station: %w", err)
	}
	return &st, nil
}

func (dao *DaoImpl) Create(ctx context.Context, galaxyID string, st Station) error {
	_, err := dao.Ref(galaxyID, st.SystemId).Create(ctx, st)
	if err != nil {
		if status.Code(err) == codes.AlreadyExists {
			return ErrAlreadyExists
		}
		return fmt.Errorf("creating station: %w", err)
	}
	return nil
}
