# add-figure-formatting — security panel review

Reviewer: `openspec-security`, 2026-09-08. Read-only; this file was persisted by
the orchestrator from the reviewer's verbatim output (the agent has no write
tools).

## Verdict: SECURITY-CLEAR — no security surface

No BLOCKER, no MAJOR, no MINOR security findings. The change adds no endpoint, no
query, no auth path, no input handling, no storage, and no dependency (verified:
`tasks.md` has zero install/fetch/token/storage tasks across its 40 items). Both
questions the orchestrator flagged were examined and both resolve as no-finding,
with evidence below.

---

## Question 1 — does `data-raw` disclose anything the rendered copy does not? **No.**

Four independent reasons, each verified.

**1. The DOM is not a trust boundary below the response.** Every value reaching
`data-raw` is a field of a JSON response this client already received over
`apiClient` with its own Firebase token, or a client-side product of two such
fields (`refuel-cost-preview` = `refuelTons * fuelPrice`; `preview-fuel-ceiling`
= `fuelCostTons * BURN_FUEL_ALLOWANCE`, a constant already in the shipped
bundle). An attacker holding this DOM holds the network tab. Rounding was never
withholding anything.

**2. Fog filtering is server-side, and precision is not a band.** `observation`'s
bands decide *whether* a field is served (`.WithFog(...)` on the
galaxy/system/fleet handlers; a foreign fleet outside the live union 404s). They
do not quantize. There is no band whose secret is "the digits after the second
decimal."

**3. The one place precision could plausibly have mattered for fog is out of
scope and gains no attribute.** The only foreign-entity figures on these surfaces
are `contact-facts` bearing and speed, computed client-side from `mark.velocity`
at `frontend/components/space/SpaceStage.tsx:663-664`. RULING 10 keeps them on
`toFixed` and out of this change, so they receive no `data-raw`. The one duration
figure that *does* move onto the formatter, `FleetFacts`'s `Arrives in …`
(`SpaceStage.tsx:757` mount, `:807` definition), is mounted only over the `fleets`
array — own fleets — never over `contacts` (compare `SpaceStage.tsx:722` with
`:641`). Audience fog exempts own fleets by design. So no fog-filtered foreign
figure acquires a raw attribute anywhere in this change.

**4. Sighting `asOf` is a precision *decrease*, not an increase.**
`SightingLog.tsx:70` renders `{record.asOf}` as a bare world-ms text node today;
`SpaceStage.tsx:697` renders it in an sr-only label and `:709` in
`sighting-facts`. RULING 9 moves that same value from a text node into an
attribute at the same precision while the *visible* text drops to minute
resolution. Net DOM information is unchanged; net visible information is lower.
And it is the requesting corporation's own pile in the first place. The
`sighting-log` delta additionally scopes the rule tightly — "this presentation
rule applies to `asOf` alone" — so the served raw host id gains no attribute and
the fog surface is untouched.

**Adjacent checks, all clean:**

- **Next.js cache trap:** all six touched components carry `'use client'`
  (`SpaceCommandPanel.tsx:1`, `FleetActionsPanel.tsx:1`, `SightingLog.tsx:1`,
  `ScanControl.tsx:1`, `FleetRoster.tsx:1`, and `SpaceStage.tsx`). No figure
  enters a server-rendered, route-cacheable HTML payload, so there is no path to
  one corporation's figures being served from a shared cache to another.
- **XSS:** every `data-raw` is `String(number)` into a React attribute; React
  escapes attributes and text nodes. `grep -rn dangerouslySetInnerHTML
  frontend/components frontend/lib` returns zero hits. The design's `<Figure>`
  element introduces no new HTML sink.
- **Secrets:** no token, session, account id, or `NEXT_PUBLIC_*` value is in the
  formatted set — the analysis §0 table enumerates every figure and all are
  numeric quantities.

## Question 2 — is the NaN fix masking anything? **No.**

Today's defects confirmed: `SpaceCommandPanel.tsx:79`'s `fixed()` returns `—`
only for a non-`number` type, so a genuine `NaN` reaches `NaN.toFixed(2)` and
renders the literal `NaN`; `FleetActionsPanel.tsx:71-77`'s `countdown()`
propagates `NaN` through `Math.max(0, NaN)` to render `NaN:NaN`.

RULING 13 collapses `undefined`/`null`/`NaN`/non-finite into one `—`. That
collapse is safe because **no formatted figure gates any control.** The
affordability state comes from the served boolean, not a rendered number
(`SpaceCommandPanel.tsx:169`: `const unaffordable = !!preview && !preview.affordable`),
and the submit guards at `:272` and `:293` key on selection/canvas/fleet/
`mineRunning`, never on a figure. The commit-drift comparator `differs()`
(`SpaceCommandPanel.tsx:82-85`) returns `true` when either side is not a
`number`, so an absent value fails *toward* showing the drift notice — that
conservative direction is unchanged by this change, which touches presentation
only.

The distinction the collapse does erase — "server sent nothing" vs. "server sent
something unparseable" — is display-only and consequence-free. In the one place
it carried real meaning, this change *restores* the distinction rather than
losing it: `FleetRoster`'s `?? 0` currently renders a dry-looking `0t fuel` for
an unavailable roster, and the proposal names its replacement with `—` as a
behaviour fix, not formatting. The spec also preserves the diagnostic hook: *"An
absent figure carries no raw attribute — never `NaN` or `0`"*, so `data-raw`
present-vs-absent remains a clean signal that a served value existed.

## One non-security observation, referred onward

`design.md`'s `<Figure>` takes `{ raw, unit, format }` where `format` may be "the
pre-formatted string," while the enforcement mechanism (Decision: the `/check`
changed-file validator) greps for `.toFixed(` and local `countdown`/`formatEta`.
A call site could therefore still interpolate a raw number into a template string
and hand it to `<Figure>` as pre-formatted, satisfying the validator while
violating R12's *A Player-Facing Figure Is Produced Only By the Shared
Formatter*. This enables no attack and is not a security finding — it is a hole
in R12's structural enforcement.

**Orchestrator's disposition:** carried into
`add-figure-formatting-panel-consolidated.md` as a MAJOR against the writer, not
deferred to the adversary. A stated requirement whose only enforcement mechanism
has a documented bypass is a spec defect the panel found; sending it to the
adversary instead would be routing a known finding to a later gate.
