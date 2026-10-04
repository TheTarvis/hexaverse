## Context

A burn commit's response carries a one-shot `strandingWarning` (`backend/fleet/handler.go:445-448`, `omitempty`, never on a read). Nothing on the system space view renders it. This change shows it as a notice for as long as the order it belongs to is the fleet's running burn, as the own-fleets read last reported. Frontend only; one ADDED requirement in `system-space-view`; `fleet-roster`'s *A Burn Commit's Stranding Warning Is Surfaced to the Player* becomes true for the burn command with no delta. The quote, the burn command's availability and every live requirement's text are untouched (RULING 1). The fourth withheld state and the clearing of the quote are link 2a-iii-b's and nothing here is built for them.

Facts this design rests on (code read at `b695eeb`; React Query facts read in the installed `@tanstack/query-core` 5.90.11 and run against it):

- **The burn mutation lives in the panel, the read in the view.** `useOrder` has one caller, `SpaceCommandPanel.tsx:115`. The view holds `useMyFleets()` (`SystemSpaceView.tsx:247`) and derives `acting` from it (`:296-297`).
- **The order's two instants are integers, written once.** `space.Burn.DepartMs` and `ArriveMs` are `common.WorldMillis` (`backend/space/burn.go:39-40`), set only where the burn is constructed (`:480-481`); nothing reassigns either on a stored burn. The commit response and the own-fleets read serialize the same stored burn through the same `fleetDTO`. Equality of the pair across the two is exact.
- **`useOrder`'s hook-level `onSuccess` runs before the panel's mutate-level one, and it cancels any own-fleets read in flight.** `use-fleets.ts:72` calls `invalidateFleet`; `invalidateQueries` refetches with `cancelRefetch: true` by default (`queryClient.ts:321`), and `Query.fetch` silently cancels the in-flight fetch when the query has data (`query.ts:397`). A cancelled fetch's later answer is discarded: it changes neither `data` nor any counter. Measured: with a read held in flight, the commit starts a third `listMine` call inside the hook-level callback, the panel's callback then runs, and answering the held read afterwards leaves the query's `dataUpdateCount` unchanged.
- **So a read begun before the acceptance can never answer after it.** Every own-fleets answer that lands after the panel's success callback belongs to a read started at or after `useOrder`'s invalidation, which is after the server accepted the order. The view does not need request-time ordering; it needs to know whether a read has answered since the callback.
- **Wall-clock stamps cannot say that.** `dataUpdatedAt` and a `Date.now()` marker tie whenever two events share a millisecond. The `SystemSpaceView*` test family runs under fake timers (`SystemSpaceView.burn-preview.test.tsx:416`), where `Date.now()` does not move between explicit advances, so every answer and every marker in a test carry the same stamp. Measured with real timers and an instantly resolving read: 200 ties in 200. The scan's `committedPending` (`SystemSpaceView.tsx:339-358`) uses that comparison; it is the precedent for the gap existing, not for how this change measures it.
- **An instantly resolving read can land before the panel's callback.** Measured: with `listMine` returning an already-resolved promise, the read `useOrder` starts has answered (`dataUpdateCount` already incremented) by the time the mutate-level `onSuccess` runs. With an answer deferred to a later task it has not. The rule below is correct in both orders.
- **The view re-renders on every own-fleets answer.** `useMyFleets` spreads the query result (`use-fleets.ts:40`), which tracks every property, and each answer flips `fetchStatus`; measured, an answer deep-equal to the previous one still notifies.
- **The existing view harnesses cannot observe any of this.** They mock `useMyFleets` as a static return with a no-op `refetch` and make `useCutDrive` and `useStop` inert (`SystemSpaceView.burn-preview.test.tsx:74-97`, `:337-344`).

## Goals / Non-Goals

Goals: the commit's stranding warning visible on the system space view for the order's life as last read; one determination of "this order is still this fleet's running burn", derived in render; a per-fleet record that survives an acting-fleet switch, a selection change and a remount of the command panel, and is lost with the view; a view-level harness over a real own-fleets read.

Non-goals: clearing or withholding the quote, the burn command's availability, the uncapped label, any MODIFIED block (link 2a-iii-b); the stop command's warning (`drift-stop-stranding-warning-not-rendered.md`); a selection key or any other field with no reader here; any edit to `use-fleets.ts`, `use-burn-preview.ts`, a service, a type module or the backend; the galaxy view; palette, type scale or panel fill; `followup-explain-withheld-burn-command.md`; anything resting on U1-U10 of `add-vitals-strip-qa-reverify.md` (the two `wallMsUntil` call sites in `SystemSpaceView.tsx` are not touched and nothing new calls it).

## Decisions

1. **Order identity is the commit response's `(DepartMs, ArriveMs)`, compared for equality with the own-fleets read (M1; RULING 2 confirmed).** "Running" means the read's entry for that fleet has `state.Mode === 0`, a non-null `state.Burn`, and both instants strictly equal to the record's. No target comparison, no action id, no added read. Alternatives rejected: target match (cannot carry a warning that only the response holds; a point burn serves `BodyId: ""`); writing the response into the own-fleets cache (edits a hook the galaxy view shares and changes when three other surfaces flip); the action inbox (adds a read; the response carries no id to match).

2. **The gap is measured by the read's answer count, not by time.** At acceptance the view reads the own-fleets query's state from the query client: it stores that state's `dataUpdateCount` unless the read `useOrder` started has already answered, which is `fetchStatus` idle with `status` success, in which case it stores `null` (no gap). A fetch that is paused, or a first read that has already failed, has not answered: the count is stored and the gap stays open until a read requested at or after the acceptance answers. In render the gap is open while the stored count is non-null and equals the query's current `dataUpdateCount`. The count is read from `qc.getQueryState(queryKeys.fleets.mine())`, the same query the view already subscribes to through `useMyFleets`, so the value is current in every render that the answer causes. This is exact where a timestamp ties, and it is the same rule whether the first read lands before or after the panel's callback. It depends on `useOrder` invalidating the own-fleets read with cancellation before the panel's callback runs; the scenario *A read begun before the commit and answered after it does not end the gap* is the test that fails if that invalidation is removed or made non-cancelling. Alternative rejected: a `Date.now()` marker against `dataUpdatedAt`, as the scan does - ties under the family's fake timers, so the red test for the gap could not be turned green honestly. Alternative rejected: capturing `dataUpdatedAt` at acceptance and comparing for change - the same tie. Alternative rejected: exposing the count from `useMyFleets` - an edit to a shared hook this change fences.

3. **A failed read does not end the gap and does not remove the notice (RULING 5).** Only an answer moves `dataUpdateCount`; a failure leaves the record judged exactly as before it. The accepting response is the newest statement the client holds about that fleet, and a failed read contradicts nothing in it. The view's fleets-error notice and retry are shown beside the notice, so the state is neither silent nor unretriable, which is what the scan's "IF that read fails" rule exists to prevent for a presentation that hides its own retry. This is also the live preview rule's reading of a failed refresh ("leaves its earlier answer standing"). Alternative rejected: end the gap on failure - it removes a safety warning because a request failed, puts it back when a retry answers, and has no stable variant: keeping it removed needs state written from an effect, which this change forbids itself.

4. **The order's end is read-only; no clock term (RULING 6).** The projected clock passing `ArriveMs` does not end the notice. The ETA-scheduled refetch already lands the arrival about one round trip after it, so a clock term buys under a second in the ordinary case. In the degraded case (a read returning the fleet unsettled) the clock would remove the notice while the server still serves the burn, before any read can carry the roster's `stranded` indication that replaces it. A clock term would also make the notice "a state that flips when a served instant passes" under *Animation Never Re-Renders the View*, which nothing here needs.

5. **The record: one per fleet, for warned orders only, in view component state.**

   ```ts
   interface WarnedOrder {
     departMs: number | null
     arriveMs: number | null
     /** own-fleets dataUpdateCount at acceptance; null when the read the commit started had already answered */
     readsAtAcceptance: number | null
   }
   const [warnedOrders, setWarnedOrders] = useState<Record<string, WarnedOrder>>({})
   ```

   An accepted commit carrying the warning sets the fleet's entry; an accepted commit without it deletes the fleet's entry; a rejected or failed commit does neither. Nothing is stored for an unwarned order, because nothing in this change would read it. A stale entry is inert (it matches no read) and is bounded by the fleet count. Component state in `SystemSpaceView` survives an acting-fleet switch, a selection change and a remount of `SpaceCommandPanel`, and is lost on reload and on a remount of the view, which is the requirement's reload clause. Alternative rejected: a query-cache entry, as the scan's marker is - it would survive a view remount inside one session and not a reload, giving the reload clause two answers. Alternative rejected: panel state - lost when link 2b remounts the panel. Alternative rejected: a ref - a write would not re-render.

6. **The derivation is one render-time expression; nothing writes state outside the commit callback.**

   ```ts
   const warned = acting ? warnedOrders[acting.id] : undefined
   const readCount = qc.getQueryState(queryKeys.fleets.mine())?.dataUpdateCount
   const awaitingRead = !!warned && warned.readsAtAcceptance !== null && readCount === warned.readsAtAcceptance
   const burn = acting?.state?.Mode === 0 ? acting.state.Burn : null
   const stillRunning =
     !!warned && !!burn && warned.departMs !== null && warned.arriveMs !== null &&
     burn.DepartMs === warned.departMs && burn.ArriveMs === warned.arriveMs
   const commitStrandingNotice = awaitingRead || stillRunning
   ```

   No effect, no timer, no clock term, no render-time `setState`. It is keyed on `acting`, so it follows the acting fleet and returns on the switch back with no handler.

7. **A warned response lacking either burn instant is unspecified by this change.** The nullable `departMs` and `arriveMs` in Decisions 5, 6 and 8 are a defensive type only, because the client type allows a null burn; they are not a behaviour. What the view shows for such a response is not specified or tested here and is the follow-up's to specify (`docs/handoffs/followup-warned-commit-without-burn-instants.md`). The backend builds the burn on every accepted order (`backend/fleet/service.go:790`, `:877`), so the state is not reachable on the real wire.

8. **The seam is one optional callback on the panel, called from the mutate-level `onSuccess`.**

   ```ts
   export interface AcceptedBurnCommit {
     fleetId: string
     departMs: number | null
     arriveMs: number | null
     strandingWarning: boolean
   }
   onCommitAccepted?: (commit: AcceptedBurnCommit) => void
   ```

   `fleetId` is the id passed to `order.mutate`; the success closure is created at click, so it already holds the click-time fleet. `strandingWarning` is `settled.strandingWarning === true`. The callback is not called on error. The view's handler is a `useCallback` over `qc` alone, using the functional form of `setWarnedOrders`, because the panel calls the instance it held at click. The type is exported from `SpaceCommandPanel.tsx`; no type module changes. The name matches `ScanControl`'s same prop on the same view. Alternative rejected: lifting `useOrder` to the view - it moves the toast, the guard and the commit figures and rewrites the panel's commit tests for a component link 4 retires. Alternative rejected: a mutation-cache subscription in the view - a second observer of one mutation, with the fleet id recovered from variables.

9. **The view owns the boolean; the element that shows it holds no state (RULING 8).** `SpaceCommandPanel` renders the notice from an optional `commitStrandingNotice?: boolean` as a `<p data-testid="commit-stranding-notice">` directly below the Burn control, in the panel's existing `text-[11px] text-amber-400` treatment, with no role, outside the announcer, with no dismiss control. It is a separate element from `preview-stranding` and has no dependence on any preview prop. The Burn control is neither moved, disabled nor re-ordered by its appearing. The exact copy (RULING 9), as two constants in `SpaceCommandPanel.tsx`:

   - inline: `Your current course leaves this fleet unable to reach any station or lane gate. Place a different order to change it.`
   - toast: `This course leaves the fleet unable to reach a station or lane gate.`

   Neither contains a digit or the word "strand"; the preview's own line is not edited. Alternative rejected: reusing the preview line's copy - it omits lane gates and is conditional about a quote.

10. **The advisory toast is fired from the panel's mutate-level `onSuccess`, once per accepted warned response (RULING 8).** The same callback that calls `onCommitAccepted` calls `toast.warning(<toast string>)` when `settled.strandingWarning === true`, beside the existing success toast and independent of which fleet is acting when the response lands, because the callback closure was created at click. Nothing else fires it: removal by a read, a switch of acting fleet and a refetch go through render derivation only, so none can raise a second toast. The view's announcer is not touched. Alternatives rejected: inline only (a screen-reader user hears the success and nothing about the stranding; a player who switched fleets sees nothing), toast only (gone in seconds; the chain doc asks for a warning that stays), `role="status"` on the notice (silent in the switched-fleet case and re-announces on return).

11. **A new view-level harness, because the gap is an ordering.** `SystemSpaceView.stranding-notice.test.tsx` leaves `@/hooks/use-fleets` unmocked and mocks `fleetService` (`listMine`, `order`, `cutDrive`, `stop`, `preview`, and the scan and mine calls the family already mocks) plus the reads, router and stage the family mocks. Its rules:
    - Every `listMine`, `order`, `cutDrive` and `stop` call returns a promise the test settles by call index; none resolves on its own. An auto-resolving read can land before the panel's callback and makes the gap arrangements order-dependent.
    - Each `listMine` answer carries its own `worldTime`, as the wire does.
    - A read that is not a mutation's is caused through a trigger the view really has: dispatching `sse-reconnect`, or advancing the fake clock by the baseline poll interval. No test calls the query client to cause or to write the own-fleets read.
    - The remount test mounts the second view on the same `QueryClient`, so a record kept in the cache would fail it.
    - The view's clock anchors on the interior read first (`SystemSpaceView.tsx:440`), so the "clock passed the arrival" arrangement is made by the interior mock's served `worldTime` or by advancing fake timers, not by the fleets answer.
    - Query retry is off in the harness client; the app's own default retries a status-less read failure three times, which only delays when a failure registers.

## Risks / Trade-offs

- **The gap rule depends on `useOrder`'s invalidation.** If that call is removed, made `cancelRefetch: false`, or moved after the mutate-level callbacks, a pre-acceptance read could answer into the gap. The dependency is in a hook this change does not edit; the pre-acceptance-read test is its guard.
- **`getQueryState` is read in render.** It is a non-subscribing read of a query the same component subscribes to, so it is current whenever the component renders for that query. In harnesses that mock `useMyFleets` the query does not exist, so the query state is absent, which is not "idle with success": Decision 2 stores the absent count (`undefined`, not `null`) and the render-time count is `undefined` too, so the gap would stay open in such a harness. That is harmless today because no existing test in those harnesses commits a warned burn.
- **The notice can outlast its order.** By one round trip after a cut drive or stop from this view; until the ETA-scheduled refetch answers for an arrival; until the next baseline poll (`BOARD_POLL_MS`, 20 s) for a change made elsewhere; and for as long as reads fail or return the fleet unsettled. Each is a warning shown too long, never a blocked command.
- **A stop removes the notice and shows nothing in its place.** The stop's own response can carry the same warning and is still unrendered (`drift-stop-stranding-warning-not-rendered.md`).
- **A response that lands after the panel unmounts reports nothing.** React Query drops mutate-level callbacks for an unmounted observer, so neither the success toast nor the notice appears. The panel does not unmount today; link 2b's tabs can make it. That link must keep the panel mounted across tab changes or lift the mutation.
- **After a reload mid-burn there is no notice.** The roster row's served `stranded` indication is the only statement left, and it is computed from the fleet's current state, not from the order's destination, so it may read false until arrival.
- **The commit drift notice still renders after every real commit** (`drift-commit-response-carries-no-delta-v.md`) and now shares the panel with this notice. Not changed here.

## Migration Plan

None. Frontend only, no stored data, no wire change.

## Open Questions

None. Q3, Q4, Q5 and Q9 are ruled (RULINGs 5, 6, 8, 9) and recorded in Decisions 3, 4, 9 and 10.
