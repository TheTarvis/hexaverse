package galaxy

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"hexaverse/tuning"
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
// `make run` or the e2e stack. The galaxy is an infinite procedural field, so
// "the seed" is a number + params, not a hand-authored system list: change Seed
// to reshape the world, or StartAreaBlockRadius for how much of it exists
// before anyone plays. Either way system ids are their field coordinates
// ("sys_0_-1", …), stable across seeds and materialization order, so drill-in
// URLs and specs stay meaningful.
//
// Defaults to the start-area shape — the origin block and its ring of
// neighbours, ideal for the wiped-every-run e2e emulator. The world grows from
// there on its own as players scan and spawn.
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
// materializes devGalaxy's start area, validates it, and points "live" at it.
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

	meta, err := svc.Seed(ctx, int64(tuning.Number("generation.seed", float64(devGalaxy.Seed))), localSeedParams())
	if err != nil {
		return fmt.Errorf("seeding dev galaxy: %w", err)
	}
	log.Info().Ctx(ctx).Str("galaxyId", meta.Id).
		Str("originSystem", meta.OriginSystemId).
		Int("blocks", len(StartAreaBlocks(devGalaxy.Params))).
		Msg("Seed: created dev galaxy")
	return nil
}

func localSeedParams() GenerationParams {
	if tuning.Enabled() {
		return StartAreaParams()
	}
	return devGalaxy.Params
}
