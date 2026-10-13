package system

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"

	"github.com/rs/zerolog/log"
)

// ErrNotFound means the system id isn't in the live galaxy (so it has no
// interior to generate).
var ErrNotFound = errors.New("system not found")

type ServiceInterface interface {
	// GetOrCreateInterior returns the system's interior, materializing it on
	// first request (the dev-only trigger until #0008's arrival dispatch
	// replaces it). Shared world state, generated once, idempotent under races.
	GetOrCreateInterior(ctx context.Context, systemID string) (*GeneratedInterior, error)
	// LaneGates returns the system's lane gate BODIES — one per lane touching
	// the system (#0008 Decision #10). Unfogged; the read boundary filters.
	LaneGates(ctx context.Context, systemID string) ([]LaneGate, error)
}

// ContactsSource resolves everything the interior read needs beyond the
// stored interior itself — every body's continuous position/size and the
// requester corporation's own live disclosure of foreign ship presence
// (tasks.md 4.4, 4.5, 4.7) — behind ONE seam, deliberately never exposing
// the body table type by name to system/handler.go
// (system-body-table's own "The Body Table Is an Unfiltered Internal Seam,
// Never a Response": bodies_test.go's assertNoHandlerReferences greps every
// handler.go in the repo for the literal substring "BodyTable", so the
// interior handler must never spell the type even in a variable
// declaration). A separate handler-level seam, exactly like DueActions in
// handler.go, so that this package's own pre-existing ServiceInterface fakes
// (fog_test.go and friends) need not grow this method just to keep
// compiling. Satisfied structurally by *Service (contacts.go), wired at the
// composition root (router.go) alongside WithActions.
type ContactsSource interface {
	InteriorReadExtras(ctx context.Context, systemID, requesterCorpId string, features []fogFeatureDTO, gates []LaneGate, now common.WorldMillis) (InteriorExtras, error)
}

// StationSource supplies a system's trading station as a board feature (#0011).
// Consumer-declared here so `system` never imports the station package — the
// station package imports THIS one (for Orbit, the feature shape, and the
// dominant-direction law), and a cycle would be the alternative.
type StationSource interface {
	StationFeature(ctx context.Context, systemID string) (*Feature, error)
}

type Service struct {
	dao       Dao
	galaxySvc galaxy.ServiceInterface
	clock     common.WorldTime
	params    GenerationParams
	// stations splices the system's station into every interior read. Nil ⇒ no
	// station is ever spliced, which is exactly the pre-#0011 behaviour.
	stations StationSource
	// fleets supplies the interior read's contact union (tasks.md 4.4, 4.5).
	// Nil ⇒ Contacts always answers empty, mirroring stations' own
	// no-dependency-no-feature degradation.
	fleets FleetSource
}

// WithStations wires the station splice. Post-construction, like fleet's
// WithTravel, because the station service depends on services constructed
// alongside this one.
func (s *Service) WithStations(src StationSource) *Service {
	s.stations = src
	return s
}

// WithFleets wires the interior read's contact union source (tasks.md 4.1,
// 4.4), post-construction like WithStations, since the fleet service is
// constructed alongside this one at the composition root and this package
// must never import it directly (system/never_imports_sightings_test.go's
// own narrow rule generalizes: the dependency runs fleet -> system, for
// BodySource, so it cannot run the other way too without a cycle).
func (s *Service) WithFleets(src FleetSource) *Service {
	s.fleets = src
	return s
}

func NewService() *Service {
	return &Service{
		dao:       NewDao(),
		galaxySvc: galaxy.NewService(),
		clock:     common.WorldClock(),
		params:    DefaultParams(),
	}
}

func NewServiceWith(dao Dao, galaxySvc galaxy.ServiceInterface, clock common.WorldTime) *Service {
	return &Service{dao: dao, galaxySvc: galaxySvc, clock: clock, params: DefaultParams()}
}

func (s *Service) GetOrCreateInterior(ctx context.Context, systemID string) (*GeneratedInterior, error) {
	meta, err := s.galaxySvc.LiveGalaxyMeta(ctx)
	if err != nil {
		return nil, err
	}
	galaxyID := meta.Id

	// Fast path: already materialized.
	if gen, err := s.readInterior(ctx, galaxyID, systemID); err != nil {
		return nil, err
	} else if gen != nil {
		s.spliceStation(ctx, gen)
		s.applyContinuousCascade(ctx, systemID, gen)
		return gen, nil
	}

	// Look up the graph-tier node for the character dial + skeleton.
	node, err := s.galaxySvc.GetLiveSystem(ctx, systemID)
	if err != nil {
		if errors.Is(err, galaxy.ErrSystemNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	// Generate deterministically from the SAME per-system seed M1's skeleton
	// used, so the interior extends the skeleton rather than contradicting it.
	seed := galaxy.SystemSeed(meta.Seed, systemID)
	gen := Generate(seed, string(node.Region), node.Skeleton, s.params)
	gen.Interior.SystemId = systemID
	gen.Interior.CreatedAt = s.clock.Now()

	// TODO(#0008): arrival via a lane is the real "Explored" trigger; until then
	// the read endpoint materializes on first request. Create-if-absent makes a
	// concurrent double-explore resolve to one interior (see dao.CreateInterior).
	if err := s.dao.CreateInterior(ctx, galaxyID, gen); err != nil {
		if errors.Is(err, ErrAlreadyExists) {
			// Lost the race — read the winner's copy (identical by determinism).
			winner, rerr := s.readInterior(ctx, galaxyID, systemID)
			if rerr != nil {
				return nil, rerr
			}
			if winner == nil {
				return nil, fmt.Errorf("interior claimed but not readable for %s", systemID)
			}
			s.spliceStation(ctx, winner)
			s.applyContinuousCascade(ctx, systemID, winner)
			return winner, nil
		}
		return nil, err
	}

	log.Info().Ctx(ctx).Str("systemId", systemID).Str("character", string(node.Region)).
		Int("features", len(gen.Features)).Msg("Generated system interior")
	s.spliceStation(ctx, &gen)
	s.applyContinuousCascade(ctx, systemID, &gen)
	return &gen, nil
}

// spliceStation appends the system's station to a projected interior, if one
// exists. Ungated by design: this seam has no requester to gate against (its
// callers include arrival settlement under the OIDC sweep, where there is no
// requester at all), so the visibility gate lives at the requester-scoped read
// surfaces instead.
//
// Completes the station's continuous half here, at the seam, rather than
// leaving it to the StationSource producer (design.md Decision 29): the
// orbit is a pure function of (galaxy seed, system id, skeleton), so it is
// derived fresh on every splice — no stored field, no re-seed — and every
// already-provisioned station heals on its next read. Size is likewise set
// to the package's own StationSize constant, never left at the producer's
// zero value (system-body-table's "A Table Contains No Body With a
// Non-Positive Size" names the station explicitly). Only attempted when the
// feature arrives without a Space of its own — a producer (or a stand-in
// test double) that already supplies one is trusted, matching this seam's
// own long-standing pass-through-verbatim behaviour for every other field.
//
// DEGRADES, never fails: a station-store read error omits the station from
// the interior entirely, same as always. A failure resolving the
// skeleton/seed needed to derive the orbit is milder still — it leaves the
// returned feature's Space/Size unset rather than omitting the feature
// outright, so the pre-existing SpaceDoc-decode path (applyContinuousCascade
// / readInterior) remains the fallback for a feature that happens to carry
// its own decodable orbital element set. Either way the rest of the
// interior is untouched, and the interior read gains no market dependency.
func (s *Service) spliceStation(ctx context.Context, gen *GeneratedInterior) {
	if s.stations == nil || gen == nil {
		return
	}
	feat, err := s.stations.StationFeature(ctx, gen.Interior.SystemId)
	if err != nil {
		log.Warn().Ctx(ctx).Err(err).Str("systemId", gen.Interior.SystemId).
			Msg("Station store unavailable; serving interior without its station")
		return
	}
	if feat == nil {
		return
	}
	if feat.Type == FeatureStation && feat.Space == nil && s.galaxySvc != nil {
		node, nerr := s.galaxySvc.GetLiveSystem(ctx, gen.Interior.SystemId)
		if nerr != nil || node == nil {
			log.Warn().Ctx(ctx).Err(nerr).Str("systemId", gen.Interior.SystemId).
				Msg("Live system skeleton unavailable; serving spliced station without a derived orbit")
		} else if meta, merr := s.galaxySvc.LiveGalaxyMeta(ctx); merr != nil {
			log.Warn().Ctx(ctx).Err(merr).Str("systemId", gen.Interior.SystemId).
				Msg("Live galaxy metadata unavailable; serving spliced station without a derived orbit")
		} else {
			orbit := StationContinuousOrbit(meta.Seed, gen.Interior.SystemId, node.Skeleton)
			feat.Space = &orbit
			feat.Size = StationSize
		}
	}
	// Marks this feature as SPLICED (in-process construction, never storage)
	// so applyContinuousCascade can hold it to the stricter completeness
	// contract design.md Decision 29 requires — an in-memory-only marker,
	// never persisted (tasks.md 10.9).
	feat.Spliced = true
	gen.Features = append(gen.Features, *feat)
}

// readInterior returns the stored interior (+ features), or nil if not yet
// materialized.
//
// A decoded feature is still validated — every non-star feature must decode a
// continuous orbital element set — and one that fails is OMITTED and logged
// with its id and the system id rather than failing the whole read, so a
// downstream ErrFeatureAbsent (e.g. fleet.Position → resolveFeature on a
// fleet attached to a now-omitted feature) is attributable to this guard
// rather than read as a genuinely missing feature. One bad feature never
// stops the loop over the rest.
func (s *Service) readInterior(ctx context.Context, galaxyID, systemID string) (*GeneratedInterior, error) {
	si, err := s.dao.GetInterior(ctx, galaxyID, systemID)
	if err != nil {
		return nil, err
	}
	if si == nil {
		return nil, nil
	}
	features, err := s.dao.ListFeatures(ctx, galaxyID, systemID)
	if err != nil {
		return nil, err
	}
	kept := make([]Feature, 0, len(features))
	for _, f := range features {
		// Every non-star feature must decode a continuous orbital element set
		// (design.md Decision 12). A missing SpaceDoc key entirely is treated
		// identically to a malformed one — never as a legitimate parentless
		// body, a reading reserved for the star alone (system-interior: "An
		// Interior Predating This Capability Fails Closed, Never Silently").
		// One bad feature never stops the loop over the rest.
		if f.Type != FeatureStar {
			o, err := space.DecodeOrbit(f.SpaceDoc)
			if err != nil {
				log.Warn().Ctx(ctx).Str("systemId", systemID).Str("featureId", f.Id).Err(err).
					Msg("Feature's orbital element set failed to decode; omitting from the interior read")
				continue
			}
			f.Space = &o
		}
		kept = append(kept, f)
	}
	return &GeneratedInterior{Interior: *si, Features: kept}, nil
}

// applyContinuousCascade runs after spliceStation (the station is a
// candidate body in the cascade, not decoded alongside the DAO's own
// features): it decodes the spliced station's SpaceDoc if it arrived
// undecoded, then drops, to a fixpoint, any non-star candidate whose
// continuous parent chain fails to resolve through space.Position — the one
// check that covers a missing parent, a cyclic chain, and an over-deep
// stored chain alike (design.md Decision 12). The termination argument is
// space's own chain-depth bound (maxBodyDepth = 4), so this converges well
// inside the fixed pass cap below. Each cascaded drop is logged with both
// its own feature id and the id of the ancestor that (at the time of the
// drop) it named as parent — distinguishable from a direct decode failure,
// which names only the offending feature's own id.
//
// The completeness check below (design.md Decision 29's population split,
// tasks.md 10.9) holds a SPLICED feature (Feature.Spliced, set only by
// spliceStation's in-process construction) to a stricter bar than a stored
// one: a spliced feature carrying no orbital element set — neither a
// non-nil Space nor a decodable SpaceDoc — or a non-positive Size is a
// PRODUCER BUG, never data rot, and is logged at Error naming the splicing
// source and the missing field before being omitted. A stored feature's own
// decode failure keeps the pre-existing Warn-severity omit-never-fail
// behaviour unchanged — one corrupt document must never permanently fail
// every corporation's read of a system.
func (s *Service) applyContinuousCascade(ctx context.Context, systemID string, gen *GeneratedInterior) {
	decoded := make([]Feature, 0, len(gen.Features))
	for _, f := range gen.Features {
		if f.Type == FeatureStar {
			decoded = append(decoded, f)
			continue
		}
		if f.Space == nil {
			o, err := space.DecodeOrbit(f.SpaceDoc)
			if err != nil {
				if f.Spliced {
					log.Error().Ctx(ctx).Str("systemId", systemID).Str("featureId", f.Id).Err(err).
						Msg("Spliced body carries no orbital element set (missing Space); omitting from the interior read — producer bug, not data rot")
				} else {
					log.Warn().Ctx(ctx).Str("systemId", systemID).Str("featureId", f.Id).Err(err).
						Msg("Spliced feature's orbital element set failed to decode; omitting from the interior read")
				}
				continue
			}
			f.Space = &o
		}
		if f.Spliced && !(f.Size > 0) {
			log.Error().Ctx(ctx).Str("systemId", systemID).Str("featureId", f.Id).Float64("size", f.Size).
				Msg("Spliced body carries a non-positive Size; omitting from the interior read — producer bug, not data rot")
			continue
		}
		decoded = append(decoded, f)
	}
	gen.Features = decoded

	const maxCascadePasses = 4
	for pass := 0; pass < maxCascadePasses; pass++ {
		bodies := cascadeBodySetFrom(gen.Features)
		type dropped struct{ id, ancestor string }
		var drops []dropped
		for _, f := range gen.Features {
			if f.Type == FeatureStar {
				continue
			}
			if _, err := space.Position(bodies, f.Id, 0); err != nil {
				ancestor := ""
				if f.Space != nil {
					ancestor = f.Space.ParentId
				}
				drops = append(drops, dropped{f.Id, ancestor})
			}
		}
		if len(drops) == 0 {
			return
		}
		dropSet := make(map[string]bool, len(drops))
		for _, d := range drops {
			dropSet[d.id] = true
			log.Warn().Ctx(ctx).Str("systemId", systemID).Str("featureId", d.id).Str("ancestorId", d.ancestor).
				Msg("Feature's continuous parent chain failed to resolve; omitting from the interior read (cascade)")
		}
		remaining := make([]Feature, 0, len(gen.Features))
		for _, f := range gen.Features {
			if !dropSet[f.Id] {
				remaining = append(remaining, f)
			}
		}
		gen.Features = remaining
	}
}

// cascadeBodySet is a space.Bodies view over the current cascade candidate
// set, keyed by feature id.
type cascadeBodySet map[string]space.Body

func (b cascadeBodySet) Body(id string) (space.Body, bool) {
	v, ok := b[id]
	return v, ok
}

func cascadeBodySetFrom(feats []Feature) cascadeBodySet {
	out := make(cascadeBodySet, len(feats))
	for _, f := range feats {
		out[f.Id] = space.Body{Id: f.Id, Size: f.Size, Orbit: f.Space}
	}
	return out
}
