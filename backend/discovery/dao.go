package discovery

import (
	"context"
	"encoding/base64"
	"fmt"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const Collection = "discovery_records"
const NamesCollection = "astronomical_names"

func Key(galaxyID, systemID, bodyID string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(galaxyID + "\x00" + systemID + "\x00" + bodyID))
}

type Dao interface {
	Records(context.Context, string) ([]Record, error)
	HomeInTx(context.Context, *firestore.Transaction, string, string, string, string, common.WorldMillis) error
	Home(context.Context, string, string, string, string, common.WorldMillis) error
	Name(context.Context, Target, string, string, common.WorldMillis) (*Record, error)
}

type DaoImpl struct{ db common.FirestoreService }

func NewDao() Dao                                     { return &DaoImpl{common.NewFirestoreService()} }
func NewDaoWithClient(db common.FirestoreService) Dao { return &DaoImpl{db} }

func (d *DaoImpl) Records(ctx context.Context, galaxyID string) ([]Record, error) {
	it := d.db.Collection(Collection).Where("galaxyId", "==", galaxyID).Documents(ctx)
	defer it.Stop()
	out := []Record{}
	for {
		snap, err := it.Next()
		if err == iterator.Done {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		var r Record
		if err := snap.DataTo(&r); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
}

func (d *DaoImpl) Home(ctx context.Context, gid, sid, cid, name string, at common.WorldMillis) error {
	return d.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		return d.HomeInTx(ctx, tx, gid, sid, cid, name, at)
	})
}

func (d *DaoImpl) HomeInTx(ctx context.Context, tx *firestore.Transaction, gid, sid, cid, name string, at common.WorldMillis) error {
	star := d.db.Collection(Collection).Doc(Key(gid, sid, "feat-star"))
	station := d.db.Collection(Collection).Doc(Key(gid, sid, "feat-station"))
	snaps, err := tx.GetAll([]*firestore.DocumentRef{star, station})
	if err != nil {
		return err
	}
	for i, snap := range snaps {
		r := Record{GalaxyId: gid, SystemId: sid, BodyId: []string{"feat-star", "feat-station"}[i]}
		if snap.Exists() {
			if err := snap.DataTo(&r); err != nil {
				return err
			}
		}
		if r.OwnerCorpId != "" && r.OwnerCorpId != cid {
			return ErrConflict
		}
		if r.OwnerCorpId != "" {
			continue
		}
		r.OwnerCorpId = cid
		if i == 0 {
			if r.FirstArrival == nil {
				r.FirstArrival = &Attribution{cid, at}
			}
		} else {
			r.Name = name + " Station"
		}
		if err := tx.Set([]*firestore.DocumentRef{star, station}[i], r); err != nil {
			return err
		}
	}
	return nil
}

func (d *DaoImpl) Name(ctx context.Context, target Target, cid, name string, at common.WorldMillis) (*Record, error) {
	var out *Record
	err := d.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		out = nil
		ref := d.db.Collection(Collection).Doc(Key(target.GalaxyId, target.SystemId, target.BodyId))
		snap, err := tx.Get(ref)
		if status.Code(err) == codes.NotFound {
			return ErrForbidden
		}
		if err != nil {
			return err
		}
		var r Record
		if err := snap.DataTo(&r); err != nil {
			return err
		}
		if r.EntitledCorpId != cid || r.OwnerCorpId != cid || target.Protected {
			return ErrForbidden
		}
		if r.FirstPlayerName != nil {
			if r.Name == name {
				out = &r
				return nil
			}
			return ErrLocked
		}

		reservations := []*firestore.DocumentRef{d.db.Collection(NamesCollection).Doc(Key(target.GalaxyId, target.SystemId, Canonical(name)))}
		if target.Kind == "star" {
			reservations = append(reservations, d.db.Collection(NamesCollection).Doc(Key(target.GalaxyId, "", Canonical(name))))
		}
		reserved, err := tx.GetAll(reservations)
		if err != nil {
			return err
		}
		for _, snap := range reserved {
			if snap.Exists() {
				return ErrConflict
			}
		}

		r.Name = name
		r.GeneratedName = target.GeneratedName
		r.FirstPlayerName = &PlayerName{cid, at, name}

		for _, reservation := range reservations {
			if err := tx.Create(reservation, map[string]any{"target": ref.ID, "galaxyId": target.GalaxyId}); err != nil {
				return fmt.Errorf("reserving astronomical name: %w", err)
			}
		}

		if err := tx.Set(ref, r); err != nil {
			return err
		}
		out = &r
		return nil
	})
	return out, err
}
