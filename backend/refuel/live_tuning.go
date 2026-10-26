package refuel

import (
	"hexaverse/fleet"
	"hexaverse/tuning"
)

func (s *Service) currentParams() fleet.FuelParams {
	if tuning.Enabled() {
		return fleet.DefaultFuelParams()
	}
	return s.params
}
