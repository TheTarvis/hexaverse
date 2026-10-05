# `add-console-dock` — Phase-1 security panel report

Persisted verbatim by the orchestrator from the security reviewer's hand-back
(2026-10-04; the reviewer is read-only and did not write the file itself).
Everything below is from reading the code and deltas; no stack was booted and no
suite was run.

**Counts: BLOCKER 0, MAJOR 0, MINOR 1 (S1). Verdict: SECURITY-CLEAR. The RULING 13 shed is safe for 2b-i.**

Reviewed: `openspec/changes/add-console-dock/` (proposal, design, tasks, `specs/system-console/spec.md`) against the tree at `d777cfd`.

## 1. RULING 13 shed — premise verified, shed is safe

The analyst's premise (analysis § 6, C14/C17) holds in code and nothing in the deltas changes it.

- **What the strip is mounted against.** `frontend/components/space/SystemSpaceView.tsx:308-309` picks `acting` from `allFleets`, which is `useMyFleets()` data (`:258`, `:303`), i.e. `GET /v1/fleets?mine=true` (`frontend/lib/services/fleet-service.ts:43`). The strip's one mount site is `:1071-1086`.
- **Cost extent.** `burnCost` comes from `currentQuote` (`:793`), which is `useBurnPreview` keyed on `acting?.id` (`:788-789`), so it is an own-fleet quote.
- **Server backstop.** `backend/fleet/handler.go:709-712`: `rosterFieldsFor` returns `nil` when `!own`. `VitalsStrip.tsx:254` reads only `acting?.roster`, so a mis-wired caller would still render the absent form.
- **The deltas.** No requirement adds a strip prop or a selected-entity surface. The delta states "The strip is unchanged in both states" and "Activating the Dock Changes No Space-View Selection … SHALL NOT change the acting fleet". The proposal puts the Selected-entity tab out of scope (link 4).
- **Foreign-fleet content in the dock.** The only such content is the Log tab's rows, which are the same `SightingLog` component and fields as today (`SightingLog.tsx:77-98`). Nothing is widened.

Flag (c) is premise-false here for the same reason, and no attacker action exists.

### S1 — MINOR: the deny scenario is anchored to a piece where it will still be premise-false, and exists nowhere durable yet

- **Evidence.** RULING 13 assigns the scenario to 2b-v (`retire-right-command-column`). Analysis C14 says the premise arrives with link 4's Selected-entity tab; in every 2b piece the strip is still fed from `useMyFleets()`. `docs/plans/system-hud/chain.md` has no 2b-ii to 2b-v sections yet (`own-ness` appears only at `:917` and `:952`, both in the Link 2b section). The carry is unchecked task 6.9.
- **Risk.** 2b-v's panel can shed it again on the same grounds, and it never reaches the change that first passes a non-own fleet to the strip. That change would then rely on the caller's discipline plus the server's `nil` roster, with no assertion.
- **Smallest fix (no delta in 2b-i).** In task 6.9 and the chain doc, re-anchor the obligation to a trigger: "the first change that supplies `VitalsStrip` (or any dock tab that renders roster-derived figures) a fleet not drawn from the own-fleets read". Name link 4 as the expected owner, and record this text now:

```
#### Scenario: A fleet the requester does not own renders no owner-only figure on the strip
- **GIVEN** the strip is supplied a fleet whose served read carries no owner-only roster fields
- **WHEN** the strip renders, with and without a current burn quote supplied
- **THEN** the hold and fuel cells render the absent form with no gauge segments
- **AND** no cost extent and no extent state attribute is rendered
```

The analyst's note that this is "one cheap strip-level arrangement group" is right: the component already behaves this way, so it could be pinned today as a `VitalsStrip.test.tsx` case, outside this change's task budget if needed.

## 2. The always-mounted log and the settle re-read — no new surface

- **What and for whom: unchanged.** The request is the same `GET /v1/sightings` with no `systemId` (`frontend/hooks/use-sightings.ts:27-37`, `SightingLog.tsx:117`). The corporation comes from the token (`backend/sightings/handler.go:49`); the client supplies no corp id. The live `sighting-records` scenario "A corporation cannot read another corporation's pile" covers the deny path.
- **Bounded.** `backend/sightings/service.go:29-31` clamps the page to `PageMax`.
- **When: one extra authenticated GET per view open.** design.md Risks says this. React Query's 60 s `staleTime` (`frontend/lib/query-client.ts:78`) will often serve it from cache on navigation.
- **Mount-ordering gate kept.** The delta says "The view SHALL NOT mount the log's content while the interior read's first load is in flight", with a scenario for both dock states and task 3.3's log-specific arm. This is a freshness rule (reading before a past-ETA sweep mints), not an authorization rule; breaking it would show a stale own pile, not foreign data.
- **Cursor drift (`drift-sighting-cursor-leaks-targetid.md`).** Fixed at source in link 8b. This change does not touch cursor handling, and the client still round-trips `nextCursor` verbatim. No longer-lived exposure results: the cursor already sits in the query cache for `gcTime` today.
- **Settle re-read (RULING 9), request rate.** An infinite-query refetch re-requests every loaded page, so one settle costs P requests, where P is the pages the player has loaded with Load more.
  - Triggers are one `ScanSweepWatcher` per own fleet in the system (`SystemSpaceView.tsx:822-833`) plus the early-settle exit (`:419-431`).
  - Each settle needs a server-accepted scan on a single-slot sensor channel with a world-time ETA, so the rate is bounded by gameplay.
  - The existing Refresh button already issues the same P requests at click rate, so there is no new amplification primitive.
- **Implementation note for nextjs-dev (task 5.4), not a finding.** Target `queryKeys.sightings.pile(null)` exactly. Invalidating `queryKeys.sightings.all` would also refetch the ghost feed that the same settle path already refetches.

## 3. Hidden content — same data as today

The hidden Log panel holds exactly what the open floating panel holds now: the requester's own pile rows (system, `asOf`, `hostId`, hull count and types, opaque digest `id`). The live requirement *A Log Row Names No Owner* is unchanged. The player is entitled to all of it when shown. Nothing foreign, no token and no unserved field enters the DOM; `hidden` here is presentation, not access control.

Cross-user residue is handled already: `frontend/hooks/use-auth.ts:130` and `:185` call `queryClient.clear()` on sign-out, and the view unmounts with the session.

## 4. Persisted client state — none

The delta requires "SHALL NOT be remembered across a reload or across navigation", with a scenario for each. design.md D-4 keeps `expanded` as view state with no storage or URL. D-3's CSS custom property is runtime layout state and carries no data.

## Checklist items with no surface

- No new endpoint, server action, input field, free-text sink, secret, `NEXT_PUBLIC_*` value or dependency.
- Tab labels are static (`Log`, no count), so no served string is rendered into new chrome.

## One non-security observation for the panel

The scenario "The log's first read is issued without the dock being expanded" will not issue a request when the `pile(null)` cache entry is under 60 s old, for example after navigating from another system's view. That behaviour exists today for open-the-log; it may be worth the QA or architect reviewer's attention for the scenario's GIVEN.

## Findings by severity

- BLOCKER: none
- MAJOR: none
- MINOR: S1 (re-anchor and record the own-ness deny scenario; no 2b-i delta needed)

**Verdict: SECURITY-CLEAR**
