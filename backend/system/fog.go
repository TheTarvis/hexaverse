package system

import (
	"hexaverse/board"
	"hexaverse/common"
)

// fogFeatureDTO is one feature in an interior read's response.
//
// Until migrate-fleet-to-continuous-burns tasks.md 7.7, this shipped a
// requester-specific three-band projection (visible/remembered/astronomical)
// computed from observation's live sensor coverage and stored per-feature
// memory. That machinery is deleted (design.md Decision 11): every field
// here now ships in full for every authenticated requester, regardless of
// sensor coverage or scan history — Band is always "visible", Live is
// always true, and AsOf is always nil. See projectUnfogged's own doc comment
// for the interim's scope and its stated successor.
//
// DELIBERATELY does not carry Space/Size (openspec add-orbital-system-bodies):
// this struct is the one explicit allowlist deciding what a response may
// carry, and this change's deltas give it no rule to decide a continuous
// position/size with — shipping a body's live continuous position here is an
// information leak ahead of its own change. Wiring Space/Size into a
// response is link 5's business (replace-observation-with-sightings), once
// disclosure is actually wired. Do NOT "helpfully" add them here because
// they look additive and harmless.
type fogFeatureDTO struct {
	Id        string       `json:"id"`
	Type      FeatureType  `json:"type"`
	Orbit     *Orbit       `json:"orbit,omitempty"`
	ParentId  string       `json:"parentId,omitempty"`
	Fixed     bool         `json:"fixed,omitempty"`
	Footprint []board.Cell `json:"footprint"`
	// Band is the visibility state. Always "visible" under the interim read
	// (tasks.md 7.7) — kept on the wire rather than dropped so the response
	// shape doesn't change out from under the frontend twice in one chain
	// link; section 8 is where the frontend's own reduction happens.
	Band string `json:"band"`
	// Live is always true under the interim read (tasks.md 7.7).
	Live bool `json:"live"`
	// Resources/Effects are the feature's full composition/threat detail —
	// unconditional under the interim read (tasks.md 7.7): no longer gated
	// on a scanned observation's stored detail.
	Resources []Resource `json:"resources,omitempty"`
	Effects   *Effects   `json:"effects,omitempty"`
	// AsOf is always nil under the interim read (tasks.md 7.7): nothing here
	// freezes at a stored observation's timestamp anymore, because nothing
	// here is drawn from a stored observation anymore.
	AsOf *common.WorldMillis `json:"asOf,omitempty"`
}

const bandVisible = "visible"

// projectUnfogged serves a materialized interior's every feature in full —
// geometry, composition, and threat detail — with no band assignment and no
// omission, to every authenticated requester regardless of corporation,
// sensor coverage, or scan history (system-interior: "Interior Reads Are
// Fully Disclosed, A Deliberate Interim").
//
// This is the ONLY interior feature projection as of
// migrate-fleet-to-continuous-burns (tasks.md 7.7): it replaces the deleted
// three-band fog projection that used to compute Visible/Remembered/
// Astronomical per requester from observation's live sensor coverage and
// stored per-feature memory (design.md Decision 11 — that coverage
// computation has no successor once a fleet has no board cell to compute it
// from). It is a stated, temporary interim, not a design goal: link 5
// (replace-observation-with-sightings) replaces it with a disclosure-
// projected read once disclosure.Disclose is wired into this endpoint
// (design.md Decision 19, a Non-Goal of this change). Do not extend this
// function with per-requester logic — that is exactly the shape link 5
// replaces it with.
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
