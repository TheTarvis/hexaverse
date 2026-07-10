package galaxy

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"math/rand"

	"github.com/rs/zerolog/log"
)

// SystemSeed derives a stable per-system seed from the galaxy seed and a system
// id. This is the single derivation both the M1 skeleton phase and #0003's
// detail phase key off, so a system's bodies are the same however you reach
// them. Exported so `backend/system/` can share it (build order).
func SystemSeed(galaxySeed int64, systemId string) int64 {
	h := fnv.New64a()
	// Mix the galaxy seed in first so two galaxies with the same system ids
	// (e.g. "sys-0") still diverge.
	var buf [8]byte
	for i := 0; i < 8; i++ {
		buf[i] = byte(galaxySeed >> (uint(i) * 8))
	}
	_, _ = h.Write(buf[:])
	_, _ = h.Write([]byte(systemId))
	return int64(h.Sum64())
}

// newRand builds a deterministic RNG for a given seed. Isolated so every
// stochastic step draws from a named, reproducible stream.
func newRand(seed int64) *rand.Rand {
	return rand.New(rand.NewSource(seed))
}

// devGalaxy is the editable definition of the galaxy auto-seeded on local /
// emulator boot — the one knob to tweak when you want a different world for
// `make run` or the e2e stack. The galaxy is procedurally generated, so "the
// seed" is a number + params, not a hand-authored system list: change Seed to
// reshape the whole galaxy, or Params for its size/density. Either way the
// system ids stay "sys-0", "sys-1", … so drill-in URLs and specs stay stable.
//
// Defaults to the small, fast start-area shape (~28 systems) — ideal for the
// wiped-every-run e2e emulator. Swap in DefaultParams() for a full galaxy.
var devGalaxy = struct {
	Seed   int64
	Params GenerationParams
}{
	Seed:   StartAreaSeed,
	Params: StartAreaParams(),
}

// SeedDevGalaxy ensures a live galaxy exists for local / emulator runs (dev and
// the e2e test stack), mirroring Flywheel's marketplace.SeedOfficialTemplates:
// an idempotent, editable, domain-owned seed run at startup. If a live galaxy is
// already present it does nothing — so restarts and repeated boots are cheap and
// never clobber a galaxy you seeded deliberately with `make seed`. Otherwise it
// generates + persists devGalaxy and points "live" at it.
//
// Gated by the caller (main.go: config.IsLocal()) so it never runs in prod,
// where the galaxy is seeded on purpose, not on boot.
func SeedDevGalaxy(ctx context.Context) error {
	svc := NewService()

	existing, err := svc.LiveGalaxyMeta(ctx)
	switch {
	case err == nil && existing != nil:
		log.Info().Ctx(ctx).Str("galaxyId", existing.Id).
			Msg("Seed: live galaxy already present, skipping")
		return nil
	case errors.Is(err, ErrNoLiveGalaxy):
		// No live galaxy yet — fall through and seed one.
	case err != nil:
		return fmt.Errorf("checking for live galaxy: %w", err)
	}

	gen, err := svc.Generate(ctx, devGalaxy.Seed, devGalaxy.Params)
	if err != nil {
		return fmt.Errorf("seeding dev galaxy: %w", err)
	}
	log.Info().Ctx(ctx).Str("galaxyId", gen.Galaxy.Id).
		Int("systems", len(gen.Systems)).Int("lanes", len(gen.Lanes)).
		Msg("Seed: created dev galaxy")
	return nil
}
