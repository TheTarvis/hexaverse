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
				DriveOutput:   DerivedDriveOutput(f, s.currentClassStats()),
				InLaneTransit: f.Jump != nil,
				Scan:          liveScanWindow(f),
			},
		})
	}
	return out, Attachments(fleets), nil
}

// liveScanWindow carries a fleet's running sweep onto the disclosure-ready
// mirror (replace-observation-with-sightings tasks.md 5.1/5.5: "wire the
// resulting radius into the same disclosure predicate the plume channel
// uses, so a parked, non-emitting, sweeping ship is actually disclosed by
// it — not merely computed and left unconsumed"). ActiveScanId — the
// single-slot claim itself — is the authoritative signal, never the mere
// presence of Fleet.Scan: the action-dispatch spine's generic cancel
// surface (POST /v1/actions/:actionId/cancel, task 5.9) releases
// ActiveScanId but writes no fleet-specific actorState, so it never clears
// Fleet.Scan's own stale window. Gating on ActiveScanId here is what makes
// a cancelled sweep stop being reported as sweeping IMMEDIATELY, rather
// than lingering until the cancelled sweep's original arrive time
// (focused-scan "Cancelling a Sweep Releases the Slot, Mints Nothing, and
// Ends Emission" — "Cancelling a sweep ends sweeping immediately").
func liveScanWindow(f Fleet) *disclosure.ScanWindow {
	if f.ActiveScanId == "" || f.Scan == nil {
		return nil
	}
	return &disclosure.ScanWindow{DepartMs: f.Scan.DepartMs, ArriveMs: f.Scan.ArriveMs, Range: f.Scan.Range}
}
