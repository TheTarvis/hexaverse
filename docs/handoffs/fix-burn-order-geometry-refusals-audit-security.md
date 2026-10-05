# Security implementation audit — `fix-burn-order-geometry-refusals` at commit 7020952

*Written by the security reviewer, 2026-10-04. Read-only. The working tree matches 7020952 for
`backend/fleet`, `backend/corporations`, `backend/system` and `frontend/lib`.*

**Finding counts: BLOCKER 0, FAIL 0, ADVISORY 3. Verdict: CLEAR.**

**What was run (tiers 0-1 only, no stack booted):** `go vet ./fleet/ ./corporations/ ./system/`
(clean) and `go test -short` over the refusal, fault, stop, ownership and station-shell tests in
those three packages (all pass). Everything else below is from reading the diff and the code.
The frontend tests were read, not run.

## The five audit points

### 1. Authz before solve on `orders`, `orders/preview`, `stop` — enforced

- **Enforcement point.** Each handler calls `commandedFleetId` before binding a body or reaching
  the service: `backend/fleet/handler.go:223` (Order), `:253` (OrderPreview), `:346` (Stop). The
  commit did not touch that seam.
- **No bypass.** The classifier `solveBurnClassified` has two callers only
  (`backend/fleet/service.go:720`, `:1348`). `OrderTo`, `PreviewOrder` and `Stop` are called
  only from the three handlers (`handler.go:232`, `:268`, `:350`). A foreign, corpless or
  unknown-fleet request therefore reaches neither a refusal reason nor the refusal log line.
- **Deny-path test.** `backend/fleet/solve_refusal_handler_test.go:294-354` runs the real
  handler over the real service. It first proves the owner is served each of the four refusals,
  then sends the same ten requests (all three routes) as a foreign requester and as a corpless
  one, and to a nonexistent fleet id. It asserts a bodyless 404, byte-identical to the
  nonexistent fleet's, and unchanged stored records. This is the scenario from spec-phase
  MINOR 1.
- The test does not capture the log for those requests; see ADVISORY 1.

### 2. Fixed reason text, no request-controlled string — enforced

- **Body.** The four `respond` arms serve the sentinel's own text, not `err.Error()`
  (`backend/fleet/handler.go:475-482`). The texts are constants
  (`backend/fleet/solve_refusal.go:28-34`) with no body id, point, coordinate or route. The
  `fleet: ` prefix is the package prefix and is the same on every route.
- **Log entry.** One info-level line with four fields: `refusalCause` and `route` (constants),
  `fleetId` and `systemId` (`solve_refusal.go:59-64`). Both ids come from the stored fleet
  record loaded after the ownership check (`service.go:720`, `:1348`), not from the request
  body. The requested body id and point are not logged.
- **Tests.** `solve_refusal_reason_test.go:37` (fragments, pairwise distinct, no `not found`),
  `:102` (same body on every route), and `solve_refusal_handler_test.go:264-291` (absent-body
  reason byte-identical for two different absent ids).

### 3. Broken parent chain and missing stored host stay logged 5xx — enforced

- **Broken parent on a present target.** Absence is decided by a table lookup of the requested
  id (`solve_refusal.go:68-72`). A `space.ErrUnknownBody` raised inside the solve falls to the
  classifier's default branch and is returned unchanged (`:84-85`). `respond` has no arm for the
  raw `space` sentinel, so it reaches the default arm: error log, bodyless 500
  (`handler.go:607`). Test: `solve_refusal_faults_test.go:129-151`.
- **Missing stored host.** `Service.Position` fails before the classifier is called
  (`service.go:678` for order and preview, `:1277` for stop), so the error is never classified.
  Test: `solve_refusal_faults_test.go:154-192` (orders and preview; see ADVISORY 2 for stop).
- **Body-table cycle.** Same default branch. Test: `solve_refusal_faults_test.go:106-126`.
- This is spec-phase MINOR 2, closed.

### 4. The log-level change suppresses no genuine fault — confirmed

- The classifier converts exactly two `space` sentinels, each with a single raise site:
  `ErrEndpointInsideClearance` (`backend/space/burn.go:282`) and `ErrArcTooShort` (`:471`). Both
  are geometric outcomes of the request, not faults.
- Every other error passes through unlogged by the classifier and is logged at error level by
  the unchanged default arm.
- `solve_refusal_faults_test.go:66-101` asserts, on all three routes, exactly one error-level
  entry and no `refusalCause` field for a fault.

### 5. Nothing widens what a requester learns about another corporation — confirmed

- **Fleet.** No read path, DTO or route changed. The new reasons describe the requester's own
  fleet and own target, behind the ownership seam.
- **Spawn.** Criterion (d) is a pure predicate over galaxy-tier data
  (`backend/system/station_continuous.go:80-98`), applied in `qualify`
  (`backend/corporations/siteselection.go:209-213`). It takes no requester input and adds
  nothing to any response. It does not read or reveal another corporation's home.
- **Frontend.** The two Stop surfaces now map the reason to fixed copy
  (`frontend/components/galaxy/GalaxyView.tsx:326`,
  `frontend/components/space/FleetActionsPanel.tsx:585`). `GalaxyView` previously toasted the raw
  error message, so this is a small tightening. No secret, no new cached response.

## Advisories

### ADVISORY 1 — the foreign-fleet test does not assert the absence of a refusal log entry

`solve_refusal_handler_test.go:333-353` checks status, body and stored state, but does not wrap
the requests in `captureLog`. The property holds structurally today (point 1, "No bypass"), so
this is a regression pin, not a defect. Smallest fix: wrap the loop body's two `e.post` calls in
`captureLog` and assert no line carries `refusalCause`.

### ADVISORY 2 — the missing-stored-host test covers `orders` and `orders/preview`, not `stop`

`solve_refusal_faults_test.go:176` lists two routes. The spec scenario names an order only, so
the test meets the scenario. Stop takes the same early exit by reading (`service.go:1277`), but
no test pins it. Smallest fix: add `stopPath("f1")` to the route list.

### ADVISORY 3 — the out-of-extent point target remains open, as filed

Spec-phase ADVISORY A is recorded in
`docs/handoffs/defect-point-target-extent-unvalidated.md`. This commit does not change it, and it
was out of scope. It is still unverified, and still the one remaining candidate for a 5xx from
client-controlled input on these routes.

## Spec-phase findings, status

| Finding | Status |
| --- | --- |
| MINOR 1 (deny scenario on all routes with refusal-triggering payloads) | Enforced and tested |
| MINOR 2 (broken parent chain must not be the quiet 404) | Enforced and tested |
| MINOR 3 (fixed reason text) | Enforced and tested |
| ADVISORY A (point extent) | Filed, open |
| ADVISORY B (refusals invisible in logs) | Addressed: one info-level entry per served refusal |
