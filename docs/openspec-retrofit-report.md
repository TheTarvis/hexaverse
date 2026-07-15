# OpenSpec retrofit report — 2026-07-15

Run of the OpenSpec team workflow (`/team ... --workflow`, run `wf_cf56b8db-063`):
brownfield retrofit of baseline specs onto the existing codebase, plus changes for
behavior that had no home capability. Spec-only run — no production code touched,
nothing archived. Two passes (the first hit the session limit mid-hardening);
combined ~150 agents / ~7.4M subagent tokens.

## What was created

**Baseline specs** (`openspec/specs/` — reverse-engineered from code, source of truth = the codebase):

- `galaxy-generation`, `system-interior`, `board-tactical-math`, `fleet-movement`,
  `fleet-roster`, `action-dispatch`, `observation-fog-and-scan`, `corporation-spawn`,
  `galaxy-view`, `hex-board-view`, `claude-agent-service`
- plus `openspec/project.md` and `openspec/config.yaml`

**Changes** (`openspec/changes/<id>/` — proposal.md, design.md, spec deltas, tasks.md each).
All six pass `openspec validate --strict`; open adversary findings survived the
3-round repair cap and need a human call before implementation:

| Change | Validation | Open adversary findings |
|---|---|---|
| `add-world-clock-spec` | PASS | none |
| `add-account-identity-spec` | PASS | none (500-path finding repaired) |
| `add-realtime-sse-spec` | PASS | none |
| `add-request-authorization-spec` | PASS | 1 MAJOR (rate-limit bucket, below) |
| `add-session-wakeup-spec` | PASS | 1 MAJOR (duplicate auth listener, below) |
| `add-mine-extraction` | PASS | 1 BLOCKER + 1 MAJOR (ledger key / zero-take delta, below) |

## Open adversary findings (survived the repair cap)

### add-mine-extraction — BLOCKER: ledger-key decoupling contradicts the base `action-dispatch` requirements

The change moves mine's delta ledger key to `systemId::featureId::kind` (fixing the
confirmed cross-system `feat-belt-0` collision), but only ADDS a requirement — the base
`action-dispatch` requirements ("Exactly-Once Resolution", "Additive Ledger Fold") still
mandate keying on `action.Scope` (`action/dao.go`: `deltaRef(a.Scope, a.Id)`,
`foldDeltasTx(tx, a.Scope, t)`). After merge, the capability would contain two
contradictory requirements; an implementer satisfying the unmodified base text verbatim
reintroduces the exact collision the change exists to prevent. Fix: the reconciliation
must be a MODIFIED delta on the base requirements, not only a new one.

### add-mine-extraction — MAJOR: zero-take resolves vs. the ledger-growth bound

"Exactly-Once Lode Delta" + task 2.3 say every resolve appends exactly one delta;
but if zero-take loser resolves (contested lodes) append zero-tonnage deltas, the
"ledger entries ≤ startTons / MinRunTons" bound (the named mitigation for unbounded
ledger growth) is false — the count is bounded by contesting-fleet count instead.
Spec must state that zero-take resolves append nothing, and reconcile with
"exactly one delta".

### add-request-authorization-spec — MAJOR: rate-limit aggregation under-specified

The spec reads as a per-route 20/min/IP budget on the strict routes (account create /
self-lookup / profile lookup / corp spawn). The code is one shared limiter instance
keyed on IP only — 20/min/IP across all four routes combined (`router.go` passes the
same `NewRateLimiter(20, time.Minute).Middleware()` closure to both handlers'
RegisterRoutes). A per-route-bucket implementation satisfies every scenario as written
yet diverges from actual behavior. Baseline mode must pin the shared-bucket behavior.

### add-session-wakeup-spec — MAJOR: task 8.2 as written ships a duplicate-auth-listener bug

The redirect-error requirement tells `app/login/page.tsx` to read `useAuth` state
on mount, but the codebase convention (enforced in `account-provider.tsx:17` and
CLAUDE.md) is that components get auth only via `useAccountContext()`. Calling
`useAuth()` directly instantiates a second `onAuthStateChanged` listener and a second
`getRedirectResult` (racy redirect consumption). The correct path — exposing
`redirectError` on `AccountContextValue` — is out of the proposal's declared scope and
absent from tasks. Fix: add the account-provider passthrough to the proposal/tasks.

## Open questions needing Travis's decision

1. **SSE subscribe-side authorization is unenforced.** The SSE handler's own code comment
   flags channel authorization as the caller's responsibility; no caller implements it.
   Recorded in `add-realtime-sse-spec`, cross-referenced in
   `add-request-authorization-spec/design.md`.
2. **No ownership check on mutating fleet-order and action endpoints.** Specced as current
   behavior in the `fleet-movement` and `action-dispatch` baselines. Defect to fix, or
   accepted single-player-slice posture? The team deliberately did **not** author an
   `enforce-fleet-and-action-ownership` change — gated on this call.
3. **`POST /v1/accounts` trusts client-supplied profile fields** (name, email,
   email_verified, picture) verbatim, with no cross-check against the Firebase token's
   own claims. Recorded in `add-account-identity-spec/design.md`.
4. Carried from `docs/specs/0010-mine.md` into `add-mine-extraction/design.md` (both
   deferred, non-blocking): starting numeric tuning values (mineRate/cargoCap/richness
   curve), and whether belt-coasting counts as "docked" (deferred until orbital motion
   is live).

## Next steps

- Resolve the four adversary findings (spec edits via `/team <change-id>` to resume a
  change, or hand-edit + re-validate). The mine BLOCKER must be resolved before any
  implementation of that change.
- Make the calls on open questions 1–3; ownership enforcement becomes its own change
  once decided.
- Phase 2 (TDD implementation) runs only with `--implement` / `implement: true`.
