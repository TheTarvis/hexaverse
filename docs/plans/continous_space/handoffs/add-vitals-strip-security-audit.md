# `add-vitals-strip` — implementation security audit (commit `b6e83a1`)

Persisted by the orchestrator from the security reviewer's returned text; the
reviewer is read-only by role and does not write files. Spec-phase verdict was
SECURITY-CLEAR with two MINORs; this is the code audit of what was built.

**Verdict: SECURITY-CLEAR.** No BLOCKER, no MAJOR, no MINOR against this change.
One advisory carried forward to link 2b.

The commit touches no `backend/`, `infra/` or `claude-agent/` file, adds no
dependency (no `package.json` or lockfile in the diff), and introduces no
endpoint, service call or query.

## 1. Spec-phase MINOR 1 — the owner-only qualifier landed, and is enforced three layers deep

The requirement now reads (`specs/system-console/spec.md:459`): "the acting
fleet's — **always an own fleet** — used capacity, total capacity and free
hold, each derived from that fleet read's **owner-only roster fields**".

- `VitalsStrip.tsx:242` — `const roster = acting?.roster`; the hold and fuel
  cells read only `roster.cargo`, `cargoCapacity`, `freeHold`,
  `estimatedRange`.
- `SystemSpaceView.tsx:282` — `acting` is drawn from `useMyFleets()`, so it is
  set-membership-bound to the requester's own served fleets. No sighting- or
  interior-derived entity can become `acting`.
- `backend/fleet/handler.go:697` — `rosterFieldsFor(f, own, …)` returns `nil`
  when `!own`, so a foreign fleet's DTO carries no roster at all. Even a
  mis-wired caller renders the absent form, not another corp's tonnage.

## 2. Chevron membership — server-side projection, no ship-and-hide

`VitalsStripFleetCell.tsx:74` takes `ownedFleets` straight from `useMyFleets()`
→ `GET /v1/fleets?mine=true`. There is no broader list narrowed in the
component. Menu labels render only own-fleet ids and system names; `choose()`
delegates to the view's existing `selectFleet` and does nothing else.

## 3. `useCorporationSessionOptional()` — non-throwing, no widened scope

`corporation-provider.tsx:68-74` is a pure `useContext` read returning
`{ corporation: ctx?.corporation ?? null, isError: ctx?.isError ?? false }`.
No query, no new key, so it cannot reach data the provider did not already
hold — and the provider's single read is `GET /v1/corporations/me`, resolved
server-side from the caller's own token. The no-provider default is the
conservative one, producing "Unavailable" rather than failing open. It does not
touch `needsWake`, so corplessness is not converted into a resolved session.
Deny-path tests exist at `corporation-provider.test.tsx:152` and `:184`.

## 4. Nothing shipped-and-hidden

A prop-by-prop inventory of `VitalsStripProps` found nothing passed and filtered
in-component: no cargo pool, sighting pile or interior feature list crosses the
boundary. `VitalsStripPill` receives no `Fleet` at all. `Gauge` is `aria-hidden`
and carries no `data-raw`, so it adds no figure to the DOM. `FleetActionsPanel`
now renders strictly *less* than before — `credits`/`held`/`freeHold` are
retained as props for refuel and sell arithmetic only, never emitted.

No secret, token, key or `NEXT_PUBLIC_*` string in the added lines.

## Advisory carried forward to link 2b

`VitalsStripProps.acting: Fleet | null` (`VitalsStrip.tsx:36`) is **not**
own-ness-constrained at the type level. Today the fog contract holds because the
caller is disciplined and the server omits `roster` for `own: false`. Link 2b's
selected-entity tab inherits this component while pointing at an *arbitrary*
selected entity, so the property should be **asserted rather than inherited**:

> WHEN the selected entity is a fleet the requester does not own THEN the hold
> and fuel cells render the absent form and no gauge segments

No attacker action exists today; this is a scenario 2b should carry, not a
finding against this change.
