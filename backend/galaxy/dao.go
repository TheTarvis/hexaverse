package galaxy

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"

	"cloud.google.com/go/firestore"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	// galaxiesCollection holds one metadata doc per seeded galaxy; systems,
	// lanes, and block anchors live in subcollections beneath each.
	galaxiesCollection = "galaxies"
	systemsSubcol      = "systems"
	lanesSubcol        = "lanes"
	// blocksSubcol holds one anchor per materialized block. The anchor IS the
	// materialization record: create-if-absent on it inside a transaction is
	// what makes a block materialize exactly once, whatever the concurrency.
	blocksSubcol = "blocks"

	// pointersCollection holds the single "live" galaxy pointer for the
	// environment, so a reseed can write a fresh id and flip the pointer
	// atomically rather than corrupting the old graph in place.
	pointersCollection = "galaxy_pointers"
	livePointerDoc     = "live"
)

//go:generate mockgen -destination=dao_mock.go -package=galaxy -source=dao.go Dao

// BlockMaterialization is one block's computed contents plus the blocks it can
// share a lane with — everything the materialization transaction needs, already
// derived from the pure field.
type BlockMaterialization struct {
	Block   Block
	Systems []System
	Lanes   []FieldLane
	// LaneSharingBlocks is every OTHER block that can share a lane with this
	// one: the eight neighbours (the ordinary-lane horizon) plus the far block
	// of each incident bridge (which skips empty blocks and so may lie beyond
	// them). Their anchors are read INSIDE the transaction, which is what makes
	// Firestore's OCC guarantee no cross-block lane is ever lost: of two
	// concurrently materializing lane-sharing blocks, one commits second, sees
	// the other's anchor, and writes the shared lanes.
	LaneSharingBlocks []Block
}

type Dao interface {
	// SaveGalaxyMeta writes the galaxy metadata doc (create or overwrite).
	SaveGalaxyMeta(ctx context.Context, g Galaxy) error
	GetGalaxyMeta(ctx context.Context, id string) (*Galaxy, error)
	ListSystems(ctx context.Context, galaxyID string) ([]System, error)
	GetSystem(ctx context.Context, galaxyID, systemID string) (*System, error)
	ListLanes(ctx context.Context, galaxyID string) ([]Lane, error)
	// ListLanesForSystem returns the lanes incident to one system — the
	// per-system read the scan seam uses instead of loading the whole
	// materialized graph.
	ListLanesForSystem(ctx context.Context, galaxyID, systemID string) ([]Lane, error)
	// ListLanesForSystems is the same read for a whole set at once. The spawn
	// walk expands a hop-RING at a time, so batching turns its dominant cost
	// (two queries per system) into two queries per thirty.
	ListLanesForSystems(ctx context.Context, galaxyID string, systemIDs []string) ([]Lane, error)
	// GetSystems point-reads a set of systems in one fan-out.
	GetSystems(ctx context.Context, galaxyID string, systemIDs []string) ([]System, error)
	// MaterializedBlocks reports which of the given blocks already have an
	// anchor. The cheap pre-check that lets a repeat ensure skip transactions
	// entirely.
	MaterializedBlocks(ctx context.Context, galaxyID string, blocks []Block) (map[Block]bool, error)
	// MaterializeBlock persists a block exactly once, keyed on its anchor.
	// Reports whether it created anything (false ⇒ the anchor already existed
	// and NOTHING was written or modified).
	MaterializeBlock(ctx context.Context, galaxyID string, m BlockMaterialization) (bool, error)
	// MergeExtent grows the galaxy doc's materialized bounds and block counter
	// monotonically, in its own small transaction. Deliberately NOT part of the
	// block transaction: the galaxy doc is a single document every
	// materialization would otherwise contend on.
	MergeExtent(ctx context.Context, galaxyID string, b Bounds, blocksAdded int) error
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

func blocksPath(galaxyID string) string {
	return fmt.Sprintf("%s/%s/%s", galaxiesCollection, galaxyID, blocksSubcol)
}

type livePointer struct {
	GalaxyID string `firestore:"galaxyId"`
}

// blockAnchor is the per-block materialization record. Its existence is the
// only signal that matters; the counts are for observability.
type blockAnchor struct {
	X       int `firestore:"x"`
	Y       int `firestore:"y"`
	Systems int `firestore:"systems"`
	Lanes   int `firestore:"lanes"`
}

func (dao *DaoImpl) SaveGalaxyMeta(ctx context.Context, g Galaxy) error {
	if g.Id == "" {
		return errors.New("galaxy has no id")
	}
	if err := dao.db.Set(ctx, galaxiesCollection, g.Id, g); err != nil {
		return fmt.Errorf("saving galaxy metadata: %w", err)
	}
	return nil
}

func (dao *DaoImpl) MaterializedBlocks(ctx context.Context, galaxyID string, blocks []Block) (map[Block]bool, error) {
	out := make(map[Block]bool, len(blocks))
	if len(blocks) == 0 {
		return out, nil
	}
	ids := make([]string, 0, len(blocks))
	for _, b := range blocks {
		ids = append(ids, BlockIdFor(b))
	}
	docs, err := dao.db.GetByIds(ctx, blocksPath(galaxyID), ids)
	if err != nil {
		return nil, err
	}
	for _, doc := range docs {
		if doc == nil || !doc.Exists() {
			continue
		}
		var a blockAnchor
		if err := doc.DataTo(&a); err != nil {
			return nil, err
		}
		out[Block{X: a.X, Y: a.Y}] = true
	}
	return out, nil
}

// MaterializeBlock writes a block's anchor, its systems, and every lane whose
// far endpoint's block is already materialized — atomically, exactly once.
//
// The lane rule is what makes cross-block lanes safe without a second pass: the
// FIRST of two lane-sharing blocks to commit sees no far anchor and skips the
// shared lane; the SECOND sees the first's anchor (read inside this
// transaction, so a concurrent commit forces a retry) and writes it. Lane ids
// come from the unordered endpoint pair, so writing from either side produces
// the same document.
func (dao *DaoImpl) MaterializeBlock(ctx context.Context, galaxyID string, m BlockMaterialization) (bool, error) {
	anchorRef := dao.db.Collection(blocksPath(galaxyID)).Doc(BlockIdFor(m.Block))
	neighborRefs := make([]*firestore.DocumentRef, 0, len(m.LaneSharingBlocks))
	for _, b := range m.LaneSharingBlocks {
		neighborRefs = append(neighborRefs, dao.db.Collection(blocksPath(galaxyID)).Doc(BlockIdFor(b)))
	}
	sysCol := dao.db.Collection(systemsPath(galaxyID))
	laneCol := dao.db.Collection(lanesPath(galaxyID))

	created := false
	err := dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		created = false // reset on retry

		// --- reads first (Firestore forbids a read after a write) ---
		if snap, err := tx.Get(anchorRef); err != nil {
			if status.Code(err) != codes.NotFound {
				return err
			}
		} else if snap != nil && snap.Exists() {
			return nil // already materialized — a strict no-op
		}

		materialized := map[Block]bool{m.Block: true}
		if len(neighborRefs) > 0 {
			snaps, err := tx.GetAll(neighborRefs)
			if err != nil {
				return fmt.Errorf("reading lane-sharing block anchors: %w", err)
			}
			for i, snap := range snaps {
				if snap != nil && snap.Exists() {
					materialized[m.LaneSharingBlocks[i]] = true
				}
			}
		}

		// --- writes ---
		for _, s := range m.Systems {
			if err := tx.Set(sysCol.Doc(s.Id), s); err != nil {
				return err
			}
		}
		wrote := 0
		for _, l := range m.Lanes {
			if !materialized[l.ABlock] || !materialized[l.BBlock] {
				continue // the far side isn't persisted yet — it writes this lane
			}
			if err := tx.Set(laneCol.Doc(l.Id), l.Lane); err != nil {
				return err
			}
			wrote++
		}
		if err := tx.Set(anchorRef, blockAnchor{
			X: m.Block.X, Y: m.Block.Y, Systems: len(m.Systems), Lanes: wrote,
		}); err != nil {
			return err
		}
		created = true
		return nil
	})
	if err != nil {
		return false, fmt.Errorf("materializing block %s: %w", BlockIdFor(m.Block), err)
	}
	if created {
		log.Debug().Ctx(ctx).Str("galaxyId", galaxyID).Str("block", BlockIdFor(m.Block)).
			Int("systems", len(m.Systems)).Msg("Materialized galaxy block")
	}
	return created, nil
}

func (dao *DaoImpl) MergeExtent(ctx context.Context, galaxyID string, b Bounds, blocksAdded int) error {
	ref := dao.db.Collection(galaxiesCollection).Doc(galaxyID)
	return dao.db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				return nil // the galaxy went away under us; nothing to grow
			}
			return err
		}
		var g Galaxy
		if err := snap.DataTo(&g); err != nil {
			return err
		}
		merged := g.Bounds.Union(b)
		count := g.BlockCount + blocksAdded
		if merged == g.Bounds && count == g.BlockCount {
			return nil // already contains it — a monotonic max never shrinks
		}
		return tx.Update(ref, []firestore.Update{
			{Path: "bounds", Value: merged},
			{Path: "blockCount", Value: count},
		})
	})
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

func (dao *DaoImpl) GetSystem(ctx context.Context, galaxyID, systemID string) (*System, error) {
	doc, err := dao.db.Get(ctx, systemsPath(galaxyID), systemID)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, err
	}
	if !doc.Exists() {
		return nil, nil
	}
	var s System
	if err := doc.DataTo(&s); err != nil {
		return nil, err
	}
	return &s, nil
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

func (dao *DaoImpl) ListLanesForSystem(ctx context.Context, galaxyID, systemID string) ([]Lane, error) {
	return dao.ListLanesForSystems(ctx, galaxyID, []string{systemID})
}

// maxInClauseValues is Firestore's ceiling on an `in` filter's value list.
const maxInClauseValues = 30

func (dao *DaoImpl) ListLanesForSystems(ctx context.Context, galaxyID string, systemIDs []string) ([]Lane, error) {
	col := dao.db.Collection(lanesPath(galaxyID))
	seen := map[string]bool{}
	var out []Lane
	for _, chunk := range chunkStrings(systemIDs, maxInClauseValues) {
		for _, field := range []string{"aId", "bId"} {
			iter := col.Where(field, "in", chunk).Documents(ctx)
			for {
				doc, err := iter.Next()
				if errors.Is(err, iterator.Done) {
					break
				}
				if err != nil {
					iter.Stop()
					return nil, err
				}
				var l Lane
				if err := doc.DataTo(&l); err != nil {
					iter.Stop()
					return nil, err
				}
				if seen[l.Id] {
					continue
				}
				seen[l.Id] = true
				out = append(out, l)
			}
			iter.Stop()
		}
	}
	return out, nil
}

func (dao *DaoImpl) GetSystems(ctx context.Context, galaxyID string, systemIDs []string) ([]System, error) {
	if len(systemIDs) == 0 {
		return nil, nil
	}
	docs, err := dao.db.GetByIds(ctx, systemsPath(galaxyID), systemIDs)
	if err != nil {
		return nil, err
	}
	out := make([]System, 0, len(docs))
	for _, doc := range docs {
		if doc == nil || !doc.Exists() {
			continue
		}
		var s System
		if err := doc.DataTo(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, nil
}

func chunkStrings(in []string, size int) [][]string {
	var out [][]string
	for i := 0; i < len(in); i += size {
		end := i + size
		if end > len(in) {
			end = len(in)
		}
		out = append(out, in[i:end])
	}
	return out
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

// SubcollectionPaths names every collection a materialized galaxy writes into,
// plus the per-system nesting the given system ids own. Test cleanup asks for
// this instead of spelling the paths out, because Firestore does not cascade a
// delete into subcollections and a domain that grows a new one (as the endless
// galaxy grew `blocks`) would otherwise leak state into the next test from
// every call site that had not been updated by hand.
func SubcollectionPaths(galaxyID string, systemIDs ...string) []string {
	out := []string{systemsPath(galaxyID), lanesPath(galaxyID), blocksPath(galaxyID)}
	for _, sid := range systemIDs {
		out = append(out,
			fmt.Sprintf("%s/%s/interior", systemsPath(galaxyID), sid),
			fmt.Sprintf("%s/%s/features", systemsPath(galaxyID), sid),
			fmt.Sprintf("%s/%s/station", systemsPath(galaxyID), sid),
		)
	}
	return out
}
