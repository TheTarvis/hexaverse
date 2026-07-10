package board

import "hexaverse/common"

// Mode is the fleet's movement state discriminator. Exactly one of the state's
// shapes is populated (#0004: one field, three shapes).
type Mode string

const (
	ModeCoast  Mode = "coast"
	ModeBurn   Mode = "burn"
	ModeDocked Mode = "docked"
)

// Target is a burn destination — a hex OR a feature to intercept (exactly one).
type Target struct {
	Hex       *Hex   `json:"hex,omitempty" firestore:"hex,omitempty"`
	FeatureId string `json:"featureId,omitempty" firestore:"featureId,omitempty"`
}

// Burn is the volatile state: a straight hex-line path traversed over real time.
type Burn struct {
	Path         []Hex              `json:"path" firestore:"path"`
	StartTime    common.WorldMillis `json:"startTime" firestore:"startTime"`
	ArriveTime   common.WorldMillis `json:"arriveTime" firestore:"arriveTime"`
	Target       Target             `json:"target" firestore:"target"`
	DockOnArrive string             `json:"dockOnArrive,omitempty" firestore:"dockOnArrive,omitempty"`
}

// Docked rides a parent feature (a moon-style parentId ride). Its live hex is
// the parent's — resolved by the caller, which holds the interior.
type Docked struct {
	ParentId string `json:"parentId" firestore:"parentId"`
}

// MovementState is the fleet's single movement field, three shapes. No per-tick
// position is stored — the live hex is computed from (state, worldTime).
type MovementState struct {
	Mode   Mode    `json:"mode" firestore:"mode"`
	Coast  *Orbit  `json:"coast,omitempty" firestore:"coast,omitempty"`
	Burn   *Burn   `json:"burn,omitempty" firestore:"burn,omitempty"`
	Docked *Docked `json:"docked,omitempty" firestore:"docked,omitempty"`
}

// BurnPos returns the fleet's quantized hex along its burn path at time t. The
// logical hex is the nearest path cell (the pixel glides between; that's a
// render concern). Clamped to the endpoints outside the burn window.
func BurnPos(b Burn, t common.WorldMillis) Hex {
	n := len(b.Path)
	if n == 0 {
		return Hex{0, 0}
	}
	if t <= b.StartTime || b.ArriveTime <= b.StartTime {
		return b.Path[0]
	}
	if t >= b.ArriveTime {
		return b.Path[n-1]
	}
	frac := float64(t-b.StartTime) / float64(b.ArriveTime-b.StartTime)
	idx := roundf(frac * float64(n-1))
	if idx < 0 {
		idx = 0
	}
	if idx > n-1 {
		idx = n - 1
	}
	return b.Path[idx]
}

// ShipPos returns the fleet's computed hex for coast and burn states. Docked
// returns ok=false because its hex is the parent's — the caller resolves it
// from the interior.
func ShipPos(s MovementState, t common.WorldMillis) (Hex, bool) {
	switch s.Mode {
	case ModeCoast:
		if s.Coast == nil {
			return Hex{0, 0}, true
		}
		return OrbState(*s.Coast, t), true
	case ModeBurn:
		if s.Burn == nil {
			return Hex{0, 0}, false
		}
		return BurnPos(*s.Burn, t), true
	default: // docked — needs the parent feature
		return Hex{0, 0}, false
	}
}

// Arrived reports whether a burning fleet has reached its arrival time.
func Arrived(s MovementState, t common.WorldMillis) bool {
	return s.Mode == ModeBurn && s.Burn != nil && t >= s.Burn.ArriveTime
}
