package corporations

import (
	"hexaverse/fleet"
	"hexaverse/tuning"
)

func (s *Service) currentFuelParams() fleet.FuelParams {
	if tuning.Enabled() {
		return fleet.DefaultFuelParams()
	}
	return s.fuelParams
}

func (s *Service) currentStartingCredits() int64 {
	return int64(tuning.Number("markets.startingCredits", float64(s.startingCredits)))
}
