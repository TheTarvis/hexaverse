package sightings

import (
	"crypto/sha256"
	"encoding/hex"

	"hexaverse/action"
)

// documentIdDomain prefixes every digest input so this derivation can never
// be confused with, or replayed from, any other digest this codebase might
// later derive over the same (actionId, targetId) pair
// (link8b-impl-contract.md §1.3).
const documentIdDomain = "sighting/v1\x00"

// documentId is the pile's opaque, deterministic document path component —
// a collision-resistant digest (SHA-256, leading 128 bits, lowercase hex)
// over (actionId, targetId), with no per-process, per-instance, or randomly
// seeded input and no float arithmetic (sighting-records "A Sighting Is
// Minted In the Resolve Transaction, Exactly Once"; link8b-impl-contract.md
// §1.3). targetId is "" for a clean-sweep record — the clean-sweep record's
// material is the same expression with an empty target component, needing no
// separate literal prefix, because disclosure.FocusedScan never emits a
// target-naming record with an empty TargetId.
func documentId(actionId, targetId string) string {
	sum := sha256.Sum256([]byte(documentIdDomain + actionId + "\x00" + targetId))
	return hex.EncodeToString(sum[:16])
}

// MintWrites is the package's ONLY minting mechanism — there is deliberately
// no Dao.Create/Set method for a sighting record (sighting-records "The mint
// is never a separate write after the transaction"). It builds one
// action.DocWrite per record at a deterministic document path derived solely
// from the resolving action's id and the record's target id (or, for a clean
// sweep, the action's id alone) via documentId (design.md Decision 13;
// link8b-impl-contract.md §1.3):
//
//	corporations/{cid}/sightings/{documentId(actionId, targetId)}  (composition record)
//	corporations/{cid}/sightings/{documentId(actionId, "")}        (clean-sweep record)
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
		target := rec.TargetId
		if rec.CleanSweep {
			target = ""
		}
		docID := documentId(actionId, target)

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
