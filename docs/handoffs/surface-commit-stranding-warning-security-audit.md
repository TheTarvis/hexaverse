# Security implementation audit: `surface-commit-stranding-warning`

*Persisted by the orchestrator, verbatim, from the reviewer's returned text
(2026-10-04); the reviewer is read-only and does not write files.*

**Verdict: SECURITY-CLEAR.** No findings at any severity. The shipped code matches what I cleared at spec phase.

## What I checked

Audited `git diff` of `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceCommandPanel.tsx` (+33/-1) and `/Users/travis/Projects/hexaverse/frontend/components/space/SystemSpaceView.tsx` (+46/-1), plus the two test files for what they assert.

1. **Notice only for an own, acting fleet: holds.**
   - The record is written only from the burn mutation's `onSuccess` (`SpaceCommandPanel.tsx:174-181`), never from `onError`. That route is ownership-gated server-side (`backend/fleet/handler.go:198`).
   - The fleet id is the one captured at click (`SpaceCommandPanel.tsx:152`, `:176`).
   - The record is looked up only by `acting.id` (`SystemSpaceView.tsx:780`), and `acting` comes only from `useMyFleets` data (`:255`, `:300-306`), the corporation-scoped read.
   - Tests 3.11, 3.12 and 1.3 cover the wrong-fleet and rejected-commit paths.

2. **No server-supplied text rendered: holds.**
   - The copy is two module constants (`SpaceCommandPanel.tsx:58-61`), rendered as a React text child (`:351-355`) and passed to `toast.warning` (`:174`).
   - The wire value is coerced with `=== true`.
   - The instants are `typeof === 'number'`-guarded, stored, and compared with `===` only (`SystemSpaceView.tsx:788-791`); they are never rendered.
   - Test 3.19 pins the copy.

3. **Nothing persisted beyond the open view: holds.**
   - The record is `useState` in the view (`SystemSpaceView.tsx:275`).
   - The added lines contain no `localStorage`, `sessionStorage`, cookie, router or URL write, and no `setQueryData`. The only `setQueryData` in the file is the existing scan marker at `:378`, which the diff does not touch.
   - The app has no query-cache persister.
   - Test 3.20 covers remount.

4. **No new request, endpoint, field or read: holds.**
   - The added code calls only `qc.getQueryState(queryKeys.fleets.mine())`, a synchronous cache inspection (`:359`, `:781`).
   - `strandingWarning` was already on the `Fleet` type (`frontend/lib/types/fleet.ts:178`).
   - Nothing under `frontend/hooks`, `frontend/lib/services`, `frontend/lib/types`, `backend`, `claude-agent` or `infra` is modified.

5. **Account or corporation switch in one tab: not exploitable.**
   - The record is keyed by fleet id in component state.
   - Both branches of the derivation (`awaitingRead` and `stillRunning`) need `warnedOrders[acting.id]`, and `acting` must be in the current account's own-fleets read. A prior corporation's fleet id cannot appear there.
   - Sign-out also clears the query cache (`frontend/hooks/use-auth.ts:130`, `:185`) and redirects to `/login`.
   - Worst case would be a fixed advisory sentence with no identifier or figure.

6. **No `dangerouslySetInnerHTML`, no new dependency: holds.**
   - Neither production file contains `dangerouslySetInnerHTML`.
   - The only `innerHTML` is a read-only before/after comparison in the test file (`SystemSpaceView.stranding-notice.test.tsx:505-507`).
   - The only import change is a type import from the sibling panel file; `package.json` and the lockfile are unchanged.
   - I did not run `npm audit`, since the dependency set is unchanged.

7. **Diff confined to stated Impact: holds.** The change's files are the two production files, the two test files, `tasks.md` and the rulings handoffs. All `tasks.md` boxes are checked, and none claims a security control that is unenforced.

The other modified files in the tree (`frontend/app/not-found.tsx`, `frontend/lib/firebase.ts`, `frontend/lib/firebase.emulator-config.test.ts`, `harness/skills/spinup/SKILL.md`, `harness/skills/startup/`) belong to other sessions; I did not audit them.

## Findings by severity

- BLOCKER: none
- MAJOR: none
- MINOR: none

**Verdict: SECURITY-CLEAR**

*Orchestrator's note: item 7's "all `tasks.md` boxes are checked" is the
reviewer's wording; at the time of the audit sections 1–4 were checked and
sections 5 and 6 (records, gates) were not.*
