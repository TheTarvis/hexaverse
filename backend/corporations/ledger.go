package corporations

import (
	"errors"
	"strings"

	"hexaverse/common"
)

// EntryKind names why a credit mutation happened. Extensible: a new kind is a
// new constant, never a schema change.
type EntryKind string

const (
	// EntryStartingGrant is spawn's one-time opening balance (#0011 Decision 14).
	EntryStartingGrant EntryKind = "startingGrant"
	// EntrySaleProceeds is goods-sale's settlement credit — the only faucet M11
	// ships besides the grant.
	EntrySaleProceeds EntryKind = "saleProceeds"
	// EntryAdjustment is an operator-attributed correction. The data model ships
	// (#0011 Decision 21) so a future admin surface has a representation; NO route
	// mints one in this version, and a confirmed reconciliation divergence is
	// resolved only by one landing.
	EntryAdjustment EntryKind = "adjustment"
	// EntryFuelPurchase is fuel-purchase's settlement debit (add-fuel-as-
	// cargo) — fleet-scoped like a sale, always a strictly negative Amount.
	EntryFuelPurchase EntryKind = "fuelPurchase"
)

// LedgerEntry is one append-only row of a corporation's trade ledger, living at
// corporations/{corpId}/ledger/{operationKey} — the doc id IS the idempotency
// anchor (#0011 Decision 7), the same "doc id doubles as the dedup anchor" trick
// action's deltas/{scope}/entries/{actionId} already uses. Scoped per corporation
// so one corp's key can never collide with, read, or suppress another's.
//
// Never updated or deleted once appended.
type LedgerEntry struct {
	// Id is the operation key — also this doc's id. Redundant on purpose: a
	// decoded entry carries its own key without re-reading the ref.
	Id string `json:"id" firestore:"id"`
	// CorpId is the owning corporation. Redundant with the path, kept so an entry
	// read out of context still names its owner.
	CorpId string `json:"corpId" firestore:"corpId"`
	// AccountId attributes the mutation to the account that TRIGGERED it — not the
	// corp (#0011 Decision 18). Under token passthrough the claude-agent acts with
	// the user's own token, so corp id alone can't tell which channel produced an
	// entry; this can.
	AccountId string `json:"accountId" firestore:"accountId"`
	// FleetId is the acting fleet for a fleet-scoped mutation (a sale), empty for
	// a fleet-independent one (the grant). Part of the replay fingerprint.
	FleetId string `json:"fleetId,omitempty" firestore:"fleetId,omitempty"`
	// WorldTime is the sim-clock stamp, and the PRIMARY reconciliation cursor
	// ordering key — the doc id is a caller-supplied key with no chronology
	// (#0011 Decision 8), so a windowed fold orders by (worldTime, id).
	WorldTime common.WorldMillis `json:"worldTime" firestore:"worldTime"`
	Kind      EntryKind          `json:"kind" firestore:"kind"`
	// Counterparty is the other side (a station's venue key) — nil for a grant.
	Counterparty string `json:"counterparty,omitempty" firestore:"counterparty,omitempty"`
	// Item is what moved (a resource kind's string form) — empty for a grant.
	// String-keyed by the same rule the whole change follows: never a named
	// string type in a Firestore-serialized field (see fleet.Cargo's doc comment
	// on the SDK's transform-extraction panic).
	Item string `json:"item,omitempty" firestore:"item,omitempty"`
	// Quantity is tons sold — zero for a grant.
	Quantity float64 `json:"quantity,omitempty" firestore:"quantity,omitempty"`
	// UnitPrice is credits per ton — zero for a grant, and for a split fill this
	// is the blended effective price (the per-portion breakdown rides the sale
	// response, not the ledger).
	UnitPrice int64 `json:"unitPrice,omitempty" firestore:"unitPrice,omitempty"`
	// Amount is the signed credit delta, ALWAYS the exact rounded integer applied
	// to the balance in the same transaction — never a pre-rounding float. This is
	// what makes fold-equals-balance hold by construction regardless of rounding
	// direction (#0011 Decision 1). Never zero.
	Amount int64 `json:"amount" firestore:"amount"`
	// ResultingBalance is the balance immediately after this entry. The write-time
	// chained reconciliation check (#0011 Decision 18) validates the next
	// mutation's computed balance against this field before committing.
	ResultingBalance int64 `json:"resultingBalance" firestore:"resultingBalance"`
}

// Fingerprint is the replay-identity of a mutation: a reused operation key that
// names DIFFERENT parameters than the recorded entry is a conflict, not a replay
// (#0011 Decision 7). Compared field-wise rather than hashed so a mismatch can
// say which field diverged.
type Fingerprint struct {
	FleetId      string
	Counterparty string
	Item         string
	Quantity     float64
	Kind         EntryKind
}

// FingerprintOf reads the replay identity back off a recorded entry.
func FingerprintOf(e *LedgerEntry) Fingerprint {
	return Fingerprint{
		FleetId:      e.FleetId,
		Counterparty: e.Counterparty,
		Item:         e.Item,
		Quantity:     e.Quantity,
		Kind:         e.Kind,
	}
}

// --- Operation key format (#0011 "Operation Key Format Is Constrained") -----

const (
	// OperationKeyMinLen / OperationKeyMaxLen bound the key. The floor keeps a key
	// wide enough to be collision-resistant (a UUID is 36); the ceiling stops
	// storage amplification through a doc id.
	OperationKeyMinLen = 16
	OperationKeyMaxLen = 64
)

// reservedKeyPrefixes are the namespaces the SERVER derives its own idempotency
// anchors in. A client key carrying one is rejected outright, so a client can
// never write to, read from, or suppress a server-derived anchor — proven
// reachable otherwise ("spawn:"+own corpId permanently suppresses one's own
// opening grant), and every FUTURE server-derived key (a refund, an admin
// adjustment, an M12 escrow release) inherits the closure for free.
var reservedKeyPrefixes = []string{spawnGrantKeyPrefix}

// spawnGrantKeyPrefix namespaces the opening grant's derived key. Derived, not
// client-supplied, because the grant is triggered by an idempotent corp-id-keyed
// call, not a client action a network retry could duplicate under a fresh key.
const spawnGrantKeyPrefix = "spawn:"

var (
	// ErrOperationKeyFormat: absent, empty, mis-sized, or carrying a character
	// outside [A-Za-z0-9_-]. Rejected with 400 BEFORE any state read — this is
	// also what closes unvalidated-input-as-doc-id ("" → nil ref panic, "a/b/c" →
	// path injection).
	ErrOperationKeyFormat = errors.New("corporations: operation key must be 16-64 characters of [A-Za-z0-9_-]")
	// ErrOperationKeyReserved: the key carries a server-reserved prefix.
	ErrOperationKeyReserved = errors.New("corporations: operation key uses a server-reserved prefix")
)

// ValidateOperationKey enforces the format and the reserved namespace. Callers
// MUST run it before any read — the whole point is that a malformed key never
// reaches Firestore as a document id.
//
// Note the ordering: the reserved-prefix check runs SECOND even though a
// "spawn:" key also fails the charset rule (':' is not in the allowed set), so
// the caller still gets the more specific reason for the more specific mistake.
func ValidateOperationKey(key string) error {
	if !validKeyCharsAndLength(key) {
		if hasReservedPrefix(key) {
			return ErrOperationKeyReserved
		}
		return ErrOperationKeyFormat
	}
	if hasReservedPrefix(key) {
		return ErrOperationKeyReserved
	}
	return nil
}

func hasReservedPrefix(key string) bool {
	for _, p := range reservedKeyPrefixes {
		if strings.HasPrefix(key, p) {
			return true
		}
	}
	return false
}

func validKeyCharsAndLength(key string) bool {
	if len(key) < OperationKeyMinLen || len(key) > OperationKeyMaxLen {
		return false
	}
	// Firestore reserves every document id matching __.*__ — a key like
	// "__aaaa__" is drawn entirely from the permitted charset yet is still an
	// illegal doc id, so the charset loop below cannot catch it. Rejecting it here
	// keeps the failure a clean 400 at the edge instead of a write-time error
	// after the caller believed its key was accepted.
	if strings.HasPrefix(key, "__") && strings.HasSuffix(key, "__") {
		return false
	}
	for i := 0; i < len(key); i++ {
		c := key[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '_', c == '-':
		default:
			return false
		}
	}
	return true
}

// spawnGrantKey is the derived, non-client-suppliable anchor for a corp's
// one-time opening grant. Deliberately carries the reserved prefix that
// ValidateOperationKey rejects from a client.
func spawnGrantKey(corpID string) string { return spawnGrantKeyPrefix + corpID }
