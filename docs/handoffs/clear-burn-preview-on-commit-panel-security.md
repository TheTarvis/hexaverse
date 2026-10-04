# Security panel report: `clear-burn-preview-on-commit` (spec phase)

*Written by the security reviewer, 2026-10-04, against the uncommitted change
folder `openspec/changes/clear-burn-preview-on-commit/` at HEAD `48face7`.
Read-only review: no stack booted, no suite run; every code claim is from
reading source.*

**Verdict: SECURITY-CLEAR.** No BLOCKER, no MAJOR. One optional MINOR wording
clause (S1, zero tasks). The change has no new security surface: it adds no
endpoint, field, request, input, storage or auth path, and it removes requests
rather than adding any.

Delta paths below are relative to
`openspec/changes/clear-burn-preview-on-commit/`.

## What was checked

**1. Is the client-side unavailability presented or relied on as an
authorization or double-order control? No.**
- The delta never says the server relies on it. It says the opposite of a
  control: `specs/system-space-view/spec.md:102-107` ("Only this view's
  commits") makes a reload, a remount, another tab and the agent all
  "previewed and committable as a re-target, as before". A state that a reload
  clears cannot be read as enforcement.
- The server remains the authority. Ownership: `backend/fleet/handler.go:198`
  answers not-found unless the fleet's corporation equals
  `common.ActorCorp(c)`. Double orders: the movement channel is single-slot
  server-side, as the carried rationale at `spec.md:619-621` states.
- The one gap is wording, not behaviour: the explicit "not the server's
  enforcement" sentence (`spec.md:321-325`) names only the mine and
  lane-transit suppressions, and the fourth state is the first one that also
  withholds a command. See S1.

**2. Can the per-fleet record attribute one fleet's or one account's order to
another? No.**
- Acting-fleet switch: the delta binds the record to "the fleet the command
  was invoked for and the selection that was current when it was invoked, not
  the fleet acting or the selection current when the response landed"
  (`spec.md:16-19`), with scenarios "The committed selection follows the
  fleet" (both orderings, task 3.14) and "A response that lands after the
  selection was replaced" (tasks 2.2, 3.13). The existing code already keys by
  the click-time fleet: `frontend/components/space/SpaceCommandPanel.tsx:176`
  passes `fleet.id` from the closure, and
  `frontend/components/space/SystemSpaceView.tsx:780` reads
  `warnedOrders[acting.id]`. Task 5.1 extends the same capture to the
  selection.
- Sign-out then sign-in in one tab: the record is component `useState`
  (`SystemSpaceView.tsx:275`). Sign-out clears the query cache
  (`frontend/hooks/use-auth.ts:130`, `:185`) and
  `frontend/components/layout-wrapper.tsx:52-56` pushes a non-public,
  non-home route to `/login`, which unmounts the view. If a record did
  survive, it is keyed by a fleet id of the previous corporation, which the
  new account's own-fleets read cannot contain, so it can never match an
  acting fleet. The worst case would be a fixed sentence and a disabled
  button on the new user's own screen, with no identifier or figure from the
  earlier account.
- The acting fleet can only be an own fleet (`SystemSpaceView.tsx:300-306`,
  from `useMyFleets`), and a record can only be written from an accepted
  commit on a fleet the requester owns.

**3. Is any served value rendered as raw text or stored beyond the view's
lifetime? No.**
- The statement is static: "SHALL carry no figure, no countdown and no raw
  server text, and its text SHALL be the same whatever the response and the
  own-fleets read contain" (`spec.md:109-112`), with a scenario
  (`spec.md:247-250`) and task 2.3.
- The record holds two instants (equality only, never rendered), a read
  count, a warned flag and a selection key the client itself derived
  (`frontend/components/space/space-selection.ts:70`). None is rendered.
- Storage is view state only. Task 5.3 forbids effects, timers and clock
  terms and adds no `localStorage`, `sessionStorage`, URL or persisted-cache
  write; scenario "A burn this view did not commit is previewed" (task 3.18)
  pins that a remount on the same `QueryClient` holds no record.

**4. Does withholding the preview request remove a server-side check the
commit relied on? No.**
- The fuel cap is the requester's own price agreement, not a server safety
  check. `backend/fleet/service.go:796-798` rejects an unaffordable burn
  (`ErrInsufficientFuel`) whether or not a cap is sent; `:807` applies the
  cap only when present.
- When a commit goes out with no `maxFuelTons`
  (`SpaceCommandPanel.tsx:142`, `:153`: the ceiling exists only with a
  current quote):
  1. the first preview for a selection is pending or failed (existing);
  2. the newest refresh failed, so the figures are stale (existing);
  3. the resume window after a withheld state ends (existing rule; this
     change adds one new way in, `spec.md:92-96`).
- While the committed state holds, no commit is sent at all (`spec.md:73-76`,
  scenarios at `:131`, `:137`), so the state itself creates no uncapped
  commit. The failed-read rule is chosen for the same reason
  (`spec.md:57-60`).
- Net effect on (3): before this change a Burn after a cut drive on the kept
  selection carried a cap from a quote solved before the cut; after it, that
  one window is uncapped. The server's affordability check is unchanged, so
  this is a player-consent matter, not a security one. See the note below.

**5. Does the change stay inside its no-backend fence? Yes.**
- `proposal.md:31` and `:41` put every backend field, endpoint, query, hook,
  service and type out of scope; task 5.5 confirms it by diff.
- The change sends fewer preview requests (none for the committed selection),
  so it lowers the cost named at `spec.md:357-362`. One request per state end
  is sent at the transition; it is bounded by the player's own commits.
- No server action, route handler, `NEXT_PUBLIC_*` value or cached
  authenticated response is involved. `docs/plans/system-hud/chain.md:930-941`
  names no threat or compliance constraint that the delta drops.

## Findings

### S1 (MINOR, optional): the "not server enforcement" disclaimer omits the fourth withheld state

- **Evidence.** `specs/system-space-view/spec.md:321-325`: "The mine and
  lane-transit suppressions are client request-suppression rules only; they
  are not, and SHALL NOT be relied on as, the server's enforcement of either
  state". The fourth state is not named, although it is the only one that
  also disables a command (`spec.md:304-307`). The modified double-submit
  requirement then places the new paragraph (`spec.md:612-617`) directly
  above the duplicate-burn rationale (`spec.md:619-621`), which invites
  reading the committed state as the duplicate-order control.
- **Risk.** No attacker action exists today: a player can only re-order their
  own fleet, and the server gates ownership and the single slot. The risk is
  a later backend change treating "the client will not send a second burn"
  as a guarantee. That is why this is MINOR and optional.
- **Fix (a clause on existing text; no scenario, no task).** Append to the
  "Only this view's commits" paragraph of the ADDED requirement:

  > The unavailability of the burn command for a committed selection is a
  > client presentation rule only. It is not, and SHALL NOT be relied on as,
  > the server's authorization of a burn order or its protection against a
  > second order for the same fleet: a reload, another tab or the agent can
  > submit one, and `fleet-movement` owns what the server does with it.

  Task 3.18 already observes the behaviour this sentence describes (a
  remounted view offers an enabled Burn over a running order), so no new test
  arrangement is needed.

## Note for the UX reviewer (not a security finding)

Scenario "Cutting the drive ends the committed selection" (`spec.md:153-158`)
asserts that a burn committed in the resume window carries no `maxFuelTons`,
but does not assert that the uncapped-burn label is shown in that window. The
carried requirement implies it (`spec.md:521-524`). If the panel wants the
player's consent to an uncapped burn pinned in this new window, it is one
clause on that existing scenario ("AND the uncapped-burn label is shown while
that request is pending") inside task 3.5, with no new arrangement.

## Findings by severity

- BLOCKER: none
- MAJOR: none
- MINOR: S1 (optional wording clause, zero tasks)

**Verdict: SECURITY-CLEAR**

Not opened: the analysis r2 body beyond its index, the rulings bodies beyond
their index, and the writer-notes file. The delta, proposal, tasks, chain
section and the code were sufficient for each vector.
