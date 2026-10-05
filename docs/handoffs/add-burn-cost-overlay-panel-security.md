# `add-burn-cost-overlay` — spec-phase security review (panel)

Reviewed at `d965f5d` plus the untracked change directory: `proposal.md`,
`tasks.md`, `specs/system-console/spec.md` (2 ADDED, 15 + 19 scenarios; there is
no `design.md`). Code read, nothing run: no suite, no stack.

**Verdict: SECURITY-CLEAR.** No BLOCKER, no MAJOR. The proposal's "no security
surface" claim holds on every axis asked. One MINOR (S1): a wording
contradiction in the one clause that touches an existing control. It names no
attacker; it is routed to the spec writer because the control it touches is the
fuel ceiling.

## The claim, tested

| Question | Result | Evidence |
| --- | --- | --- |
| New endpoint, input, read, persistence, dependency | None | Proposal Impact; tasks sections 1-5 edit `Gauge.tsx`, `VitalsStrip.tsx`, `SystemSpaceView.tsx` only; task 5.1 is a static guard on one preview call site and no hook import in strip or gauge |
| Can the overlay render another corp's fleet's quote | No | `acting` is `allFleets.find(...) ?? here[0] ?? null` over `useMyFleets()` (`SystemSpaceView.tsx:258,303-309`); the preview route is own-gated server-side before any solve (`backend/fleet/handler.go:236-268`, comment at `:244-247`), so a foreign fleet id yields no quote to draw even from a mis-wired caller |
| Cross-fleet leak on acting-fleet switch | No | The quote's query key is `(fleetId, selectionKey)` (`lib/query-keys.ts:60-61`, `use-burn-preview.ts:58`) with `gcTime: 0` and no `placeholderData`, so the new key has no data until its own response lands. Both fleets are the requester's own in any case. Pinned by "Switching the acting fleet never shows the previous fleet's cost" and task 4.5 |
| Cross-selection leak on selection replace or clear | No | Same key and `gcTime: 0`; on disable the query is cancelled and removed (`use-burn-preview.ts:84-91`). Pinned by "Replacing the selection never shows the previous target's cost", "Clearing the selection withdraws the overlay" and task 3.4 |
| Served value placed in the DOM in a new place | Nothing that matters | The new state attribute is a two-token closed set copied from a boolean, and the spec refuses a non-boolean ("A flag that is not a boolean draws no overlay"), so no served string reaches an attribute. The same flag is already in the DOM as the panel's `data-affordable`. The extent width is a number gated finite and non-negative, written through React's style object like the fill (`Gauge.tsx:97`), so a malformed `fuelCostTons` cannot inject CSS. No `data-raw`, no numeric attribute, no text (RULING 12; "The extent exposes no figure and no control"). No `dangerouslySetInnerHTML` under `components/space` |
| Fog / audience contract (`acting: Fleet \| null`) gains a consumer | No new consumer of the type hole | The strip gets cost and flag only, never a `BurnPreview` (tasks section 2 header, 2.5, 5.2); the extent's denominator is the owner-only `roster.cargoCapacity`, absent for `own: false` (`handler.go:697`), which gives a no-data gauge and so no extent ("A gauge with no data draws no overlay"). The 2a advisory stays where it is, on link 2b; see the note below |
| Weakens double-submit, quote-lock, stale-never-a-cap | No | `SpaceCommandPanel.tsx` and `use-burn-preview.ts` are not edited (proposal, tasks section 5). The overlay reads the same `currentQuote` (`SystemSpaceView.tsx:793`) that already feeds the ceiling (`SpaceCommandPanel.tsx:148`), and task 3.3 fails a reader of the raw `burnPreview.preview`. A stale quote is withdrawn, never kept (RULING 5). See S1 for the one wording problem |
| DoS / request amplification | No | "The overlay is silent and costs no request" plus task 5.1 |
| Secrets, tokens, `NEXT_PUBLIC_*`, logs | None touched | Frontend presentation only |

## S1 (MINOR) — the overlay/ceiling biconditional contradicts the content requirement

Clause (lifetime requirement):

> The overlay and the burn command's fuel ceiling are two readers of that one
> determination: each SHALL be present exactly when the other is.

It is false as written in three states the content requirement itself creates,
where a current quote exists (so the ceiling is present, `SpaceCommandPanel.tsx:148`)
and no overlay is drawn: a gauge with no data (Q2 as drafted: a dry fleet with a
selected target), a non-finite or negative `fuelCostTons`, and a non-boolean
`affordable`.

Why it is filed here: the ceiling is the `maxFuelTons` slippage cap sent with
the commit. A developer or a later link that reads the biconditional as binding
has two ways to make it true: draw an overlay on a no-data gauge (breaks Q2), or
withhold the ceiling whenever the overlay is not drawn, which commits a dry or
odd-quote burn with no cap. The second is unlikely here, since the panel is not
edited in this link, but link 2b and link 4 both rework that panel and inherit
this sentence. No attacker action; the exposure is the player's own order
losing its cap. The server still decides affordability.

Smallest fix, paste-ready replacement for that one sentence:

```
The overlay and the burn command's fuel ceiling are two readers of that one
determination. The overlay SHALL NOT be drawn while the ceiling is absent, and
WHILE the ceiling is present the overlay SHALL be drawn unless the content
requirement draws none (a gauge with no data, a cost that is not a finite
non-negative number, or a flag that is not a boolean). This requirement SHALL
NOT make the fuel ceiling's presence depend on whether an overlay is drawn.
```

And one scenario under the lifetime requirement:

```
#### Scenario: A current quote with no overlay still carries its fuel ceiling
- **GIVEN** a current quote for the selection, and an acting fleet whose
  served cargo pool carries no `fuel` entry
- **WHEN** the view renders
- **THEN** no overlay is drawn
- **AND** the burn command's fuel ceiling is present, derived from that quote
```

The existing scenario "The overlay and the fuel ceiling are present together"
stays true under the new sentence and needs no edit (its fixture has a
data-bearing gauge).

## Note for link 2b (not a finding against this change)

The 2a advisory (`add-vitals-strip-security-audit.md`; chain.md "Inherited from
2a's security audit") grows by one element. When 2b mounts the strip against an
arbitrary selected entity, its deny scenario should also cover the overlay:
a fleet the requester does not own renders the absent form, no gauge segments
**and no cost extent and no extent state attribute**. Today that follows from
the no-data rule; 2b should assert it. Task 6.9 already carries a forward flag
into 2b's "read first"; this can ride with it.

## Not checked

No test was run and no stack booted, by instruction. The backend own-gate on
the preview route was read at the handler comment and call site, not traced
through `PreviewOrder`; it is existing behaviour this change does not touch.
