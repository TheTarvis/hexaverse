package observation

import (
	"context"
	"errors"

	"hexaverse/board"
	"hexaverse/common"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	corporationsCollection = "corporations"
	observationsCollection = "observations"
	featuresCollection     = "features"
)

//go:generate mockgen -destination=dao_mock.go -package=observation -source=dao.go Dao

// Dao owns Firestore I/O for the per-Corporation observation store. Reads back
// the stored Remembered snapshots; the reveal writes for the scan verb go
// through the action resolve transaction (as ResolveResult.Writes), so the only
// writers here are the non-resolve reveal paths (arrival at M8, ambient) which
// need monotonic upserts.
type Dao interface {
	GetSystemObservation(ctx context.Context, cid, systemID string) (*SystemObservation, error)
	ListSystemObservations(ctx context.Context, cid string) ([]SystemObservation, error)
	ListFeatureObservations(ctx context.Context, cid, systemID string) ([]FeatureObservation, error)

	// UpsertSystemObservation writes the graph-tier observation, taking the max of
	// the stored and new tier in one transaction (monotonic — never lowers).
	UpsertSystemObservation(ctx context.Context, cid string, obs SystemObservation) error
	// UpsertFeatureObservation writes a board-tier observation keyed by featureId,
	// so repeat passes are idempotent overwrites.
	UpsertFeatureObservation(ctx context.Context, cid, systemID string, obs FeatureObservation) error
}

type DaoImpl struct {
	db common.FirestoreService
}

func NewDao() Dao { return &DaoImpl{db: common.NewFirestoreService()} }

func NewDaoWithClient(db common.FirestoreService) Dao { return &DaoImpl{db: db} }

// systemDoc is corporations/{cid}/observations/{sid}.
func (dao *DaoImpl) systemDoc(cid, systemID string) *firestore.DocumentRef {
	return dao.db.Collection(corporationsCollection).Doc(cid).
		Collection(observationsCollection).Doc(systemID)
}

// featureDoc is corporations/{cid}/observations/{sid}/features/{fid}.
func (dao *DaoImpl) featureDoc(cid, systemID, featureID string) *firestore.DocumentRef {
	return dao.systemDoc(cid, systemID).Collection(featuresCollection).Doc(featureID)
}

func (dao *DaoImpl) GetSystemObservation(ctx context.Context, cid, systemID string) (*SystemObservation, error) {
	snap, err := dao.systemDoc(cid, systemID).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, err
	}
	var o SystemObservation
	if err := snap.DataTo(&o); err != nil {
		return nil, err
	}
	return &o, nil
}

func (dao *DaoImpl) ListSystemObservations(ctx context.Context, cid string) ([]SystemObservation, error) {
	iter := dao.db.Collection(corporationsCollection).Doc(cid).
		Collection(observationsCollection).Documents(ctx)
	defer iter.Stop()

	var out []SystemObservation
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var o SystemObservation
		if err := doc.DataTo(&o); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, nil
}

func (dao *DaoImpl) ListFeatureObservations(ctx context.Context, cid, systemID string) ([]FeatureObservation, error) {
	iter := dao.systemDoc(cid, systemID).Collection(featuresCollection).Documents(ctx)
	defer iter.Stop()

	var out []FeatureObservation
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var o FeatureObservation
		if err := doc.DataTo(&o); err != nil {
			return nil, err
		}
		// A remembered body keeps orbiting from its remembered elements (#0006
		// Decision #9) — at the world's CURRENT pace, not the pace it wore when you
		// last looked at it. Period isn't stored; fill it from the live law.
		board.HydratePeriod(o.Elements)
		out = append(out, o)
	}
	return out, nil
}

func (dao *DaoImpl) UpsertSystemObservation(ctx context.Context, cid string, obs SystemObservation) error {
	ref := dao.systemDoc(cid, obs.SystemId)
	return dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		merged := obs
		if snap != nil && snap.Exists() {
			var cur SystemObservation
			if err := snap.DataTo(&cur); err != nil {
				return err
			}
			// Monotonic: keep the higher tier; only advance AsOf when the incoming
			// observation is at least as fresh a survey.
			merged.Tier = Max(cur.Tier, obs.Tier)
			if obs.AsOf < cur.AsOf {
				merged.AsOf = cur.AsOf
			}
			if obs.Snapshot == nil {
				merged.Snapshot = cur.Snapshot
			}
		}
		return tx.Set(ref, merged)
	})
}

func (dao *DaoImpl) UpsertFeatureObservation(ctx context.Context, cid, systemID string, obs FeatureObservation) error {
	_, err := dao.featureDoc(cid, systemID, obs.FeatureId).Set(ctx, obs)
	return err
}
