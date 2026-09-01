package sightings

import "hexaverse/action"

// MintWrites is the package's ONLY minting mechanism — there is deliberately
// no Dao.Create/Set method for a sighting record (sighting-records "The mint
// is never a separate write after the transaction"). It builds one
// action.DocWrite per record at a deterministic document path derived solely
// from the resolving action's id and the record's target id
// (design.md Decision 13):
//
//	corporations/{cid}/sightings/{actionId}_{targetId}   (composition record)
//	corporations/{cid}/sightings/{actionId}_clean        (clean-sweep record)
//
// so that the caller's resolve transaction (task 5.8's ScanResolver, in
// backend/fleet — this package is never the caller of its own mint) applies
// the returned writes via the same tx.Set(..., firestore.MergeAll) primitive
// action/dao.go's ResolveOne already uses for every other resolver's writes:
// a retried resolve converges on the same document instead of duplicating.
//
// MintWrites never stamps or overrides AsOf, and never reads a wall or world
// clock — every field is stored verbatim from the caller-supplied record
// (design.md Decision 14: AsOf is pulse-reach, computed by the resolver, not
// resolution time).
func MintWrites(cid, actionId string, records []Sighting) []action.DocWrite {
	writes := make([]action.DocWrite, 0, len(records))
	for _, rec := range records {
		docID := actionId + "_clean"
		if !rec.CleanSweep {
			docID = actionId + "_" + rec.TargetId
		}

		data := map[string]interface{}{
			"corporationId": cid,
			"actionId":      actionId,
			"systemId":      rec.SystemId,
			"asOf":          int64(rec.AsOf),
			"hostId":        rec.HostId,
			"cleanSweep":    rec.CleanSweep,
		}
		if !rec.CleanSweep {
			data["targetId"] = rec.TargetId
			data["position"] = map[string]interface{}{"x": rec.Position.X, "y": rec.Position.Y, "z": rec.Position.Z}
			data["velocity"] = map[string]interface{}{"x": rec.Velocity.X, "y": rec.Velocity.Y, "z": rec.Velocity.Z}
			data["emitting"] = rec.Emitting
			data["hullCount"] = rec.HullCount
			data["hullTypes"] = rec.HullTypes
		}

		writes = append(writes, action.DocWrite{
			Path: []string{corporationsCollection, cid, sightingsCollection, docID},
			Data: data,
		})
	}
	return writes
}
