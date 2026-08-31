package fleet

import (
	"context"
	"errors"

	"hexaverse/common"
	"hexaverse/space"

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
	if err := hydrateState(ctx, &f, id); err != nil {
		return nil, err
	}
	return &f, nil
}

// permissiveBodies is the space.Bodies stand-in the real Firestore decode
// boundary validates a stored kinematic-state document against (tasks.md
// 3.6). It always reports a body id as known: a real body-existence
// cross-check needs the request-scoped BodySource (design.md Decision 16),
// which the DAO layer never holds (it is wired at the Service, resolved once
// per request) — so the DAO boundary validates coordinate SHAPE (finite,
// in-extent, well-formed) and defers the "does this body actually exist"
// cross-check to whichever caller has a real body table (the burn/resolve
// paths already resolve one; see service.go's bodiesFor). This is a
// deliberate, narrower guarantee than DecodeKinematicState's full four-cause
// contract, not a silent gap: a genuinely corrupt body id on a stored park
// still fails downstream, the first time a real Bodies is asked to resolve
// it, rather than on every routine read.
type permissiveBodies struct{}

func (permissiveBodies) Body(id string) (space.Body, bool) { return space.Body{Id: id}, true }

// hydrateState decodes a raw-read fleet's persisted kinematic state
// (StateDoc, populated by doc.DataTo above) into its domain form (State) —
// the fleet-document boundary DecodeKinematicState's own contract names
// (tasks.md 3.6). A fleet document with no stored kinematic state at all is
// rejected by name, never defaulted to an implied origin park.
func hydrateState(_ context.Context, f *Fleet, id string) error {
	state, err := DecodeKinematicState(permissiveBodies{}, f.StateDoc, "", "")
	if err != nil {
		log.Warn().Str("fleetId", id).Err(err).Msg("Fleet document's stored kinematic state failed to decode")
		return err
	}
	f.State = state
	return nil
}

func (dao *DaoImpl) Save(ctx context.Context, f Fleet) error {
	f.StateDoc = EncodeKinematicState(f.State)
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
		if err := hydrateState(ctx, &f, f.Id); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, nil
}
