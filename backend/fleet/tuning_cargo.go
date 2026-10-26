package fleet

import (
	"context"
	"hexaverse/space"
)

// TrimCargoForTuning is intentionally destructive and used only by local tools.
// Settle existing upkeep first, then rebase a held fleet's fuel budget.
func (s *Service) TrimCargoForTuning(ctx context.Context, id string) error {
	f, err := s.Get(ctx, id)
	if err != nil || f == nil {
		return err
	}
	capacity := DerivedCapacity(*f, s.currentClassStats())
	total := 0.0
	for _, v := range f.Cargo {
		total += v
	}
	if total <= capacity {
		return nil
	}
	now := s.clock.Now()
	var rate float64
	if p, held := heldPark(f); held {
		bt, err := s.bodiesFor(ctx, f.SystemId)
		if err != nil {
			return err
		}
		rate = stationKeepRateFor(bt, p.BodyId)
		f.Cargo["fuel"] -= s.openHoldUpkeep(f, rate, now)
	}
	TrimCargo(f.Cargo, capacity)
	if p, held := heldPark(f); held {
		p.HoldStartMs = now
		p.DryInstantMs = dryInstantFor(now, f.Cargo["fuel"], rate, s.currentFuelParams())
		if p.DryInstantMs <= now {
			f.State = parkedState(space.ReleaseStationkeep(p.BodyId, p.Offset, now, p.PeriodMs))
		} else {
			f.State = parkedState(p)
		}
	}
	f.UpdatedAt = now
	return s.dao.Save(ctx, *f)
}

// TrimCargo proportionally clips all cargo, including fuel, to the new capacity.
func TrimCargo(cargo map[string]float64, capacity float64) {
	total := 0.0
	for _, tons := range cargo {
		total += tons
	}
	if total <= capacity || total <= 0 {
		return
	}
	factor := capacity / total
	for kind, tons := range cargo {
		cargo[kind] = tons * factor
	}
}
