package galaxy

import (
	"hash/fnv"
	"math/rand"
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
