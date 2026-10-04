package corporations

// RED-phase tests for openspec change fix-burn-order-geometry-refusals —
// corporation-spawn, "Home Site Selection" criterion (d): a candidate whose
// home station's shell would reach the star clearance never qualifies.
// Tasks 1.3, 1.4, 1.5 and 1.6. No test here retries and none samples random
// spawns: every field is a fixed line graph with named candidates.
//
// The failing candidate is a single ring-0 body (rocky ring 0 fails under
// every star class); the passing one is rocky ring 1 under G (the fake's
// explicit class).

import (
	"context"
	"errors"
	"testing"

	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/system"

	"cloud.google.com/go/firestore"
	"go.uber.org/mock/gomock"
)

func shellFailingSkeleton() galaxy.Skeleton {
	return galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 0, Mineable: true}}}
}

func shellPassingSkeleton() galaxy.Skeleton {
	return galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 1, Mineable: true}}}
}

func shellInertSkeleton() galaxy.Skeleton { // non-mineable: never a candidate
	return galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{{Type: galaxy.BodyRocky, Ring: 1}}}
}

// shellGraph builds a line graph whose per-index skeleton is chosen by kind:
// 'f' fails (d), 'p' passes, '.' is non-mineable.
func shellGraph(kinds string) *lineGraph {
	g := newLineGraph(len(kinds), allMineable)
	g.skeleton = func(i int) galaxy.Skeleton {
		switch kinds[i] {
		case 'f':
			return shellFailingSkeleton()
		case 'p':
			return shellPassingSkeleton()
		default:
			return shellInertSkeleton()
		}
	}
	return g
}

// Scenario: A system whose station shell reaches the star clearance never qualifies
func TestSiteSelection_Scenario_ShellReachingClearanceNeverQualifies(t *testing.T) {
	t.Run("Scenario: A system whose station shell reaches the star clearance never qualifies", func(t *testing.T) {
		// sys_1_0 is mineable, unclaimed, unreserved and fails (d); it is the
		// only qualifier of hop ring 1. sys_3_0 is the farther qualifier.
		g := shellGraph(".f.p..")
		// Arrangement: sys_1_0 is a single rocky ring-0 body, which the delta's
		// hand-written table fails under every star class (no predicate call here).
		sys, _ := g.GetLiveSystem(context.Background(), lineId(1))
		if b := sys.Skeleton.Bodies; len(b) != 1 || b[0].Ring != 0 || b[0].Type != galaxy.BodyRocky || !b[0].Mineable {
			t.Fatalf("arrangement no longer holds: %s must be one mineable rocky ring-0 body, got %+v", sys.Id, b)
		}
		site, err := selectSpawnSite(context.Background(), g, walkParams(), nil, nil, "acct-shell-1")
		if err != nil {
			t.Fatalf("selectSpawnSite: %v", err)
		}
		if site.Id == lineId(1) {
			t.Fatalf("picked %s, a mineable, unclaimed, unreserved system whose station shell reaches the clearance", site.Id)
		}
		if site.Id != lineId(3) {
			t.Fatalf("picked %s, want the nearest qualifier %s", site.Id, lineId(3))
		}
	})
}

// derivedParentSystemId is the one candidate id (task 1.4 arrangement,
// impl-contract 7.2), found at authoring time by searching i so that, for a
// two-body skeleton, the station derivation names feat-body-1 under
// derivedParentSeed and feat-body-0 under seed 0.
const (
	derivedParentSeed     int64 = 7001
	derivedParentSystemId       = "sys_1_0"
)

// twoBodySkeleton: bodies[0] and bodies[1] rings as given, both rocky, the ring-3 body mineable.
func twoBodySkeleton(ring0, ring1 int) galaxy.Skeleton {
	return galaxy.Skeleton{StarClass: "G", Bodies: []galaxy.Body{
		{Type: galaxy.BodyRocky, Ring: ring0, Mineable: ring0 == 3},
		{Type: galaxy.BodyRocky, Ring: ring1, Mineable: ring1 == 3},
	}}
}

// assertDerivedParentArrangement is the task 1.4 precondition: it reads the
// derivation's own returned ParentId, and fails with "arrangement no longer
// holds" if a retune of the seed mix moved the searched id.
func assertDerivedParentArrangement(t *testing.T, sk galaxy.Skeleton) {
	t.Helper()
	if got := system.StationContinuousOrbit(derivedParentSeed, derivedParentSystemId, sk).ParentId; got != "feat-body-1" {
		t.Fatalf("arrangement no longer holds: derived parent under seed %d is %q, want feat-body-1", derivedParentSeed, got)
	}
	if got := system.StationContinuousOrbit(0, derivedParentSystemId, sk).ParentId; got != "feat-body-0" {
		t.Fatalf("arrangement no longer holds: derived parent under seed 0 is %q, want feat-body-0", got)
	}
}

// derivedParentGraph: sys_1_0 (the searched id) carries `candidate`; sys_3_0 is a
// farther single-body ring-1 decoy; everything else is non-mineable.
func derivedParentGraph(candidate galaxy.Skeleton) *lineGraph {
	g := newLineGraph(6, allMineable)
	g.seed = derivedParentSeed
	g.skeleton = func(i int) galaxy.Skeleton {
		switch i {
		case 1:
			return candidate
		case 3:
			return shellPassingSkeleton()
		default:
			return shellInertSkeleton()
		}
	}
	return g
}

// Scenario: Criterion (d) is decided on the station's derived parent, not on another body, when that parent fails
func TestSiteSelection_Scenario_DerivedParentFailsExcludesCandidate(t *testing.T) {
	t.Run("Scenario: Criterion (d) is decided on the station's derived parent, not on another body, when that parent fails", func(t *testing.T) {
		sk := twoBodySkeleton(3, 0) // derived parent (index 1) is the ring-0 body
		assertDerivedParentArrangement(t, sk)
		g := derivedParentGraph(sk)
		site, err := selectSpawnSite(context.Background(), g, walkParams(), nil, nil, "acct-derived-fail")
		if err != nil {
			t.Fatalf("selectSpawnSite: %v", err)
		}
		if site.Id == derivedParentSystemId {
			t.Fatalf("picked %s, whose derived station parent is a ring-0 body (another body is ring 3)", site.Id)
		}
		if site.Id != lineId(3) {
			t.Fatalf("picked %s, want the farther decoy %s", site.Id, lineId(3))
		}
	})
}

// Scenario: Criterion (d) is decided on the station's derived parent, not on another body, when that parent passes
func TestSiteSelection_Scenario_DerivedParentPassesQualifiesCandidate(t *testing.T) {
	t.Run("Scenario: Criterion (d) is decided on the station's derived parent, not on another body, when that parent passes", func(t *testing.T) {
		sk := twoBodySkeleton(0, 3) // derived parent (index 1) is the ring-3 body
		assertDerivedParentArrangement(t, sk)
		g := derivedParentGraph(sk)
		site, err := selectSpawnSite(context.Background(), g, walkParams(), nil, nil, "acct-derived-pass")
		if err != nil {
			t.Fatalf("selectSpawnSite: %v", err)
		}
		if site.Id != derivedParentSystemId {
			t.Fatalf("picked %s, want the candidate %s whose derived station parent is a ring-3 body (another body is ring 0)", site.Id, derivedParentSystemId)
		}
	})
}

// Scenario: The walk continues past a ring whose only candidates fail the station-shell criterion
func TestSiteSelection_Scenario_WalkContinuesPastFailingRing(t *testing.T) {
	t.Run("Scenario: The walk continues past a ring whose only candidates fail the station-shell criterion", func(t *testing.T) {
		// Settled space is sys_5_0. Hop ring 1 = {sys_4_0, sys_6_0}, both mineable
		// and failing (d). Hop ring 2 = {sys_3_0, sys_7_0}: only sys_7_0 qualifies.
		g := shellGraph("....f.fp....") // indexes: 0-3 '.', 4 f, 5 '.', 6 f, 7 p
		params := walkParams()
		params.MinSpawnDistance = 1
		claimed := map[string]bool{lineId(5): true}
		site, err := selectSpawnSite(context.Background(), g, params, claimed, nil, "acct-walk")
		if err != nil {
			t.Fatalf("selectSpawnSite failed instead of walking past the failing ring: %v", err)
		}
		if site.Id != lineId(7) {
			t.Fatalf("picked %s, want the farther ring's qualifier %s", site.Id, lineId(7))
		}
	})
}

// Scenario: Excluding shell-failing candidates keeps the pick deterministic
func TestSiteSelection_Scenario_DeterministicWithFailingCandidatesPresent(t *testing.T) {
	t.Run("Scenario: Excluding shell-failing candidates keeps the pick deterministic", func(t *testing.T) {
		// Settled space is sys_5_0 and sys_15_0. Hop ring 1 holds four mineable
		// candidates: 4 and 14 fail (d); 6 and 16 pass.
		kinds := make([]byte, 20)
		for i := range kinds {
			kinds[i] = '.'
		}
		kinds[4], kinds[14], kinds[6], kinds[16] = 'f', 'f', 'p', 'p'
		withFailing := string(kinds)
		kinds[4], kinds[14] = '.', '.'
		withoutFailing := string(kinds) // the same field with the failing candidates made non-mineable

		params := walkParams()
		params.MinSpawnDistance = 1
		claimed := map[string]bool{lineId(5): true, lineId(15): true}
		passing := map[string]bool{lineId(6): true, lineId(16): true}

		for _, acct := range []string{"a", "b", "carol", "acct-xyz"} {
			first, err := selectSpawnSite(context.Background(), shellGraph(withFailing), params, claimed, nil, acct)
			if err != nil {
				t.Fatalf("%s: %v", acct, err)
			}
			if !passing[first.Id] {
				t.Fatalf("%s: picked %s, which fails criterion (d) or is not a ring-1 candidate", acct, first.Id)
			}
			for i := 0; i < 3; i++ {
				again, err := selectSpawnSite(context.Background(), shellGraph(withFailing), params, claimed, nil, acct)
				if err != nil || again.Id != first.Id {
					t.Fatalf("%s: non-deterministic pick %v (err %v) vs %s", acct, again, err, first.Id)
				}
			}
			// Failing candidates are excluded, not merely tolerated: the draw is
			// the one the same field makes without them.
			clean, err := selectSpawnSite(context.Background(), shellGraph(withoutFailing), params, claimed, nil, acct)
			if err != nil || clean.Id != first.Id {
				t.Fatalf("%s: pick %s with failing candidates present differs from %v (err %v) without them", acct, first.Id, clean, err)
			}
		}
	})
}

// Scenario: A field whose only candidates fail the station-shell criterion fails as ErrNoSpawnSite and leaves the account corpless
func TestSiteSelection_Scenario_PocketOfFailingCandidatesFailsAsNoSpawnSite(t *testing.T) {
	t.Run("Scenario: A field whose only candidates fail the station-shell criterion fails as ErrNoSpawnSite (selection)", func(t *testing.T) {
		g := shellGraph("ffff") // a finite pocket: every (a)-(c) system fails (d)
		_, err := selectSpawnSite(context.Background(), g, DefaultSpawnParams(), nil, nil, "acct-pocket")
		if !errors.Is(err, ErrNoSpawnSite) {
			t.Fatalf("err = %v, want ErrNoSpawnSite", err)
		}
	})

	t.Run("Scenario: ... and leaves the account corpless (no corporation document, pointer or reservation)", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		dao := NewMockDao(ctrl)
		// Selection reads; nothing else may be called (an unexpected
		// CreateWithPointer, SetAssetsCompleteAt or Get fails the test).
		dao.EXPECT().CorpIdForAccount(gomock.Any(), "acct-pocket").Return("", nil)
		dao.EXPECT().ListLiving(gomock.Any()).Return(nil, nil).AnyTimes()
		dao.EXPECT().ListSpawnClaims(gomock.Any()).Return(map[string]bool{}, nil).AnyTimes()

		svc := NewServiceWith(dao, shellGraph("ffff"), nil, &fakeChartsFog{}, &fakeClock{now: 1000}).
			WithSpawnParams(DefaultSpawnParams())
		_, err := svc.Spawn(context.Background(), "acct-pocket", "Pocketed")
		if !errors.Is(err, ErrNoSpawnSite) {
			t.Fatalf("Spawn err = %v, want ErrNoSpawnSite", err)
		}
	})
}

// healFleets is a FleetSource for the healing test: no hull exists, so healing
// seeds one, and records where.
type healFleets struct {
	seededAt []string
}

func (f *healFleets) SeedFleet(_ context.Context, systemID, corporationID string, _ space.Vec3, _ float64) (*fleet.Fleet, error) {
	f.seededAt = append(f.seededAt, systemID)
	return &fleet.Fleet{Id: "fleet-heal", CorporationId: corporationID, SystemId: systemID}, nil
}

func (f *healFleets) ListForCorp(context.Context, string) ([]fleet.Fleet, error) { return nil, nil }

func (f *healFleets) HomeGeometry(context.Context, string) (float64, float64, error) {
	return 200, 6, nil
}

func (f *healFleets) PrepareFuelCreditInTx(context.Context, *firestore.Transaction, string, float64) (*fleet.FuelCreditPlan, error) {
	return nil, errors.New("healFleets: PrepareFuelCreditInTx is not expected")
}

// Scenario: A corporation already homed in a failing system keeps its home
func TestSpawnHealing_Scenario_CorporationHomedInFailingSystemKeepsItsHome(t *testing.T) {
	t.Run("Scenario: A corporation already homed in a failing system keeps its home", func(t *testing.T) {
		const home = "sys_2_0"
		g := shellGraph("..f.p...")
		g.seed = derivedParentSeed
		homeSys, err := g.GetLiveSystem(context.Background(), home)
		if err != nil {
			t.Fatal(err)
		}
		// Arrangement: a single rocky ring-0 body fails (d) under every star class
		// by the delta's hand-written table (no predicate call here).
		if b := homeSys.Skeleton.Bodies; len(b) != 1 || b[0].Ring != 0 || b[0].Type != galaxy.BodyRocky {
			t.Fatalf("arrangement no longer holds: the recorded home %s must be one rocky ring-0 body, got %+v", home, b)
		}

		corp := Corporation{Id: "corp-heal", AccountId: "acct-heal", Name: "Healed", CreatedAt: 1000, HomeSystemId: home}

		for _, path := range []string{"Spawn", "GetForAccount"} {
			t.Run(path, func(t *testing.T) {
				ctrl := gomock.NewController(t)
				dao := NewMockDao(ctrl)
				c := corp
				// The only calls healing may make. ListLiving, ListSpawnClaims and
				// CreateWithPointer are unexpected (selection re-run, a second
				// reservation) and fail the test if reached.
				dao.EXPECT().CorpIdForAccount(gomock.Any(), "acct-heal").Return("corp-heal", nil)
				dao.EXPECT().Get(gomock.Any(), "corp-heal").Return(&c, nil).AnyTimes() // GetForAccount re-reads once after healing
				dao.EXPECT().SetAssetsCompleteAt(gomock.Any(), "corp-heal", gomock.Any()).Return(nil).AnyTimes()

				var ensured []galaxy.Block
				g.ensured = &ensured
				fleets := &healFleets{}
				svc := NewServiceWith(dao, g, fleets, &fakeChartsFog{}, &fakeClock{now: 5000}).
					WithSpawnParams(DefaultSpawnParams())

				switch path {
				case "Spawn":
					res, err := svc.Spawn(context.Background(), "acct-heal", "Healed")
					if err != nil {
						t.Fatalf("healing Spawn: %v", err)
					}
					if res.HomeSystem.Id != home || res.Corporation.HomeSystemId != home {
						t.Fatalf("healing moved the home: reported %s, recorded %s, want %s", res.HomeSystem.Id, res.Corporation.HomeSystemId, home)
					}
				case "GetForAccount":
					got, err := svc.GetForAccount(context.Background(), "acct-heal")
					if err != nil {
						t.Fatalf("GetForAccount: %v", err)
					}
					if got.HomeSystemId != home {
						t.Fatalf("healing moved the home to %s, want %s", got.HomeSystemId, home)
					}
				}
				if len(fleets.seededAt) != 1 || fleets.seededAt[0] != home {
					t.Fatalf("hull seeded at %v, want exactly the recorded home %s", fleets.seededAt, home)
				}
				if len(ensured) != 0 {
					t.Fatalf("healing materialized blocks %v: the selection walk was re-run", ensured)
				}
			})
		}
	})
}
