package fleet

import (
	"context"

	"hexaverse/disclosure"
	"hexaverse/system"
)

// FleetsInSystem implements system.FleetSource (replace-observation-with-
// sightings tasks.md 4.1, 4.4): the interior read's contact union needs
// every fleet present in a system, in the minimal disclosure-ready shape,
// plus the disclosure.Attachments adapter built over that same set (task
// 4.1's Attachments type, attachments.go) — masking-chain resolution needs
// visibility into every fleet's host, not just the requester's own or a
// single foreign target.
//
// Read-only, exactly like ListInSystem: it never settles a due arrival.
// That is deliberate, not a gap (design.md Decision 27): disclosure folds
// every position it reads through space.StateAt internally, so an
// unsettled-but-due burn yields the same disclosure answer as a settled
// one — this method's own opportunistic-settle retrofit, if ever needed,
// is link 6's concern, not this one's.
func (s *Service) FleetsInSystem(ctx context.Context, systemID string) ([]system.FleetPresence, disclosure.Attachments, error) {
	fleets, err := s.ListInSystem(ctx, systemID)
	if err != nil {
		return nil, nil, err
	}

	out := make([]system.FleetPresence, 0, len(fleets))
	for _, f := range fleets {
		out = append(out, system.FleetPresence{
			Id:            f.Id,
			CorporationId: f.CorporationId,
			Ship: disclosure.Ship{
				Id:            f.Id,
				State:         f.State,
				DriveOutput:   DerivedDriveOutput(f, s.classStats),
				InLaneTransit: f.Jump != nil,
			},
		})
	}
	return out, Attachments(fleets), nil
}
