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
// the shared 80-case skeleton/region/seed cross (see
// generate_streams_test.go's interiorElementsSkeletons/-Regions, duplicated
// there rather than imported so this file's compile-ability never depends
// on that file's task-3.6 edit). `keplerPeriodMs`, `gateOrbit`, and
// `stationOrbit` are OUT OF SCOPE here — deferred to link 4
// (migrate-fleet-to-continuous-burns) via fixtures/system/mirror-map.json's
// `inventory` entries (design.md Decision 5, Open Question 1) — this file
// does not record them and must not claim to.
//
// RECORDING: fixtures/system/cases.json is rewritten in place by
// `UPDATE_FIXTURES=1 go test ./system/ -run TestFixtures -count=1`, and only
// ever after the generation change it records has landed — never before.
// A recording must reproduce byte-for-byte on both Go build targets
// (GOARCH=arm64 and GOARCH=amd64 GOAMD64=v1) before it is committed.

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

	"hexaverse/galaxy"
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
// convention backend/space/fixtures_test.go uses, so a last-ULP cross-target
// divergence is representable at all (a decimal serialization cannot express
// it).
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

// --- pinned randomized sweep infrastructure (openspec
// migrate-fleet-to-continuous-burns, link 4, tasks.md 1.1-1.3) -------------
//
// keplerPeriodMs, gateOrbit, and stationOrbit are pure functions over
// domains not enumerable within cross-stack-determinism's 10^6 bound (a
// continuous radius; a pair of galaxy coordinates plus an extent; a galaxy
// seed/system id/skeleton triple), so each carries a PINNED RANDOMIZED
// SWEEP: a splitmix64 PRNG on an integer state (pure integer arithmetic, so
// the drawn inputs are exactly reproducible on every build target), a named
// integer seed, a named input box per drawn coordinate, a case count, and a
// SHA-256 digest over the newline-joined canonical serialization of the
// function's output in draw order — the identical convention
// backend/space/fixtures_test.go established as this repo's first
// Go-sole-authority instance.

// sweepAxis names one drawn coordinate and the box (or, for a
// non-numeric draw, a prose note) it is drawn from, in the order the
// generator's words are consumed.
type sweepAxis struct {
	Name string  `json:"name"`
	Kind string  `json:"kind"` // "float" | "int" | "string"
	Lo   float64 `json:"lo,omitempty"`
	Hi   float64 `json:"hi,omitempty"`
	Note string  `json:"note,omitempty"`
}

func ax(name string, lo, hi float64) sweepAxis { return sweepAxis{Name: name, Kind: "float", Lo: lo, Hi: hi} }
func iax(name string, lo, hi int64) sweepAxis {
	return sweepAxis{Name: name, Kind: "int", Lo: float64(lo), Hi: float64(hi)}
}
func sax(name, note string) sweepAxis { return sweepAxis{Name: name, Kind: "string", Note: note} }

// randomSweep is one family's pinned randomized-sweep case.
type randomSweep struct {
	Note          string      `json:"note"`
	PRNG          string      `json:"prng"`
	Seed          int64       `json:"seed"`
	DrawMapping   string      `json:"drawMapping"`
	Draws         []sweepAxis `json:"draws"`
	Count         int         `json:"count"`
	Serialization string      `json:"serialization"`
	Lines         int         `json:"lines"`
	Digest        string      `json:"digest"`
}

// sysSweepSeed is this file's one pinned integer seed for every randomized
// family below — distinct from backend/space's own sweepSeed (a different
// package, a different generator instance; sharing a seed VALUE across
// packages carries no meaning and no risk).
const sysSweepSeed int64 = 20260830

// sysSweepRNG is splitmix64 on a uint64 state — identical algorithm to
// backend/space/fixtures_test.go's sweepRNG, duplicated here (not imported)
// because it is a test-only, package-private fixture-recording detail, not
// a shared production dependency.
type sysSweepRNG struct{ state uint64 }

func newSysSweepRNG(seed int64) *sysSweepRNG { return &sysSweepRNG{state: uint64(seed)} }

func (r *sysSweepRNG) word() uint64 {
	r.state += 0x9E3779B97F4A7C15
	z := r.state
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	return z ^ (z >> 31)
}

// unit maps one generator word onto [0,1) by the pinned exact form
// float64(u >> 11) * 0x1p-53 — a power-of-two scale, so the product is
// exact and no rounding mode or contraction can reach it.
func (r *sysSweepRNG) unit() float64 { return float64(float64(r.word()>>11) * 0x1p-53) }

// box maps the next generator word onto [lo, hi) by the pinned form
// lo + float64(f*(hi-lo)), with the product explicitly float64(...)-guarded
// so no fused multiply-add can reach a drawn coordinate on a contracting
// build target.
func (r *sysSweepRNG) box(lo, hi float64) float64 { return lo + float64(r.unit()*(hi-lo)) }

// ibox maps the next generator word onto the integers [lo, hi] by
// truncating the same guarded product.
func (r *sysSweepRNG) ibox(lo, hi int64) int64 {
	v := lo + int64(float64(r.unit()*float64(hi-lo+1)))
	if v > hi {
		v = hi
	}
	return v
}

const sysDrawMapping = "u = float64(word >> 11) * 0x1p-53; float axis = lo + float64(u*(hi-lo)); int axis = lo + int64(float64(u*float64(hi-lo+1))), clamped to hi; a string axis draws an int index into a named, finite choice list"

const sysSerFloats = "strconv.FormatFloat(v, 'b', -1, 64), components joined by ','"

const sysSerMixed = "integers in decimal, floats as strconv.FormatFloat(v, 'b', -1, 64), strings verbatim, components joined by ','"

func sysRandSweep(note string, axes []sweepAxis, count, lines int, digest, serialization string) []randomSweep {
	return []randomSweep{{
		Note: note, PRNG: "splitmix64", Seed: sysSweepSeed, DrawMapping: sysDrawMapping,
		Draws: axes, Count: count, Serialization: serialization, Lines: lines, Digest: digest,
	}}
}

// --- family: keplerPeriodMs (pinned randomized sweep, tasks.md 1.1) --------
//
// keplerPeriodMs's domain is nominally all of R^1 (its signature admits any
// float64 radius), but the swept box below is deliberately [0, 1e9] — the
// full range of NON-NEGATIVE radii "not just the radii generation happens
// to produce" (generation never places a star-parented body beyond a few
// hundred units), stated explicitly here rather than silently.
//
// A NEGATIVE radius is EXCLUDED from this pinned family, and that exclusion
// is a reported production defect, not an oversight: for radius < 0,
// ratio := radius/KeplerBaseRadius is negative, math.Sqrt(ratio) is NaN,
// and converting that NaN to int64 (continuous.go:98's `int64(ms)`, inside
// common.WorldMillis(...)) is IMPLEMENTATION-DEPENDENT per the Go spec —
// verified empirically on this machine: keplerPeriodMs(-40) returns
// WorldMillis(0) compiled for GOARCH=arm64 and WorldMillis(-9223372036854775808)
// compiled for GOARCH=amd64/GOAMD64=v1. That is exactly the hazard class
// cross-stack-determinism's "Rule-Bearing Values Are Reproducible Across
// Build Targets of the Same Language" forbids, and exactly the class
// design.md's own task 4.11 names for a different function (commanded
// acceleration) — this is a second, pre-existing instance of it, discovered
// by this task's "full R^1 domain" instruction (an SDET-added boundary
// probe, not a literal scenario). It is NOT baked into the committed
// fixture (a fixture whose recorded case is not byte-identical across both
// Go build targets is never merged, per cross-stack-determinism's own "A
// contraction-dependent case fails a target in the matrix" scenario) and is
// reported to the orchestrator/developer rather than silently worked
// around; the likely fix mirrors task 4.11's pattern (reject or clamp a
// non-positive/non-finite radius before it reaches math.Sqrt).
type keplerPeriodMsCase struct {
	Note   string `json:"note"`
	Radius num    `json:"radius"`
	OutMs  int64  `json:"outMs"`
}

func handKeplerPeriodMs() []keplerPeriodMsCase {
	inputs := []struct {
		note   string
		radius float64
	}{
		{"radius equal to KeplerBaseRadius — ratio 1, the law's own reference point", KeplerBaseRadius},
		{"radius zero — a degenerate orbit; ratio 0, sqrt 0, seconds 0, clamped to the 1ms floor (well-behaved: no NaN)", 0},
		{"the smallest radius generation ever actually places a star-parented body at (idx 0)", BaseOrbitRadius},
		{"a radius far below anything generation produces", 1e-6},
		{"a radius far above anything generation produces, well short of the seconds*1000 overflow-to-+Inf threshold (~1e203)", 1_000_000_000},
		{"an arbitrary interior radius", 137.5},
	}
	out := make([]keplerPeriodMsCase, 0, len(inputs))
	for _, in := range inputs {
		out = append(out, keplerPeriodMsCase{Note: in.note, Radius: fnum(in.radius), OutMs: int64(keplerPeriodMs(in.radius))})
	}
	return out
}

var keplerPeriodMsAxes = []sweepAxis{ax("radius", 0, 1_000_000_000)}

func sweepKeplerPeriodMs(n int) (int, string) {
	r := newSysSweepRNG(sysSweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		radius := r.box(0, 1_000_000_000)
		sh.line(strconv.FormatInt(int64(keplerPeriodMs(radius)), 10))
	}
	return sh.lines, sh.sum()
}

// --- family: gateOrbit (pinned randomized sweep, tasks.md 1.2) -------------

type gateOrbitCase struct {
	Note   string     `json:"note"`
	From   [3]float64 `json:"from"`
	To     [3]float64 `json:"to"`
	Extent float64    `json:"extent"`
	Out    string     `json:"out"` // canonical: parentId,radius,periodMs,phase,inclination,node
}

func coordsOf(x, y, z float64) galaxy.Coords { return galaxy.Coords{X: x, Y: y, Z: z} }

func lineForGateOrbit(from, to galaxy.Coords, extent float64) string {
	o := gateOrbit(from, to, extent)
	return sline(o.ParentId, string(fnum(o.Radius)), strconv.FormatInt(int64(o.PeriodMs), 10),
		strconv.FormatInt(int64(o.Phase), 10), strconv.FormatInt(int64(o.Inclination), 10), strconv.FormatInt(int64(o.Node), 10))
}

func handGateOrbit() []gateOrbitCase {
	inputs := []struct {
		note        string
		from, to    galaxy.Coords
		extent      float64
	}{
		{"a zero horizontal projection resolves to the named default phase index", coordsOf(0, 0, 0), coordsOf(0, 0, 0), 500},
		{"elevation (Z, the coordinate's third component) is dropped — only X/Y (the horizontal plane) resolves the bearing", coordsOf(0, 0, 0), coordsOf(30, 40, 999), 500},
		{"an exact tie (straight along the table's index-0 direction) resolves to the documented lower index", coordsOf(0, 0, 0), coordsOf(100, 0, 0), 500},
		{"a negative-quadrant bearing", coordsOf(10, 10, 0), coordsOf(-90, -40, 0), 200},
		{"a large extent", coordsOf(0, 0, 0), coordsOf(500, -500, 0), 5000},
		{"a tiny extent", coordsOf(0, 0, 0), coordsOf(1, 1, 0), 0.001},
		{"a fractional, non-integer bearing", coordsOf(3.5, -7.25, 12), coordsOf(-4.125, 9.75, -3), 733.5},
	}
	out := make([]gateOrbitCase, 0, len(inputs))
	for _, in := range inputs {
		out = append(out, gateOrbitCase{
			Note: in.note, From: [3]float64{in.from.X, in.from.Y, in.from.Z}, To: [3]float64{in.to.X, in.to.Y, in.to.Z},
			Extent: in.extent, Out: lineForGateOrbit(in.from, in.to, in.extent),
		})
	}
	return out
}

var gateOrbitAxes = []sweepAxis{
	ax("from.x", -2000, 2000), ax("from.y", -2000, 2000), ax("from.z", -2000, 2000),
	ax("to.x", -2000, 2000), ax("to.y", -2000, 2000), ax("to.z", -2000, 2000),
	ax("extent", 1, 5000),
}

func sweepGateOrbit(n int) (int, string) {
	r := newSysSweepRNG(sysSweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		from := coordsOf(r.box(-2000, 2000), r.box(-2000, 2000), r.box(-2000, 2000))
		to := coordsOf(r.box(-2000, 2000), r.box(-2000, 2000), r.box(-2000, 2000))
		extent := r.box(1, 5000)
		sh.line(lineForGateOrbit(from, to, extent))
	}
	return sh.lines, sh.sum()
}

// --- family: stationOrbit (pinned randomized sweep, tasks.md 1.3) ----------
//
// Covers StationContinuousOrbit and its two callees, MaxFeatureSize and
// inclinationForDominant, neither of which has any other family.

var stationBodyTypeChoices = []galaxy.BodyType{
	galaxy.BodyRocky, galaxy.BodyGasGiant, galaxy.BodyIce,
	galaxy.BodyMoltenz, galaxy.BodyOceanic, galaxy.BodyBarrenz,
}

func skeletonOf(types []galaxy.BodyType) galaxy.Skeleton {
	bodies := make([]galaxy.Body, len(types))
	for i, t := range types {
		bodies[i] = galaxy.Body{Type: t, Ring: i}
	}
	return galaxy.Skeleton{StarClass: "G", Bodies: bodies}
}

func lineForStationOrbit(galaxySeed int64, systemId string, skeleton galaxy.Skeleton) string {
	o := StationContinuousOrbit(galaxySeed, systemId, skeleton)
	return sline(o.ParentId, string(fnum(o.Radius)), strconv.FormatInt(int64(o.PeriodMs), 10),
		strconv.FormatInt(int64(o.Phase), 10), strconv.FormatInt(int64(o.Inclination), 10), strconv.FormatInt(int64(o.Node), 10))
}

type stationOrbitCase struct {
	Note       string   `json:"note"`
	GalaxySeed int64    `json:"galaxySeed"`
	SystemId   string   `json:"systemId"`
	BodyTypes  []string `json:"bodyTypes"`
	Out        string   `json:"out"` // canonical: parentId,radius,periodMs,phase,inclination,node
}

func handStationOrbit() []stationOrbitCase {
	inputs := []struct {
		note       string
		galaxySeed int64
		systemId   string
		types      []galaxy.BodyType
	}{
		{"an empty skeleton falls back to a star-parented orbit at the configured fallback radius (unreachable in production today — MinBodies=1 — but a named branch)", 1, "sys-0", nil},
		{"a single-body skeleton — the mix64-derived parent index is always 0", 42, "sys-1", []galaxy.BodyType{galaxy.BodyRocky}},
		{"a gas-giant parent draws the largest type-keyed size ceiling", 7, "sys-2", []galaxy.BodyType{galaxy.BodyGasGiant}},
		{"a multi-body skeleton exercises the mix64-derived parent selection", 12345, "sys-3", []galaxy.BodyType{galaxy.BodyRocky, galaxy.BodyIce, galaxy.BodyGasGiant, galaxy.BodyOceanic}},
		{"a different system id with the same galaxy seed and skeleton selects independently — SystemSeed mixes the id into the hash", 12345, "sys-4", []galaxy.BodyType{galaxy.BodyRocky, galaxy.BodyIce, galaxy.BodyGasGiant, galaxy.BodyOceanic}},
		{"a negative galaxy seed", -9_876_543_210, "sys-5", []galaxy.BodyType{galaxy.BodyMoltenz, galaxy.BodyBarrenz}},
		{"a zero galaxy seed", 0, "sys-6", []galaxy.BodyType{galaxy.BodyOceanic}},
	}
	out := make([]stationOrbitCase, 0, len(inputs))
	for _, in := range inputs {
		sk := skeletonOf(in.types)
		names := make([]string, len(in.types))
		for i, t := range in.types {
			names[i] = string(t)
		}
		out = append(out, stationOrbitCase{
			Note: in.note, GalaxySeed: in.galaxySeed, SystemId: in.systemId, BodyTypes: names,
			Out: lineForStationOrbit(in.galaxySeed, in.systemId, sk),
		})
	}
	return out
}

var stationOrbitAxes = []sweepAxis{
	iax("galaxySeed", -1<<40, 1<<40),
	sax("systemId", "one of 12 synthetic ids sys-0..sys-11, selected by an int draw"),
	iax("bodyCount", 1, 8),
	sax("bodyTypes[i]", "each of bodyCount draws one of the 6 galaxy.BodyType values, in order"),
}

func sweepStationOrbit(n int) (int, string) {
	r := newSysSweepRNG(sysSweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		galaxySeed := r.ibox(-1<<40, 1<<40)
		systemId := "sys-" + strconv.FormatInt(r.ibox(0, 11), 10)
		count := int(r.ibox(1, 8))
		types := make([]galaxy.BodyType, count)
		for j := 0; j < count; j++ {
			types[j] = stationBodyTypeChoices[r.ibox(0, int64(len(stationBodyTypeChoices))-1)]
		}
		sh.line(lineForStationOrbit(galaxySeed, systemId, skeletonOf(types)))
	}
	return sh.lines, sh.sum()
}

// --- family: interiorElements (the 80-case sweep this change's fix touches)

type interiorElementsCase struct {
	Note           string `json:"note"`
	Seed           int64  `json:"seed"`
	Region         string `json:"region"`
	ContinuousLine string `json:"continuousLine"`
}

// computeInteriorElementsCase records one case of the sweep: the canonical
// rendering of every generated body's orbital element set, size and width.
//
// It used to record two further components — a projection of the retired
// second placement tier, and the number of words the primary RNG stream
// consumed under an instrumented run. Both measured that tier's independence
// from the continuous stream, a requirement removed with the tier itself, so
// this family is recorded over its surviving continuousLine component alone.
func computeInteriorElementsCase(t testing.TB, in interiorElementsCaseInput) interiorElementsCase {
	t.Helper()
	gen := Generate(in.Seed, in.Region, in.Skeleton, DefaultParams())
	return interiorElementsCase{
		Seed:           in.Seed,
		Region:         in.Region,
		ContinuousLine: continuousElementsLineOf(gen),
	}
}

func recordInteriorElements(t testing.TB) ([]interiorElementsCase, int, string) {
	t.Helper()
	inputs := interiorElementsInputs()
	out := make([]interiorElementsCase, 0, len(inputs))
	sh := newSweepHash()
	for i, in := range inputs {
		c := computeInteriorElementsCase(t, in)
		c.Note = "case " + strconv.Itoa(i) + " of the 80-case skeleton x region x seed cross"
		out = append(out, c)
		sh.line(sline(c.ContinuousLine))
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

	KeplerPeriodMs      []keplerPeriodMsCase `json:"keplerPeriodMs"`
	KeplerPeriodMsSweep []randomSweep        `json:"keplerPeriodMsSweep"`

	GateOrbit      []gateOrbitCase `json:"gateOrbit"`
	GateOrbitSweep []randomSweep   `json:"gateOrbitSweep"`

	StationOrbit      []stationOrbitCase `json:"stationOrbit"`
	StationOrbitSweep []randomSweep      `json:"stationOrbitSweep"`
}

// sysSweepCount is the case count for keplerPeriodMs/gateOrbit/stationOrbit's
// randomized sweeps — each case is O(1)-to-cheap (a handful of arithmetic
// ops or, for stationOrbit, up to 8 body-type draws), so all three run at
// the same count backend/space's own "cheap" families use.
const sysSweepCount = 100_000

func computeSystemFixtures(t testing.TB) systemFixtures {
	t.Helper()
	crLines, crDigest := sweepContinuousRadius()
	ssLines, ssDigest := sweepStarSizeForClass()
	bmLines, bmDigest := sweepBeltMemberOrbit()
	ieCases, ieLines, ieDigest := recordInteriorElements(t)
	kpLines, kpDigest := sweepKeplerPeriodMs(sysSweepCount)
	goLines, goDigest := sweepGateOrbit(sysSweepCount)
	soLines, soDigest := sweepStationOrbit(sysSweepCount)

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
			Domain:        "the 80-case skeleton x region x seed cross (4 skeletons x 4 regions x 5 seeds)",
			Serialization: "continuousLine (canonical JSON)",
			Lines:         ieLines, Digest: ieDigest,
		},

		KeplerPeriodMs: handKeplerPeriodMs(),
		KeplerPeriodMsSweep: sysRandSweep(
			"a non-negative radius drawn from [0, 1e9] — the full range of radii a physical distance can take, well beyond anything generation produces, EXCLUDING radius < 0 (a reported, pre-existing cross-build-target divergence via NaN->int64 conversion; see the family's own doc comment above handKeplerPeriodMs)",
			keplerPeriodMsAxes, sysSweepCount, kpLines, kpDigest, sysSerMixed),

		GateOrbit: handGateOrbit(),
		GateOrbitSweep: sysRandSweep(
			"two independently drawn galaxy.Coords (from, to) and an extent, all from generous boxes; the output is the derived orbit's parentId/radius/periodMs/phase/inclination/node",
			gateOrbitAxes, sysSweepCount, goLines, goDigest, sysSerMixed),

		StationOrbit: handStationOrbit(),
		StationOrbitSweep: sysRandSweep(
			"a galaxy seed, a synthetic system id (one of 12), and a skeleton of 1-8 independently drawn galaxy.BodyType values; the output is the derived station orbit's parentId/radius/periodMs/phase/inclination/node",
			stationOrbitAxes, sysSweepCount, soLines, soDigest, sysSerMixed),
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
