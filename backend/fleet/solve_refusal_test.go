package fleet

// Helper-level tests for solveBurnClassified's pinned decision order
// (impl-contract 3.3), added post-handoff by the SDET so the per-commit
// test-file coverage convention (one *_test.go per source file) is met for
// solve_refusal.go. The behaviour is also covered end to end through the
// handler by the solve_refusal_*_test.go files.

import (
	"errors"
	"testing"

	"hexaverse/space"
)

func TestSolveBurnClassified_DecisionOrder(t *testing.T) {
	bodies := faultBodies{"feat-star": {Id: "feat-star", Size: 6}}
	pt := func(x float64) space.Target { p := space.Vec3{X: x}; return space.Target{Point: &p} }
	cases := []struct {
		name   string
		from   space.Vec3
		target space.Target
		want   error
	}{
		{"absent body outranks an origin inside", space.Vec3{X: 10}, space.Target{BodyId: "nope"}, ErrTargetBodyAbsent},
		{"origin inside outranks a destination inside", space.Vec3{X: 10}, pt(12), ErrOriginInsideClearance},
		{"origin exactly at the clearance is inside", space.Vec3{X: 15}, pt(150), ErrOriginInsideClearance},
		{"destination inside", space.Vec3{X: 150}, pt(12), ErrDestinationInsideClearance},
		{"curve below the minimum arc", space.Vec3{X: 150}, pt(151), ErrBurnArcTooShort},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := solveBurnClassified(t.Context(), routeOrder, "f", "s", bodies, c.from, c.target, 0, 8, nil, 15)
			if !errors.Is(err, c.want) {
				t.Fatalf("err = %v, want %v", err, c.want)
			}
		})
	}
	t.Run("a clear order solves", func(t *testing.T) {
		if _, err := solveBurnClassified(t.Context(), routeOrder, "f", "s", bodies, space.Vec3{X: 150}, pt(300), 0, 8, nil, 15); err != nil {
			t.Fatalf("err = %v", err)
		}
	})
}
