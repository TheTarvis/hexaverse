package sightings

// RED-phase tests for openspec change add-scan-and-sightings-surface,
// tasks.md 1.1 (store-side half)/1.2 (store-side half)/1.10, against the
// architect's implementation contract §1.3 (link8b-impl-contract.md), which
// settles the digest EXACTLY:
//
//	const documentIdDomain = "sighting/v1\x00"
//	documentId(actionId, targetId) = hex(sha256(documentIdDomain + actionId + "\x00" + targetId)[:16])
//	clean sweep: targetId == ""
//
// with these PINNED, literally-computed expected values (contract §1.3):
//
//	(act-1, tgt-1)          -> ae80c6d8304786e06ab71baee15cf787
//	(act-1, tgt-2)          -> 07d4de63955531f2e63d38c88e76e317
//	(act-2, tgt-1)          -> 172d7d42f69088846f96d54129f438fe
//	(act-1, "" clean sweep) -> 45222e552fc4bd137bac34b7a0e078c0
//
// Asserting against LITERAL expected strings is deliberate and is what makes
// this a genuine cross-process-stability test without needing two processes:
// a per-process- or randomly-seeded derivation (hash/maphash) CANNOT produce
// these fixed values reproducibly, and a 32-bit non-cryptographic hash
// (FNV-1a) cannot produce a 32-hex-character (128-bit) value at all — so
// matching this table is only possible for the mandated SHA-256-over-a-
// domain-prefixed-string derivation.
//
// EXPECTED RED TODAY: assertion failure, not a compile error. MintWrites
// already exists and compiles (design.md Decision 1 / tasks.md 2.1 is not
// yet implemented) — it currently derives
// `corporations/{cid}/sightings/{actionId}_{targetId}`, so every assertion
// below fails on the literal string comparison until 2.1 lands the SHA-256
// digest derivation.
//
// This file deliberately tests through the PUBLIC MintWrites function only,
// never through an unexported `documentId` helper — the contract's Go
// snippet is illustrative of the algorithm, not a promise that `documentId`
// is itself exported or even named that; MintWrites is the one surface every
// consumer (the resolver, this suite) actually calls, so pinning the digest
// there is both sufficient and immune to a purely internal refactor.

import (
	"strconv"
	"strings"
	"testing"
)

// docIdOf calls MintWrites for one record and returns the last path segment
// (the document id) of its one produced write.
func docIdOf(t *testing.T, cid, actionId, targetId string, cleanSweep bool) string {
	t.Helper()
	rec := Sighting{ActionId: actionId, TargetId: targetId, CleanSweep: cleanSweep, HostId: "host-x"}
	writes := MintWrites(cid, actionId, []Sighting{rec})
	if len(writes) != 1 {
		t.Fatalf("MintWrites(%q, %q, ...) returned %d writes, want 1", cid, actionId, len(writes))
	}
	path := writes[0].Path
	return path[len(path)-1]
}

// Scenario: A sighting's document id is deterministic (sighting-records) /
// The identifier is stable across processes and instances — pinned literal
// table, contract §1.3.
func TestMintWrites_Scenario_PinnedDigestConstants(t *testing.T) {
	cases := []struct {
		actionId, targetId, want string
		cleanSweep               bool
	}{
		{actionId: "act-1", targetId: "tgt-1", want: "ae80c6d8304786e06ab71baee15cf787"},
		{actionId: "act-1", targetId: "tgt-2", want: "07d4de63955531f2e63d38c88e76e317"},
		{actionId: "act-2", targetId: "tgt-1", want: "172d7d42f69088846f96d54129f438fe"},
		{actionId: "act-1", targetId: "", cleanSweep: true, want: "45222e552fc4bd137bac34b7a0e078c0"},
	}
	for _, c := range cases {
		got := docIdOf(t, "corp-pin", c.actionId, c.targetId, c.cleanSweep)
		if got != c.want {
			t.Errorf("documentId(%q, %q, clean=%v) = %q, want the pinned digest %q "+
				"(link8b-impl-contract.md §1.3 — sha256(\"sighting/v1\\x00\"+actionId+\"\\x00\"+targetId)[:16], hex)",
				c.actionId, c.targetId, c.cleanSweep, got, c.want)
		}
		if len(got) != 32 {
			t.Errorf("documentId(%q, %q) has length %d, want exactly 32 lowercase hex characters (128 bits)",
				c.actionId, c.targetId, len(got))
		}
		if strings.ToLower(got) != got {
			t.Errorf("documentId(%q, %q) = %q is not lowercase hex", c.actionId, c.targetId, got)
		}
	}
}

// NOTE ON "Two records from one sweep take two distinct paths" / "Two
// sweeps against the same target share no identifier": these two scenarios
// are ALREADY true under today's {actionId}_{targetId} derivation (any two
// distinct string concatenations are trivially distinct), so a standalone
// test asserting only distinctness would be GREEN-WRONG — a test that
// cannot observe the digest-format defect it exists to catch (README.md
// lesson two). TestMintWrites_Scenario_PinnedDigestConstants is what
// actually exercises both: rows 2 vs 3 of the pinned table ARE "two sweeps
// against the same target" (same targetId "tgt-1", different actionId) and
// rows 1 vs 2 ARE "two records from one sweep" (same actionId "act-1",
// different targetId) — pinned to literal SHA-256 outputs, so a
// distinctness-only check that passed against the OLD format cannot pass
// here by accident.

// Scenario: A record's id names no target — the id contains no substring of
// the target's raw id, across a variety of target-id shapes (SDET-added:
// boundary probe beyond the literal scenario — a UUID-shaped id, a short id,
// and an id that happens to embed the action id as a substring of itself).
func TestMintWrites_Scenario_IdContainsNoTargetIdSubstring(t *testing.T) {
	targets := []string{
		"fleet_victim_9f86d081884c7d659a2feaa0c55ad015",
		"f1",
		"act-1", // pathological: target id equal to the action id
		"tgt-1-act-1",
	}
	for _, targetId := range targets {
		got := docIdOf(t, "corp-y", "act-1", targetId, false)
		if strings.Contains(got, targetId) {
			t.Errorf("documentId(\"act-1\", %q) = %q contains the target id verbatim", targetId, got)
		}
		// Not merely absent as a literal substring: not present hex-encoded
		// or as a simple integer re-encoding either — a cheap, practical
		// non-invertibility proxy (true non-invertibility is guaranteed by
		// SHA-256's design, not independently provable by a unit test).
		if n, err := strconv.ParseInt(targetId, 10, 64); err == nil {
			hexOfTarget := strconv.FormatInt(n, 16)
			if strings.Contains(got, hexOfTarget) {
				t.Errorf("documentId contains a hex re-encoding of the numeric target id %q: %q", targetId, got)
			}
		}
	}
}

// Scenario: A record's id is not a reversible encoding of its target
// (SDET proxy — see file doc comment: the practical, automatable half of
// this scenario is "no recoverable encoding of the input survives in the
// output", checked above and here by confirming the SAME target id under
// two DIFFERENT actions produces unrelated-looking digests (no shared
// prefix/suffix a naive "decode" could exploit).
func TestMintWrites_Scenario_NoSharedFragmentAcrossUnrelatedActions(t *testing.T) {
	a := docIdOf(t, "corp-z", "action-alpha", "tgt-shared", false)
	b := docIdOf(t, "corp-z", "action-beta", "tgt-shared", false)
	if a == b {
		t.Fatalf("two different actions against the same target produced the same id %q", a)
	}
	// No shared prefix of length >= 8 hex chars (an avalanche property SHA-256
	// gives for free; a bug that only hashed the target and ignored the
	// action id would produce identical digests, which the equality check
	// above already catches — this extra check catches a PARTIAL leak, e.g.
	// an implementation that concatenated a truncated hash of each input).
	// Guarded on length: today's un-migrated {actionId}_{targetId} format can
	// be shorter than 32 chars, and this probe must not panic against it —
	// its OWN redness comes from the pinned-constants test above, not from
	// this secondary structural probe.
	for n := 8; n <= 32; n += 8 {
		if len(a) < n || len(b) < n {
			continue
		}
		if a[:n] == b[:n] {
			t.Errorf("documentId(actA, tgt) and documentId(actB, tgt) share an %d-hex-char prefix (%q) — "+
				"suspicious for a collision-resistant digest with no shared structure", n, a[:n])
		}
	}
}
