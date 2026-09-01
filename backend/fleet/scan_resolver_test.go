package fleet

// RED-phase tests for openspec change replace-observation-with-sightings §5,
// task 5.8 (specs/focused-scan/spec.md "A Sweep Resolves Into Sightings, Or
// Fizzles") — direct unit tests of ScanResolver, mirroring
// jump_resolver_test.go's own established pattern of testing a resolver
// directly via a hand-built `action.Resolution`, rather than through a full
// Firestore resolve transaction. This is DELIBERATELY NOT the debt-closing
// "real mint path" test the kickoff's Debt 1 demands (that one drives the
// REAL POST /v1/fleets/:fleetId/scan through the production router, with a
// real time-skip resolve and a real GET /v1/sightings confirmation — see
// package main's scan_verb_e2e_test.go) — it exists alongside that test for
// two reasons a pure e2e path can't cheaply cover: (a) fast, deterministic
// coverage of every fizzle branch (Req6's seven scenarios are almost all
// FAILURE paths, and the kickoff's own standing rule is failure paths first),
// and (b) the "unresolvable body host" fizzle specifically, which needs a
// BodySource that has degraded between commit and pulse-reach — trivial to
// construct with a fake here, awkward to reproduce against a real generated
// system.
//
// CONTRACT this file assumes (SDET judgment call, open to dispute):
//
//	type ShipSource interface {
//	    ListInSystem(ctx context.Context, systemID string) ([]Fleet, error)
//	}
//
//	func ScanResolver(ships ShipSource, bodies BodySource) action.ResolveFunc
//
// registered alongside BurnResolver/JumpResolver in RegisterResolvers,
// mirroring BurnResolver(bodies BodySource)'s own injected-dependency shape
// (design.md Decision 13's own text: "mirroring BurnResolver's injected
// BodySource pattern"). ShipSource is a NEW, minimal interface rather than
// reusing ServiceInterface wholesale — *fleet.Service already satisfies it
// structurally via its existing ListInSystem method (service.go), so no new
// production method is implied, only a new named interface.
//
// The decoded actor's fizzle/success decision reads:
//   - f.Scan == nil                          -> already settled (no-op)
//   - f.Jump != nil                           -> fizzle, lane transit
//   - f.SystemId != r.Action.Scope            -> fizzle, left the system
//     (r.Action.Scope is the system the scan was committed in — CommitSpec.Scope,
//     exactly as burn/jump already scope their own actions to the commit-time
//     system)
//   - host does not resolve (as a body in `bodies.BodyTable(ctx, f.SystemId)`,
//     nor as a fleet in `ships.ListInSystem(ctx, f.SystemId)`)
//                                              -> fizzle, host unresolved
//   - disclosure.FocusedScan's own range/occlusion check fails from the
//     scanner's folded position at pulse-reach
//                                              -> fizzle, range or occlusion
//     (distinguished by ReasonCode, per disclosure.ErrScanOutOfRange /
//     disclosure.ErrScanOccluded)
//   - otherwise: mint via sightings.MintWrites, returned as
//     ResolveResult.Writes, ActorState releases the sensor slot and clears
//     Scan in every case (fizzle or success alike) — "a fizzle... SHALL
//     still release the sensor-channel slot at resolve".
//
// A developer landing a materially different but scenario-equivalent shape
// should raise it as a test dispute — most of all on r.Action.Scope as the
// origin-system signal, which is the one part of this contract with no
// existing precedent to anchor it (BurnResolver/JumpResolver read the
// actor's OWN stored SystemId, never r.Action.Scope, because neither of
// them can be resolving after the actor already moved to a different
// system the way a long-running sweep's scanner legitimately can).
//
// EXPECTED RED TODAY: compile error — ScanResolver, ShipSource, ScanWindow,
// Fleet.Scan do not exist.

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/disclosure"
	"hexaverse/space"
)

// fakeShipSource is a hand fake of the assumed ShipSource contract.
type fakeShipSource struct {
	fleets map[string][]Fleet // keyed by systemID
	err    error
}

func (f fakeShipSource) ListInSystem(_ context.Context, systemID string) ([]Fleet, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.fleets[systemID], nil
}

// scanningFleet builds the decoded actor for a running sweep against hostId,
// committed in originSystem, parked (never moving) at scannerPos.
//
// StateDoc is set (via EncodeKinematicState), never bare State: a real
// resolver decodes kinematic state off the STORED, Firestore-native
// StateDoc — never the bare `State` field, which carries `firestore:"-"`
// and is therefore NEVER populated by a real Firestore round trip
// (BurnResolver's own established pattern, resolver.go: "state, err :=
// DecodeKinematicState(bt, f.StateDoc, ...)"). Every fixture in this file
// mirrors jump_resolver_test.go/resolver_test.go's identical convention for
// exactly this reason — a resolver that reads bare State instead nil-panics
// against the real DAO's decoded actor, which this file's own SDET
// verification pass against a throwaway stub caught directly (see the
// SDET handoff report).
func scanningFleet(id, corpId, originSystem, hostId string, scannerPos space.Vec3, depart, arrive int64, rng float64) Fleet {
	state := space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: scannerPos}}
	return Fleet{
		Id: id, CorporationId: corpId, SystemId: originSystem,
		StateDoc: EncodeKinematicState(state),
		Scan:     &ScanWindow{HostId: hostId, DepartMs: cwm(depart), ArriveMs: cwm(arrive), Range: rng},
	}
}

// Scenario: A resolving sweep mints sightings for the chain masked at its
// host — a ship docked to a carrier, and that carrier docked to the swept
// host.
func TestScanResolver_Scenario_MintsSightingsForTheChainMaskedAtItsHost(t *testing.T) {
	host := orbitingFeature("feat-host", 40, 3.0)
	bodies := testBodyTable(t, "sys-0", 6.0, host)
	hostPos, err := space.Position(bodies, "feat-host", 0)
	if err != nil {
		t.Fatalf("resolving host position: %v", err)
	}

	dockedState := EncodeKinematicState(space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint, Point: hostPos}})
	carrier := Fleet{Id: "carrier-1", CorporationId: "corp-other", SystemId: "sys-0", AttachedTo: "feat-host", StateDoc: dockedState}
	ship := Fleet{Id: "ship-1", CorporationId: "corp-other", SystemId: "sys-0", AttachedTo: "carrier-1", StateDoc: dockedState}

	scanner := scanningFleet("scanner-1", "corp-me", "sys-0", "feat-host",
		space.Vec3{X: hostPos.X + 10, Y: hostPos.Y, Z: hostPos.Z}, 0, 10_000, 30)

	ships := fakeShipSource{fleets: map[string][]Fleet{"sys-0": {carrier, ship}}}
	resolver := ScanResolver(ships, stubBodySourceFixed{bt: bodies})

	res, err := resolver(context.Background(), action.Resolution{
		At:     10_000,
		Action: action.Action{Id: "action_scan_1", Scope: "sys-0"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = scanner
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(res.Writes) != 2 {
		t.Fatalf("res.Writes has %d entries, want 2 (the carrier and the ship): %+v", len(res.Writes), res.Writes)
	}
	seen := map[string]bool{}
	for _, w := range res.Writes {
		if len(w.Path) == 0 {
			t.Fatalf("a write has an empty path: %+v", w)
		}
		docID := w.Path[len(w.Path)-1]
		seen[docID] = true
		if hostId, _ := w.Data["hostId"].(string); hostId != "feat-host" {
			t.Errorf("write %q hostId = %v, want feat-host", docID, w.Data["hostId"])
		}
		if clean, _ := w.Data["cleanSweep"].(bool); clean {
			t.Errorf("write %q is marked cleanSweep=true; the host was NOT empty", docID)
		}
	}
	for _, want := range []string{"action_scan_1_carrier-1", "action_scan_1_ship-1"} {
		if !seen[want] {
			t.Errorf("expected a mint write at deterministic doc id %q (action id + target id); got %v", want, seen)
		}
	}
	if got := releasedScanSlot(res); !got {
		t.Error("a successful resolve must still release the sensor-channel slot")
	}
}

// Scenario: A resolving sweep against an empty host mints a clean-sweep
// record.
func TestScanResolver_Scenario_EmptyHostMintsACleanSweepRecord(t *testing.T) {
	host := orbitingFeature("feat-empty-host", 40, 3.0)
	bodies := testBodyTable(t, "sys-0", 6.0, host)
	hostPos, _ := space.Position(bodies, "feat-empty-host", 0)

	scanner := scanningFleet("scanner-1", "corp-me", "sys-0", "feat-empty-host",
		space.Vec3{X: hostPos.X + 10, Y: hostPos.Y, Z: hostPos.Z}, 0, 10_000, 30)

	resolver := ScanResolver(fakeShipSource{}, stubBodySourceFixed{bt: bodies})
	res, err := resolver(context.Background(), action.Resolution{
		At:     10_000,
		Action: action.Action{Id: "action_scan_clean", Scope: "sys-0"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = scanner
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(res.Writes) != 1 {
		t.Fatalf("res.Writes has %d entries, want exactly 1 (the clean-sweep record): %+v", len(res.Writes), res.Writes)
	}
	w := res.Writes[0]
	if clean, _ := w.Data["cleanSweep"].(bool); !clean {
		t.Errorf("clean-sweep write cleanSweep = %v, want true", w.Data["cleanSweep"])
	}
	if _, hasTarget := w.Data["targetId"]; hasTarget {
		t.Errorf("a clean-sweep record carries a targetId: %+v", w.Data)
	}
	if hostId, _ := w.Data["hostId"].(string); hostId != "feat-empty-host" {
		t.Errorf("clean-sweep write hostId = %v, want feat-empty-host", w.Data["hostId"])
	}
}

// Scenario: A resolving sweep stamps its records at pulse-reach, not
// resolution time — the midpoint of depart/arrive, not r.At (which this
// fixture deliberately sets far past pulse-reach, so the two are
// unmistakably distinguishable).
func TestScanResolver_Scenario_StampsRecordsAtPulseReachNotResolutionTime(t *testing.T) {
	host := orbitingFeature("feat-host-pr", 40, 3.0)
	bodies := testBodyTable(t, "sys-0", 6.0, host)
	hostPos, _ := space.Position(bodies, "feat-host-pr", 0)

	const depart, arrive = 0, 10_000
	const wantPulseReach = (depart + arrive) / 2 // 5000, NOT r.At below

	scanner := scanningFleet("scanner-1", "corp-me", "sys-0", "feat-host-pr",
		space.Vec3{X: hostPos.X + 10, Y: hostPos.Y, Z: hostPos.Z}, depart, arrive, 30)

	resolver := ScanResolver(fakeShipSource{}, stubBodySourceFixed{bt: bodies})
	res, err := resolver(context.Background(), action.Resolution{
		At:     999_999, // resolution ran very late — asOf must NOT be this
		Action: action.Action{Id: "action_scan_pr", Scope: "sys-0"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = scanner
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(res.Writes) != 1 {
		t.Fatalf("expected exactly one (clean-sweep) write, got %d", len(res.Writes))
	}
	asOf, ok := res.Writes[0].Data["asOf"]
	if !ok {
		t.Fatalf("mint write carries no asOf field: %+v", res.Writes[0].Data)
	}
	if got := toInt64(asOf); got != wantPulseReach {
		t.Errorf("asOf = %v, want the pulse-reach midpoint %d — never the resolution time 999999", asOf, wantPulseReach)
	}
}

// Scenario: A geometry failure at pulse-reach mints nothing — the target
// host has moved beyond focused-scan range by the time the pulse reaches
// it (simulated here by committing against a host within range but placing
// the SCANNER far away in its stored State, which is what the resolver
// folds at pulse-reach — the scanner's own drift, not the host's, but the
// observable range check is the same predicate either way).
func TestScanResolver_Scenario_GeometryFailureAtPulseReachMintsNothing(t *testing.T) {
	host := orbitingFeature("feat-host-far", 40, 3.0)
	bodies := testBodyTable(t, "sys-0", 6.0, host)
	hostPos, _ := space.Position(bodies, "feat-host-far", 0)

	// The scanner's OWN position, folded at pulse-reach, is now far beyond
	// disclosure.FocusedScanRange from the host — geometry was not held.
	far := space.Vec3{X: hostPos.X + 10*disclosure.FocusedScanRange, Y: hostPos.Y, Z: hostPos.Z}
	scanner := scanningFleet("scanner-1", "corp-me", "sys-0", "feat-host-far", far, 0, 10_000, 30)

	resolver := ScanResolver(fakeShipSource{}, stubBodySourceFixed{bt: bodies})
	res, err := resolver(context.Background(), action.Resolution{
		At:     10_000,
		Action: action.Action{Id: "action_scan_far", Scope: "sys-0"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = scanner
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(res.Writes) != 0 {
		t.Errorf("a geometry failure at pulse-reach minted %d records, want 0: %+v", len(res.Writes), res.Writes)
	}
	if res.ReasonCode == "" {
		t.Error("a geometry-failure fizzle must record a reason code distinguishing range from occlusion")
	}
	if !releasedScanSlot(res) {
		t.Error("a fizzled resolve must still release the sensor-channel slot")
	}
}

// Scenario: A scanning fleet that left the host's system mints nothing —
// the decoded actor's SystemId no longer matches the system the scan was
// committed in (r.Action.Scope).
func TestScanResolver_Scenario_ScannerLeftTheSystemMintsNothing(t *testing.T) {
	bodies := testBodyTable(t, "sys-1", 6.0) // the fleet's NEW system, not "sys-0"

	scanner := scanningFleet("scanner-1", "corp-me", "sys-1" /* now elsewhere */, "feat-host",
		space.Vec3{}, 0, 10_000, 30)

	resolver := ScanResolver(fakeShipSource{}, stubBodySourceFixed{bt: bodies})
	res, err := resolver(context.Background(), action.Resolution{
		At:     10_000,
		Action: action.Action{Id: "action_scan_left", Scope: "sys-0"}, // committed in sys-0
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = scanner
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(res.Writes) != 0 {
		t.Errorf("a scanner that left the host's system minted %d records, want 0", len(res.Writes))
	}
	if !releasedScanSlot(res) {
		t.Error("a fizzled resolve must still release the sensor-channel slot")
	}
}

// Scenario: A scanning fleet in lane transit at pulse-reach mints nothing.
func TestScanResolver_Scenario_ScannerInLaneTransitAtPulseReachMintsNothing(t *testing.T) {
	bodies := testBodyTable(t, "sys-0", 6.0)

	scanner := scanningFleet("scanner-1", "corp-me", "sys-0", "feat-host", space.Vec3{}, 0, 10_000, 30)
	scanner.Jump = &JumpTransit{LaneId: "lane-1", DestSystemId: "sys-1", DepartMs: 1_000, ArriveMs: 999_999}

	resolver := ScanResolver(fakeShipSource{}, stubBodySourceFixed{bt: bodies})
	res, err := resolver(context.Background(), action.Resolution{
		At:     10_000,
		Action: action.Action{Id: "action_scan_transit", Scope: "sys-0"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = scanner
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(res.Writes) != 0 {
		t.Errorf("a scanner in lane transit at pulse-reach minted %d records, want 0", len(res.Writes))
	}
	if !releasedScanSlot(res) {
		t.Error("a fizzled resolve must still release the sensor-channel slot")
	}
}

// Scenario: An unresolvable body host mints nothing and releases the slot —
// the host id does not appear in the resolved BodyTable at pulse-reach (a
// degraded body-table build's own observable effect, per system-body-table
// "The Table Degrades to Fewer Bodies Rather Than a Failed Build"), and no
// fleet in the system carries that id either.
func TestScanResolver_Scenario_UnresolvableBodyHostMintsNothingAndReleasesSlot(t *testing.T) {
	// A body table that never had "feat-vanished" — standing in for one a
	// degraded build has already dropped by the time the resolve reads it.
	bodies := testBodyTable(t, "sys-0", 6.0)

	scanner := scanningFleet("scanner-1", "corp-me", "sys-0", "feat-vanished", space.Vec3{X: 5}, 0, 10_000, 30)

	resolver := ScanResolver(fakeShipSource{fleets: map[string][]Fleet{"sys-0": {}}}, stubBodySourceFixed{bt: bodies})
	res, err := resolver(context.Background(), action.Resolution{
		At:     10_000,
		Action: action.Action{Id: "action_scan_vanished", Scope: "sys-0"},
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = scanner
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(res.Writes) != 0 {
		t.Errorf("an unresolvable host minted %d records, want 0", len(res.Writes))
	}
	if res.ReasonCode == "" {
		t.Error("an unresolvable-host fizzle must record a reason code identifying the host as unresolved")
	}
	if !releasedScanSlot(res) {
		t.Error("an unresolvable host must still release the sensor-channel slot at resolve, or it strands the " +
			"fleet unable to commit a new scan")
	}
}

// releasedScanSlot reports whether a ResolveResult's ActorState clears the
// sensor-channel slot claim (activeScanId) — every fizzle AND every
// successful resolve alike must do this (mirrors BurnResolver's own
// ActorState-based release, action.ResolveOne's slotField mechanism doing
// the actual Firestore write from whatever ActorState the resolver hands
// back).
func releasedScanSlot(res action.ResolveResult) bool {
	if res.ActorState == nil {
		return false
	}
	v, ok := res.ActorState["activeScanId"]
	if !ok {
		return false
	}
	s, ok := v.(string)
	return ok && s == ""
}

func toInt64(v interface{}) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case float64:
		return int64(n)
	default:
		return -1
	}
}

// cwm is a tiny common.WorldMillis literal helper.
func cwm(ms int64) common.WorldMillis { return common.WorldMillis(ms) }
