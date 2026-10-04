# Analysis r2 — `clear-burn-preview-on-commit` (system-HUD chain, link 2a-iii-b)

Refresh of `clear-burn-preview-on-commit-analysis.md` (written at `b695eeb`) against HEAD `48face7`, after the predecessor `surface-commit-stranding-warning` archived at `3218d9d`. Read-only: no stack booted, no suite run; every code claim is from reading source. `openspec/changes/` holds only `archive/`, so nothing in flight conflicts.

**What of the old file is still valid, and what this file replaces**

| Old section | Status |
| --- | --- |
| § 1a (the clear-on-commit drift) | Still CONFIRMED. Line references are stale; current ones are in § 1 below. |
| § 1b (the stranding drift) | Closed for the burn command by the predecessor. Do not use. |
| § 2 (what the wire lets the client observe) | **Valid as written.** `git diff b695eeb HEAD -- backend frontend/hooks frontend/lib/types frontend/lib/services frontend/lib/realtime.ts` is empty. Read it for the per-path table. |
| §§ 3–9 | **Superseded by this file.** |

**Headlines**

- The predecessor built more of this link than the chain doc says: the callback already fires for every accepted commit, and the gap and identity derivation is complete. What it does not have is a record for an unwarned commit, a selection in the record, or any reader other than the notice.
- No live requirement text says "no record is kept for an ordinary commit". That sentence lives only in the chain doc and the archived design. Widening needs no delta to the predecessor's requirement.
- Verdicts: **1 ADDED, 3 MODIFIED** in `system-space-view`; nothing in any other capability.
- Seven arrangements in the predecessor's own test file break under RULING 5 (they click Burn twice on one selection, or assert a quote state on the committed selection). Their scenarios stay true; the tests need re-arranging.
- The drift notice is rendered in the new harness and on the real wire after every commit, and it contains arrival and delta-v figures. Any scenario worded "no arrival or delta-v figure is shown" is false. Word them against the quote's own elements.
- Honest estimate: **40 tasks (38–42) before the panel**, on the cap. I found no seam worth a fourth split (§ 6).

---

## 1. What exists today (HEAD)

### 1.1 The callback

`frontend/components/space/SpaceCommandPanel.tsx:51-56`:

```ts
export interface AcceptedBurnCommit {
  fleetId: string
  departMs: number | null
  arriveMs: number | null
  strandingWarning: boolean
}
```

- Prop: `onCommitAccepted?: (commit: AcceptedBurnCommit) => void` (`:94`).
- Called from the mutate-level `onSuccess` (`:175-180`), **once per accepted commit, warned or not**. Not called on error (`:182-189`).
- `fleetId` is the click-time fleet: the closure is created inside `commitBurn` (`:145-193`).
- It carries **no selection**. The click-time selection is in the same closure (`selection`, read at `:146`) but is not reported.
- `useOrder` still has one caller (`SpaceCommandPanel.tsx:133`).

### 1.2 The record

`frontend/components/space/SystemSpaceView.tsx:244-250` and `:275`:

```ts
interface WarnedOrder {
  departMs: number | null
  arriveMs: number | null
  readsAtAcceptance: number | null | undefined
}
const [warnedOrders, setWarnedOrders] = useState<Record<string, WarnedOrder>>({})
```

- View component state, keyed by fleet id. Lost on reload and on a view remount; survives a panel remount.
- **Written for warned commits only.** `handleCommitAccepted` (`:347-367`) deletes the fleet's entry when `commit.strandingWarning` is false (`:349-357`) and sets it when true (`:361-364`).
- The record holds no selection and no warned flag (being in the map means warned).

### 1.3 The gap measurement

- At acceptance the handler reads `qc.getQueryState(queryKeys.fleets.mine())` (`:358`). It stores `null` when that query is idle with status success (the read the commit started has already answered), otherwise the query's `dataUpdateCount` (`:359-360`).
- In render: `awaitingRead = !!record && record.readsAtAcceptance !== null && fleetReadCount === record.readsAtAcceptance` (`:781-783`).
- Only an answer moves the count. A failed read does not, so a failure neither ends the gap nor judges the order (predecessor RULING 5).
- It depends on `useOrder`'s hook-level invalidation (`frontend/hooks/use-fleets.ts:44`, `:72`) running, with cancellation, before the panel's callback. Test 3.2 of the stranding-notice file is the guard.
- With no query state (a harness that mocks `useMyFleets`) the stored value is `undefined`, the render-time count is `undefined`, and the gap never closes.

### 1.4 "Still the running burn, as last read"

`SystemSpaceView.tsx:784-791`:

```ts
const actingBurn = acting?.state?.Mode === 0 ? acting.state.Burn : null
const stillRunning =
  !!warnedOrder && !!actingBurn &&
  warnedOrder.departMs !== null && warnedOrder.arriveMs !== null &&
  actingBurn.DepartMs === warnedOrder.departMs && actingBurn.ArriveMs === warnedOrder.arriveMs
const commitStrandingNotice = awaitingRead || stillRunning
```

No target comparison, no clock term, no effect, no timer. Keyed on `acting`, so it follows the acting fleet.

### 1.5 What the preview does today

`previewWanted = !!acting && !acting.jump && !mineRunning && !dockedAtTarget` (`:773`). No commit term. The preview keeps polling after a commit, so the drift in `drift-preview-does-not-clear-on-commit.md` is still open.

### 1.6 What widening the record requires

In code:

1. `AcceptedBurnCommit` gains the click-time selection's identity. `selectionKey(selection)` (`space-selection.ts:68-77`) is a client-side string; comparing it never crosses the wire, so the point round-trip concern of old Q1 and the empty `BodyId` defect do not apply.
2. The record is kept for **every** accepted commit and gains `strandingWarning: boolean` and the selection key. The delete branch at `:349-357` goes; `WarnedOrder` is renamed.
3. Two readers of one `awaitingRead || stillRunning`:
   - notice = that, **and** the record's `strandingWarning`;
   - committed selection = that, **and** the live selection's key equals the record's.
4. `previewWanted` gains `&& !selectionCommitted`. The derivation at `:780-792` has to move above `:773`.
5. The panel gains one boolean prop, a statement element, and a term in `burnAvailable` (`:143`) and in the control's `disabled` (`:345`). The uncapped label (`:332-338`) follows `burnAvailable` and needs no separate term.
6. `use-burn-preview.ts` needs no edit: it already discards on disable and refetches at the transition (`:72-91`), and its `retry` already reads the live flag (`:74-79`).

In live spec text: **nothing**. I grepped the predecessor's requirement (`spec.md:3037-3292`) for "record", "ordinary", "unwarned", "quote" and "refresh". It never mentions a record and never says the quote keeps refreshing. The three places that say so are `docs/plans/system-hud/chain.md:54`, `:523-528`, `:556-560` and the archived `design.md` Decision 5 and `proposal.md:10`, none of which is live spec.

One sentence does need care, and it is compatible: "a fleet's later accepted burn commit ends that fleet's earlier notice at that acceptance, whether or not the later response carries the warning" (`spec.md:3100-3102`). A single per-fleet record replaced at each acceptance, with the warned flag read by the notice, keeps it true.

### 1.7 A consequence of widening that the predecessor recorded as harmless

Archived design.md, Risks: the absent-query-state case "is harmless today because no existing test in those harnesses commits a warned burn". After widening, **any** accepted commit in a harness that mocks `useMyFleets` enters the committed state and never leaves it. `SystemSpaceView.burn-preview.test.tsx` commits successfully at `:709` and three times through `expectNothingFromBefore` (`:843-845`). None asserts anything after the commit, so none breaks today. It is a trap for the next test added there (Q4 in § 7).

---

## 2. Requirement verdicts

Lines 1–3036 of `openspec/specs/system-space-view/spec.md` are byte-identical to `b695eeb` (`git diff --numstat`: 257 added, 0 removed, all appended). Scenario counts are from a fresh count.

### `system-space-view`

| `### Requirement:` header (verbatim) | Line | Scenarios | Verdict |
| --- | --- | --- | --- |
| `### Requirement: Burn Preview Reflects the Server-Solved Order, Without Committing` | 478 | 20 | **MODIFIED** |
| `### Requirement: A Failed or Stale Preview Is Never Presented as a Current Quote` | 716 | 9 | **MODIFIED** |
| `### Requirement: Burn and Jump Commit Controls Guard Against Double-Submit` | 884 | 4 | **MODIFIED** (RULING 5 makes one scenario's WHEN uninducible on the committed selection; see Q3 for the cheaper alternative) |
| `### Requirement: Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly` | 963 | 6 | **No delta** — RULING 6 (provisional): one precedence sentence in the ADDED requirement, BREAKING in the proposal |
| `### Requirement: A Burn Commit's Stranding Warning Stays Visible While That Order Is the Fleet's Running Burn, as Last Read` | 3037 | 25 | **No delta, reading recorded** — no sentence becomes false; seven of its tests need re-arranging (§ 5.2); see Q5 |
| `### Requirement: A Burn Commit Is Quote-Locked to the Preview the Player Agreed To` | 807 | 3 | No delta — verified |
| `### Requirement: Burn Commit Reports Its Outcome` | 847 | 3 | No delta — verified |
| `### Requirement: A Commit's Actual Result Is Never Silently Swapped for the Previewed One` | 919 | 3 | No delta from this link; already false in production (§ 4) |
| `### Requirement: System Space View Route and Data Fan-In` | 32 | 15 | No delta — no read added |
| `### Requirement: A Landed Resolution Is Announced to Assistive Technology` | 2002 | 4 | No delta |
| `### Requirement: Realtime Refetch Rules While the Space View Is Open` | 1164 | 5 | No delta — no trigger added |
| `### Requirement: Animation Never Re-Renders the View, and Never Starves a Navigation` | 2911 | 7 | No delta — constrains the build (no clock term, no effect-written state) |
| (new) the committed selection | — | — | **ADDED** |

The old analysis's second ADDED requirement (the stranding notice) is the predecessor's and is live at `:3037`.

### What becomes false or dangling in each MODIFIED

**Burn Preview Reflects… (478)**

| Lines | Live text | Problem |
| --- | --- | --- |
| 496-497 | "none of the three withheld states below holds" | A fourth exists. |
| 504-505 | "The view SHALL NOT request a preview in any of three withheld states, each taken as the view last read it:" | Same. A fourth bullet is needed, pointing at the ADDED requirement. |
| 519-523 | "The withheld states change what the view requests and shows, not whether the burn command is available: that stays governed by …, as before." | False for the fourth state (RULING 5). Scope the sentence to the three it is true of. |
| 560-564 | "while it remains shown and the selection is uncommitted … and SHALL clear when the selection is cleared or replaced, or when an order commits." | The unscenarioed clause. Reword per RULING 7: a burn order for that selection accepted from this view, pointing at the ADDED requirement. "Uncommitted" gains a definition there. |
| 686-689 | Scenario *A resumed preview presents nothing from before the withholding*: "withheld by a running mine, by lane transit, or by the selected target becoming the acting fleet's own host" | Enumerates three. True as written (it is a GIVEN list). |
| 703-706 | Scenario *No path sends a preview request while one is withheld*: "because a mine holds the movement channel, the fleet is in lane transit, or the selected target is the fleet's own host" | Same. |

Sentences checked and found to hold with a fourth state, with no edit:

- 498-502, "a preview SHALL be requested while the acting fleet is **burning**". Governed by the count sentence before it. Scenario 584-588 says "a **different** body" and stays true verbatim.
- 533-534, "Nothing is withheld merely because a read that has already answered is being refreshed." The gap withholds because of the acceptance, not the refresh. True, but it is the sentence an adversary will quote; the ADDED requirement should say so in its gap paragraph.
- 544-550 (resume at the transition, nothing from before), 552-558 (no retry or re-quote while withheld; silence). Generic over "any withheld state", and the hook implements them for any term of the flag.

Recommendation for the two scenario bodies (686, 703): leave them byte-identical and cover the fourth state's resume and no-retry behaviour in the ADDED requirement. Fewer edited bodies, fewer adversary targets. The design must tabulate every edited body, as 2a-ii's did.

**A Failed or Stale Preview… (716)**

| Lines | Live text | Problem |
| --- | --- | --- |
| 745-748 | "The uncapped-burn label SHALL NOT be shown while the burn command is unavailable because there is no selection, because there is no acting fleet, because the canvas is unavailable, or because a running mine holds the movement channel" | A closed list of four. A fifth unavailable state has to join it. |
| 749-750 | "The availability of the burn command in those states is governed, unchanged, by the requirements that already cover each of them." | "Unchanged" and "already" are false for the new member. |
| 801-805 | Scenario *The uncapped-burn label is never shown beside an unavailable burn command* lists the same four | True as written; leave byte-identical and cover the fifth in the ADDED requirement. |
| 794-799 | Scenario *A withheld preview is never presented as a failed one* lists three withheld states | Same treatment. |

Checked and holding: 733-736 "The absence or failure of a preview SHALL NOT of itself make the burn command unavailable" (the committed state does, not the absence); scenario 774-778 already carries "GIVEN no other requirement makes the burn command unavailable"; 742-745 covers any withheld state.

**Burn and Jump Commit Controls Guard Against Double-Submit (884)**

- 914-917, scenario *The guard releases when the request settles or fails*: "WHEN a burn or jump commit settles or fails and the player then initiates a new command THEN the guard has been released and the new attempt submits normally". After a successful burn commit the player cannot initiate a new burn on the same selection. Smallest honest edit: a GIVEN "no other requirement makes the command unavailable", and one new scenario saying the guard is released at acceptance and the control's unavailability for that selection is the committed state's.
- 885-887, "SHALL each be disabled from the moment of commit": the code has no in-flight term in `disabled` (`SpaceCommandPanel.tsx:345`); the guard is a ref. Recorded as possible drift in `followup-explain-withheld-burn-command.md` and fenced out. Carry the sentence verbatim and expect the adversary to raise it.

### The predecessor's requirement (3037): every sentence this link could touch

| Lines | Text | Finding |
| --- | --- | --- |
| 3112-3113 | "distinct from the preview's own stranding line, which is unchanged by this requirement and may be shown at the same time" | Still true: with another target selected, the preview and the notice show together. No longer true **for the committed selection**, which is the arrangement test 3.17 uses. |
| 3113-3114 | "It SHALL NOT depend on a preview being shown, requested or current." | Still true. |
| 3114-3117 | "its appearing or removal SHALL NOT remove, disable or re-order the burn command control" | True as a statement of what the notice contributes. But after this link a warned commit's notice always appears in the same render as a disabled Burn while the committed target stays selected. See Q5. |
| 3056-3066 | The gap paragraph: "IF an own-fleets read requested at or after the acceptance fails, THEN the gap continues and the notice stays" | "The gap" is named as one thing. If the command's failed-read rule is ruled differently (Q1 option a), the ADDED requirement must not say "the gap ends" for one consumer while this paragraph says it continues. |
| 3244-3249 | Scenario *A rejected or failed commit…*: "WHEN a second burn commit by A is rejected, in one arrangement as a cap rejection" | Still inducible, but only toward a **different** selection. The scenario does not say which selection, so the text stands. |
| 3231-3242 | The two "later commit by the same fleet" scenarios | Same: inducible only through a re-target. |
| 3267-3274 | "GIVEN the notice is shown and the preview is also shown with its own stranding line … the burn command control is still present and precedes the notice" | Inducible with another target selected. "Present" stays true of a disabled control. |
| 3276-3279 | "WHEN the preview is in its no-quote state, its stale state, or not requested" | Inducible with another target selected (no-quote, stale) and, newly, on the committed selection (not requested). |

No clause says the quote keeps refreshing, and none says no record is kept.

### Other capabilities — checked as hypotheses, no delta

- **`fleet-roster`** (`spec.md:205-228`, *A Burn Commit's Stranding Warning Is Surfaced to the Player*, 3 scenarios): surface-neutral; unaffected. *Burn is always available* (`:260-266`) is conditioned on "a mounting view that declares the roster owns the fleet command surface"; the system space view declares the opposite (`:238-240`).
- **`docked-fleet-actions`**: *Running Mine Gates the Fleet Panel's Commands* (`:584`) and *Rejection Reasons Map…* (`:558`) name the burn command but nothing about a quote or a committed selection. Cut drive and stop are not edited; their invalidation is what ends the committed state.
- **`system-console`**: the only mention is "no preview request" in *The Strip Issues No Read of Its Own* (`:651-655`). Nothing is passed to the strip. The pill reads the cached own-fleets data and will lag the panel by the gap; that is the predecessor's recorded two-surfaces lag, not a new claim.
- **`figure-formatting`**: no delta **provided the statement renders no figure** (RULING 5 says it carries none). `:486-489` and `:562-565` describe the drift notice and the success toast, both untouched.

---

## 3. The ADDED requirement and its scenarios

Suggested name: *A Burn Order Committed From This View Withholds Its Quote and the Burn Command for That Selection While It Is the Fleet's Running Burn, as Last Read*.

`[Qn]` marks dependence on an open question in § 7. INFERRED marks a scenario the design implies but does not state.

### Requirement text, in substance

- **Entry.** WHEN a burn order for the current selection is accepted from this view, the view SHALL remove that selection's preview (figures, ceiling, affordability line, the preview's stranding line) and SHALL request no preview for it. This is the fourth withheld state of *Burn Preview Reflects…*.
- **Whose and which.** The state belongs to the fleet and the selection held when the command was invoked, not those current when the response landed. It holds only while that fleet is acting and that selection is current. One order per fleet: a fleet's later accepted commit replaces its earlier one.
- **Definition, against reads.** It holds while the order this view committed is that fleet's running burn as the own-fleets read last reported, using the identity, the gap and the read-only end already specified in *A Burn Commit's Stranding Warning Stays Visible…*. Reference those paragraphs; do not restate them with different words.
- **The end.** With no user action and no selection change, at the first own-fleets read requested at or after the acceptance that answers without reporting that order as running: drive cut, stop above or below the floor, arrival at a body, arrival at a point, a different order from this view or elsewhere, including one toward the same target.
- **A failed read.** [Q1]
- **While it holds.** The view SHALL state that an order is committed to the selected target. It SHALL NOT show the uncapped-burn label, the no-quote state, a stale marking or a retry. The burn command SHALL be unavailable for that selection (RULING 5). This takes precedence over *Burn Command Targets Any Selected Body, Lane Gate, or Point Uniformly* for that selection only (RULING 6).
- **Not a dead end.** A different selection is previewed and committable throughout; cut drive and stop are unaffected.
- **When it ends.** The resume rule of *Burn Preview Reflects…* applies: if a preview is wanted for the kept selection the request is sent at that transition and nothing from before the commit is shown. If the fleet is now attached to the selected body, the docked-at-target state takes over and no request is sent.
- **Only this view's commits (RULING 4).** A running burn the view holds no accepted response for (after a reload or remount, or placed from another tab or the agent) is not a committed selection: it is previewed and committable as a re-target.
- **The statement.** Player-facing, static, no figure, no countdown, no raw wire text. Copy is UX's [Q2].
- **Silence.** Entering and leaving the state add no text to the live region and cause no announcement of their own (the predecessor's wording, so an arrival that ends the state still announces its landing).
- **A rejected or failed commit** enters no such state and leaves an earlier one as it was.
- **The lag.** Stated in the predecessor's terms: one round trip after this view's cut drive or stop; the arrival read; the next baseline poll for a change made elsewhere. For this consumer the cost of the lag is a command withheld too long for one selection, never an uncapped one.

### Scenarios

Assert the quote's absence by its own elements (arrival, delta-v, fuel, ceiling, affordability, the preview's stranding line), never as "no figure is shown": the drift notice shows arrival and delta-v figures after every commit (§ 4).

1. **A committed order removes the quote and withholds the command.** GIVEN a current preview for the selection; WHEN the burn is accepted with a response carrying no stranding field and the next own-fleets read reports that burn; THEN the quote is gone, the committed statement is shown, the selection is unchanged, the burn command is unavailable, no uncapped label, no-quote state, stale marking or retry is shown; AND across two refresh intervals and a baseline poll answering the same burn, no preview request is sent; AND activating the burn control sends no order.
2. **The state holds before any read has answered after the acceptance.** GIVEN the cached read still describes the fleet as parked; THEN the same presentation as scenario 1, and activating the control sends no order.
3. **A read begun before the commit and answered after it does not end the state.** INFERRED from the predecessor's rule.
4. **The projected clock passing the arrival does not end the state.** No preview request is sent when the clock passes the arrival instant with no read answered. (Read-only end; guards the zero-length 500 at every arrival that a clock term would cause.)
5. **Cutting the drive ends it.** WHEN the refreshed read reports the fleet drifting; THEN the statement is removed, one preview request for the kept selection is sent at that answer, the burn command is available, and while that request is pending no figure, ceiling or stale marking from before the commit is shown.
6. **A stop ends it, above or at the floor.** Rows: the read reports a different burn (70000, 90000); the read reports a point park. Same THEN as 5.
7. **A read reporting the order gone ends it.** Rows, each a poll-caused read after one that confirmed the order: parked at a point with nothing attached (arrival at a point); a burn to another target, 5000 to 80000; a burn to the same target, 5000 to 61000. THEN the statement is removed and one preview request is sent at that answer. The point row must **not** assert that figures render (the zero-length 500, old § 2 item 2).
8. **Arrival at the selected body hands over to the docked-at-target state.** WHEN the read reports the fleet attached to the selected body; THEN the statement is removed, no preview request is sent, and the burn command and uncapped label are as the docked-at-target state already leaves them. Do not assert more: that state is the fenced follow-up's.
9. **An order that settled inside the commit round trip.** WHEN the first read after the acceptance reports the fleet attached to the target; THEN the statement was shown until that read answered and is removed by it, with no preview request.
10. **A failed read.** [Q1] One arrangement walked in sequence, as the predecessor's.
11. **Another target is previewed and committable during the committed order, and the committed target stays committed.** WHEN a different body is selected; THEN a preview request is sent, its figures render, the burn command is available and no statement is shown; AND WHEN the committed target is selected again while the last read reports the order; THEN the statement is shown and no preview request is sent for it.
12. **A second commit by the same fleet moves the committed selection.** GIVEN A committed to X; WHEN Y is selected and its burn is accepted; THEN Y is committed; AND WHEN X is selected again, including while a read still reports the first order's instants; THEN X is previewed and committable.
13. **A response that lands after the selection was replaced withholds nothing for the new selection.** GIVEN the command was invoked for X and Y is selected before the response; WHEN the response lands; THEN Y's preview is still shown and committable; AND X shows the committed state when selected again. (Architect A4 item 2.)
14. **The state follows the fleet.** Rows: (i) A commits, B is made acting with the selection kept, then A again; (ii) the command is invoked for A, B is made acting, the response lands, then A is made acting. THEN while B is acting a preview is requested for B and its burn command is available; when A is acting again and the last read reports A's order, the statement is shown and no request is sent. (A1; A4 items 1 and 3.)
15. **A rejected commit enters no committed state.** Rows: a cap rejection (a fresh preview is requested, per *Quote-Locked*); a failure with no mapped reason. THEN no statement is shown and the burn command stays available.
16. **A rejected commit leaves an earlier committed selection alone.** GIVEN X is committed; WHEN a commit toward Y is rejected and X is selected again; THEN X still shows the committed state. INFERRED.
17. **The committed state is silent.** The live-region text is identical before the acceptance, after it, and after cutting the drive; an arrival read that ends the state still announces its landing, once.
18. **A burn this view did not commit is previewed.** Rows: the view is opened with the acting fleet already burning toward the selected body; the view is remounted on the same query client after a commit. THEN a preview is requested, the burn command is available and no statement is shown.
19. **One order, two consumers.** GIVEN a commit accepted with the stranding warning; THEN both the notice and the committed statement are shown; AND WHEN another body is selected the notice stays and the statement goes; AND a commit accepted without the warning shows the statement and no notice, including before any read answers.
20. **The statement carries no figure and no wire text.** Its text is the same whatever the response and the read contain and contains no digit. (Panel level.)

Every way the order ends is covered: cut drive (5), stop above and below the floor (6), arrival at a point (7), an order from elsewhere to another or the same target (7), arrival at a body (8), settled inside the round trip (9).

A point selection deserves one note for the writer. `selectionKey` for a point is its coordinates (`space-selection.ts:72-75`), and a second pointer pick never reproduces them. So "select the committed target again" is only reachable for a body; scenario 11 should say "body".

### The failed-read rule, per consumer (Q1; not ruled here)

The notice is ruled: a failed read changes nothing (predecessor RULING 5). For the command and the quote:

| | (a) the gap ends for the command on a failed read | (b) a failed read changes nothing, as for the notice |
| --- | --- | --- |
| What the player sees when the first read after the acceptance fails | Quote resumes and polls; Burn available and capped once the quote answers; fleets-error notice and Retry; the stranding notice (if warned) still shown | Committed statement, Burn unavailable for that selection; fleets-error notice and Retry |
| When a retry then answers with the burn | Quote cleared again, Burn unavailable again: the state flaps | Nothing changes |
| A failure after a read has confirmed the order | Must leave the state standing (live `:532-533`), so (a) applies inside the gap only: two rules for one state | Same rule |
| The hazard it leaves | A capped second order to the target already being flown to. That is the duplicate *Double-Submit* describes (`spec.md:894-896`): the second commit cancels the first and charges fuel twice | The command stays withheld for one selection for as long as reads fail, even if the order has in fact ended |
| Escape | — | Retry is on screen; any other target stays committable; a reload clears the record |
| Cost in code | A second term on the shared derivation (`errorUpdateCount` at acceptance), so the two consumers diverge | None: one derivation, two readers |
| Cost in spec | The predecessor's gap paragraph says "the gap continues"; the ADDED text must define a different gap for the command | References the predecessor's paragraph as is |
| Tasks | +2 (the divergence and the flap each need an arrangement) | 1 |

Recorded leans: old analysis Q3 recommended (a) as "fails toward a capped command", citing the scan rule at `spec.md:2241-2246`. The predecessor's RULING 5 (`surface-commit-stranding-warning-rulings.md:149-172`) reversed that for the notice and called the lean "a property of the quote and the burn command — link 2a-iii-b's". The chain doc (`chain.md:568-572`) requires the rule stated per consumer.

**Recommendation: (b).** The old lean was written before RULING 5. Its premise was that the alternative to a capped command is an uncapped one. Under RULING 5 the alternative is no command for that selection, which is the safer of the two; (a) re-opens the exact double order the committed state exists to prevent, and flaps. The scan precedent protects a presentation that hides its own retry; this one shows Retry beside it.

---

## 4. Figure and string sweep against the served types

| Rendered or removed by this link | Source | On the wire? |
| --- | --- | --- |
| Committed statement (new string) | The view's derivation, one boolean | No figure. RULING 5: no figure, no countdown. The target is already named by `selection-facts` (`SpaceCommandPanel.tsx:240-244`). |
| Removal of `preview-arrival`, `preview-deltav`, `preview-fuel`, `preview-fuel-ceiling`, `preview-affordable`, `preview-stranding` | `preview` prop becomes null | Nothing rendered. |
| `burn-uncapped-label` hidden | `burnAvailable` | — |
| Order identity (not rendered) | `state.Burn.DepartMs`, `ArriveMs` | Yes, integers, on both the commit response and the own-fleets read through one DTO (`backend/fleet/handler.go:445-448`, `:610-644`; `frontend/lib/types/fleet.ts:49-50`). |
| Selection identity (not rendered) | `selectionKey` of the client's own selection | Never crosses the wire. `Target.BodyId` is not read, so `defect-point-burn-serves-empty-bodyid.md` is not built on. |
| Warned flag | `strandingWarning` on the response | Present only when true (`handler.go:447`); the panel already normalises it to a boolean (`SpaceCommandPanel.tsx:173`). |

**What is left in the command panel after the quote clears on a real commit.** By reading `SpaceCommandPanel.tsx:221-424`:

1. The `Course` label.
2. `selection-facts` (`Target <bodyId>` or `Target: a point in space`), and `gate-facts` when the target is a gate.
3. The committed statement (new).
4. The Burn control, disabled.
5. `commit-stranding-notice`, when the response was warned.
6. **`commit-drift-notice`, after every real commit.** `space.Burn` serves no `DeltaV` (`backend/space/burn.go:151` is a method), so `commit.deltaV` is undefined and `differs()` (`:112-115`) returns true. It renders the actual delta-v in the absent form, the actual arrival as a live `world-ms-span-in` figure that counts down as the clock advances, and either the previewed delta-v and previewed arrival or " — no quote had been shown" (`:357-409`).
7. The Jump control, when the fleet has a lane.

Consequences:

- **A scenario saying "no arrival, delta-v or fuel figure is shown" is false** on the real wire and in the view harness, whose order fixtures carry no `DeltaV` either (`SystemSpaceView.stranding-notice.test.tsx:245-262`). Old § 4 scenario 1 was worded that way. The scenarios in § 3 name the quote's elements instead.
- The panel does show an arrival countdown after a commit, inside the drift notice. The statement carrying none (RULING 5) is still right; the proposal should not claim the panel shows no figure.
- The drift notice persists in panel state until the next commit, whatever is selected (UX F6, link 4's). After this link it is the most prominent thing in the panel on the commonest flow. Not this link's to fix, and not fixable inside the chain (`drift-commit-response-carries-no-delta-v.md`); the proposal should say so.
- `SpaceCommandPanel.test.tsx` passes a `DeltaV` on its mocked responses (noted in the drift record), so panel tests do not see the notice unless they omit it.
- No proposed scenario is untestable because of it. The journey must key "quote gone" on the `preview-*` test ids.

Other strings on the path, unchanged: the success toast (`:171-172`), the two stranding strings (`:58-61`), the preview's stranding line, which still omits lane gates (`:308`).

---

## 5. Test files as they are now

### 5.1 Sizes

| File | Lines | Tests (`it`/`it.each` blocks) | Harness |
| --- | --- | --- | --- |
| `frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` | 990 | 24 | Real `use-fleets`, `use-burn-preview`, `use-actions`; `fleetService` mocked; `listMine`, `order`, `cutDrive`, `stop` settled by call index; fake timers; `mocks.preview` counts requests. Harness is lines 1-449. |
| `frontend/components/space/SystemSpaceView.burn-preview.test.tsx` | 924 | 22 | `useMyFleets`, `useCutDrive`, `useStop` mocked (`:74-97`); real `useOrder`. Cannot observe the gap or any end through a read. |
| `frontend/components/space/SpaceCommandPanel.test.tsx` | 943 | 46 | `useOrder` mocked; one `panel()` helper (`:115`). |
| `frontend/hooks/use-burn-preview.test.tsx` / `.call-site.test.ts` | 534 / 51 | — | No change. |

The harness the old analysis costed at two tasks and about 300 lines **exists** and already does everything this link needs: preview request counts, real cut drive and stop, a second fleet, a point trigger, remount on one client.

### 5.2 Existing tests that break

All in `SystemSpaceView.stranding-notice.test.tsx`. In each, the scenario text stays true; the arrangement does not.

| Test | Line | Why it breaks | Repair |
| --- | --- | --- | --- |
| 3.13 later unwarned commit | 797 | Clicks Burn again on the committed selection; the control is now disabled | Select `feat-body-0` first |
| 3.14 second warned commit | 813 | Same | Same |
| 3.15 rejected commit, two rows | 837 | Same; the cap row also needs a current quote, which only another selection has | Same |
| 3.16 control leg, two rows | 866 | Same, after an unwarned commit (the widened record) | Same |
| 3.17 distinct from the preview line | 890 | Reads `preview-stranding` after the commit on the committed selection; the quote is cleared | Select another body after the commit, with the preview mock still carrying the warning |
| 3.18 no-quote | 915 | Asserts `preview-no-quote` after the commit on the committed selection | Same |
| 3.18 stale | 931 | Asserts `preview-stale` after the commit on the committed selection | Same |

Not broken: 3.1–3.12, 3.18 "not requested", 3.19, 3.20, and the panel file's notice tests (`SpaceCommandPanel.test.tsx:886-900` passes `commitStrandingNotice` alone).

`SystemSpaceView.burn-preview.test.tsx`: no test asserts after a successful commit (`:709-711`, `:843-846`), so none breaks, but see § 1.7.

### 5.3 E2E specs that click Burn

Read at every `burn-button` use: `commit-stranding-notice-journey.spec.ts:164,173,210`; `burn-preview-journey.spec.ts:250,288,307`; `space-journey.spec.ts:171,202,243`; `scan-journey.spec.ts:408`; `vitals-strip-journey.spec.ts:416`; `space-double-submit.spec.ts:227,260,279-296,459`; `helpers/space-view.ts:456`; `new-user.spec.ts:108`.

- None clicks Burn twice on an unchanged selection while the first order runs. `space-double-submit.spec.ts:294-296` waits for docked and selects another body first.
- None reads a `preview-*` element between a Burn click and the next selection. `burn-preview-journey.spec.ts:250-270` re-targets to the station before asserting figures; `:281-288` selects the lode after arrival, where the order is no longer running.
- The predecessor's journey asserts Burn enabled after the cut (`:210`); the committed state has ended by the read that makes the row say Drifting, and the assertion auto-waits.

Expected edits: none. That is a selector-level reading; the first gate run is the real check.

### 5.4 Each derivation and the test that observes it at its home

| Derivation added or moved | Home | Observing test |
| --- | --- | --- |
| The record kept for every accepted commit, with warned flag and selection key | `SystemSpaceView.tsx` handler | View harness: scenario 1 (unwarned commit enters the state); existing 3.16 (an unwarned record shows no notice, including in its gap) |
| `selectionCommitted` = (gap or still running) and selection key equal | `SystemSpaceView.tsx` render | View harness: scenarios 1–9, 11–14, 18 |
| The notice's new warned-flag term | `SystemSpaceView.tsx` render | View harness: scenario 19 and existing 3.13, 3.16 |
| The new term of `previewWanted` | `SystemSpaceView.tsx` | View harness, by `mocks.preview` call counts over real `useBurnPreview`. A panel test cannot see it. |
| Click-time selection in the callback payload | `SpaceCommandPanel.tsx` | Panel test (the selection prop changed by a re-render before the response); view harness scenario 13 |
| Statement, disabled term, label suppression | `SpaceCommandPanel.tsx`, from one prop | Panel test |
| Nothing moves out from under a test | — | `use-burn-preview.call-site.test.ts` stays as is |

A test that hand-sets the committed prop on the view, or mocks `useMyFleets`, observes an arrangement and not the derivation.

---

## 6. Task estimate

Unit: one task per test arrangement group (predecessor RULING 12). Rows of one parametrised arrangement with one closing assertion are one task.

| Group | Tasks | Notes |
| --- | --- | --- |
| View harness | 1 | Either extend the existing file (rename it for two consumers) or extract its fixtures and settling helpers and add a sibling file. Architect's call; one task either way. |
| View tests, the committed state | 19 | Scenarios 1–19, one each; 6, 7, 14, 15, 18 are parametrised |
| Panel tests | 3 | Statement, disabled and label from the prop with its false/omitted control leg; the callback's click-time selection; the statement's copy (scenario 20) |
| Repairs to existing tests | 2 | The four "second Burn" tests; the three "quote state on the committed selection" tests |
| Implementation | 5 | Panel payload; panel presentation; view record and handler; view derivation, flag term and prop; diff-confirm the fences |
| Records | 3 | Close `drift-preview-does-not-clear-on-commit.md`; chain doc row and Taught; note the second consumer in `followup-warned-commit-without-burn-instants.md` and the committed statement in `followup-explain-withheld-burn-command.md` |
| Validation and gate | 7 | Per-commit gate with a verifying run of the other view files; QA names closing assertions; journey spec; tier 4; tier 3; reconcile, strict validate, archive rehearsal; post-archive Purpose check |
| **Total** | **40** | Range 38–42. Q1 option (a) adds 2. |

The three MODIFIED blocks add no test tasks if the two enumerating scenario bodies in each are left byte-identical, as recommended.

**This is on the cap before the panel**, and each of the last four links' panels added tasks.

**If it exceeds 40.** I looked for a seam and do not recommend one:

- *Hold first, clear second* (the burn command unavailable with its statement in one link; the fourth withheld state in the next). It is the only order that ships nothing unsafe. But the first half leaves a live quote and ceiling beside a disabled Burn and leaves the link's named clause still false, and the second half re-walks every end path to assert request counts: about 15 tasks including its own 7 of validation and two gate runs, for one boolean term.
- *Clear first* is UX F2's hazard and is ruled out by RULING 5's own basis.
- *Single-fleet lifecycle first, attribution second* (scenarios 12–14, 16, 19 later). The record is already per fleet and click-time by construction, so the split would ship those behaviours built and unspecified, which the chain's Taught record calls an unspecified feature.

Plainly: **a fourth split of this sub-chain is not worth a chain link.** If the panel pushes the count over, shed named scenarios to filed follow-ups outside the chain, in this order: scenario 16 (follows from the handler not running on error, already guarded for the notice by 3.15); scenario 18's remount row (the already-burning row keeps RULING 4 tested); scenario 9 (a special case of 8 in the gap). That is three tasks of room and no more.

---

## 7. Open questions

### Design choices

**Q1. The failed-own-fleets-read rule for the command and the quote.** Left open by the rulings ledger (`clear-burn-preview-on-commit-rulings.md:243-249`). Options, costs and leans are in § 3. Recommendation (b); not ruled here.

**Q2. The committed statement: copy, placement, and whether it is the Burn control's accessible description.**
- Copy: no recorded lean beyond RULING 5 ("carries no figure and no countdown", `rulings.md:180-182`) and UX F2's "a persistent committed-to-this-target line" (`lift-burn-preview-to-view-panel-ux.md:49`).
- Placement: no recorded lean for this element. The notice was placed below Burn (predecessor RULING 8); the statement replaces the quote, which sits above it.
- Accessible description: the only recorded lean is the out-of-chain principle "the reason is the control's accessible description" (`followup-explain-withheld-burn-command.md:13-16`). This would be the first unavailable state on this control with a stated reason. Wiring it for one state is not absorbing the follow-up, but it sets its precedent. UX to recommend.

**Q3. *Double-Submit*: MODIFIED, or a recorded reading like RULING 6?** The chain doc (`chain.md:637-639`) and RULING 5's reversal cost (`rulings.md:198-199`) both presume MODIFIED. A recorded reading would save a block with four carried scenarios, on the argument that "initiates a new command" is not satisfied by a control the player cannot activate. Recommendation: MODIFIED, as presumed; adversary m4 of the predecessor asked for exactly this to be stated in the delta. Architect to confirm, with RULING 6 still provisional on the same reviewer.

**Q4. What the handler stores when the own-fleets query has no state.** Today `undefined`, which holds the gap open forever (§ 1.7). Recorded lean: the archived design.md Risks, "harmless today because no existing test in those harnesses commits a warned burn" — a premise widening removes. Options: store `null` (no gap) when there is no query state, or leave it and record the trap. Unreachable in production either way. No lean for the widened case. Architect.

**Q5. The predecessor's clause "its appearing or removal SHALL NOT remove, disable or re-order the burn command control" (`spec.md:3114-3117`).** True of the notice's own contribution; but a warned commit now shows the notice and a disabled Burn in the same render. Options: a recorded reading plus one sentence in the ADDED requirement saying the control's availability is this requirement's; or MODIFIED with 25 scenarios carried verbatim. Recorded lean: `chain.md:573-577`, "a clause about a new surface may only say what that surface contributes", which supports the reading. Recommendation: the reading. Scenario 19 is the row that shows the two together.

**Q6. An accepted response lacking a burn instant.** For the notice this is unspecified and filed (`followup-warned-commit-without-burn-instants.md`; RULING 13 revised RULING 10's "gap only"). With the widened record the same response gives the command a gap-only hold by construction. Recommendation: leave it unspecified here too and add the second consumer to that follow-up. Unreachable on the real wire (`backend/fleet/service.go` builds the burn on every accepted order, per the archived design.md Decision 7).

**Q7. The committed selection while the canvas is unavailable.** Burn is disabled by the canvas rule anyway. Whether the committed statement is shown beside `canvas-required-notice` is unstated. No recorded lean anywhere. Small; UX.

### Needs information nobody in the repo has

**N1. Whether the commit response's burn instants equal the own-fleets read's on a real backend.** Closed only by code reading and at tier 1 (`followup-stranding-notice-untested-on-real-wire.md`). This link's journey observes it for the first time: if they differ, the committed state ends at the first read and the quote comes back about one round trip after the commit. Journey steps 2–3 are the observation. Needs the gate run.

**N2. Whether a preview from a drifting fleet (after a cut) solves or is transiently refused.** Decides whether the journey may assert figures after the cut. The mine-end path has a known transient refusal (`followup-explain-withheld-burn-command.md:66-72`); nothing records the cut-drive path. Needs a stack observation.

**N3. Whether the drift notice really renders after every real commit.** `drift-commit-response-carries-no-delta-v.md` is "not verified on a running stack". The journey can log `commit-drift-notice`'s presence without asserting it, which would settle the record's status.

**N4. What the design canvas shows for the post-commit panel.** RULING 5 records a re-read (progress, no quote, no Burn for the flown-to target). The mock is a claude.ai artifact I cannot read; if UX wants the statement's placement from it, the orchestrator has to read it.

### One thing to say out loud in the proposal, not a question

After every arrival at the selected body the panel goes from "an order is committed / Burn unavailable" to the docked-at-target state: an enabled Burn under the uncapped label, which ends in the zero-length 500. The end state is today's; the contrast is new. It is `followup-explain-withheld-burn-command.md`'s (deliberately out of the chain) and must not be absorbed.

---

## 8. Journey outline (one spec, tier 4, world scale 5)

Keyed on the command panel (`preview-panel`), never on the roster row, except where a row reading is named as a fixture precondition. Carries the `[journey-console]` capture with the update-depth check as a hard `afterEach`, records every `orders/preview` and `orders` POST with a timestamp, and logs each snapshot's index before asserting.

Fixture: one fresh corporation, provisioned once. Target: a far mineable body chosen from the captured interior, as `burn-preview-journey.spec.ts` does, so the flight outlasts the windows below. A fresh spawn is a point park, so the first order is not zero-length.

1. **Quote.** Select the body. The four quote figures are present by `data-raw`; Burn is enabled. *(Burn Preview Reflects…)*
2. **Commit.** Click Burn; wait for the order response to be OK. In the panel: the six `preview-*` elements have count 0; the committed statement is visible; Burn is disabled; `burn-uncapped-label`, `preview-no-quote`, `preview-stale`, `preview-retry` have count 0. Log whether `commit-drift-notice` is present (N3). *(ADDED: entry and gap.)*
3. **No request while committed, across the first read.** Wait, as a polled condition, for two preview intervals plus slack of wall time. Zero preview POSTs for that selection since the order response; the statement still visible throughout; order POST count still 1. Fixture precondition: the row still reads under way at the end of the window; otherwise the leg is unreachable at scale 5 on this spawn and is reported as such. A red here with the statement gone at the first read is N1. *(ADDED: definition; Double-Submit.)*
4. **Re-target and back.** Select a second body: a preview POST goes out, figures render, Burn is enabled, the statement is gone. Select the first again: figures gone, statement back, no preview POST for it. *(ADDED: not a dead end; live re-target scenario.)*
5. **Cut the drive.** Click the fleet panel's cut-drive control. The statement goes; one preview POST for the kept selection follows within less than one interval of the statement's removal; Burn is enabled. Log, and do not assert, whether figures or the no-quote state follow (N2). *(ADDED: the end; the resume rule.)*
6. **Commit again and arrive.** Burn to the same body; fixture precondition: row under way. Wait for the row to read docked. Then: statement count 0, quote figures count 0, no preview POST across one interval, Burn enabled. *(ADDED: hand-over to the docked-at-target state.)*
7. **Reload mid-burn (optional leg).** Commit toward another body, reload while the row reads under way, select the flown-to body: a preview POST goes out and no statement is shown. *(RULING 4's stated limit.)* If the flight is too short at scale 5, record the leg untested, never passing.

Not in the journey: the failed read, an order from elsewhere, two fleets (a spawn has one), a point target, and the stranding leg (no fixture; still untested on the real wire).

---

## 9. Change structure, design decisions, fences, out of scope

**Structure.** One change, `clear-burn-preview-on-commit`. No split (§ 6).

**Decisions worth a design.md.**

- The record widened to every accepted commit, with the warned flag and the click-time selection key; one derivation, two readers.
- The selection identity is the client's own key, and why target match stays rejected (RULING 4).
- The failed-read rule per consumer (Q1).
- The flag term's ordering relative to the hook, and that the hook needs no edit.
- What the query-state-absent case stores (Q4).
- The statement's element, placement and accessible wiring (Q2).
- The table of every live requirement checked with its verdict, and the table of every edited carried body.
- The seven re-arranged predecessor tests, with the statement that their scenarios are unchanged.
- BREAKING: the burn command withdrawn for a committed selection.

**Scope fences, each checked against its stated cause.**

| Fence | Cause | Still holds? |
| --- | --- | --- |
| No backend field, endpoint or query | Every needed value is served | Yes. Identity and warned flag are on the wire; the selection never leaves the client. |
| No galaxy-view work | Out of the chain | Yes. `useOrder` has one caller; `use-fleets.ts` is not edited. |
| No palette or type changes | Vocabulary is fixed | Yes, if the statement uses the panel's existing 11px line treatment. |
| No client-side affordability or shortfall arithmetic | Go decides | Yes. The link removes figures; it computes none. |
| The link deletes what it replaces | No coexistence | The warned-only delete branch and the `WarnedOrder` name go. Nothing else is replaced. |
| U1–U10 neither built on nor retro-specced | Unadjudicated | Yes. The two `wallMsUntil` call sites (`SystemSpaceView.tsx:193`, `:592`) are untouched and no clock term is added. |

**Out of scope, to record in the proposal.**

- Stating why Burn is unavailable in the three earlier withheld states, and withholding it when docked at the target (`followup-explain-withheld-burn-command.md`).
- The fuel gauge overlay (2a-iv).
- The drift notice, its lifetime and the unserved actual delta-v (link 4; `drift-commit-response-carries-no-delta-v.md`).
- The empty `BodyId` on a point burn (`defect-point-burn-serves-empty-bodyid.md`).
- The stop command's stranding warning (`drift-stop-stranding-warning-not-rendered.md`).
- The zero-length 500, including the point-arrival case.
- A response lacking a burn instant (`followup-warned-commit-without-burn-instants.md`).
- A burn this view did not commit reading as committed (RULING 4: it does not).
- Any backend change; the galaxy view.

**Files read for this refresh (absolute).**

- `/Users/travis/Projects/hexaverse/docs/plans/system-hud/chain.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/clear-burn-preview-on-commit-analysis.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/clear-burn-preview-on-commit-rulings.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/surface-commit-stranding-warning-rulings.md` (5–8, 12)
- `/Users/travis/Projects/hexaverse/docs/handoffs/surface-commit-stranding-warning-impl-contract.md` (§§ 2, 3, 10)
- `/Users/travis/Projects/hexaverse/docs/handoffs/surface-commit-stranding-warning-journey.md`
- `/Users/travis/Projects/hexaverse/openspec/changes/archive/2026-10-04-surface-commit-stranding-warning/design.md`, `tasks.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/drift-commit-response-carries-no-delta-v.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/defect-point-burn-serves-empty-bodyid.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/drift-preview-does-not-clear-on-commit.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/followup-explain-withheld-burn-command.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/followup-warned-commit-without-burn-instants.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/followup-stranding-notice-untested-on-real-wire.md`
- `/Users/travis/Projects/hexaverse/docs/handoffs/lift-burn-preview-to-view-adversary-r1.md` (B1, M5, m4)
- `/Users/travis/Projects/hexaverse/docs/handoffs/lift-burn-preview-to-view-panel-ux.md` (F2)
- `/Users/travis/Projects/hexaverse/docs/handoffs/lift-burn-preview-to-view-panel-architect.md` (A1, A4)
- `/Users/travis/Projects/hexaverse/docs/testing-tiers.md`
- `/Users/travis/Projects/hexaverse/openspec/specs/system-space-view/spec.md` (478–1021, 3037–3293)
- `/Users/travis/Projects/hexaverse/openspec/specs/fleet-roster/spec.md`, `system-console/spec.md`, `docked-fleet-actions/spec.md`, `figure-formatting/spec.md` (grepped, passages read)
- `/Users/travis/Projects/hexaverse/frontend/components/space/SpaceCommandPanel.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SystemSpaceView.tsx`
- `/Users/travis/Projects/hexaverse/frontend/components/space/space-selection.ts`
- `/Users/travis/Projects/hexaverse/frontend/hooks/use-fleets.ts`, `use-burn-preview.ts`
- `/Users/travis/Projects/hexaverse/frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` (whole)
- `/Users/travis/Projects/hexaverse/frontend/components/space/SystemSpaceView.burn-preview.test.tsx`, `SpaceCommandPanel.test.tsx` (test lists and commit paths)
- `/Users/travis/Projects/hexaverse/frontend/e2e/tests/commit-stranding-notice-journey.spec.ts`, `burn-preview-journey.spec.ts`, `space-journey.spec.ts`, `space-double-submit.spec.ts`, `scan-journey.spec.ts`, `vitals-strip-journey.spec.ts`, `/Users/travis/Projects/hexaverse/frontend/e2e/helpers/space-view.ts`
