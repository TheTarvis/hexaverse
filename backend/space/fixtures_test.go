package space

// The `space` golden fixture family (openspec add-space-kinematics,
// tasks.md section 3; cross-stack-determinism › "Shared Board Math Is
// Pinned By a Cross-Language Golden Fixture" and "The Golden Fixture
// Reproduces On Every Build Target").
//
// This is the repo's FIRST Go-sole-authority family: there is no
// TypeScript mirror of backend/space and there never will be (design.md
// Decision 1), so the build-target matrix this file is asserted on is
// `GOARCH=arm64` and `GOARCH=amd64 GOAMD64=v1` — and NO JavaScript-runtime
// leg, recorded as a stated choice in `_meta.jsRuntimeLeg` rather than left
// as a gap a reader has to infer (cross-stack-determinism › "A Go-only
// fixture family has no JavaScript-runtime leg by design").
//
// Recording:  UPDATE_FIXTURES=1 go test ./space/ -run TestFixtures -count=1
// Asserting:  go test ./space/ -run TestFixtures -count=1   (both GOARCH legs)
//
// Every recorded OUTPUT value is a lossless binary-exponent string —
// strconv.FormatFloat(v, 'b', -1, 64) — never a decimal form, because a
// decimal serialization cannot express the last-ULP divergence the family
// exists to catch. Inputs are plain JSON numbers (Go's encoder emits the
// shortest round-tripping decimal, which is exact for float64) so the file
// stays reviewable.
//
// Each family carries hand-selected cases (documenting intent, tasks.md
// 3.2) and — since every domain here is a continuous R^2/R^3, not an
// enumerable cell pair — a PINNED RANDOMIZED SWEEP (tasks.md 3.3): a
// splitmix64 PRNG on an integer state, a named integer seed, a named input
// box per drawn coordinate in the order the generator's words are consumed,
// a case count, and a SHA-256 digest over the newline-joined canonical
// serialization of the function's output in draw order. The one exception
// is `turnTable`, whose domain (every sub-turn index) IS enumerable at
// 2^20 entries and therefore carries an EXHAUSTIVE sweep instead.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"

	"hexaverse/common"
)

// fixturesPath is the repo-root fixture file this suite owns.
const fixturesPath = "../../fixtures/space/cases.json"

// turnTablePath is the pinned trig table's canonical artifact — recorded by
// turn_table_record_test.go, digested (never re-derived) by the `turnTable`
// family here.
const turnTablePath = "../../fixtures/space/turn-table.json"

// jsRuntimeLegStatement is the explicit, constant record that this family
// has no JavaScript-runtime leg. It reuses table.go's own statement so the
// two artifacts of this capability say the identical thing.
const jsRuntimeLegStatement = noJSLegStatement

// --- canonical serialization -------------------------------------------------

// num is a float64 recorded in its lossless binary-exponent form.
type num string

// parseNum is fnum's exact inverse: strconv's 'b' format is a
// mantissa-and-binary-exponent pair ("-9007199254473055p-53") that
// ParseFloat does not accept, so it is reassembled with math.Ldexp — which
// is exact for this form, no rounding involved.
func parseNum(n num) (float64, error) {
	s := string(n)
	i := strings.LastIndexByte(s, 'p')
	if i < 0 {
		return 0, fmt.Errorf("not a 'b'-format float: %q", s)
	}
	mant, err := strconv.ParseInt(s[:i], 10, 64)
	if err != nil {
		return 0, err
	}
	exp, err := strconv.Atoi(s[i+1:])
	if err != nil {
		return 0, err
	}
	return math.Ldexp(float64(mant), exp), nil
}

func fnum(v float64) num { return num(strconv.FormatFloat(v, 'b', -1, 64)) }

// vec3 is a recorded Vec3: three canonical numbers, in x,y,z order.
type vec3 [3]num

func fvec(v Vec3) vec3 { return vec3{fnum(v.X), fnum(v.Y), fnum(v.Z)} }

// curve6 is a recorded Curve: P0, C1, C2, C3, C4, P5, in that order — six
// control points since design.md Decision 11 raised the transfer curve to a
// quintic so star avoidance has interior points to push.
type curve6 [6]vec3

func fcurve(c Curve) curve6 {
	return curve6{fvec(c.P0), fvec(c.C1), fvec(c.C2), fvec(c.C3), fvec(c.C4), fvec(c.P5)}
}

// errToken is the fixed sentinel a sweep line carries when the function
// under sweep returns an error, per cross-stack-determinism's randomized-
// sweep clause ("an error outcome serialized as a fixed sentinel token").
const errToken = "!err"

// sline renders a multi-component output as its components joined by ','.
func sline(parts ...string) string { return strings.Join(parts, ",") }

func sfloat(v float64) string { return strconv.FormatFloat(v, 'b', -1, 64) }

func svec(v Vec3) string { return sline(sfloat(v.X), sfloat(v.Y), sfloat(v.Z)) }

// --- the pinned PRNG ---------------------------------------------------------

// sweepRNG is splitmix64 on a uint64 state: pure integer arithmetic, no
// float anywhere in the generator, so the drawn inputs themselves are
// exactly reproducible on every build target the family is asserted on.
type sweepRNG struct{ state uint64 }

func newSweepRNG(seed int64) *sweepRNG { return &sweepRNG{state: uint64(seed)} }

func (r *sweepRNG) word() uint64 {
	r.state += 0x9E3779B97F4A7C15
	z := r.state
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	return z ^ (z >> 31)
}

// unit maps one generator word onto [0,1) by the pinned exact form
// float64(u >> 11) * 0x1p-53 — a power-of-two scale, so the product is
// exact and no rounding mode or contraction can reach it.
func (r *sweepRNG) unit() float64 { return float64(float64(r.word()>>11) * 0x1p-53) }

// box maps the next generator word onto [lo, hi) by the pinned form
// lo + float64(f*(hi-lo)), with the product explicitly float64(...)-guarded
// so no fused multiply-add can reach a drawn coordinate on a contracting
// build target.
func (r *sweepRNG) box(lo, hi float64) float64 {
	return lo + float64(r.unit()*(hi-lo))
}

// ibox maps the next generator word onto the integers [lo, hi] by
// truncating the same guarded product. Ranges are kept well inside int64.
func (r *sweepRNG) ibox(lo, hi int64) int64 {
	v := lo + int64(float64(r.unit()*float64(hi-lo+1)))
	if v > hi {
		v = hi
	}
	return v
}

func (r *sweepRNG) vec(lo, hi float64) Vec3 {
	return Vec3{X: r.box(lo, hi), Y: r.box(lo, hi), Z: r.box(lo, hi)}
}

// --- sweep records -----------------------------------------------------------

// sweepAxis names one drawn coordinate and the box it is drawn from, in the
// order the generator's words are consumed.
type sweepAxis struct {
	Name string  `json:"name"`
	Kind string  `json:"kind"` // "float" | "int"
	Lo   float64 `json:"lo"`
	Hi   float64 `json:"hi"`
}

func ax(name string, lo, hi float64) sweepAxis {
	return sweepAxis{Name: name, Kind: "float", Lo: lo, Hi: hi}
}

func iax(name string, lo, hi int64) sweepAxis {
	return sweepAxis{Name: name, Kind: "int", Lo: float64(lo), Hi: float64(hi)}
}

func axVec(prefix string, lo, hi float64) []sweepAxis {
	return []sweepAxis{ax(prefix+".x", lo, hi), ax(prefix+".y", lo, hi), ax(prefix+".z", lo, hi)}
}

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

// exhaustiveSweep is the `turnTable` family's case: its domain is
// enumerable, so it carries the exhaustive form instead.
type exhaustiveSweep struct {
	Note          string `json:"note"`
	Domain        string `json:"domain"`
	Serialization string `json:"serialization"`
	Lines         int    `json:"lines"`
	Digest        string `json:"digest"`
}

const drawMapping = "u = float64(word >> 11) * 0x1p-53; float axis = lo + float64(u*(hi-lo)); int axis = lo + int64(float64(u*float64(hi-lo+1))), clamped to hi"

const serFloats = "strconv.FormatFloat(v, 'b', -1, 64), components joined by ','; an error outcome is the fixed token " + errToken

const serMixed = "integers in decimal, floats as strconv.FormatFloat(v, 'b', -1, 64), components joined by ','; an error outcome is the fixed token " + errToken

// sweepHash accumulates the newline-joined preimage incrementally (no
// trailing newline), exactly as backend/polar/fixtures_test.go does.
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

// --- named systems -----------------------------------------------------------

// orbitJSON is the reviewable input shape of a set of orbital elements.
type orbitJSON struct {
	ParentId    string  `json:"parentId"`
	Radius      float64 `json:"radius"`
	PeriodMs    int64   `json:"periodMs"`
	Phase       int64   `json:"phase"`
	Inclination int64   `json:"inclination"`
	Node        int64   `json:"node"`
}

func (o orbitJSON) orbit() Orbit {
	return Orbit{
		ParentId:    o.ParentId,
		Radius:      o.Radius,
		PeriodMs:    common.WorldMillis(o.PeriodMs),
		Phase:       SubTurns(o.Phase),
		Inclination: SubTurns(o.Inclination),
		Node:        SubTurns(o.Node),
	}
}

func jorbit(o Orbit) orbitJSON {
	return orbitJSON{
		ParentId: o.ParentId, Radius: o.Radius, PeriodMs: int64(o.PeriodMs),
		Phase: int64(o.Phase), Inclination: int64(o.Inclination), Node: int64(o.Node),
	}
}

// bodyJSON is the reviewable input shape of one body.
type bodyJSON struct {
	Id    string     `json:"id"`
	Size  float64    `json:"size"`
	Orbit *orbitJSON `json:"orbit,omitempty"`
}

// systemJSON is a named body hierarchy recorded in the fixture file, so a
// case that names a system is readable without cross-referencing Go code.
// Bodies are listed parent-first for readability; lookup is by id.
type systemJSON []bodyJSON

func (s systemJSON) bodies() fakeBodies {
	out := fakeBodies{}
	for _, b := range s {
		body := Body{Id: b.Id, Size: b.Size}
		if b.Orbit != nil {
			o := b.Orbit.orbit()
			body.Orbit = &o
		}
		out[b.Id] = body
	}
	return out
}

// fixtureSystems are the named hierarchies every system-bearing case
// references. `fixture` is the star → planet → moon chain plus an inclined
// second planet and a node-rotated outpost (four levels deep, the bound
// body.go's maxBodyDepth pins); `cyclic` is the mutual-parent pair the
// named-sentinel-error cases need.
func fixtureSystems() map[string]systemJSON {
	return map[string]systemJSON{
		"fixture": {
			{Id: "star", Size: 6},
			{Id: "planet1", Size: 2.4, Orbit: &orbitJSON{ParentId: "star", Radius: 50, PeriodMs: 100_000}},
			{Id: "planet2", Size: 3.1, Orbit: &orbitJSON{ParentId: "star", Radius: 80, PeriodMs: 160_000, Inclination: int64(SubTurn / 24)}},
			{Id: "moon1", Size: 0.6, Orbit: &orbitJSON{ParentId: "planet1", Radius: 6, PeriodMs: 9_000, Phase: int64(SubTurn / 8)}},
			{Id: "outpost", Size: 0.2, Orbit: &orbitJSON{ParentId: "moon1", Radius: 1.5, PeriodMs: 3_000, Node: int64(SubTurn / 7)}},
			{Id: "frozen", Size: 1.1, Orbit: &orbitJSON{ParentId: "star", Radius: 33, PeriodMs: 0, Phase: int64(SubTurn / 3)}},
		},
		"cyclic": {
			{Id: "a", Size: 1, Orbit: &orbitJSON{ParentId: "b", Radius: 10, PeriodMs: 1_000}},
			{Id: "b", Size: 1, Orbit: &orbitJSON{ParentId: "a", Radius: 10, PeriodMs: 1_000}},
		},
	}
}

func systemBodies(t testing.TB, name string) fakeBodies {
	s, ok := fixtureSystems()[name]
	if !ok {
		t.Fatalf("fixture case names unknown system %q", name)
	}
	return s.bodies()
}

// --- family case shapes ------------------------------------------------------

type phaseIndexCase struct {
	Note   string     `json:"note"`
	Offset [3]float64 `json:"offset"`
	Index  int64      `json:"index"`
	Steps  int        `json:"steps"`
}

type orbitCase struct {
	Note  string    `json:"note"`
	Orbit orbitJSON `json:"orbit"`
	T     int64     `json:"t"`
	Out   vec3      `json:"out"`
}

type bodyCase struct {
	Note   string `json:"note"`
	System string `json:"system"`
	Body   string `json:"body"`
	T      int64  `json:"t"`
	Out    vec3   `json:"out,omitempty"`
	Err    string `json:"err,omitempty"`
}

type curveJSON struct {
	P0 [3]float64 `json:"p0"`
	C1 [3]float64 `json:"c1"`
	C2 [3]float64 `json:"c2"`
	C3 [3]float64 `json:"c3"`
	C4 [3]float64 `json:"c4"`
	P5 [3]float64 `json:"p5"`
}

func (c curveJSON) curve() Curve {
	return Curve{
		P0: Vec3{c.P0[0], c.P0[1], c.P0[2]},
		C1: Vec3{c.C1[0], c.C1[1], c.C1[2]},
		C2: Vec3{c.C2[0], c.C2[1], c.C2[2]},
		C3: Vec3{c.C3[0], c.C3[1], c.C3[2]},
		C4: Vec3{c.C4[0], c.C4[1], c.C4[2]},
		P5: Vec3{c.P5[0], c.P5[1], c.P5[2]},
	}
}

type curveSampleCase struct {
	Note  string    `json:"note"`
	Curve curveJSON `json:"curve"`
	U     float64   `json:"u"`
	Out   vec3      `json:"out"`
}

type arcTableCase struct {
	Note  string    `json:"note"`
	Curve curveJSON `json:"curve"`
	Table []num     `json:"table"`
}

type arcParamCase struct {
	Note  string    `json:"note"`
	Curve curveJSON `json:"curve"`
	Frac  float64   `json:"frac"`
	U     num       `json:"u"`
	Steps int       `json:"steps"`
}

type travelTimeCase struct {
	Note     string  `json:"note"`
	Length   float64 `json:"curveLength"`
	Accel    float64 `json:"accel"`
	DepartMs int64   `json:"departMs"`
	Seconds  num     `json:"flightSeconds"`
	ArriveMs int64   `json:"arriveMs"`
}

type targetJSON struct {
	BodyId string      `json:"bodyId,omitempty"`
	Point  *[3]float64 `json:"point,omitempty"`
}

func (t targetJSON) target() Target {
	if t.Point != nil {
		p := Vec3{t.Point[0], t.Point[1], t.Point[2]}
		return Target{Point: &p}
	}
	return Target{BodyId: t.BodyId}
}

func jbodyTarget(id string) targetJSON { return targetJSON{BodyId: id} }

func jpointTarget(v Vec3) targetJSON {
	p := [3]float64{v.X, v.Y, v.Z}
	return targetJSON{Point: &p}
}

type buildCurveCase struct {
	Note           string      `json:"note"`
	System         string      `json:"system"`
	From           [3]float64  `json:"from"`
	Target         targetJSON  `json:"target"`
	ArriveMs       int64       `json:"arriveMs"`
	DepartDir      *[3]float64 `json:"departDir,omitempty"`
	StarClearance  float64     `json:"starClearance"`
	Curve          *curve6     `json:"curve,omitempty"`
	Intercept      *vec3       `json:"intercept,omitempty"`
	InsertionPhase int64       `json:"insertionPhase"`
	Err            string      `json:"err,omitempty"`
}

// burnJSON is a recorded Burn: every stored field, canonical form.
type burnJSON struct {
	Origin         vec3   `json:"origin"`
	Target         string `json:"target"`
	Intercept      vec3   `json:"intercept"`
	Curve          curve6 `json:"curve"`
	Length         num    `json:"length"`
	DepartMs       int64  `json:"departMs"`
	ArriveMs       int64  `json:"arriveMs"`
	Accel          num    `json:"accel"`
	InsertionPhase int64  `json:"insertionPhase"`
}

func jburn(b Burn) burnJSON {
	target := "body:" + b.Target.BodyId
	if b.Target.Point != nil {
		target = "point:" + svec(*b.Target.Point)
	}
	return burnJSON{
		Origin: fvec(b.Origin), Target: target, Intercept: fvec(b.Intercept),
		Curve: fcurve(b.Curve), Length: fnum(b.Length),
		DepartMs: int64(b.DepartMs), ArriveMs: int64(b.ArriveMs),
		Accel: fnum(b.Accel), InsertionPhase: int64(b.InsertionPhase),
	}
}

type solveBurnCase struct {
	Note          string      `json:"note"`
	System        string      `json:"system"`
	From          [3]float64  `json:"from"`
	Target        targetJSON  `json:"target"`
	DepartMs      int64       `json:"departMs"`
	Accel         float64     `json:"accel"`
	DepartDir     *[3]float64 `json:"departDir,omitempty"`
	StarClearance float64     `json:"starClearance"`
	Rounds        int         `json:"rounds"`
	Burn          *burnJSON   `json:"burn,omitempty"`
	Err           string      `json:"err,omitempty"`
}

// burnInput is a burn stated directly as fixture input (no solve), so the
// burnPosition/burnTangent/burnSpeed families pin the evaluation functions
// independently of the solver that usually produces their operand.
type burnInput struct {
	Origin         [3]float64 `json:"origin"`
	Target         targetJSON `json:"target"`
	Intercept      [3]float64 `json:"intercept"`
	Curve          curveJSON  `json:"curve"`
	Length         float64    `json:"length"`
	DepartMs       int64      `json:"departMs"`
	ArriveMs       int64      `json:"arriveMs"`
	Accel          float64    `json:"accel"`
	InsertionPhase int64      `json:"insertionPhase"`
}

func (b burnInput) burn() Burn {
	return Burn{
		Origin:         Vec3{b.Origin[0], b.Origin[1], b.Origin[2]},
		Target:         b.Target.target(),
		Intercept:      Vec3{b.Intercept[0], b.Intercept[1], b.Intercept[2]},
		Curve:          b.Curve.curve(),
		Length:         b.Length,
		DepartMs:       common.WorldMillis(b.DepartMs),
		ArriveMs:       common.WorldMillis(b.ArriveMs),
		Accel:          b.Accel,
		InsertionPhase: SubTurns(b.InsertionPhase),
	}
}

type burnVecCase struct {
	Note string    `json:"note"`
	Burn burnInput `json:"burn"`
	T    int64     `json:"t"`
	Out  vec3      `json:"out"`
}

type burnSpeedCase struct {
	Note       string    `json:"note"`
	Burn       burnInput `json:"burn"`
	T          int64     `json:"t"`
	Speed      num       `json:"speed"`
	BeforeFlip bool      `json:"beforeFlip"`
	Progress   num       `json:"progress"`
	DeltaV     num       `json:"deltaV"`
}

type parkJSON struct {
	Kind     string     `json:"kind"`
	BodyId   string     `json:"bodyId,omitempty"`
	Radius   float64    `json:"radius,omitempty"`
	PeriodMs int64      `json:"periodMs,omitempty"`
	Phase    int64      `json:"phase,omitempty"`
	EpochMs  int64      `json:"epochMs,omitempty"`
	Offset   [3]float64 `json:"offset,omitempty"`
	Point    [3]float64 `json:"point,omitempty"`
	// The stationkeep-only hold window (add-stationkeep-hold-verb). Both are
	// omitempty, so every park that carries no hold — which is every park
	// recorded before this change — records byte-identically.
	HoldStartMs  int64 `json:"holdStartMs,omitempty"`
	DryInstantMs int64 `json:"dryInstantMs,omitempty"`
}

var parkKindNames = map[ParkKind]string{ParkOrbit: "orbit", ParkStationkeep: "stationkeep", ParkPoint: "point"}
var parkKindsByName = map[string]ParkKind{"orbit": ParkOrbit, "stationkeep": ParkStationkeep, "point": ParkPoint}

func (p parkJSON) park() Park {
	return Park{
		Kind:     parkKindsByName[p.Kind],
		BodyId:   p.BodyId,
		Radius:   p.Radius,
		PeriodMs: common.WorldMillis(p.PeriodMs),
		Phase:    SubTurns(p.Phase),
		EpochMs:  common.WorldMillis(p.EpochMs),
		Offset:   Vec3{p.Offset[0], p.Offset[1], p.Offset[2]},
		Point:    Vec3{p.Point[0], p.Point[1], p.Point[2]},

		HoldStartMs:  common.WorldMillis(p.HoldStartMs),
		DryInstantMs: common.WorldMillis(p.DryInstantMs),
	}
}

type parkCase struct {
	Note     string   `json:"note"`
	System   string   `json:"system"`
	Park     parkJSON `json:"park"`
	T        int64    `json:"t"`
	Position *vec3    `json:"position,omitempty"`
	Velocity *vec3    `json:"velocity,omitempty"`
	Err      string   `json:"err,omitempty"`
}

type stateAtCase struct {
	Note     string     `json:"note"`
	System   string     `json:"system"`
	Burn     *burnInput `json:"burn,omitempty"`
	Park     *parkJSON  `json:"park,omitempty"`
	T        int64      `json:"t"`
	Mode     string     `json:"mode"`
	Settled  *parkJSON  `json:"settledPark,omitempty"`
	Position *vec3      `json:"position,omitempty"`
	Err      string     `json:"err,omitempty"`
}

// --- station-keeping case shapes (add-stationkeep-hold-verb) ---------------

// stationkeepCodecCase is one round trip of a `stationkeep` park through
// EncodePark/DecodePark, plus the two new stored keys' recorded values —
// space-kinematics MODIFIED "Coordinates Cross the Persistence Boundary
// Through a Named Codec" ("Every park kind and a drift round-trip exactly
// through the codec", widened to the hold window) and "A station-keep park
// with a missing or invalid dry instant fails to decode".
//
// Err records the named decode failure for a rejected case, exactly as the
// other families record theirs; RoundTrips records whether the decoded park
// is identical to the encoded one.
type stationkeepCodecCase struct {
	Note             string   `json:"note"`
	Park             parkJSON `json:"park"`
	EncodedHoldStart int64    `json:"encodedHoldStartMs"`
	EncodedDryInst   int64    `json:"encodedDryInstantMs"`
	RoundTrips       bool     `json:"roundTripsExactly"`
	Err              string   `json:"err,omitempty"`
}

// stationkeepFoldCase is one evaluation of space-kinematics' "A
// Station-Keeping Park Past Its Dry Instant Is Its Released Orbit, With No
// Extra Persisted State": the stored park, the observation time, the folded
// park StateAt produces, and — recorded alongside it so the two can be read
// against each other without leaving the file — the park
// ReleaseStationkeep(bodyId, offset, dryInstant) produces directly.
type stationkeepFoldCase struct {
	Note                 string   `json:"note"`
	System               string   `json:"system"`
	Park                 parkJSON `json:"park"`
	T                    int64    `json:"t"`
	Folded               parkJSON `json:"foldedPark"`
	ReleaseStationkeepAt parkJSON `json:"releaseStationkeepAtDryInstant"`
	Position             *vec3    `json:"position,omitempty"`
}

// stationkeepDryInstantCase pins the ceiling-quantized INVERSE of
// StationKeepUpkeep that fleet-movement's "Station-Keeping Upkeep Is Settled
// at Discrete Events, Never Folded Into the Stored Cargo Pool" defines:
//
//	spendableDeltaV = (fuelTons − stationKeepReserveTons) × deltaVPerTon
//	dryInstantMs    = holdStartMs + ceil_to_integer_ms(1000 × spendableDeltaV / upkeepRate)
//
// The two conversions are the whole point of recording it. deltaVPerTon is
// Δv PER TON, so the BUDGET side multiplies by it and the accrual side
// divides — inverting that understates a hold's endurance by deltaVPerTon²
// (25× at today's placeholder 5.0). And StationKeepUpkeep already converts
// milliseconds to seconds internally, so restating that conversion at a call
// site moves the figure by a further 1000×. Cases below deliberately carry a
// deltaVPerTon ≠ 1 AND a reserve ≠ 0, so either inversion, and a dropped
// reserve subtraction, each break the recorded value.
//
// AccrualAtDryInstantTons and SpendableTons bracket the answer: the accrual
// evaluated AT the recorded dry instant is at least the spendable budget and
// less than that budget plus one millisecond's upkeep — an interval exactly
// one millisecond wide, because the quantization is a ceiling.
type stationkeepDryInstantCase struct {
	Note                    string  `json:"note"`
	HoldStartMs             int64   `json:"holdStartMs"`
	FuelTons                float64 `json:"fuelTons"`
	StationKeepReserveTons  float64 `json:"stationKeepReserveTons"`
	DeltaVPerTon            float64 `json:"deltaVPerTon"`
	UpkeepRate              float64 `json:"upkeepRate"`
	DryInstantMs            int64   `json:"dryInstantMs"`
	SpendableTons           num     `json:"spendableTons"`
	AccrualAtDryInstantTons num     `json:"accrualAtDryInstantTons"`
	OneMsOfUpkeepTons       num     `json:"oneMillisecondOfUpkeepTons"`
}

// jpark records a settled Park in the same reviewable input shape, so the
// stateAt family's output can be read against the parkPosition family's
// input without a second vocabulary.
func jpark(p Park) parkJSON {
	return parkJSON{
		Kind: parkKindNames[p.Kind], BodyId: p.BodyId, Radius: p.Radius,
		PeriodMs: int64(p.PeriodMs), Phase: int64(p.Phase), EpochMs: int64(p.EpochMs),
		Offset:      [3]float64{p.Offset.X, p.Offset.Y, p.Offset.Z},
		Point:       [3]float64{p.Point.X, p.Point.Y, p.Point.Z},
		HoldStartMs: int64(p.HoldStartMs), DryInstantMs: int64(p.DryInstantMs),
	}
}

// --- codec case shapes (EncodeVec/DecodeVec/EncodeSubTurns/DecodeSubTurns) --
//
// params.go's Firestore/action.Params codec (design.md Decision 4, tasks.md
// 1.4 of migrate-fleet-to-continuous-burns — the first change that gives
// backend/space a real consumer). Its domain is storage-native primitives,
// not geometry, so the error paths (a non-finite or out-of-extent
// component, an unrecognized input shape) are as much this family's
// subject as the round trip itself.

// encodeVecCase is one EncodeVec hand case: a Vec3 in, its []float64 wire
// shape out (design.md Decision 4 pins the order literally: x, y, z).
type encodeVecCase struct {
	Note string `json:"note"`
	In   vec3   `json:"in"`
	Out  vec3   `json:"out"`
}

// decodeVecInput is one DecodeVec input, described reviewably rather than
// as a raw `any` literal. Shape names the numeric-slice shape the value is
// constructed as, matching decodeNumericSlice's own recognized container/
// element combinations plus the shapes it (and checkedCoordinate) must
// reject:
//   - "float64Slice"    a []float64 (EncodeVec's own output shape, or a
//     wrong-length slice when len(Values) != 3)
//   - "anySliceFloat64" a []any of float64s (a JSON HTTP body decode)
//   - "anySliceInt64"   a []any of int64s (a Firestore round trip)
//   - "anySliceInt"     a []any of ints (an in-memory literal built by hand)
//   - "anySliceMixed"   int, int64, float64 elements in that cyclic order —
//     decodeNumber's three accepted branches in one call
//   - "anySliceBad"     Values plus one trailing non-numeric element
//   - "notASlice"       a value that is not a slice at all
//   - "wrongType"       a slice of an unsupported element type
//
// Bad/BadAt substitute a non-finite value into Values[BadAt] at call time
// (never encoded into the fixture file as JSON, which cannot represent
// NaN/Inf as a number) — "nan" | "posInf" | "negInf".
type decodeVecInput struct {
	note   string
	shape  string
	values []float64
	bad    string
	badAt  int
}

func (in decodeVecInput) value() any {
	nums := append([]float64{}, in.values...)
	if in.bad != "" {
		switch in.bad {
		case "nan":
			nums[in.badAt] = math.NaN()
		case "posInf":
			nums[in.badAt] = math.Inf(1)
		case "negInf":
			nums[in.badAt] = math.Inf(-1)
		default:
			panic("decodeVecInput: unknown bad kind " + in.bad)
		}
	}
	switch in.shape {
	case "float64Slice":
		return nums
	case "anySliceFloat64":
		out := make([]any, len(nums))
		for i, v := range nums {
			out[i] = v
		}
		return out
	case "anySliceInt64":
		out := make([]any, len(nums))
		for i, v := range nums {
			out[i] = int64(v)
		}
		return out
	case "anySliceInt":
		out := make([]any, len(nums))
		for i, v := range nums {
			out[i] = int(v)
		}
		return out
	case "anySliceMixed":
		converters := []func(float64) any{
			func(v float64) any { return v },
			func(v float64) any { return int64(v) },
			func(v float64) any { return int(v) },
		}
		out := make([]any, len(nums))
		for i, v := range nums {
			out[i] = converters[i%len(converters)](v)
		}
		return out
	case "anySliceBad":
		out := make([]any, 0, len(nums)+1)
		for _, v := range nums {
			out = append(out, v)
		}
		return append(out, "not-a-number")
	case "notASlice":
		return "not-a-slice"
	case "wrongType":
		return map[string]any{"x": 1.0}
	default:
		panic("decodeVecInput: unknown shape " + in.shape)
	}
}

// decodeVecCase is decodeVecInput's recorded, reviewable counterpart: the
// input description plus the actual DecodeVec(in.value()) outcome.
type decodeVecCase struct {
	Note   string    `json:"note"`
	Shape  string    `json:"shape"`
	Values []float64 `json:"values,omitempty"`
	Bad    string    `json:"bad,omitempty"`
	BadAt  int       `json:"badAt,omitempty"`
	Out    vec3      `json:"out,omitempty"`
	Err    string    `json:"err,omitempty"`
}

// encodeSubTurnsCase is one EncodeSubTurns hand case: a SubTurns angle in,
// its int64 wire shape out (design.md Decision 4).
type encodeSubTurnsCase struct {
	Note string `json:"note"`
	In   int64  `json:"in"`
	Out  int64  `json:"out"`
}

// decodeSubTurnsInput is one DecodeSubTurns input, described reviewably.
// Kind names the accepted-or-rejected shape: "int" | "int64" | "float64"
// (N or F carries the payload) | "nan" | "posInf" | "negInf" | "invalid"
// (an unsupported shape, e.g. a string).
type decodeSubTurnsInput struct {
	note string
	kind string
	n    int64
	f    float64
}

func (in decodeSubTurnsInput) value() any {
	switch in.kind {
	case "int":
		return int(in.n)
	case "int64":
		return in.n
	case "float64":
		return in.f
	case "nan":
		return math.NaN()
	case "posInf":
		return math.Inf(1)
	case "negInf":
		return math.Inf(-1)
	case "invalid":
		return "not a number"
	default:
		panic("decodeSubTurnsInput: unknown kind " + in.kind)
	}
}

// decodeSubTurnsCase is decodeSubTurnsInput's recorded, reviewable
// counterpart.
type decodeSubTurnsCase struct {
	Note string  `json:"note"`
	Kind string  `json:"kind"`
	N    int64   `json:"n,omitempty"`
	F    float64 `json:"f,omitempty"`
	Out  int64   `json:"out,omitempty"`
	Err  string  `json:"err,omitempty"`
}

// --- sweep counts ------------------------------------------------------------
//
// cross-stack-determinism's randomized-sweep clause recommends 100,000
// cases per family as a starting point. Families whose per-case work is a
// handful of table lookups run at that count. Families that build a
// 65-sample arc table per case, and the two that run the full fixed-round
// solve per case (twice, for the round-residual measurement of tasks.md
// 3.4), run at explicitly lower counts so the whole family stays inside the
// `go test -short` budget `make test` gives it — a stated reduction, never a
// silent truncation.
const (
	sweepCountCheap = 100_000
	sweepCountCurve = 20_000
	sweepCountSolve = 5_000
)

// sweepSeed is this family's one pinned integer seed. Every sweep draws
// from its own generator seeded with it, so a family can be re-derived in
// isolation.
const sweepSeed int64 = 20260827

// --- sweeps ------------------------------------------------------------------

func sweepPhaseIndexOf(n int) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		off := r.vec(-1000, 1000)
		idx, steps := PhaseIndexOf(off)
		sh.line(sline(strconv.FormatInt(int64(idx), 10), strconv.Itoa(steps)))
	}
	return sh.lines, sh.sum()
}

var phaseIndexAxes = axVec("offset", -1000, 1000)

// orbitAxes is the shared draw order of the orbitPosition and orbitVelocity
// sweeps. The time axis deliberately straddles the orbit's own epoch: a
// bare Orbit's epoch IS the world epoch (orbit.go — only Park carries an
// EpochMs), so the negative half of the box is exactly the before-epoch
// wrap branch tasks.md 3.3 requires the sweep to exercise. It pins that
// wrap's behaviour; it does not assert such times occur in play (the
// capability's stated domain starts at the world epoch).
var orbitAxes = []sweepAxis{
	ax("orbit.radius", 0.1, 500),
	iax("orbit.periodMs", -50_000, 500_000),
	iax("orbit.phase", 0, int64(SubTurn)-1),
	iax("orbit.inclination", 0, int64(SubTurn)-1),
	iax("orbit.node", 0, int64(SubTurn)-1),
	iax("t", -2_000_000, 2_000_000),
}

func drawOrbit(r *sweepRNG) (Orbit, common.WorldMillis) {
	o := Orbit{
		ParentId: "parent",
		Radius:   r.box(0.1, 500),
		PeriodMs: common.WorldMillis(r.ibox(-50_000, 500_000)),
	}
	o.Phase = SubTurns(r.ibox(0, int64(SubTurn)-1))
	o.Inclination = SubTurns(r.ibox(0, int64(SubTurn)-1))
	o.Node = SubTurns(r.ibox(0, int64(SubTurn)-1))
	t := common.WorldMillis(r.ibox(-2_000_000, 2_000_000))
	return o, t
}

func sweepOrbit(n int, velocity bool) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		o, t := drawOrbit(r)
		if velocity {
			sh.line(svec(o.LocalVelocity(t)))
		} else {
			sh.line(svec(o.LocalPosition(t)))
		}
	}
	return sh.lines, sh.sum()
}

// bodyAxes draws a three-level chain — a parentless root `a`, `b` orbiting
// `a`, `c` orbiting `b` — and evaluates `c`, so the sweep exercises the
// hierarchical composition body.go performs, not just one orbit.
var bodyAxes = func() []sweepAxis {
	var out []sweepAxis
	for _, lvl := range []string{"b", "c"} {
		out = append(out,
			ax(lvl+".radius", 0.1, 300),
			iax(lvl+".periodMs", -20_000, 400_000),
			iax(lvl+".phase", 0, int64(SubTurn)-1),
			iax(lvl+".inclination", 0, int64(SubTurn)-1),
			iax(lvl+".node", 0, int64(SubTurn)-1),
		)
	}
	out = append(out, iax("t", -2_000_000, 2_000_000))
	return out
}()

func drawChain(r *sweepRNG) (fakeBodies, common.WorldMillis) {
	mk := func(parent string) *Orbit {
		o := &Orbit{ParentId: parent, Radius: r.box(0.1, 300), PeriodMs: common.WorldMillis(r.ibox(-20_000, 400_000))}
		o.Phase = SubTurns(r.ibox(0, int64(SubTurn)-1))
		o.Inclination = SubTurns(r.ibox(0, int64(SubTurn)-1))
		o.Node = SubTurns(r.ibox(0, int64(SubTurn)-1))
		return o
	}
	ob := mk("a")
	oc := mk("b")
	t := common.WorldMillis(r.ibox(-2_000_000, 2_000_000))
	return fakeBodies{
		"a": {Id: "a", Size: 5},
		"b": {Id: "b", Size: 2, Orbit: ob},
		"c": {Id: "c", Size: 1, Orbit: oc},
	}, t
}

func sweepBody(n int, velocity bool) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		bodies, t := drawChain(r)
		var v Vec3
		var err error
		if velocity {
			v, err = Velocity(bodies, "c", t)
		} else {
			v, err = Position(bodies, "c", t)
		}
		if err != nil {
			sh.line(errToken)
			continue
		}
		sh.line(svec(v))
	}
	return sh.lines, sh.sum()
}

var curveAxes = func() []sweepAxis {
	var out []sweepAxis
	for _, p := range []string{"p0", "c1", "c2", "c3", "c4", "p5"} {
		out = append(out, axVec(p, -400, 400)...)
	}
	return out
}()

var curveSampleAxes = append(append([]sweepAxis{}, curveAxes...), ax("u", 0, 1))

var arcParamAxes = append(append([]sweepAxis{}, curveAxes...), ax("frac", -0.25, 1.25))

func drawCurve(r *sweepRNG) Curve {
	return Curve{
		P0: r.vec(-400, 400), C1: r.vec(-400, 400), C2: r.vec(-400, 400),
		C3: r.vec(-400, 400), C4: r.vec(-400, 400), P5: r.vec(-400, 400),
	}
}

func sweepCurveSample(n int, derivative bool) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		c := drawCurve(r)
		u := r.box(0, 1)
		if derivative {
			sh.line(svec(c.Derivative(u)))
		} else {
			sh.line(svec(c.Point(u)))
		}
	}
	return sh.lines, sh.sum()
}

func sweepArcTable(n int) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	parts := make([]string, arcSteps+1)
	for i := 0; i < n; i++ {
		c := drawCurve(r)
		table := c.ArcTable()
		for j, v := range table {
			parts[j] = sfloat(v)
		}
		sh.line(sline(parts...))
	}
	return sh.lines, sh.sum()
}

func sweepArcParam(n int) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		c := drawCurve(r)
		frac := r.box(-0.25, 1.25)
		u, steps := c.ArcParam(frac)
		sh.line(sline(sfloat(u), strconv.Itoa(steps)))
	}
	return sh.lines, sh.sum()
}

var travelTimeAxes = []sweepAxis{
	ax("curveLength", 0.001, 1_000_000),
	ax("accel", 0.01, 100),
	iax("departMs", 0, 1_000_000_000),
}

func sweepTravelTime(n int) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		length := r.box(0.001, 1_000_000)
		accel := r.box(0.01, 100)
		departMs := common.WorldMillis(r.ibox(0, 1_000_000_000))
		secs := FlightSeconds(length, accel)
		arrive := QuantizeArrival(departMs, secs)
		sh.line(sline(sfloat(secs), strconv.FormatInt(int64(arrive), 10)))
	}
	return sh.lines, sh.sum()
}

// sweepTargets are the target selections the buildCurve/solveBurn/stateAt
// sweeps draw among: index 0 is the drawn explicit point, 1..n are named
// bodies of the `fixture` system (a moving planet, an inclined planet, a
// moon composing its parent, a node-rotated outpost four levels deep, and a
// motionless zero-period body).
var sweepTargets = []string{"", "planet1", "planet2", "moon1", "outpost", "frozen"}

var buildCurveAxes = func() []sweepAxis {
	out := axVec("from", -300, 300)
	out = append(out, iax("targetSel", 0, int64(len(sweepTargets))-1))
	out = append(out, axVec("targetPoint", -300, 300)...)
	out = append(out, iax("arriveMs", 0, 2_000_000))
	out = append(out, iax("useDepartDir", 0, 1))
	out = append(out, axVec("departDir", -1, 1)...)
	out = append(out, ax("starClearance", 0, 40))
	return out
}()

// drawTransfer draws the shared prefix of the buildCurve and solveBurn
// sweeps. EVERY axis is drawn unconditionally, before any branch, so the
// generator's word order does not depend on the values it produced.
func drawTransfer(r *sweepRNG) (from Vec3, target Target, arriveMs common.WorldMillis, departDir *Vec3, clearance float64) {
	from = r.vec(-300, 300)
	sel := r.ibox(0, int64(len(sweepTargets))-1)
	point := r.vec(-300, 300)
	arriveMs = common.WorldMillis(r.ibox(0, 2_000_000))
	useDir := r.ibox(0, 1)
	dir := r.vec(-1, 1)
	clearance = r.box(0, 40)

	if sweepTargets[sel] == "" {
		p := point
		target = Target{Point: &p}
	} else {
		target = Target{BodyId: sweepTargets[sel]}
	}
	if useDir == 1 {
		d := dir
		departDir = &d
	}
	return from, target, arriveMs, departDir, clearance
}

func sweepBuildCurve(t testing.TB, n int) (int, string) {
	bodies := systemBodies(t, "fixture")
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		from, target, arriveMs, departDir, clearance := drawTransfer(r)
		res, err := BuildCurve(bodies, from, target, arriveMs, departDir, clearance)
		if err != nil {
			sh.line(errToken)
			continue
		}
		sh.line(sline(
			svec(res.Curve.P0), svec(res.Curve.C1), svec(res.Curve.C2),
			svec(res.Curve.C3), svec(res.Curve.C4), svec(res.Curve.P5),
			svec(res.Intercept), strconv.FormatInt(int64(res.InsertionPhase), 10)))
	}
	return sh.lines, sh.sum()
}

var solveBurnAxes = func() []sweepAxis {
	out := append([]sweepAxis{}, buildCurveAxes...)
	// arriveMs is not drawn for a solve — the solve derives it. It is
	// replaced in place by departMs, so the word order stays the shared
	// prefix's, and accel is appended.
	for i := range out {
		if out[i].Name == "arriveMs" {
			out[i] = iax("departMs", 0, 2_000_000)
		}
	}
	return append(out, ax("accel", 0.5, 40))
}()

// solveSweepResult carries the digest plus the two measurements tasks.md
// 3.4 and 3.5 require the sweep to produce.
type solveSweepResult struct {
	lines           int
	digest          string
	residuals       []float64
	maxResidualMs   int64
	worstTangentDot float64
	tangentCases    int
	// Insertions whose curve was star-avoidance displaced, and the worst
	// alignment among those that were NOT — the evidence that separates a
	// star-avoidance interaction from a general insertion defect.
	displacedCases      int
	worstUndisplacedDot float64
	// Burns with a positive clearance radius whose curve still comes at or
	// inside it after avoidance — the requirement's own hard guarantee,
	// which nothing asserted over the sweep before design.md Decision 11.
	clearanceCases      int
	clearanceViolations int
	positionalGaps      int
	solved              int
}

func sweepSolveBurn(t testing.TB, n, rounds int) solveSweepResult {
	bodies := systemBodies(t, "fixture")
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	out := solveSweepResult{worstTangentDot: math.Inf(1), worstUndisplacedDot: math.Inf(1)}
	for i := 0; i < n; i++ {
		from, target, departMs, departDir, clearance := drawTransfer(r)
		accel := r.box(0.5, 40)

		res, err := SolveBurn(bodies, from, target, departMs, accel, departDir, clearance, rounds)
		if err != nil {
			sh.line(errToken)
			continue
		}
		b := res.Burn
		sh.line(sline(
			svec(b.Curve.P0), svec(b.Curve.C1), svec(b.Curve.C2),
			svec(b.Curve.C3), svec(b.Curve.C4), svec(b.Curve.P5),
			svec(b.Intercept), sfloat(b.Length),
			strconv.FormatInt(int64(b.ArriveMs), 10),
			strconv.FormatInt(int64(b.InsertionPhase), 10),
			strconv.Itoa(res.Rounds)))
		out.solved++

		// The star-clearance guarantee, over the sweep rather than over one
		// hand-picked case (space-kinematics: "A burn crossing near the star
		// bulges clear of it").
		if clearance > 0 {
			out.clearanceCases++
			// task 1.5 (migrate-fleet-to-continuous-burns): calls the
			// surviving minDistanceAndParamOf directly, discarding the
			// curve-parameter component, rather than through
			// minDistanceFromOriginOf — that thin wrapper had no production
			// caller and this was its last reference anywhere in the
			// package, clearing it for deletion (reported to the
			// orchestrator/developer; not performed here since it is a
			// production-file edit).
			if d, _ := minDistanceAndParamOf(b.Curve, arcSampleCount); d <= clearance {
				out.clearanceViolations++
			}
		}

		// tasks.md 3.4 — the round-N residual: the same case solved one
		// round short must quantize to the identical integer arrival.
		if prev, prevErr := SolveBurn(bodies, from, target, departMs, accel, departDir, clearance, rounds-1); prevErr == nil {
			d := int64(b.ArriveMs) - int64(prev.Burn.ArriveMs)
			if d < 0 {
				d = -d
			}
			out.residuals = append(out.residuals, float64(d))
			if d > out.maxResidualMs {
				out.maxResidualMs = d
			}
		}

		// tasks.md 3.5 — arrival continuity: the settled park's position at
		// the stored arrival millisecond is bit-identical to the stored
		// intercept (exact by construction, asserted, not toleranced), and
		// the curve's end tangent aligns with the settled velocity.
		folded, ferr := StateAt(bodies, ShipState{Mode: ModeBurn, Burn: &b}, b.ArriveMs)
		if ferr != nil || folded.Park == nil {
			continue
		}
		pos, perr := folded.Park.Position(bodies, b.ArriveMs)
		if perr == nil && pos != b.Intercept {
			out.positionalGaps++
		}
		if b.Target.Point != nil {
			continue
		}
		vel, verr := folded.Park.Velocity(bodies, b.ArriveMs)
		if verr != nil {
			continue
		}
		vd, vok := vel.Normalize()
		td, tok := b.Curve.Derivative(1).Normalize()
		if !vok || !tok {
			continue
		}
		dot := td.Dot(vd)
		out.tangentCases++
		if dot < out.worstTangentDot {
			out.worstTangentDot = dot
		}
		// Was this curve star-avoidance displaced? Rebuild it with
		// avoidance disabled and compare the control point the end tangent
		// is derived from.
		displaced := false
		if clearance > 0 {
			if plain, perr := BuildCurve(bodies, from, target, b.ArriveMs, departDir, 0); perr == nil {
				displaced = plain.Curve.C2 != b.Curve.C2
			}
		}
		if displaced {
			out.displacedCases++
		} else if dot < out.worstUndisplacedDot {
			out.worstUndisplacedDot = dot
		}
	}
	sort.Float64s(out.residuals)
	out.lines, out.digest = sh.lines, sh.sum()
	return out
}

// percentileMs returns the q-quantile of an ALREADY-SORTED millisecond
// sample by nearest-rank on the sorted index — an integer index into an
// integer-valued sample, so it carries no float comparison of its own and
// reproduces exactly on every build target.
func percentileMs(sorted []float64, q float64) int64 {
	if len(sorted) == 0 {
		return 0
	}
	i := int(float64(q * float64(len(sorted)-1)))
	return int64(sorted[i])
}

// --- realistic traffic ------------------------------------------------------
//
// A SECOND, fixed, fully enumerable sweep alongside the randomized one. The
// randomized sweep draws from a deliberately adversarial box — positions
// uniform in a 600-unit cube and a star-clearance radius up to 40, which
// manufactures near-star chords far more often than play does. That is the
// right domain for catching divergence, and the wrong one for judging
// whether a measured tolerance is acceptable.
//
// This sweep is the traffic the game would actually generate: every ordered
// pair of the fixture system's targetable bodies, departing from the source
// body's own insertion standoff, at the star's real clearance radius,
// sampled at a fixed ladder of departure times. It is enumerable and pinned,
// so it needs no PRNG record.
type realisticStats struct {
	Note            string `json:"note"`
	Burns           int    `json:"burns"`
	DepartureLadder string `json:"departureLadder"`

	ResidualNonzero int   `json:"roundResidualNonzeroCases"`
	ResidualP99Ms   int64 `json:"roundResidualP99Ms"`
	ResidualMaxMs   int64 `json:"roundResidualMaxMs"`
	MedianFlightMs  int64 `json:"medianFlightMs"`

	StarClearanceViolations int `json:"starClearanceViolations"`
	TangentBelowFloor       int `json:"arrivalTangentBelowFloorCases"`
}

var realisticTargets = []string{"planet1", "planet2", "moon1", "outpost", "frozen"}

const realisticDepartureCount = 40
const realisticDepartureStepMs = 4_000

func sweepRealisticTraffic(t testing.TB) realisticStats {
	bodies := systemBodies(t, "fixture")
	clearance := StarClearanceRadius(6)
	out := realisticStats{
		Note: "the traffic play would actually generate, as a counterweight to the randomized sweep's adversarial box: " +
			"every ordered pair of the fixture system's targetable bodies, departing from the source body's own insertion " +
			"standoff, at the star's real clearance radius. Enumerable and pinned, so it records no PRNG.",
		DepartureLadder: "40 departures at 4000 ms intervals from world time 0",
	}
	var residuals, flights []float64
	for _, srcId := range realisticTargets {
		for _, dstId := range realisticTargets {
			if srcId == dstId {
				continue
			}
			for step := 0; step < realisticDepartureCount; step++ {
				departMs := common.WorldMillis(int64(step) * realisticDepartureStepMs)
				src, err := Position(bodies, srcId, departMs)
				if err != nil {
					continue
				}
				body, _ := bodies.Body(srcId)
				from := src.Add(Vec3{X: InsertionStandoff(body)})
				full, err := SolveBurn(bodies, from, Target{BodyId: dstId}, departMs, nominalAccel, nil, clearance, SolveRounds)
				if err != nil {
					continue
				}
				short, err := SolveBurn(bodies, from, Target{BodyId: dstId}, departMs, nominalAccel, nil, clearance, SolveRounds-1)
				if err != nil {
					continue
				}
				out.Burns++
				b := full.Burn
				d := int64(b.ArriveMs) - int64(short.Burn.ArriveMs)
				if d < 0 {
					d = -d
				}
				if d != 0 {
					out.ResidualNonzero++
				}
				residuals = append(residuals, float64(d))
				flights = append(flights, float64(b.ArriveMs-b.DepartMs))

				// task 1.5 (migrate-fleet-to-continuous-burns): see the
				// identical note in sweepSolveBurn above — this is the
				// wrapper's other (and now last) reference in the package.
				if d, _ := minDistanceAndParamOf(b.Curve, arcSampleCount); d <= clearance {
					out.StarClearanceViolations++
				}
				folded, fe := StateAt(bodies, ShipState{Mode: ModeBurn, Burn: &b}, b.ArriveMs)
				if fe != nil || folded.Park == nil {
					continue
				}
				vel, ve := folded.Park.Velocity(bodies, b.ArriveMs)
				if ve != nil {
					continue
				}
				vd, o1 := vel.Normalize()
				td, o2 := b.Curve.Derivative(1).Normalize()
				if o1 && o2 && td.Dot(vd) <= ArrivalTangentAlignmentMin {
					out.TangentBelowFloor++
				}
			}
		}
	}
	sort.Float64s(residuals)
	sort.Float64s(flights)
	out.ResidualP99Ms = percentileMs(residuals, 0.99)
	out.ResidualMaxMs = percentileMs(residuals, 1)
	out.MedianFlightMs = percentileMs(flights, 0.5)
	return out
}

// --- burn evaluation sweeps --------------------------------------------------

var burnEvalAxes = func() []sweepAxis {
	out := axVec("origin", -300, 300)
	out = append(out, axVec("c1", -300, 300)...)
	out = append(out, axVec("c2", -300, 300)...)
	out = append(out, axVec("c3", -300, 300)...)
	out = append(out, axVec("c4", -300, 300)...)
	out = append(out, axVec("intercept", -300, 300)...)
	out = append(out, ax("accel", 0.5, 40))
	out = append(out, iax("departMs", 0, 1_000_000))
	out = append(out, ax("tFrac", -0.25, 1.25))
	return out
}()

// drawBurn states a burn directly rather than solving one: the curve is
// drawn, its length is the curve's own arc length (so the arc length that
// prices the flight IS the arc length that places the ship), and the
// arrival is that length's brachistochrone, ceiling-quantized. tFrac
// straddles both ends of the stored window, so the sweep draws the
// pre-depart and post-arrive clamps as well as the interior.
func drawBurn(r *sweepRNG) (Burn, common.WorldMillis) {
	origin := r.vec(-300, 300)
	c1 := r.vec(-300, 300)
	c2 := r.vec(-300, 300)
	c3 := r.vec(-300, 300)
	c4 := r.vec(-300, 300)
	intercept := r.vec(-300, 300)
	accel := r.box(0.5, 40)
	departMs := common.WorldMillis(r.ibox(0, 1_000_000))
	tFrac := r.box(-0.25, 1.25)

	curve := Curve{P0: origin, C1: c1, C2: c2, C3: c3, C4: c4, P5: intercept}
	length := curve.Length()
	arriveMs := QuantizeArrival(departMs, FlightSeconds(length, accel))
	b := Burn{
		Origin: origin, Target: Target{Point: &intercept}, Intercept: intercept,
		Curve: curve, Length: length, DepartMs: departMs, ArriveMs: arriveMs, Accel: accel,
	}
	t := departMs + common.WorldMillis(int64(float64(tFrac*float64(arriveMs-departMs))))
	return b, t
}

func sweepBurnEval(n int, kind string) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		b, t := drawBurn(r)
		switch kind {
		case "position":
			sh.line(svec(b.Position(t)))
		case "tangent":
			sh.line(svec(b.Tangent(t)))
		default:
			flip := "0"
			if b.BeforeFlip(t) {
				flip = "1"
			}
			sh.line(sline(sfloat(b.Speed(t)), flip, sfloat(b.Progress(t)), sfloat(b.DeltaV())))
		}
	}
	return sh.lines, sh.sum()
}

// --- park and fold sweeps ----------------------------------------------------

var parkAxes = func() []sweepAxis {
	out := []sweepAxis{
		iax("kindSel", 0, 2),
		iax("bodySel", 0, int64(len(sweepParkBodies))-1),
		ax("radius", 0.1, 200),
		iax("periodMs", -20_000, 400_000),
		iax("phase", 0, int64(SubTurn)-1),
		iax("epochMs", 0, 1_000_000),
	}
	out = append(out, axVec("offset", -100, 100)...)
	out = append(out, axVec("point", -500, 500)...)
	out = append(out, iax("t", -1_000_000, 2_000_000))
	return out
}()

// sweepParkBodies are the host bodies a drawn park may hang off — the
// fixture system's own, plus one unknown id so the sweep draws the named
// sentinel-error path too.
var sweepParkBodies = []string{"star", "planet1", "planet2", "moon1", "outpost", "frozen", "nosuchbody"}

var sweepParkKinds = []ParkKind{ParkOrbit, ParkStationkeep, ParkPoint}

func drawPark(r *sweepRNG) (Park, common.WorldMillis) {
	kind := sweepParkKinds[r.ibox(0, 2)]
	body := sweepParkBodies[r.ibox(0, int64(len(sweepParkBodies))-1)]
	radius := r.box(0.1, 200)
	period := common.WorldMillis(r.ibox(-20_000, 400_000))
	phase := SubTurns(r.ibox(0, int64(SubTurn)-1))
	epoch := common.WorldMillis(r.ibox(0, 1_000_000))
	offset := r.vec(-100, 100)
	point := r.vec(-500, 500)
	t := common.WorldMillis(r.ibox(-1_000_000, 2_000_000))
	return Park{
		Kind: kind, BodyId: body, Radius: radius, PeriodMs: period,
		Phase: phase, EpochMs: epoch, Offset: offset, Point: point,
	}, t
}

func sweepParkPosition(t testing.TB, n int) (int, string) {
	bodies := systemBodies(t, "fixture")
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		p, at := drawPark(r)
		pos, err := p.Position(bodies, at)
		if err != nil {
			sh.line(errToken)
			continue
		}
		vel, verr := p.Velocity(bodies, at)
		if verr != nil {
			sh.line(sline(svec(pos), errToken))
			continue
		}
		sh.line(sline(svec(pos), svec(vel)))
	}
	return sh.lines, sh.sum()
}

var stateAtAxes = func() []sweepAxis {
	out := append([]sweepAxis{}, burnEvalAxes...)
	out = append(out, iax("targetSel", 0, int64(len(sweepTargets))-1))
	return out
}()

func sweepStateAt(t testing.TB, n int) (int, string) {
	bodies := systemBodies(t, "fixture")
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		b, at := drawBurn(r)
		sel := r.ibox(0, int64(len(sweepTargets))-1)
		if id := sweepTargets[sel]; id != "" {
			b.Target = Target{BodyId: id}
			b.InsertionPhase = SubTurns(int64(at) & int64(SubTurn-1))
		}
		folded, err := StateAt(bodies, ShipState{Mode: ModeBurn, Burn: &b}, at)
		if err != nil {
			sh.line(errToken)
			continue
		}
		pos, perr := StatePosition(bodies, ShipState{Mode: ModeBurn, Burn: &b}, at)
		posPart := errToken
		if perr == nil {
			posPart = svec(pos)
		}
		if folded.Mode == ModeBurn {
			sh.line(sline("burn", strconv.FormatInt(int64(folded.Burn.ArriveMs), 10), posPart))
			continue
		}
		p := folded.Park
		sh.line(sline("park", parkKindNames[p.Kind], p.BodyId,
			sfloat(p.Radius), strconv.FormatInt(int64(p.PeriodMs), 10),
			strconv.FormatInt(int64(p.Phase), 10), strconv.FormatInt(int64(p.EpochMs), 10),
			svec(p.Point), posPart))
	}
	return sh.lines, sh.sum()
}

// --- codec: EncodeVec / DecodeVec / EncodeSubTurns / DecodeSubTurns --------

var encodeVecAxes = axVec("v", -1e9, 1e9)

// sweepEncodeVec draws a Vec3 from a generous box; EncodeVec performs no
// validation of its own, so this pins that the output is exactly the three
// input components, in order, with no arithmetic in between.
func sweepEncodeVec(n int) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		v := r.vec(-1e9, 1e9)
		out := EncodeVec(v)
		sh.line(sline(sfloat(out[0]), sfloat(out[1]), sfloat(out[2])))
	}
	return sh.lines, sh.sum()
}

var decodeVecAxes = axVec("v", -2e12, 2e12)

// sweepDecodeVec draws a Vec3 from a box overhanging the configured
// +/-1e12 coordinate extent (checkedCoordinate) at both ends, fed through
// DecodeVec as an in-memory []float64 — so both the accepted and the
// ErrCoordinateOutOfExtent branches are drawn in the same sweep.
func sweepDecodeVec(n int) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		v := r.vec(-2e12, 2e12)
		out, err := DecodeVec([]float64{v.X, v.Y, v.Z})
		if err != nil {
			sh.line(errToken)
			continue
		}
		sh.line(svec(out))
	}
	return sh.lines, sh.sum()
}

var encodeSubTurnsAxes = []sweepAxis{iax("a", -10_000_000, 10_000_000)}

// sweepEncodeSubTurns draws a SubTurns angle from a wide integer box;
// EncodeSubTurns performs no validation, so this pins that the output is
// exactly int64(a).
func sweepEncodeSubTurns(n int) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		a := SubTurns(r.ibox(-10_000_000, 10_000_000))
		sh.line(strconv.FormatInt(EncodeSubTurns(a), 10))
	}
	return sh.lines, sh.sum()
}

var decodeSubTurnsAxes = []sweepAxis{iax("raw", -10_000_000, 10_000_000)}

// sweepDecodeSubTurns draws an integer from a wide box and cycles it
// through DecodeSubTurns's three accepted shapes (int, int64, float64) by
// draw index, in that order — the NaN/Inf/unsupported-shape branches are
// not reachable from a uniform box draw and are covered by hand cases
// instead.
func sweepDecodeSubTurns(n int) (int, string) {
	r := newSweepRNG(sweepSeed)
	sh := newSweepHash()
	for i := 0; i < n; i++ {
		raw := r.ibox(-10_000_000, 10_000_000)
		var v any
		switch i % 3 {
		case 0:
			v = int(raw)
		case 1:
			v = raw
		case 2:
			v = float64(raw)
		}
		out, err := DecodeSubTurns(v)
		if err != nil {
			sh.line(errToken)
			continue
		}
		sh.line(strconv.FormatInt(int64(out), 10))
	}
	return sh.lines, sh.sum()
}

// --- the pinned turn table's own family --------------------------------------

// sweepTurnTable is EXHAUSTIVE, not randomized: CosSin's domain is every
// sub-turn index, 2^20 of them, which is enumerable (and only marginally
// above cross-stack-determinism's 10^6 eligibility bound — recorded here as
// the stronger form rather than sampled down to a randomized one).
func sweepTurnTable() (int, string) {
	sh := newSweepHash()
	for i := int64(0); i < int64(SubTurn); i++ {
		cos, sin := CosSin(SubTurns(i))
		sh.line(sline(sfloat(cos), sfloat(sin)))
	}
	return sh.lines, sh.sum()
}

// turnTableFileDigest is the SHA-256 of fixtures/space/turn-table.json's
// bytes — the pinned table asserted as DATA, per cross-stack-determinism's
// "Pinned Constant Tables Are Recorded, Asserted, Never Recomputed"
// Go-only branch. The embedded copy backend/space actually loads is
// asserted byte-identical to that file by turn_table_record_test.go.
func turnTableFileDigest(t testing.TB) string {
	raw, err := os.ReadFile(turnTablePath)
	if err != nil {
		t.Fatalf("read %s: %v", turnTablePath, err)
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

// --- the file --------------------------------------------------------------

type fixtureMeta struct {
	GeneratedOn       generatedOn `json:"generatedOn"`
	BuildTargetMatrix string      `json:"buildTargetMatrix"`
	JSRuntimeLeg      string      `json:"jsRuntimeLeg"`
	Serialization     string      `json:"serialization"`
}

type generatedOn struct {
	GOARCH  string `json:"goarch"`
	GOAMD64 string `json:"goamd64,omitempty"`
}

// measuredParams are the values tasks.md 3.4–3.6 require this family to
// MEASURE and record, so a later loosening fails the family rather than
// passing silently. They are compared like any other recorded case.
type measuredParams struct {
	Note string `json:"note"`

	// SolveRounds is the configured fixed round count; ResidualMs is the
	// largest |arrival(N) − arrival(N−1)| observed over the solveBurn sweep
	// (tasks.md 3.4 — it must be 0 for the chosen N).
	SolveRounds           int   `json:"solveRounds"`
	SolveResidualP99Ms    int64 `json:"solveRoundResidualP99Ms"`
	SolveResidualMaxMs    int64 `json:"solveRoundResidualMaxMs"`
	SolveResidualP99Bound int64 `json:"solveRoundResidualP99BoundMs"`
	SolveResidualMaxBound int64 `json:"solveRoundResidualMaxBoundMs"`
	SolveSweepSolved      int   `json:"solveSweepSolvedCases"`
	SolveSweepTangent     int   `json:"solveSweepTangentCases"`

	// ArrivalTangentWorstDot is the lowest curve-end-tangent · settled-park-
	// velocity alignment observed over the swept body-target insertions;
	// ArrivalTangentThreshold is the configured requirement threshold —
	// 0.95 (the value the source design pins) unless the measured worst
	// case is STRICTER, never looser (tasks.md 3.5).
	ArrivalTangentWorstDot  num `json:"arrivalTangentWorstDot"`
	ArrivalTangentThreshold num `json:"arrivalTangentThreshold"`

	// The star-avoidance split: how many swept insertions were displaced by
	// avoidStar, and the worst alignment among those that were not.
	ArrivalTangentDisplacedCases      int `json:"arrivalTangentDisplacedCases"`
	ArrivalTangentWorstDotUndisplaced num `json:"arrivalTangentWorstDotUndisplaced"`

	// ArrivalPositionalGaps counts swept insertions whose settled-park
	// position at the stored arrival millisecond was not BIT-IDENTICAL to
	// the stored intercept. It is exact by construction, so this is 0 and
	// asserted as such — there is no tolerance to record (tasks.md 3.5).
	ArrivalPositionalGaps int `json:"arrivalPositionalGaps"`

	// The star-clearance guarantee measured over the sweep: how many swept
	// burns carried a positive clearance radius, and how many of those still
	// came at or inside it. The second number is required to be zero.
	StarClearanceCases      int `json:"starClearanceCases"`
	StarClearanceViolations int `json:"starClearanceViolations"`

	// MinArcLength is the configured minimum solved curve length a burn may
	// commit with (tasks.md 3.6): one world-second of flight at the nominal
	// acceleration, recorded here alongside the flight time it implies.
	// RealisticTraffic is the enumerable second sweep — see realisticStats.
	RealisticTraffic realisticStats `json:"realisticTraffic"`

	MinArcLength                 num `json:"minArcLength"`
	MinArcNominalAccel           num `json:"minArcNominalAccel"`
	MinArcFlightSecondsAtNominal num `json:"minArcFlightSecondsAtNominalAccel"`
}

type turnTableCase struct {
	Note string `json:"note"`
	Idx  int64  `json:"idx"`
	Cos  num    `json:"cos"`
	Sin  num    `json:"sin"`
}

type turnTableFileCase struct {
	Note   string `json:"note"`
	Path   string `json:"path"`
	Digest string `json:"digest"`
}

type fixtures struct {
	Meta     *fixtureMeta          `json:"_meta,omitempty"`
	Measured measuredParams        `json:"measured"`
	Systems  map[string]systemJSON `json:"systems"`

	TurnTable      []turnTableCase     `json:"turnTable"`
	TurnTableFile  []turnTableFileCase `json:"turnTableFile"`
	TurnTableSweep []exhaustiveSweep   `json:"turnTableSweep"`

	PhaseIndexOf      []phaseIndexCase `json:"phaseIndexOf"`
	PhaseIndexOfSweep []randomSweep    `json:"phaseIndexOfSweep"`

	OrbitPosition      []orbitCase   `json:"orbitPosition"`
	OrbitPositionSweep []randomSweep `json:"orbitPositionSweep"`
	OrbitVelocity      []orbitCase   `json:"orbitVelocity"`
	OrbitVelocitySweep []randomSweep `json:"orbitVelocitySweep"`

	BodyPosition      []bodyCase    `json:"bodyPosition"`
	BodyPositionSweep []randomSweep `json:"bodyPositionSweep"`
	BodyVelocity      []bodyCase    `json:"bodyVelocity"`
	BodyVelocitySweep []randomSweep `json:"bodyVelocitySweep"`

	CurvePoint           []curveSampleCase `json:"curvePoint"`
	CurvePointSweep      []randomSweep     `json:"curvePointSweep"`
	CurveDerivative      []curveSampleCase `json:"curveDerivative"`
	CurveDerivativeSweep []randomSweep     `json:"curveDerivativeSweep"`

	ArcTable      []arcTableCase `json:"arcTable"`
	ArcTableSweep []randomSweep  `json:"arcTableSweep"`
	ArcParam      []arcParamCase `json:"arcParam"`
	ArcParamSweep []randomSweep  `json:"arcParamSweep"`

	TravelTime      []travelTimeCase `json:"travelTime"`
	TravelTimeSweep []randomSweep    `json:"travelTimeSweep"`

	BuildCurve      []buildCurveCase `json:"buildCurve"`
	BuildCurveSweep []randomSweep    `json:"buildCurveSweep"`

	SolveBurn      []solveBurnCase `json:"solveBurn"`
	SolveBurnSweep []randomSweep   `json:"solveBurnSweep"`

	BurnPosition      []burnVecCase   `json:"burnPosition"`
	BurnPositionSweep []randomSweep   `json:"burnPositionSweep"`
	BurnTangent       []burnVecCase   `json:"burnTangent"`
	BurnTangentSweep  []randomSweep   `json:"burnTangentSweep"`
	BurnSpeed         []burnSpeedCase `json:"burnSpeed"`
	BurnSpeedSweep    []randomSweep   `json:"burnSpeedSweep"`

	ParkPosition      []parkCase    `json:"parkPosition"`
	ParkPositionSweep []randomSweep `json:"parkPositionSweep"`

	StateAt      []stateAtCase `json:"stateAt"`
	StateAtSweep []randomSweep `json:"stateAtSweep"`

	StationkeepCodec      []stationkeepCodecCase      `json:"stationkeepCodec"`
	StationkeepFold       []stationkeepFoldCase       `json:"stationkeepFold"`
	StationkeepDryInstant []stationkeepDryInstantCase `json:"stationkeepDryInstant"`

	EncodeVec      []encodeVecCase `json:"encodeVec"`
	EncodeVecSweep []randomSweep   `json:"encodeVecSweep"`
	DecodeVec      []decodeVecCase `json:"decodeVec"`
	DecodeVecSweep []randomSweep   `json:"decodeVecSweep"`

	EncodeSubTurns      []encodeSubTurnsCase `json:"encodeSubTurns"`
	EncodeSubTurnsSweep []randomSweep        `json:"encodeSubTurnsSweep"`
	DecodeSubTurns      []decodeSubTurnsCase `json:"decodeSubTurns"`
	DecodeSubTurnsSweep []randomSweep        `json:"decodeSubTurnsSweep"`
}

// --- hand-selected cases ---------------------------------------------------

func av(v Vec3) [3]float64 { return [3]float64{v.X, v.Y, v.Z} }

func jcurve(c Curve) curveJSON {
	return curveJSON{P0: av(c.P0), C1: av(c.C1), C2: av(c.C2), C3: av(c.C3), C4: av(c.C4), P5: av(c.P5)}
}

// errName maps this package's sentinel errors to the stable token the
// fixture records, so a recorded failure names WHICH failure.
func errName(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, ErrUnknownBody):
		return "ErrUnknownBody"
	case errors.Is(err, ErrBodyCycle):
		return "ErrBodyCycle"
	case errors.Is(err, ErrArcTooShort):
		return "ErrArcTooShort"
	case errors.Is(err, ErrEndpointInsideClearance):
		return "ErrEndpointInsideClearance"
	case errors.Is(err, ErrUnknownParkKind):
		return "ErrUnknownParkKind"
	case errors.Is(err, ErrNonFiniteCoordinate):
		return "ErrNonFiniteCoordinate"
	case errors.Is(err, ErrCoordinateOutOfExtent):
		return "ErrCoordinateOutOfExtent"
	case errors.Is(err, errNotAVector):
		return "errNotAVector"
	default:
		return "unexpected:" + err.Error()
	}
}

// named curves the curve families reference.
// Each is stated as the cubic its geometry describes and degree-elevated to
// the stored quintic, so the recorded shapes are unchanged by design.md
// Decision 11 and each curve still means what its name says.
var (
	straightCurve = elevateCubicToQuintic(Vec3{0, 0, 0}, Vec3{10, 0, 0}, Vec3{20, 0, 0}, Vec3{30, 0, 0})
	sCurve        = elevateCubicToQuintic(Vec3{0, 0, 0}, Vec3{0, 0, 40}, Vec3{60, 0, -40}, Vec3{60, 0, 0})
	spatialCurve  = elevateCubicToQuintic(Vec3{-50, 10, 20}, Vec3{0, 40, -10}, Vec3{40, -20, 30}, Vec3{70, 5, -25})
	pointCurve    = elevateCubicToQuintic(Vec3{7, 7, 7}, Vec3{7, 7, 7}, Vec3{7, 7, 7}, Vec3{7, 7, 7})
)

// named orbits the orbit families reference.
var (
	planarOrbit   = Orbit{ParentId: "star", Radius: 50, PeriodMs: 100_000}
	inclinedOrbit = Orbit{ParentId: "star", Radius: 80, PeriodMs: 160_000, Inclination: SubTurn / 24}
	nodedOrbit    = Orbit{ParentId: "star", Radius: 20, PeriodMs: 40_000, Phase: SubTurn / 3, Node: SubTurn / 7}
	frozenOrbit   = Orbit{ParentId: "star", Radius: 33, PeriodMs: 0, Phase: SubTurn / 3}
)

func handTurnTable() []turnTableCase {
	inputs := []struct {
		note string
		idx  SubTurns
	}{
		{"zero — the +X axis direction", 0},
		{"one fine step", 1},
		{"the last fine index before the first coarse step", 1023},
		{"the first coarse step", 1024},
		{"quarter turn", SubTurn / 4},
		{"half turn", SubTurn / 2},
		{"three-quarter turn", SubTurn * 3 / 4},
		{"a full turn wraps to zero", SubTurn},
		{"minus one wraps to the last index (a bare '%' would index the table negatively)", -1},
		{"a full turn below zero wraps to zero", -SubTurn},
		{"the inclination the fixture system's second planet carries", SubTurn / 24},
		{"an arbitrary interior index using both table levels", 654_321},
	}
	out := make([]turnTableCase, 0, len(inputs))
	for _, in := range inputs {
		cos, sin := CosSin(in.idx)
		out = append(out, turnTableCase{Note: in.note, Idx: int64(in.idx), Cos: fnum(cos), Sin: fnum(sin)})
	}
	return out
}

func handPhaseIndexOf() []phaseIndexCase {
	// An offset lying exactly on table entry 12345's own direction, and the
	// tie offset exactly between two adjacent entries (their vector sum),
	// are built FROM the table so the "resolves to that entry's own index"
	// and "resolves to the lower index" clauses are pinned by construction.
	onEntryCos, onEntrySin := CosSin(12345)
	tieACos, tieASin := CosSin(500)
	tieBCos, tieBSin := CosSin(501)

	inputs := []struct {
		note   string
		offset Vec3
	}{
		{"the +X axis", Vec3{X: 1}},
		{"the +Z axis (a quarter turn)", Vec3{Z: 1}},
		{"the -X axis (a half turn)", Vec3{X: -1}},
		{"the -Z axis (three quarters)", Vec3{Z: -1}},
		{"the vertical component is ignored — only the X/Z plane resolves", Vec3{X: 1, Y: 900, Z: 0}},
		{"an exact octant diagonal", Vec3{X: 1, Z: 1}},
		{"exactly on table entry 12345's direction — resolves to that entry's own index", Vec3{X: onEntryCos, Z: onEntrySin}},
		{"the sum of adjacent entries 500 and 501 — the documented tie, resolving to the LOWER index", Vec3{X: tieACos + tieBCos, Z: tieASin + tieBSin}},
		{"a large arbitrary offset", Vec3{X: -713.25, Y: 12, Z: 411.5}},
		{"a tiny arbitrary offset — scale-invariant", Vec3{X: -7.1325e-9, Z: 4.115e-9}},
		{"the round trip: an offset built from a planar orbit's own position at a quarter period", planarOrbit.LocalPosition(25_000)},
	}
	out := make([]phaseIndexCase, 0, len(inputs))
	for _, in := range inputs {
		idx, steps := PhaseIndexOf(in.offset)
		out = append(out, phaseIndexCase{Note: in.note, Offset: av(in.offset), Index: int64(idx), Steps: steps})
	}
	return out
}

func handOrbit(velocity bool) []orbitCase {
	inputs := []struct {
		note  string
		orbit Orbit
		t     common.WorldMillis
	}{
		{"planar orbit at the world epoch", planarOrbit, 0},
		{"planar orbit a quarter period on", planarOrbit, 25_000},
		{"planar orbit at exactly one full period — identical to the epoch", planarOrbit, 100_000},
		{"planar orbit one full period BEFORE the epoch — identical to the epoch, no negative table index", planarOrbit, -100_000},
		{"planar orbit at a time strictly before the epoch, mid-period", planarOrbit, -37_500},
		{"inclined orbit a quarter turn past its ascending node — the out-of-plane component peaks", inclinedOrbit, 40_000},
		{"inclined orbit at its ascending node — zero out-of-plane component", inclinedOrbit, 0},
		{"node-rotated orbit at an arbitrary time", nodedOrbit, 12_345},
		{"zero-period orbit — motionless at its stored phase, no division", frozenOrbit, 999_999},
		{"negative-period orbit — motionless, no division", Orbit{ParentId: "star", Radius: 12, PeriodMs: -5, Phase: SubTurn / 6}, 4_242},
	}
	out := make([]orbitCase, 0, len(inputs))
	for _, in := range inputs {
		c := orbitCase{Note: in.note, Orbit: jorbit(in.orbit), T: int64(in.t)}
		if velocity {
			c.Out = fvec(in.orbit.LocalVelocity(in.t))
		} else {
			c.Out = fvec(in.orbit.LocalPosition(in.t))
		}
		out = append(out, c)
	}
	return out
}

func handBody(t testing.TB, velocity bool) []bodyCase {
	inputs := []struct {
		note   string
		system string
		body   string
		t      common.WorldMillis
	}{
		{"a parentless body sits at the origin at every time", "fixture", "star", 0},
		{"a parentless body sits at the origin at every time (again, much later)", "fixture", "star", 987_654_321},
		{"a planet, one level down", "fixture", "planet1", 33_333},
		{"an inclined planet leaves the plane", "fixture", "planet2", 40_000},
		{"a moon composes its parent's position with its own offset", "fixture", "moon1", 33_333},
		{"an outpost four levels deep — the chain's depth bound", "fixture", "outpost", 33_333},
		{"a zero-period body is motionless", "fixture", "frozen", 5_000_000},
		{"a body at a time strictly before the world epoch", "fixture", "moon1", -33_333},
		{"an unknown body identity fails with a named sentinel, never a panic", "fixture", "nosuchbody", 0},
		{"a cyclic parent chain fails with a named sentinel at a bounded depth", "cyclic", "a", 1_000},
	}
	out := make([]bodyCase, 0, len(inputs))
	for _, in := range inputs {
		bodies := systemBodies(t, in.system)
		var v Vec3
		var err error
		if velocity {
			v, err = Velocity(bodies, in.body, in.t)
		} else {
			v, err = Position(bodies, in.body, in.t)
		}
		c := bodyCase{Note: in.note, System: in.system, Body: in.body, T: int64(in.t)}
		if err != nil {
			c.Err = errName(err)
		} else {
			c.Out = fvec(v)
		}
		out = append(out, c)
	}
	return out
}

func handCurveSample(derivative bool) []curveSampleCase {
	inputs := []struct {
		note  string
		curve Curve
		u     float64
	}{
		{"u=0 is exactly P0 (position) / 3*(C1-P0) (derivative)", spatialCurve, 0},
		{"u=1 is exactly P3 (position) / 3*(P3-C2) (derivative)", spatialCurve, 1},
		{"the parameter midpoint of a fully three-dimensional curve", spatialCurve, 0.5},
		{"an interior parameter of a fully three-dimensional curve", spatialCurve, 0.3125},
		{"a straight, evenly-spaced curve at its parameter midpoint", straightCurve, 0.5},
		{"an S-curve, whose arc-length midpoint is nowhere near its parameter midpoint", sCurve, 0.5},
		{"a degenerate zero-length curve", pointCurve, 0.5},
	}
	out := make([]curveSampleCase, 0, len(inputs))
	for _, in := range inputs {
		c := curveSampleCase{Note: in.note, Curve: jcurve(in.curve), U: in.u}
		if derivative {
			c.Out = fvec(in.curve.Derivative(in.u))
		} else {
			c.Out = fvec(in.curve.Point(in.u))
		}
		out = append(out, c)
	}
	return out
}

func handArcTable() []arcTableCase {
	inputs := []struct {
		note  string
		curve Curve
	}{
		{"a straight, evenly-spaced curve — the cumulative chord sums are linear", straightCurve},
		{"an S-curve — table[64] is the length that both prices the flight and places the ship", sCurve},
		{"a fully three-dimensional curve", spatialCurve},
		{"a degenerate zero-length curve — every entry is zero", pointCurve},
	}
	out := make([]arcTableCase, 0, len(inputs))
	for _, in := range inputs {
		table := in.curve.ArcTable()
		rec := make([]num, len(table))
		for i, v := range table {
			rec[i] = fnum(v)
		}
		out = append(out, arcTableCase{Note: in.note, Curve: jcurve(in.curve), Table: rec})
	}
	return out
}

func handArcParam() []arcParamCase {
	inputs := []struct {
		note  string
		curve Curve
		frac  float64
	}{
		{"the start of the curve", sCurve, 0},
		{"the arc-length midpoint of an S-curve — NOT the parameter midpoint", sCurve, 0.5},
		{"the end of the curve", sCurve, 1},
		{"a quarter of the arc length", sCurve, 0.25},
		{"near the end — the search still runs exactly six steps", sCurve, 0.984375},
		{"below zero clamps to the start, still six steps", sCurve, -0.3},
		{"above one clamps to the end, still six steps", sCurve, 1.4},
		{"a straight curve, where arc length and parameter agree", straightCurve, 0.5},
		{"a degenerate zero-length curve — the segment length is zero", pointCurve, 0.5},
	}
	out := make([]arcParamCase, 0, len(inputs))
	for _, in := range inputs {
		u, steps := in.curve.ArcParam(in.frac)
		out = append(out, arcParamCase{Note: in.note, Curve: jcurve(in.curve), Frac: in.frac, U: fnum(u), Steps: steps})
	}
	return out
}

func handTravelTime() []travelTimeCase {
	inputs := []struct {
		note          string
		length, accel float64
		departMs      common.WorldMillis
	}{
		{"the requirement's worked example: 200 units at 8 u/s^2 is 10 seconds", 200, 8, 0},
		{"the same 200-unit path at 2 u/s^2 — quartered acceleration doubles the time", 200, 2, 0},
		{"an exact integer-millisecond flight time is not over-rounded", 200, 8, 12_345},
		{"a fractional flight time quantizes UP, never down", 3.920560002, 8, 1_000},
		{"the configured minimum arc length at the nominal acceleration", MinArcLength, 8, 0},
		{"a very short path", 0.001, 40, 500},
		{"a very long path at a low acceleration", 1_000_000, 0.01, 7},
	}
	out := make([]travelTimeCase, 0, len(inputs))
	for _, in := range inputs {
		secs := FlightSeconds(in.length, in.accel)
		out = append(out, travelTimeCase{
			Note: in.note, Length: in.length, Accel: in.accel, DepartMs: int64(in.departMs),
			Seconds: fnum(secs), ArriveMs: int64(QuantizeArrival(in.departMs, secs)),
		})
	}
	return out
}

// fixtureStarClearance is StarClearanceRadius for the `fixture` system's
// own star (size 6) — the value every star-avoidance case below names,
// resolved through the documented function rather than written as a literal.
var fixtureStarClearance = StarClearanceRadius(6)

func handBuildCurve(t testing.TB) []buildCurveCase {
	bodies := systemBodies(t, "fixture")
	crosswise := Vec3{Z: 1}
	inputs := []struct {
		note      string
		from      Vec3
		target    Target
		arriveMs  common.WorldMillis
		departDir *Vec3
		clearance float64
	}{
		{"a point target with no departure tangent and no star clearance — departs along the chord",
			Vec3{X: 200, Z: 0}, Target{Point: &Vec3{X: 0, Z: 200}}, 50_000, nil, 0},
		{"the same transfer with a crosswise departure tangent — the path bends off the chord",
			Vec3{X: 200, Z: 0}, Target{Point: &Vec3{X: 0, Z: 200}}, 50_000, &crosswise, 0},
		{"a body target: the intercept IS the settled park's own position at the arrival millisecond",
			Vec3{X: 200, Y: 0, Z: 30}, Target{BodyId: "planet1"}, 60_000, nil, 0},
		{"a body target four levels deep",
			Vec3{X: 200, Y: 0, Z: 30}, Target{BodyId: "outpost"}, 60_000, nil, 0},
		{"a motionless (zero-period) body target",
			Vec3{X: 200, Y: 0, Z: 30}, Target{BodyId: "frozen"}, 60_000, nil, 0},
		{"a chord passing near the star — the curve bulges clear of the clearance radius",
			Vec3{X: 100, Y: 0, Z: 5}, Target{Point: &Vec3{X: -100, Z: -5}}, 50_000, nil, fixtureStarClearance},
		{"the chord-parallel grazing regression: the closest approach's radial direction is nearly parallel to the chord, and the displacement is still exactly perpendicular to it",
			Vec3{X: 16, Y: 0, Z: 0}, Target{Point: &Vec3{X: -300}}, 50_000, nil, fixtureStarClearance},
		{"a transfer nowhere near the star — control points left unmodified",
			Vec3{X: 100, Y: 0, Z: 100}, Target{Point: &Vec3{X: 150, Z: 120}}, 50_000, nil, fixtureStarClearance},
		{"an origin already inside the clearance radius is rejected by name",
			Vec3{X: 10, Y: 0, Z: 0}, Target{Point: &Vec3{X: 150, Z: 120}}, 50_000, nil, fixtureStarClearance},
		{"an unknown body target fails by name",
			Vec3{X: 200}, Target{BodyId: "nosuchbody"}, 50_000, nil, 0},
	}
	out := make([]buildCurveCase, 0, len(inputs))
	for _, in := range inputs {
		c := buildCurveCase{
			Note: in.note, System: "fixture", From: av(in.from),
			ArriveMs: int64(in.arriveMs), StarClearance: in.clearance,
		}
		if in.target.Point != nil {
			c.Target = jpointTarget(*in.target.Point)
		} else {
			c.Target = jbodyTarget(in.target.BodyId)
		}
		if in.departDir != nil {
			d := av(*in.departDir)
			c.DepartDir = &d
		}
		res, err := BuildCurve(bodies, in.from, in.target, in.arriveMs, in.departDir, in.clearance)
		if err != nil {
			c.Err = errName(err)
		} else {
			cu := fcurve(res.Curve)
			ic := fvec(res.Intercept)
			c.Curve, c.Intercept, c.InsertionPhase = &cu, &ic, int64(res.InsertionPhase)
		}
		out = append(out, c)
	}
	return out
}

func handSolveBurn(t testing.TB) []solveBurnCase {
	bodies := systemBodies(t, "fixture")
	crosswise := Vec3{Z: 1}
	inputs := []struct {
		note      string
		from      Vec3
		target    Target
		departMs  common.WorldMillis
		accel     float64
		departDir *Vec3
		clearance float64
	}{
		{"a point target — the arrival is the ceiling-quantized brachistochrone of the solved curve's own length",
			Vec3{X: 200}, Target{Point: &Vec3{Z: 200}}, 0, 8, nil, 0},
		{"the same path at a quartered acceleration — twice the flight time, half the delta-v price",
			Vec3{X: 200}, Target{Point: &Vec3{Z: 200}}, 0, 2, nil, 0},
		{"a crosswise departure tangent lengthens the solved curve",
			Vec3{X: 200}, Target{Point: &Vec3{Z: 200}}, 0, 8, &crosswise, 0},
		{"a moving body target",
			Vec3{X: 90, Y: 0, Z: 90}, Target{BodyId: "planet1"}, 0, 8, nil, 0},
		{"the same moving body target departing later — a different intercept, the same stored target identity",
			Vec3{X: 90, Y: 0, Z: 90}, Target{BodyId: "planet1"}, 40_000, 8, nil, 0},
		{"an inclined body target",
			Vec3{X: 90, Y: 0, Z: 90}, Target{BodyId: "planet2"}, 0, 8, nil, 0},
		{"a motionless body target — the estimate stabilises after one round, and the solve still runs every round",
			Vec3{X: 200, Y: 0, Z: 0}, Target{BodyId: "frozen"}, 0, 8, nil, 0},
		{"a body target four levels deep, whose position changes fastest",
			Vec3{X: 200, Y: 0, Z: 0}, Target{BodyId: "outpost"}, 0, 8, nil, 0},
		{"a solve through the star's clearance radius",
			Vec3{X: 100, Y: 0, Z: 5}, Target{Point: &Vec3{X: -100, Z: -5}}, 0, 8, nil, fixtureStarClearance},
		{"a solved curve below the configured minimum arc length is rejected by its own name",
			Vec3{X: 100}, Target{Point: &Vec3{X: 100.5}}, 0, 8, nil, 0},
	}
	out := make([]solveBurnCase, 0, len(inputs))
	for _, in := range inputs {
		c := solveBurnCase{
			Note: in.note, System: "fixture", From: av(in.from), DepartMs: int64(in.departMs),
			Accel: in.accel, StarClearance: in.clearance, Rounds: SolveRounds,
		}
		if in.target.Point != nil {
			c.Target = jpointTarget(*in.target.Point)
		} else {
			c.Target = jbodyTarget(in.target.BodyId)
		}
		if in.departDir != nil {
			d := av(*in.departDir)
			c.DepartDir = &d
		}
		res, err := SolveBurn(bodies, in.from, in.target, in.departMs, in.accel, in.departDir, in.clearance, SolveRounds)
		if err != nil {
			c.Err = errName(err)
		} else {
			b := jburn(res.Burn)
			c.Burn = &b
		}
		out = append(out, c)
	}
	return out
}

// handBurn is the one stated (unsolved) burn the burnPosition/burnTangent/
// burnSpeed families evaluate: an S-curve whose arc-length midpoint is
// nowhere near its parameter midpoint, so the "half the flight duration
// places the ship at half the ARC LENGTH, not at parameter 0.5" clause has
// a curve that can actually distinguish the two.
func handBurn() Burn {
	c := sCurve
	end := c.P5
	length := c.Length()
	accel := 8.0
	depart := common.WorldMillis(10_000)
	return Burn{
		Origin: c.P0, Target: Target{Point: &end}, Intercept: end,
		Curve: c, Length: length, DepartMs: depart,
		ArriveMs: QuantizeArrival(depart, FlightSeconds(length, accel)), Accel: accel,
	}
}

func jburnInput(b Burn) burnInput {
	in := burnInput{
		Origin: av(b.Origin), Intercept: av(b.Intercept), Curve: jcurve(b.Curve),
		Length: b.Length, DepartMs: int64(b.DepartMs), ArriveMs: int64(b.ArriveMs),
		Accel: b.Accel, InsertionPhase: int64(b.InsertionPhase),
	}
	if b.Target.Point != nil {
		in.Target = jpointTarget(*b.Target.Point)
	} else {
		in.Target = jbodyTarget(b.Target.BodyId)
	}
	return in
}

func handBurnTimes(b Burn) []struct {
	note string
	t    common.WorldMillis
} {
	half := b.DepartMs + (b.ArriveMs-b.DepartMs)/2
	return []struct {
		note string
		t    common.WorldMillis
	}{
		{"before depart — clamped to the origin, never extrapolated behind it", b.DepartMs - 5_000},
		{"exactly at depart", b.DepartMs},
		{"one millisecond after depart", b.DepartMs + 1},
		{"one millisecond before the arc-length midpoint", half - 1},
		{"the arc-length midpoint — half the flight duration is half the ARC LENGTH", half},
		{"one millisecond after the arc-length midpoint", half + 1},
		{"one millisecond before arrive", b.ArriveMs - 1},
		{"exactly at arrive", b.ArriveMs},
		{"after arrive — clamped to the intercept", b.ArriveMs + 5_000},
	}
}

func handBurnVec(tangent bool) []burnVecCase {
	b := handBurn()
	in := jburnInput(b)
	out := make([]burnVecCase, 0, 9)
	for _, tc := range handBurnTimes(b) {
		c := burnVecCase{Note: tc.note, Burn: in, T: int64(tc.t)}
		if tangent {
			c.Out = fvec(b.Tangent(tc.t))
		} else {
			c.Out = fvec(b.Position(tc.t))
		}
		out = append(out, c)
	}
	return out
}

func handBurnSpeed() []burnSpeedCase {
	b := handBurn()
	in := jburnInput(b)
	out := make([]burnSpeedCase, 0, 9)
	for _, tc := range handBurnTimes(b) {
		out = append(out, burnSpeedCase{
			Note: tc.note, Burn: in, T: int64(tc.t),
			Speed: fnum(b.Speed(tc.t)), BeforeFlip: b.BeforeFlip(tc.t),
			Progress: fnum(b.Progress(tc.t)), DeltaV: fnum(b.DeltaV()),
		})
	}
	return out
}

func handParkPosition(t testing.TB) []parkCase {
	bodies := systemBodies(t, "fixture")
	released := ReleaseStationkeep("planet1", Vec3{X: 3, Y: 2, Z: 4}, 50)
	inputs := []struct {
		note string
		park Park
		t    common.WorldMillis
	}{
		{"an orbit park at the world epoch", Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 10, PeriodMs: 20_000}, 0},
		{"the same orbit park a quarter period on — still exactly its radius from the body", Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 10, PeriodMs: 20_000}, 5_000},
		{"the same orbit park at exactly one full period", Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 10, PeriodMs: 20_000}, 20_000},
		{"an orbit park evaluated BEFORE its own epoch — the phase wraps backward, no negative table index",
			Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 10, PeriodMs: 90_000, EpochMs: 50_000}, 10_000},
		{"an orbit park one full period before its own epoch — identical to the epoch",
			Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 10, PeriodMs: 90_000, EpochMs: 50_000}, -40_000},
		{"a zero-period orbit park is motionless relative to its body",
			Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 10, PeriodMs: 0, Phase: SubTurn / 5}, 777_777},
		{"a station-keep park holds its exact stored offset in the body's frame",
			Park{Kind: ParkStationkeep, BodyId: "planet1", Offset: Vec3{X: 3, Y: 2, Z: 4}}, 12_000},
		{"the same station-keep park much later — the same exact offset, a moved body",
			Park{Kind: ParkStationkeep, BodyId: "planet1", Offset: Vec3{X: 3, Y: 2, Z: 4}}, 88_000},
		{"a point park never moves", Park{Kind: ParkPoint, Point: Vec3{X: -12, Y: 3, Z: 44}}, 0},
		{"a point park never moves (again, much later)", Park{Kind: ParkPoint, Point: Vec3{X: -12, Y: 3, Z: 44}}, 9_000_000},
		{"a released station-keep hold at offset (3,2,4): radius 5 (the planar magnitude, vertical dropped), epoch 50", released, 50},
		{"the same released hold a while later", released, 5_050},
		{"a released hold directly above the body re-circularizes at the configured minimum radius and the default phase",
			ReleaseStationkeep("planet1", Vec3{Y: 5}, 50), 50},
		{"a park on an unknown body fails by name", Park{Kind: ParkOrbit, BodyId: "nosuchbody", Radius: 10, PeriodMs: 20_000}, 0},
	}
	out := make([]parkCase, 0, len(inputs))
	for _, in := range inputs {
		c := parkCase{Note: in.note, System: "fixture", Park: jpark(in.park), T: int64(in.t)}
		pos, err := in.park.Position(bodies, in.t)
		if err != nil {
			c.Err = errName(err)
			out = append(out, c)
			continue
		}
		p := fvec(pos)
		c.Position = &p
		if vel, verr := in.park.Velocity(bodies, in.t); verr == nil {
			v := fvec(vel)
			c.Velocity = &v
		}
		out = append(out, c)
	}
	return out
}

func handStateAt(t testing.TB) []stateAtCase {
	bodies := systemBodies(t, "fixture")
	pointBurn := handBurn()

	// The body-target burn is produced by the solver, exactly as one would
	// be in play — a change to the solve fails the solveBurn family first,
	// so this case never silently re-baselines behind it.
	solved, err := SolveBurn(bodies, Vec3{X: 90, Y: 0, Z: 90}, Target{BodyId: "planet1"}, 0, 8, nil, 0, SolveRounds)
	if err != nil {
		t.Fatalf("fixture body-target solve failed: %v", err)
	}
	bodyBurn := solved.Burn

	inputs := []struct {
		note string
		burn *Burn
		park *Park
		t    common.WorldMillis
	}{
		{"one millisecond before arrival — still burning", &bodyBurn, nil, bodyBurn.ArriveMs - 1},
		{"exactly at arrival — settled, on an exact integer comparison with no epsilon", &bodyBurn, nil, bodyBurn.ArriveMs},
		{"one millisecond after arrival — settled", &bodyBurn, nil, bodyBurn.ArriveMs + 1},
		{"long after arrival — the settled park, never a frozen burn", &bodyBurn, nil, bodyBurn.ArriveMs + 5_000_000},
		{"a point-targeted burn settles into a point park at its intercept", &pointBurn, nil, pointBurn.ArriveMs + 1},
		{"a point-targeted burn mid-flight", &pointBurn, nil, pointBurn.DepartMs + 1},
		{"an already-parked state folds to itself, unchanged", nil,
			&Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 10, PeriodMs: 20_000}, 33_000},
		{"a settled burn whose target body no longer resolves fails by name", &Burn{
			Origin: Vec3{X: 10}, Target: Target{BodyId: "nosuchbody"}, Intercept: Vec3{X: 20},
			Curve: straightCurve, Length: 30, DepartMs: 0, ArriveMs: 1_000, Accel: 8,
		}, nil, 2_000},
	}
	out := make([]stateAtCase, 0, len(inputs))
	for _, in := range inputs {
		c := stateAtCase{Note: in.note, System: "fixture", T: int64(in.t)}
		state := ShipState{Mode: ModeParked}
		if in.burn != nil {
			bi := jburnInput(*in.burn)
			c.Burn = &bi
			b := *in.burn
			state = ShipState{Mode: ModeBurn, Burn: &b}
		} else {
			pj := jpark(*in.park)
			c.Park = &pj
			p := *in.park
			state = ShipState{Mode: ModeParked, Park: &p}
		}
		folded, err := StateAt(bodies, state, in.t)
		if err != nil {
			c.Err = errName(err)
			c.Mode = "error"
			out = append(out, c)
			continue
		}
		if folded.Mode == ModeBurn {
			c.Mode = "burn"
		} else {
			c.Mode = "parked"
			sp := jpark(*folded.Park)
			c.Settled = &sp
		}
		if pos, perr := StatePosition(bodies, state, in.t); perr == nil {
			p := fvec(pos)
			c.Position = &p
		}
		out = append(out, c)
	}
	return out
}

func handEncodeVec() []encodeVecCase {
	inputs := []struct {
		note string
		v    Vec3
	}{
		{"the zero vector encodes to three zeros", Vec3{}},
		{"positive components encode in x,y,z order", Vec3{X: 12.5, Y: -3.25, Z: 999.125}},
		{"negative components round-trip their sign", Vec3{X: -1, Y: -2, Z: -3}},
		{"EncodeVec performs no validation of its own: a magnitude beyond the configured extent still encodes", Vec3{X: 5e12, Y: 0, Z: 0}},
	}
	out := make([]encodeVecCase, 0, len(inputs))
	for _, in := range inputs {
		enc := EncodeVec(in.v)
		out = append(out, encodeVecCase{
			Note: in.note,
			In:   fvec(in.v),
			Out:  vec3{fnum(enc[0]), fnum(enc[1]), fnum(enc[2])},
		})
	}
	return out
}

func handDecodeVec() []decodeVecCase {
	inputs := []decodeVecInput{
		{note: "an in-memory []float64, EncodeVec's own output shape, round-trips exactly", shape: "float64Slice", values: []float64{12.5, -3.25, 999.125}},
		{note: "a []any of float64s, the shape a JSON HTTP body decode produces", shape: "anySliceFloat64", values: []float64{1, 2, 3}},
		{note: "a []any of int64s, the shape a Firestore round trip produces", shape: "anySliceInt64", values: []float64{1, 2, 3}},
		{note: "a []any of ints, an in-memory literal built by hand", shape: "anySliceInt", values: []float64{4, 5, 6}},
		{note: "a []any mixing int, int64, and float64 elements in draw order — decodeNumber's three accepted branches in one call", shape: "anySliceMixed", values: []float64{7, 8, 9}},
		{note: "the zero vector round-trips exactly", shape: "float64Slice", values: []float64{0, 0, 0}},
		{note: "negative components round-trip exactly", shape: "float64Slice", values: []float64{-1, -2, -3}},

		{note: "a NaN x component is rejected by name, not silently", shape: "float64Slice", values: []float64{0, 0, 0}, bad: "nan", badAt: 0},
		{note: "a positive-infinity y component is rejected by name", shape: "float64Slice", values: []float64{0, 0, 0}, bad: "posInf", badAt: 1},
		{note: "a negative-infinity z component is rejected by name", shape: "float64Slice", values: []float64{0, 0, 0}, bad: "negInf", badAt: 2},
		{note: "a component beyond the configured +/-1e12 extent is rejected by name", shape: "float64Slice", values: []float64{0, 0, 2e12}},
		{note: "a two-element slice is rejected — not a recognized shape", shape: "float64Slice", values: []float64{1, 2}},
		{note: "a four-element slice is rejected — not a recognized shape", shape: "float64Slice", values: []float64{1, 2, 3, 4}},
		{note: "a []any with one trailing non-numeric element is rejected", shape: "anySliceBad", values: []float64{1, 2}},
		{note: "a value that is not a slice at all is rejected", shape: "notASlice"},
		{note: "a slice of an unsupported element type is rejected", shape: "wrongType"},
	}
	out := make([]decodeVecCase, 0, len(inputs))
	for _, in := range inputs {
		got, err := DecodeVec(in.value())
		var values []float64
		if len(in.values) > 0 {
			values = append([]float64{}, in.values...)
		}
		c := decodeVecCase{
			Note: in.note, Shape: in.shape,
			Values: values,
			Bad:    in.bad, BadAt: in.badAt,
		}
		if err != nil {
			c.Err = errName(err)
		} else {
			c.Out = fvec(got)
		}
		out = append(out, c)
	}
	return out
}

func handEncodeSubTurns() []encodeSubTurnsCase {
	inputs := []struct {
		note string
		a    SubTurns
	}{
		{"zero encodes to zero", 0},
		{"a positive angle encodes to the identical int64", 123456},
		{"a negative angle encodes to the identical int64 — no non-negative assumption", -42},
		{"a multi-turn magnitude round-trips exactly", SubTurns(SubTurn * 3)},
	}
	out := make([]encodeSubTurnsCase, 0, len(inputs))
	for _, in := range inputs {
		out = append(out, encodeSubTurnsCase{Note: in.note, In: int64(in.a), Out: EncodeSubTurns(in.a)})
	}
	return out
}

func handDecodeSubTurns() []decodeSubTurnsCase {
	inputs := []decodeSubTurnsInput{
		{note: "an in-memory int round-trips exactly", kind: "int", n: 777},
		{note: "a Firestore int64 round-trips exactly", kind: "int64", n: 777},
		{note: "a JSON float64 round-trips exactly", kind: "float64", f: 777},
		{note: "a negative angle round-trips exactly", kind: "int64", n: -42},
		{note: "a positive fractional float64 truncates toward zero", kind: "float64", f: 1234.9},
		{note: "a negative fractional float64 truncates toward zero", kind: "float64", f: -1234.9},
		{note: "a NaN float64 is rejected by name, not silently", kind: "nan"},
		{note: "a positive-infinity float64 is rejected by name", kind: "posInf"},
		{note: "a negative-infinity float64 is rejected by name", kind: "negInf"},
		{note: "an unsupported shape is rejected, distinct from the non-finite error", kind: "invalid"},
	}
	out := make([]decodeSubTurnsCase, 0, len(inputs))
	for _, in := range inputs {
		got, err := DecodeSubTurns(in.value())
		c := decodeSubTurnsCase{Note: in.note, Kind: in.kind, N: in.n, F: in.f}
		if err != nil {
			c.Err = errName(err)
		} else {
			c.Out = int64(got)
		}
		out = append(out, c)
	}
	return out
}

// --- assembly ----------------------------------------------------------------

func randSweep(note string, axes []sweepAxis, count, lines int, digest, serialization string) []randomSweep {
	return []randomSweep{{
		Note: note, PRNG: "splitmix64", Seed: sweepSeed, DrawMapping: drawMapping,
		Draws: axes, Count: count, Serialization: serialization, Lines: lines, Digest: digest,
	}}
}

func computeFixtures(t testing.TB) fixtures {
	f := fixtures{Systems: fixtureSystems()}

	// --- turnTable (the pinned constant table's own family) ---------------
	f.TurnTable = handTurnTable()
	f.TurnTableFile = []turnTableFileCase{{
		Note:   "the pinned two-level sub-turn table, asserted as DATA: SHA-256 of the committed file's bytes. backend/space embeds a byte-identical copy (turn_table_record_test.go asserts that), and never recomputes an entry at runtime.",
		Path:   "fixtures/space/turn-table.json",
		Digest: turnTableFileDigest(t),
	}}
	ttLines, ttDigest := sweepTurnTable()
	f.TurnTableSweep = []exhaustiveSweep{{
		Note:          "EXHAUSTIVE, not randomized: CosSin's domain is every sub-turn index, and 2^20 of them is enumerable — recorded in the stronger form rather than sampled down.",
		Domain:        "every idx in [0, SubTurn) ascending, SubTurn = 2^20",
		Serialization: serFloats,
		Lines:         ttLines,
		Digest:        ttDigest,
	}}

	// --- phaseIndexOf ------------------------------------------------------
	f.PhaseIndexOf = handPhaseIndexOf()
	{
		lines, digest := sweepPhaseIndexOf(sweepCountCheap)
		f.PhaseIndexOfSweep = randSweep("a Cartesian offset drawn from a box straddling the origin in all three axes; the recorded output is the resolved index and the (always twenty) step count",
			phaseIndexAxes, sweepCountCheap, lines, digest, serMixed)
	}

	// --- orbitPosition / orbitVelocity -------------------------------------
	f.OrbitPosition = handOrbit(false)
	f.OrbitVelocity = handOrbit(true)
	{
		lines, digest := sweepOrbit(sweepCountCheap, false)
		f.OrbitPositionSweep = randSweep("orbital elements and a world time drawn independently; the time box straddles the orbit's own epoch (world time 0 for a bare Orbit), so the before-epoch wrap branch is drawn",
			orbitAxes, sweepCountCheap, lines, digest, serFloats)
	}
	{
		lines, digest := sweepOrbit(sweepCountCheap, true)
		f.OrbitVelocitySweep = randSweep("the same draw stream as orbitPositionSweep, evaluated for analytic local velocity",
			orbitAxes, sweepCountCheap, lines, digest, serFloats)
	}

	// --- bodyPosition / bodyVelocity ---------------------------------------
	f.BodyPosition = handBody(t, false)
	f.BodyVelocity = handBody(t, true)
	{
		lines, digest := sweepBody(sweepCountCheap, false)
		f.BodyPositionSweep = randSweep("a three-level chain (parentless a -> b -> c) with independently drawn elements, evaluated at c so hierarchical composition is what is swept",
			bodyAxes, sweepCountCheap, lines, digest, serFloats)
	}
	{
		lines, digest := sweepBody(sweepCountCheap, true)
		f.BodyVelocitySweep = randSweep("the same draw stream as bodyPositionSweep, evaluated for analytic velocity",
			bodyAxes, sweepCountCheap, lines, digest, serFloats)
	}

	// --- curvePoint / curveDerivative --------------------------------------
	f.CurvePoint = handCurveSample(false)
	f.CurveDerivative = handCurveSample(true)
	{
		lines, digest := sweepCurveSample(sweepCountCheap, false)
		f.CurvePointSweep = randSweep("four independently drawn control points and a parameter in [0,1]", curveSampleAxes, sweepCountCheap, lines, digest, serFloats)
	}
	{
		lines, digest := sweepCurveSample(sweepCountCheap, true)
		f.CurveDerivativeSweep = randSweep("the same draw stream as curvePointSweep, evaluated for the analytic derivative", curveSampleAxes, sweepCountCheap, lines, digest, serFloats)
	}

	// --- arcTable / arcParam -----------------------------------------------
	f.ArcTable = handArcTable()
	f.ArcParam = handArcParam()
	{
		lines, digest := sweepArcTable(sweepCountCurve)
		f.ArcTableSweep = randSweep("four independently drawn control points; the recorded output is all 65 cumulative chord sums", curveAxes, sweepCountCurve, lines, digest, serFloats)
	}
	{
		lines, digest := sweepArcParam(sweepCountCurve)
		f.ArcParamSweep = randSweep("four control points and an arc-length fraction drawn from a box that overhangs [0,1] at both ends, so the clamps are drawn; the output is the parameter and the (always six) step count",
			arcParamAxes, sweepCountCurve, lines, digest, serMixed)
	}

	// --- travelTime ---------------------------------------------------------
	f.TravelTime = handTravelTime()
	{
		lines, digest := sweepTravelTime(sweepCountCheap)
		f.TravelTimeSweep = randSweep("a curve length, an acceleration and a departure millisecond; the output is the brachistochrone flight time and its ceiling-quantized integer arrival — the family that discharges this capability's sqrt-pinning obligation",
			travelTimeAxes, sweepCountCheap, lines, digest, serMixed)
	}

	// --- buildCurve / solveBurn --------------------------------------------
	f.BuildCurve = handBuildCurve(t)
	f.SolveBurn = handSolveBurn(t)
	{
		lines, digest := sweepBuildCurve(t, sweepCountSolve)
		f.BuildCurveSweep = randSweep("an origin, a target (a drawn point or one of the `fixture` system's bodies), an arrival millisecond, an optional departure tangent and a star-clearance radius; the output is the four control points, the intercept and the insertion phase index",
			buildCurveAxes, sweepCountSolve, lines, digest, serMixed)
	}
	solve := sweepSolveBurn(t, sweepCountSolve, SolveRounds)
	f.SolveBurnSweep = randSweep("the buildCurve draw stream with the arrival replaced by a departure and an acceleration appended; the output is the solved curve, intercept, length, quantized arrival, insertion phase and executed round count",
		solveBurnAxes, sweepCountSolve, solve.lines, solve.digest, serMixed)

	// --- burnPosition / burnTangent / burnSpeed -----------------------------
	f.BurnPosition = handBurnVec(false)
	f.BurnTangent = handBurnVec(true)
	f.BurnSpeed = handBurnSpeed()
	{
		lines, digest := sweepBurnEval(sweepCountCurve, "position")
		f.BurnPositionSweep = randSweep("a burn stated directly (drawn control points, the curve's own arc length, the ceiling-quantized brachistochrone arrival) and a time drawn from a box overhanging both ends of the stored window, so both clamps are drawn",
			burnEvalAxes, sweepCountCurve, lines, digest, serFloats)
	}
	{
		lines, digest := sweepBurnEval(sweepCountCurve, "tangent")
		f.BurnTangentSweep = randSweep("the same draw stream as burnPositionSweep, evaluated for the unit tangent", burnEvalAxes, sweepCountCurve, lines, digest, serFloats)
	}
	{
		lines, digest := sweepBurnEval(sweepCountCurve, "speed")
		f.BurnSpeedSweep = randSweep("the same draw stream as burnPositionSweep; the output is speed, the flip indicator, progress and the delta-v price", burnEvalAxes, sweepCountCurve, lines, digest, serMixed)
	}

	// --- parkPosition -------------------------------------------------------
	f.ParkPosition = handParkPosition(t)
	{
		lines, digest := sweepParkPosition(t, sweepCountCheap)
		f.ParkPositionSweep = randSweep("all three park kinds over the `fixture` system's bodies plus one unknown id, with a time box straddling the drawn epoch; the output is position and velocity",
			parkAxes, sweepCountCheap, lines, digest, serFloats)
	}

	// --- stateAt ------------------------------------------------------------
	f.StateAt = handStateAt(t)
	{
		lines, digest := sweepStateAt(t, sweepCountCurve)
		f.StateAtSweep = randSweep("the burnPosition draw stream with a target selection appended and a time straddling arrival; the output is the folded mode, the settled park's stored fields and the folded position",
			stateAtAxes, sweepCountCurve, lines, digest, serMixed)
	}

	// --- station-keeping (add-stationkeep-hold-verb) ------------------------
	f.StationkeepCodec = handStationkeepCodec()
	f.StationkeepFold = handStationkeepFold(t)
	f.StationkeepDryInstant = handStationkeepDryInstant()

	// --- codec: EncodeVec / DecodeVec / EncodeSubTurns / DecodeSubTurns -----
	f.EncodeVec = handEncodeVec()
	{
		lines, digest := sweepEncodeVec(sweepCountCheap)
		f.EncodeVecSweep = randSweep("a Vec3 drawn from a generous box; EncodeVec performs no validation of its own, so the output is exactly the three input components in x,y,z order",
			encodeVecAxes, sweepCountCheap, lines, digest, serFloats)
	}
	f.DecodeVec = handDecodeVec()
	{
		lines, digest := sweepDecodeVec(sweepCountCheap)
		f.DecodeVecSweep = randSweep("a Vec3 drawn from a box overhanging the configured +/-1e12 coordinate extent (checkedCoordinate) at both ends, fed through DecodeVec as an in-memory []float64; both the accepted and the ErrCoordinateOutOfExtent branches are drawn",
			decodeVecAxes, sweepCountCheap, lines, digest, serFloats)
	}
	f.EncodeSubTurns = handEncodeSubTurns()
	{
		lines, digest := sweepEncodeSubTurns(sweepCountCheap)
		f.EncodeSubTurnsSweep = randSweep("a SubTurns angle drawn from a wide integer box; EncodeSubTurns performs no validation, so the output is exactly int64(a)",
			encodeSubTurnsAxes, sweepCountCheap, lines, digest, serMixed)
	}
	f.DecodeSubTurns = handDecodeSubTurns()
	{
		lines, digest := sweepDecodeSubTurns(sweepCountCheap)
		f.DecodeSubTurnsSweep = randSweep("an integer drawn from a wide box, cycled through DecodeSubTurns's three accepted shapes (int, int64, float64) by draw index in that order; the NaN/Inf/unsupported-shape branches are hand cases instead, since a uniform box draw cannot produce them",
			decodeSubTurnsAxes, sweepCountCheap, lines, digest, serMixed)
	}

	// --- the measured parameters (tasks.md 3.4-3.6) -------------------------
	threshold := ArrivalTangentAlignmentMin
	if solve.tangentCases > 0 && solve.worstTangentDot > threshold {
		threshold = solve.worstTangentDot
	}
	f.Measured = measuredParams{
		Note: "measured over solveBurnSweep's own drawn cases (openspec add-space-kinematics tasks.md 3.4-3.6). A later loosening of any of these fails this family rather than passing silently.",

		SolveRounds:           SolveRounds,
		SolveResidualP99Ms:    percentileMs(solve.residuals, 0.99),
		SolveResidualMaxMs:    solve.maxResidualMs,
		SolveResidualP99Bound: SolveRoundResidualP99BoundMs,
		SolveResidualMaxBound: SolveRoundResidualMaxBoundMs,
		SolveSweepSolved:      solve.solved,
		SolveSweepTangent:     solve.tangentCases,

		ArrivalTangentWorstDot:  fnum(solve.worstTangentDot),
		ArrivalTangentThreshold: fnum(threshold),

		ArrivalTangentDisplacedCases:      solve.displacedCases,
		ArrivalTangentWorstDotUndisplaced: fnum(solve.worstUndisplacedDot),
		ArrivalPositionalGaps:             solve.positionalGaps,

		StarClearanceCases:      solve.clearanceCases,
		StarClearanceViolations: solve.clearanceViolations,

		RealisticTraffic: sweepRealisticTraffic(t),

		MinArcLength:                 fnum(MinArcLength),
		MinArcNominalAccel:           fnum(nominalAccel),
		MinArcFlightSecondsAtNominal: fnum(FlightSeconds(MinArcLength, nominalAccel)),
	}
	return f
}

func TestFixtures_MatchGolden(t *testing.T) {
	computed := computeFixtures(t)

	if os.Getenv("UPDATE_FIXTURES") == "1" {
		computed.Meta = &fixtureMeta{
			GeneratedOn:       generatedOn{GOARCH: runtime.GOARCH, GOAMD64: os.Getenv("GOAMD64")},
			BuildTargetMatrix: "GOARCH=arm64 and GOARCH=amd64 with GOAMD64=v1",
			JSRuntimeLeg:      jsRuntimeLegStatement,
			Serialization:     "every recorded output value is strconv.FormatFloat(v, 'b', -1, 64); inputs are plain JSON numbers",
		}
		if err := os.MkdirAll(filepath.Dir(fixturesPath), 0o755); err != nil {
			t.Fatal(err)
		}
		data, err := json.MarshalIndent(computed, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(fixturesPath, append(data, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Logf("wrote fixtures to %s", fixturesPath)
		return
	}

	raw, err := os.ReadFile(fixturesPath)
	if err != nil {
		t.Fatalf("read golden fixtures (regenerate with UPDATE_FIXTURES=1): %v", err)
	}
	var golden fixtures
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatalf("unmarshal golden: %v", err)
	}
	// _meta records where the file was RECORDED; this assert runs on every
	// leg of the build-target matrix, so the stamp must not participate.
	golden.Meta = nil

	if !reflect.DeepEqual(golden, computed) {
		reportFixtureDrift(t, golden, computed)
		t.Fatal("space output drifted from committed /fixtures/space/cases.json — " +
			"if intentional, regenerate with UPDATE_FIXTURES=1 and review the diff")
	}
}

// reportFixtureDrift names the family (or families) that drifted, so a
// failure points at a function rather than at a 40,000-line struct dump.
func reportFixtureDrift(t *testing.T, golden, computed fixtures) {
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
	raw, err := os.ReadFile(fixturesPath)
	if err != nil {
		t.Fatalf("read golden fixtures: %v", err)
	}
	var f fixtures
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("unmarshal golden: %v", err)
	}
	if f.Meta == nil {
		t.Fatal("fixtures/space/cases.json has no _meta block — it must record its recording provenance and its no-JS-leg statement")
	}
	if f.Meta.GeneratedOn.GOARCH == "" {
		t.Error("_meta.generatedOn.goarch is empty — the fixture must record the build target it was recorded on")
	}
	if f.Meta.JSRuntimeLeg != jsRuntimeLegStatement {
		t.Errorf("_meta.jsRuntimeLeg = %q, want the recorded no-JS-leg statement %q", f.Meta.JSRuntimeLeg, jsRuntimeLegStatement)
	}
	if !strings.Contains(f.Meta.BuildTargetMatrix, "arm64") || !strings.Contains(f.Meta.BuildTargetMatrix, "amd64") {
		t.Errorf("_meta.buildTargetMatrix = %q, want both Go legs named", f.Meta.BuildTargetMatrix)
	}
}

var _ = fmt.Sprintf

// TestFixtures_MeasuredParamsSatisfyTheirRequirements turns the recorded
// measurements into a gate rather than a note (tasks.md 3.4/3.5): the
// round count is only valid if the swept residual is zero, and the arrival
// tangent threshold is only valid if the measured worst case is at or
// above the 0.95 the source design pins — "a measured value looser than
// 0.95 is a failure of this requirement, not a re-baselining of it"
// (space-kinematics: "Arrival Is Tangent to the Target's Settled Motion,
// With No Perceptible Discontinuity").
func TestFixtures_MeasuredParamsSatisfyTheirRequirements(t *testing.T) {
	m := recordedMeasurements(t)

	// The round residual is asserted by solve_test.go's own
	// RoundResidualIsWithinTheRecordedBound scenario, which reads this same
	// recorded block — kept there so it fails once, under the requirement's
	// own name.

	if m.StarClearanceViolations != 0 {
		t.Errorf("%d of %d swept burns with a positive star-clearance radius still came at or inside it, want 0 — "+
			"space-kinematics: \"A burn crossing near the star bulges clear of it\" is an unconditional guarantee, "+
			"not a best effort. Retune avoidanceRounds/minAvoidanceWeight (burn.go) rather than re-recording this.",
			m.StarClearanceViolations, m.StarClearanceCases)
	}
	if m.StarClearanceCases == 0 {
		t.Error("the sweep drew no burn with a positive star-clearance radius — the clearance guarantee is untested")
	}

	worst, err := parseNum(m.ArrivalTangentWorstDot)
	if err != nil {
		t.Fatalf("measured.arrivalTangentWorstDot %q is not a parseable float: %v", m.ArrivalTangentWorstDot, err)
	}
	if worst <= ArrivalTangentAlignmentMin {
		t.Errorf("worst measured arrival tangent alignment is %v over %d swept insertions (%d of them star-avoidance "+
			"displaced), want strictly greater than %v. Since design.md Decision 11 the curve is a quintic and "+
			"avoidance displaces only its INTERIOR control points, so the arrival tangent 5*(P5-C4) is untouched by "+
			"any displacement at any magnitude — an alignment below the floor now means that invariant has been "+
			"broken (something moved C1 or C4), not that a burn had to bulge too hard.",
			worst, m.SolveSweepTangent, m.ArrivalTangentDisplacedCases, ArrivalTangentAlignmentMin)
	}

	if m.ArrivalPositionalGaps != 0 {
		t.Errorf("%d swept insertions had a settled-park position that was not bit-identical to the stored intercept, want 0 — "+
			"the discontinuity is exact by construction (space-kinematics: \"Position does not visibly jump across arrival\")",
			m.ArrivalPositionalGaps)
	}
}

// recordedMeasurements reads the committed fixture file's `measured` block.
// Scenario tests elsewhere in this package assert against it rather than
// re-running a 5,000-case sweep of their own, so there is exactly one place
// those numbers are produced.
func recordedMeasurements(t testing.TB) measuredParams {
	t.Helper()
	raw, err := os.ReadFile(fixturesPath)
	if err != nil {
		t.Fatalf("read golden fixtures: %v", err)
	}
	var f fixtures
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("unmarshal golden: %v", err)
	}
	return f.Measured
}

// --- station-keeping generators (add-stationkeep-hold-verb) ----------------

func handStationkeepCodec() []stationkeepCodecCase {
	inputs := []struct {
		note string
		park Park
	}{
		{"a station-keep park round-trips its stored hold window exactly",
			Park{Kind: ParkStationkeep, BodyId: "moon1", Offset: Vec3{X: 1.5, Y: 0, Z: -2.5},
				HoldStartMs: 12_000, DryInstantMs: 98_765}},
		{"a one-millisecond hold is a legal, storable park — any strictly positive spendable remainder ceilings to at least one whole millisecond",
			Park{Kind: ParkStationkeep, BodyId: "planet1", Offset: Vec3{X: 4, Y: 1, Z: -3},
				HoldStartMs: 10_000, DryInstantMs: 10_001}},
		{"a dry instant equal to its hold start fails to decode — the exact value hold's insufficient-fuel precondition exists to keep off disk, since persisting it bricks the fleet",
			Park{Kind: ParkStationkeep, BodyId: "planet1", Offset: Vec3{X: 4, Y: 1, Z: -3},
				HoldStartMs: 10_000, DryInstantMs: 10_000}},
		{"a dry instant before its hold start fails to decode",
			Park{Kind: ParkStationkeep, BodyId: "planet1", HoldStartMs: 10_000, DryInstantMs: 9_999}},
		{"a non-positive hold start fails to decode — an absent one decodes to zero, and every accrual then runs from world-epoch zero",
			Park{Kind: ParkStationkeep, BodyId: "planet1", HoldStartMs: 0, DryInstantMs: 20_000}},
		{"an orbit park carries no hold window at all and still round-trips",
			Park{Kind: ParkOrbit, BodyId: "planet1", Radius: 12.5, PeriodMs: 45_000, Phase: SubTurns(1000), EpochMs: 7_000}},
		{"a released orbit — what the past-dry-instant fold writes over a stationkeep park — carries no hold window",
			ReleaseStationkeep("planet1", Vec3{X: 4, Y: 1, Z: -3}, 40_000)},
	}
	out := make([]stationkeepCodecCase, 0, len(inputs))
	for _, in := range inputs {
		enc := EncodePark(in.park)
		c := stationkeepCodecCase{
			Note:             in.note,
			Park:             jpark(in.park),
			EncodedHoldStart: enc[holdStartKey].(int64),
			EncodedDryInst:   enc[dryInstantKey].(int64),
		}
		got, err := DecodePark(enc)
		if err != nil {
			c.Err = errName(err)
		} else {
			c.RoundTrips = got == in.park
		}
		out = append(out, c)
	}
	return out
}

func handStationkeepFold(t testing.TB) []stationkeepFoldCase {
	bodies := systemBodies(t, "fixture")
	held := func(bodyId string, offset Vec3, holdStart, dry common.WorldMillis) Park {
		return Park{Kind: ParkStationkeep, BodyId: bodyId, Offset: offset,
			HoldStartMs: holdStart, DryInstantMs: dry}
	}
	inputs := []struct {
		note string
		park Park
		t    common.WorldMillis
	}{
		{"one millisecond before the dry instant — still held, at its exact stored offset",
			held("planet1", Vec3{X: 12, Y: 4, Z: -9}, 1_000, 50_000), 49_999},
		{"exactly at the dry instant — already released, on the same inclusive boundary the burn-arrival fold uses",
			held("planet1", Vec3{X: 12, Y: 4, Z: -9}, 1_000, 50_000), 50_000},
		{"one millisecond after the dry instant — released",
			held("planet1", Vec3{X: 12, Y: 4, Z: -9}, 1_000, 50_000), 50_001},
		{"long after the dry instant — the identical released orbit, since the fold releases AS OF the dry instant, never as of the observation time",
			held("planet1", Vec3{X: 12, Y: 4, Z: -9}, 1_000, 50_000), 9_000_000},
		{"a held offset with no planar component re-circularizes at the configured minimum orbit radius and the default phase",
			held("moon1", Vec3{X: 0, Y: 7, Z: 0}, 500, 20_000), 20_001},
		{"a park whose stored window is not strictly increasing never folds — that park is undecodable by this capability's own codec, and an in-memory one is left exactly as given",
			held("planet1", Vec3{X: 3, Y: 0, Z: 4}, 2_000, 2_000), 999_999},
	}
	out := make([]stationkeepFoldCase, 0, len(inputs))
	for _, in := range inputs {
		p := in.park
		folded, err := StateAt(bodies, ShipState{Mode: ModeParked, Park: &p}, in.t)
		if err != nil {
			t.Fatalf("stationkeepFold fixture: StateAt(%v, t=%d): %v", in.park, in.t, err)
		}
		c := stationkeepFoldCase{
			Note: in.note, System: "fixture", Park: jpark(in.park), T: int64(in.t),
			Folded:               jpark(*folded.Park),
			ReleaseStationkeepAt: jpark(ReleaseStationkeep(in.park.BodyId, in.park.Offset, in.park.DryInstantMs)),
		}
		if pos, perr := StatePosition(bodies, ShipState{Mode: ModeParked, Park: &p}, in.t); perr == nil {
			v := fvec(pos)
			c.Position = &v
		}
		out = append(out, c)
	}
	return out
}

// handStationkeepDryInstant transcribes fleet-movement's dry-instant formula
// LITERALLY, as the chain of named quantities the requirement states, rather
// than as a rearrangement — so a reader can diff it against the requirement
// line for line, and so backend/fleet's own production implementation is
// pinned against an independently written expression rather than against
// itself.
func handStationkeepDryInstant() []stationkeepDryInstantCase {
	dryInstant := func(holdStart common.WorldMillis, fuelTons, reserveTons, deltaVPerTon, rate float64) common.WorldMillis {
		spendableDeltaV := (fuelTons - reserveTons) * deltaVPerTon
		seconds := spendableDeltaV / rate
		return holdStart + common.WorldMillis(int64(math.Ceil(seconds*1000)))
	}
	inputs := []struct {
		note                              string
		holdStart                         common.WorldMillis
		fuel, reserve, deltaVPerTon, rate float64
	}{
		{"today's placeholder tuning at the configured upkeep floor: deltaVPerTon 5, a non-zero reserve, a whole-second answer",
			1_000_000, 105, 5, 5, StationKeepFloor},
		{"the same hold with the reserve dropped to zero — the dry instant moves by exactly the reserve's own endurance, which is what makes a missing subtraction visible",
			1_000_000, 105, 0, 5, StationKeepFloor},
		{"deltaVPerTon = 1, isolating the ms-to-seconds conversion from the tons conversion",
			1, 42, 2, 1, 0.05},
		{"a spendable remainder that does NOT land on a whole millisecond — the ceiling, not a truncation",
			7, 10.0000001, 5, 5, 3.0},
		{"a spendable remainder of one part in a billion still ceilings to a whole millisecond past the hold start",
			500, 5 + 1e-9, 5, 5, 1.1977178758806546},
		{"a rate far above the floor (a tight, fast-orbiting host) shortens the window without changing the arithmetic",
			123_456, 200, 5, 5, 97.5},
	}
	out := make([]stationkeepDryInstantCase, 0, len(inputs))
	for _, in := range inputs {
		dry := dryInstant(in.holdStart, in.fuel, in.reserve, in.deltaVPerTon, in.rate)
		out = append(out, stationkeepDryInstantCase{
			Note:                    in.note,
			HoldStartMs:             int64(in.holdStart),
			FuelTons:                in.fuel,
			StationKeepReserveTons:  in.reserve,
			DeltaVPerTon:            in.deltaVPerTon,
			UpkeepRate:              in.rate,
			DryInstantMs:            int64(dry),
			SpendableTons:           fnum(in.fuel - in.reserve),
			AccrualAtDryInstantTons: fnum(StationKeepUpkeep(in.rate, in.holdStart, dry) / in.deltaVPerTon),
			OneMsOfUpkeepTons:       fnum((in.rate * 0.001) / in.deltaVPerTon),
		})
	}
	return out
}
