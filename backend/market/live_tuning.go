package market

import (
	"hexaverse/tuning"
)

func (s *Service) currentParams() Params {
	if tuning.Enabled() {
		return DefaultParams()
	}
	return s.params
}
