package fleet

// RED-phase tests for fix-burn-order-geometry-refusals task 2.8: a served
// refusal changes nothing and is logged once, below error level, naming the
// cause, route, fleet id and system id (impl-contract 3.3: level info, message
// "fleet: burn solve refusal served", fields refusalCause/route/fleetId/
// systemId). Logs are captured with the package's captureLog, which swaps the
// global zerolog logger (the "injected logger").

import (
	"encoding/json"
	"strings"
	"testing"

	"hexaverse/space"
)

type refusalKind struct {
	name     string
	cause    string
	fleet    func() *Fleet
	orders   []byte
	status   int
	reason   string
	routes   []string // routes that can raise this refusal
	stopable bool
}

func refusalKinds() []refusalKind {
	clr := refusalClearance()
	inward := space.Vec3{X: -5}
	return []refusalKind{
		{"origin-inside", "origin-inside-clearance",
			func() *Fleet { return driftingAt("f-origin", refusalOwnerCorp, space.Vec3{X: 10}, inward) },
			pointOrder(150, 0, 0), 409, reasonOrigin, []string{"order", "preview", "stop"}, true},
		{"destination-inside", "destination-inside-clearance",
			func() *Fleet { return driftingAt("f-dest", refusalOwnerCorp, space.Vec3{X: clr + 1}, inward) },
			pointOrder(clr-1, 0, 0), 409, reasonDestination, []string{"order", "preview", "stop"}, true},
		{"too-short", "minimum-arc",
			func() *Fleet { return parkedAtPoint("f-short", refusalOwnerCorp, 150) },
			pointOrder(151, 0, 0), 409, reasonMinArc, []string{"order", "preview"}, false},
		{"absent-body", "absent-body",
			func() *Fleet { return parkedAtPoint("f-absent", refusalOwnerCorp, 150) },
			bodyOrder("feat-none"), 404, reasonAbsent, []string{"order", "preview"}, false},
	}
}

func pathFor(route, id string) string {
	switch route {
	case "order":
		return ordersPath(id)
	case "preview":
		return previewPath(id)
	default:
		return stopPath(id)
	}
}

// Scenario: Every served refusal leaves state and fuel unchanged
func TestRefusal_Scenario_EveryServedRefusalLeavesStateAndFuelUnchanged(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize)
	for _, k := range refusalKinds() {
		t.Run("Scenario: Every served refusal leaves state and fuel unchanged/"+k.name, func(t *testing.T) {
			f := k.fleet()
			if f.ActiveActionId != "" || f.ActiveScanId != "" {
				t.Fatalf("arrangement no longer holds: fleet must start with empty channel slots")
			}
			e := newRefusalEnv(t, 0, bt, f)
			status, body := e.post(e.router(refusalOwnerCorp), ordersPath(f.Id), k.orders)
			assertRefused(t, "commit", status, body, k.status, k.reason)
			e.assertNothingChanged(f.Id) // stored state, action list, channel slots, fuel
			if got := e.stored[f.Id].Cargo["fuel"]; got != 500 {
				t.Errorf("fuel = %v after the refusal, want 500", got)
			}
		})
	}
}

type logLine map[string]any

func parseLog(t *testing.T, out string) []logLine {
	t.Helper()
	var lines []logLine
	for _, raw := range strings.Split(strings.TrimSpace(out), "\n") {
		if raw == "" {
			continue
		}
		var l logLine
		if err := json.Unmarshal([]byte(raw), &l); err != nil {
			t.Fatalf("unparseable log line %q: %v", raw, err)
		}
		lines = append(lines, l)
	}
	return lines
}

// Scenario: A served refusal is recorded once by cause below error level
func TestRefusal_Scenario_RecordedOnceByCauseBelowErrorLevel(t *testing.T) {
	bt := testBodyTable(t, "sys-0", refusalStarSize)
	for _, k := range refusalKinds() {
		for _, route := range k.routes {
			t.Run("Scenario: A served refusal is recorded once by cause below error level/"+k.name+"/"+route, func(t *testing.T) {
				f := k.fleet()
				e := newRefusalEnv(t, 0, bt, f)
				rt := e.router(refusalOwnerCorp)
				var body []byte
				var status int
				out := captureLog(t, func() {
					var b []byte
					if route == "stop" {
						b = nil
					} else {
						b = k.orders
					}
					status, body = e.post(rt, pathFor(route, f.Id), b)
				})
				assertRefused(t, route, status, body, k.status, k.reason)

				lines := parseLog(t, out)
				var causes []logLine
				for _, l := range lines {
					if l["level"] == "error" || l["level"] == "fatal" || l["level"] == "panic" {
						t.Errorf("an error-level entry was written for a served refusal: %v", l)
					}
					if _, ok := l["refusalCause"]; ok {
						causes = append(causes, l)
					}
				}
				if len(lines) != 1 || len(causes) != 1 {
					t.Fatalf("captured %d entries (%d naming a cause), want exactly one: %s", len(lines), len(causes), out)
				}
				l := causes[0]
				want := map[string]string{
					"level": "info", "refusalCause": k.cause, "route": route,
					"fleetId": f.Id, "systemId": "sys-0", "message": "fleet: burn solve refusal served",
				}
				for key, v := range want {
					if got, _ := l[key].(string); got != v {
						t.Errorf("log field %s = %q, want %q (entry %v)", key, got, v, l)
					}
				}
			})
		}
	}
}
