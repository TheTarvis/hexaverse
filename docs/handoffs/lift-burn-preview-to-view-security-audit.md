# Security audit (implementation phase) — `lift-burn-preview-to-view` at `3802b92`

*Persisted by the orchestrator, verbatim, from the security reviewer's returned
text (2026-10-04).*

**Finding counts: BLOCKER 0, MAJOR 0, MINOR 0, advisories 2. Verdict: SECURITY-CLEAR.**

The code matches the spec-phase conclusions. The change is client-only (three production files), adds no endpoint, input, persistence, auth path, secret or dependency, and leaves the server's ownership gate as the only enforcement.

Method: read the diff of the three production files at `3802b92` (HEAD, tree clean), the query-key factory, the selection key, the server handler, and every cache-invalidation site in `frontend/`. I ran only the four relevant vitest files (92 tests, all pass). No stack was booted; `npm audit` / `govulncheck` were not run because the commit touches no manifest or lockfile.

## 1. Cross-fleet / foreign-fleet quote exposure — clean

- **Server gate unchanged.** `backend/fleet/handler.go:252-256` — `OrderPreview` calls `commandedFleetId` before binding the body. The ownership check at `handler.go:198` returns `ErrNotFound` (404) for a foreign or corpless requester before any settlement or solve. The commit touches no backend file.
- **Acting fleet is own-fleet data only.** `frontend/components/space/SystemSpaceView.tsx:296-297` derives `acting` from `useMyFleets()` (`:247`). The hook is called with `acting?.id` (`:745`), so no sighting or interior entity can become the `fleetId`.
- **Key is per fleet and per selection.** `frontend/lib/query-keys.ts:60-61` gives `['fleets', 'burn-preview', fleetId, selection]` as separate array elements, so fleet id and selection cannot collide by concatenation. `gcTime: 0` is unchanged (`frontend/hooks/use-burn-preview.ts:68`).
- **Removal is exact.** `use-burn-preview.ts:86-88` builds the same key the query uses (`:58`) and passes `exact: true` to both `cancelQueries` and `removeQueries`. It cannot drop another fleet's or another selection's preview, nor anything else under the `fleets` prefix (`mine`, `detail`, `scanTargets`, `scanCommitPending`).
- **Disabled-with-no-fleet case is harmless.** The key becomes `['fleets','burn-preview','', selKey]`, which no other consumer uses.
- **Nothing is presented while disabled.** `use-burn-preview.ts:91` returns `preview = null` regardless of cache state. On resume the cache entry is gone, so the observer starts empty.
- **No copied quote state.** The view derives `currentQuote` inline (`SystemSpaceView.tsx:749`) and passes props (`:914-918`). The panel holds no quote in state; its only `useState` is the pre-existing click-time `commit` record (`frontend/components/space/SpaceCommandPanel.tsx:119`).
- **Deny-path tests exist.** `frontend/hooks/use-burn-preview.test.tsx:415-506` covers resume with a cached answer and with an in-flight request, for both success and failure. `frontend/components/space/SystemSpaceView.burn-preview.test.tsx` covers the same at the real call site (tasks 3.5, 3.16).

## 2. Client suppression as enforcement — clean

- The hook's header and prop doc now say "a client request-suppression input … not the server's enforcement" (`use-burn-preview.ts:26-30`, `:35`). The earlier "commit would be REFUSED" rationale is gone, which resolves spec-phase MINOR 1 in code.
- `previewWanted` (`SystemSpaceView.tsx:743`) only gates the request.
- The panel's new `burnAvailable` (`SpaceCommandPanel.tsx:125`) gates only the uncapped label (`:306`). Burn's `disabled` expression and `commitBurn` are not edited.
- Nothing in the diff presents suppression as authorization.

## 3. Request rate against `orders/preview` — not worse

- **One call site.** `SystemSpaceView.tsx:744` is the only production use; the panel's call is deleted. `frontend/hooks/use-burn-preview.call-site.test.ts` guards this statically.
- **Cadence untouched.** `refetchInterval` and `staleTime` are still `PREVIEW_REFRESH_MS`, `retry: false`, `refetchOnWindowFocus: false` (`use-burn-preview.ts:61-69`). Running-mine and docked-at-target states no longer poll.
- **No effect loop.** The effect's dependencies are `[enabled, qc, fleetId, selKey]` (`:89`), all primitives or stable, and it returns early when enabled. `removeQueries` changes no observer state, so the effect does not re-fire. A removed query that the still-mounted observer rebuilds is disabled and fetches nothing. This was reasoned against `@tanstack/query-core` 5.90.11 and is covered by the hook tests.
- **Cancel/remove cannot cause a refetch.** No `invalidateQueries` in `frontend/` targets the burn-preview key. The only prefix-wide one is `queryKeys.fleets.all` in `frontend/components/wake-up-flow.tsx:39` (spawn flow), and an invalidation does not fetch a disabled query.
- **`retry` is guarded live.** `enabledRef` (`:73-76`) makes a captured `onRequote` a no-op while withheld. Tests at `use-burn-preview.test.tsx:370-400` and task 3.14 cover it.
- **Restoring request is one per transition.** A false-to-true transition sends exactly one request (hook test 1.9, view test 3.16).

## 4. Seams, secrets, dependencies — clean

- Added lines contain no `process.env`, `NEXT_PUBLIC_*`, `NODE_ENV` branch, test-only export, `window`/`localStorage` access, logging or token handling.
- The commit changes no `package.json`, lockfile, `go.mod` or env file.
- No new server action and no free-text input.

## Advisories (not findings)

- **A. Re-enable now bypasses `staleTime`.** Because the cache entry is discarded on disable, each false-to-true transition costs one request even inside the 10 s freshness window; before, a still-fresh entry would have been reused. This is the designed behaviour (Decision 13). Every non-selection driver of the flag (`acting.jump`, `attachedTo`, the running-mine read) changes only on a server read or a mutation the owner pays for separately, and selection-driven changes already cost one request per change before this commit. One theoretical edge is `mineRunning = runningMine.eta > worldTime` (`SystemSpaceView.tsx:740`): a clock re-anchor that steps `worldTime` back across the ETA would cost one extra request per re-anchor. That is bounded by read cadence and far below the every-10-seconds polling this change removes. No attacker gains anything they cannot get by calling the endpoint directly, so the server's rate limiter remains the control.
- **B. Carried from spec phase, still open, outside this change.** A zero-length solve returns 500 rather than a 4xx, and the server accepts a burn over a running mine. The client no longer triggers the first by polling, but a direct `POST /v1/fleets/:id/orders/preview` or `/orders` by the owner still reaches both. `defect-zero-length-burn-returns-500.md` and `defect-burn-cancels-running-mine.md` should stay open, as tasks.md 5.6 already says.

## Verdict: SECURITY-CLEAR

No checked task box corresponds to an unenforced control.
