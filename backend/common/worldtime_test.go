package common

import (
	"testing"
	"time"
)

func TestWorldTime_ScaleWarpsElapsed(t *testing.T) {
	epoch := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	clock := NewWorldTime(epoch, 60) // 1 wall-second == 60 world-seconds

	// One wall-minute after the epoch.
	wall := epoch.Add(time.Minute)
	got := clock.FromWall(wall)

	// 60_000 wall-ms × 60 == 3_600_000 world-ms.
	want := WorldMillis(3_600_000)
	if got != want {
		t.Fatalf("FromWall(epoch+1m) = %d, want %d", got, want)
	}
}

func TestWorldTime_ScaleOneIsRealTime(t *testing.T) {
	epoch := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	clock := NewWorldTime(epoch, 1)

	wall := epoch.Add(90 * time.Second)
	if got, want := clock.FromWall(wall), WorldMillis(90_000); got != want {
		t.Fatalf("scale=1 should be real time: got %d, want %d", got, want)
	}
}

func TestWorldTime_NonPositiveScaleDefaultsToOne(t *testing.T) {
	epoch := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, s := range []float64{0, -5} {
		clock := NewWorldTime(epoch, s)
		if clock.Scale() != 1 {
			t.Fatalf("scale %v should clamp to 1, got %v", s, clock.Scale())
		}
	}
}

func TestWorldMillis_Add(t *testing.T) {
	base := WorldMillis(1000)
	if got := base.Add(500); got != 1500 {
		t.Fatalf("Add = %d, want 1500", got)
	}
}
