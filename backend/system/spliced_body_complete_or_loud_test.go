package system

// RED-phase test for openspec change replace-observation-with-sightings,
// tasks.md 10.14 (design.md Decision 29): "Test the new system-interior ADDED
// requirement *A Spliced Body Is Complete or Omitted, and Its Incompleteness
// Is Loud* directly: a spliced body missing Space, and separately one with a
// non-positive Size, is each omitted from the interior read and from any
// table built from it, with the omission recorded at Error severity naming
// the splicing source and the missing field — distinguishably from a stored
// feature's Warn-severity decode omission (task 10.9's seam); and a complete
// spliced body (both fields set) is served indistinguishably from a stored
// feature."
//
// Written over the StationSource seam (never a station-specific fixture
// alone), mirroring splice_completeness_test.go's own justification, so this
// suite fails for any FUTURE spliced body family that forgets the
// completeness contract, not only the station: the "missing Space" and
// "non-positive Size" cases below both use a hypothetical non-station
// FeatureType ("outpost") precisely so the station's own type-gated
// self-heal branch (system.Service.spliceStation's
// `feat.Type == FeatureStation && feat.Space == nil && s.galaxySvc != nil`)
// cannot mask the defect under test by silently healing it.
//
// AMBIGUITY RESOLVED (orchestrator ruling, recorded here for anyone editing
// this file later): task 10.9's text says a spliced body "carries no Space"
// is Error-logged and omitted. system.Feature carries TWO orbit fields — the
// decoded Space and the persistence-native SpaceDoc — and
// applyContinuousCascade already decodes a spliced feature's SpaceDoc when it
// arrives with Space == nil (system/service.go's cascade decode loop, the
// same step TestGetOrCreateInterior_Scenario_OmittingStationParentAlsoOmitsStation
// in interior_continuous_decode_test.go depends on to keep flowing a spliced
// station that arrives with only a SpaceDoc). The resolved reading, encoded
// by TestSplicedBody_Scenario_DecodableSpaceDocCountsAsAnOrbitalElementSetNotMissing
// below: "carries no orbital element set" means neither a non-nil Space NOR a
// decodable SpaceDoc. A spliced body arriving with a decodable SpaceDoc is
// COMPLETE (on the Space axis) and must keep flowing through the existing
// decode path, exactly as today. This reading is consistent with the spec
// text (which never says SpaceDoc is disqualified) and keeps the
// already-shipped OmittingStationParentAlsoOmitsStation scenario green — see
// that test's own docstring, which already relies on exactly this behavior.
//
// EXPECTED TO BE RED TODAY (confirmed by running this file before any
// production change): system.Service.applyContinuousCascade's decode-failure
// branch (system/service.go, "Spliced feature's orbital element set failed to
// decode; omitting from the interior read") logs at Warn, not Error, and does
// not distinguish itself from a stored feature's own Warn-level decode
// omission (system/service.go's readInterior loop) — task 10.9's population
// split does not exist yet. Separately, nothing in applyContinuousCascade (or
// anywhere else in the splice path) checks Size at all: a spliced feature
// with Space set but a non-positive Size sails through to the served
// interior untouched today.

import (
	"context"
	"strings"
	"testing"

	"hexaverse/board"
	"hexaverse/galaxy"
	"hexaverse/space"
)

// hypotheticalOutpost is a spliced-body fixture standing in for a FUTURE
// spliced body family (never the station): a non-station FeatureType so
// spliceStation's station-specific self-heal branch cannot mask a missing
// Space by deriving one, keeping the two defects under test (missing Space,
// non-positive Size) isolated and attributable to the completeness contract
// itself rather than to the station's own healing path.
func hypotheticalOutpost(id string) *Feature {
	return &Feature{
		Id:        id,
		Type:      FeatureType("outpost"),
		Name:      "Hypothetical Future Outpost",
		Footprint: []board.Cell{{Ring: 4, Slot: 0}},
	}
}

// logLineNaming returns the single captured log line mentioning marker (a
// feature id), or "" if no line mentions it. Zerolog's default writer emits
// one JSON object per line, so this is enough to attribute a level/message to
// a specific feature without parsing JSON.
func logLineNaming(logged, marker string) string {
	for _, line := range strings.Split(logged, "\n") {
		if strings.Contains(line, marker) {
			return line
		}
	}
	return ""
}

func featurePresent(features []Feature, id string) (Feature, bool) {
	for _, f := range features {
		if f.Id == id {
			return f, true
		}
	}
	return Feature{}, false
}

// Scenario: A spliced body missing its orbit ... is omitted and recorded
// loudly (the "missing Space" half).
func TestSplicedBody_Scenario_MissingOrbitalElementSetIsOmittedAndLoggedAtErrorSeverity(t *testing.T) {
	feat := hypotheticalOutpost("feat-outpost-missing-space")
	feat.Size = 5 // positive — isolates the missing-Space defect from the Size one
	// Space and SpaceDoc both deliberately left unset.

	svc := &Service{stations: &fakeStationSourceGeneric{feat: feat}, galaxySvc: oneBodySkeletonGalaxy()}
	gen := minimalStarOnlyInterior("sys-splice-loud-missing-space")

	var logged string
	logged = captureLog(t, func() {
		svc.spliceStation(context.Background(), gen)
		svc.applyContinuousCascade(context.Background(), gen.Interior.SystemId, gen)
	})

	if _, ok := featurePresent(gen.Features, feat.Id); ok {
		t.Fatalf("system-interior \"A Spliced Body Is Complete or Omitted...\": a spliced body with no orbital "+
			"element set (neither Space nor a decodable SpaceDoc) was served anyway — got features=%v", gen.Features)
	}

	line := logLineNaming(logged, feat.Id)
	if line == "" {
		t.Fatalf("no log line names the omitted spliced feature %q at all — full capture: %q", feat.Id, logged)
	}
	if !strings.Contains(line, `"level":"error"`) {
		t.Errorf("system-interior \"A Spliced Body Is Complete or Omitted, and Its Incompleteness Is Loud\": "+
			"the omission of spliced feature %q (missing its orbital element set) must be recorded at ERROR "+
			"severity, distinguishably from a stored feature's Warn-severity decode omission — got log line: %q",
			feat.Id, line)
	}
	if !strings.Contains(strings.ToLower(line), "splic") {
		t.Errorf("the omission log line for %q does not name the splicing source (expected some mention of "+
			"\"spliced\"/\"splice\") — got: %q", feat.Id, line)
	}
	if !strings.Contains(line, "Space") {
		t.Errorf("the omission log line for %q does not name the missing field (\"Space\") — got: %q", feat.Id, line)
	}
}

// Scenario: A spliced body ... with a non-positive Size ... is omitted and
// recorded loudly (the "non-positive Size" half). Table-driven over the
// boundary (SDET-added: zero AND negative, not just the literal spec
// example) per the skill's boundary-probe guidance.
func TestSplicedBody_Scenario_NonPositiveSizeIsOmittedAndLoggedAtErrorSeverity(t *testing.T) {
	cases := []struct {
		name string
		size float64
	}{
		{"zero size", 0},
		{"negative size (SDET-added boundary)", -1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			feat := hypotheticalOutpost("feat-outpost-bad-size-" + tc.name)
			// Space set directly (in-memory convention, mirroring Generate's
			// own decoded features) so the ONLY defect under test is Size.
			feat.Space = &space.Orbit{ParentId: "feat-body-0", Radius: 20, PeriodMs: 100_000}
			feat.Size = tc.size

			svc := &Service{stations: &fakeStationSourceGeneric{feat: feat}, galaxySvc: oneBodySkeletonGalaxy()}
			gen := minimalStarOnlyInterior("sys-splice-loud-bad-size")

			logged := captureLog(t, func() {
				svc.spliceStation(context.Background(), gen)
				svc.applyContinuousCascade(context.Background(), gen.Interior.SystemId, gen)
			})

			if _, ok := featurePresent(gen.Features, feat.Id); ok {
				t.Fatalf("system-interior \"A Spliced Body Is Complete or Omitted...\": \"A spliced body SHALL "+
					"never be served with a non-positive size\" — a spliced body with Size=%v was served anyway — "+
					"got features=%v", tc.size, gen.Features)
			}

			line := logLineNaming(logged, feat.Id)
			if line == "" {
				t.Fatalf("no log line names the omitted spliced feature %q (Size=%v) at all — full capture: %q",
					feat.Id, tc.size, logged)
			}
			if !strings.Contains(line, `"level":"error"`) {
				t.Errorf("the omission of spliced feature %q (Size=%v) must be recorded at ERROR severity — "+
					"got log line: %q", feat.Id, tc.size, line)
			}
			if !strings.Contains(line, "Size") {
				t.Errorf("the omission log line for %q does not name the missing/invalid field (\"Size\") — "+
					"got: %q", feat.Id, line)
			}
		})
	}
}

// Scenario: distinguishable severity — a stored feature's own decode omission
// stays Warn while a spliced body's incompleteness is Error, observed in the
// SAME read so no difference in test setup can explain the gap.
func TestSplicedBody_Scenario_SplicedOmissionIsLoggedLoudlierThanAStoredFeatureDecodeOmission(t *testing.T) {
	badStoredFeature := Feature{
		Id: "feat-stored-bad-decode", Type: FeatureRocky, Footprint: []board.Cell{{Ring: 3, Slot: 0}},
		Orbit: &Orbit{Ring: 3, Dir: 1}, SpaceDoc: nil, // no SpaceDoc key at all -> stored decode failure
	}
	feats := []Feature{
		{Id: "feat-star", Type: FeatureStar, Fixed: true, Footprint: []board.Cell{{Ring: 0, Slot: 0}}},
		badStoredFeature,
	}
	interior := extentOK()
	dao := newFakeDao(t, interior, feats)

	badSplicedStation := &Feature{
		Id: "feat-spliced-bad-decode", Type: FeatureStation,
		Footprint: []board.Cell{{Ring: 6, Slot: 0}},
		Size:      StationSize, // positive: isolates the missing-Space defect
		// No Space, no SpaceDoc. galaxySvc.GetLiveSystem below returns nil,
		// so spliceStation's own self-heal degrades without setting Space
		// (see spliceStation's documented degrade path), reproducing a
		// spliced body arriving with no orbital element set.
	}
	svc := NewServiceWith(dao, &fakeGalaxyDecode{meta: &galaxy.Galaxy{Id: "gal_1", Seed: 42}}, testClock()).
		WithStations(&fakeStationSourceDecode{feat: badSplicedStation})

	var gen *GeneratedInterior
	var err error
	logged := captureLog(t, func() {
		gen, err = svc.GetOrCreateInterior(context.Background(), "sys-decode")
	})
	if err != nil {
		t.Fatalf("GetOrCreateInterior: %v", err)
	}

	if _, ok := featurePresent(gen.Features, badStoredFeature.Id); ok {
		t.Fatalf("test setup invalid: the bad STORED feature survived — got features=%v", gen.Features)
	}
	if _, ok := featurePresent(gen.Features, badSplicedStation.Id); ok {
		t.Fatalf("the bad SPLICED station survived the read — got features=%v", gen.Features)
	}

	storedLine := logLineNaming(logged, badStoredFeature.Id)
	splicedLine := logLineNaming(logged, badSplicedStation.Id)
	if storedLine == "" {
		t.Fatalf("no log line names the omitted stored feature %q — full capture: %q", badStoredFeature.Id, logged)
	}
	if splicedLine == "" {
		t.Fatalf("no log line names the omitted spliced feature %q — full capture: %q", badSplicedStation.Id, logged)
	}
	if !strings.Contains(storedLine, `"level":"warn"`) {
		t.Errorf("a stored feature's decode omission must remain Warn-severity (unchanged by this capability) — "+
			"got: %q", storedLine)
	}
	if !strings.Contains(splicedLine, `"level":"error"`) {
		t.Errorf("system-interior \"A Spliced Body Is Complete or Omitted, and Its Incompleteness Is Loud\": a "+
			"spliced body's incompleteness must be recorded at ERROR severity, DISTINGUISHABLY from a stored "+
			"feature's Warn-severity decode omission — stored got %q, spliced got %q", storedLine, splicedLine)
	}
}

// Scenario: A complete spliced body is served, indistinguishably from a
// stored feature.
func TestSplicedBody_Scenario_CompleteSplicedBodyIsServedIndistinguishablyFromAStoredFeature(t *testing.T) {
	feat := hypotheticalOutpost("feat-outpost-complete")
	feat.Space = &space.Orbit{ParentId: "feat-body-0", Radius: 30, PeriodMs: 200_000}
	feat.Size = 12

	svc := &Service{stations: &fakeStationSourceGeneric{feat: feat}, galaxySvc: oneBodySkeletonGalaxy()}
	gen := minimalStarOnlyInterior("sys-splice-complete")

	logged := captureLog(t, func() {
		svc.spliceStation(context.Background(), gen)
		svc.applyContinuousCascade(context.Background(), gen.Interior.SystemId, gen)
	})

	got, ok := featurePresent(gen.Features, feat.Id)
	if !ok {
		t.Fatalf("a complete spliced body (non-nil Space, positive Size) was omitted — got features=%v",
			gen.Features)
	}
	if got.Space == nil {
		t.Error("the served spliced feature carries a nil Space")
	}
	if !(got.Size > 0) {
		t.Errorf("the served spliced feature carries a non-positive Size (%v)", got.Size)
	}
	// Indistinguishable from a stored feature: the pre-existing stored body
	// (feat-body-0) is present in the same result with the same field shape
	// (non-nil Space, positive Size) and no special marker sets the spliced
	// one apart.
	storedBody, ok := featurePresent(gen.Features, "feat-body-0")
	if !ok {
		t.Fatal("test setup invalid: the fixture's own stored body is missing from the result")
	}
	if (got.Space == nil) != (storedBody.Space == nil) {
		t.Error("the complete spliced feature's Space-presence differs in kind from a stored feature's")
	}
	if strings.Contains(logged, feat.Id) {
		t.Errorf("a complete spliced body should not be logged as an omission at all — found a log line naming "+
			"it: %q", logLineNaming(logged, feat.Id))
	}
}

// Scenario (SDET-added, pins the ambiguity ruling recorded in this file's own
// header comment): a spliced body arriving with a decodable SpaceDoc — never
// a directly-set Space — is treated as carrying an orbital element set, not
// as "missing" one. Expected GREEN both before and after task 10.9 lands:
// this is the existing decode path, unchanged by the Error/Warn population
// split, and TestGetOrCreateInterior_Scenario_OmittingStationParentAlsoOmitsStation
// (interior_continuous_decode_test.go) already depends on this exact
// behavior for the real station producer.
func TestSplicedBody_Scenario_DecodableSpaceDocCountsAsAnOrbitalElementSetNotMissing(t *testing.T) {
	feat := hypotheticalOutpost("feat-outpost-spacedoc-only")
	feat.SpaceDoc = validSpaceDoc("feat-body-0", 25)
	feat.Size = 8
	// Space deliberately left nil — only SpaceDoc carries the orbit.

	svc := &Service{stations: &fakeStationSourceGeneric{feat: feat}, galaxySvc: oneBodySkeletonGalaxy()}
	gen := minimalStarOnlyInterior("sys-splice-spacedoc-only")

	logged := captureLog(t, func() {
		svc.spliceStation(context.Background(), gen)
		svc.applyContinuousCascade(context.Background(), gen.Interior.SystemId, gen)
	})

	got, ok := featurePresent(gen.Features, feat.Id)
	if !ok {
		t.Fatalf("a spliced body carrying a decodable SpaceDoc (no direct Space) was omitted as if it had no "+
			"orbital element set at all — full log: %q", logged)
	}
	if got.Space == nil {
		t.Error("the SpaceDoc was not decoded into Space for the served feature")
	}
	if strings.Contains(logged, feat.Id) {
		t.Errorf("a spliced body with a decodable SpaceDoc should not be logged as an omission — found: %q",
			logLineNaming(logged, feat.Id))
	}
}
