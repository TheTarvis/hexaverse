# Security audit: `clear-burn-preview-on-commit` (implementation phase)

*Written by the security reviewer, 2026-10-04, against the build at `62c8f15`
(`git diff 987ba60 62c8f15 -- frontend backend`). Read-only audit. Run: the two
changed test files (127 tests, all passing) and `npm audit --omit=dev`. Not
run: the full gate, tier 3, tier 4, `govulncheck` (no Go file changed).*

**Verdict: SECURITY-CLEAR.** No BLOCKER, no MAJOR, no MINOR. The build matches
each vector of the spec-phase report
(`docs/handoffs/clear-burn-preview-on-commit-panel-security.md`).

Paths below are relative to the project root.

## Scope of the diff

- Backend half: empty (0 lines).
- Frontend half: four files, two production
  (`frontend/components/space/SpaceCommandPanel.tsx`, +29 lines changed;
  `frontend/components/space/SystemSpaceView.tsx`, +58 lines changed) and two
  test files.
- No `package.json`, lockfile, `go.mod`, hook, service, type, or route file
  changed.

## Vectors

**1. Client-side unavailability is presentation only. Confirmed.**
- The spec carries the accepted S1 clause
  (`openspec/changes/clear-burn-preview-on-commit/specs/system-space-view/spec.md:119`).
- The code adds one boolean to a `disabled` attribute and to `burnAvailable`
  (`SpaceCommandPanel.tsx:151`, `:365`). Nothing on the server reads it.
- Server enforcement is untouched: ownership at `backend/fleet/handler.go:198`,
  affordability at `backend/fleet/service.go:797`.
- A reload or remount drops the state and offers an enabled Burn over a running
  order; view test 3.18 pins this.
- `commitBurn` has no `selectionCommitted` guard of its own beyond the disabled
  control. That is correct for a presentation rule: bypassing it sends a
  re-target of the player's own fleet, which the server already accepts from
  any other tab.

**2. The per-fleet record stays in component state, keyed by the click-time
fleet, never persisted or rendered. Confirmed.**
- Storage is `useState` only (`SystemSpaceView.tsx:278`). The added lines
  contain no `localStorage`, `sessionStorage`, URL, router, effect or timer
  write.
- Key: `commit.fleetId`, which is `fleet.id` from the click-time closure
  (`SpaceCommandPanel.tsx:184`). The selection key is captured before
  `order.mutate` (`SpaceCommandPanel.tsx:158`), not read at response.
- Lookup: `committedOrders[acting.id]` (`SystemSpaceView.tsx:773`), and the
  acting fleet comes only from the own-fleets read.
- The record's fields are used for equality and boolean tests only
  (`SystemSpaceView.tsx:774-786`). None reaches JSX; the panel receives two
  booleans.
- Records are no longer deleted on an unwarned commit. Growth is bounded by the
  number of own fleets (one entry per fleet id, overwritten per commit).

**3. No served value becomes raw text. Confirmed.**
- The statement is a module constant (`SpaceCommandPanel.tsx:64-65`) rendered
  as a React text child (`:350-358`). No interpolation, no
  `dangerouslySetInnerHTML`.
- The stored `selectionKey` is derived client-side
  (`frontend/components/space/space-selection.ts:70`) and never rendered.

**4. Fuel cap behaviour is unchanged in code. Confirmed.**
- The cap line is untouched: `maxFuelTons` is sent only when a current quote
  exists (`SpaceCommandPanel.tsx:148`, `:163`).
- While the committed state holds, no commit is sent (control disabled).
- A commit goes out with no `maxFuelTons` in the same three cases as before:
  first preview pending or failed; newest refresh failed (stale); the resume
  window after a withheld state ends.
- The one difference from before, as predicted at spec phase: the committed
  state is a new way into the resume window. After a cut drive or stop on the
  kept selection, a Burn pressed before the fresh preview answers is uncapped,
  where before it carried a cap from the pre-cut quote.
- No pre-commit quote can become a cap in that window:
  `frontend/hooks/use-burn-preview.ts:83-88` removes the cached query on
  disable, and `:90` returns null while disabled. That file is unedited.
- The uncapped-burn label is shown in that window and the missing cap is
  asserted (`SystemSpaceView.stranding-notice.test.tsx:1245`, `:1250`).
- The server's affordability check does not depend on the cap, so this stays a
  player-consent matter, not a security one.

**5. No new request, endpoint, storage or log line. Confirmed.**
- The added production lines contain no `fetch`, `apiClient`, service call,
  `console.*`, logger or `NEXT_PUBLIC_*` reference.
- `previewWanted` gains `!selectionCommitted` (`SystemSpaceView.tsx:787`), so
  the change sends fewer preview requests, plus one at each state end.

## Deny-path tests present

- Rejected or failed commit enters no committed state: view test 3.15.
- Rejected commit leaves an earlier record alone: view test 3.16.
- Response landing after the fleet or selection changed attributes to the
  click-time fleet and selection: panel test 2.2, view tests 3.13 and 3.14.
- Remount holds no record: view test 3.18.

## Dependency hygiene (not caused by this change)

`npm audit --omit=dev` in `frontend/` reports 5 advisories (1 low, 4 high).
No manifest or lockfile changed in this diff, so they predate it. Reported,
not triaged here.

## Findings by severity

- BLOCKER: none
- MAJOR: none
- MINOR: none

**Verdict: SECURITY-CLEAR**
