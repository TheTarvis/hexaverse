package disclosure

import (
	"hexaverse/common"
	"hexaverse/space"
)

// The proximity-disclosure suite's own tiny in-memory implementations of
// the two interfaces this package reads the world through. Both exist for
// the same reason space's fakeBodies does: the capability owns no storage
// and mints nothing, so a test supplies the world rather than a fixture
// loading one.

type fakeBodies map[string]space.Body

func (f fakeBodies) Body(id string) (space.Body, bool) {
	b, ok := f[id]
	return b, ok
}

// fakeAttachments maps a ship to the host it is docked to. AttachedTo
// derives the reverse relation by scanning, sorted so that the order a
// focused scan mints in is stable — an unstable order would make the same
// sweep produce different output, which is the one thing the interface's
// doc comment forbids.
type fakeAttachments map[string]string

func (f fakeAttachments) HostOf(id string) (string, bool) {
	h, ok := f[id]
	return h, ok
}

func (f fakeAttachments) AttachedTo(hostId string) []string {
	var out []string
	for child, host := range f {
		if host == hostId {
			out = append(out, child)
		}
	}
	sortStrings(out)
	return out
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}

// starSize is the PoC generator's own star size (spike/space-3d/sim.ts),
// the scale every knob in params.go was calibrated against.
const starSize float64 = 6

// testWorld is a star at the origin with one motionless planet, which is
// all most scenarios here need: the star is the capability's only occluder,
// and the planet exists to prove that a body on the sightline does NOT
// occlude.
func testWorld(att Attachments) World {
	return World{
		Bodies: fakeBodies{
			"star": {Id: "star", Size: starSize},
			// A motionless planet (period 0 holds it at its stored phase),
			// so every scenario's geometry is exactly what it reads as.
			"planet": {Id: "planet", Size: 3, Orbit: &space.Orbit{ParentId: "star", Radius: 40, PeriodMs: 0, Phase: 0}},
		},
		Attachments: att,
		StarId:      "star",
		StarSize:    starSize,
	}
}

// parkedAt builds a ship parked at a fixed point — the simplest stored
// state whose position is exactly the coordinate written in the test.
func parkedAt(id string, p space.Vec3) Ship {
	return Ship{
		Id:    id,
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: p}},
	}
}

// burningFrom builds a ship mid-burn along a straight point-to-point
// transfer, with the stored departure/arrival integers and commanded
// acceleration a plume derives from.
func burningFrom(id string, from, to space.Vec3, departMs, arriveMs common.WorldMillis, accel, driveOutput float64) Ship {
	target := to
	// A degenerate quintic whose control points are the two endpoints: a
	// straight line, so a scenario's geometry is exactly what it reads as.
	curve := space.Curve{P0: from, C1: from, C2: from, C3: to, C4: to, P5: to}
	return Ship{
		Id:          id,
		DriveOutput: driveOutput,
		State: space.ShipState{
			Mode: space.ModeBurn,
			Burn: &space.Burn{
				Origin:    from,
				Target:    space.Target{Point: &target},
				Intercept: to,
				Curve:     curve,
				Length:    to.Sub(from).Length(),
				DepartMs:  departMs,
				ArriveMs:  arriveMs,
				Accel:     accel,
			},
		},
	}
}

// observerAt is the requester's sensor at a position, at the default
// passive range.
func observerAt(p space.Vec3) Observer {
	return Observer{Position: p, PassiveRange: PassiveRange}
}
