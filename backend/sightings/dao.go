package sightings

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	corporationsCollection = "corporations"
	sightingsCollection    = "sightings"
)

//go:generate mockgen -destination=dao_mock.go -package=sightings -source=dao.go Dao

// Dao owns Firestore I/O for the per-corporation sighting pile, stored at
// corporations/{cid}/sightings/{id}. There is deliberately no Create/Set/
// Update/Delete method here — MintWrites is the package's sole minting
// mechanism (design.md Decision 17; sighting-records "There Is No Update or
// Delete Path", "The mint is never a separate write after the transaction").
type Dao interface {
	// Get returns the sighting at id, or (nil, nil) if it does not exist.
	Get(ctx context.Context, cid, id string) (*Sighting, error)
	// List returns a page of cid's sighting pile ordered by AsOf descending
	// (newest pulse-reach first), bounded to limit records. cursor is opaque:
	// pass "" for the first page, and the returned nextCursor (empty once the
	// pile is exhausted) for the next. systemId is variadic so every
	// pre-existing 4-argument call site keeps compiling unchanged; only its
	// first element is consulted, and a non-empty one restricts the page to
	// records whose SystemId matches — composed with the same ordering,
	// bound, and cursor shape as the unfiltered read (sighting-records "The
	// Pile Read Filters To One System On Request").
	List(ctx context.Context, cid string, limit int, cursor string, systemId ...string) ([]Sighting, string, error)
}

type DaoImpl struct {
	db common.FirestoreService
}

func NewDao() Dao { return &DaoImpl{db: common.NewFirestoreService()} }

func NewDaoWithClient(db common.FirestoreService) Dao { return &DaoImpl{db: db} }

// collection is corporations/{cid}/sightings.
func (dao *DaoImpl) collection(cid string) *firestore.CollectionRef {
	return dao.db.Collection(corporationsCollection).Doc(cid).Collection(sightingsCollection)
}

func (dao *DaoImpl) Get(ctx context.Context, cid, id string) (*Sighting, error) {
	snap, err := dao.collection(cid).Doc(id).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, err
	}
	var s Sighting
	if err := snap.DataTo(&s); err != nil {
		return nil, err
	}
	s.Id = snap.Ref.ID
	return &s, nil
}

func (dao *DaoImpl) List(ctx context.Context, cid string, limit int, cursor string, systemId ...string) ([]Sighting, string, error) {
	if limit <= 0 {
		limit = PageMax
	}

	q := dao.collection(cid).Query
	if len(systemId) > 0 && systemId[0] != "" {
		q = q.Where("systemId", "==", systemId[0])
	}
	q = q.
		OrderBy("asOf", firestore.Desc).
		OrderBy(firestore.DocumentID, firestore.Desc).
		Limit(limit + 1) // fetch one extra to detect whether a further page exists

	if cursor != "" {
		asOf, docID, err := decodeCursor(cursor)
		if err != nil {
			return nil, "", fmt.Errorf("decoding sighting pile cursor: %w", err)
		}
		q = q.StartAfter(asOf, docID)
	}

	iter := q.Documents(ctx)
	defer iter.Stop()

	var docs []*firestore.DocumentSnapshot
	for {
		doc, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, "", err
		}
		docs = append(docs, doc)
	}

	hasMore := len(docs) > limit
	if hasMore {
		docs = docs[:limit]
	}

	out := make([]Sighting, 0, len(docs))
	for _, doc := range docs {
		var s Sighting
		if err := doc.DataTo(&s); err != nil {
			return nil, "", err
		}
		s.Id = doc.Ref.ID
		out = append(out, s)
	}

	nextCursor := ""
	if hasMore && len(docs) > 0 {
		last := docs[len(docs)-1]
		nextCursor = encodeCursor(out[len(out)-1].AsOf, last.Ref.ID)
	}
	return out, nextCursor, nil
}

// encodeCursor/decodeCursor give the pile's continuation an opaque wire shape
// (a compound sort key over (AsOf, document id), the same pair the query
// itself orders and pages by). The format is deliberately unpinned by any
// spec scenario (tasks.md 7.7 item 2) — callers must treat it as opaque and
// round-trip it verbatim.
func encodeCursor(asOf common.WorldMillis, docID string) string {
	return strconv.FormatInt(int64(asOf), 10) + "|" + docID
}

func decodeCursor(cursor string) (int64, string, error) {
	parts := strings.SplitN(cursor, "|", 2)
	if len(parts) != 2 {
		return 0, "", fmt.Errorf("malformed cursor %q", cursor)
	}
	asOf, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, "", fmt.Errorf("malformed cursor asOf %q: %w", parts[0], err)
	}
	return asOf, parts[1], nil
}
