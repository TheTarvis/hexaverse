package system

import (
	"hexaverse/common"
	"hexaverse/tuning"
)

func TunedKeplerBaseRadius() float64  { return tuning.Number("orbits.baseRadius", KeplerBaseRadius) }
func TunedKeplerBaseSeconds() float64 { return tuning.Number("orbits.baseSeconds", KeplerBaseSeconds) }

func (t *BodyTable) ParkingPeriod(radius float64) common.WorldMillis {
	base := tuning.Number("orbits.parkingBaseSeconds", 5)
	perRadius := tuning.Number("orbits.parkingSecondsPerRadius", .9)
	seconds := float64(base + float64(perRadius*radius))
	return common.WorldMillis(seconds * 1000)
}

func (s *Service) currentParams() GenerationParams {
	if tuning.Enabled() {
		return DefaultParams()
	}
	return s.params
}
