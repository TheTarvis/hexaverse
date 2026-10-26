package rules

import (
	"hexaverse/disclosure"
	"hexaverse/tuning"
)

func TunedPassiveRange() float64 {
	return tuning.Number("sensors.passiveRange", disclosure.PassiveRange)
}
func TunedPlumeFloor() float64 { return tuning.Number("sensors.plumeFloor", disclosure.PlumeFloor) }
func TunedPlumePerDriveOutput() float64 {
	return tuning.Number("sensors.plumePerDrive", disclosure.PlumePerDriveOutput)
}
func TunedMinCommandedAccel() float64 {
	return tuning.Number("travel.minimumAcceleration", disclosure.MinCommandedAccel)
}
func TunedFocusedScanRange() float64 {
	return tuning.Number("sensors.focusedRange", disclosure.FocusedScanRange)
}
func TunedScanEmissionFloor() float64 {
	return tuning.Number("sensors.scanEmissionFloor", disclosure.ScanEmissionFloor)
}
func TunedScanEmissionPerRange() float64 {
	return tuning.Number("sensors.scanEmissionPerRange", disclosure.ScanEmissionPerRange)
}

func SensorParams() *disclosure.Params {
	return &disclosure.Params{PlumeFloor: TunedPlumeFloor(), PlumePerDriveOutput: TunedPlumePerDriveOutput(), FocusedScanRange: TunedFocusedScanRange(), ScanEmissionFloor: TunedScanEmissionFloor(), ScanEmissionPerRange: TunedScanEmissionPerRange()}
}
