package system

import (
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"
)

// fogFeatureDTO is a feature already fogged for the requester (#0006 three
// bands). The astronomical layer (star + major bodies) always ships — geometry +
// type, from arrival — but earned content (resources, hazards) appears only where
// the feature is Visible (live, inside the sensor union) or Remembered (frozen at
// AsOf). Unseen detail features are omitted entirely (empty space is never
// remembered).
type fogFeatureDTO struct {
	Id        string      `json:"id"`
	Type      FeatureType `json:"type"`
	Orbit     *Orbit      `json:"orbit,omitempty"`
	ParentId  string      `json:"parentId,omitempty"`
	Fixed     bool        `json:"fixed,omitempty"`
	Footprint []Hex       `json:"footprint"`
	// Band is the visibility state: visible | remembered | astronomical.
	Band string `json:"band"`
	// Live is true only for Visible features (live truth this instant).
	Live bool `json:"live"`
	// Resources/Effects are the earned content — present for Visible/Remembered,
	// withheld on the free astronomical layer.
	Resources []Resource `json:"resources,omitempty"`
	Effects   *Effects   `json:"effects,omitempty"`
	// AsOf stamps a Remembered feature's freshness (activity frozen here); nil
	// when Visible or on the free layer.
	AsOf *common.WorldMillis `json:"asOf,omitempty"`
}

const (
	bandVisible      = "visible"
	bandRemembered   = "remembered"
	bandAstronomical = "astronomical"
)

// projectFogged applies the three-band fog to an interior for one requester.
// Two independent axes decide what ships:
//   - Presence (covered now → Visible/live; a stored observation but uncovered →
//     Remembered/frozen; an uncovered major body → free Astronomical; else Unseen).
//   - Knowledge: composition/worth is scan-minted intel, so it ships ONLY from a
//     scanned observation's stored Detail — never straight off the raw interior.
//     Being present (or ambient-remembering) a body tells you it's there, not what
//     it's worth (#0006: presence resolves the small/dark; scan mints composition).
func projectFogged(gen *GeneratedInterior, cov observation.Coverage, remembered map[string]observation.FeatureMemory, now common.WorldMillis) []fogFeatureDTO {
	out := make([]fogFeatureDTO, 0, len(gen.Features))
	for i := range gen.Features {
		f := &gen.Features[i]
		dto := fogFeatureDTO{
			Id: f.Id, Type: f.Type, Orbit: f.Orbit, ParentId: f.ParentId,
			Fixed: f.Fixed, Footprint: f.Footprint,
		}
		mem, hasMemory := remembered[f.Id]
		switch {
		case cov.Covers(featureHexAt(f, now)):
			dto.Band = bandVisible
			dto.Live = true
			applyScannedDetail(&dto, mem, hasMemory)
		case hasMemory:
			// Geometry lives (Orbit ships, computed at `now` by the client); the
			// scanned composition freezes, stamped at the observation's AsOf.
			dto.Band = bandRemembered
			asOf := mem.AsOf
			dto.AsOf = &asOf
			applyScannedDetail(&dto, mem, true)
		case isAstronomical(f.Id):
			dto.Band = bandAstronomical // free layer: geometry + type only, no worth
		default:
			continue // Unseen detail feature — dropped
		}
		out = append(out, dto)
	}
	return out
}

// applyScannedDetail surfaces composition/threat ONLY from a scanned observation
// (Detail present). Presence-only memory (ambient) carries no Detail, so it never
// leaks worth — the whole point of scan minting the sellable intel.
func applyScannedDetail(dto *fogFeatureDTO, mem observation.FeatureMemory, has bool) {
	if !has || mem.Detail == nil {
		return
	}
	for _, r := range mem.Detail.Resources {
		dto.Resources = append(dto.Resources, Resource{Kind: ResourceKind(r.Kind), Richness: r.Richness})
	}
	if mem.Detail.Threat != "" {
		dto.Effects = &Effects{Block: true}
	}
}

// projectUnfogged is the dev/logged-out path (no fog wired): every feature ships
// live. Keeps the read usable before a requester corp exists.
func projectUnfogged(gen *GeneratedInterior) []fogFeatureDTO {
	out := make([]fogFeatureDTO, 0, len(gen.Features))
	for i := range gen.Features {
		f := &gen.Features[i]
		out = append(out, fogFeatureDTO{
			Id: f.Id, Type: f.Type, Orbit: f.Orbit, ParentId: f.ParentId,
			Fixed: f.Fixed, Footprint: f.Footprint, Band: bandVisible, Live: true,
			Resources: f.Resources, Effects: f.Effects,
		})
	}
	return out
}

// featureHexAt is a feature's hex at a world time: its orbital position if it
// orbits, else its epoch anchor. Used to test sensor coverage.
func featureHexAt(f *Feature, now common.WorldMillis) board.Hex {
	if f.Orbit != nil {
		return board.OrbState(board.Orbit{Ring: f.Orbit.Ring, Angle0: f.Orbit.Angle0, Period: f.Orbit.Period, Dir: f.Orbit.Dir}, now)
	}
	if len(f.Footprint) > 0 {
		return board.Hex{Q: f.Footprint[0].Q, R: f.Footprint[0].R}
	}
	return board.Hex{}
}
