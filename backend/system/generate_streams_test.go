package system

// The shared 80-case interior-generation sweep, and the canonical rendering
// of a generated interior's orbital element sets — the two things
// fixtures_test.go's `interiorElements` family is recorded over.
//
// This file was originally the RED suite for a requirement of openspec change
// pin-system-generation-determinism, which pinned that the primary RNG
// stream's draws were unaffected by the continuous one. That requirement is
// REMOVED: there is no second placement tier left to be independent of, and
// the instrumentation that measured it — a "generate no continuous elements"
// mode on the generator, a per-case stream word counter, and the two fixture
// components those two fed — has nothing left to measure. The scenarios went
// with it; the sweep inputs and the element-set rendering they shared survive
// here, because the `interiorElements` family is still recorded over exactly
// this sweep (design.md Decision 5: "interiorElements deliberately reuses the
// existing fixture set rather than inventing a new seed sweep").
//
// The stream SPLIT itself survives too, in Generate: which bodies exist is
// drawn from one stream and each body's element set and size from another, so
// a retune of the size bands cannot move a lode. Only the instrumentation
// that proved it is gone.

import (
	"encoding/json"

	"hexaverse/galaxy"
)

// --- the shared 80-case sweep -----------------------------------------------

type interiorElementsCaseInput struct {
	Seed     int64
	Region   string
	Skeleton galaxy.Skeleton
}

var interiorElementsSkeletons = []galaxy.Skeleton{
	{StarClass: "G", Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 0}}},
	{StarClass: "M", Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 0}, {Type: galaxy.BodyGasGiant, Ring: 1}}},
	{StarClass: "K", Bodies: []galaxy.Body{
		{Type: galaxy.BodyMoltenz, Ring: 0}, {Type: galaxy.BodyRocky, Ring: 3},
		{Type: galaxy.BodyGasGiant, Ring: 7}, {Type: galaxy.BodyIce, Ring: 11},
	}},
	{StarClass: "O", Bodies: []galaxy.Body{
		{Type: galaxy.BodyRocky, Ring: 0}, {Type: galaxy.BodyOceanic, Ring: 2},
		{Type: galaxy.BodyBarrenz, Ring: 4}, {Type: galaxy.BodyGasGiant, Ring: 6},
		{Type: galaxy.BodyGasGiant, Ring: 8}, {Type: galaxy.BodyIce, Ring: 10},
		{Type: galaxy.BodyIce, Ring: 11},
	}},
}

var interiorElementsRegions = []string{"star_rich", "normal", "dead", "barrier"}

func interiorElementsInputs() []interiorElementsCaseInput {
	var out []interiorElementsCaseInput
	seed := int64(1)
	for _, sk := range interiorElementsSkeletons {
		for _, region := range interiorElementsRegions {
			for i := 0; i < 5; i++ {
				out = append(out, interiorElementsCaseInput{Seed: seed, Region: region, Skeleton: sk})
				seed++
			}
		}
	}
	return out
}

// continuousElementsLineOf is a per-feature canonical rendering of the
// continuous half only (Space + Size + Width) — used solely to detect that
// SOMETHING continuous differs between two runs, not to pin its exact value
// (that is fixtures_test.go's job).
type space_orbitSnapshot struct {
	ParentId    string
	Radius      float64
	PeriodMs    int64
	Phase       int64
	Inclination int64
	Node        int64
}

func continuousElementsLineOf(gen GeneratedInterior) string {
	type featSnap struct {
		Id    string               `json:"id"`
		Size  float64              `json:"size"`
		Width float64              `json:"width"`
		Space *space_orbitSnapshot `json:"space,omitempty"`
	}
	snap := struct {
		Extent   float64    `json:"extent"`
		Features []featSnap `json:"features"`
	}{Extent: gen.Interior.Extent}
	for _, f := range gen.Features {
		fs := featSnap{Id: f.Id, Size: f.Size, Width: f.Width}
		if f.Space != nil {
			fs.Space = &space_orbitSnapshot{
				ParentId: f.Space.ParentId, Radius: f.Space.Radius,
				PeriodMs: int64(f.Space.PeriodMs), Phase: int64(f.Space.Phase),
				Inclination: int64(f.Space.Inclination), Node: int64(f.Space.Node),
			}
		}
		snap.Features = append(snap.Features, fs)
	}
	b, err := json.Marshal(snap)
	if err != nil {
		panic(err)
	}
	return string(b)
}
