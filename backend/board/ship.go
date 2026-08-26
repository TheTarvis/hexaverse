package board

import (
	"hexaverse/common"
	"hexaverse/polar"
)

// Mode is the fleet's movement state discriminator. Exactly one of the state's
// shapes is populated (#0004: one field, three shapes).
type Mode string

const (
	ModeCoast  Mode = "coast"
	ModeBurn   Mode = "burn"
	ModeDocked Mode = "docked"
	// ModeLaneTransit — crossing the galaxy graph between systems (#0008): an
	// optional board leg (burn to the departure gate) then lane hops, positioned
	// piecewise from (route, legEtas, worldTime). Collapses to coast on arrival.
	ModeLaneTransit Mode = "laneTransit"
	// ModeLaneHold — halted mid-lane after a cancel, parked at a frozen fraction
	// between two systems, visible, until re-ordered (#0008 Decision #12).
	ModeLaneHold Mode = "laneHold"
)

// Target is a burn destination — a cell OR a feature to intercept (exactly one).
type Target struct {
	Cell      *Cell  `json:"cell,omitempty" firestore:"cell,omitempty"`
	FeatureId string `json:"featureId,omitempty" firestore:"featureId,omitempty"`
}

// Burn is the volatile state: an arc path traversed over real time.
type Burn struct {
	Path         []Cell             `json:"path" firestore:"path"`
	StartTime    common.WorldMillis `json:"startTime" firestore:"startTime"`
	ArriveTime   common.WorldMillis `json:"arriveTime" firestore:"arriveTime"`
	Target       Target             `json:"target" firestore:"target"`
	DockOnArrive string             `json:"dockOnArrive,omitempty" firestore:"dockOnArrive,omitempty"`
}

// Docked rides a parent feature (a moon-style parentId ride). Its live cell is
// the parent's — resolved by the caller, which holds the interior.
type Docked struct {
	ParentId string `json:"parentId" firestore:"parentId"`
}

// BoardLeg is leg 0 of a trip (#0008): the #0004 burn from the fleet's current
// position across the origin board to the departure gate cell, inside the one
// trip action. Zero-length when the fleet already sits on the gate.
type BoardLeg struct {
	Path      []Cell             `json:"path" firestore:"path"`
	StartTime common.WorldMillis `json:"startTime" firestore:"startTime"`
	GateEta   common.WorldMillis `json:"gateEta" firestore:"gateEta"`
}

// LaneTransit is the graph-tier crossing (#0008): an optional board leg, then a
// route of systemIds with cumulative arrival stamps. Route[0] is the origin;
// LegEtas[i] is the world time the fleet reaches Route[i] (LegEtas[0] == the gate
// ETA — when it enters the first lane). Position is computed piecewise; nothing
// is stored per tick. EntryGate is the arriving lane's gate cell on the dest board.
type LaneTransit struct {
	BoardLeg   *BoardLeg            `json:"boardLeg,omitempty" firestore:"boardLeg,omitempty"`
	Route      []string             `json:"route" firestore:"route"`
	LegEtas    []common.WorldMillis `json:"legEtas" firestore:"legEtas"`
	DepartTime common.WorldMillis   `json:"departTime" firestore:"departTime"`
	ArriveTime common.WorldMillis   `json:"arriveTime" firestore:"arriveTime"`
	EntryGate  Cell                 `json:"entryGate" firestore:"entryGate"`
	// LaneIds are the lanes the route crosses (Route[i]→Route[i+1]), frozen at
	// commit so the arrival resolver charts them `via: traveled` without a
	// galaxy read inside the resolve transaction (#0006 Decision #17 — arrival
	// explores the destination; onward roads wait for a scan).
	LaneIds []string `json:"laneIds,omitempty" firestore:"laneIds,omitempty"`
}

// LaneHold is a fleet parked mid-lane after a cancel: a frozen fraction between
// two systems, visible until re-ordered (#0008 Decision #12).
type LaneHold struct {
	From     string  `json:"from" firestore:"from"`
	To       string  `json:"to" firestore:"to"`
	Fraction float64 `json:"fraction" firestore:"fraction"`
}

// MovementState is the fleet's single movement field, one shape at a time. No
// per-tick position is stored — the live cell/graph position is computed from
// (state, worldTime).
type MovementState struct {
	Mode        Mode         `json:"mode" firestore:"mode"`
	Coast       *Orbit       `json:"coast,omitempty" firestore:"coast,omitempty"`
	Burn        *Burn        `json:"burn,omitempty" firestore:"burn,omitempty"`
	Docked      *Docked      `json:"docked,omitempty" firestore:"docked,omitempty"`
	LaneTransit *LaneTransit `json:"laneTransit,omitempty" firestore:"laneTransit,omitempty"`
	LaneHold    *LaneHold    `json:"laneHold,omitempty" firestore:"laneHold,omitempty"`
}

// LaneFraction returns which lane a transit is on at time t and how far along it
// (0..1), as route indices from→to. Before the gate ETA it reports the first lane
// at fraction 0; past arrival, the last lane at fraction 1. ok is false when the
// transit has no lanes (route shorter than two systems).
func LaneFraction(lt LaneTransit, t common.WorldMillis) (from, to int, frac float64, ok bool) {
	n := len(lt.Route)
	if n < 2 || len(lt.LegEtas) != n {
		return 0, 0, 0, false
	}
	if t <= lt.LegEtas[0] {
		return 0, 1, 0, true
	}
	for i := 0; i < n-1; i++ {
		start, end := lt.LegEtas[i], lt.LegEtas[i+1]
		if t < end {
			if end <= start {
				return i, i + 1, 0, true
			}
			return i, i + 1, float64(t-start) / float64(end-start), true
		}
	}
	return n - 2, n - 1, 1, true
}

// BurnPos returns the fleet's quantized cell along its burn path at time t. The
// logical cell is the nearest path index (the pixel glides between; that's a
// render concern), computed from elapsed and total burn time in exact integer
// arithmetic (openspec board-tactical-math, "Computed Ship Board Position"):
// idx = round(elapsed × (len−1) / total), round-half-up — no float, so the
// index is identical across the seam and across build targets. Clamped to the
// endpoints outside the burn window.
func BurnPos(b Burn, t common.WorldMillis) Cell {
	n := len(b.Path)
	if n == 0 {
		return Cell{Ring: 0, Slot: 0}
	}
	if t <= b.StartTime || b.ArriveTime <= b.StartTime {
		return b.Path[0]
	}
	if t >= b.ArriveTime {
		return b.Path[n-1]
	}
	elapsed := int64(t - b.StartTime)
	total := int64(b.ArriveTime - b.StartTime)
	// round-half-up in pure integers: ⌊(2·elapsed·(n−1) + total) / (2·total)⌋.
	idx := (2*elapsed*int64(n-1) + total) / (2 * total)
	if idx < 0 {
		idx = 0
	}
	if idx > int64(n-1) {
		idx = int64(n - 1)
	}
	return b.Path[idx]
}

// CoastAt returns the resting state a fleet settles into on cell c at world time
// `at`: a free prograde orbit on c's ring, back-solved to pass through c
// (OrbitThrough), paced by the world's one orbital law. `at` is load-bearing —
// an orbit anchored at the wrong instant puts the ship somewhere it never was.
// Pass the arrival/settle time, never a bare zero.
//
// The anchor is snapped to the NEAREST ring-cell window boundary, not to `at`
// itself. Every orbit advances cells at the same absolute instants (multiples of
// period/slots — angle0 shifts which cell, never when), and the renderer glides
// by that absolute window fraction. Anchoring mid-window therefore draws a
// freshly settled ship up to a full cell prograde of its halt cell — cancel a
// burn and the ship visibly lands one cell "ahead" on the ring. Snapping bounds
// the discontinuity to half a cell either side; the quantized cell may read one
// cell shy of c for the tail of the settle window (it eases INTO c at the
// boundary), which the settle rule tolerates — the anti-teleport guarantee is
// "where you stopped, give or take the cell you're crossing", not exactness.
func CoastAt(c Cell, at common.WorldMillis, s polar.Schedule) MovementState {
	c = Canon(c, s)
	period := common.Tuning().OrbitPeriod(c.Ring)
	slots := s.Slots(c.Ring)
	orbit := OrbitThrough(c, snapToCellBoundary(at, period, slots), period, 1, s)
	return MovementState{Mode: ModeCoast, Coast: &orbit}
}

// snapToCellBoundary rounds `at` to the nearest absolute ring-cell window
// boundary (see CoastAt), where the ring advances a cell every period/slots.
// Integer math, mirrored exactly in lib/board.
func snapToCellBoundary(at, period common.WorldMillis, slots int) common.WorldMillis {
	if slots <= 1 || period <= 0 {
		return at
	}
	oneStep := period / common.WorldMillis(slots)
	if oneStep <= 0 {
		return at
	}
	k := (at + oneStep/2) / oneStep
	return k * oneStep
}

// StateAt returns the state the fleet is IN at time t: the stored state with any
// completed kinematics folded forward. A burn past its arriveTime IS its settled
// state — docked onto its target, or coasting the local orbit anchored at the
// arrival instant — that's not a projection or an estimate, it's what the state
// is. The persisted doc is a cache of this fold; the authoritative settle
// (Get/resolve through the action spine) writes the same state this computes,
// plus the effects that must happen exactly once (slot release, reveals, deltas).
// Nothing that answers "where/what is this fleet" may read a stored state
// without going through here; only resolvers and the settle path itself read raw.
//
// Lane transit is deliberately NOT folded: a lane arrival moves the fleet to
// another system and reveals what's there — facts beyond MovementState that only
// the resolve may establish. A due transit reads unchanged (positioned at its
// lane endpoint) until the authoritative resolve lands.
func StateAt(st MovementState, t common.WorldMillis, s polar.Schedule) MovementState {
	if st.Mode != ModeBurn || st.Burn == nil || len(st.Burn.Path) == 0 || t < st.Burn.ArriveTime {
		return st
	}
	b := st.Burn
	if b.DockOnArrive != "" {
		return MovementState{Mode: ModeDocked, Docked: &Docked{ParentId: b.DockOnArrive}}
	}
	return CoastAt(b.Path[len(b.Path)-1], b.ArriveTime, s)
}

// ShipPos returns the fleet's computed board cell. It reports ok=false whenever
// the fleet has no cell on the current system's board: docked (its cell is the
// parent's, resolved from the interior), parked mid-lane (lane-hold), or already
// out on a lane past the departure gate. During a trip's board leg the fleet is
// still on the origin board burning to the gate, so ShipPos returns that cell.
//
// It evaluates the EFFECTIVE state (StateAt), so a stored burn whose arrival has
// passed answers as the coast it settled into — a reader that forgets to project
// still gets the right position — and a due dock-on-arrive answers ok=false (its
// cell is the parent's, which has moved on since the burn ended).
func ShipPos(st MovementState, t common.WorldMillis, s polar.Schedule) (Cell, bool) {
	st = StateAt(st, t, s)
	switch st.Mode {
	case ModeCoast:
		if st.Coast == nil {
			return Cell{Ring: 0, Slot: 0}, true
		}
		return OrbState(*st.Coast, t, s), true
	case ModeBurn:
		if st.Burn == nil {
			return Cell{Ring: 0, Slot: 0}, false
		}
		return BurnPos(*st.Burn, t), true
	case ModeLaneTransit:
		lt := st.LaneTransit
		if lt == nil || lt.BoardLeg == nil || len(lt.BoardLeg.Path) == 0 {
			return Cell{Ring: 0, Slot: 0}, false
		}
		// On the origin board only while burning to the gate; once past the gate
		// the fleet is out on the lane (no board cell — the galaxy view shows it).
		if t < lt.BoardLeg.GateEta {
			return BurnPos(Burn{Path: lt.BoardLeg.Path, StartTime: lt.BoardLeg.StartTime, ArriveTime: lt.BoardLeg.GateEta}, t), true
		}
		return Cell{Ring: 0, Slot: 0}, false
	default: // docked / lane-hold — no board cell on the current system
		return Cell{Ring: 0, Slot: 0}, false
	}
}

// Arrived reports whether a fleet's active kinematic order has reached its
// completion time — a burn's arrival or a lane trip's destination arrival. The
// read path settles it through the action spine on the next touch (no scheduler).
//
// Arrived is a STORED-state question ("is there a due settle to run?"), asked by
// the settle path before it resolves. Effective state (StateAt) never reports an
// arrived burn — the fold already settled it — so ask Arrived of the raw doc.
func Arrived(s MovementState, t common.WorldMillis) bool {
	switch s.Mode {
	case ModeBurn:
		return s.Burn != nil && t >= s.Burn.ArriveTime
	case ModeLaneTransit:
		return s.LaneTransit != nil && t >= s.LaneTransit.ArriveTime
	default:
		return false
	}
}
