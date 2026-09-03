package system

import (
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/space"
)

// fogFeatureDTO is one feature in an interior read's response.
//
// Until migrate-fleet-to-continuous-burns tasks.md 7.7, this shipped a
// requester-specific three-band projection (visible/remembered/astronomical)
// computed from observation's live sensor coverage and stored per-feature
// memory. That machinery was deleted (design.md Decision 11 of that change):
// every field here ships in full for every authenticated requester,
// regardless of sensor coverage or scan history — Band is always "visible",
// Live is always true, and AsOf is always nil. This is now the PERMANENT
// rule, not an interim (replace-observation-with-sightings design.md
// Decision 4, system-interior "Bodies Are Public; Ships Are Disclosed"):
// bodies are a system's public detail layer, at the same altitude as the
// galaxy tier's own public star field.
//
// Space/Size (openspec add-orbital-system-bodies, wired here by
// replace-observation-with-sightings tasks.md 4.7, design.md Decision 26)
// ship ADDITIVELY alongside the pre-existing lattice fields (Footprint,
// Band, Live) — never replacing them, since the live board is still the
// only playable view until link 8's renderer migration.
//
// OrbitElements (serve-orbital-elements-and-burn-preview, tasks.md 2.1) is
// additive in the same way and under a DISTINCT key. The LATTICE half of
// this DTO — Orbit, ParentId, Fixed, Footprint, Band, Live, AsOf (and
// LaneGate.Cell on the sibling type) — is deliberately left untouched here
// and is removed by `build-production-space-view`, the change that stops
// reading them. Removing them here would break the live lattice view and
// turn a purely additive change into a migration.
type fogFeatureDTO struct {
	Id        string       `json:"id"`
	Type      FeatureType  `json:"type"`
	Orbit     *Orbit       `json:"orbit,omitempty"`
	ParentId  string       `json:"parentId,omitempty"`
	Fixed     bool         `json:"fixed,omitempty"`
	Footprint []board.Cell `json:"footprint"`
	// Band is the visibility state. Always "visible" — every body ships in
	// full to every authenticated requester (system-interior "Bodies Are
	// Public; Ships Are Disclosed"). Kept on the wire, not dropped, so the
	// response shape doesn't change out from under the frontend until link 8.
	Band string `json:"band"`
	// Live is always true.
	Live bool `json:"live"`
	// Resources/Effects are the feature's full composition/threat detail —
	// unconditional, never gated on a scanned observation's stored detail.
	Resources []Resource `json:"resources,omitempty"`
	Effects   *Effects   `json:"effects,omitempty"`
	// AsOf is always nil: nothing here freezes at a stored observation's
	// timestamp — bodies are never scan-gated.
	AsOf *common.WorldMillis `json:"asOf,omitempty"`
	// Space is the body's continuous position at the read's world time,
	// resolved through the same canonical BodyTable every other continuous
	// position in this codebase folds through. Zero-valued (never omitted)
	// when no body table was available to resolve it — see GetInterior's own
	// degradation.
	Space space.Vec3 `json:"space"`
	// Size is the body's physical radius (Feature.Size).
	Size float64 `json:"size"`
	// OrbitElements is the body's continuous orbital element set
	// (serve-orbital-elements-and-burn-preview, system-interior "A non-star
	// body's read carries its full orbital element set"). Populated from the
	// STORED Feature.Space — elements are stored data, not a resolution
	// result, so they are served in full even when the body's continuous
	// position could not be resolved and `Space` is left zero-valued. Omitted
	// entirely for the star, which carries no element set.
	OrbitElements *orbitElementsDTO `json:"orbitElements,omitempty"`
}

const bandVisible = "visible"

// orbitElementsDTO is a body's CONTINUOUS orbital element set on the wire —
// the six fields space.EncodeOrbit already persists, under the exact names it
// persists them by (system-interior "Interior Read Endpoint").
//
// The key it ships under is `orbitElements`, NEVER `orbit`: `orbit` is
// already occupied on this response by the LATTICE orbit
// ({ring, angle0, period, dir}), a different object with different fields and
// a different meaning, and the `space` key is already occupied by the body's
// resolved continuous position. Serving the element set under either name
// would redefine a field a caller already reads — and since the two objects
// share no field name, every stale reader would read `undefined` for every
// field rather than throwing (design.md Decision 1 of
// serve-orbital-elements-and-burn-preview).
//
// space.Orbit itself carries no json tags (backend/space is storage- and
// wire-agnostic by design), so this DTO — not the domain type — is what
// crosses the boundary.
type orbitElementsDTO struct {
	ParentId    string             `json:"parentId"`
	Radius      float64            `json:"radius"`
	PeriodMs    common.WorldMillis `json:"periodMs"`
	Phase       space.SubTurns     `json:"phase"`
	Inclination space.SubTurns     `json:"inclination"`
	Node        space.SubTurns     `json:"node"`
}

// orbitElementsOf shapes a stored/derived element set for the wire, or nil
// for a body that has none — the star, which is parentless and positioned at
// the origin (system-interior "The star SHALL carry no orbitElements").
func orbitElementsOf(o *space.Orbit) *orbitElementsDTO {
	if o == nil {
		return nil
	}
	return &orbitElementsDTO{
		ParentId: o.ParentId, Radius: o.Radius, PeriodMs: o.PeriodMs,
		Phase: o.Phase, Inclination: o.Inclination, Node: o.Node,
	}
}

// projectUnfogged serves a materialized interior's every feature in full —
// geometry, composition, and threat detail — with no band assignment and no
// omission, to every authenticated requester regardless of corporation
// (system-interior "Bodies Are Public; Ships Are Disclosed",
// replace-observation-with-sightings design.md Decisions 4/6). This is the
// ONLY interior feature projection: there is no per-requester fog left to
// compute over a body.
//
// Deliberately does NOT resolve Space here (fillFeatureGeometry does,
// separately): this function has no body table to resolve a continuous
// position from, and system/handler.go — this DTO's one caller — must
// never reference the body table type by name
// (system-body-table "The Body Table Is an Unfiltered Internal Seam, Never
// a Response"; bodies_test.go's assertNoHandlerReferences greps every
// handler.go for the literal substring). InteriorReadExtras (contacts.go)
// is the seam that calls both this function and fillFeatureGeometry.
func projectUnfogged(gen *GeneratedInterior) []fogFeatureDTO {
	out := make([]fogFeatureDTO, 0, len(gen.Features))
	for i := range gen.Features {
		f := &gen.Features[i]
		out = append(out, fogFeatureDTO{
			Id: f.Id, Type: f.Type, Orbit: f.Orbit, ParentId: f.ParentId,
			Fixed: f.Fixed, Footprint: f.Footprint, Band: bandVisible, Live: true,
			Resources: f.Resources, Effects: f.Effects, Size: f.Size,
			OrbitElements: orbitElementsOf(f.Space),
		})
	}
	return out
}

// fillFeatureGeometry additively resolves each feature's continuous
// position (Space) from a resolved body table (tasks.md 4.7) — a second
// pass over projectUnfogged's own output, mirroring fillGateGeometry's
// identical shape for lane gates (gates.go). Degrades a feature to a zero
// Space (never dropping it, never failing the read) when its position
// isn't resolvable, exactly as fillGateGeometry does for a gate.
func fillFeatureGeometry(features []fogFeatureDTO, bt *BodyTable, now common.WorldMillis) []fogFeatureDTO {
	if bt == nil {
		return features
	}
	for i := range features {
		if pos, err := space.Position(bt, features[i].Id, now); err == nil {
			features[i].Space = pos
		}
	}
	return features
}
