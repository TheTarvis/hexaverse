package system

import (
	"strings"
	"testing"
)

func TestGenerateReadableRelatedNames(t *testing.T) {
	for seed := int64(0); seed < 20; seed++ {
		g := Generate(seed, "star_rich", sampleSkeleton(), DefaultParams())
		names := map[string]bool{}
		byID := map[string]Feature{}
		for _, f := range g.Features {
			if f.Name == "" || strings.Contains(f.Name, "feat-") {
				t.Fatalf("object %s lacks a readable name: %q", f.Id, f.Name)
			}
			key := strings.ToLower(f.Name)
			if names[key] {
				t.Fatalf("duplicate local name %q", f.Name)
			}
			names[key] = true
			byID[f.Id] = f
		}
		for _, f := range g.Features {
			if f.Type == FeatureMoon && !strings.Contains(f.Name, byID[f.Space.ParentId].Name) {
				t.Fatalf("moon %q has no relationship to parent %q", f.Name, byID[f.Space.ParentId].Name)
			}
		}
	}
}
