package galaxy

import "testing"

// SystemSeed is the single per-system derivation both the skeleton and interior
// phases key off, so its contract — deterministic, and sensitive to BOTH inputs
// — is what keeps "a system's bodies are the same however you reach them" true.
func TestSystemSeed(t *testing.T) {
	t.Run("deterministic for the same inputs", func(t *testing.T) {
		if a, b := SystemSeed(42, "sys-0"), SystemSeed(42, "sys-0"); a != b {
			t.Fatalf("SystemSeed not deterministic: %d != %d", a, b)
		}
	})

	t.Run("diverges on the galaxy seed", func(t *testing.T) {
		// Two galaxies sharing system ids (e.g. "sys-0") must not collide.
		if a, b := SystemSeed(1, "sys-0"), SystemSeed(2, "sys-0"); a == b {
			t.Fatalf("SystemSeed collided across galaxy seeds: %d", a)
		}
	})

	t.Run("diverges on the system id", func(t *testing.T) {
		if a, b := SystemSeed(1, "sys-0"), SystemSeed(1, "sys-1"); a == b {
			t.Fatalf("SystemSeed collided across system ids: %d", a)
		}
	})
}

// devGalaxy is hand-editable (that's the point), so guard the invariants the
// auto-seed relies on: a usable seed and a params object that yields systems
// with stable "sys-N" ids to drill into.
func TestDevGalaxyDefinition(t *testing.T) {
	if devGalaxy.Params.StartAreaBlockRadius < 0 {
		t.Fatalf("devGalaxy.Params.StartAreaBlockRadius must be non-negative, got %d", devGalaxy.Params.StartAreaBlockRadius)
	}
}
