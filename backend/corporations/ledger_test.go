package corporations

import (
	"math"
	"strings"
	"testing"
)

func TestValidateOperationKey_AcceptsWellFormedKeys(t *testing.T) {
	for _, key := range []string{
		"0123456789abcdef",                      // exactly the 16-char floor
		"aB3_-zZ9_aB3-zZ9",                      // full permitted charset
		strings.Repeat("k", OperationKeyMaxLen), // exactly the 64-char ceiling
		"550e8400-e29b-41d4-a716-446655440000",  // a UUID, the client's actual shape
	} {
		if err := ValidateOperationKey(key); err != nil {
			t.Errorf("ValidateOperationKey(%q) = %v, want nil", key, err)
		}
	}
}

func TestValidateOperationKey_RejectsMalformed(t *testing.T) {
	// Every one of these must be rejected BEFORE any state is read — an unchecked
	// key becomes a Firestore document id, where "" panics on a nil ref and
	// "a/b/c" is path injection.
	cases := map[string]string{
		"empty":            "",
		"too short":        "0123456789abcde", // 15
		"too long":         strings.Repeat("k", OperationKeyMaxLen+1),
		"slash":            "aaaaaaaaaa/bbbbbbbbbb",
		"dot":              "aaaaaaaaaa.bbbbbbbbbb",
		"dunder":           "__aaaaaaaaaaaaaa__",
		"space":            "aaaaaaaa bbbbbbbb",
		"colon":            "aaaaaaaa:bbbbbbbb",
		"unicode":          "aaaaaaaaaaaaaaaa✨",
		"newline":          "aaaaaaaaaaaaaaaa\n",
		"percent encoding": "aaaaaaaa%2Fbbbbbbbb",
	}
	for name, key := range cases {
		if err := ValidateOperationKey(key); err == nil {
			t.Errorf("%s: ValidateOperationKey(%q) = nil, want an error", name, key)
		}
	}
}

func TestValidateOperationKey_RejectsReservedPrefix(t *testing.T) {
	// The reserved namespace is ENFORCED, not merely documented: without this,
	// "spawn:<own corpId>" permanently suppresses one's own opening grant, and
	// every future server-derived key (refund, adjustment, M12 escrow release)
	// would inherit the same hole.
	for _, key := range []string{
		"spawn:corp_0123456789abcdef",
		spawnGrantKey("corp_abcdef0123456789"),
	} {
		if err := ValidateOperationKey(key); err != ErrOperationKeyReserved {
			t.Errorf("ValidateOperationKey(%q) = %v, want ErrOperationKeyReserved", key, err)
		}
	}
}

func TestSpawnGrantKey_IsNotClientSuppliable(t *testing.T) {
	// The derived anchor must itself be unwritable by any client request —
	// otherwise the reservation is decorative.
	key := spawnGrantKey("corp_abc123def4567890")
	if err := ValidateOperationKey(key); err == nil {
		t.Fatalf("spawn grant key %q passed client validation; it must not", key)
	}
}

func TestFingerprint_DistinguishesEveryReplayField(t *testing.T) {
	base := LedgerEntry{
		FleetId: "fleet-1", Counterparty: "sys-1", Item: "metals",
		Quantity: 10, Kind: EntrySaleProceeds,
	}
	// Vary one field at a time; each must produce a different fingerprint, so a
	// reused key naming different parameters is a conflict rather than being
	// answered with the recorded entry's result.
	variants := map[string]LedgerEntry{
		"fleet":        {FleetId: "fleet-2", Counterparty: "sys-1", Item: "metals", Quantity: 10, Kind: EntrySaleProceeds},
		"counterparty": {FleetId: "fleet-1", Counterparty: "sys-2", Item: "metals", Quantity: 10, Kind: EntrySaleProceeds},
		"item":         {FleetId: "fleet-1", Counterparty: "sys-1", Item: "water", Quantity: 10, Kind: EntrySaleProceeds},
		"quantity":     {FleetId: "fleet-1", Counterparty: "sys-1", Item: "metals", Quantity: 11, Kind: EntrySaleProceeds},
		"kind":         {FleetId: "fleet-1", Counterparty: "sys-1", Item: "metals", Quantity: 10, Kind: EntryAdjustment},
	}
	for name, v := range variants {
		if FingerprintOf(&base) == FingerprintOf(&v) {
			t.Errorf("%s: fingerprint did not change, so a mismatched replay would be answered as a legitimate one", name)
		}
	}

	// The amount is deliberately NOT part of the fingerprint: it is derived from
	// the other parameters at settlement, so including it would make a
	// price-movement between attempts look like a client conflict.
	sameParamsDifferentAmount := base
	sameParamsDifferentAmount.Amount = 999
	if FingerprintOf(&base) != FingerprintOf(&sameParamsDifferentAmount) {
		t.Error("amount must not participate in the replay fingerprint")
	}
}

func TestAddCredits_GuardsOverflowInBothDirections(t *testing.T) {
	if _, err := addCredits(math.MaxInt64-5, 10); err != ErrBalanceOverflow {
		t.Errorf("positive overflow = %v, want ErrBalanceOverflow", err)
	}
	if _, err := addCredits(math.MinInt64+5, -10); err != ErrBalanceOverflow {
		t.Errorf("negative overflow = %v, want ErrBalanceOverflow", err)
	}
	got, err := addCredits(100, -40)
	if err != nil || got != 60 {
		t.Errorf("addCredits(100, -40) = (%d, %v), want (60, nil)", got, err)
	}
}

func TestLedgerCursor_RoundTrips(t *testing.T) {
	// The cursor is compound — (worldTime, doc id) — because a ledger doc id is a
	// caller-supplied operation key with no chronology, so "after this id" cannot
	// mean "after this point in time".
	const id = "550e8400-e29b-41d4-a716-446655440000"
	wt, gotId, err := decodeCursor(encodeCursor(123456789, id))
	if err != nil {
		t.Fatalf("decodeCursor: %v", err)
	}
	if int64(wt) != 123456789 || gotId != id {
		t.Errorf("round trip = (%d, %q), want (123456789, %q)", int64(wt), gotId, id)
	}
	if _, _, err := decodeCursor("not-a-cursor"); err == nil {
		t.Error("malformed cursor accepted; want an error")
	}
}
