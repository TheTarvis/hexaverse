package mine

import (
	"hexaverse/fleet"
	"hexaverse/tuning"
)

func (s *Service) currentParams() MineParams {
	if tuning.Enabled() {
		return DefaultMineParams()
	}
	return s.params
}
func (s *Service) currentClassStats() map[fleet.ShipClass]fleet.ClassStats {
	if tuning.Enabled() {
		return fleet.DefaultClassStats()
	}
	return s.classStats
}
