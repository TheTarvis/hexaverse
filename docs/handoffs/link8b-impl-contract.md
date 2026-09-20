# Link 8b `add-scan-and-sightings-surface` — implementation contract

**Authoritative over any in-file assumption made by an SDET or a developer.** The
specs pin *behaviour*; they deliberately do not pin JSON field names, Go
identifiers, enum spellings, or digest constants. Those are implementation
decisions and this file settles them, so the SDET can write Go **and** TypeScript
contract tests against one agreed shape before either developer starts.

Where the spec left a name open I say **DECIDED HERE** and give the reason. A
developer may rename only what is marked renameable; everything marked *pinned*
is asserted by the red suite.

Written after reading every file in
`openspec/changes/add-scan-and-sightings-surface/` in full and verifying each
claim below against the tree at commit `7a2e837` (8a-2 landed).

---

## 0. What is already true in the tree — verified, not assumed

Four of this change's tasks are **already satisfied**. Do not re-do them; verify
and tick.

| Task | Status | Evidence |
| --- | --- | --- |
| **3.10** persist `reasonCode` in `ResolveOne` | **DONE** | `backend/action/dao.go:338` — `{Path: "reasonCode", Value: res.ReasonCode}` is in the resolve transaction's `tx.Update`, landed by `add-stationkeep-hold-verb` (commit `ca7e5d2`). |
| **3.10** mirror onto the returned in-memory `Action` | **DONE** | `backend/action/dao.go:370` — `a.ReasonCode = res.ReasonCode`, beside `a.Outcome` and `a.ResolvedAt`. |
| **3.11** correct `ResolveResult.ReasonCode`'s comment | **DONE (no edit needed)** | `backend/action/model.go:201-204` says the field is "mirrored onto `Action.ReasonCode` at the same status flip". That was false when the task was written; it is **now true**. Leave it. If 3.10 is ever reverted the comment must go with it. |
| **1.12** the red test for the persisted `reasonCode` | **ALREADY GREEN** — and that is the correct outcome | `backend/stationkeep_mine_and_burn_e2e_test.go:137` asserts `act["reasonCode"] == "clean"` read back through `GET /v1/actions/:id`. tasks.md 1.12 anticipates exactly this ("an already-green test here is a neighbouring change having landed the fix, not a failure of the red phase"). The SDET still owes the **scan-side** read-back assertion (a fizzling scan's five codes), because the mine assertion only covers a resolver that sets a code at all. |

Everything else in sections 2–9 is real work. Note in particular that these are
**not** done, contrary to what a fast read might suggest:

- `sightings.Sighting` has **no** `Id` field (`backend/sightings/model.go:37-71`).
- `sightings.Dao.List` has **no** `systemId` filter (`backend/sightings/dao.go:68`).
- `MintWrites` still builds `{actionId}_{targetId}` (`backend/sightings/mint.go:29-32`).
- `action.Dao.List` has **no** `OrderBy` and **no** `Limit` (`backend/action/dao.go:148-177`).
- There is no `scan-targets` route (`backend/fleet/handler.go:38-53`).
- `resolveScanHost` accepts the scanner itself and every `{beltId}#{k}` member
  (`backend/fleet/service.go:1653-1681`; `backend/system/bodies.go:150-157`;
  `backend/system/belt.go:44`).
- No frontend file mentions sightings, scan targets, or `fleetService.scan`.
- `requireRouteImplemented` **exists**, in the root `hexaverse` package, at
  `backend/fuel_e2e_helpers_test.go:513`. It fires on Gin's literal
  `"404 page not found"` body. It is available to any `*_e2e_test.go` in the
  root package and nowhere else.

---

## 1. THE WIRE CONTRACT (settle this first; nothing starts until it is agreed)

### 1.1 `GET /v1/fleets/:fleetId/scan-targets` — NEW

**Request:** no query params. Auth: the standard authorized group.

**Success — `200`:**

```json
{
  "targets": [
    { "hostId": "feat-belt-1",  "kind": "body",  "durationMs": 4880 },
    { "hostId": "gate-sys-042", "kind": "body",  "durationMs": 3040 },
    { "hostId": "flt-9x2",      "kind": "fleet", "durationMs": 3120 }
  ]
}
```

**Pinned:**

- Envelope key is `targets`. It is **always an array, never `null`** — an empty
  set serializes as `[]` (the same `if records == nil { records = []Sighting{} }`
  guard `sightings/handler.go:56` already applies).
- `hostId: string` — the raw id, exactly as the body table or the fleet doc
  carries it. No name field anywhere (Decision 20).
- **`kind` enum — DECIDED HERE — exactly two values, lowercase: `"body"` |
  `"fleet"`.** The spec says "whether it is a body or an own fleet". A lane gate,
  a station, a planet, a moon and a belt are all `"body"`, because they are all
  `bt.Body(id)` entries and the client has one label path for all of them.
  Exported as `fleet.ScanTargetKindBody` / `fleet.ScanTargetKindFleet` so the Go
  tests assert on constants and the TS union is `'body' | 'fleet'`.
- **Duration field name — DECIDED HERE — `durationMs`.** Unit: **world
  milliseconds**, the same unit as `eta` and `committedAt`. Value is exactly
  `fleet.roundTripMs(d)` for the separation `d` at the read's world time. Named
  `durationMs` and not `roundTripMs` because the client presents it as "what this
  sweep costs", and not `sweepDurationMs` because every field on this response is
  about a sweep already.
- **NO `worldTime` field.** Task 3.7 / 9.2b. An implementer who adds one has
  committed this chain's signature defect inside the change written to prevent
  it. The red suite asserts the key is **absent** from the response body.
- **Ordering — DECIDED HERE — ascending by `hostId`, one merged list.** Not
  required by any scenario, pinned anyway so the list is stable across reads (a
  target list that reshuffles under a player's cursor is its own defect) and so
  the SDET can assert an exact slice. `BodyTable.Ids()` is already sorted
  (`system/bodies.go:169`); merge the fleet entries in and sort the whole list
  once.

**Failure:**

| Case | Response |
| --- | --- |
| fleet owned by another corporation | `404`, **empty body** |
| fleet id does not exist | `404`, **empty body** |
| requester has no living corporation | `404`, **empty body** |
| named fleet is in lane transit | `200` `{"targets":[]}` |
| named fleet already has a running sweep (`ActiveScanId != ""`) | `200` `{"targets":[]}` |
| nothing in reach | `200` `{"targets":[]}` |

The three 404s must be **byte-identical**. Reuse `Handler.commandedFleetId`
(`fleet/handler.go:178`) verbatim — it already produces the bodyless 404 through
`h.respond(c, nil, ErrNotFound)` and already runs the settling read. Yes, it is a
GET that can write a settlement; that is exactly what `fleet.Get` already does
and it is desirable here (a due burn settles before eligibility is computed).

### 1.2 `GET /v1/sightings?systemId=&cursor=&limit=` — MODIFIED

**Success — `200`, envelope unchanged, one new field per record:**

```json
{
  "sightings": [
    {
      "id": "ae80c6d8304786e06ab71baee15cf787",
      "corporationId": "corp-1",
      "actionId": "act-1",
      "systemId": "sys-7",
      "asOf": 1717171717,
      "position": { "X": 12.5, "Y": 0, "Z": -3.25 },
      "velocity": { "X": 0.1,  "Y": 0, "Z": 0 },
      "emitting": false,
      "hullCount": 2,
      "hullTypes": ["frigate", "frigate"],
      "cleanSweep": false,
      "hostId": "feat-planet-2"
    }
  ],
  "nextCursor": ""
}
```

**Pinned:**

- New field `id: string`, 32 lowercase hex characters, **first** in the struct.
  Go: `Id string \`json:"id" firestore:"-"\``. The `firestore:"-"` is
  load-bearing: the id is the document path, never a stored field, and a
  round-trip that wrote it back would create a second copy that can disagree.
- `targetId` stays `json:"-"`. `disclosure.Contact` gains nothing (9.5).
- `position` / `velocity` serialize as **uppercase** `{X,Y,Z}` — `space.Vec3` has
  no JSON tags (`backend/space/vec.go:20`), and `frontend/lib/types/fleet.ts:28`
  already types `Vec3` as `{X,Y,Z}`. Do not "fix" either side.
- **A clean-sweep record still serializes every field.** No field on
  `sightings.Sighting` carries `omitempty`, so a clean sweep serves
  `"position":{"X":0,"Y":0,"Z":0}`, `"emitting":false`, `"hullCount":0`,
  `"hullTypes":null`. Client and server both branch on `cleanSweep`, never on a
  key's presence.
- `systemId` query param: optional equality filter. Absent → whole pile,
  unchanged. Present and never swept → `200` with `{"sightings":[],"nextCursor":""}`,
  **never** a 404 or a 400.
- `limit` clamp unchanged: `<=0 || >PageMax` → `PageMax` (50).
- `nextCursor` keeps its shape `"{asOf}|{documentId}"` and its opacity. It stops
  leaking **because the document id stops naming the target**, not because the
  encoding changed. Do not base64 it, do not change the separator — a cursor
  format change is a second, unrequired wire change and the red suite pins that
  a filtered page's cursor continues the *filtered* sequence, not that it looks
  different.
- Under a `systemId` filter the cursor's `StartAfter(asOf, docID)` composes with
  the `Where` unchanged.

### 1.3 The sighting document id — DECIDED HERE, exactly

```go
// sightings/mint.go
const documentIdDomain = "sighting/v1\x00"

// documentId is the pile's opaque, deterministic document path component.
// targetId is "" for a clean-sweep record.
func documentId(actionId, targetId string) string {
	sum := sha256.Sum256([]byte(documentIdDomain + actionId + "\x00" + targetId))
	return hex.EncodeToString(sum[:16])
}
```

- **Digest: SHA-256** (`crypto/sha256`). Not FNV-1a, not `hash/maphash` — both
  are named and forbidden by tasks.md 2.2 and the reasons are in design.md
  Decision 1.
- **Width: the leading 128 bits** (`sum[:16]`), the spec's floor.
- **Encoding: lowercase hex**, `hex.EncodeToString` → **32 characters, fixed
  length**. Chosen over base32 because it is unambiguous, needs no padding
  decision, and is what every Go reviewer reads without checking an alphabet.
- **Domain prefix `"sighting/v1\x00"`** so this digest can never be confused with
  or replayed from any other digest this codebase might later derive over the
  same pair.
- **Clean sweep — DECIDED HERE — no separate literal prefix.** The clean-sweep
  record's material is the same expression with an empty target component. It
  cannot collide with a target-naming record, because `disclosure.FocusedScan`
  never emits a target-naming record with an empty `TargetId`. `MintWrites` keeps
  its existing `if !rec.CleanSweep` branch, but the branch now only chooses the
  **input** (`""` vs `rec.TargetId`) and both paths call the one `documentId`.
  Rejected alternative: appending a literal `"clean"` — it is a second derivation
  rule to keep in step, and the "or the action id alone" wording in the spec is
  satisfied by an empty target contributing nothing.
- **No float arithmetic anywhere in it**, so it needs no fixture family and no
  entry in `fixtures/determinism-register.json`.

**Pinned constants for the cross-process test (tasks.md 1.10).** These are
computed values, not guesses; assert against them literally so a per-process or
randomly seeded derivation cannot pass:

| `actionId` | `targetId` | expected document id |
| --- | --- | --- |
| `act-1` | `tgt-1` | `ae80c6d8304786e06ab71baee15cf787` |
| `act-1` | `tgt-2` | `07d4de63955531f2e63d38c88e76e317` |
| `act-2` | `tgt-1` | `172d7d42f69088846f96d54129f438fe` |
| `act-1` | *(clean sweep)* | `45222e552fc4bd137bac34b7a0e078c0` |

Rows 2 and 3 together are the "two sweeps against the same target share no
identifier" and "two records from one sweep take two distinct paths" scenarios in
one table.

### 1.4 `GET /v1/actions?actor=&status=done` — ordering and bound

- **Bound value — DECIDED HERE — `action.SettledPageMax = 50`**, an exported
  named constant in `backend/action/model.go` beside the other ceilings. 50
  matches `sightings.PageMax`, which is this repo's only other named page
  ceiling; there is no reason for a second number and a second number is a second
  thing to tune.
- **Ordering: `OrderBy("resolvedAt", firestore.Desc)` applied ONLY when the
  single requested status is `done`.** Not on `running`, not on `cancelled`, not
  on an unfiltered or multi-status read. `resolvedAt` is
  `firestore:"resolvedAt,omitempty"` (`action/model.go:105`) and is **absent**
  from a running action's document; Firestore's `OrderBy` **excludes documents
  missing the ordered field**, so an unconditional order silently returns zero
  running actions and breaks `useRunningScan` — the hook this change exists to
  give a consumer.
- The bound applies on the same path only. `Limit(SettledPageMax)` after the
  `OrderBy`, never before it and never without it.
- Response envelope unchanged: `{"actions":[...], "worldTime":N}`, each action
  carrying `worldTime` too (`actionDTO`, `action/handler.go:55`).
- **No cursor, no paging.** The only consumer wants the newest settled sweep.
- Composite index `(actor ASC, status ASC, resolvedAt DESC)` on `actions`.

### 1.5 `reasonCode` values

Scan, from `backend/fleet/resolver.go:164,170,220,222,224` — **these five, exactly
these spellings, camelCase**:

`outOfRange` · `occluded` · `leftSystem` · `laneTransit` · `hostUnresolved`

They are already produced. This change adds no sixth and renames none. The
client maps all five to distinct copy plus an unrecognized-code fallback.
(`mine` also produces `clean|lodeDry|holdFull` on the same field; the scan copy
map must not claim them — it keys on the action's `type === 'scan'` first.)

### 1.6 Commit-rejection reasons the scan control must map (client side)

The client has no status-code contract to key on; it keys on the served
`{"error": "..."}` string through the established `lib/rejection-copy.ts`
mechanism (`commandErrorReason` + a needle `CopyMap`). The needles, verified
against the exact error strings in the tree:

| Server sentinel | Served status | Served `error` text | **Pinned needle** |
| --- | --- | --- | --- |
| `fleet.ErrScanHostUnresolved` | 404 | `fleet: scan host does not resolve to a body or an own fleet in this system` | `scan host does not resolve` |
| `disclosure.ErrScanOutOfRange` | 409 | `disclosure: focused-scan target beyond range` | `target beyond range` |
| `disclosure.ErrScanOccluded` | 409 | `disclosure: focused-scan target occluded by the star` | `occluded by the star` |
| `action.ErrActiveActionExists` | 409 | `actor already has an active action` | `already has an active action` |
| `fleet.ErrFleetInTransit` | 409 | `fleet is in lane transit` | `lane transit` |

Note the 404 here is a **reason-bearing** 404 (`fleet/handler.go:528`), unlike the
bodyless ownership 404 — so `commandErrorReason` extracts it and the copy map
matches. A genuinely bodyless response falls through to `GENERIC_COMMAND_FAILURE`,
which is exactly the unmapped-reason fallback task 5.8 wants.

**New client module — DECIDED HERE — `frontend/lib/scan-copy.ts`**, matching the
per-verb precedent (`jump-copy.ts`, `market-copy.ts`, `refuel-copy.ts`) rather
than growing `rejection-copy.ts`, which is explicitly the *shared* module for
verbs three capabilities consume. It exports:

```ts
export function scanErrorCopy(reason: string | undefined): string      // commit rejection
export function isStaleTargetRejection(reason: string | undefined): boolean  // outOfRange | occluded | hostUnresolved
export function scanFizzleCopy(reasonCode: string | undefined): string // the five codes + fallback
export const GENERIC_SWEEP_RESULT = 'The sweep returned nothing.'
```

`isStaleTargetRejection` is what task 5.9 branches on: those three rejections are
presented as "the sweep is no longer possible against that host" **plus an
in-flow target-list refetch**, never as an application-error state.

### 1.7 Client types — pinned shapes

```ts
// frontend/lib/types/sighting.ts   (NEW FILE)
export interface Sighting {
  id: string
  systemId: string
  asOf: number
  hostId: string
  cleanSweep: boolean
  // ALWAYS PRESENT ON THE WIRE, even on a clean sweep. `MintWrites` omits
  // these keys from the Firestore document, but none of the Go fields carries
  // `omitempty`, so a clean-sweep record decodes to the zero value and
  // serializes as `{"X":0,"Y":0,"Z":0}` / `false` / `0` / `null`. The client
  // therefore branches on `cleanSweep`, NEVER on a field's presence — a
  // presence check would classify a genuine record positioned at the origin as
  // a clean sweep, which is precisely the case the origin-omission rule exists
  // for (task 7.5).
  position: Vec3
  velocity: Vec3
  emitting: boolean
  hullCount: number
  hullTypes: string[] | null
}
export interface SightingPage { sightings: Sighting[]; nextCursor: string }
```

**`actionId` is deliberately NOT on the client type** (task 4.1) even though the
server serves it. `corporationId` likewise. Adding either fails the 9.2a audit.

```ts
// frontend/lib/types/scan.ts   (NEW FILE)
export type ScanTargetKind = 'body' | 'fleet'
export interface ScanTarget { hostId: string; kind: ScanTargetKind; durationMs: number }
export interface ScanTargetList { targets: ScanTarget[] }   // no worldTime — see 3.7/9.2b
```

```ts
// frontend/lib/types/action.ts   (WIDENED — three fields, task 4.3)
  reasonCode?: string
  resolvedAt?: number
  acknowledgedAt?: number
```

### 1.8 Query keys — pinned

```ts
sightings: {
  all: ['sightings'] as const,
  // systemId in the key: the system-filtered ghost read and the unfiltered log
  // read must never share a cache entry (task 4.7).
  pile: (systemId: string | null) => [...queryKeys.sightings.all, 'pile', systemId ?? 'all'] as const,
},
fleets.scanTargets: (fleetId: string) => [...queryKeys.fleets.all, 'scan-targets', fleetId] as const,
actions.settled:    (actorId: string) => [...queryKeys.actions.all, 'settled', actorId] as const,
```

### 1.9 Scene / DOM names — and one collision this change MUST NOT walk into

> **`SceneMarkKind` already has `'ghost'`, and it is NOT a sighting.**
> `frontend/components/space/space-scene.ts:43` declares `'ghost'` and
> `:294` emits it for a **burn's arrival ghost** — the mark at the target's
> position at `arriveMs`. `webgl/SpaceWorld.tsx:40` colours it. An
> implementer who reads task 7.1's "draw a ghost mark" and reaches for
> `kind: 'ghost'` will silently merge two unrelated mark classes, and every
> ghost-is-not-selectable / row↔ghost test will be asserting against burn
> previews.

**DECIDED HERE:**

- Sighting marks use `SceneMarkKind` **`'sighting'`** (new member).
- `SceneMark.id` = `` `sighting-${record.id}` ``.
- DOM test id = `` `sighting-mark-${record.id}` `` (mirrors `contact-mark-${id}`).
- Facts surface test id = `sighting-facts` (mirrors `contact-facts`), showing
  the heading/speed readout from the record's stored velocity plus its `asOf`.
- **The mark element carries `data-space-affordance`.** This is the mechanism —
  not a promise — that satisfies *A click on a ghost does not become a point
  selection*: `SpaceStage.handlePointerDown` bails on
  `isControl(e.target)`, which is `target.closest('[data-camera-control],
  [data-space-affordance]')` (`SpaceStage.tsx:212,220`). Without the attribute a
  pointerdown on a sighting mark bubbles to the region and becomes a point
  selection, arming a burn — the exact defect Decision 12 exists to prevent.
- Omission of an origin-positioned record reuses the existing
  `omitOrigin(id, 'sighting')` sink, so it lands in `SceneModel.omissions` and in
  the injected `log` — assertable, per task 7.5.
- `SceneInput` gains `sightings: Sighting[]` (defaulting to `[]`), so
  `buildSceneModel` stays the one place a mark is produced.

### 1.10 Component placement — DECIDED HERE

- **`frontend/components/space/ScanControl.tsx`** (new) — the target list,
  commit, guard, countdown, cancel, and the settled report. Mounted by
  `SystemSpaceView` in the right-hand column, **beside** `FleetActionsPanel`, not
  inside it. Reason: `FleetActionsPanel` is the `docked-fleet-actions`
  capability's component (its own header says so) and design.md's Context is
  explicit that *nothing here belongs in `docked-fleet-actions`*. Keeping the
  capability boundary and the file boundary aligned is the whole point of the
  split.
- **`frontend/components/space/SightingLog.tsx`** (new) — the pile display.
- **OQ-9 (where the log mounts) — DECIDED HERE as a drawer inside
  `SystemSpaceView`, not a route.** The spec requires the space view to stay
  mounted with its acting-fleet selection intact across open and close. A drawer
  makes that **structural**; a route makes it a promise that a future
  `router.push` breaks. This is a mechanism choice inside the latitude the spec
  leaves, not a re-opening of OQ-9's substance — Travis may still restyle it as a
  panel or overlay.
- Test ids: `scan-control`, `scan-target-select`, `scan-commit-button`,
  `scan-countdown`, `scan-cancel`, `scan-report`, `scan-report-dismiss`,
  `sighting-log-open`, `sighting-log`, `sighting-row-${id}`,
  `sighting-log-load-more`, `sighting-log-empty`, `sighting-log-error`.

### 1.11 Go identifiers — pinned where a test names them

```go
// backend/fleet/scan_targets.go  (new file)
type ScanTarget struct {
    HostId     string             `json:"hostId"`
    Kind       string             `json:"kind"`
    DurationMs common.WorldMillis `json:"durationMs"`
}
const ScanTargetKindBody  = "body"
const ScanTargetKindFleet = "fleet"

func (s *Service) ScanTargets(ctx context.Context, fleetId string) ([]ScanTarget, error)

// backend/system/belt.go  (added beside beltMemberOrbit, which owns the format)
func IsDerivedBeltMember(bodyId string) bool   // strings.Contains(bodyId, "#")
```

`IsDerivedBeltMember` is exported from `system` rather than open-coded in
`fleet`, because `system/belt.go:44` is where `"%s#%d"` is written and a
predicate that lives anywhere else is a second copy of a format. Add a `system`
test asserting `beltMemberOrbit(belt, k).Id` satisfies it and that no
generator-produced feature id and no `gateId(...)` does.

---

## 2. Task → component → owner

`GO` = golang-dev · `TS` = nextjs-dev · `SDET` = the red suite's author.

### Section 2 — sighting identity and the pile read → **GO**

| Task | Component | Note |
| --- | --- | --- |
| 2.1 | `backend/sightings/mint.go` | Implement §1.3 exactly. |
| 2.2 | — | A prohibition, not work. Satisfied by 2.1. |
| 2.3 | `backend/sightings/model.go` | `Id` first, `firestore:"-"`. |
| 2.4 | `backend/sightings/dao.go` | Populate from `snap.Ref.ID` in **both** `Get` and `List`. `Get` has no production caller — do not add one. |
| 2.5 | `backend/router_sightings_read_test.go:75`, `backend/disclosure_wiring_e2e_test.go:418` | Both hand-derive the old id. Root-package e2e — see the running rules in §5. |
| 2.6 | `backend/fleet/scan_resolver_mints_only_via_sightings_test.go` | AST check; verify it still passes, no edit expected. |
| 2.7 | link 5's existing mint tests | Re-run, do not rewrite. |
| 2.8–2.9 | `backend/sightings/{handler,service,dao}.go` | Thread `systemId` handler → service → dao. `Where("systemId","==",id)` composed with the existing two `OrderBy`s and the same limit. |
| 2.10 | `infra/terraform/firestore-indexes.tf` | `(systemId ASC, asOf DESC, __name__ DESC)`, `collection = "sightings"`, `query_scope = "COLLECTION"`. **Travis must `terraform apply`.** |

### Section 3 — the scan-target read → **GO**

| Task | Component | Note |
| --- | --- | --- |
| 3.1 | `backend/fleet/service.go` | Extract two helpers, shared by `Scan` and `ScanTargets`: `scanHostPosition(ctx, scanner, bt, hostId, now)` (today's `resolveScanHost` plus the two new exclusions) and `scanGeometry(from, hostPos, starPos, starSize) error` (→ `ErrScanOutOfRange` / `ErrScanOccluded`). Two call sites, one implementation. |
| 3.2 | `backend/fleet/scan_targets.go` | §1.11 signature. Duration is `roundTripMs(d)` — the same call `Scan` makes, never a re-derivation. |
| 3.3 | same | Six exclusions. Self and belt member are **not** implied by geometry: distance 0 passes `WithinRange`, and `disclosure/occlusion.go:35` early-returns `false` for a zero-length segment. |
| 3.4 | `backend/fleet/service.go` | Reject self and belt member in `scanHostPosition` through the existing `ErrScanHostUnresolved`. Both **before** the body-table lookup, because the table contains every member. |
| 3.5 | same | Empty set (200) for lane transit, `ActiveScanId != ""`, and nothing in reach. |
| 3.6 | `backend/fleet/handler.go` | `g.GET("/:fleetId/scan-targets", h.ScanTargets)`; gate through `commandedFleetId`. |
| 3.7 | same | **No `worldTime`.** |
| 3.8 / 3.8a | `backend/action/dao.go`, `infra/terraform/firestore-indexes.tf` | §1.4. `done` path only. `(actor ASC, status ASC, resolvedAt DESC)`. **Travis must `terraform apply`** — same apply as 2.10. |
| 3.9 | `backend/router.go` / route test | Confirm `requireRouteImplemented` now passes for the right reason. |
| 3.10 / 3.11 | — | **Already done — see §0.** Verify and tick. |

### Section 4 — client plumbing → **TS**

All of 4.1–4.10. `frontend/lib/types/{sighting,scan,action}.ts`,
`lib/services/{sighting-service,fleet-service,action-service}.ts`,
`lib/query-keys.ts`, `hooks/{use-sightings,use-scan,use-actions}.ts`.

4.8's "adopt `useRunningScan`" is a **hard** instruction: do not write a second
running-scan hook, and **repoint its doc comment** — it currently describes
drawing a committed beam from an origin system and an aim target, neither of
which exists (`hooks/use-actions.ts:14-18`).

4.10's per-own-fleet inbox hook is one `GET /v1/actions?actor=<id>&status=running`
per own fleet in the open system. There is no multi-actor inbox form and this
change does not invent one.

### Sections 5, 6, 7, 8 — surfaces → **TS**

- §5 `ScanControl.tsx` + `lib/scan-copy.ts`.
- §6 `ScanControl.tsx` + `SystemSpaceView.tsx` (the ETA scheduling and the
  settle-then-followers ordering live in the view, which already owns
  `etaCandidates` / `resync` at `SystemSpaceView.tsx:134-155`).
- §7 `space-scene.ts` (the `'sighting'` mark) + `SpaceStage.tsx` (the DOM
  overlay, modelled on the contact-mark block at `SpaceStage.tsx:580-608`).
- §8 `SightingLog.tsx` + `SystemSpaceView.tsx` (the drawer + affordance).

### Section 9 — orphan audit → **TS leads, GO verifies half (b)**

9.2a's half (b) is "a producer that actually serves it, verified against the
**response DTO struct and a real response body**". For `durationMs`, `kind`,
`id`, and `reasonCode` that verification is a Go-side job: capture an actual
response body from the e2e stack, not a fixture the client authored.

### Section 10 — validation → both, then QA

---

## 3. Sequencing

### Step 0 — before anyone writes production code

**SDET** writes the red suite against this document and records the manifest:

```
.claude/scripts/openspec-red-manifest.sh record add-scan-and-sightings-surface <paths...>
```

Record it **at the moment of red handoff, before any developer starts** — link
7b's manifest was recorded after a revision pass and is therefore a
post-revision baseline, not a red one (README lesson six). Verify red-for-the-
right-reason in a scratch copy with the missing symbols stubbed (task 1.14);
tasks 1.9, 1.11 and 1.12 are **green-wrong** rather than red, and only the
scratch-copy pass distinguishes those from a genuine red.

### Step 1 — fully parallel from here

The wire contract above is complete enough that **the TS developer is not
blocked on the Go developer for any unit-level work.** Both start together.

**GO track (order within the track matters):**

1. `2.1–2.4` — the id derivation and the served `id`. Everything else in the
   sightings package sits on it.
2. `2.5–2.7` — repoint the two hand-derived fixtures, re-run link 5's tests.
3. `2.8–2.10` — the `systemId` filter + its index.
4. `3.1` — the shared helper extraction. **Do this before 3.2/3.4**, or the list
   and the commit get two implementations and 1.6's agreement test becomes a
   coincidence.
5. `3.4` — the two commit rejections (self, belt member).
6. `3.2–3.3, 3.5–3.7, 3.9` — the read and its route.
7. `3.8/3.8a` — the inbox ordering and bound. Independent of everything above;
   can be done first if the TS track needs it sooner (it does not — see below).

**TS track:**

1. `4.1–4.3, 4.7` — types and query keys. Zero dependency on the Go track; the
   shapes are pinned in §1.
2. `4.4–4.6, 4.8–4.10` — services and hooks, unit-tested against mocked
   responses shaped by §1.
3. `§5` then `§6` — the control, the guard, the countdown/cancel/settle/report.
4. `§7` — the sighting mark. Note `space-scene.ts` is shared with `§8`'s
   cross-highlight, so land the `'sighting'` mark kind before the log's
   highlight wiring.
5. `§8` — the log and the drawer.

**The only true cross-track blocks** are the Playwright legs (10.2–10.7), which
need the Go endpoints live. Everything else is independent.

### Step 2 — integration

`10.1` (all red green), then `10.2–10.7` (Playwright), then `10.8` (`check.py`),
then `10.9` (validate + reconcile + archive rehearsal, **after**
`build-production-space-view` has archived).

### File-collision map (so the two developers do not step on each other)

| File | Owner |
| --- | --- |
| `backend/**` | GO, exclusively |
| `infra/terraform/firestore-indexes.tf` | GO |
| `frontend/lib/**`, `frontend/hooks/**`, `frontend/components/**` | TS, exclusively |
| `frontend/e2e/**` | TS (with the SDET's fixture notes below) |

No file is written by both. There is no shared contract artefact to co-author
beyond this document.

---

## 4. The Playwright journey — fixture needs, and the one that does not work

Existing helpers to reuse verbatim (`frontend/e2e/helpers/space-view.ts`):
`wakeNewCorp`, `captureInteriors`, `capturePosts`, `selectBody`,
`selectFirstBodyMatching`, `burnToSelectionAndDock`, `stationFeatureId`,
`mineableBodyId`, `digits`. `frontend/e2e/tests/space-journey.spec.ts` is the
shape to follow (one long journey, every leg asserting a **change in served
state**, `test.setTimeout(1_800_000)`).

### 4.1 The happy-path fixture (10.2, 10.3, 10.4, 10.6, 10.7)

A fresh `wakeNewCorp` already gives everything needed: a fleet parked in its home
system with planets, moons, belts, a station and lane gates in the body table.

**Do not hand-build the target.** Read `GET /v1/fleets/:id/scan-targets` through
the control itself: the served list *is* the fixture. Pick the entry with the
**largest `durationMs`** — that is the farthest eligible host and it maximises the
countdown window the test has to observe. If the list is empty the test must fail
loudly, not skip: a freshly spawned fleet with nothing in reach is a product
finding.

10.7 (the mount-path ordering) is arranged by committing a sweep, navigating away
(`page.goto('/')`), waiting past the ETA, and navigating back — the record must be
in the log and its mark in the scene **on first render**, with no second read.

### 4.2 The fizzle fixture (10.5) — READ THIS BEFORE WRITING IT

**tasks.md 10.5 as written — "scanner drifts out of range before pulse-reach" —
is not arrangeable against the real stack, and an SDET who tries will produce a
flaky test or a skipped one.** The arithmetic:

- `roundTripMs(d) = 3000 + ceil(40·d)` (`fleet/params.go:71`), and
  `FocusedScanRange = 48` (`disclosure/params.go:58`), so a sweep's **maximum
  duration is ~4.9 s** and **pulse-reach is at most ~2.5 s after commit**
  (`resolver.go:150`: `pulseReach = depart + (arrive-depart)/2`).
- The test stack runs at real-time scale. A fleet under burn covers a couple of
  units in 2.5 s against a 48-unit range. To fizzle on range the scan would have
  to be committed within ~2 units of the boundary, which no player-path gesture
  can arrange and no seed guarantees.
- `occluded` needs the star to move between the two instants — same 2.5 s
  problem.

**DECIDED HERE — induce the fizzle through lane transit instead**, which is a
genuine player path, deterministic, and exercises the same report surface:

1. Fly the fleet to a lane gate and dock (the journey already does this leg).
2. Open the scan control. The **gate body the fleet is attached to is always a
   served target**: it is a `bt.Body(...)` entry, distance ≈ 0, in range, and a
   zero-length sightline is never occluded. So there is always at least one
   target here — this is why the gate is the right place to arrange it.
3. Commit the sweep.
4. **Immediately** commit the jump. The jump commit does not touch the sensor
   channel (`fleet/service.go:1450-1495` claims the movement slot only), so both
   are live.
5. The sweep's ETA (≥ 3 s) passes while `f.Jump != nil` → the resolver fizzles
   `laneTransit` (`resolver.go:163-164`). If it is instead first folded after
   arrival, `f.SystemId != r.Action.Scope` → `leftSystem` (`:169-170`).

**The assertion must accept either `laneTransit` or `leftSystem` copy**, assert
that **no record was filed** (the log stays empty / unchanged), and assert that
the report is not the generic fallback. The other three reason codes are covered
by unit tests, which is honest: they are server states no browser gesture can
schedule.

The race that would defeat this — the sweep resolving *before* the jump commits —
cannot happen accidentally: no read resolves an action whose ETA has not passed
(`ResolveDue` filters `eta <= now`), and the jump POST lands in far under 3 s. If
it ever does, the test fails loudly rather than silently passing.

### 4.3 The double-submit leg (10.3)

`page.getByTestId('scan-commit-button').dblclick()` — a **real** double click,
then assert `capturePosts(page, /\/scan$/)` recorded exactly one body. The unit
test (5.11) must double-activate **within one tick with no awaited step and no
render between them**; `hooks/use-refuel.test.tsx` is the shape that failed to
catch this and must not be copied.

**`hooks/use-submit-guard.ts` is the right primitive and must be reused.** It is
ref-based, claims synchronously inside the submitting invocation, is stable
across renders, exposes `held` as a live getter, and is already the shared guard
for sell, mine, refuel, burn and jump. Do not write a second guard. Release it
from the mutation's `onSettled`, per its own doc comment.

---

## 5. Traps — every one of these has already cost this project time

1. **`-p 1` on every multi-package Go run.** `cd backend && go test -p 1 ./...`.
   The root `TestMain` wipes the shared emulator project while Go runs packages
   in parallel; without it you get ~18 phantom failures.
2. **The root `hexaverse` e2e package runs ONCE per change, at archive time —
   Travis's policy.** It is ~40 minutes and growing (README addendum). Developers
   verify with **package-level short tests** (`go test ./sightings/ ./fleet/
   ./action/ -short`) and **targeted e2e tests by name**:
   `cd backend && go test . -run TestScanTargetsOwnership -timeout 20m`. Never
   `go test .` for the whole root package during development.
3. **A timeout is not an assertion failure.** If a root-package run is ever
   needed, `-timeout 90m`. `FAIL hexaverse 600.704s` at go's 600 s default looks
   exactly like a real failure and is not.
4. **Never run Playwright while backend emulator tests are running.** One shared
   test emulator project; concurrent runs corrupt each other's state. Serialize
   them.
5. **The emulator auto-indexes.** Both composite indexes (2.10 and 3.8a) will be
   invisible in every test and will 500 only in production. They are not
   test-covered and cannot be. **Travis must `terraform apply` both in one
   apply.** Say so in the change's own record, not just here.
6. **`OrderBy` excludes documents missing the ordered field.** This is why 3.8a's
   ordering is `done`-path-only. An unconditional `OrderBy("resolvedAt")` returns
   zero running actions, `useRunningScan` selects from an empty list, and every
   scan-in-flight surface in this change goes dark — with a green suite, because
   no existing test reads a running action through an ordered query.
7. **`fixtures/determinism-register.json` is line-numbered.** Inserting code
   above a registered site silently breaks `check.py`'s determinism checks;
   re-locate by grep and update the entry rather than "fixing" the code. Nothing
   in this change should touch a registered site — SHA-256 has no float
   arithmetic — but 3.1's extraction moves lines inside `fleet/service.go`, so
   check.
8. **No fixture regeneration is needed anywhere in this change**, `backend/system`
   included. Stating it because every prior delegation carried the arm64/FMA
   prohibition: per README lesson five that prohibition is **stale** (resolved
   2026-08-29 by `pin-system-generation-determinism`), and in any case this
   change adds no float-bearing derivation. If you find yourself regenerating a
   fixture, stop — something has gone wrong upstream of this contract.
9. **The `'ghost'` mark-kind collision (§1.9).** The single most likely silent
   defect in the TS half.
10. **`data-space-affordance` on the sighting mark (§1.9).** Without it, the
    ghost-is-not-selectable requirement is unsatisfied even though the code
    "looks right".
11. **`Dao.Get` has no production caller.** Task 2.4 populates its `Id` for
    consistency. Do not add a caller, and do not let a test of `Get` stand in for
    the served-`id` test — `Dao.List` is the only path a record reaches the wire
    by.
12. **The archiver refuses a MODIFIED block that drops a live scenario, and
    `--strict` does not.** This change carries MODIFIED blocks against
    `sighting-records` and `action-dispatch`. Run
    `python3 .claude/scripts/openspec-reconcile.py add-scan-and-sightings-surface`
    early and often, not only at archive time.
13. **`build-production-space-view` must archive first.** Every
    `system-space-view` block here is ADDED against a capability that does not
    exist in `openspec/specs/` until then (Decision 10).

---

## 6. Findings for the orchestrator — flagged, not resolved

Numbered for routing. None is fixed in code by me; I wrote only this file.

1. **`SceneMarkKind` already declares `'ghost'`, and it means a burn's arrival
   ghost, not a sighting** (`components/space/space-scene.ts:43,294`;
   `webgl/SpaceWorld.tsx:40`). Every requirement in the `system-space-view` and
   `sighting-log` deltas uses "ghost" for a sighting mark, and tasks 7.1–7.8 and
   8.11–8.12 all say "ghost". The specs are not wrong — 8a-2 named its mark
   first, in code — but the vocabulary now collides in the one file both
   consume. §1.9 rules the implementation to `'sighting'`. **The spec deltas'
   prose is unchanged and should stay unchanged**; the orchestrator may want the
   writer to add a parenthetical, or may accept the divergence as an
   implementation-naming matter. Flagging because a later reader of the spec who
   greps for `kind === 'ghost'` will find the wrong marks.

2. **Task 10.5's fizzle mechanism cannot be arranged against the real stack.**
   Full arithmetic in §4.2: a sweep's pulse-reach is at most ~2.5 s after commit,
   and no player-path motion covers a meaningful fraction of the 48-unit range in
   that window. §4.2 substitutes a lane-transit fizzle, which is deterministic
   and a genuine player path, and accepts either `laneTransit` or `leftSystem`.
   **This narrows what 10.5 proves** — three of the five reason codes stay
   unit-tested only — and the orchestrator should decide whether that is
   acceptable or whether the task text should be amended.

3. **The client's rejection mapping keys on server error *strings*, and no spec
   pins those strings.** `system-space-view`'s *A Focused Scan Commits Against a
   Listed Target and Reports Its Rejection in Player Copy* requires five distinct
   rejections to "each read as its own statement", but the only discriminator on
   the wire is the `{"error": ...}` prose (two of the five share status 409 with
   two others). §1.6 pins the five needles. This is the shape
   `docked-fleet-actions` already ships, so it is not new debt — but it means a
   server-side wording change silently degrades five copies to the generic
   fallback, and no test on either side would fail. Worth a future
   `reasonCode`-on-rejection change; **not** in scope here.

4. **`focused-scan`'s new list requirement and `mine-extraction` disagree about
   belt members, and the change acknowledges only half of it.** Decision 17
   excludes members from the scan-target list *and* from the commit. But
   `fleetDTO.AttachedTo` (`fleet/handler.go`) still serves a member id for a
   fleet docked at one, and `mine` still accepts a member id as a `featureId`.
   The spec's own parenthetical concedes this. **No conflict for this change** —
   the exclusion is scan-only — but a reader will find a member id that is
   mineable and dockable yet unscannable, and there is no requirement anywhere
   stating that asymmetry is intended. Worth recording in `decisions.md`.

5. **`sighting-records`' MODIFIED block and `sighting-log`'s no-poll requirement
   both restate the same "another corporation's read settles your sweep" fact,
   with slightly different wording.** Not a conflict; noting it because the
   archiver's scenario check runs per-MODIFIED-block and these two live in
   different capabilities, so a later edit to one will not surface a divergence
   in the other.

6. **The scan-target read is an authenticated GET that performs a write.** It
   goes through `commandedFleetId`, which runs `svc.Get` and can settle a due
   arrival. This is the established pattern (`fleet.Get` does it, the interior
   read does it) and is desirable here — eligibility computed against unsettled
   state would be wrong. Flagging only because no requirement in the
   `focused-scan` delta says the read may settle anything, while
   `sighting-records`' MODIFIED block goes to some length to say exactly that
   about the interior read. The two should probably say the same thing.

7. **`sighting-log`'s "the log determines from what the scene actually drew"**
   requires the log and the ghost layer to share render state across a drawer
   boundary. §1.10's drawer-inside-`SystemSpaceView` decision makes that
   tractable (both read the same `sightings.pile(systemId)` query and the same
   `SceneModel.omissions`); a route-based log could not satisfy it without
   lifting state to a provider. Recording the dependency so a later change that
   moves the log to a route knows it breaks this requirement.

8. **Answering the direct question: yes, the space view's fleet panel currently
   mounts for an undocked fleet.** `SystemSpaceView.tsx:365` renders
   `<FleetActionsPanel fleet={acting} …>` unconditionally, and
   `FleetActionsPanel.tsx:310` only short-circuits on `fleet == null` (rendering
   an aside with "No fleet selected."). The docked-only gating is **per section**
   (`docked`, `dockedHere`, `dockedAtStation` at `:131-142`) and gates mine, sell
   and refuel individually — not the panel. It also stays mounted when the canvas
   is unavailable and when the interior read failed. So there is a live,
   always-mounted host for a no-attachment-required verb, and *The Scan Surface
   Remains Usable While the Canvas Is Unavailable* is satisfiable without
   restructuring. §1.10 nonetheless puts the scan control in its **own sibling
   component** rather than inside `FleetActionsPanel`, to keep the
   `system-space-view` / `docked-fleet-actions` capability boundary aligned with
   the file boundary.

---

*Written 2026-09-03 against commit `7a2e837`. Where this document disagrees with
`openspec/specs/`, the spec wins on behaviour and this file wins on names.*
