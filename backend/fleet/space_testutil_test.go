package fleet

// Shared RED-phase test scaffolding for openspec change
// migrate-fleet-to-continuous-burns, tasks.md section 3 ("Fleet state model +
// persistence"). Every symbol these tests reference on `Fleet`/`Service` that
// does not exist yet (space.ShipState-typed State, AttachedTo, Jump,
// BodySource, WithBodies, Position(ctx, f, bodies), OrderTo's new
// OrderRequest shape, CutDrive, Stop, SeedFleet's widened signature,
// DecodeShipState/KinematicDecodeError) is the SDET-authored CONTRACT this
// suite pins ahead of section 3/4's implementation — see the SDET handoff
// report for the full list and the reasoning behind each choice. A developer
// who lands a materially different (but scenario-equivalent) shape should
// raise it as a test dispute for orchestrator adjudication, not silently
// diverge from it.
//
// This file supplies test doubles common to more than one section-3 test
// file: a real `*system.BodyTable` built through the actual `system.Service`
// (never a hand constructed struct literal — BodyTable's fields are
// unexported, and building it for real is what makes these tests exercise
// genuine `space` geometry rather than a stand-in), plus a minimal
// `galaxy.ServiceInterface` fake.

import (
	"context"
	"testing"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/system"

	"go.uber.org/mock/gomock"
)

// stubGalaxyNoGates is a `galaxy.ServiceInterface` fake that resolves live
// galaxy metadata but reports no neighbours — so `system.Service.BodyTable`'s
// gate-derivation step (`addGates`) is a no-op and the resulting table's only
// bodies are the ones the test hands it. Embeds the (nil) interface so only
// the two methods BodyTable's own call path uses need real implementations
// (design.md Decision 16's own dependency; every other galaxy.ServiceInterface
// method is unreachable from this call path and panics on a nil embed if
// ever invoked, which is the point — an accidental new dependency fails
// loudly instead of silently returning a zero value).
type stubGalaxyNoGates struct {
	galaxy.ServiceInterface
	galaxyId string
}

func (g *stubGalaxyNoGates) LiveGalaxyMeta(context.Context) (*galaxy.Galaxy, error) {
	return &galaxy.Galaxy{Id: g.galaxyId}, nil
}

func (g *stubGalaxyNoGates) NeighborsOf(context.Context, string) ([]string, error) {
	return nil, nil
}

// EnsureLaneHorizon is a no-op stub: replace-observation-with-sightings
// tasks.md 1.4 (design.md Decision 23) adds this call to addGates' own path,
// immediately before NeighborsOf, so it is now a genuinely intended call on
// this fake's call path rather than the "accidental new dependency" this
// type's nil embed exists to catch — see the type's own doc comment above.
func (g *stubGalaxyNoGates) EnsureLaneHorizon(context.Context, string) error {
	return nil
}

// testBodyTable builds a genuine *system.BodyTable for systemID, carrying a
// star of starSize plus every extra feature supplied, via the real
// system.Service (backed by a Firestore Dao mock returning the interior
// in-memory) — never a hand-built struct literal, since BodyTable's fields
// are unexported and this is the only way outside package `system` to
// produce one that behaves like the real thing.
func testBodyTable(t *testing.T, systemID string, starSize float64, extras ...system.Feature) *system.BodyTable {
	t.Helper()
	ctrl := gomock.NewController(t)
	dao := system.NewMockDao(ctrl)

	interior := system.SystemInterior{SystemId: systemID, Radius: 16, Extent: 200}
	feats := append([]system.Feature{
		{Id: "feat-star", Type: system.FeatureStar, Fixed: true, Size: starSize},
	}, extras...)

	dao.EXPECT().GetInterior(gomock.Any(), gomock.Any(), systemID).Return(&interior, nil).AnyTimes()
	dao.EXPECT().ListFeatures(gomock.Any(), gomock.Any(), systemID).Return(feats, nil).AnyTimes()

	svc := system.NewServiceWith(dao, &stubGalaxyNoGates{galaxyId: "gal-test"}, common.WorldClock())
	bt, err := svc.BodyTable(context.Background(), systemID)
	if err != nil {
		t.Fatalf("testBodyTable: building the fixture table itself failed: %v", err)
	}
	return bt
}

// freshParkedFleet returns a free-flying (AttachedTo empty) fleet parked at
// the origin — the section-3 tests' own stand-in for service_test.go's
// coastFleetAtCentre(), which cannot be reused here: it constructs the OLD
// board.MovementState-typed State and will not compile once Fleet.State
// becomes space.ShipState (tasks.md 3.2), and service_test.go is a
// pre-existing file this SDET pass must not modify.
// Parked well outside any star clearance this fixture family's star sizes
// produce (max clearance ~19 for the largest configured star size), so
// callers ordering a burn from it never trip BuildCurve's own
// endpoint-clearance guard incidentally — only the star-destination tests
// (star_destination_test.go) want to be that close on purpose.
func freshParkedFleet() *Fleet {
	return &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 150}}},
	}
}

// orbitingFeature is a convenience constructor for a non-star body orbiting
// "feat-star" at the given radius, encoded through space.EncodeOrbit exactly
// as the real DAO's decode step expects (system/bodies_test.go's own
// goodBodyTableInterior fixture uses the identical shape) — never a
// pre-populated f.Space, which a genuine store read can never carry.
func orbitingFeature(id string, radius float64, size float64) system.Feature {
	return system.Feature{
		Id: id, Type: system.FeatureRocky, Size: size,
		SpaceDoc: space.EncodeOrbit(space.Orbit{ParentId: "feat-star", Radius: radius, PeriodMs: 600_000}),
	}
}
