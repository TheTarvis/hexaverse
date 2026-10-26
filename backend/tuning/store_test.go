package tuning

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"
)

func testFields() []Field {
	return []Field{
		{Key: "world.speed", Default: 1, Min: .01, Max: 1000},
		{Key: "generation.seed", Default: 42, Min: 0, Max: 100, Integer: true, Regenerate: true},
		{Key: "hulls.holdCapacity", Default: 200, Min: 0, Max: 1000},
	}
}
func setup(t *testing.T) (string, time.Time) {
	t.Helper()
	t.Cleanup(func() { state.Lock(); state.enabled = false; state.Unlock() })
	path := filepath.Join(t.TempDir(), "tuning.json")
	wall := time.Date(2026, 10, 26, 12, 0, 0, 0, time.UTC)
	if err := Initialize(path, testFields(), wall, 1); err != nil {
		t.Fatal(err)
	}
	return path, wall
}
func TestClockContinuousAcrossApplyDowntimeAndImportedRestart(t *testing.T) {
	path, wall := setup(t)
	before := ClockAt(wall)
	p := Get().Profile
	p.Values["world.speed"] = 2
	if err := Apply(p, wall); err != nil {
		t.Fatal(err)
	}
	if ClockAt(wall) != before || ClockAt(wall.Add(time.Second)) != before+2000 {
		t.Fatal("speed edit jumped world time")
	}
	p.Values["world.speed"] = 4
	if err := Stage(p); err != nil {
		t.Fatal(err)
	}
	if ClockScale() != 2 {
		t.Fatal("import applied before restart")
	}
	restart := wall.Add(10 * time.Second)
	if err := Initialize(path, testFields(), restart, 1); err != nil {
		t.Fatal(err)
	}
	if ClockAt(restart) != before+20000 {
		t.Fatal("downtime did not use previous speed")
	}
	if ClockAt(restart.Add(time.Second)) != before+24000 {
		t.Fatal("restart did not adopt new speed continuously")
	}
}
func TestGenerationIsStagedThroughRestartUntilExplicitActivation(t *testing.T) {
	path, wall := setup(t)
	p := Get().Profile
	p.Values["generation.seed"] = 99
	if err := Apply(p, wall); err != nil {
		t.Fatal(err)
	}
	if Number("generation.seed", 0) != 42 {
		t.Fatal("generation changed during Apply")
	}
	if err := Initialize(path, testFields(), wall.Add(time.Second), 1); err != nil {
		t.Fatal(err)
	}
	if Number("generation.seed", 0) != 42 {
		t.Fatal("restart changed generation of an existing world")
	}
	if err := ActivateGeneration(); err != nil {
		t.Fatal(err)
	}
	if Number("generation.seed", 0) != 99 {
		t.Fatal("regeneration did not activate saved settings")
	}
}
func TestRejectedProfilesLeaveSavedAndActiveStateAlone(t *testing.T) {
	_, wall := setup(t)
	p := Get().Profile
	p.Values["world.speed"] = -2
	if err := Apply(p, wall); err == nil {
		t.Fatal("accepted negative speed")
	}
	if ClockScale() != 1 || Get().Profile.Values["world.speed"] != 1 {
		t.Fatal("invalid profile partially applied")
	}
	p = Get().Profile
	delete(p.Values, "hulls.holdCapacity")
	p.Values["unknown"] = 0
	if err := Stage(p); err == nil {
		t.Fatal("accepted an unknown/missing key")
	}
}

func TestImportedNullIsNotSilentlyDecodedAsZero(t *testing.T) {
	var p Profile
	if err := json.Unmarshal([]byte(`{"version":1,"values":{"hulls.holdCapacity":null}}`), &p); err == nil {
		t.Fatal("accepted null as zero-capacity override")
	}
}
