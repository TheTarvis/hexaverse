package system

// RED-phase test for openspec change replace-observation-with-sightings,
// tasks.md 10.10 (design.md Decision 29): "Splice-completeness test in
// system: for every feature the splice path can produce, assert it carries a
// non-nil Space AND a strictly positive Size, and that it SURVIVES
// applyContinuousCascade into the served interior — not merely that the
// fields were set, since a station whose skeleton parent was dropped by the
// ring guard cascades out correctly and the test must distinguish the two.
// Written over the StationSource seam so it fails for any FUTURE spliced
// body family that forgets, not only the station."
// (system-body-table: "A Table Contains No Body With a Non-Positive Size" —
// "No body in a successfully built table has a non-positive size.")
// (system-interior: "Bodies Are Public; Ships Are Disclosed" — "An
// authenticated, spawned requester receives every body in full.")
//
// WHY THIS IS WRITTEN OVER system.StationSource, NOT OVER `stations`
// (design.md Decision 29's own ruling): the fix does NOT live in
// stations.FeatureOf — it lives in system.Service.spliceStation, which
// completes whatever the StationSource returns by setting Space/Size on it
// AFTER the call, before appending. So the completeness obligation belongs
// to the CALLER of StationSource, not to any one implementation of it.
// Testing here, against the interface and a stand-in double shaped exactly
// like today's real producer output, both (a) reproduces the actual bug at
// this package's own unit level (no emulator needed — spliceStation and
// applyContinuousCascade are pure, in-memory transforms) and (b) stays
// meaningful for a hypothetical SECOND spliced body family added later,
// which TestSpliceCompleteness_Scenario_TheCheckIsGenericOverAnyFutureSplicedFamily
// demonstrates non-vacuously below.
//
// WAS RED WHEN WRITTEN: stationFeatureFixture() (station_splice_test.go,
// this package) is shaped exactly like stations.FeatureOf's real production
// output — Id/Type/Name/OwnerCorpId only, no Space, no SpaceDoc, no Size.
// Today's spliceStation (system/service.go)
// appends whatever StationSource.StationFeature returns verbatim, with no
// completion step, so applyContinuousCascade's own (correct) decode-failure
// guard drops it — the exact mechanism behind the three failing e2e subtests
// in backend/station_read_tier_scope_e2e_test.go
// (TestStationReads_Scenario_TierGateAppliesToTheDirectReadOnly), confirmed
// failing against the current tree before this file was added.

import (
	"context"
	"testing"

	"hexaverse/galaxy"
	"hexaverse/space"
)

// fakeGalaxyWithSkeleton is a minimal galaxy.ServiceInterface stub whose
// GetLiveSystem answers a real, non-empty skeleton — everything task 10.7's
// eventual fix needs to derive a station's continuous orbit at the splice
// seam (StationContinuousOrbit indexes skeleton.Bodies, so an empty or nil
// result would either fall back to the star-parented case or panic on a
// nonsensical index). Provided so this test remains valid, and never panics,
// once that fix lands and spliceStation starts calling GetLiveSystem —
// today's unfixed spliceStation never calls it at all.
type fakeGalaxyWithSkeleton struct{ node *galaxy.System }

func (f *fakeGalaxyWithSkeleton) Seed(context.Context, int64, galaxy.GenerationParams) (*galaxy.Galaxy, error) {
	return nil, nil
}
func (f *fakeGalaxyWithSkeleton) GetLive(context.Context) (*galaxy.GeneratedGalaxy, error) {
	return nil, nil
}
func (f *fakeGalaxyWithSkeleton) GetLiveSystem(context.Context, string) (*galaxy.System, error) {
	return f.node, nil
}
func (f *fakeGalaxyWithSkeleton) LiveGalaxyMeta(context.Context) (*galaxy.Galaxy, error) {
	return &galaxy.Galaxy{Id: "gal_splice_completeness", Seed: 42}, nil
}
func (f *fakeGalaxyWithSkeleton) EnsureLaneHorizon(context.Context, string) error { return nil }
func (f *fakeGalaxyWithSkeleton) LaneHorizonBlocks(context.Context, []string) ([]galaxy.Block, error) {
	return nil, nil
}
func (f *fakeGalaxyWithSkeleton) EnsureBlocks(context.Context, ...galaxy.Block) error { return nil }
func (f *fakeGalaxyWithSkeleton) NeighborsOf(context.Context, string) ([]string, error) {
	return nil, nil
}
func (f *fakeGalaxyWithSkeleton) NeighborsOfMany(context.Context, []string) (map[string][]string, error) {
	return nil, nil
}
func (f *fakeGalaxyWithSkeleton) GetLiveSystems(context.Context, []string) ([]galaxy.System, error) {
	return nil, nil
}

// oneBodySkeletonGalaxy is a ready-made fakeGalaxyWithSkeleton whose single
// skeleton body guarantees StationContinuousOrbit's own
// `k = mix64(...) % len(skeleton.Bodies)` selection is deterministic
// (len==1 => k==0 regardless of hash) — so a test can name the resulting
// parent id ("feat-body-0") without depending on the mix64 hash's value.
func oneBodySkeletonGalaxy() *fakeGalaxyWithSkeleton {
	return &fakeGalaxyWithSkeleton{node: &galaxy.System{
		Skeleton: galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 0}}},
	}}
}

// fakeStationSourceGeneric is a system.StationSource stand-in that returns
// exactly the feature it is given. Used to feed spliceStation a feature
// shaped like a producer's raw output — generic over WHICH producer (today's
// stations.FeatureOf, or any future spliced body family) that shape came
// from, which is the whole point of testing over this interface rather than
// the stations package directly.
type fakeStationSourceGeneric struct{ feat *Feature }

func (f *fakeStationSourceGeneric) StationFeature(context.Context, string) (*Feature, error) {
	return f.feat, nil
}

// minimalStarOnlyInterior is a fresh, minimal generated interior carrying
// only the star — deliberately smaller than station_splice_test.go's own
// interiorFixture(), whose non-star feat-body-0 has no Space/SpaceDoc of its
// own and would itself be dropped the instant applyContinuousCascade (never
// exercised by that file) runs on it. This file always calls
// applyContinuousCascade, so it needs a fixture where every feature besides
// the one under test is decode-clean.
func minimalStarOnlyInterior(systemId string) *GeneratedInterior {
	return &GeneratedInterior{
		Interior: SystemInterior{SystemId: systemId},
		Features: []Feature{
			{Id: "feat-star", Type: FeatureStar},
			// A decode-clean, already-decoded (Space set directly, mirroring
			// Generate()'s own in-memory convention — SpaceDoc is only how a
			// STORED, re-read feature carries this) non-star body, so
			// StationContinuousOrbit's single-body-skeleton parent choice
			// ("feat-body-0") has something real to resolve against.
			{Id: "feat-body-0", Type: FeatureRocky,
				Space: &space.Orbit{ParentId: "feat-star", Radius: 20, PeriodMs: 100_000}},
		},
	}
}

// spliceCompletenessViolations runs spliceStation+applyContinuousCascade —
// the exact composition GetOrCreateInterior performs — and reports, in
// plain English, every way the named spliced feature fails task 10.10's
// completeness contract: absence despite its declared parent surviving, a
// nil Space, or a non-positive Size. An empty result means the feature is
// complete. Split out as a pure, boolean-free function (rather than folded
// directly into assertSplicedFeatureIsComplete) so
// TestSpliceCompleteness_Scenario_TheCheckIsGenericOverAnyFutureSplicedFamily
// can observe a violation being caught without failing ITSELF in the
// process.
func spliceCompletenessViolations(svc *Service, gen *GeneratedInterior, featureId, parentSurvivesId string) []string {
	svc.spliceStation(context.Background(), gen)
	svc.applyContinuousCascade(context.Background(), gen.Interior.SystemId, gen)

	parentPresent := false
	var found *Feature
	for i := range gen.Features {
		if gen.Features[i].Id == parentSurvivesId {
			parentPresent = true
		}
		if gen.Features[i].Id == featureId {
			found = &gen.Features[i]
		}
	}
	if !parentPresent {
		return []string{"test setup invalid: declared parent " + parentSurvivesId + " is not present in the " +
			"interior — this check cannot distinguish a producer bug from the cascade's own legitimate drop of " +
			"a feature whose parent is gone"}
	}
	if found == nil {
		return []string{"the spliced feature " + featureId + " is ABSENT from the served interior even though " +
			"its declared parent " + parentSurvivesId + " survived the cascade intact — a spliced body's own " +
			"producer must set Space and a strictly positive Size before the feature is appended (design.md " +
			"Decision 29), or applyContinuousCascade drops it for a reason that has nothing to do with its " +
			"parent chain being gone"}
	}
	var violations []string
	if found.Space == nil {
		violations = append(violations, "spliced feature "+featureId+" survived the cascade but carries a nil Space")
	}
	if !(found.Size > 0) {
		violations = append(violations, "spliced feature "+featureId+" survived the cascade but carries a "+
			"non-positive Size")
	}
	return violations
}

// assertSplicedFeatureIsComplete is task 10.10's general completeness
// assertion: it fails loudly on anything spliceCompletenessViolations
// reports.
func assertSplicedFeatureIsComplete(t *testing.T, svc *Service, gen *GeneratedInterior, featureId, parentSurvivesId string) {
	t.Helper()
	violations := spliceCompletenessViolations(svc, gen, featureId, parentSurvivesId)
	for _, v := range violations {
		t.Errorf("system-body-table \"A Table Contains No Body With a Non-Positive Size\" / system-interior "+
			"\"Bodies Are Public; Ships Are Disclosed\": %s", v)
	}
}

// Scenario: for every feature the splice path can produce, it carries a
// non-nil Space and a strictly positive Size, and survives
// applyContinuousCascade into the served interior.
func TestSpliceCompleteness_Scenario_StationSourceFeatureSurvivesCascadeWithValidSpaceAndSize(t *testing.T) {
	svc := &Service{stations: &fakeStationSourceGeneric{feat: stationFeatureFixture()}, galaxySvc: oneBodySkeletonGalaxy()}
	gen := minimalStarOnlyInterior("sys-splice-completeness")

	assertSplicedFeatureIsComplete(t, svc, gen, "feat-station", "feat-body-0")
}

// Scenario (SDET-added, non-vacuity proof for the "written over the
// StationSource seam, not over the station specifically" requirement): the
// SAME completeness check, pointed at a feature with a completely different
// id/type/name standing in for a hypothetical FUTURE spliced body family
// that repeats the same omission, catches it identically. Nothing about
// spliceCompletenessViolations names the station.
func TestSpliceCompleteness_Scenario_TheCheckIsGenericOverAnyFutureSplicedFamily(t *testing.T) {
	hypotheticalFamily := &Feature{
		Id:   "feat-hypothetical-outpost",
		Type: FeatureType("outpost"),
		Name: "Hypothetical Future Outpost",
		// Space/SpaceDoc/Size deliberately unset — the same omission shape
		// as today's real stations.FeatureOf output.
	}
	svc := &Service{stations: &fakeStationSourceGeneric{feat: hypotheticalFamily}, galaxySvc: oneBodySkeletonGalaxy()}
	gen := minimalStarOnlyInterior("sys-splice-completeness-generic")

	violations := spliceCompletenessViolations(svc, gen, "feat-hypothetical-outpost", "feat-body-0")
	if len(violations) == 0 {
		t.Fatal("non-vacuity check failed: the completeness check did not catch an incomplete feature from a " +
			"hypothetical, non-station StationSource producer — it is not actually generic over future spliced " +
			"body families as task 10.10 requires")
	}
}

// Scenario (SDET-added companion, proving the check does NOT false-positive
// on the ALREADY-COVERED legitimate case — design.md Decision 29's own
// hazard note — mirrors
// TestGetOrCreateInterior_Scenario_OmittingStationParentAlsoOmitsStation in
// interior_continuous_decode_test.go, at this file's own lower level): a
// spliced feature that is itself complete (Space set, Size positive) but
// whose declared parent is absent from the interior is correctly dropped by
// the cascade, and spliceCompletenessViolations must not be the thing
// invoked to judge that case as a producer bug — it requires the caller to
// supply a parent id that is ACTUALLY present, which this test confirms by
// showing the check reports a (test-setup) violation rather than silently
// passing when asked to judge against a parent that isn't there.
func TestSpliceCompleteness_Scenario_DoesNotConfuseALegitimateParentDropWithAProducerBug(t *testing.T) {
	complete := &Feature{
		Id:    "feat-station",
		Type:  FeatureStation,
		Name:  "Trading Station",
		Space: &space.Orbit{ParentId: "feat-body-missing", Radius: 5, PeriodMs: 100_000},
		Size:  StationSize,
	}
	svc := &Service{stations: &fakeStationSourceGeneric{feat: complete}, galaxySvc: oneBodySkeletonGalaxy()}
	// No "feat-body-missing" in this interior — the station's declared
	// parent is genuinely gone, so the station is correctly dropped by the
	// cascade's position-resolution pass, independent of anything this
	// change fixes.
	gen := minimalStarOnlyInterior("sys-splice-completeness-legit-drop")

	violations := spliceCompletenessViolations(svc, gen, "feat-station", "feat-body-missing")
	if len(violations) == 0 {
		t.Fatal("expected the check to flag its own test-setup precondition (the named parent is not present), " +
			"not to silently pass — a caller must always name a parent that genuinely survives before this check " +
			"can distinguish a producer bug from a legitimate drop")
	}
}
