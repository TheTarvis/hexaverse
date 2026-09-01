package disclosure

import (
	"math"
	"reflect"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

// Scenario: Two call paths agree bit-for-bit (proximity-disclosure › "Every
// Disclosure Predicate Reads Position Through the Canonical Path").
// tasks.md 4.1.
//
// This is the hazard the kinematics change did NOT test and this capability
// exists partly to close. Bit-reproducibility across build targets is
// proven; bit-reproducibility across CALL PATHS is not. If "where is this
// fleet at time T" can be reached two ways that differ in the last ULP,
// a predicate at the boundary flips even though every operation was
// deterministic.
//
// The two routes are constructed independently rather than through a shared
// helper — one calls space.StatePosition, the other folds with space.StateAt
// and asks the folded state itself — which is the whole point: a test where
// both routes bottom out in the same call proves nothing.
func TestCanonicalPath_TwoRoutesAgreeBitForBit(t *testing.T) {
	bodies := testWorld(nil).Bodies
	const depart, arrive common.WorldMillis = 1_000, 9_000

	// Deliberately awkward coordinates: values whose products need the full
	// mantissa are where a divergent path would show up.
	mid := burningFrom("m", space.Vec3{X: 13.7, Y: -41.9, Z: 7.31}, space.Vec3{X: -88.13, Y: 3.7, Z: -22.9}, depart, arrive, 8, 2).State
	settled := mid
	parked := parkedAt("p", space.Vec3{X: 40.125, Y: -3.5, Z: 99.0625}).State

	cases := []struct {
		name  string
		state space.ShipState
		at    common.WorldMillis
	}{
		{"mid-burn", mid, 5_000},
		{"a burn past its arrival, folded to its settled park", settled, 20_000},
		{"already parked", parked, 12_345},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// Route A: the canonical entry point.
			direct, err := space.StatePosition(bodies, c.state, c.at)
			if err != nil {
				t.Fatalf("route A: %v", err)
			}
			// Route B: fold first, then ask the folded state itself.
			folded, err := space.StateAt(bodies, c.state, c.at)
			if err != nil {
				t.Fatalf("route B fold: %v", err)
			}
			var viaFold space.Vec3
			switch folded.Mode {
			case space.ModeBurn:
				viaFold = folded.Burn.Position(c.at)
			default:
				viaFold, err = folded.Park.Position(bodies, c.at)
				if err != nil {
					t.Fatalf("route B park: %v", err)
				}
			}
			for _, comp := range []struct {
				axis string
				a, b float64
			}{{"X", direct.X, viaFold.X}, {"Y", direct.Y, viaFold.Y}, {"Z", direct.Z, viaFold.Z}} {
				if math.Float64bits(comp.a) != math.Float64bits(comp.b) {
					t.Errorf("%s: %v via the canonical path, %v via the fold — not bit-identical", comp.axis, comp.a, comp.b)
				}
			}
		})
	}
}

// Scenario: The same query at the same world time is stable
// (proximity-disclosure › "Live Disclosure Is Recomputed, Never
// Persisted"). tasks.md 4.2.
//
// Independently constructed calls, not the same struct evaluated twice:
// nothing may be carried between two evaluations, so building the world,
// the observer, and the ship separately for each is the point rather than
// an inconvenience.
func TestDisclose_IsStableAcrossIndependentlyConstructedCalls(t *testing.T) {
	const at common.WorldMillis = 3_333
	first, ok1, err1 := Disclose(testWorld(nil), observerAt(space.Vec3{X: 40, Y: 30}), parkedAt("x", space.Vec3{X: 44.7, Y: 33.1}), at)
	second, ok2, err2 := Disclose(testWorld(nil), observerAt(space.Vec3{X: 40, Y: 30}), parkedAt("x", space.Vec3{X: 44.7, Y: 33.1}), at)

	if err1 != nil || err2 != nil {
		t.Fatalf("Disclose errored: %v, %v", err1, err2)
	}
	if ok1 != ok2 || first != second {
		t.Errorf("two independently constructed evaluations disagree: (%v, %+v) vs (%v, %+v)", ok1, first, ok2, second)
	}
	if !ok1 {
		t.Fatal("the scenario needs a disclosed target to be worth asserting on")
	}
}

// Scenario: A target that leaves coverage stops being disclosed
// (proximity-disclosure › "Live Disclosure Is Recomputed, Never
// Persisted"). tasks.md 4.3.
//
// No carry-forward, because there is nowhere for a carry to live. This is
// the property that makes a knife-edge float boundary tolerable here where
// it was intolerable in the fog model this replaces: a flip costs one tick
// of flicker, not a permanent and currently-wrong belief.
func TestDisclose_LeavingCoverageEndsDisclosure(t *testing.T) {
	w := testWorld(nil)
	obs := observerAt(space.Vec3{X: 40, Y: 200})
	const depart, arrive common.WorldMillis = 0, 100_000

	// A fleet burning outward past the observer's reach. It is disclosed
	// early and must not be disclosed late, from the same call.
	fleet := burningFrom("runner", space.Vec3{X: 41, Y: 200}, space.Vec3{X: 4_000, Y: 200}, depart, arrive, MinCommandedAccel, 0.01)

	if _, ok, err := Disclose(w, obs, fleet, depart); err != nil || !ok {
		t.Fatalf("the fleet is not disclosed at departure (ok=%v, err=%v); the scenario needs it seen first", ok, err)
	}
	if _, ok, err := Disclose(w, obs, fleet, arrive); err != nil || ok {
		t.Errorf("the fleet is still disclosed after leaving every detection radius (ok=%v, err=%v)", ok, err)
	}
}

// Scenario: A stored sighting does not make a target live-disclosed
// (proximity-disclosure › "Live Disclosure Is Recomputed, Never
// Persisted"). tasks.md 4.5.
//
// This is the narrow rule the whole design rests on: the pile is readable,
// sellable, and INERT. The moment a sighting feeds the live path — as a
// cache, a hint, or a "you already know about this one" shortcut — the
// knife edge gets its teeth back.
func TestDisclose_AHeldSightingNeverFeedsTheLivePath(t *testing.T) {
	w := testWorld(nil)
	obs := observerAt(space.Vec3{X: 40, Y: 200})

	// The corporation scans the target where it can see it, and files the
	// record.
	seenAt := parkedAt("prey", space.Vec3{X: 45, Y: 200})
	seenAt.HullCount = 4
	record, err := MintSighting(w.Bodies, seenAt, "", 1_000)
	if err != nil {
		t.Fatalf("minting: %v", err)
	}
	if _, ok, err := Disclose(w, obs, seenAt, 1_000); err != nil || !ok {
		t.Fatalf("the target must be live-disclosed where it was scanned (ok=%v, err=%v)", ok, err)
	}

	// It then leaves every detection radius. The held record must not
	// disclose it, and must still be readable as the historical claim it is.
	gone := parkedAt("prey", space.Vec3{X: 4_000, Y: 200})
	gone.HullCount = 4
	if _, ok, err := Disclose(w, obs, gone, 2_000); err != nil || ok {
		t.Errorf("a target outside every detection radius is live-disclosed while a sighting is held (ok=%v, err=%v)", ok, err)
	}
	if record.HullCount != 4 || record.AsOf != 1_000 {
		t.Errorf("the held record changed: %+v", record)
	}
}

// Scenario: A live contact withholds composition (proximity-disclosure › "A
// Scan Resolves Composition That a Live Contact Withholds"). tasks.md 7.5.
//
// DELIBERATELY WIDENED to four fields by replace-observation-with-sightings
// §4 (tasks.md 4.5, design.md Decision 9, proximity-disclosure "A Sweep's
// Emission Radius Scales With Its Range": "disclosure/contact_test.go
// asserts Contact's field set by reflection; adding Scanning to that field
// set is a deliberate edit to that test, made in this change, and not a
// silent drift the test happened to permit"). This is a NAMED, SPEC-MANDATED
// test edit, not a silent weakening: the set grows from three fields to
// four, and every one of the original three assertions (Position, Velocity,
// Emitting present; nothing identifying or compositional) survives
// unchanged. See the SDET handoff report.
//
// Asserted by reflection over the wire type rather than by reading it,
// because the failure mode is somebody adding a convenient field later. The
// positive half matters too: a contact that carried nothing would pass a
// pure absence check.
func TestContact_CarriesKinematicsScanningStateAndNothingIdentifying(t *testing.T) {
	typ := reflect.TypeOf(Contact{})

	want := map[string]bool{"Position": true, "Velocity": true, "Emitting": true, "Scanning": true}
	got := map[string]bool{}
	for i := 0; i < typ.NumField(); i++ {
		got[typ.Field(i).Name] = true
	}
	for name := range want {
		if !got[name] {
			t.Errorf("Contact has no %s field; a live contact reports position, velocity, emitting state, and "+
				"scanning state (proximity-disclosure \"A Sweep's Emission Radius Scales With Its Range\")", name)
		}
	}

	forbidden := []string{"hull", "owner", "corp", "count", "type", "class", "mass", "size", "name", "id"}
	for i := 0; i < typ.NumField(); i++ {
		field := typ.Field(i).Name
		if want[field] {
			continue
		}
		lower := strings.ToLower(field)
		for _, bad := range forbidden {
			if strings.Contains(lower, bad) {
				t.Errorf("Contact.%s reads as composition or identity; a live contact carries neither", field)
			}
		}
		t.Errorf("Contact.%s is not one of the four fields a live contact is specified to carry", field)
	}
}

// A contact's kinematics come from the same moment as each other: the
// velocity rides the same effective-state fold the position does, so a
// contact can never describe a fleet that was in two states at once.
func TestContact_KinematicsComeFromOneMoment(t *testing.T) {
	w := testWorld(nil)
	obs := observerAt(space.Vec3{X: 40, Y: 200})
	// A burn long enough that it is genuinely mid-profile at the query time:
	// a transfer whose covered arc length has already saturated would fold
	// to its arrival tangent and report a degenerate velocity, which would
	// make this scenario assert nothing.
	fleet := burningFrom("f", space.Vec3{X: 41, Y: 200}, space.Vec3{X: 441, Y: 200}, 0, 14_142, 8, 2)

	contact, ok, err := Disclose(w, obs, fleet, 5_000)
	if err != nil || !ok {
		t.Fatalf("the burning fleet is not disclosed (ok=%v, err=%v)", ok, err)
	}
	if !contact.Emitting {
		t.Error("a mid-burn contact does not report emitting")
	}
	wantPos, err := space.StatePosition(w.Bodies, fleet.State, 5_000)
	if err != nil {
		t.Fatalf("canonical position: %v", err)
	}
	if contact.Position != wantPos {
		t.Errorf("Contact.Position = %v, want the canonical %v", contact.Position, wantPos)
	}
	if contact.Velocity == (space.Vec3{}) {
		t.Error("a mid-burn contact reports zero velocity")
	}
}

// Scenario: An undisclosed fleet is absent, not redacted (proximity-
// disclosure › "Disclosure Is Decided Server-Side and Undisclosed Entities
// Are Absent").
//
// Absent-not-masked is stricter than what the fog model it replaces
// shipped, and the strictness is the point: a redacted entity still tells
// you something exists, and a bounding box or a count still narrows where.
// Disclose has no third state — it returns the ZERO contact alongside
// false, so there is no partially-filled value for a caller to serialize by
// accident.
func TestDisclose_UndisclosedYieldsNothingAtAll(t *testing.T) {
	w := testWorld(fakeAttachments{"docked": "host"})
	obs := observerAt(space.Vec3{X: 40, Y: 200})

	farAway := parkedAt("far", space.Vec3{X: 4_000, Y: 200})
	behindStar := parkedAt("hidden", space.Vec3{X: -40, Y: 0})
	masked := parkedAt("docked", space.Vec3{X: 42, Y: 200})
	transiting := parkedAt("gone", space.Vec3{X: 42, Y: 200})
	transiting.InLaneTransit = true

	for _, c := range []struct {
		name string
		ship Ship
	}{
		{"out of every detection radius", farAway},
		{"behind the star", behindStar},
		{"masked at a host", masked},
		{"in lane transit", transiting},
	} {
		t.Run(c.name, func(t *testing.T) {
			contact, ok, err := Disclose(w, obs, c.ship, 0)
			if err != nil {
				t.Fatalf("Disclose: %v", err)
			}
			if ok {
				t.Fatal("the ship is disclosed; this scenario needs it undisclosed")
			}
			if contact != (Contact{}) {
				t.Errorf("an undisclosed ship yielded %+v; nothing derived from its state may reach a caller", contact)
			}
		})
	}
}
