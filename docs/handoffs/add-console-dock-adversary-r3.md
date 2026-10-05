# add-console-dock — adversary round 3 (diff spot-check, final round)

Persisted verbatim by the orchestrator from the adversary's hand-back, 2026-10-05
(the adversary is read-only and wrote no file). Input diff:
`add-console-dock-r2-to-r3.diff`. The orchestrator's rulings and the verdict
commit follow the report.

**Verdict: CLEAR — 0 BLOCKER, 0 MAJOR, 3 residue MINOR.** All seven round-2 findings are FIXED as ruled. The three MINORs are wording residue for ruling forward; none permits a wrong build or fails a right one.

Nothing was run (no vitest, no Playwright, no `openspec validate`, no reconcile). Everything is from reading the four change files, the r2 report and rulings, the r2-to-r3 diff, the rulings index and the cited frontend code. Paths are relative to `/Users/travis/Projects/hexaverse/`. "delta" = `openspec/changes/add-console-dock/specs/system-console/spec.md`; "tasks", "design", "proposal" are its siblings. Line numbers are the files' as they stand now.

Counts confirmed by grep: 40 unchecked boxes, 49 scenarios, 6 requirement headings (5 ADDED + 1 MODIFIED). The diff adds and removes no box and no scenario; one scenario is retitled.

## Round-2 findings, verified

| Id | Status | Current text that shows it |
| --- | --- | --- |
| r2-M1 | FIXED | tasks:57 (5.2): "the visible area of each surface lies wholly inside the viewport and overlaps neither the dock, the strip nor any other of them, for all four of the command column, the sightings-unavailable card, the camera cluster and `FloatingNav` in both states, plus the "Console" control while collapsed; the card is induced by failing the system-filtered sightings read only (a route predicate on the system id, not `**/v1/sightings**`), and its Retry is hit-tested". Both ruled phrases are present; containment is restored and the card is no longer optional. |
| r2-m1 | FIXED (see r3-m1) | tasks:3: "every dimension, overlap claim is held at tier 4 by 5.2". "and click-through" is gone. |
| r2-m2 | FIXED | delta:127: "Scenario: Each dock control is reachable by Tab and the Console and collapse controls are activatable from the keyboard". tasks:8 (1.4) cites the same title verbatim. The old title appears nowhere in the four files. |
| r2-m3 | FIXED | delta:179: "meets this by its visible area lying wholly inside the viewport and clear of the strip, the expanded dock and the others". |
| r2-m4 | FIXED (all five) | design:139 "(task 5.8)"; proposal:60 lists "`frontend/lib/console-dock-layout.test.ts` and `frontend/components/floating-nav.dock.test.tsx`"; proposal:62 "RULINGs 1-21"; tasks:11 "plus 2.12 in `frontend/lib/console-dock-layout.test.ts` and 2.14-2.15 in `frontend/components/floating-nav.dock.test.tsx`" and tasks:29 (2.15) "in the same new `floating-nav.dock.test.tsx`"; design:187 "(the camera cluster by source text, RULING 21)". |
| r2-m5 | FIXED | tasks:26 (2.12): "with `N` = `1rem` (left and centre lane), `2.75rem` (camera lane) and `5.25rem` (column lane)" and "the cluster element's `className` uses the camera lane's constant (asserted on the `className` expression in the source text with comments stripped, so a mention of the constant in a comment cannot satisfy it)". The three values and lane names match design:61-63. |
| r2-m6 | FIXED | tasks:57: "returning from it to the system space view by a client-side navigation (the roster-row drill-in as in `world-time-render-loop-journey.spec.ts:175-187`, or the inspector's `enter-system-button`; not `page.goto`) shows the dock collapsed". |

The orchestrator's own line (design:3, "RULINGs 1-21") agrees with proposal:62 and the 21-ruling index. No "RULINGs 1-20" remains in the four files.

## The two attacks you named

**Task 5.2's repaired overlap leg is arrangeable and does not disturb the log legs.**
- `frontend/lib/services/sighting-service.ts:21-27` builds `/v1/sightings?systemId=…&cursor=…&limit=…` and sets `systemId` only when it is given.
- The ghost feed is `useSightings(systemId)` (`frontend/components/space/SystemSpaceView.tsx:225`); the log is `useSightings(null)` (`frontend/components/space/SightingLog.tsx:117`). So the log's request never carries a `systemId` parameter, and a predicate on `searchParams.get('systemId')` fails the ghost read alone.
- The card renders on `ghostFeed.isError` (`SystemSpaceView.tsx:890`), which is that query's `isError` (`:229`) and nothing else.
- The two reads are separate cache entries (`frontend/hooks/use-sightings.ts`, `queryKeys.sightings.pile(systemId ?? null)`), so the failed ghost read cannot poison the log's pile.
- The journey's log legs (first row in the panel, the report link, the three-record scroll leg) use only the unfiltered read. The intercept survives the scroll leg's reload. The settle path calls the ghost feed's refetch (`SystemSpaceView.tsx:423-431`); it fails again and the card stays, which is what the both-states leg needs.
- The existing precedent (`frontend/e2e/tests/vitals-strip-journey.spec.ts:458`) uses the broad `**/v1/sightings**` pattern; 5.2 correctly forbids it here.

**Task 2.12's source-text assertion is checkable as worded.**
- Today the cluster's class is a plain string attribute at `frontend/components/space/SpaceStage.tsx:716`, in the opening tag that carries `data-testid="space-camera-controls"` (`:712`). That testid is a unique anchor for "the cluster element".
- After the build the attribute must become an expression naming the imported constant; a test that takes that opening tag, strips comments and looks for the identifier is expressible.
- The only `bottom-[4.5rem]` in `SpaceStage.tsx` is that line, so the no-literal half is clean for this file.
- The comment-only build that round 2 worried about now fails. A build that routes the class through a local variable would fail a strict reading, but the SDET writes the test first and the developer builds to it, so that is not a right-build-fails case.

## Other changed lines, checked and clean

- **Retitle.** Title, THEN/AND (delta:128-130) and SHALL (delta:125) now agree: all three controls reachable by Tab, only "Console" and collapse activatable.
- **delta:179 against the scenarios.** "clear of the strip, the expanded dock and the others" is no stronger and no weaker than delta:210 and :214; no new claim.
- **2.12's offsets against 3.4 and D-3.** 56+16 = 72, 56+44 = 100, 56+84 = 140 px collapsed; 3.4's "column now 564 px tall and the cluster at 100 px" still holds (720−16−140 = 564). My arithmetic, not a measurement.
- **Return-leg navigation.** The cited precedent (`world-time-render-loop-journey.spec.ts:175-187`) clicks a roster row, then `enter-system-button`, then waits for `**/systems/<id>`. `enter-system-button` exists at `frontend/components/galaxy/GalaxyView.tsx:712`.
- **Tier claims.** No changed line asks jsdom for a dimension, an overlap or a resolved `calc()`. 2.12 reads source text, and 2.15 reads an inline style property and a class.
- **Cross-references.** The only task reference in design or proposal is design:139's "task 5.8", which resolves. tasks:11's file list agrees with 2.12, 2.14 and 2.15 and with proposal:60.

## Residue MINOR (rule forward; no edit needed before build)

- **r3-m1 — grammar left by the r2-m1 edit.** tasks:3: "every dimension, overlap claim is held at tier 4 by 5.2". Deleting "and click-through" left a dangling comma; it should read "every dimension and overlap claim" (as design:203 does). The meaning is unambiguous.

- **r3-m2 — 2.12's comment-stripping covers only one of its two source-text assertions.** tasks:26 says "comments stripped" for the `className` assertion only; "no `bottom-[4.5rem]` literal remains in … `floating-nav.tsx`" does not say. `frontend/components/floating-nav.tsx:11` is a comment containing `bottom-[4.5rem]`. On raw text the developer must also rewrite that comment (it goes stale anyway); on stripped text the comment may stay. Either reading yields a correct build, so the SDET picks one when writing 2.12 and says which.

- **r3-m3 — 5.2's two return routes are one route.** tasks:57 offers "the roster-row drill-in as in `world-time-render-loop-journey.spec.ts:175-187`, or the inspector's `enter-system-button`". In that precedent the row click only selects the system and the `enter-system-button` click is the navigation, so these are two steps of one path, not alternatives. It is harmless: both are client-side and `page.goto` is excluded.

## Counts

- Round-2 findings: 7 of 7 FIXED (1 MAJOR, 6 MINOR).
- New this round: 0 BLOCKER, 0 MAJOR, 3 MINOR (r3-m1 to r3-m3).
- Tasks 40, scenarios 49, requirements 5 ADDED + 1 MODIFIED.

**Verdict: CLEAR.** No BLOCKER or MAJOR remains; the change is implementation-ready with the three MINORs ruled forward.

---

## Orchestrator rulings (binding), 2026-10-05

Round cap reached (3 of 3) with a CLEAR verdict. The three residue MINORs are
carried UNEDITED — an edit after the verdict would expire it
(`add-console-dock-rulings.md` FULL-AUTO RULING 22):

| Finding | Ruling |
| --- | --- |
| r3-m1 | Carried unedited; grammar only, meaning unambiguous. |
| r3-m2 | Carried unedited; settled in the impl contract: the no-literal assertion in 2.12 reads RAW source text, so the developer also rewrites the stale comment at `floating-nav.tsx:11`. |
| r3-m3 | Carried unedited; settled in the impl contract: the return leg is the one route (roster-row select, then `enter-system-button`). |

STATUS: COMPLETE
