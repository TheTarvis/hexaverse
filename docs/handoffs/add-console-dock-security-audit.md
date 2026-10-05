# `add-console-dock` — Phase-2 security audit (implementation, step 10)

Persisted verbatim by the orchestrator from the security engineer's hand-back,
2026-10-05 (the auditor is read-only and wrote no file).

**Counts: BLOCKER 0, MAJOR 0, MINOR 0. Verdict: SECURITY-CLEAR.**

Audited the build at `e5e9eff` against its authored base `b52d412`, by reading the diff and the listed tests. I booted no stack and ran no test suite; the only command with a live result is `npm audit --omit=dev`.

S1 from the spec-phase report (RULING 20) is still an open carry, not a finding against this build; see the last section.

## 1. The strip is still mounted only against the acting own fleet — holds

- **Strip props unchanged.** The `<VitalsStrip …>` element at `frontend/components/space/SystemSpaceView.tsx:1086-1100` is textually identical to `b52d412` — same eleven props, same conditional `burnCost` spread. Only its wrapper changed: it is now passed as `ConsoleDock`'s `strip` prop instead of sitting in a `<div>`.
- **Source of the fleet unchanged.** `acting` (`:318`) is still picked from `allFleets` (`:313`), which is `useMyFleets()` data (`:260`). No hunk touches those lines.
- **The dock adds no data path.** `frontend/components/space/ConsoleDock.tsx:100-159` renders `{strip}` and `{tab.content}` as given. It takes no fleet, id or served string; its only text is the static `Console`, `Log`, `Collapse console` and the waiting sentence.
- **Foreign-fleet content not widened.** The only such content is the Log tab's rows, from the same `SightingLog` with the same six props as the deleted floating panel (`:813-820` against old `:912-919`). The `SightingLog.tsx` diff is one `className` line (`:156`).

## 2. The sighting read: same audience, same parameters, no earlier, no more often — holds

- **Mount-on-show gate.** `SystemSpaceView.tsx:811`: `logTabContent = !dock.expanded ? null : interior.isLoading ? <ConsolePanelWaiting /> : <SightingLog … />`. This is the old predicate `logOpen && !interior.isLoading` with `dock.expanded` in place of `logOpen`. `ConsoleDock` hides its region with `hidden` but is handed `null` while collapsed, so nothing is mounted hidden.
- **Collapsed on every mount.** `useState({ expanded: false, openSeq: 0 })` at `:300`, as `logOpen` was `false`. Nothing auto-expands: the two expand paths are the Console control and the scan report's link (`onOpenLog={openLog}`, `:1008`), which replaces the old `setLogOpen(true)`.
- **Only one caller of the corp-wide read.** `useSightings(null)` is called only at `SightingLog.tsx:117`. The view's own call at `:227` is the pre-existing system-filtered ghost feed, untouched.
- **Same request.** `frontend/hooks/use-sightings.ts`, `frontend/lib/query-keys.ts` and the sightings service are not in the diff. The corporation still comes from the token; the client supplies none.
- **No new invalidation or refetch.** No added line in the six production files matches `invalidate`, `refetch`, `queryKeys`, `useQuery`, `useSightings`, `fetch(` or `apiClient`. The settle re-read is absent, as RULING 15 requires.
- **Frequency.** Collapse unmounts the log and expand remounts it, which is what the old toggle did. React Query's stale-time rule on remount is unchanged.
- **RULING 15 exclusions confirmed absent.** No always-mounted log, no read at view open, no settle re-read, no mount latch, no Escape handler.
- **Deny-path tests exist.** `frontend/components/space/SystemSpaceView.console-dock.test.tsx:531-546` asserts zero `useSightings(null)` calls and no `sighting-log` element while the interior is loading, both collapsed and expanded. `:548-574` covers the gate opening on answer and on failure. `:413-426` asserts the log is not shown while collapsed.

## 3. Nothing persisted client-side; the CSS property carries no data and is removed — holds

- **No storage, URL or cookie write.** No added production line matches `localStorage`, `sessionStorage`, `cookie`, `indexedDB`, `searchParams`, `router.`, `history.`, `location` or `postMessage`. Dock state is a single `useState` in the view.
- **Property value is a constant.** `ConsoleDock.tsx:63-71` sets `--console-dock-height` on `document.documentElement` to one of two literals from `frontend/lib/console-dock-layout.ts:7-8` (`3.5rem` or `13.75rem`). Its only input is the `expanded` boolean.
- **Removed on unmount.** The `useLayoutEffect` cleanup calls `removeProperty`. Asserted at `SystemSpaceView.console-dock.test.tsx:596-597` (unmount gives `''`) and `frontend/components/floating-nav.dock.test.tsx:66-70` (absent on the galaxy route).
- **Lane classes are static literals** (`console-dock-layout.ts:11-15`), with no interpolation of runtime values.

## 4. No new endpoint, input sink, `dangerouslySetInnerHTML`, dependency or `NEXT_PUBLIC_*` — holds

- No added production line matches `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, `NEXT_PUBLIC`, `process.env` or `console.`.
- The diff adds no `<input>`, form, route handler or server action; it adds three buttons with static labels.
- `frontend/package.json`, `frontend/package-lock.json` and the root `package.json` are unchanged between `b52d412` and `e5e9eff`.
- `npm audit --omit=dev` reports 5 advisories (4 high: `firebase`, `@firebase/firestore`, `@firebase/firestore-compat`, `@grpc/grpc-js`; 1 low: `dompurify`). The lockfile is untouched by this change, so they are not attributable to it. I did not run `govulncheck`, since there is no backend change.

## 5. Diff scope and the U2 hunks — holds

- **Scope.** `git diff --name-status b52d412 e5e9eff` outside `docs/` and `openspec/` lists exactly the six production files and six test files the proposal's Impact names. There is no backend, infra, config or env file.
- **U2 byte-identical.** `diff` of `SystemSpaceView.tsx` between the two commits gives 13 hunks at old lines 51a, 56a, 281, 295, 795a, 893-896, 908-920, 928-932, 990, 996-1004, 1065-1070 and 1086. None touches U2:
  - The import at `:51` hashes identically in both commits; the two new imports are inserted after it at `:52` and `:58`.
  - The sweep-watcher timer block is identical; it now sits at `:190-196` (old `:188-194`), shifted by the two import lines.
  - The arrival-refetch timer block is identical; it now sits at `:600-603` (old `:590-593`).
  - The surrounding regions (old `:100-215` and `:530-620`) hash identically to their shifted counterparts.

## Notes for the orchestrator (not findings)

- **N1.** The impl contract's § 8.2 list of the developer's edit ranges omits the hunk at old `:795` (new `:806-822`), the `logTabContent` block. The block is contract-specified elsewhere (contract lines 168 and 177) and is the gate verified in section 2; only the range list is incomplete. That hunk also adds a stray second blank line at `:806`.
- **N2.** The working tree has uncommitted edits beyond `e5e9eff`: five e2e files, `tasks.md`, and the new `frontend/e2e/tests/console-dock-journey.spec.ts`. They are test and task files only, and I did not review their content. `frontend/e2e/helpers/scan-fixtures.ts` is not named in the proposal's Impact, though it is the log-opening helper the commit message says was migrated.
- **N3.** `openDockOn` ignores its tab argument (`SystemSpaceView.tsx:301`), which is correct with one tab. The piece that adds a second tab (2b-ii) must not let a served or URL value choose the tab without a closed-set check.

## S1 carry status (RULING 20)

The own-ness deny scenario is still unpinned, and I found no mention of it in `docs/plans/system-hud/chain.md` (grep for "does not own" and "own-fleets read"). Task 5.9, which writes the carry sections for link 4, is unchecked, so this is expected at step 10. I read only the first part of 5.9's text and did not confirm that it names the RULING 20 scenario. Before archive, confirm the chain doc's link 4 carry records the trigger and scenario text from RULING 20. Nothing in this build makes the premise true: the strip is fed only from `useMyFleets()`.

## Findings by severity

- BLOCKER: none
- MAJOR: none
- MINOR: none

**Verdict: SECURITY-CLEAR.**

## Orchestrator note

On the S1 carry: the chain doc at `987db9a` does carry the trigger, in the Link 2b-v
section ("the first change that supplies `VitalsStrip`, or any dock tab
rendering roster-derived figures, a fleet not drawn from the own-fleets read")
and in Link 4's "Owes the own-ness deny scenario" bullet; the auditor's grep
strings differ from that wording. N3 is carried into the chain doc's 2b-ii
section at the gate's chain-doc task.
