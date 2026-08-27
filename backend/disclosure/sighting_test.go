package disclosure

import (
	"errors"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"math"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/space"
)

// Scenario: A sighting keeps its stamp as the world moves / Composition is
// frozen at the sighting's stamp (proximity-disclosure › "A Scan-Minted
// Sighting Is a Stamped Historical Claim", "A Scan Resolves Composition
// That a Live Contact Withholds"). tasks.md 7.1, 7.4, 7.6.
//
// A sighting is not a claim about the present and must never quietly become
// one. Both halves of that are tested: the kinematics stay at the moment
// the pulse arrived, and the composition stays what the fleet had then —
// including against a caller that mutates the very slice it minted from,
// which is why MintSighting copies rather than aliases.
func TestMintSighting_IsFrozenAtItsStamp(t *testing.T) {
	w := testWorld(nil)
	const asOf common.WorldMillis = 7_500

	fleet := parkedAt("prey", space.Vec3{X: 40, Y: 30})
	fleet.HullCount = 5
	fleet.HullTypes = []string{"hauler", "scout"}

	record, err := MintSighting(w.Bodies, fleet, "planet", asOf)
	if err != nil {
		t.Fatalf("minting: %v", err)
	}
	if record.AsOf != asOf {
		t.Errorf("AsOf = %d, want %d", record.AsOf, asOf)
	}
	if record.HullCount != 5 || len(record.HullTypes) != 2 {
		t.Fatalf("composition did not reach the record: %+v", record)
	}
	before := record

	// The world moves on: the fleet flies away, and its composition changes
	// under it.
	fleet.State = parkedAt("prey", space.Vec3{X: -400, Y: -400}).State
	fleet.HullCount = 1
	fleet.HullTypes[0] = "wreck"
	fleet.HullTypes = append(fleet.HullTypes, "salvage")

	if !equalSightings(record, before) {
		t.Errorf("the record changed as the world moved: %+v, was %+v", record, before)
	}
	if record.HullCount != 5 {
		t.Errorf("HullCount = %d after the fleet lost hulls, want the 5 it was minted with", record.HullCount)
	}
	if record.HullTypes[0] != "hauler" || len(record.HullTypes) != 2 {
		t.Errorf("HullTypes = %v after the caller mutated its own slice, want the composition minted with", record.HullTypes)
	}
	if got := record.Position; got != (space.Vec3{X: 40, Y: 30}) {
		t.Errorf("Position = %v after the fleet moved, want where it was at the stamp", got)
	}
}

func equalSightings(a, b Sighting) bool {
	if a.AsOf != b.AsOf || a.TargetId != b.TargetId || a.Position != b.Position ||
		a.Velocity != b.Velocity || a.Emitting != b.Emitting || a.HullCount != b.HullCount ||
		a.CleanSweep != b.CleanSweep || a.HostId != b.HostId || len(a.HullTypes) != len(b.HullTypes) {
		return false
	}
	for i := range a.HullTypes {
		if a.HullTypes[i] != b.HullTypes[i] {
			return false
		}
	}
	return true
}

// Scenario: Scan mint uses the same boundary rule (proximity-disclosure ›
// "A Scan-Minted Sighting Is a Stamped Historical Claim"). tasks.md 7.2.
//
// The mint predicate is not a second implementation of proximity with its
// own operator: a target exactly at the echo radius when the pulse reaches
// it IS minted, and one representable step beyond is not — the same
// inclusive, squared, canonical-path rule every live channel runs on.
func TestScanMints_UsesTheSameInclusiveBoundary(t *testing.T) {
	w := testWorld(nil)
	// Off-axis from the star, so occlusion plays no part in this scenario.
	origin := space.Vec3{Y: 200}
	const echo = 30.0

	atRim := parkedAt("rim", space.Vec3{X: echo, Y: 200})
	if got := origin.DistSq(atRim.State.Park.Point); got != float64(echo*echo) {
		t.Fatalf("construction is not exact: distSq = %v, echoSq = %v", got, float64(echo*echo))
	}
	mints, err := ScanMints(w, origin, echo, atRim, 0)
	if err != nil {
		t.Fatalf("ScanMints: %v", err)
	}
	if !mints {
		t.Error("a target exactly at the echo radius is not minted; the mint boundary must be closed like every other")
	}

	echoSq := float64(echo * echo)
	justBeyond := math.Nextafter(echoSq, math.Inf(1))
	beyond := parkedAt("beyond", space.Vec3{X: echo, Y: 200 + math.Sqrt(justBeyond-echoSq)})
	if got := origin.DistSq(beyond.State.Park.Point); got != justBeyond {
		t.Fatalf("construction missed the boundary: distSq = %v, want %v", got, justBeyond)
	}
	if mints, err := ScanMints(w, origin, echo, beyond, 0); err != nil || mints {
		t.Errorf("a target one representable step beyond the echo radius is minted (mints=%v, err=%v)", mints, err)
	}
}

// Scenario: A scan cannot mint a transiting fleet (proximity-disclosure ›
// "A Fleet In Lane Transit Is Disclosed By No Channel").
//
// Lane transit is immunity from every channel, the scan included: a fleet
// between systems is absent from the origin system and the destination
// system alike until its transit resolves.
func TestScanMints_TransitingFleetIsNeverMinted(t *testing.T) {
	w := testWorld(nil)
	origin := space.Vec3{Y: 200}
	target := parkedAt("gone", space.Vec3{X: 1, Y: 200})
	target.InLaneTransit = true

	if mints, err := ScanMints(w, origin, 30, target, 0); err != nil || mints {
		t.Errorf("a transiting fleet sitting on top of the pulse origin is minted (mints=%v, err=%v)", mints, err)
	}
	if _, ok, err := Disclose(w, Observer{Position: origin, PassiveRange: PassiveRange}, target, 0); err != nil || ok {
		t.Errorf("a transiting fleet is live-disclosed (ok=%v, err=%v)", ok, err)
	}

	// Transit resolving ends the immunity, from the same geometry.
	target.InLaneTransit = false
	if _, ok, err := Disclose(w, Observer{Position: origin, PassiveRange: PassiveRange}, target, 0); err != nil || !ok {
		t.Errorf("the same fleet is not disclosed once its transit resolves (ok=%v, err=%v)", ok, err)
	}
}

// Scenario: A focused scan finds a chained ship / A clean sweep is itself a
// record / A host beyond focused-scan range cannot be swept / A focused
// scan cannot reach an occluded target (proximity-disclosure › "A Focused
// Scan Reveals the Ships Masked At Its Target", "The Star Occludes Both
// Live Channels and the Focused Scan"). tasks.md 6.9, 5.3.
func TestFocusedScan(t *testing.T) {
	att := fakeAttachments{"ship": "carrier", "carrier": "planet"}
	w := testWorld(att)
	planetPos, err := space.Position(w.Bodies, "planet", 0)
	if err != nil {
		t.Fatalf("resolving the planet: %v", err)
	}
	ships := map[string]Ship{
		"ship":    {Id: "ship", State: parkedAt("ship", planetPos).State, HullCount: 1, HullTypes: []string{"scout"}},
		"carrier": {Id: "carrier", State: parkedAt("carrier", planetPos).State, HullCount: 3, HullTypes: []string{"carrier"}},
	}
	// A scanner just off the planet, well inside FocusedScanRange, on the
	// far side from the star so the sightline is clear.
	scanner := space.Vec3{X: planetPos.X + 10, Y: planetPos.Y, Z: planetPos.Z}

	t.Run("sweeps the whole chain beneath its target", func(t *testing.T) {
		got, err := FocusedScan(w, scanner, "planet", ships, 4_200)
		if err != nil {
			t.Fatalf("FocusedScan: %v", err)
		}
		if len(got) != 2 {
			t.Fatalf("minted %d records, want one for the carrier and one for the ship: %+v", len(got), got)
		}
		seen := map[string]Sighting{}
		for _, s := range got {
			seen[s.TargetId] = s
			if s.AsOf != 4_200 {
				t.Errorf("%s stamped %d, want the resolution time", s.TargetId, s.AsOf)
			}
			if s.HostId != "planet" {
				t.Errorf("%s names host %q, want the swept host", s.TargetId, s.HostId)
			}
		}
		if seen["ship"].HullCount != 1 || seen["carrier"].HullCount != 3 {
			t.Errorf("composition did not reach the records: %+v", seen)
		}
	})

	t.Run("a clean sweep is itself a record", func(t *testing.T) {
		empty := testWorld(fakeAttachments{})
		got, err := FocusedScan(empty, scanner, "planet", map[string]Ship{}, 4_200)
		if err != nil {
			t.Fatalf("FocusedScan: %v", err)
		}
		if len(got) != 1 || !got[0].CleanSweep || got[0].AsOf != 4_200 || got[0].HostId != "planet" {
			t.Errorf("a clean sweep minted %+v, want one clean-sweep record stamped at resolution", got)
		}
	})

	t.Run("is rejected beyond focused-scan range", func(t *testing.T) {
		far := space.Vec3{X: planetPos.X + FocusedScanRange + 1, Y: planetPos.Y, Z: planetPos.Z}
		if _, err := FocusedScan(w, far, "planet", ships, 0); !errors.Is(err, ErrScanOutOfRange) {
			t.Errorf("FocusedScan beyond range returned %v, want ErrScanOutOfRange", err)
		}
		// Exactly at range is permitted: the boundary is closed here too.
		atRange := space.Vec3{X: planetPos.X + FocusedScanRange, Y: planetPos.Y, Z: planetPos.Z}
		if _, err := FocusedScan(w, atRange, "planet", ships, 0); errors.Is(err, ErrScanOutOfRange) {
			t.Error("a host at exactly FocusedScanRange is rejected; the range boundary is closed")
		}
	})

	t.Run("cannot reach through the star", func(t *testing.T) {
		// Just past the star's far limb and still inside FocusedScanRange
		// of the planet, so the rejection can only be the occlusion and not
		// the range test.
		behind := space.Vec3{X: -starSize - 1, Y: planetPos.Y, Z: planetPos.Z}
		if !WithinRange(behind, planetPos, FocusedScanRange) {
			t.Fatal("the construction must keep the host inside focused-scan range, or this asserts the wrong rejection")
		}
		if _, err := FocusedScan(w, behind, "planet", ships, 0); !errors.Is(err, ErrScanOccluded) {
			t.Errorf("FocusedScan through the star returned %v, want ErrScanOccluded", err)
		}
	})
}

// TestSightingsAreAppendOnly (tasks.md 7.3) — a sighting is an immutable
// historical claim, so minting must be the only way one comes into
// existence. There is no store in this capability to police, which is
// exactly why this is asserted at the type: the sighting model that adds a
// store inherits a type with no mutation path rather than a convention.
//
// The check is structural: no function in the package takes a *Sighting, no
// method hangs off Sighting, and no exported name reads as a mutator.
func TestSightingsAreAppendOnly(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", productionFilesOnly, 0)
	if err != nil {
		t.Fatalf("parsing the package: %v", err)
	}
	mutatorPrefixes := []string{"Update", "Delete", "Set", "Save", "Patch", "Invalidate", "Expire"}
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			for _, decl := range file.Decls {
				fn, ok := decl.(*ast.FuncDecl)
				if !ok {
					continue
				}
				pos := fset.Position(fn.Pos()).Line
				if fn.Recv != nil && strings.Contains(exprString(fn.Recv.List[0].Type), "Sighting") {
					t.Errorf("%s:%d: %s hangs off Sighting; the type must carry no mutation path", name, pos, fn.Name.Name)
				}
				for _, prefix := range mutatorPrefixes {
					if strings.HasPrefix(fn.Name.Name, prefix) && strings.Contains(fn.Name.Name, "Sighting") {
						t.Errorf("%s:%d: %s reads as a sighting mutator; a sighting is append-only", name, pos, fn.Name.Name)
					}
				}
				if fn.Type.Params == nil {
					continue
				}
				for _, param := range fn.Type.Params.List {
					if strings.HasPrefix(exprString(param.Type), "*Sighting") {
						t.Errorf("%s:%d: %s takes a *Sighting; a filed claim is never handed out for edit", name, pos, fn.Name.Name)
					}
				}
			}
		}
	}
}

func productionFilesOnly(fi fs.FileInfo) bool { return !strings.HasSuffix(fi.Name(), "_test.go") }

// exprString renders a type expression enough for the structural checks
// above — pointers, selectors, and plain identifiers, which is everything
// this package's signatures use.
func exprString(e ast.Expr) string {
	switch v := e.(type) {
	case *ast.Ident:
		return v.Name
	case *ast.StarExpr:
		return "*" + exprString(v.X)
	case *ast.SelectorExpr:
		return exprString(v.X) + "." + v.Sel.Name
	case *ast.ArrayType:
		return "[]" + exprString(v.Elt)
	case *ast.MapType:
		return "map[" + exprString(v.Key) + "]" + exprString(v.Value)
	default:
		return ""
	}
}

// A masked ship is minted by no ORDINARY scan. The sweep that reaches
// inside a host is FocusedScan, which pays for the privilege in range —
// if a wide scan minted masked ships too, masking would buy nothing and
// the focused scan would have no reason to exist.
func TestScanMints_MaskedShipsNeedAFocusedScan(t *testing.T) {
	att := fakeAttachments{"docked": "planet"}
	w := testWorld(att)
	planetPos, err := space.Position(w.Bodies, "planet", 0)
	if err != nil {
		t.Fatalf("resolving the planet: %v", err)
	}
	origin := space.Vec3{X: planetPos.X + 5, Y: planetPos.Y, Z: planetPos.Z}
	docked := parkedAt("docked", planetPos)

	if mints, err := ScanMints(w, origin, 30, docked, 0); err != nil || mints {
		t.Errorf("a wide scan minted a masked ship (mints=%v, err=%v)", mints, err)
	}

	// Undocked, the same ship at the same place is minted — so this is
	// testing masking and not an accident of the geometry.
	free := parkedAt("free", planetPos)
	if mints, err := ScanMints(w, origin, 30, free, 0); err != nil || !mints {
		t.Errorf("an unmasked ship at the same position is not minted (mints=%v, err=%v)", mints, err)
	}

	// And the focused scan is what reaches it.
	got, err := FocusedScan(w, origin, "planet", map[string]Ship{"docked": docked}, 0)
	if err != nil {
		t.Fatalf("FocusedScan: %v", err)
	}
	if len(got) != 1 || got[0].TargetId != "docked" {
		t.Errorf("FocusedScan minted %+v, want the masked ship", got)
	}
}
