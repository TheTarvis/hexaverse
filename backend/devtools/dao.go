package devtools

import (
	"cloud.google.com/go/firestore"
	"context"
	"errors"
	"google.golang.org/api/iterator"
)

// The local reset owns this deliberately cross-domain maintenance operation.
// It preserves account documents and never touches the Auth emulator.
type Dao struct{ client *firestore.Client }

func NewDao(client *firestore.Client) *Dao { return &Dao{client} }
func (d *Dao) FleetIDs(ctx context.Context) ([]string, error) {
	docs, err := d.client.Collection("fleets").DocumentRefs(ctx).GetAll()
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(docs))
	for _, doc := range docs {
		ids = append(ids, doc.ID)
	}
	return ids, nil
}
func (d *Dao) ClearGameplay(ctx context.Context) error {
	cols, err := d.client.Collections(ctx).GetAll()
	if err != nil {
		return err
	}
	for _, col := range cols {
		if col.ID != "accounts" {
			if err = clearCollection(ctx, col); err != nil {
				return err
			}
		}
	}
	return nil
}
func clearCollection(ctx context.Context, col *firestore.CollectionRef) error {
	// DocumentRefs includes missing parent documents with surviving subcollections.
	it := col.DocumentRefs(ctx)

	for {
		doc, err := it.Next()
		if errors.Is(err, iterator.Done) {
			return nil
		}
		if err != nil {
			return err
		}
		children, err := doc.Collections(ctx).GetAll()
		if err != nil {
			return err
		}
		for _, child := range children {
			if err = clearCollection(ctx, child); err != nil {
				return err
			}
		}
		if _, err = doc.Delete(ctx); err != nil {
			return err
		}
	}
}
