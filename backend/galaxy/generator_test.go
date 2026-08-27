package galaxy

import (
	"reflect"
	"testing"
)

func TestGenerateStartArea_DeterministicAndWellFormed(t *testing.T) {
	a := GenerateStartArea(StartAreaSeed, StartAreaParams())
	b := GenerateStartArea(StartAreaSeed, StartAreaParams())

	if !reflect.DeepEqual(a, b) {
		t.Fatal("the same seed produced a different start area")
	}
	if len(a.Systems) == 0 || len(a.Lanes) == 0 {
		t.Fatalf("empty start area: %d systems, %d lanes", len(a.Systems), len(a.Lanes))
	}
	if a.Galaxy.OriginSystemId == "" {
		t.Fatal("start area has no origin system")
	}

	// The asset must never draw a lane to a node it does not carry.
	present := map[string]bool{}
	for _, s := range a.Systems {
		present[s.Id] = true
	}
	for _, l := range a.Lanes {
		if !present[l.AId] || !present[l.BId] {
			t.Fatalf("lane %s reaches outside the start area (%s/%s)", l.Id, l.AId, l.BId)
		}
		if l.AId == l.BId {
			t.Fatalf("lane %s is a self-loop", l.Id)
		}
	}
}

// The origin system is the world's anchor: it must be a real materialized
// system near the field origin, and stable across runs.
func TestGenerateStartArea_OriginIsNearestSurvivor(t *testing.T) {
	gen := GenerateStartArea(StartAreaSeed, StartAreaParams())
	var origin *System
	best := -1.0
	for i := range gen.Systems {
		s := &gen.Systems[i]
		d := s.Coords.X*s.Coords.X + s.Coords.Y*s.Coords.Y + s.Coords.Z*s.Coords.Z
		if best < 0 || d < best {
			best, origin = d, s
		}
	}
	if origin == nil || gen.Galaxy.OriginSystemId != origin.Id {
		t.Fatalf("origin = %q, want the nearest survivor %v", gen.Galaxy.OriginSystemId, origin)
	}
}

func TestInspectStartArea_ReportsTheOriginComponent(t *testing.T) {
	gen := GenerateStartArea(StartAreaSeed, StartAreaParams())
	rep := InspectStartArea(gen)

	if rep.OriginSystemId != gen.Galaxy.OriginSystemId {
		t.Fatalf("report origin %q != galaxy origin %q", rep.OriginSystemId, gen.Galaxy.OriginSystemId)
	}
	if rep.ComponentSize < StartAreaParams().MinOriginComponentSystems {
		t.Fatalf("the shipped start-area seed fails its own floor: component %d < %d",
			rep.ComponentSize, StartAreaParams().MinOriginComponentSystems)
	}
	if !rep.ComponentHasOre {
		t.Fatal("the shipped start-area seed has no mineable system in its origin component")
	}
	if rep.ComponentSize > len(gen.Systems) {
		t.Fatalf("component %d exceeds the start area's %d systems", rep.ComponentSize, len(gen.Systems))
	}
}

// A degenerate field (no lanes at all) must report a component of one, so
// seed-time validation can reject it.
func TestInspectStartArea_DegenerateField(t *testing.T) {
	gen := GeneratedGalaxy{
		Galaxy:  Galaxy{OriginSystemId: "sys_0_0"},
		Systems: []System{{Id: "sys_0_0"}, {Id: "sys_5_5"}},
	}
	rep := InspectStartArea(gen)
	if rep.ComponentSize != 1 || rep.ComponentHasOre {
		t.Fatalf("unexpected report for a laneless field: %+v", rep)
	}
}

func TestSkeleton_DeterministicAndWellFormed(t *testing.T) {
	p := testParams()
	gen := GenerateStartArea(11, p)
	for _, s := range gen.Systems {
		if s.Skeleton.StarClass == "" {
			t.Fatalf("system %s has no star class", s.Id)
		}
		if len(s.Skeleton.Bodies) == 0 {
			t.Fatalf("system %s has no bodies", s.Id)
		}
		// Rings strictly ascending (distinct, inner-to-outer).
		for i := 1; i < len(s.Skeleton.Bodies); i++ {
			if s.Skeleton.Bodies[i].Ring <= s.Skeleton.Bodies[i-1].Ring {
				t.Fatalf("system %s rings not ascending/distinct: %+v", s.Id, s.Skeleton.Bodies)
			}
		}
	}

	// The skeleton pipeline is unchanged by the move to field identity: it still
	// re-derives straight from SystemSeed(galaxySeed, systemId).
	sys := gen.Systems[0]
	again := rollSkeleton(SystemSeed(11, sys.Id), sys.Region, p)
	if !reflect.DeepEqual(sys.Skeleton, again) {
		t.Fatal("skeleton not reproducible from SystemSeed")
	}
}
