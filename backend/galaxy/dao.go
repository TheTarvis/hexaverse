package galaxy

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"

	"github.com/rs/zerolog/log"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	// galaxiesCollection holds one metadata doc per generated galaxy;
	// systems/lanes live in subcollections beneath each (build-order: leaning
	// subcollections, matching #0003's nesting).
	galaxiesCollection = "galaxies"
	systemsSubcol      = "systems"
	lanesSubcol        = "lanes"

	// pointersCollection holds the single "live" galaxy pointer for the
	// environment, so a regenerate can write a fresh id and flip the pointer
	// atomically rather than corrupting the old graph in place.
	pointersCollection = "galaxy_pointers"
	livePointerDoc     = "live"
)

//go:generate mockgen -destination=dao_mock.go -package=galaxy -source=dao.go Dao

type Dao interface {
	SaveGalaxy(ctx context.Context, g GeneratedGalaxy) error
	GetGalaxyMeta(ctx context.Context, id string) (*Galaxy, error)
	ListSystems(ctx context.Context, galaxyID string) ([]System, error)
	ListLanes(ctx context.Context, galaxyID string) ([]Lane, error)
	SetLivePointer(ctx context.Context, galaxyID string) error
	GetLivePointer(ctx context.Context) (string, error)
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

func systemsPath(galaxyID string) string {
	return fmt.Sprintf("%s/%s/%s", galaxiesCollection, galaxyID, systemsSubcol)
}

func lanesPath(galaxyID string) string {
	return fmt.Sprintf("%s/%s/%s", galaxiesCollection, galaxyID, lanesSubcol)
}

type livePointer struct {
	GalaxyID string `firestore:"galaxyId"`
}

// SaveGalaxy persists the metadata doc plus all system and lane subdocs. Uses
// batched writes (chunked internally at Firestore's limit).
func (dao *DaoImpl) SaveGalaxy(ctx context.Context, g GeneratedGalaxy) error {
	if g.Galaxy.Id == "" {
		return errors.New("galaxy has no id")
	}

	if err := dao.db.Set(ctx, galaxiesCollection, g.Galaxy.Id, g.Galaxy); err != nil {
		return fmt.Errorf("saving galaxy metadata: %w", err)
	}

	sysWrites := make([]common.BatchWrite, len(g.Systems))
	sysCol := systemsPath(g.Galaxy.Id)
	for i, s := range g.Systems {
		sysWrites[i] = common.BatchWrite{Collection: sysCol, DocID: s.Id, Data: s}
	}
	if err := dao.db.BatchSet(ctx, sysWrites); err != nil {
		return fmt.Errorf("saving systems: %w", err)
	}

	laneWrites := make([]common.BatchWrite, len(g.Lanes))
	laneCol := lanesPath(g.Galaxy.Id)
	for i, l := range g.Lanes {
		laneWrites[i] = common.BatchWrite{Collection: laneCol, DocID: l.Id, Data: l}
	}
	if err := dao.db.BatchSet(ctx, laneWrites); err != nil {
		return fmt.Errorf("saving lanes: %w", err)
	}

	log.Info().Ctx(ctx).
		Str("galaxyId", g.Galaxy.Id).
		Int("systems", len(g.Systems)).
		Int("lanes", len(g.Lanes)).
		Msg("Persisted galaxy")
	return nil
}

func (dao *DaoImpl) GetGalaxyMeta(ctx context.Context, id string) (*Galaxy, error) {
	doc, err := dao.db.Get(ctx, galaxiesCollection, id)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, err
	}
	if !doc.Exists() {
		return nil, nil
	}
	var g Galaxy
	if err := doc.DataTo(&g); err != nil {
		return nil, err
	}
	return &g, nil
}

func (dao *DaoImpl) ListSystems(ctx context.Context, galaxyID string) ([]System, error) {
	docs, err := dao.db.GetAll(ctx, systemsPath(galaxyID))
	if err != nil {
		return nil, err
	}
	systems := make([]System, 0, len(docs))
	for _, doc := range docs {
		var s System
		if err := doc.DataTo(&s); err != nil {
			return nil, err
		}
		systems = append(systems, s)
	}
	return systems, nil
}

func (dao *DaoImpl) ListLanes(ctx context.Context, galaxyID string) ([]Lane, error) {
	docs, err := dao.db.GetAll(ctx, lanesPath(galaxyID))
	if err != nil {
		return nil, err
	}
	lanes := make([]Lane, 0, len(docs))
	for _, doc := range docs {
		var l Lane
		if err := doc.DataTo(&l); err != nil {
			return nil, err
		}
		lanes = append(lanes, l)
	}
	return lanes, nil
}

func (dao *DaoImpl) SetLivePointer(ctx context.Context, galaxyID string) error {
	return dao.db.Set(ctx, pointersCollection, livePointerDoc, livePointer{GalaxyID: galaxyID})
}

func (dao *DaoImpl) GetLivePointer(ctx context.Context) (string, error) {
	doc, err := dao.db.Get(ctx, pointersCollection, livePointerDoc)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return "", nil
		}
		return "", err
	}
	if !doc.Exists() {
		return "", nil
	}
	var p livePointer
	if err := doc.DataTo(&p); err != nil {
		return "", err
	}
	return p.GalaxyID, nil
}
