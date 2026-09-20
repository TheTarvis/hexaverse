# Link 7 `add-fuel-as-cargo` — implementation contract + orchestrator rulings

Two SDETs wrote the red suite against disjoint trees and, with no shared contract,
independently assumed DTO shapes. The spec pins *behaviour*, not JSON field names —
correctly, that is the right altitude — so these are implementation decisions, and this
file settles them. **Developers build to this; it is authoritative over either SDET's
in-file assumptions.**

## The wire contract (frontend SDET's names win; backend probes are shape-agnostic)

The backend SDET deliberately used `fieldAnywhere` / `keySet` probes rather than
asserting DTO placement, precisely so this could be settled later. The frontend tests
are concrete and already written against real components, so their names are adopted:

- **Fleet read, owner-only block:** `estimatedRange: number`, `stranded: boolean`,
  `fuelPricePerTon: number`. Held fuel rides the existing `cargo` map as `cargo.fuel`.
- **Burn commit response only:** `strandingWarning?: boolean`. NOT on the ordinary read
  — the read carries `stranded` instead, which is the persistent indication.
- **`POST /v1/fleets/:fleetId/refuel`** — request `{ tons, operationKey }`, response
  `{ cost, cargo, balance, worldTime }`.
- **Client seams:** `lib/services/market-service.ts` gains `.refuel()`;
  `hooks/use-market.ts` gains `useRefuel`; new `components/board/RefuelSection.tsx`;
  `FactsPanel` gains `onRefuel` and `lastRefuelCost` and gates on the existing
  `stationQuotes !== null` signal rather than a new prop.

## RULING 1 — `action.CommitSpec.ActorStateFunc`: accept the SDET's shape

`func(map[string]interface{}) (map[string]interface{}, error)`. design.md names the
capability but no Go identifier, so this was a genuine gap. The shape satisfies all
three properties design.md requires — it takes the transactional read as input, it can
**veto by returning an error** (aborting the commit whole), and when supplied it wins
over the static `ActorState` map. A developer may rename it only if the three properties
survive; the test is the contract for the properties, not for the spelling.

## RULING 2 — the reserved-`fuel` resource kind: guard the CONSTANTS, do not invent a config surface

The requirement's scenario says generation is "invoked with a resource-kind
configuration that includes `fuel`". **No such configuration exists.** The six kinds are
hardcoded constants (`backend/system/model.go:57-62`) and `Generate` returns no error at
all (`generator.go:30`). Implementing the scenario literally means inventing a
`GenerationParams.ResourceKinds` field, changing `Generate`'s signature, and threading an
error through every caller — substantial scope for a namespace guard.

The requirement's own body states the actual intent: *"no generation path today produces
`fuel` as a resource kind, and this requirement exists to keep it that way as a **tested
invariant rather than an accidental absence**."*

**Ruling: implement it as a package-level guard over the declared constants.** A
`system` test asserting no declared `ResourceKind` equals the reserved name, plus a
`system.ReservedFuelResourceKind` constant the guard reads. That delivers the stated
intent exactly, costs one test and one constant, and changes no signature.

**The scenario must be reworded to match** — it currently describes a mechanism that
cannot exist. This is a narrow, adjudicated clarification, not a re-opened design
question; it does NOT reset the adversary verdict for the rest of the change.

## RULING 3 — a real production defect the frontend red phase found, and it must be fixed here

`frontend/components/board/FactsPanel.tsx`'s `HoldReadout` evaluates
`RESOURCE_ACCENT[kind].meter` for every cargo key. `fuel` is deliberately **not** a
`ResourceKind`, so it has no `RESOURCE_ACCENT` entry — and fuel-as-cargo puts `fuel` in
that exact map. **Every docked-fleet panel crashes the instant a fleet holds any fuel**,
which after spawn starting fuel is immediately. Reproduction is already red at
`FactsPanel.test.tsx: "does not crash when a docked fleet's cargo includes fuel"`.
This is in scope: the change creates the condition.

## Honest gaps in the red suite — carry these into the QA gate, do not paper over them

The backend SDET disclosed these rather than hiding them, and they are the acceptance
risk for this change:

- **Two "no-warning" scenarios are vacuous passes today** (asserting the absence of a
  field that does not exist at all yet). They become meaningful only once the positive
  warning path lands — QA must re-run them AFTER the green phase and confirm they still
  discriminate.
- **Not automated:** a fuel cost exactly equal to available fuel (needs a fake clock on
  `fleet.OrderTo`); a candidate reachable only below the ceiling suppressing the warning;
  the served fuel price on the fleet read; rounding/misconfiguration/overflow guards
  (`FuelParams.PricePerTon` is a compile-time constant with no runtime seam); and
  "rejection copy distinguishes this-burn-unaffordable from no-burn-affordable".
- **A transport-retry double-submit** cannot be induced without a live backend; it was
  decomposed into the (already-correct) shared transport mechanism plus one-key-per-attempt.
- The spawn reachability sample is **8 accounts**, smaller than a real tuning validation.

## Reminders that cost this chain real time already
- Backend suite: **always `-p 1`**. The root `TestMain` wipes the shared emulator project
  while Go runs packages in parallel; without it you get ~18 phantom failures.
- `fixtures/determinism-register.json` is **line-numbered**. Inserting code above a
  registered site silently breaks `check.py`'s determinism checks; re-locate by grep and
  update the entry, do not "fix" the code.
- Never run Playwright while backend emulator tests are running — one shared project.
