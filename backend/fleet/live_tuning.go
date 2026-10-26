package fleet

import (
	"hexaverse/tuning"
)

func (s *Service) currentParams() MovementParams {
	if tuning.Enabled() {
		return DefaultMovementParams()
	}
	return s.params
}
func (s *Service) currentClassStats() map[ShipClass]ClassStats {
	if tuning.Enabled() {
		return DefaultClassStats()
	}
	return s.classStats
}
func (s *Service) currentFuelParams() FuelParams {
	if tuning.Enabled() {
		return DefaultFuelParams()
	}
	return s.fuelParams
}
