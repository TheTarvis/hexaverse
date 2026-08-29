package system

// The `system` fixture family (openspec pin-system-generation-determinism,
// design.md Decision 5; cross-stack-determinism › "The Golden Fixture
// Reproduces On Every Build Target" and "Recorded Cross-Target Values Live
// In Fixtures, Not Test Constants").
//
// Modeled directly on backend/space/fixtures_test.go's shape: `system` is
// this repo's SECOND Go-sole-authority family (design.md Decision 5 /
// tasks.md 4.1) — no TypeScript mirror, so the build-target matrix asserted
// here is GOARCH=arm64 and GOARCH=amd64 GOAMD64=v1, no JavaScript-runtime
// leg, stated as such in `_meta.jsRuntimeLeg` rather than left as an
// inferable gap.
//
// Recording:  UPDATE_FIXTURES=1 go test ./system/ -run TestFixtures -count=1
// Asserting:  go test ./system/ -run TestFixtures -count=1   (both GOARCH legs)
//
// FOUR families are recorded here, deliberately fewer than the seven link 3
// declared (design.md Decision 5, Non-Goals): `continuousRadius`,
// `starSizeForClass`, and `beltMemberOrbit` are exhaustive (their domains are
// small integer/string enumerations); `interiorElements` is the pinned
// 80-case sweep this change's fix directly touches, reusing
// lattice_identity_test.go's own skeleton/region/seed cross (see
// generate_streams_test.go's interiorElementsSkeletons/-Regions, duplicated
// there rather than imported so this file's compile-ability never depends
// on that file's task-3.6 edit). `keplerPeriodMs`, `gateOrbit`, and
// `stationOrbit` are OUT OF SCOPE here — deferred to link 4
// (migrate-fleet-to-continuous-burns) via fixtures/system/mirror-map.json's
// `inventory` entries (design.md Decision 5, Open Question 1) — this file
// does not record them and must not claim to.
//
// RED STATE: fixtures/system/cases.json does not exist yet (this change has
// not recorded it — Decision 3/7: recording happens only AFTER the fix
// lands and lattice_identity_test.go's golden constant is deleted, never
// before). TestFixtures_MatchGolden therefore fails with a file-not-found
// error by design, independent of whether generateWithStreams exists yet.
// The interiorElements family additionally fails to COMPILE until
// generateWithStreams exists (same reason generate_streams_test.go does).

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"hash"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"hexaverse/space"
)

// fixturesPath is the repo-root fixture file this suite owns.
const systemFixturesPath = "../../fixtures/system/cases.json"

// jsRuntimeLegStatement is the explicit, constant record that this family
// has no JavaScript-runtime leg (cross-stack-determinism: "A Go-only fixture
// family has no JavaScript-runtime leg by design").
const systemJSRuntimeLegStatement = "none — backend/system is Go-sole-authority with no TypeScript mirror by design (design.md Decision 5); this family is asserted only across the Go build-target matrix"

// --- canonical serialization -------------------------------------------------

// num is a float64 recorded in its lossless binary-exponent form — the same
// convention backend/space/fixtures_test.go and backend/polar/fixtures_test.go
// use, so a last-ULP cross-target divergence is representable at all (a
// decimal serialization cannot express it).
type num string

func fnum(v float64) num { return num(strconv.FormatFloat(v, 'b', -1, 64)) }

// sweepHash accumulates a newline-joined preimage incrementally (no
// trailing newline) — identical convention to backend/space/polar.
type sweepHash struct {
	h     hash.Hash
	lines int
}

func newSweepHash() *sweepHash { return &sweepHash{h: sha256.New()} }

func (s *sweepHash) line(l string) {
	if s.lines > 0 {
		s.h.Write([]byte{'\n'})
	}
	s.h.Write([]byte(l))
	s.lines++
}

func (s *sweepHash) sum() string { return hex.EncodeToString(s.h.Sum(nil)) }

func sline(parts ...string) string { return strings.Join(parts, ",") }

// --- family: continuousRadius (exhaustive, index [0,64]) --------------------

type continuousRadiusCase struct {
	Note  string `json:"note"`
	Index int    `json:"index"`
	Out   num    `json:"out"`
}

type exhaustiveSweep struct {
	Domain        string `json:"domain"`
	Serialization string `json:"serialization"`
	Lines         int    `json:"lines"`
	Digest        string `json:"digest"`
}

func handContinuousRadius() []continuousRadiusCase {
	inputs := []struct {
		note string
		idx  int
	}{
		{"index 0 is BaseOrbitRadius itself, undoubled", 0},
		{"index 1, the first geometric step", 1},
		{"an arbitrary interior index", 11},
		{"the largest index this sweep's domain names", 64},
	}
	out := make([]continuousRadiusCase, 0, len(inputs))
	for _, in := range inputs {
		out = append(out, continuousRadiusCase{Note: in.note, Index: in.idx, Out: fnum(ContinuousRadius(in.idx))})
	}
	return out
}

func sweepContinuousRadius() (int, string) {
	sh := newSweepHash()
	for idx := 0; idx <= 64; idx++ {
		sh.line(sline(strconv.Itoa(idx), string(fnum(ContinuousRadius(idx)))))
	}
	return sh.lines, sh.sum()
}

// --- family: starSizeForClass (exhaustive, O B A F G K M + unrecognized) ---

type starSizeCase struct {
	Note  string `json:"note"`
	Class string `json:"class"`
	Out   num    `json:"out"`
}

var starSizeClasses = []string{"O", "B", "A", "F", "G", "K", "M", "Z-unrecognized"}

func handStarSizeForClass() []starSizeCase {
	inputs := []struct {
		note  string
		class string
	}{
		{"the largest named star size, class O", "O"},
		{"the smallest named star size, class M", "M"},
		{"an unrecognized class falls back to the named default", "Z-unrecognized"},
	}
	out := make([]starSizeCase, 0, len(inputs))
	for _, in := range inputs {
		out = append(out, starSizeCase{Note: in.note, Class: in.class, Out: fnum(StarSize(in.class))})
	}
	return out
}

func sweepStarSizeForClass() (int, string) {
	sh := newSweepHash()
	for _, class := range starSizeClasses {
		sh.line(sline(class, string(fnum(StarSize(class)))))
	}
	return sh.lines, sh.sum()
}

// --- family: beltMemberOrbit (exhaustive, feat-belt-0..7 x k in [0,8)) -----

type beltMemberOrbitCase struct {
	Note   string `json:"note"`
	BeltId string `json:"beltId"`
	K      int    `json:"k"`
	Out    string `json:"out"` // canonical: id,size,parentId,radius,periodMs,phase,inclination,node
}

// beltFixture is the ONE representative belt Space/Width this family holds
// constant across all 8 synthetic belt ids — only the belt id and member
// index k vary, which is exactly what beltMemberOrbit's own derivation
// (fnv1a64(belt.Id) salted by k) is a function of; the shared radius/width/
// parent/period/node/inclination contribute a constant baseline every
// member case shares.
func beltMemberFixtureBelt(id string) Feature {
	return Feature{
		Id:    id,
		Width: 6.0,
		Space: &space.Orbit{
			ParentId: "feat-star", Radius: 100.0, PeriodMs: 50_000,
			Node: 12345, Inclination: 200,
		},
	}
}

func lineForBeltMember(beltId string, k int) string {
	f := beltMemberFixtureBelt(beltId)
	m := beltMemberOrbit(f, k)
	orb := m.Orbit
	return sline(m.Id, string(fnum(m.Size)), orb.ParentId, string(fnum(orb.Radius)),
		strconv.FormatInt(int64(orb.PeriodMs), 10), strconv.FormatInt(int64(orb.Phase), 10),
		strconv.FormatInt(int64(orb.Inclination), 10), strconv.FormatInt(int64(orb.Node), 10))
}

func handBeltMemberOrbit() []beltMemberOrbitCase {
	inputs := []struct {
		note   string
		beltId string
		k      int
	}{
		{"belt 0's first member", "feat-belt-0", 0},
		{"belt 0's last member", "feat-belt-0", AsteroidsPerBelt - 1},
		{"belt 7's first member", "feat-belt-7", 0},
		{"belt 7's last member", "feat-belt-7", AsteroidsPerBelt - 1},
	}
	out := make([]beltMemberOrbitCase, 0, len(inputs))
	for _, in := range inputs {
		out = append(out, beltMemberOrbitCase{Note: in.note, BeltId: in.beltId, K: in.k, Out: lineForBeltMember(in.beltId, in.k)})
	}
	return out
}

func sweepBeltMemberOrbit() (int, string) {
	sh := newSweepHash()
	for b := 0; b < 8; b++ {
		beltId := "feat-belt-" + strconv.Itoa(b)
		for k := 0; k < AsteroidsPerBelt; k++ {
			sh.line(lineForBeltMember(beltId, k))
		}
	}
	return sh.lines, sh.sum()
}

// --- family: interiorElements (the 80-case sweep this change's fix touches)

type interiorElementsCase struct {
	Note              string `json:"note"`
	Seed              int64  `json:"seed"`
	Region            string `json:"region"`
	LatticeProjection string `json:"latticeProjection"`
	ContinuousLine    string `json:"continuousLine"`
	LatticeDrawCount  int64  `json:"latticeDrawCount"`
}

// computeInteriorElementsCase runs the INSTRUMENTED generator (design.md
// Decision 2, point 5 / tasks.md 3.5): the recorded draw count and the
// recorded projection come from the SAME instrumented run, and
// generate_streams_test.go's TestGenerate_Scenario_
// InstrumentedLatticeStreamMatchesUninstrumentedProjection is what proves
// that instrumenting changes nothing about the projection this case also
// records.
func computeInteriorElementsCase(t testing.TB, in interiorElementsCaseInput) interiorElementsCase {
	t.Helper()
	var count int64
	gen := generateWithStreams(in.Seed, newCountingRand(in.Seed, &count), newRand(continuousSeed(in.Seed)), in.Region, in.Skeleton, DefaultParams())
	return interiorElementsCase{
		Seed:              in.Seed,
		Region:            in.Region,
		LatticeProjection: projectionJSON(t, gen),
		ContinuousLine:    continuousElementsLineOf(gen),
		LatticeDrawCount:  count,
	}
}

func recordInteriorElements(t testing.TB) ([]interiorElementsCase, int, string) {
	t.Helper()
	inputs := interiorElementsInputs()
	out := make([]interiorElementsCase, 0, len(inputs))
	sh := newSweepHash()
	for i, in := range inputs {
		c := computeInteriorElementsCase(t, in)
		c.Note = "case " + strconv.Itoa(i) + " of the reused lattice-identity 80-case cross"
		out = append(out, c)
		sh.line(sline(c.LatticeProjection, c.ContinuousLine, strconv.FormatInt(c.LatticeDrawCount, 10)))
	}
	return out, sh.lines, sh.sum()
}

// --- the file ----------------------------------------------------------------

type systemFixtureMeta struct {
	GeneratedOn       systemGeneratedOn `json:"generatedOn"`
	BuildTargetMatrix string            `json:"buildTargetMatrix"`
	JSRuntimeLeg      string            `json:"jsRuntimeLeg"`
	Serialization     string            `json:"serialization"`
}

type systemGeneratedOn struct {
	GOARCH  string `json:"goarch"`
	GOAMD64 string `json:"goamd64,omitempty"`
}

type systemFixtures struct {
	Meta *systemFixtureMeta `json:"_meta,omitempty"`

	ContinuousRadius      []continuousRadiusCase `json:"continuousRadius"`
	ContinuousRadiusSweep exhaustiveSweep        `json:"continuousRadiusSweep"`

	StarSizeForClass      []starSizeCase  `json:"starSizeForClass"`
	StarSizeForClassSweep exhaustiveSweep `json:"starSizeForClassSweep"`

	BeltMemberOrbit      []beltMemberOrbitCase `json:"beltMemberOrbit"`
	BeltMemberOrbitSweep exhaustiveSweep       `json:"beltMemberOrbitSweep"`

	InteriorElements      []interiorElementsCase `json:"interiorElements"`
	InteriorElementsSweep exhaustiveSweep        `json:"interiorElementsSweep"`
}

func computeSystemFixtures(t testing.TB) systemFixtures {
	t.Helper()
	crLines, crDigest := sweepContinuousRadius()
	ssLines, ssDigest := sweepStarSizeForClass()
	bmLines, bmDigest := sweepBeltMemberOrbit()
	ieCases, ieLines, ieDigest := recordInteriorElements(t)

	return systemFixtures{
		ContinuousRadius: handContinuousRadius(),
		ContinuousRadiusSweep: exhaustiveSweep{
			Domain: "index in [0, 64]", Serialization: "index,out (out is strconv.FormatFloat(v,'b',-1,64))",
			Lines: crLines, Digest: crDigest,
		},
		StarSizeForClass: handStarSizeForClass(),
		StarSizeForClassSweep: exhaustiveSweep{
			Domain: "class in {O,B,A,F,G,K,M,Z-unrecognized}", Serialization: "class,out",
			Lines: ssLines, Digest: ssDigest,
		},
		BeltMemberOrbit: handBeltMemberOrbit(),
		BeltMemberOrbitSweep: exhaustiveSweep{
			Domain: "beltId in {feat-belt-0..feat-belt-7} x k in [0, AsteroidsPerBelt)", Serialization: "id,size,parentId,radius,periodMs,phase,inclination,node",
			Lines: bmLines, Digest: bmDigest,
		},
		InteriorElements: ieCases,
		InteriorElementsSweep: exhaustiveSweep{
			Domain:        "the reused lattice-identity 80-case cross (4 skeletons x 4 regions x 5 seeds)",
			Serialization: "latticeProjection (canonical JSON),continuousLine (canonical JSON),latticeDrawCount",
			Lines:         ieLines, Digest: ieDigest,
		},
	}
}

func TestFixtures_MatchGolden(t *testing.T) {
	computed := computeSystemFixtures(t)

	if os.Getenv("UPDATE_FIXTURES") == "1" {
		computed.Meta = &systemFixtureMeta{
			GeneratedOn:       systemGeneratedOn{GOARCH: runtime.GOARCH, GOAMD64: os.Getenv("GOAMD64")},
			BuildTargetMatrix: "GOARCH=arm64 and GOARCH=amd64 with GOAMD64=v1",
			JSRuntimeLeg:      systemJSRuntimeLegStatement,
			Serialization:     "every recorded float OUTPUT value is strconv.FormatFloat(v, 'b', -1, 64); inputs are plain JSON numbers/strings",
		}
		if err := os.MkdirAll(filepath.Dir(systemFixturesPath), 0o755); err != nil {
			t.Fatal(err)
		}
		data, err := json.MarshalIndent(computed, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(systemFixturesPath, append(data, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Logf("wrote fixtures to %s", systemFixturesPath)
		return
	}

	raw, err := os.ReadFile(systemFixturesPath)
	if err != nil {
		t.Fatalf("read golden fixtures (regenerate with UPDATE_FIXTURES=1, only AFTER the fix in generator.go lands — recording before the fix freezes arm64's fused answers into the contract, design.md Decision 3): %v", err)
	}
	var golden systemFixtures
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatalf("unmarshal golden: %v", err)
	}
	// _meta records where the file was RECORDED; this assert runs on every
	// leg of the build-target matrix, so the stamp must not participate.
	golden.Meta = nil

	if !reflect.DeepEqual(golden, computed) {
		reportSystemFixtureDrift(t, golden, computed)
		t.Fatal("system output drifted from committed /fixtures/system/cases.json — " +
			"if intentional, regenerate with UPDATE_FIXTURES=1 and review the diff")
	}
}

// reportSystemFixtureDrift names the family (or families) that drifted, so
// a failure points at a function rather than an unreadable struct dump.
func reportSystemFixtureDrift(t *testing.T, golden, computed systemFixtures) {
	t.Helper()
	gv, cv := reflect.ValueOf(golden), reflect.ValueOf(computed)
	typ := gv.Type()
	for i := 0; i < typ.NumField(); i++ {
		name := typ.Field(i).Name
		if name == "Meta" {
			continue
		}
		if !reflect.DeepEqual(gv.Field(i).Interface(), cv.Field(i).Interface()) {
			t.Errorf("family %q drifted from the committed fixture", typ.Field(i).Tag.Get("json"))
		}
	}
}

// TestFixtures_NoJavaScriptLegIsRecorded pins the Go-only branch of
// cross-stack-determinism's "The Golden Fixture Reproduces On Every Build
// Target": the absence of a JavaScript-runtime leg for this family must be
// a STATED choice in the file, not an apparent gap.
func TestFixtures_NoJavaScriptLegIsRecorded(t *testing.T) {
	raw, err := os.ReadFile(systemFixturesPath)
	if err != nil {
		t.Fatalf("read golden fixtures: %v", err)
	}
	var f systemFixtures
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("unmarshal golden: %v", err)
	}
	if f.Meta == nil {
		t.Fatal("fixtures/system/cases.json has no _meta block — it must record its recording provenance and its no-JS-leg statement")
	}
	if f.Meta.GeneratedOn.GOARCH == "" {
		t.Error("_meta.generatedOn.goarch is empty — the fixture must record the build target it was recorded on")
	}
	if f.Meta.JSRuntimeLeg != systemJSRuntimeLegStatement {
		t.Errorf("_meta.jsRuntimeLeg = %q, want the recorded no-JS-leg statement %q", f.Meta.JSRuntimeLeg, systemJSRuntimeLegStatement)
	}
	if !strings.Contains(f.Meta.BuildTargetMatrix, "arm64") || !strings.Contains(f.Meta.BuildTargetMatrix, "amd64") {
		t.Errorf("_meta.buildTargetMatrix = %q, want both Go legs named", f.Meta.BuildTargetMatrix)
	}
}
