package system

// RED-phase test for openspec change add-scan-and-sightings-surface,
// architect implementation contract §1.11:
//
//	// backend/system/belt.go  (added beside beltMemberOrbit, which owns the format)
//	func IsDerivedBeltMember(bodyId string) bool   // strings.Contains(bodyId, "#")
//
// Consumed by fleet.Service.ScanTargets / resolveScanHost (tasks.md 3.3,
// 3.4) to exclude a derived belt member from the scan-target list and reject
// a commit naming one — exported from `system` rather than open-coded in
// `fleet`, because `system/belt.go`'s `"%s#%d"` format
// (beltMemberOrbit) is the one place that format is written; a predicate
// living anywhere else would be a second copy of it.
//
// EXPECTED TO FAIL ON FIRST RUN: compile error — IsDerivedBeltMember does
// not exist yet.

import (
	"testing"
)

// Scenario (SDET-added, supports focused-scan "A belt is served as one
// host, never as its members" / "A commit naming a belt member is rejected
// as unresolvable"): IsDerivedBeltMember is true for exactly the ids
// beltMemberOrbit produces, and false for every generator-produced feature
// id and every gate id.
func TestIsDerivedBeltMember_Scenario_TrueOnlyForSynthesizedMemberIds(t *testing.T) {
	belt := beltFixture() // system/belt_test.go's own fixture (same package)
	for k := 0; k < AsteroidsPerBelt; k++ {
		m := beltMemberOrbit(belt, k)
		if !IsDerivedBeltMember(m.Id) {
			t.Errorf("IsDerivedBeltMember(%q) = false, want true for a synthesized belt member id", m.Id)
		}
	}

	notMembers := []string{
		belt.Id,             // the belt feature itself
		"feat-star",         // the star
		"feat-planet-1",     // an ordinary generator-produced feature
		gateId("sys-other"), // a lane-gate body id
		"",                  // empty
		"feat-belt-0",       // a belt id that merely LOOKS like a prefix, no "#"
	}
	for _, id := range notMembers {
		if IsDerivedBeltMember(id) {
			t.Errorf("IsDerivedBeltMember(%q) = true, want false — not a derived belt member id", id)
		}
	}
}

// Scenario (SDET-added boundary probe): a body id that happens to contain
// "#" but was never produced by beltMemberOrbit is still classified as a
// derived member by this predicate, mirroring the contract's literal
// `strings.Contains(bodyId, "#")` definition rather than a stricter
// "matches beltId#<digits>" pattern — pinned here so a developer choosing a
// stricter regex knows it is a deliberate divergence from the contract, not
// an oversight.
func TestIsDerivedBeltMember_Scenario_ContractDefinitionIsSubstringOfHash(t *testing.T) {
	if !IsDerivedBeltMember("anything#7") {
		t.Errorf(`IsDerivedBeltMember("anything#7") = false, want true per the contract's ` +
			`strings.Contains(bodyId, "#") definition`)
	}
}
