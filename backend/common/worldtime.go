package common

import (
	"sync"
	"time"

	"hexaverse/config"
)

// WorldTime is the game's simulation clock. Gameplay never stores wall-clock
// stamps: every persisted timestamp — a fleet's departure, an action's ETA, an
// observation's asOf — is expressed in *worldTime units* (milliseconds since the
// world epoch, scaled). This is spec #0005's contract, pulled forward to M1 so
// that no bare time.Now() ever leaks into domain code.
//
//	worldTime(t) = (wallNow − worldEpoch) × scale
//
// scale warps how fast the simulation advances relative to wall time. Prod runs
// at 1 (real time); dev/test run fast so a burn that "takes an hour" resolves in
// seconds. scale must NEVER change on a world that already holds data — the
// stored stamps would reinterpret. Dev worlds are disposable, so that's fine.
type WorldTime interface {
	// Now returns the current world time in milliseconds since the world epoch.
	Now() WorldMillis
	// FromWall converts a wall-clock instant into world time.
	FromWall(t time.Time) WorldMillis
	// Scale is the time-warp factor this clock was constructed with.
	Scale() float64
}

// WorldMillis is a duration/instant in world time, measured in milliseconds
// since the world epoch. It is a distinct type so it can't be silently confused
// with a wall-clock unix-millis value.
type WorldMillis int64

// Add returns this instant advanced by the given number of world milliseconds.
func (w WorldMillis) Add(delta WorldMillis) WorldMillis { return w + delta }

// worldClock is the production implementation, driven by the real wall clock.
type worldClock struct {
	epoch time.Time
	scale float64
}

func (c *worldClock) Now() WorldMillis { return c.FromWall(time.Now()) }
func (c *worldClock) Scale() float64   { return c.scale }
func (c *worldClock) FromWall(t time.Time) WorldMillis {
	elapsed := t.Sub(c.epoch).Milliseconds()
	return WorldMillis(float64(elapsed) * c.scale)
}

// NewWorldTime builds a clock from an epoch and a scale factor.
func NewWorldTime(epoch time.Time, scale float64) WorldTime {
	if scale <= 0 {
		scale = 1
	}
	return &worldClock{epoch: epoch, scale: scale}
}

// worldEpoch is the fixed reference instant for all world clocks: 2026-01-01
// UTC. It's arbitrary but must stay constant — every stored stamp is relative to
// it. Kept in the far-enough past that Now() is always positive.
var worldEpoch = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

var (
	defaultWorldTime WorldTime
	worldTimeOnce    sync.Once
)

// WorldClock returns the process-wide singleton clock, constructed once from
// config the first time it's needed. Domain code calls this instead of
// time.Now(). Tests inject their own WorldTime via NewWorldTime / a fake.
func WorldClock() WorldTime {
	worldTimeOnce.Do(func() {
		defaultWorldTime = NewWorldTime(worldEpoch, config.ServiceConfig.WorldTimeScale)
	})
	return defaultWorldTime
}
