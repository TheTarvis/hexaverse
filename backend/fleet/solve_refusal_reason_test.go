package fleet

// RED-phase tests for fix-burn-order-geometry-refusals task 2.7 (and the
// sentinel contract of impl-contract 3.1): the four refusal reasons are fixed
// strings, pairwise distinct, carry only their own fragment, avoid the generic
// "not found" text, and are the same on commit, preview and stop. The
// sentinel names, texts and unwrap targets are pinned.

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"hexaverse/space"
)

type reasonRow struct {
	name     string
	sentinel error
	text     string
	fragment string
	spaceErr error
}

func reasonRows() []reasonRow {
	return []reasonRow{
		{"origin", ErrOriginInsideClearance, reasonOrigin, "origin is at or inside", space.ErrEndpointInsideClearance},
		{"destination", ErrDestinationInsideClearance, reasonDestination, "destination is at or inside", space.ErrEndpointInsideClearance},
		{"minimum-arc", ErrBurnArcTooShort, reasonMinArc, "minimum arc length", space.ErrArcTooShort},
		{"absent-body", ErrTargetBodyAbsent, reasonAbsent, "target body is not present", space.ErrUnknownBody},
	}
}

// Scenario: Four refusals yield four different reason bodies (sentinel texts)
// Scenario: No refusal reason contains another refusal's fragment, nor the generic not-found text
func TestRefusalReasons_Scenario_FixedPairwiseDistinctFragments(t *testing.T) {
	rows := reasonRows()
	t.Run("Scenario: Four refusals yield four different reason bodies (sentinel texts)", func(t *testing.T) {
		seen := map[string]string{}
		for _, r := range rows {
			if got := r.sentinel.Error(); got != r.text {
				t.Errorf("%s: sentinel text = %q, want the design.md Decision 6 literal %q", r.name, got, r.text)
			}
			if prev, dup := seen[r.text]; dup {
				t.Errorf("%s and %s share the reason %q", r.name, prev, r.text)
			}
			seen[r.text] = r.name
		}
	})

	t.Run("Scenario: No refusal reason contains another refusal's fragment, nor the generic not-found text", func(t *testing.T) {
		for _, r := range rows {
			if !strings.Contains(r.text, r.fragment) {
				t.Errorf("%s: %q does not contain its own fragment %q", r.name, r.text, r.fragment)
			}
			for _, other := range rows {
				if other.name != r.name && strings.Contains(r.text, other.fragment) {
					t.Errorf("%s: %q contains %s's fragment %q", r.name, r.text, other.name, other.fragment)
				}
			}
			if strings.Contains(r.text, "not found") {
				t.Errorf("%s: %q contains the generic text %q", r.name, r.text, "not found")
			}
			// Fixed string: no body id, point, coordinate or route.
			if strings.ContainsAny(r.text, "0123456789") || strings.Contains(r.text, "feat-") {
				t.Errorf("%s: %q carries an id or a number", r.name, r.text)
			}
			for _, route := range []string{"order", "preview", "stop"} {
				if strings.HasPrefix(r.text, route) {
					t.Errorf("%s: %q carries a route-specific prefix", r.name, r.text)
				}
			}
		}
	})
}

// SDET-added (impl-contract 3.1 "Required properties"): errors.Is identity and unwrap targets.
func TestRefusalSentinels_IdentityAndUnwrapTargets(t *testing.T) {
	rows := reasonRows()
	for _, r := range rows {
		if !errors.Is(r.sentinel, r.sentinel) {
			t.Errorf("%s: errors.Is(x, x) is false", r.name)
		}
		if !errors.Is(r.sentinel, r.spaceErr) {
			t.Errorf("%s: does not unwrap to its space sentinel %v", r.name, r.spaceErr)
		}
		wrapped := errors.Join(errors.New("fleet: solving burn"), r.sentinel)
		if !errors.Is(wrapped, r.sentinel) {
			t.Errorf("%s: does not survive wrapping", r.name)
		}
		for _, other := range rows {
			if other.name != r.name && errors.Is(r.sentinel, other.sentinel) {
				t.Errorf("errors.Is(%s, %s) is true — origin and destination (and every pair) must stay distinguishable", r.name, other.name)
			}
		}
	}
}

// Scenario: Four refusals yield four different reason bodies
// Scenario: The same refusal on commit, preview and stop carries the same reason
func TestRefusalReasons_Scenario_ServedBodiesDistinctAndSameOnEveryRoute(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize)
	clr := refusalClearance()
	inward := space.Vec3{X: -5}

	t.Run("Scenario: Four refusals yield four different reason bodies", func(t *testing.T) {
		arrangements := []struct {
			name string
			f    *Fleet
			body []byte
			want int
			text string
		}{
			{"origin", parkedAtPoint("f-o", refusalOwnerCorp, 10), pointOrder(150, 0, 0), 409, reasonOrigin},
			{"destination", parkedAtPoint("f-d", refusalOwnerCorp, 150), pointOrder(clr-1, 0, 0), 409, reasonDestination},
			{"too short", parkedAtPoint("f-s", refusalOwnerCorp, 150), pointOrder(151, 0, 0), 409, reasonMinArc},
			{"absent body", parkedAtPoint("f-a", refusalOwnerCorp, 150), bodyOrder("feat-none"), 404, reasonAbsent},
		}
		reasons := map[string]string{}
		for _, a := range arrangements {
			e := newRefusalEnv(t, 0, bt, a.f)
			status, body := e.post(e.router(refusalOwnerCorp), ordersPath(a.f.Id), a.body)
			assertRefused(t, a.name, status, body, a.want, a.text)
			got := reasonOf(t, body)
			if got == "" {
				t.Errorf("%s: served no reason (the generic bodyless 5xx shape)", a.name)
			}
			if prev, dup := reasons[got]; dup && got != "" {
				t.Errorf("%s and %s served the same reason %q", a.name, prev, got)
			}
			reasons[got] = a.name
		}
	})

	t.Run("Scenario: The same refusal on commit, preview and stop carries the same reason", func(t *testing.T) {
		// One drifting fleet 1.0 outside the clearance heading at the star: a
		// stop is refused for its lead point, and an order to a point inside
		// the clearance is refused for its destination — the same refusal.
		f := driftingAt("f1", refusalOwnerCorp, space.Vec3{X: clr + 1}, inward)
		e := newRefusalEnv(t, 0, bt, f)
		rt := e.router(refusalOwnerCorp)
		cStatus, cBody := e.post(rt, ordersPath("f1"), pointOrder(clr-1, 0, 0))
		pStatus, pBody := e.post(rt, previewPath("f1"), pointOrder(clr-1, 0, 0))
		sStatus, sBody := e.post(rt, stopPath("f1"), nil)
		assertRefused(t, "commit", cStatus, cBody, 409, reasonDestination)
		assertRefused(t, "preview", pStatus, pBody, 409, reasonDestination)
		assertRefused(t, "stop", sStatus, sBody, 409, reasonDestination)
		if !bytes.Equal(cBody, pBody) || !bytes.Equal(cBody, sBody) {
			t.Fatalf("bodies differ across routes: commit %q preview %q stop %q", cBody, pBody, sBody)
		}
	})
}
