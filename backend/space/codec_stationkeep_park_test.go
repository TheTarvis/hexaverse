package space

// RED-PHASE SDET SUITE for openspec change add-stationkeep-hold-verb —
// space-kinematics MODIFIED "Coordinates Cross the Persistence Boundary
// Through a Named Codec":
//
//   - "Every park kind and a drift round-trip exactly through the codec"
//     (widened: "including — for a `stationkeep` park — its stored
//     hold-start time and dry instant"). The round-trip assertion itself
//     lives in the pre-existing TestCodec_Scenario_EveryParkKindRoundTrips-
//     Exactly (codec_state_test.go), whose `stationkeep` case this
//     change updates in place to carry the two new fields.
//   - "A station-keep park with a missing or invalid dry instant fails to
//     decode" (NEW) — this file. The requirement now guards THREE branches,
//     not one: an absent-or-non-positive HOLD-START, an absent DRY INSTANT,
//     and a dry instant that is not strictly after the hold start. The
//     hold-start branch is the one adversary round 4 added, and its
//     rationale is quoted in the requirement itself: "an absent hold-start
//     decodes to zero, and every upkeep accrual computed from it then runs
//     from world-epoch zero — a debit of the fleet's entire spendable fuel,
//     silently clamped, on a park that decoded without complaint."
//
// ASSUMED API CONTRACT (SDET-pinned, see stationkeep_dry_instant_fold_test.go
// for the reasoning): EncodePark writes the two new fields under the keys
// "holdStartMs" and "dryInstantMs", as int64 world-milliseconds, mirroring
// the existing "epochMs"/"periodMs" keys; DecodePark is its exact inverse and
// rejects a stationkeep park whose stored window is invalid in any of the
// three branches above, with the pre-existing named ErrInvalidPark.
//
// EXPECTED RED STATE: the negative cases build their encoded maps from string
// keys rather than the new Go fields, so they are ASSERTION-red rather than
// compile-red on their own — DecodePark accepts any park map with a valid
// `kind` today and never looks at a hold window at all. The positive controls
// below read Park.HoldStartMs/DryInstantMs and are therefore compile-red
// until those fields exist, as is the rest of this package's new suite.

import (
	"errors"
	"testing"

	"hexaverse/common"
)

// encodedStationkeepPark builds a well-formed encoded stationkeep park with
// an explicit hold window, using the stored key names directly so this file
// stays compilable ahead of the Go struct fields themselves.
func encodedStationkeepPark(holdStart, dryInstant int64) map[string]any {
	return map[string]any{
		"kind":         int64(ParkStationkeep),
		"bodyId":       "planet1",
		"radius":       0.0,
		"periodMs":     int64(0),
		"phase":        int64(0),
		"epochMs":      int64(0),
		"offset":       EncodeVec(Vec3{X: 4, Y: 1, Z: -3}),
		"point":        EncodeVec(Vec3{}),
		"holdStartMs":  holdStart,
		"dryInstantMs": dryInstant,
	}
}

// Scenario: A station-keep park with a missing or invalid dry instant fails
// to decode.
//
// "WHEN a stored `stationkeep` park's hold-start time is absent or
// non-positive, or its dry instant is absent, or its dry instant is not
// strictly after its stored hold-start time — THEN decoding fails with the
// existing named, countable decode-failure error, and no park is produced,
// in each of those cases."
//
// The `equal` case is the load-bearing one for the fuel precondition:
// `hold`'s insufficient-fuel rejection exists precisely because
// `dryInstant == holdStart` is the value that would BRICK a fleet if it were
// ever persisted. If decode accepts it, that precondition guards nothing.
//
// The hold-start cases are the load-bearing ones for the accrual: an absent
// or zero hold-start decodes to world-epoch zero, and every settlement then
// charges from the beginning of time.
func TestCodec_Scenario_StationKeepParkWithMissingOrInvalidDryInstantFailsToDecode(t *testing.T) {
	withoutKey := func(holdStart, dry int64, key string) map[string]any {
		m := encodedStationkeepPark(holdStart, dry)
		delete(m, key)
		return m
	}
	withKey := func(holdStart, dry int64, key string, v any) map[string]any {
		m := encodedStationkeepPark(holdStart, dry)
		m[key] = v
		return m
	}

	cases := map[string]map[string]any{
		// --- branch 1: the dry instant itself -----------------------------
		"dry instant absent":      withoutKey(10_000, 20_000, "dryInstantMs"),
		"dry instant nil":         withKey(10_000, 20_000, "dryInstantMs", nil),
		"dry instant non-numeric": withKey(10_000, 20_000, "dryInstantMs", "soon"),

		// --- branch 2: not strictly after the hold start -------------------
		"dry instant equal to hold start": encodedStationkeepPark(10_000, 10_000),
		"dry instant before hold start":   encodedStationkeepPark(10_000, 9_999),
		"dry instant negative":            encodedStationkeepPark(10_000, -1),
		"both zero":                       encodedStationkeepPark(0, 0),

		// --- branch 3: the hold start (adversary round 4) ------------------
		"hold start absent":      withoutKey(10_000, 20_000, "holdStartMs"),
		"hold start nil":         withKey(10_000, 20_000, "holdStartMs", nil),
		"hold start non-numeric": withKey(10_000, 20_000, "holdStartMs", "when the hold began"),
		"hold start zero":        encodedStationkeepPark(0, 20_000),
		"hold start negative":    encodedStationkeepPark(-5_000, 20_000),
	}
	for name, encoded := range cases {
		t.Run("Scenario: A station-keep park with a missing or invalid dry instant fails to decode ("+name+")", func(t *testing.T) {
			got, err := DecodePark(encoded)
			if !errors.Is(err, ErrInvalidPark) {
				t.Fatalf("space-kinematics \"A station-keep park with a missing or invalid dry instant fails "+
					"to decode\": DecodePark(%v) returned park %+v, err = %v — want the existing named, "+
					"countable ErrInvalidPark and no park at all.\n"+
					"  Guarding the dry instant alone is explicitly NOT sufficient: \"an absent hold-start "+
					"decodes to zero, and every upkeep accrual computed from it then runs from world-epoch "+
					"zero — a debit of the fleet's entire spendable fuel, silently clamped, on a park that "+
					"decoded without complaint.\"", encoded, got, err)
			}
			if got != (Park{}) {
				t.Errorf("a rejected decode produced a non-zero park %+v — \"no park is produced\"", got)
			}
		})
	}
}

// Scenario (positive control for the above): a stationkeep park whose
// hold-start is strictly positive and whose dry instant is strictly after it —
// by the smallest possible margin, one millisecond — decodes normally.
// Without this, a decoder that rejected EVERY stationkeep park would pass
// every negative case above.
func TestCodec_Scenario_StationKeepParkOneMsAfterHoldStartDecodes(t *testing.T) {
	encoded := encodedStationkeepPark(10_000, 10_001)
	got, err := DecodePark(encoded)
	if err != nil {
		t.Fatalf("DecodePark of a valid stationkeep park (dryInstant exactly one ms after holdStart) failed: "+
			"%v — \"any strictly positive spendable remainder above the reserve ceilings to a dry-instant "+
			"offset of at least one whole millisecond\", so a one-millisecond hold is a legal, storable park",
			err)
	}
	if got.Kind != ParkStationkeep {
		t.Fatalf("decoded kind = %v, want ParkStationkeep", got.Kind)
	}
	if got.HoldStartMs != common.WorldMillis(10_000) || got.DryInstantMs != common.WorldMillis(10_001) {
		t.Errorf("decoded hold window = (holdStart=%d dryInstant=%d), want (10000, 10001) — the codec must "+
			"be the encode's exact inverse for both new fields",
			got.HoldStartMs, got.DryInstantMs)
	}
}

// SDET-added: the two new fields are STATIONKEEP-ONLY. An `orbit` or `point`
// park carries no hold window, so the hold-window validation must not be
// applied to it — otherwise every orbit park in the world (all of which store
// holdStart == dryInstant == 0) would fail to decode, bricking every fleet in
// the game the moment this change lands. This is the migration risk design.md
// waves through ("both fields default to their zero values for every
// pre-existing stored park"), pinned as a test rather than left as prose.
func TestCodec_SDET_OrbitAndPointParksWithNoHoldWindowStillDecode(t *testing.T) {
	for name, kind := range map[string]ParkKind{"orbit": ParkOrbit, "point": ParkPoint} {
		t.Run(name, func(t *testing.T) {
			encoded := map[string]any{
				"kind":     int64(kind),
				"bodyId":   "planet1",
				"radius":   12.5,
				"periodMs": int64(45_000),
				"phase":    int64(1000),
				"epochMs":  int64(7_000),
				"offset":   EncodeVec(Vec3{}),
				"point":    EncodeVec(Vec3{X: -300, Y: 12, Z: 88}),
				// Deliberately ABSENT: holdStartMs / dryInstantMs — exactly
				// what every park written before this change stores.
			}
			got, err := DecodePark(encoded)
			if err != nil {
				t.Fatalf("SDET-added: a %s park with no stored hold window failed to decode: %v — the "+
					"hold-window requirement applies to `stationkeep` parks only", name, err)
			}
			if got.Kind != kind {
				t.Fatalf("decoded kind = %v, want %v", got.Kind, kind)
			}
		})
	}
}

// SDET-added: a released `orbit` park that a force-demotion wrote over a
// stationkeep park must carry NO hold window at all. This is the stored shape
// "Holding over a silently expired hold settles it first and is then
// rejected" asserts ("the fleet's stored park is the released `orbit` the
// settlement wrote, carrying no hold-start time and no dry instant"), pinned
// here at the codec level so a released park that kept its old stamps is
// caught at the boundary rather than three consumers later.
func TestCodec_SDET_AReleasedOrbitParkCarriesNoHoldWindow(t *testing.T) {
	released := ReleaseStationkeep("planet1", Vec3{X: 4, Y: 1, Z: -3}, 40_000)
	if released.HoldStartMs != 0 || released.DryInstantMs != 0 {
		t.Errorf("SDET-added: space.ReleaseStationkeep produced a park carrying a hold window "+
			"(holdStart=%d dryInstant=%d), want both zero — a released orbit has no hold to be dry",
			released.HoldStartMs, released.DryInstantMs)
	}
	roundTripped, err := DecodePark(EncodePark(released))
	if err != nil {
		t.Fatalf("SDET-added: a released orbit park failed to round-trip: %v", err)
	}
	if roundTripped != released {
		t.Errorf("SDET-added: released park round-trip changed it:\n  before = %+v\n  after  = %+v",
			released, roundTripped)
	}
}
