# Red-phase coverage — `add-scan-and-sightings-surface` (link 8b)

Written at red handoff, before any developer starts. One row per `#### Scenario:`
in the five spec deltas (`action-dispatch`, `focused-scan`, `sighting-log`,
`sighting-records`, `system-space-view`). Status column: `assertion-red` (compiles
today, fails on a genuine assertion against real behaviour), `compile-red` (fails
to build/resolve because a pinned symbol/module does not exist yet — verified
in a scratch copy per task 1.14 where noted), `already-green` (verified passing
today; not a red-phase failure), `written-unexecuted` (Playwright leg written
against the pinned contract; cannot run to a real pass/fail without the UI it
exercises — confirmed to at least parse/list via `playwright test --list`), or
`reasoned-not-automated` (no test written; reason given).

Commands to reproduce each group are listed under "Suite commands" at the end.

## action-dispatch

| Requirement | Scenario | Test | Level | Status |
|---|---|---|---|---|
| Exactly-Once Resolution | Resolving an already-resolved action is a no-op | *pre-existing* `action/integration_test.go` (existing suite; unaffected by this change's delta) | Go integration | already-green (pre-existing, not re-tested) |
| Exactly-Once Resolution | A resolver runs at the action's frozen ETA, not real time | *pre-existing* `action/integration_test.go:TestResolveDue_ETAOrderMatchesOnTime` | Go integration | already-green (pre-existing) |
| Exactly-Once Resolution | A mutating delta is exactly-once by action id | *pre-existing* `action/integration_test.go:TestResolveDue_ConcurrentProducesOneDelta` | Go integration | already-green (pre-existing) |
| Exactly-Once Resolution | A resolver failure does not corrupt the action | *pre-existing* action package suite | Go unit/integration | already-green (pre-existing) |
| Exactly-Once Resolution | A resolver's reason code is persisted on the action and served | `backend/action_settled_inbox_and_reasoncode_e2e_test.go::TestActionReasonCode_Scenario_ScanFizzlePersistedAndServed` | Go e2e | **already-green** — confirmed by direct run against the real stack; `action.DaoImpl.ResolveOne` already persists `reasonCode` (landed by `add-stationkeep-hold-verb`, concurrent with this change). Assertion reads back from the store AND `GET /v1/actions/:id`, never the resolver's return value. |
| Exactly-Once Resolution | A resolver that sets no reason code resolves normally | *pre-existing* burn/jump resolver tests (`fleet/resolver_test.go`, `fleet/jump_resolver_test.go`) — kinematic resolvers set no reason code and already pass | Go unit | already-green (pre-existing) |
| Inbox by Actor Query Param | Missing actor query param is rejected | *pre-existing* `action/handler_test.go` | Go unit | already-green (pre-existing) |
| Inbox by Actor Query Param | An unknown action id is not found | *pre-existing* `action/handler_test.go` | Go unit | already-green (pre-existing) |
| Inbox by Actor Query Param | A settled-status read is ordered by resolve timestamp | `backend/action_settled_inbox_and_reasoncode_e2e_test.go::TestActionSettledInbox_.../"status=done unfiltered..."` | Go e2e | assertion-red (compile-red until `action.SettledPageMax` exists; verified in scratch copy — see below) |
| Inbox by Actor Query Param | A settled-status read is bounded, and its bound keeps the newest | same test, same subtest | Go e2e | assertion-red (verified: 70-action fixture serves 70, not ≤50) |
| Inbox by Actor Query Param | A running-status read is unaffected by the settled ordering | same test file, `"status=running is unaffected..."` subtest | Go e2e | **already-green** — confirmed by run (no ordering exists at all today, so a running action is trivially unaffected) |
| Inbox by Actor Query Param | A type-and-status filtered read composes both filters, ordered and bounded | same test file, `"status=done&type=scan..."` subtest | Go e2e | assertion-red (verified: `type` filter is ignored entirely today — 70, not ≤50, non-scan actions not excluded) |

Compile-red verification (task 1.14): a scratch git worktree (`git worktree add`)
had `const SettledPageMax = 50` stubbed into `action/model.go`. With that one stub,
`TestActionReasonCode_Scenario_ScanFizzlePersistedAndServed` **passed** (confirming
already-green) and `TestActionSettledInbox_Scenario_OrderedAndBoundedKeepsTheNewest`
failed on its ordering/bound subtests and passed on its running-status subtest —
exactly the shape predicted, not a broken harness. Worktree removed after
verification; no scratch artifacts remain in the tree.

## focused-scan

| Requirement | Scenario | Test | Level | Status |
|---|---|---|---|---|
| Eligible Scan Targets Are Served Per Fleet | An owner reads its own fleet's eligible targets | `scan_targets_ownership_and_eligibility_e2e_test.go::TestScanTargets_Scenario_EligibilityBoundariesAndSelfExclusion` (own-fleet-in-range assertion) | Go e2e | assertion-red (`requireRouteImplemented` fires — route unwired) |
| Eligible Scan Targets... | Another corporation's fleet id is rejected as nonexistent | `...::TestScanTargets_Scenario_OwnershipRejectionsAreIndistinguishable` | Go e2e | assertion-red |
| Eligible Scan Targets... | A corpless requester is rejected the same way | same test | Go e2e | assertion-red |
| Eligible Scan Targets... | A fleet in lane transit has an empty target set | `...::TestScanTargets_Scenario_LaneTransitYieldsEmptySet` | Go e2e | assertion-red |
| Eligible Scan Targets... | A fleet already running a sweep has an empty target set | `...::TestScanTargets_Scenario_RunningSweepYieldsEmptySet` | Go e2e | assertion-red |
| Eligible Scan Targets... | A system with nothing in reach yields an empty set, not an error | `...::TestScanTargets_Scenario_NothingInReachYieldsEmptySet` | Go e2e | assertion-red |
| A Served Scan Target Is One a Commit Would Accept | A host beyond focused-scan range is absent | `...::TestScanTargets_Scenario_EligibilityBoundariesAndSelfExclusion` | Go e2e | assertion-red |
| ...Priced at the Duration a Commit Would Freeze | A host the star occludes is absent | same test (occluded-scanner sub-case) | Go e2e | assertion-red |
| | A host at exactly the named range is served | same test | Go e2e | assertion-red |
| | A host on a sightline exactly tangent to the star is served | `disclosure/occlusion_test.go::TestOccluded_TangentSightlineIsClear` | Go unit | **already-green (closed 2026-09-03)** — pre-existing (link 5), verified via direct run (`--- PASS`): asserts a sightline exactly at the star's radius is clear, and one `math.Nextafter` step inside is occluded — exactly the boundary this scenario names, at the pure-predicate level `ScanTargets`/`Scan` both share. |
| | A served duration equals the duration a commit freezes | `...::TestScanTargets_Scenario_ServedDurationEqualsCommittedDuration` | Go e2e | assertion-red |
| | A foreign fleet in the same system is absent | `...::TestScanTargets_Scenario_EligibilityBoundariesAndSelfExclusion` | Go e2e | assertion-red |
| | The reading fleet is absent from its own target list | same test | Go e2e | assertion-red |
| | A belt is served as one host, never as its members | `scan_targets_ownership_and_eligibility_e2e_test.go::TestScanTargets_Scenario_BeltServedAsOneHostNeverAsMembers` | Go e2e | assertion-red (route unwired); **skips gracefully** if the freshly generated home system rolls no belt feature — documented in-test, not a silent gap |
| | A commit naming a belt member is rejected as unresolvable | same test | Go e2e | assertion-red / conditional skip, as above |
| | An own fleet in lane transit is absent | `...::TestScanTargets_Scenario_EligibilityBoundariesAndSelfExclusion` | Go e2e | assertion-red |
| A Fleet Is Never a Host For Its Own Sweep | A fleet sweeping itself is rejected | `...::TestScanTargets_Scenario_SelfSweepCommitRejectedIdenticallyToUnresolvable` | Go e2e | **assertion-red — confirmed GREEN-WRONG today**: self-sweep is ACCEPTED (status 200) against the live stack |
| | A self-sweep is rejected even at zero range with a clear sightline | same test (the fixture is exactly at zero range) | Go e2e | assertion-red, same finding |
| A Sweep Never Files a Claim Against Its Own Scanner | A fleet sweeping the body it is docked to files no record of itself | `scan_self_scanner_exclusion_e2e_test.go::TestScanSelfScannerExclusion_.../"scanner alone..."` | Go e2e | **assertion-red — confirmed GREEN-WRONG today**: a self-sighting is minted, 0 clean-sweep records where 1 is required |
| (task 1.15's second case, same requirement) | *(with one other ship at the same host)* | `...::TestScanSelfScannerExclusion_.../"scanner plus one other ship..."` | Go e2e | **assertion-red — confirmed GREEN-WRONG**: 2 records minted (the other ship AND the scanner) where exactly 1 is required |
| A Focused Sweep Commits On the Sensor Channel (MODIFIED) | An unresolvable host is rejected | *pre-existing* `scan_verb_e2e_test.go::TestScanE2E_Scenario_UnresolvableHostRejected` | Go e2e | already-green (pre-existing, link 5) |
| | A host outside the scanning fleet's system is rejected | *pre-existing* `...HostOutsideSystemRejected` | Go e2e | already-green (pre-existing) |
| | A foreign fleet's id is rejected identically to an unresolvable one | *pre-existing* `...ForeignFleetIdRejectedIdenticallyToUnresolvable` | Go e2e | already-green (pre-existing) |
| | A scanner in lane transit at commit is rejected | *pre-existing* `...ScannerInLaneTransitRejected` | Go e2e | already-green (pre-existing) |
| | A burning fleet can commit a sweep | *pre-existing* `...BurningFleetCanSweepAndASecondSweepIsRejected` | Go e2e | already-green (pre-existing) |
| | A second sweep is rejected while one is running | same pre-existing test | Go e2e | already-green (pre-existing) |
| | A sweep does not cancel a running burn | same pre-existing test | Go e2e | already-green (pre-existing) |
| A Sweep Resolves Into Sightings, Or Fizzles (MODIFIED) | A sweep already settled by a racing read carries its own reason code | `fleet/scan_resolver_already_settled_reasoncode_test.go::TestScanResolver_Scenario_AlreadySettledCarriesItsOwnReasonCode` | Go unit | assertion-red (confirmed: `ReasonCode` empty today) |
| | A resolving sweep mints sightings for the chain masked at its host | *pre-existing* `fleet/scan_resolver_test.go::TestScanResolver_Scenario_MintsSightingsForTheChainMaskedAtItsHost` | Go unit | already-green (pre-existing) — **note:** this pre-existing test hardcodes the OLD `{actionId}_{targetId}` doc-id format in its own assertions and WILL break when task 2.1 lands; not in tasks.md 2.5's file list — see report body |
| | A resolving sweep against an empty host mints a clean-sweep record | *pre-existing* `fleet/scan_resolver_test.go::TestScanResolver_Scenario_EmptyHostMintsACleanSweepRecord` | Go unit | already-green (pre-existing) |
| | A resolving sweep stamps its records at pulse-reach, not resolution time | *pre-existing* resolver test + this file's `sighting_pile_identity_and_filter_e2e_test.go::TestSightingSettleOnRead_Scenario_StampsPulseReachNotReadTime` | Go unit + e2e | already-green (both) |
| | A geometry failure at pulse-reach mints nothing | *pre-existing* `fleet/scan_resolver_test.go` fizzle cases | Go unit | already-green (pre-existing) |
| | A scanning fleet that left the host's system mints nothing | *pre-existing* `fleet/scan_resolver_test.go` + `scan_verb_e2e_test.go::TestScanE2E_Scenario_ScannerLeftTheSystemMintsNothing` | Go unit + e2e | already-green (pre-existing) |
| | A scanning fleet in lane transit at pulse-reach mints nothing | *pre-existing* `fleet/scan_resolver_test.go` | Go unit | already-green (pre-existing) |
| | An unresolvable body host mints nothing and releases the slot | *pre-existing* `fleet/scan_resolver_test.go` | Go unit | already-green (pre-existing) |

## sighting-records

| Requirement | Scenario | Test | Level | Status |
|---|---|---|---|---|
| A Sighting Record Is Addressable On the Wire Without Naming Its Target | A served record carries a stable id | `sighting_pile_identity_and_filter_e2e_test.go::TestSightingId_Scenario_StableAcrossReadsAndDistinctAcrossSweeps` | Go e2e | assertion-red (confirmed: no `id` field served today) |
| | Two records from one sweep are distinguishable | `sightings/document_id_digest_test.go::TestMintWrites_Scenario_PinnedDigestConstants` (rows 1 vs 2 of the pinned table) | Go unit | assertion-red |
| | A record's id names no target | `TestSightingId_Scenario_StableAcrossReadsAndDistinctAcrossSweeps` (body-substring / no-`targetId`-key assertions) + `document_id_digest_test.go::TestMintWrites_Scenario_IdContainsNoTargetIdSubstring` | Go e2e + unit | assertion-red |
| | A record's id is not a reversible encoding of its target | `document_id_digest_test.go::TestMintWrites_Scenario_NoSharedFragmentAcrossUnrelatedActions` | Go unit | assertion-red (as a *practical proxy*; true non-invertibility is a SHA-256 design guarantee no unit test independently proves — noted in-file) |
| | Two sweeps against the same target share no identifier | `document_id_digest_test.go::TestMintWrites_Scenario_PinnedDigestConstants` (rows 2 vs 3) + `TestSightingId_Scenario_StableAcrossReadsAndDistinctAcrossSweeps` (real two-sweep e2e case) | Go unit + e2e | assertion-red |
| | The continuation cursor names no target id | `TestSightingCursor_Scenario_NeverLeaksATargetIdAcrossTwoPages` | Go e2e | assertion-red (confirmed: cursor and body both leak the raw target id today) |
| The Pile Read Filters To One System On Request | A filtered read returns only the named system's records | `TestSightingSystemFilter_Scenario_FiltersToOneSystem` | Go e2e | assertion-red (confirmed: `systemId` query param is ignored today — all records returned) |
| | A filtered read is bounded and paged like any other | `TestSightingSystemFilter_Scenario_BoundedAndPagedWithinTheFilter` | Go e2e | assertion-red |
| | A filtered read for a system with no records is empty, not an error | `TestSightingSystemFilter_Scenario_FiltersToOneSystem` (never-swept-system sub-case) | Go e2e | assertion-red (currently returns the WHOLE pile, not empty) |
| | An unfiltered read is unchanged | `TestSightingSystemFilter_Scenario_FiltersToOneSystem` (unfiltered sub-case) | Go e2e | already-green (trivially — no filter code exists to have broken this path) |
| A Sighting Is Minted Only By a Resolving Sweep (MODIFIED) | Reading the pile mints nothing | *pre-existing* `router_sightings_no_auto_mint_test.go` | Go e2e | already-green (pre-existing) |
| | Sustained passive proximity mints no sighting | *pre-existing* disclosure/proximity suite | Go unit | already-green (pre-existing) |
| | A burn resolution mints no sighting | *pre-existing* `fleet/burn_and_jump_never_mint_sightings_test.go` | Go unit | already-green (pre-existing) |
| | A due sweep settled by a read mints as the sweep, not as the read | `sighting_pile_identity_and_filter_e2e_test.go::TestSightingSettleOnRead_Scenario_StampsPulseReachNotReadTime` | Go e2e | **already-green** — confirmed by direct run; the mechanism (settle-on-read stamping pulse-reach) predates this change and already behaves correctly. Kept as a permanent regression net and as the corrected-wording confirmation design.md Decision 5 calls for. |
| A Sighting Is Minted In the Resolve Transaction, Exactly Once (MODIFIED) | The identifier is stable across processes and instances | `document_id_digest_test.go::TestMintWrites_Scenario_PinnedDigestConstants` (literal pinned-value assertion is itself the cross-process proof — see file comment) | Go unit | assertion-red |
| | A sighting's document id is deterministic | same test | Go unit | assertion-red |
| | A retried resolve converges instead of duplicating | *pre-existing* `sightings/mint_test.go::TestMintWrites_Scenario_RetriedResolveConverges` | Go integration (emulator) | already-green (pre-existing; will remain meaningful post-2.1 since it round-trips through the real, then-changed, derivation) |
| | The mint is never a separate write after the transaction | *pre-existing* AST guard `fleet/scan_resolver_mints_only_via_sightings_test.go` | Go unit (structural) | already-green (pre-existing; task 2.6 asks developers to re-verify it still passes post-2.1, not to rewrite it) |
| | Two records from one sweep take two distinct paths | *pre-existing* `sightings/mint_test.go::TestMintWrites_Scenario_DistinctTargetsNeverCollide` + `document_id_digest_test.go`'s pinned table | Go unit | already-green (pre-existing) / assertion-red (new digest table) |

## sighting-log (new capability)

| Requirement | Scenario | Test | Level | Status |
|---|---|---|---|---|
| The Sighting Log Lists the Corporation's Own Pile in Served Order | Rows render in the served order | `SightingLog.test.tsx::"Rows render in the served order..."` | vitest component | compile-red (`Cannot find module './SightingLog'`) |
| | A composition row shows hulls | `SightingLog.test.tsx::"A composition row shows hull count and hull types"` | vitest component | compile-red |
| | The swept host is shown as its raw id, whatever the host is | `SightingLog.test.tsx::"host %s renders as its raw id..."` (parametrized: planet, moon, belt, gate, station, fleet) | vitest component | compile-red |
| | A clean-sweep row shows the clean-sweep marker | `SightingLog.test.tsx::"A clean-sweep row shows a clean-sweep marker..."` | vitest component | compile-red |
| A Log Row Names No Owner | A row shows composition but no identity | `SightingLog.test.tsx::"A row displays no owner, corporation, or fleet identity..."` | vitest component | compile-red |
| An Unknown System Name Falls Back to Its Id | A record in an unnamed system still renders | `SightingLog.test.tsx::"A record in an unnamed system still renders..."` | vitest component | compile-red |
| The Log Pages Through the Pile With the Server's Own Cursor | Load-more sends the served cursor verbatim | `SightingLog.test.tsx::"Load-more sends the served cursor verbatim..."` | vitest component | compile-red |
| | A further page appends rather than replaces | — | — | **reasoned-not-automated**: the component-level mock's `useSightings` return is static per render in this pass's harness, so "appended, not replaced" (which needs the mock to grow across a `fetchNextPage` call) was not wired. `fetchNextPage` invocation IS asserted (the load-more test); the append-vs-replace behaviour itself is not. Flagged as a gap for a follow-up test or for the Playwright leg to cover incidentally. |
| | An empty cursor ends the pile | `SightingLog.test.tsx::"An empty cursor ends the pile..."` | vitest component | compile-red |
| | The client never constructs a cursor | *(structural — the mock's `fetchNextPage` takes no arguments the test could corrupt)* | — | reasoned-not-automated: best checked as a **type-level** guarantee once `useSightings`'s real signature exists (it should expose no cursor-construction API at all); recommend a follow-up structural/AST-style check mirroring the backend's own "no wall clock" guards, once the hook is real. |
| The Log Reads on Mount, After a Sweep Settles, and on Explicit Refresh — Never on a Timer | The log does not poll while open | — | — | reasoned-not-automated (time-budget triage): needs fake timers against a real `useSightings` (not the static mock this pass used); recommend before green handoff. |
| | The log refetches after a sweep settles | `SystemSpaceView.scan-refetch.test.tsx::"sightings and inbox refetches are not issued until..."` (covers the trigger; does not mount the real `SightingLog`) | vitest component (adjacent) | assertion-red (partial: proves the VIEW schedules the pile refetch; does not itself mount `SightingLog` reading it) |
| | A mount during an unsettled past-ETA sweep reads the pile after the settling read | `SystemSpaceView.sighting-log-mount-ordering.test.tsx::"issues no pile read while the settling interior read is still in flight, then one once it completes"` | vitest component | **CLOSED 2026-09-03** — assertion-red (confirmed: the pile-read spy is never invoked, before or after the settling read completes — the ordering gate does not exist yet) |
| | An explicit refresh reads the pile | — | — | reasoned-not-automated (time-budget triage) |
| The Log's Empty, Loading, and Failed States Are Each Explicit | A pile read in flight shows a loading state | — | — | **reasoned-not-automated — gap.** Empty and failed states ARE covered (below); the loading state was not. Cheap follow-up: one more `it()` in `SightingLog.test.tsx` with `pile.isLoading = true`. |
| | An empty pile is stated, with the way to fill it | `SightingLog.test.tsx::"An empty pile is stated, naming the focused scan..."` | vitest component | compile-red |
| | A failed pile read is retriable and never reads as empty | `SightingLog.test.tsx::"A failed pile read is retriable and never reads as empty"` | vitest component | compile-red |
| The Log Is Reachable From the System Space View Without Leaving It | The log is opened from the space view | — | — | reasoned-not-automated: requires `SystemSpaceView` to actually mount `SightingLog` (it doesn't yet); recommend a Playwright-only assertion for now — **partially covered** by `scan-journey.spec.ts`'s `sighting-log-open` click, which IS exercised there (written-unexecuted). |
| | Opening the log keeps the view and its acting fleet | — | — | reasoned-not-automated at the unit level (same reason); **not exercised** by the Playwright journey either — flagged as a gap. |
| | Closing the log returns to the view intact | — | — | reasoned-not-automated / not exercised by Playwright — flagged as a gap. |
| A Log Row and Its Ghost Address the Same Record By Its Served Id | Selecting a row highlights its ghost | `SightingLog.test.tsx::"Selecting a row highlights its ghost..."` | vitest component | compile-red |
| | Activating a ghost highlights its loaded row | `scan-journey.spec.ts::"a seeded target-naming sighting renders as a ghost and cross-highlights..."` (ghost→row direction) | Playwright | written-unexecuted |
| | Two records with identical contents highlight independently | `space-scene.sightings.test.ts::"draws two independent marks for two records with identical contents but different ids"` | vitest unit (pure) | assertion-red |
| | Activating a ghost whose row is not loaded highlights the ghost alone | — | — | reasoned-not-automated (time-budget triage) |
| | A row with no ghost says so, whatever the reason | `SightingLog.test.tsx::"A clean-sweep row states it has no mark in the open system"` + `SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx` (all three remaining reasons: origin position, beyond the ghost layer's single page, canvas unavailable) | vitest component + vitest (SystemSpaceView-level, real wiring) | **automated (closed 2026-09-03, QA finding NO-SHIP MAJOR)** — the new test drives the real `SystemSpaceView`/`buildSceneModel`/`SightingLog` tree (not a hand-fed prop) so it observes actual wiring; confirmed red against the then-current closed-list `hasGhost`, then green once the developer landed `SystemSpaceView.tsx`'s `drawnSightingRecordIds` prop threading — a genuine regression net, not a tautology (an SDET control case in the same file proves the harness can still produce a real highlight). |

## system-space-view (new requirements this change ADDS)

| Requirement | Scenario | Test | Level | Status |
|---|---|---|---|---|
| The Focused-Scan Target List Comes From the Server | Served targets are listed with their kind and duration | `ScanControl.test.tsx::"Served targets are listed with their kind and duration"` | vitest component | compile-red (`Cannot find module './ScanControl'`) |
| | A body absent from the served set is not offered | *(structural)* `ScanControl.test.tsx::"accepts no interior or selection prop..."` | vitest component (structural) | compile-red — proxy proof (no interior data reaches the component to mirror a predicate from), not a direct "body X absent" render assertion |
| | An empty target set is stated, not shown as an empty list | `ScanControl.test.tsx::"An empty target set is stated..."` | vitest component | compile-red |
| | An empty target set explained by transit or a running sweep states that instead | `ScanControl.test.tsx::"An empty set while a sweep is already running states that..."` | vitest component | compile-red |
| | A failed target read is retriable and offers nothing | `ScanControl.test.tsx::"A failed target read is retriable and offers nothing"` | vitest component | compile-red |
| | A landed arrival refetches the target list | `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx::"F5: re-issues a REAL network scan-targets read once the acting fleet lands and attaches, with no user action"` + `scan-journey.spec.ts::"opening the scan control mid-burn shows 'no host in range'; the docked host appears with no user action once the burn lands"` (task 10.2d) | vitest component + Playwright | **REVISED 2026-09-03 (link8b-adversary-r8, ruling F5) — now already-green.** The vitest was rewritten per the adversary's own finding that a mocked-hook version "satisfies it without ever exercising the invalidation wiring... and wiring is exactly what broke": it now drives the REAL `useScanTargets`/`useRunningScan`/`useCancelAction` against a REAL `QueryClient`, mocking only `fleetService.scanTargets` at the network boundary, and asserts a genuine SECOND call count. Verified passing (not tautological — a fixture bug during authoring produced a real failure, confirming the harness is sensitive) against the now-landed production wiring. The Playwright leg (10.2d) opens the control mid-burn (unlike 10.2a, which docks first) and confirms the same behaviour end to end. **REVISED 2026-09-04 (journey-gate finding, adjudicated as a test-arrangement defect, not a product defect — see "2026-09-04 follow-up" below): rewritten to prove the empty state off the already-resolved pre-burn network response rather than off a 20-second DOM wait that raced the view's own 20s baseline poll. Confirmed green twice in direct runs (25.2s, 21.8s).** |
| | Changing the acting fleet refetches the list | `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx::"F2: an A -> B -> A re-selection issues a NEW network read for A, never A's earlier page"` | vitest component | **REVISED 2026-09-03 (link8b-adversary-r8, ruling F2) — now already-green.** The adversary showed the ORIGINAL reasoning ("a different cache entry by construction") was false — a key change serves whatever is cached under the new key, so an A->B->A toggle could re-serve A's stale page. Production now sets `staleTime: 0` and `refetchOnMount: 'always'` on `useScanTargets` (`hooks/use-scan.ts`); this test drives a real A->B->A roster re-selection against a REAL QueryClient and confirms a genuine second network call for A. Verified passing, not tautological. |
| | A failed refetch drops the stale list rather than restating it | `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx::"F1: a failed refetch shows the retriable error, never the stale 'no host is in range' claim"` | vitest component | **NEW scenario, added 2026-09-03 (link8b-adversary-r8, ruling F1 — BLOCKER).** The adversary showed the spec said nothing about a refetch that FAILS on top of an already-cached empty page, so the exact reported bug (a stale "no host is in range" claim rendered on the authority of a read the client had already invalidated) could survive the F5 fix entirely. Verified already-green: `ScanControl.tsx`'s `scanTargets.isError` branch is checked BEFORE the empty-list branch, so a failed refetch shows the retriable error, never the stale claim — confirmed via a real induced rejection against the real QueryClient, not asserted from memory of React Query's semantics. |
| A Sweep's Cost Is Presented as Time and Exposure, Not Time Alone | The control states the exposure before a commit | `ScanControl.test.tsx::"The control states the exposure before a commit"` | vitest component | compile-red |
| | The control states the exposure while a sweep runs | — | — | reasoned-not-automated (time-budget triage; the "before commit" case is covered, the "while running" case was not added separately) |
| | An attached fleet is told the sweep breaks its masking | `ScanControl.test.tsx::"An attached fleet is told the sweep breaks its masking"` | vitest component | compile-red |
| | An unattached fleet is not told about masking | `ScanControl.test.tsx::"An unattached fleet is not told about masking"` | vitest component | compile-red |
| A Focused Scan Commits Against a Listed Target and Reports Its Rejection in Player Copy | A commit sends the served host id | `ScanControl.test.tsx::"A commit sends the served host id"` | vitest component | compile-red |
| | An accepted commit shows the running sweep | *(implied by the "commit control withheld while running" test, not asserted from the commit transition itself)* | — | reasoned-not-automated: the STATE (withheld while running) is tested; the TRANSITION (commit → running, in one flow) is not. |
| | An accepted commit is never followed by the empty-set copy | `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx::"Scenario: An accepted commit is never followed by the empty-set copy"` | vitest component (real network-level `useScanTargets`/`useRunningScan`/`useScan` against a real `QueryClient`) | **BACKFILLED 2026-09-03** — written at red handoff (link8b-adversary-r10, ruling P1) but never given a coverage row; confirmed **already-green** by direct run today. Asserts `scan-commit-pending` is shown between an accepted commit and the confirming running-status read, that neither the empty-set copy nor a fresh `scan-commit-button` appear in that window, and that the countdown appears once the running-status read lands, with no user action. |
| | A failed running-status read ends the pending state rather than hanging it | `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx::"P1a: a failed running-status read after an accepted commit shows the failed-read state, never an indefinite scan-commit-pending"` | vitest component | **BACKFILLED 2026-09-03** (link8b-adversary-r10, ruling P1, first half) — written at red handoff, no coverage row until now; confirmed **already-green** by direct run: the failed-read copy ("could not be read") is shown and both `scan-commit-pending` and a fresh `scan-commit-button` are absent once the triggered running-status read rejects outright. |
| | *(no dedicated `#### Scenario:` heading — a SHALL clause inside this requirement's own prose, spec.md:216-217: "This presentation is a property of the window, not of one mount: it SHALL persist across a remount or a re-selection of the control while the window is open")* | `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx::"P3: the pending presentation survives an unmount/remount while the running-status refetch is still in flight"` | vitest component | **BACKFILLED 2026-09-03** (link8b-adversary-r10, ruling P3) — written at red handoff, no coverage row until now; confirmed **already-green**: remounts the SAME `QueryClient` with a fresh component tree mid-window (the still-open running-status promise held), and asserts `scan-commit-pending` survives the remount while "No host is in range to sweep." does not reappear — proving persistence is a property of the query cache, not of one component instance's local `useState`. |
| | An accepted commit is never followed by the empty-set copy *(same scenario as above — its own "AND no cancel affordance..." clause, spec.md:239-241)* | `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx::"P5: no cancel affordance is rendered in the pending window, and no cancel request is issued"` | vitest component | **BACKFILLED 2026-09-03** (link8b-adversary-r10, ruling P5) — written at red handoff, no coverage row until now; confirmed **already-green**: asserts no `scan-cancel` testid and no cancel-labelled button of any kind render inside `scan-control` during the pending window, and that no cancel request (fleet-level or otherwise) is issued, since the window carries no action id to cancel with. |
| | A target that went stale between the list and the commit reads as no longer possible | `lib/scan-copy.test.ts::isStaleTargetRejection` (the predicate, exhaustively) | vitest unit | assertion-red (predicate only; the component-level "refetches the target list in-flow" wiring is **not** tested — reasoned-not-automated for that half) |
| | An unmapped commit rejection reason renders safely | `lib/scan-copy.test.ts::"falls back to a generic, non-technical message..."` + `ScanControl.test.tsx::"A rejection never shows raw server text"` | vitest unit + component | compile-red / assertion-red |
| | No raw server text reaches the player | same two tests | vitest unit + component | compile-red / assertion-red |
| | A sweep that settles inside the commit round trip still reports *(narrower predecessor half — the hand-off only, pre-seeded settled-status mock, no observation of whether the follower reads were actually issued)* | `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx::"P1b: a running-status read showing nothing running, because the sweep already settled, hands off to the settled report rather than an indefinite scan-commit-pending"` | vitest component | **BACKFILLED 2026-09-03** (link8b-adversary-r10, ruling P1, second half) — written at red handoff, no coverage row until now; confirmed **already-green**. Kept distinct from the F11-1 row directly below: `mockListSettled` here is pre-seeded with the settled action from mount, so this test proves only the hand-off (the settled report renders, `scan-commit-pending` clears), not that the follower reads were freshly issued as a consequence of the window ending — that is exactly what the F11-1 row's sibling test adds. |
| | A sweep that settles inside the commit round trip still reports | `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx::"Scenario: A sweep that settles inside the commit round trip still reports"` | vitest component (real network-level `useScanTargets`/`useRunningScan`/`useSettledScan`/`useScan` against a real `QueryClient`, mocked `useSightings` pile refetch spy) | **NEW scenario, added 2026-09-03 (link8b-adversary-r11, finding F11-1 — BLOCKER, accepted).** Confirmed assertion-red: `settledCalls` (the settled-status inbox read's own network call count) never advances past its mount-time value once the held-open running-status read resolves to "nothing running," so `ScanSweepWatcher`'s post-settle follower reads (settled-status inbox, sighting pile, fresh scan-target read) never fire on this path — confirmed by direct run (`expected 1 to be greater than 1`). Deliberately a SIBLING of the pre-existing `P1b` test (same file, "hands off to the settled report..."), not a replacement: `P1b` pre-seeds `mockListSettled` with the settled action from mount, so it proves only the HAND-OFF; this test starts `mockListSettled` empty and can therefore observe whether the follower reads were actually ISSUED, which is exactly F11-1's own defect. **Now confirmed already-green** by direct run today — the developer has since landed `ScanSweepWatcher`'s post-settle follower reads. |
| The Scan Commit Control Guards Against Double-Submit | A double-click yields exactly one scan commit | `use-scan-double-submit.test.tsx::"a rapid double-click yields exactly one request"` | vitest hook-integration | compile-red (`Cannot find module '@/hooks/use-scan'`) |
| | Two activations in one tick submit one scan commit | `use-scan-double-submit.test.tsx::"two activations with no awaited step between them submit exactly one request"` | vitest hook-integration | compile-red — **the shape `use-refuel.test.tsx` failed to use**: no `await`/render between the two `fireEvent.click` calls |
| | The guard releases when the request settles or fails | `use-scan-double-submit.test.tsx::"releases the guard on settle..."` + `"...when the request fails..."` | vitest hook-integration | compile-red |
| A Running Sweep's Window and Cancel Come From the Action Inbox | The countdown spans the action's committed window | `ScanControl.test.tsx::"The commit control is withheld while a sweep runs"` (countdown visible) | vitest component | compile-red (partial — visibility only, not the exact span-of-window arithmetic) |
| | The window is not taken from the fleet read | *(structural: the mock hook is `useRunningScan`, not a fleet field)* | — | reasoned-not-automated as a direct assertion; structurally true by the mock's own shape |
| | Cancel names the scan action's own id | `ScanControl.test.tsx::"Cancel names the scan action's own id..."` | vitest component | compile-red |
| | A cancelled sweep returns the control to its target list | `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx::"F6: cancelling a running sweep issues a fresh network scan-targets read, offering real targets"` | vitest component | **REVISED 2026-09-03 (link8b-adversary-r8, ruling F6) — now already-green.** The adversary showed the cache entry standing at cancel time is DEFINITIONALLY empty (Decision 15: a sweep-in-progress always serves an empty target set), so simply "offering the target list again" would re-show that same empty page. Production's `useCancelAction` now invalidates `queryKeys.fleets.scanTargets(fleetId)` on success (`hooks/use-actions.ts`); this test drives a real cancel against a real QueryClient and confirms a genuine second network call whose real targets are then rendered. Verified passing, not tautological (a fixture bug during authoring — the mocked running-action list never cleared post-cancel — produced a real, diagnosable failure first). |
| | The commit control is withheld while a sweep runs | `ScanControl.test.tsx::"The commit control is withheld while a sweep runs"` | vitest component | compile-red |
| | A past-ETA sweep reads as settling, not as a negative countdown | `ScanControl.test.tsx::"A past-ETA running sweep is presented as settling"` | vitest component | compile-red |
| A Running Sweep Self-Schedules the Refetch That Settles It, Then Reads the Inbox and the Pile | Each own fleet's running sweep schedules the refetch that settles it | `SystemSpaceView.scan-refetch.test.tsx::"A non-acting fleet's running sweep still schedules a refetch..."` | vitest component (fake timers) | assertion-red (confirmed: no per-fleet scan-refetch scheduling exists today) |
| | The pile and the inbox are refetched only after the settling read completes | `SystemSpaceView.scan-refetch.test.tsx::"sightings and inbox refetches are not issued until the interior refetch's promise resolves"` | vitest component | assertion-red (confirmed) |
| | Both inbox reads are refetched, not one | same test (asserts both `runningScanRefetchCalls`/`settledScanRefetchCalls`) | vitest component | assertion-red (confirmed). **Test defect fixed 2026-09-03 (link8b-adversary-r11, orchestrator-adjudicated in the developer's favor per the TDD protocol's second cause):** the assertion previously read `runningScanRefetchCalls.includes('fleet_1') || settledScanRefetchCalls.includes('fleet_1')`, a disjunction either call alone satisfies — dropping `settledScan.refetch()` (or symmetrically `runningScan.refetch()`) from `ScanSweepWatcher` would have stayed green against task 6.7's own text ("assert both inbox reads and the scan-target read are re-issued"). Split into two independent `toBe(true)` assertions, one per inbox read. Confirmed still passing after the split (production already fires both calls on this path; the fix closes a false-negative gap in the test, not a production defect) — verified by direct run. |
| | A failed post-ETA interior refetch still lands the outcome report without user action | — | — | reasoned-not-automated (time-budget triage) |
| | The settling sweep resolves to a report without user action | *(covered end-to-end only by the Playwright journey)* | Playwright | written-unexecuted (`scan-journey.spec.ts`) |
| | A sweep that settles while the view is open lands without user action | same | Playwright | written-unexecuted |
| | A non-acting fleet's sweep still lands | `SystemSpaceView.scan-refetch.test.tsx` (the whole first describe block is keyed on the non-acting fleet) | vitest component | assertion-red |
| | No sweep refetch is scheduled when no own fleet is sweeping | `SystemSpaceView.scan-refetch.test.tsx::"No sweep-driven refetch is scheduled..."` | vitest component | already-green (today's baseline poll behaviour; a legitimate regression net, not a false comfort — see in-file note) |
| A Settled Sweep Reports Its Outcome, Including Each Fizzle Reason, in Player Copy | The reported sweep is the one with the greatest resolved-at time | `hooks/use-scan.test.ts::"reports the scan with the greatest resolvedAt, whichever order the inbox listed them in"` | vitest unit (pure) | **automated (closed 2026-09-03)** — developer-authored, reviewed and adopted into the manifest; asserts both array orderings independently, so it cannot pass by coincidentally picking array order 0. |
| | Equal resolved-at times are broken by ETA | `hooks/use-scan.test.ts::"breaks an equal resolvedAt tie by the greater eta, deterministically"` | vitest unit (pure) | **automated (closed 2026-09-03)**, same file — also asserts both orderings. |
| | A fleet's other settled actions cannot displace its scan report | `scan-and-sightings-services.test.ts::"reads GET /v1/actions?actor=&status=done&type=scan..."` (proves the TYPE-FILTERED read is what's requested) | vitest unit | assertion-red (service-layer only; the component-level "cannot be displaced" behaviour itself not separately tested) |
| | *(SDET-added regression — no dedicated `#### Scenario:` heading; the closed exception list at spec.md:21-26 governs, per the "An empty target set is stated, not shown as an empty list" scenario)* | `ScanControl.test.tsx::"SDET: a stale unacknowledged settled report does not suppress the empty-set copy for a later, unrelated empty read"` | vitest component | **assertion-red, confirmed 2026-09-03 (link8b-adversary-r11, "Post-repair defect found during the F11-1 build," orchestrator ruling 2026-09-03).** `ScanControl.tsx:239` gates the empty-set copy on `targets.length === 0 && settledScan.data` — ANY unacknowledged settled scan, not the one that just ended an early-settle window. Reached honestly: an old, never-dismissed report from an ordinary ETA-path settle (`settledScan.data` truthy) plus a later, unrelated genuinely-empty scan-target read (`scanTargets.isFetching: false`, `runningScan.data: null`, `committedPending: false` — none of the spec's three closed exceptions apply). Confirmed red for the right reason: `expected 'focused scanthe sweep filed records.d…' to contain 'no host is in range'` — the copy is absent, not some other state (every other absence-cause is ruled out in-test: no `scan-commit-pending`, no `scan-targets-rereading`, no `scan-targets-loading`, no `scan-countdown`, and `scan-report` IS present, confirming the report is indeed the stale, undismissed one). Not a spec gap; the fix is to scope the gate to the early-settle handoff transient, never to report presence in general (developer's work, not the SDET's). |
| Filed-vs-fizzled is decided by reasonCode presence, never by outcome text | `ScanControl.test.tsx::"A sweep that minted records reports filed records..."` + the fizzle-code tests | vitest component | compile-red |
| | A sweep that minted records reports and links to the log | `ScanControl.test.tsx::"A sweep that minted records reports filed records and offers the log"` | vitest component | compile-red |
| | Each served fizzle reason reads as its own statement | `lib/scan-copy.test.ts::scanFizzleCopy` (exhaustive, all six codes) + `ScanControl.test.tsx` (three-code wiring subset) | vitest unit + component | assertion-red / compile-red |
| | An unrecognized reason code degrades to a generic report | `lib/scan-copy.test.ts::"maps an unrecognized reason code to GENERIC_SWEEP_RESULT"` | vitest unit | assertion-red |
| | Dismissing a report acknowledges the action | `ScanControl.test.tsx::"Dismissing a report acknowledges the action"` | vitest component | compile-red |
| A Sighting Ghost Renders at Its Frozen Position, Never a Predicted One | A ghost renders at the record's stored position | `space-scene.sightings.test.ts::"draws a mark at the record's stored position..."` | vitest unit (pure) | assertion-red |
| | The ghost layer reads the pile filtered by system | — | — | reasoned-not-automated at this level: `buildSceneModel` itself performs no filtering by design (see the file's own "SDET-added" test proving it draws whatever it's handed) — the REQUIREMENT that the CALLER issues a systemId-filtered read is a `SystemSpaceView`/hook-wiring concern, not `buildSceneModel`'s; not separately tested at that layer this pass. |
| | A ghost does not move as world time advances | `space-scene.sightings.test.ts::"does not move the mark as world time advances"` | vitest unit (pure) | assertion-red |
| | A ghost's stored velocity is displayed, not integrated | `space-scene.sightings.test.ts::"carries the record's stored velocity on the mark, unmodified"` | vitest unit (pure) | assertion-red (mark-level; the actual DOM heading/speed readout on a `sighting-facts` surface, mirroring `contact-facts`, is **not tested** — reasoned-not-automated, `SpaceStage.tsx` wiring unwritten) |
| | A system with more records than one page draws the newest page | — | — | reasoned-not-automated (time-budget triage; `buildSceneModel` takes whatever array it's given, so "one bounded page" is a caller/hook concern not exercised here) |
| | A ghost is visually distinct from a live contact | `space-scene.sightings.test.ts::"is visually distinct..."` | vitest unit (pure) | assertion-red |
| | A clean-sweep record draws no ghost | `space-scene.sightings.test.ts::"draws no mark at all for a clean-sweep record"` | vitest unit (pure) | already-green (trivially true today — nothing is drawn for ANY reason; becomes a meaningful regression net once other sighting scenarios are implemented — noted in-file) |
| | A record for another system draws no ghost here | `space-scene.sightings.test.ts::"draws every sighting it is handed, performing no systemId filtering of its own"` — proves the INVERSE (buildSceneModel filters nothing itself, so the requirement is the CALLER's) | vitest unit (pure) | assertion-red, as a boundary/contract probe |
| A Ghost at the Origin Is Omitted From the Scene, Not Drawn Atop the Star | A target-naming record stored at the origin draws no ghost | `space-scene.sightings.test.ts::"omits a target-naming record stored at exactly the origin..."` | vitest unit (pure) | assertion-red |
| | A ghost at any other position renders normally | `space-scene.sightings.test.ts::"draws a mark at the record's stored position..."` (any non-origin position) | vitest unit (pure) | assertion-red |
| A Ghost Is Not a Member of the Space View's Selection, and a Burn Never Consumes One | Activating a ghost leaves the view's selection untouched | — | — | **reasoned-not-automated — gap.** This is `SpaceStage.tsx`/pointer-handling territory (the `data-space-affordance` mechanism, §1.9 of the contract) — no `SpaceStage` test for the sighting mark was written this pass. Flagged as the **single most likely silent defect** per the contract's own traps list (§5.10); strongly recommend this be the first `SpaceStage` addition. |
| | A highlighted ghost never supplies a burn target | — | — | reasoned-not-automated, same reason |
| | A click on a ghost does not become a point selection | `SpaceStage.sighting-ghost-selection-guard.test.tsx::"renders the ghost mark with the space-affordance attribute, and a click on it never becomes a point selection"` + SDET control test | vitest component | **CLOSED 2026-09-03** — compile/element-red (confirmed: `sighting-mark-<id>` does not exist in the DOM at all; a companion control test confirms the harness can produce a point selection at all, so the negative claim is not vacuous) |
| A Ghost Is Never Suppressed By, Merged With, or Linked To a Live Contact | A ghost and a live contact both render | `space-scene.sightings.test.ts::"is visually distinct (a distinct SceneMarkKind) from a contact..."` | vitest unit (pure) | assertion-red |
| | Proximity does not merge a ghost and a contact | *(implied by the pure function producing independent marks with no merge step; not separately fixtured at close proximity)* | — | reasoned-not-automated as a dedicated close-proximity case; structurally covered by `buildSceneModel` having no merge logic at all |
| | No same-entity indication is presented | — | — | reasoned-not-automated (time-budget triage) |
| The Scan Surface Remains Usable While the Canvas Is Unavailable | A sweep can be commanded while the canvas is unavailable | `scan-journey.spec.ts` (canvas-unavailable leg) | Playwright | written-unexecuted |
| | A running sweep stays visible and cancellable without the canvas | *(structural: `ScanControlProps` carries no canvas-availability input at all)* | — | reasoned-not-automated at unit level (structurally true by the pinned props shape — no `canvasAvailable` prop exists to gate anything on); exercised in the Playwright leg above |
| | The sighting log stays reachable without the canvas | `scan-journey.spec.ts` (canvas-unavailable leg asserts `sighting-log-open` visible) | Playwright | written-unexecuted |
| | Ghost marks are absent without error while the canvas is unavailable | — | — | reasoned-not-automated (canvas-unavailable is a `SpaceStage`-level state; no `SpaceStage` sighting test was written this pass) |
| The Sweep Surface's Reads Fail Independently, Like Every Other Read This View Issues | A failed inbox read withholds the commit control rather than re-offering it | `ScanControl.inbox-failures-and-affordances.test.tsx::"a failed RUNNING-status read shows the sweep state could not be read, offers retry, and withholds the commit control"` | vitest component | **automated (closed 2026-09-03, task 6.14)** — confirmed already-green: the failure branch is checked before the empty/target-list branch in the ternary chain, so a running-status error withholds `scan-target-select`/`scan-commit-button` entirely. |
| | A failed settled read withholds the report, not the verb | `ScanControl.inbox-failures-and-affordances.test.tsx::"a failed SETTLED-status read shows the outcome could not be read, offers retry, and LEAVES the commit control offered"` | vitest component | **automated (closed 2026-09-03)** — confirmed already-green: the settled-error branch renders independently of the commit-control ternary, so the commit control stays offered. |
| | A failed ghost pile read is not an empty system | — | — | reasoned-not-automated (time-budget triage; this is a ghost-layer/`SystemSpaceView` wiring concern, not `buildSceneModel`'s) |
| A Settled Sweep and the Scan Controls Are Reachable and Announced | A settled sweep is announced | `SystemSpaceView.scan-settle-announcement.test.tsx::"names that records were filed, in the SAME role=\"status\" live region a burn/jump/mine landing already uses"` | vitest component (real `ScanSweepWatcher`, fake timers) | **automated (closed 2026-09-03)** — confirmed already-green: drives the real per-fleet settle-watcher past a sweep's ETA under fake timers and confirms the shared `space-announcer` (`role="status"`, `aria-live="polite"`) text changes from empty to naming the outcome. |
| | The sweep can be commanded and cancelled from the keyboard alone | `ScanControl.inbox-failures-and-affordances.test.tsx` (the "every affordance is a real, focusable element" describe block: target select, commit, cancel, dismiss, and the report's open-log button) | vitest component | **automated (closed 2026-09-03)** — confirmed already-green via real `.focus()` calls against each control (native `<select>`/`<button>` elements); does not drive a full simulated Tab sequence, which remains a cheap follow-up if a future pass wants the ordering itself pinned, not just each control's own focusability. |

## Totals

- **Scenarios enumerated across the five deltas:** 157 (unchanged this round — no new scenario text landed; this round closed existing gaps)
- **Automated (assertion-red or compile-red, or a real test now confirmed passing — see the file's header note on this label):** 91 (85 + 6: *The reported sweep is the one with the greatest resolved-at time* and *Equal resolved-at times are broken by ETA* (`hooks/use-scan.test.ts`), *A failed inbox read withholds the commit control...* and *A failed settled read withholds the report, not the verb* (`ScanControl.inbox-failures-and-affordances.test.tsx`), *A settled sweep is announced* and *The sweep can be commanded and cancelled from the keyboard alone* (the same file's affordance describe block plus `SystemSpaceView.scan-settle-announcement.test.tsx`) — all six closed 2026-09-03, all confirmed already passing against the current tree, not merely written)
- **Already-green (verified passing, confirmed non-tautological — pre-existing, a mechanism that predates this change, or a fix that landed concurrently with this pass's own test-writing):** 32 (31 + 1: *A host on a sightline exactly tangent to the star is served*, closed 2026-09-03 by the pre-existing `disclosure/occlusion_test.go::TestOccluded_TangentSightlineIsClear` — link 5's own file, not part of this change's manifest, cited here only as closing the gap)
- **Written, unexecuted (Playwright legs, pinned against the contract, confirmed to parse/list; cannot pass/fail without the UI they exercise):** 6 distinct scenario-lines, plus one additional Playwright leg (task 10.2d, `scan-journey.spec.ts`'s mid-burn test) covering the ALREADY-counted *A landed arrival refetches the target list* scenario at the e2e level — not counted again, since the scenario is already tallied under already-green via its vitest coverage
- **Reasoned-not-automated (explicit reason given, no test written):** 27 (34 - 7: the tangent-boundary scenario plus the six scenarios listed under "Automated" above, all closed 2026-09-03 — QA's NO-SHIP finding on *A row with no ghost says so, whatever the reason* is tracked separately, below, since that row was already counted under "automated" via its earlier compile-red status and only its text/citation changed)

*Note on the "automated" label above:* per this file's own header, "automated" originally meant "compiles today, fails on a genuine assertion" or compile-red. Several rows closed 2026-09-03 (this entry and the "QA" entry below) are tests that, once written, were found to ALREADY PASS against the current tree — a real, non-tautological regression net rather than red-phase evidence. They are grouped under "automated" here (per the orchestrator's own instruction) rather than "already-green" to keep them visually distinct from pre-existing, inherited coverage (like the tangent-boundary row, which predates this change entirely); the row text for each states its actual pass/fail status plainly.

**QA finding closed 2026-09-03 (NO-SHIP, one MAJOR — not a totals-line item, since the row was already counted):** *A row with no ghost says so, whatever the reason* (`sighting-log`) moved from a partial compile-red (clean-sweep case only) to full coverage of all four reasons (clean sweep, origin position, beyond the ghost layer's single page, canvas unavailable) via `SystemSpaceView.sighting-log-no-ghost-reasons.test.tsx`, which drives the real `SystemSpaceView`/`buildSceneModel`/`SightingLog` tree rather than a hand-fed prop. Confirmed red against the closed-list `hasGhost` QA flagged, then green once the developer landed the real drawn-set wiring — same treatment as the "automated" rows above.

### 2026-09-03 follow-up — orchestrator-directed revisions and closures

Per the orchestrator's adjudication (the spec's document-id derivation
changed, which is the SDET's revision to make, not the Go developer's — see
the TDD protocol's two causes for a post-handoff test change):

- **Revised** (doc-id expectations only; every other assertion unchanged,
  confirmed by diff): `backend/router_sightings_read_test.go`,
  `backend/sightings/mint_test.go`, `backend/fleet/scan_resolver_test.go` —
  all three previously hardcoded the retired `{actionId}_{targetId}` scheme;
  all three now compute the expected id via an independent implementation of
  design.md Decision 1's SHA-256 digest (never by calling `MintWrites`
  itself, so the assertion is not tautological). **Cause logged:** spec
  changed (design.md Decision 1); adjudicated by the orchestrator directly,
  not disputed by a developer.
  - `router_sightings_read_test.go`: confirmed still passing (its assertions
    never referenced the doc id's literal shape — only body-substring
    presence/absence — so this was a no-observable-behavior-change accuracy
    fix, not a redness change).
  - `sightings/mint_test.go` and `fleet/scan_resolver_test.go`: **both now
    pass**, because the Go developer has already landed task 2.1 (the digest
    derivation) concurrently with this revision — confirmed by reading
    `backend/sightings/mint.go` directly. This is normal TDD progress (red
    tests going green as implementation lands), not a defect in either
    revision.
  - **Not fixed, and not mine to fix:** `sightings/dao_test.go` and
    `sightings/service_test.go` (pre-existing, not named in this task) fail
    to build against the Go developer's own in-progress `Dao.List` signature
    widening (task 2.8's `systemId` filter) — confirmed via `git stash` that
    the same build failure exists with or without this pass's edits. That is
    the Go developer's own call-site update to make.
- **New test files** (both closing follow-ups the SDET's own coverage table
  flagged as highest-priority gaps):
  `frontend/components/space/SystemSpaceView.sighting-log-mount-ordering.test.tsx`
  (task 8.8) and
  `frontend/components/space/SpaceStage.sighting-ghost-selection-guard.test.tsx`
  (task 7.6). Both confirmed red for the right reason (an honest "this
  behavior does not exist yet" — a never-invoked spy and a genuinely absent
  DOM element, respectively), and both confirmed not to regress any
  pre-existing SpaceStage/SystemSpaceView suite (99 pre-existing tests still
  pass unchanged).
- **Manifest re-recorded** at 23 files (the original 18 plus these 2 new
  plus the 3 revised) — `bash .claude/scripts/openspec-red-manifest.sh verify
  add-scan-and-sightings-surface` confirms all 23 unchanged since this
  re-recording.

The two gaps flagged as **highest priority for follow-up before this change's own
green handoff** (both explicitly named by the architect's contract and by
README's own lessons, so their absence is a known risk, not an oversight):

1. **The mount-path ordering race** (`sighting-log`'s "A mount during an
   unsettled past-ETA sweep reads the pile after the settling read", design.md
   Decision 7's "likelier form of the race"). **CLOSED 2026-09-03**:
   `SystemSpaceView.sighting-log-mount-ordering.test.tsx` — a settling
   (`isLoading: true`) interior read at mount, with an own fleet's past-ETA
   running sweep, asserts NO pile read (`useSightings` mock never invoked)
   until the interior read completes, then asserts one occurs. Confirmed red
   (the pile-read spy is never invoked at all — the ordering gate does not
   exist yet).
2. **The ghost-selection guard** (`system-space-view`'s "A Ghost Is Not a
   Member of the Space View's Selection..." — three scenarios). **PARTIALLY
   CLOSED 2026-09-03**: `SpaceStage.sighting-ghost-selection-guard.test.tsx`
   covers *A click on a ghost does not become a point selection* directly —
   confirmed red on the CLEAN, expected first signal (`sighting-mark-<id>`
   does not exist in the DOM at all yet), with the `data-space-affordance`
   and no-`onSelect`-call assertions queued to bite next once a developer
   adds the element. A companion SDET-added control test proves the harness
   can produce a point selection at all (so the negative assertion is not
   vacuous) and passes today. *Activating a ghost leaves the view's
   selection untouched* and *A highlighted ghost never supplies a burn
   target* remain reasoned-not-automated — they need a ghost HIGHLIGHT
   mechanism (separate from selection) that has no pinned shape yet.

### 2026-09-03 follow-up #2 — F11-1 post-repair defect test, and backfilled round-9/10 coverage rows

Per the orchestrator's "Post-repair defect found during the F11-1 build" ruling
(`link8b-adversary-r11.md`, final section): the developer's first F11-1
implementation gated the empty-set copy on `targets.length === 0 &&
settledScan.data` — any unacknowledged settled scan, not the early-settle
handoff it was written for. Per this change's own TDD contract, the SDET
writes the failing test for the reachable case first; the developer scopes
the gate to make it pass.

- **New red test**: `ScanControl.test.tsx::"SDET: a stale unacknowledged
  settled report does not suppress the empty-set copy for a later, unrelated
  empty read"` (row added above, under "The Focused-Scan Target List Comes
  From the Server"). Placed in `ScanControl.test.tsx` rather than
  `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx`: the defect is
  entirely inside `ScanControl`'s own render ternary (a hook-level gate on
  `settledScan.data`), so asserting directly at the component boundary —
  setting `settledScan.data`, `scanTargets.data`, `scanTargets.isFetching`,
  and `runningScan.data` on the mocked hooks — reaches the exact reachable
  state honestly without needing to fake the query-cache machinery that
  distinguishes an "ordinary ETA settle" from an "early settle," which is a
  `SystemSpaceView`/`ScanSweepWatcher` concern the defect does not touch.
  Confirmed red for the right reason (run below); confirmed the pre-existing
  F11-1 test (`"Scenario: A sweep that settles inside the commit round trip
  still reports"`) and all 20 other `ScanControl.test.tsx` tests, plus all 11
  `SystemSpaceView.scan-targets-refetch-on-arrival.test.tsx` tests, still pass
  unmodified — both suites can be green simultaneously once the developer
  scopes the gate rather than removing it.
- **Backfilled six coverage rows** that were written and passing at earlier
  red-handoff rounds but never given a table row: *An accepted commit is
  never followed by the empty-set copy* (P1 first half), *A failed
  running-status read ends the pending state rather than hanging it* (P1a),
  the remount-persistence SHALL clause (P3, no dedicated scenario heading),
  the cancel-withholding half of *An accepted commit is never followed...*
  (P5), and *A sweep that settles inside the commit round trip still
  reports*'s narrower predecessor (P1b). All six confirmed already-green by
  direct run today — see their individual rows above for what each asserts.
  The pre-existing F11-1 row's own status line is also updated to note it is
  now confirmed already-green (the developer has since landed the post-settle
  follower reads it originally found red).
- **Manifest re-recorded** to include `ScanControl.test.tsx` and this
  coverage file's own content hash (see command below) — the other
  previously-recorded files are preserved, not dropped.

Red evidence for the new test:
```
cd frontend && npx vitest run components/space/ScanControl.test.tsx
```
```
FAIL  components/space/ScanControl.test.tsx > ScanControl — the served target
list (system-space-view "The Focused-Scan Target List Comes From the
Server") > SDET: a stale unacknowledged settled report does not suppress the
empty-set copy for a later, unrelated empty read
AssertionError: system-space-view "The Focused-Scan Target List Comes From
the Server, Never From a Client Predicate": an old unacknowledged settled
report must not suppress "No host is in range" for a later, unrelated empty
target read (none of the three closed exceptions applies here): expected
'focused scanthe sweep filed records.d…' to contain 'no host is in range'
Expected: "no host is in range"
Received: "focused scanthe sweep filed records.dismiss"
  ❯ components/space/ScanControl.test.tsx:212:7
Tests  1 failed | 20 passed (21)
```

### 2026-09-04 follow-up — journey-gate red leg fixed (user-authorized extra revision round)

`scan-journey.spec.ts:332` ("opening the scan control mid-burn shows 'no host
is in range'; the docked host appears with no user action once the burn
lands") failed once at the journey gate
(`add-scan-and-sightings-surface-journey.md`) after passing twice earlier
against byte-identical production code — the signature of a test-side race,
not a regression. Diagnosis, confirmed by reading the production wiring
directly (not re-derived from scratch):

- The served scan-target list refetches only on a closed set of triggers
  (`system-space-view`'s own "Realtime Refetch Rules..."): mount, an
  attachment change, a landed burn/jump, an acting-fleet change, an SSE
  reconnect, and a 20-second baseline poll (`BOARD_POLL_MS`,
  `frontend/lib/realtime.ts`). Committing a burn is not one of them —
  `useOrder`'s `onSuccess` (`frontend/hooks/use-fleets.ts`) invalidates only
  the fleet reads, never `scanTargets`.
- The original assertion waited on the RENDERED "No host is in range" text
  with a 20-second timeout — exactly `BOARD_POLL_MS`'s own width — so on any
  run where the preceding steps had already burned through most of that
  poll's cycle, the poll's next tick could land mid-wait and silently
  replace the still-correct empty page with a fresh, already-in-range one.
  This is a race against the SUITE's own cumulative wall-clock overhead, not
  against the burn's progress, and not a product defect: the served list the
  control shows is correct at every instant it is read.

**Fix (test-only, `frontend/e2e/tests/scan-journey.spec.ts`):** the leg now
captures and asserts the FIRST scan-targets network response (fired at
`ScanControl`'s mount, right after spawn, well before the station is even
selected) as the proof the empty state genuinely existed — an
already-resolved fact, read synchronously, with no live wait involved. The
subsequent DOM check for "No host is in range" is bounded to a short 5s
timeout (a quarter of `BOARD_POLL_MS`, generous for a render flush of data
already in the query cache) rather than 20s, so it can no longer span an
entire poll cycle. The scenario's full strength is unchanged: the leg still
proves the empty state while under way and the docked host appearing with no
user action once the burn lands.

Confirmed green twice in direct runs against the local test stack
(`cd frontend && npm run e2e -- e2e/tests/scan-journey.spec.ts`): 25.2s and
21.8s for this leg, all 5 tests in the file passing both times. No other test
in the file was touched. **Cause logged per the TDD protocol's two
permitted causes: the test's own premise was provably false (a documented,
established arrangement defect — the same class as the two prior
test-dispute revisions already logged in this file), not a spec change and
not a developer dispute.**

## Suite commands

Backend:
```
cd backend && go test ./sightings/ -run TestMintWrites_Scenario_ -v
cd backend && go test ./system/ -run TestIsDerivedBeltMember -short -v   # compile-red until IsDerivedBeltMember exists
cd backend && go test ./fleet/ -run TestScanResolver_Scenario_AlreadySettledCarriesItsOwnReasonCode -short -v
cd backend && ENV=TEST go test . -run 'TestSightingId_|TestSightingCursor_|TestSightingSystemFilter_|TestSightingSettleOnRead_' -timeout 10m -count=1 -v
cd backend && ENV=TEST go test . -run 'TestScanTargets_' -timeout 10m -count=1 -v
cd backend && ENV=TEST go test . -run 'TestScanSelfScannerExclusion_' -timeout 5m -count=1 -v
cd backend && ENV=TEST go test . -run 'TestActionReasonCode_|TestActionSettledInbox_' -timeout 5m -count=1 -v   # compile-red until action.SettledPageMax exists
```
(`ENV=TEST` root-package tests need the test emulator trio up — already running
on this machine at the time of this pass; `scripts/dev/with-test-emulators.sh`
otherwise. Per policy, never `go test .` bare — always `-run` by name.)

Frontend:
```
cd frontend && npx vitest run \
  lib/scan-copy.test.ts \
  lib/query-keys.scan-and-sightings.test.ts \
  lib/services/scan-and-sightings-services.test.ts \
  hooks/use-scan-double-submit.test.tsx \
  components/space/space-scene.sightings.test.ts \
  components/space/ScanControl.test.tsx \
  components/space/SightingLog.test.tsx \
  components/space/SystemSpaceView.scan-refetch.test.tsx \
  components/space/SystemSpaceView.sighting-log-mount-ordering.test.tsx \
  components/space/SpaceStage.sighting-ghost-selection-guard.test.tsx
```

Revised pre-existing files (doc-id expectations only — verify they still
build/run alongside their own package; note `sightings/dao_test.go` and
`sightings/service_test.go` currently fail to build for an UNRELATED reason,
the Go developer's own in-progress `Dao.List` signature widening):
```
cd backend && go test ./fleet/ -run TestScanResolver_Scenario_MintsSightingsForTheChainMaskedAtItsHost -short -v
cd backend && ENV=TEST go test . -run TestRouter_Scenario_SightingPileReadIsCorpScopedAndHidesTheTargetId -timeout 3m -count=1 -v
```

Playwright (needs the local test stack; do not run alongside the backend
`ENV=TEST` e2e suite — shared emulator project):
```
cd frontend && npx playwright test e2e/tests/scan-journey.spec.ts e2e/tests/scan-lane-transit-fizzle.spec.ts
```
