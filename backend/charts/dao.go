package charts

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
	corporationsCollection = "corporations"
	chartsCollection       = "charts"
	chartedLanesCollection = "chartedLanes"
)

//go:generate mockgen -destination=dao_mock.go -package=charts -source=dao.go Dao

// Dao owns Firestore I/O for the per-corporation graph-knowledge store.
type Dao interface {
	GetSystemKnowledge(ctx context.Context, cid, systemID string) (*SystemKnowledge, error)
	ListSystemKnowledge(ctx context.Context, cid string) ([]SystemKnowledge, error)
	// UpsertSystemKnowledge writes the graph-tier knowledge, taking the max of
	// the stored and new tier in one transaction (monotonic — never lowers).
	UpsertSystemKnowledge(ctx context.Context, cid string, k SystemKnowledge) error

	// UpsertChartedLane charts a lane for the corp — keyed by laneId, so
	// recharting is an idempotent overwrite (presence of the doc IS "charted").
	UpsertChartedLane(ctx context.Context, cid string, lane ChartedLane) error
	// ListChartedLanes returns every lane the corp has charted.
	ListChartedLanes(ctx context.Context, cid string) ([]ChartedLane, error)
}

type DaoImpl struct {
	db common.FirestoreService
}

func NewDao() Dao { return &DaoImpl{db: common.NewFirestoreService()} }

func NewDaoWithClient(db common.FirestoreService) Dao { return &DaoImpl{db: db} }

// systemDoc is corporations/{cid}/charts/{sid}.
func (dao *DaoImpl) systemDoc(cid, systemID string) *firestore.DocumentRef {
	return dao.db.Collection(corporationsCollection).Doc(cid).
		Collection(chartsCollection).Doc(systemID)
}

func (dao *DaoImpl) GetSystemKnowledge(ctx context.Context, cid, systemID string) (*SystemKnowledge, error) {
	snap, err := dao.systemDoc(cid, systemID).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, err
	}
	var k SystemKnowledge
	if err := snap.DataTo(&k); err != nil {
		return nil, err
	}
	return &k, nil
}

func (dao *DaoImpl) ListSystemKnowledge(ctx context.Context, cid string) ([]SystemKnowledge, error) {
	iter := dao.db.Collection(corporationsCollection).Doc(cid).
		Collection(chartsCollection).Documents(ctx)
	defer iter.Stop()

	var out []SystemKnowledge
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var k SystemKnowledge
		if err := doc.DataTo(&k); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, nil
}

func (dao *DaoImpl) UpsertSystemKnowledge(ctx context.Context, cid string, k SystemKnowledge) error {
	ref := dao.systemDoc(cid, k.SystemId)
	return dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		merged := k
		if snap != nil && snap.Exists() {
			var cur SystemKnowledge
			if err := snap.DataTo(&cur); err != nil {
				return err
			}
			// Monotonic: keep the higher tier; only advance AsOf when the
			// incoming write is at least as fresh as what's stored.
			merged.Tier = Max(cur.Tier, k.Tier)
			if k.AsOf < cur.AsOf {
				merged.AsOf = cur.AsOf
			}
		}
		return tx.Set(ref, merged)
	})
}

// laneDoc is corporations/{cid}/chartedLanes/{laneId}.
func (dao *DaoImpl) laneDoc(cid, laneID string) *firestore.DocumentRef {
	return dao.db.Collection(corporationsCollection).Doc(cid).
		Collection(chartedLanesCollection).Doc(laneID)
}

func (dao *DaoImpl) UpsertChartedLane(ctx context.Context, cid string, lane ChartedLane) error {
	_, err := dao.laneDoc(cid, lane.LaneId).Set(ctx, lane)
	return err
}

func (dao *DaoImpl) ListChartedLanes(ctx context.Context, cid string) ([]ChartedLane, error) {
	iter := dao.db.Collection(corporationsCollection).Doc(cid).
		Collection(chartedLanesCollection).Documents(ctx)
	defer iter.Stop()

	var out []ChartedLane
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		var l ChartedLane
		if err := doc.DataTo(&l); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, nil
}

// SubcollectionPaths names every collection this package writes into for one
// corporation — corporations/{cid}/charts and corporations/{cid}/chartedLanes
// — so test cleanup can ask for them instead of spelling the paths out
// (mirrors galaxy.SubcollectionPaths; Firestore does not cascade a delete
// into subcollections, so a caller cleaning up the parent corp doc must name
// every nested collection explicitly or leak state into the next test).
func SubcollectionPaths(corpID string) []string {
	return []string{
		fmt.Sprintf("%s/%s/%s", corporationsCollection, corpID, chartsCollection),
		fmt.Sprintf("%s/%s/%s", corporationsCollection, corpID, chartedLanesCollection),
	}
}
