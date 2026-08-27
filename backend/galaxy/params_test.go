package galaxy

import (
	"errors"
	"testing"
)

func TestGenerationParams_Validate(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*GenerationParams)
	}{
		{"non-positive lane cap", func(p *GenerationParams) { p.MaxLaneLength = 0 }},
		{"lane cap reaching the block side", func(p *GenerationParams) {
			p.MaxLaneLength = float64(p.BlockSize) * p.CellSize() // exactly equal — still rejected
		}},
		{"degenerate block size", func(p *GenerationParams) { p.BlockSize = 0 }},
		{"degenerate bridge horizon", func(p *GenerationParams) { p.BridgeSearchHorizon = 0 }},
		{"degenerate origin-component floor", func(p *GenerationParams) { p.MinOriginComponentSystems = 0 }},
		{"block too large for one transaction", func(p *GenerationParams) {
			p.BlockSize = 20
			p.MaxLaneLength = 1
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := DefaultParams()
			tc.mutate(&p)
			err := p.Validate()
			if err == nil {
				t.Fatal("expected a validation error")
			}
			if !errors.Is(err, ErrInvalidParams) {
				t.Fatalf("error %v does not wrap ErrInvalidParams", err)
			}
		})
	}
	if err := DefaultParams().Validate(); err != nil {
		t.Fatalf("the shipped defaults must validate: %v", err)
	}
}
