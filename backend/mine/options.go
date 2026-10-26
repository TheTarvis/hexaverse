package mine

import (
	"context"
	"fmt"
	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/system"
	"math"
)

type ResourceOption struct {
	Kind          system.ResourceKind `json:"kind"`
	RemainingTons float64             `json:"remainingTons"`
}

type Options struct {
	FeatureId       string             `json:"featureId"`
	CommitFeatureId string             `json:"commitFeatureId"`
	Eligible        bool               `json:"eligible"`
	Reason          string             `json:"reason,omitempty"`
	ActiveActionId  string             `json:"activeActionId,omitempty"`
	FreeHold        float64            `json:"freeHold"`
	MiningRate      float64            `json:"miningRate"`
	MinRunTons      float64            `json:"minRunTons"`
	Resources       []ResourceOption   `json:"resources"`
	WorldTime       common.WorldMillis `json:"worldTime"`
}

// Options serves current owner-only mining prerequisites without committing a run.
// Commit repeats its own checks atomically; these readings are not a reservation.
func (s *Service) Options(ctx context.Context, corporationID, fleetID string) (*Options, error) {
	if corporationID == "" {
		return nil, ErrUnauthenticated
	}
	f, err := s.fleets.Get(ctx, fleetID)
	if err != nil || f == nil || f.CorporationId != corporationID {
		return nil, ErrForeignFleet
	}
	result := &Options{WorldTime: s.clock.Now(), FreeHold: fleet.FreeHold(*f, s.currentClassStats()), MiningRate: fleet.DerivedMiningRate(*f, s.currentClassStats()), MinRunTons: s.currentParams().MinRunTons, ActiveActionId: f.ActiveActionId, Resources: []ResourceOption{}}
	host, docked := f.DockedTo()
	if !docked {
		result.Reason = ErrNotDocked.Error()
		return result, nil
	}
	result.CommitFeatureId = host
	interior, err := s.features.GetOrCreateInterior(ctx, f.SystemId)
	if err != nil {
		return nil, fmt.Errorf("mine options: reading interior: %w", err)
	}
	feature, id, err := resolveFeatureId(host, interior)
	if err != nil {
		return nil, err
	}
	result.FeatureId = id
	if feature == nil {
		result.Reason = ErrUnknownKind.Error()
		return result, nil
	}
	if feature.Type == system.FeatureStation {
		result.Reason = ErrStationNotMineable.Error()
		return result, nil
	}
	for _, resource := range feature.Resources {
		fold, err := s.actions.Remaining(ctx, LedgerKey(f.SystemId, id, resource.Kind), result.WorldTime)
		if err != nil {
			return nil, fmt.Errorf("mine options: reading remaining resource: %w", err)
		}
		remaining := math.Max(0, resource.Richness*s.currentParams().TonsPerRichness+fold)
		if remaining > 0 {
			result.Resources = append(result.Resources, ResourceOption{Kind: resource.Kind, RemainingTons: remaining})
		}
	}
	switch {
	case len(result.Resources) == 0:
		result.Reason = ErrLodeDepleted.Error()
	case result.MiningRate <= 0:
		result.Reason = ErrNoMiningCapability.Error()
	case result.FreeHold < result.MinRunTons:
		result.Reason = ErrOverFreeHold.Error()
	case f.ActiveActionId != "":
		result.Reason = BusyReason("action")
	default:
		result.Eligible = true
	}
	return result, nil
}
