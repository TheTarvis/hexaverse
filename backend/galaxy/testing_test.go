package galaxy

import (
	"time"

	"hexaverse/common"
)

func testClock() common.WorldTime {
	return common.NewWorldTime(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), 1)
}
