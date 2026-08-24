package system

import (
	"context"
	"strings"

	"hexaverse/board"
	"hexaverse/observation"
)

// Features implements observation.InteriorSource: a system's features projected
// to the minimal geometry + composition the fog domain needs to compute sensor
// coverage and mint scan snapshots — so observation never imports system.
func (s *Service) Features(ctx context.Context, systemID string) ([]observation.FeatureGeom, error) {
	gen, err := s.GetOrCreateInterior(ctx, systemID)
	if err != nil {
		return nil, err
	}
	out := make([]observation.FeatureGeom, 0, len(gen.Features))
	for i := range gen.Features {
		f := &gen.Features[i]
		// The station is excluded from the fog/scan feature source entirely
		// (#0011 Decision 5). This is the actual mechanism that keeps
		// observation-fog-and-scan untouched by the station splice: because
		// GetOrCreateInterior now splices a station in ungated, an unfiltered
		// projection here would make a scan mint a feature observation for it and
		// give it occluder geometry. A station's visibility is governed entirely
		// by its own graph-tier rule — never by anything sensed or remembered.
		if f.Type == FeatureStation {
			continue
		}
		g := observation.FeatureGeom{
			Id:           f.Id,
			Astronomical: isAstronomical(f.Id),
			Occludes:     occludes(f.Type),
			Detail:       featureDetail(f),
		}
		if f.Orbit != nil {
			g.Elements = &board.Orbit{Ring: f.Orbit.Ring, Angle0: f.Orbit.Angle0, Period: f.Orbit.Period, Dir: f.Orbit.Dir}
		}
		if len(f.Footprint) > 0 {
			g.Anchor = board.Hex{Q: f.Footprint[0].Q, R: f.Footprint[0].R}
		}
		out = append(out, g)
	}
	return out, nil
}

// occludes marks the large bodies that shadow the lightspeed channel (#0006
// Decision #16): the star and planets block line of sight; belts, moons, and
// hazards don't (murk-as-attenuator is a follow-on).
func occludes(t FeatureType) bool {
	switch t {
	case FeatureStar, FeatureRocky, FeatureGasGiant, FeatureIce:
		return true
	default:
		return false
	}
}

// isAstronomical marks the free telescope layer — the star + the major-body
// skeleton (feat-body-N, mirroring generator.go's ids). Detail features (belts,
// moons, hazards, anomalies) are earned by presence or scan (#0006 free/earned
// line runs between body types).
func isAstronomical(featureID string) bool {
	return featureID == "feat-star" || strings.HasPrefix(featureID, "feat-body-")
}

func featureDetail(f *Feature) *observation.FeatureDetail {
	d := &observation.FeatureDetail{FeatureType: string(f.Type)}
	for _, r := range f.Resources {
		d.Resources = append(d.Resources, observation.ResourceReading{Kind: string(r.Kind), Richness: r.Richness})
	}
	if f.Effects != nil && f.Effects.Block {
		d.Threat = "hazard"
	}
	return d
}
