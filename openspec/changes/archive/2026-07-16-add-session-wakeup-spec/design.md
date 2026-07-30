## Context

This change retrofits a baseline spec onto the frontend's session lifecycle:
the path a browser tab travels from "no Firebase session" to "a woken player
acting on a board." The behavior is spread across four as-built files —
`app/login/page.tsx` (the auth form), `components/account-provider.tsx`
(Firebase user -> backend account), `components/corporation-provider.tsx`
(account -> living corporation), and `components/layout-wrapper.tsx` (the gate
that composes all of the above into what renders). It documents the running
seam and pins the capability boundary against the adjacent `galaxy-view`,
`corporation-spawn`, and `account-identity` specs.

**Revision note (specialist-panel pass):** the initial baseline was
documentation-only. The panel review (architect/ux/security/reliability/dba)
surfaced a small number of concrete, in-scope defects in the gate's failure
paths — states the running code reaches but handles wrong (silent blank
screens, error states mistaken for "no corporation yet," an unvalidated open
redirect, a login error invisible to screen readers). Where a defect is
cheap to close and squarely inside this capability's four files, this
revision specifies the *corrected* behavior and the change is no longer
purely documentation-only (see the added `Requirement:` entries and the
Migration Plan below). Where a defect's root cause sits outside this
capability's declared file scope (`account-provider.tsx`'s auto-create
mutation, `corporation-spawn`'s server-side validation), it is recorded here
and flagged to the orchestrator rather than folded in — see D9 and D10.

**Disputed, non-actionable finding (this revision).** The consolidated
panel input included an `architect` entry — `[MINOR] probe` — with no
target, code reference, or proposed text attached. There is nothing in it
to trace against the running code or turn into a requirement/scenario/task,
so it is recorded here as disputed-for-lack-of-content rather than silently
dropped, and no change was made on its account. If this was a placeholder
for a real finding that failed to attach, resubmit it with a target and
this revision will address it.

A design.md is warranted here (unlike a single-file retrofit) because the gate
is a **multi-stage decision tree** spanning three async data sources, and its
boundary with three other capabilities is the substance of the review. The
spec delta states each observable outcome; this file records why the boundary
falls where it does, where the delta's "signed-in user" abstraction hides a
stage, and which failure-path fixes are in scope.

## Goals / Non-Goals

Goals:
- Fix the capability boundary: what `session-wakeup` owns vs. what it merely
  gates or hands off to.
- Document the true gate stages so the "blank frame" and "wake" requirements
  are read against the real three-source resolution, not a two-state fiction.
- Cross-reference the contract seams (`GET /v1/corporations/me` 404, spawn
  503, the `wakeFocus` handoff) without re-owning them.
- Close the failure-path defects that are (a) squarely inside this
  capability's four files and (b) small enough not to require a design
  change beyond "surface the error instead of swallowing it": corp-lookup
  and account-lookup error conflation, the open redirect, the malformed
  spawn-response dead end, and the login error's missing live region.

Non-Goals:
- No redesign of `account-provider`'s auto-create-on-404 behavior, its
  auto-filled profile fields, or its timing (see D3/D9 — unowned by any
  spec today; that gap is noted, not closed here). This revision's one
  account-provider touch is additive and narrow: exposing a retry affordance
  so `layout-wrapper` can recover from a failed account *lookup* (D6) — it
  does not change what triggers auto-creation or what it sends.
- No change to `corporation-spawn`'s server-side name validation (see D10 —
  flagged as a gap, not closed here; that capability is out of this change's
  scope).
- No change to the login form's or wake-up flow's core structure beyond the
  specific, listed defect fixes (D6–D8) — mode toggle, field layout, and
  spawn mechanics are otherwise unchanged.
- The galaxy view's own logged-out start-area rendering stays in `galaxy-view`;
  this capability only owns the *gating decision* that lets `/` through.

## Decisions

### D1 — One capability spans login + gate + wake, not three

`session-wakeup` owns the login route (Req: Login Route…) alongside the wake
gate and wake-up flow. This reads wider than the name, but it maps to one real
frontend seam: the pre-play session lifecycle, anchored in `layout-wrapper.tsx`
which is the single component that decides — for every route — whether to show
the login redirect, a blank frame, the wake-up flow, or the app. Splitting the
login form into its own capability would sever the redirect handoff
(`?redirect=` target -> gate -> wake) that only reads coherently as one flow.

Boundary lines that are **not** crossed:
- Backend account CRUD and identity binding belong to `account-identity`.
  This capability's login form only drives Firebase auth (`signIn`/`signUp`/
  `signInWithGoogle`); it never speaks to `/v1/accounts`.
- Spawn's server behavior (site selection, idempotency, 404/503 contract)
  belongs to `corporation-spawn`. This capability consumes that contract; the
  delta references the 404 and 503 as *triggers* it reacts to, and must not
  restate spawn's server rules.

### D2 — The gate is three-stage, and the delta's "signed-in user" is stage-two shorthand

`layout-wrapper.tsx` resolves three async sources in order, and the render
outcome depends on which stage is unresolved:

1. **Auth** (`authLoading`, `user`) — Firebase. Unresolved -> no redirect
   fires; public routes render, others hold null.
2. **Account** (`accountLoading`, `account`) — the backend account mirror,
   fetched by `account-provider`. The wake branch is guarded by
   `if (user && account)` — so a Firebase user whose *backend account* is
   still loading (or being auto-created, D3) does **not** reach the corp gate;
   it falls through to `authLoading || accountLoading -> return null` (a blank
   frame by a different path).
3. **Corporation** (`corpLoading`, `needsWake`) — `GET /v1/corporations/me`.
   This is the stage the "blank frame" and "wake" requirements describe.

The delta phrases stages 2–3 together as "a signed-in user." That is
acceptable shorthand for the *observable* outcome (both unresolved stages
render nothing), but it is not literally the code's condition. The requirement
stays behavioral and correct; this note is the reconciliation for a reader who
diffs the spec against `layout-wrapper.tsx` and finds `user && account` where
the prose says "signed-in." The added "Gated Routes Blank While Auth or
Account Resolution Is In Flight" requirement is that reconciliation, made
explicit as its own sibling requirement (ux review, user-observable altitude)
rather than a single extra scenario tucked under the corp-resolution
requirement — the two states (account still resolving vs. corp still
resolving) are genuinely different gate stages and read better named
separately.

### D3 — The account-bootstrap stage is unowned, by design of this change's scope

`account-provider.tsx` auto-creates a backend account (with Firebase-derived
demo profile fields) on a 404 from `GET /v1/accounts/firestore`, once per
session. This is the bridge that makes stage-two resolve for a brand-new
Firebase user. No spec owns this frontend behavior: `account-identity` specs
the *backend* endpoints, and `session-wakeup` only *reads* `account` as a gate
input. This is a real coverage gap, recorded here and flagged to the
orchestrator — not closed here.

**Sharpened by the panel review:** the auto-create mutation
(`createAccountMutation`) sets `hasTriedCreation` true *before* it resolves
and never resets it on failure — `onError` only `console.error`s. If
creation fails once, `account` stays `null` indefinitely and
`layout-wrapper.tsx` falls through every branch to `return null` on any
gated, non-home route: no error, no retry affordance, ever, for that
session. This is a real, user-reachable dead end (confirmed against the
code), and it is the sharpest instance yet of why D3's gap matters. It is
**not** fixed by this change: the fix lives inside `account-provider.tsx`'s
auto-create effect (resetting `hasTriedCreation` on failure, or exposing a
distinct "creation failed" state), which is the exact behavior D3 already
scopes out of this capability. D6 below fixes the *sibling* problem — a
failed account *lookup* — using an additive, narrow account-provider export;
it does not touch (and cannot substitute for) this fix. A future
`add-account-bootstrap-spec` (frontend) is the natural home for closing this
specific dead end; flagged to the orchestrator, not silently dropped.

### D4 — Producer/consumer handoff with galaxy-view stays one-directional

On successful spawn the wake-up flow writes the home system id to
`sessionStorage['wakeFocus']` and navigates to the board, never the galaxy.
`galaxy-view`'s existing "Wake-Up Focus Handoff" requirement is the sole
consumer (it reads and clears the hint on a later galaxy visit). This delta
owns the *write* ("record … as a wake-focus hint"); `galaxy-view` owns the
*read*. The two requirements must stay consistent — neither should describe the
other's half. The delta already scopes this correctly (best-effort write, its
absence non-fatal); no change needed beyond keeping the cross-reference.

### D5 — Requirement altitude: keep the mechanism out of the spawn-handoff requirement

The "Successful Spawn Hands Off" requirement currently leads with the
implementation mechanism (invalidating React Query caches) as its primary
clause. The *behavior* is: after spawn, the gate re-evaluates and the new
fleet becomes visible without a reload. The cache-invalidation is a
React-Query-specific HOW that belongs here in design, not in the requirement
text. See the flagged finding for the reworded, paste-ready requirement — the
observable transition is what the delta should assert. The revised
requirement also adds two failure scenarios the code already implies but the
baseline omitted: a malformed success response (no `homeSystem.id`) must not
leave the flow silently stuck, and a resubmission after a client-side
timeout must land on `corporation-spawn`'s existing idempotent-spawn
guarantee rather than an unstated assumption. Both fit this requirement's
existing scope — no new file touched beyond `wake-up-flow.tsx`, which was
already in scope.

**Implementation constraint the malformed-response fix must respect
(architect, sharpened against the code).** `wake-up-flow.tsx`'s `onSuccess`
runs both `invalidateQueries` calls (corp + fleets) *unconditionally*, before
the `if (res.homeSystem?.id)` guard. So the current behavior on a malformed
success is **not** "silently does nothing": the invalidation fires, the corp
query re-resolves to the now-created corp, `needsWake` flips false, the
`WakeUpFlow` component unmounts, and the player lands on whatever route was
mounted underneath (typically `/` → the galaxy) with no wake-focus hint and
no error. Two consequences the fix must honor:
1. The delta scenario's parenthetical "(no navigation, no gate re-evaluation,
   no feedback)" is inaccurate — the gate *does* re-evaluate today. The
   observable defect is a silent, unfocused drop onto the galaxy, not a frozen
   screen. The scenario text must be corrected to the real behavior.
2. "Show a retriable error and leave the wake-up flow resubmittable"
   (Requirement text + task 5.1/5.2) is **not achievable by adding a toast
   alone**: with the invalidations firing, the flow unmounts before any
   resubmission is possible. The fix MUST also move (or guard) the two
   `invalidateQueries` calls inside the `res.homeSystem?.id` branch, so the
   gate does not flip on the malformed path and the flow stays mounted. A
   resubmission then rides `corporation-spawn`'s idempotent-spawn/asset-heal
   guarantee, which returns the existing corp *with* its home system — so the
   retry can actually succeed, which is precisely why "resubmittable" is the
   right remedy once the invalidation is guarded. task.md 5.1 must name this
   invalidation guard explicitly; without it the requirement is unimplementable
   as written.

**Applied this revision.** The prior pass recorded this constraint but left
`spec.md`'s scenario text and `tasks.md` 5.1/5.2 unrevised; both are now
corrected to match (guarded invalidation, flow stays mounted, a follow-up
"resubmission after a malformed response succeeds normally" scenario). A
second-round `ux` finding independently rediscovered this same bug and
proposed a *different* remedy shape: let the invalidation fire, navigate to
the galaxy view, and show a distinct "hull ready but home not found" notice
there instead of guarding the invalidation. **Disputed, not adopted:** per
the stated tie-break (architect owns technical shape), this revision keeps
the guard-based fix recorded above rather than switching to
navigate-elsewhere-with-a-notice — the guard is smaller (one file, no new
cross-route notice-passing mechanism), keeps the flow resubmittable without
relying on the galaxy view's unrelated wake-focus handoff, and was already
load-bearing for task 5.1's wording before this round's review ran. ux's two
proposed scenarios (navigate-to-galaxy notice; wake-focus-handoff
non-firing) are not included in the delta as a result — the guard makes the
second one moot (the flow never unmounts on the malformed path, so there is
no handoff gap to document) and the first contradicts the chosen fix shape.

### D6 — Corp-lookup and account-lookup errors must not be conflated with "not yet" states

Two related defects, both squarely inside this capability's declared files
(`corporation-provider.tsx`, `layout-wrapper.tsx`, and — narrowly —
`account-provider.tsx`):

- `corporation-provider.tsx`'s `useQuery` never reads `isError`/`error`.
  `corporationService.getMine()` rethrows any non-`404` status, but the
  provider computes `needsWake` from `corporation === null` alone, so a
  `5xx` or network failure on `GET /v1/corporations/me` resolves
  identically to a genuine "no corporation yet" — an already-spawned player
  can be shown the full-screen wake-up flow on a transient error.
- `layout-wrapper.tsx` never reads `error` from `useAccountContext()`
  either, so a failed account *lookup* (as opposed to a failed account
  *creation* — see D3) also collapses into the same indefinite blank frame
  as every other unresolved state.

Both are fixed here as the *same shape of fix*: stop discarding the error,
and render a retriable error state distinct from "still loading" and
distinct from "confirmed absent" — new Requirements "A Corp-Lookup Failure
Shows a Retriable Error, Not the Wake-Up Flow" and "An Account-Lookup
Failure Shows a Retriable Error, Not an Indefinite Blank Frame". The corp
side needs no new surface: `corporation-provider.tsx` already has the query
object it needs to inspect. The account side needs one small, additive
export from `account-provider.tsx` — a retry affordance (e.g. re-exposing
`refetchAccount`) — which is new surface area but not a change to *what*
triggers auto-creation or *what* it sends (that stays D3's boundary).

Dedupe note: `ux` and `reliability` both flagged the corp-lookup defect
(ux as MAJOR with fix-required wording, reliability as BLOCKER with
"document the current bug, don't fix it" wording). Per the stated tie-break
(ux owns user-observable behavior), this revision adopts ux's framing — the
*correct* behavior is specified, not the bug — since the fix is small,
in-scope, and leaving a spec that formalizes "an error looks like your
empire vanished" as intended behavior would be worse than the scope
expansion of fixing it.

**Sharpened this revision (ux MAJOR + reliability MAJOR, deduped — same
underlying gap, two write-ups).** The account-lookup-failure requirement as
first specified didn't say what happens *while* auto-creation is in
progress, or what "retriable" means once the underlying cause is a *stuck
creation failure* rather than a fresh lookup failure. Traced against
`account-provider.tsx`'s computed `error` field
(`(accountError)?.status === 404 && !hasTriedCreation ? null : accountError`):
`hasTriedCreation` flips `true` synchronously when auto-creation *starts*,
before the mutation resolves — so a naive implementation of D6 (checking
`error` truthiness without also checking `isCreating`) would flash a false
"account lookup failed" error on every first-time signup's happy path,
mid-creation. Separately, once creation *fails*, this same field goes
non-null permanently, and a retry only re-runs the lookup GET (still `404`,
`hasTriedCreation` never resets) — a "retriable" button that silently loops
forever without ever resolving. Both are now closed at spec level (not
implementation level) by two added scenarios and a requirement-text clause:
the error state MUST be gated on `!isCreating` (already exposed on
`AccountContextValue`), and, when the surfaced failure is a persisting
`404` (a stuck creation, not a fresh lookup failure on a known account),
the error state MUST offer a distinct recovery action (e.g. sign out /
reload) rather than a retry control that only re-issues the same lookup —
a structural branch on `error.status === 404`, decidable by inspecting the
rendered control rather than by judging copy tone. Neither scenario
re-opens D3/D9's root-cause fix (resetting `hasTriedCreation` on failure) —
see the D9 reconciliation below.

### D7 — The `redirect` query param must be constrained to same-origin paths

`app/login/page.tsx` pushes `searchParams.get('redirect')` straight into
`router.push` with no validation. `router.push` will hard-navigate an
absolute or protocol-relative URL, so `/login?redirect=//evil.example`
bounces a freshly authenticated visitor to an attacker-controlled origin —
a classic open-redirect, and it fires with no user interaction beyond
completing sign-in. This is inside the login route's declared scope, cheap
to close (a same-origin prefix check before use), and a security control,
so per the stated tie-break (security owns controls) the fixed behavior is
specified directly rather than documented as a known bug.

### D8 — Login error accessibility is a new, but warranted, requirement

The login form's inline error (`<Text className="text-red-600...">`) has
no `aria-live`/`role="alert"`, so a screen-reader user gets no notice a
sign-in/sign-up/Google attempt failed. No `aria-live` precedent exists
anywhere in `openspec/specs/` today; this is the first. It is warranted
because the parallel path (the wake-up flow's toast-based failure, via
`sonner`) already has an accessible live region by construction and needed
no equivalent requirement — the asymmetry is real, not stylistic, and login
is the one auth surface where a screen-reader user currently gets nothing.

### D9 — Disputed: account-creation-failure dead end stays out of this change's spec

`ux`'s BLOCKER finding (account auto-creation failure → permanent blank
screen) is real and load-bearing (see D3's sharpened note above), but its
root cause and fix both live in `account-provider.tsx`'s auto-create effect,
which this change's own declared scope (and `ux`'s own finding text)
already places outside these four files' boundary. Folding a fix for it
into `session-wakeup` would mean this capability starts owning
`account-provider`'s creation-retry semantics — exactly what D3 rules out.
Disposition: **not added as a session-wakeup requirement**; strengthened in
D3 instead, with the specific failure mechanism now on record, and flagged
to the orchestrator for a future `add-account-bootstrap-spec`. This is a
dispute of *where* the finding is fixed, not of its validity.

**Interaction the writer must keep consistent (architect) — reworded this
revision to match what D6 now actually specifies.** D6's account-lookup-error
branch reads `error` from `useAccountContext()`, and `account-provider.tsx`
(line 150) surfaces the account query's error as non-null once
`hasTriedCreation` is set — including a bare `404`
(`status === 404 && !hasTriedCreation ? null : accountError`). So *after* a
failed auto-creation, the persisting `404` is no longer masked: it now
reaches layout-wrapper's error branch. Before this revision, that branch would
have rendered a **retriable error that can never succeed** (each retry
re-hits the same `404`, with no indication retry won't help) — the dead end
changing *shape* (blank → misleadingly-retriable loop) rather than
disappearing. This revision's added D6 scenario ("A stuck account-creation
failure does not present retry as certain to succeed") closes that specific
gap at spec level with a structural test, not a wording constraint: on a
persisting `404`, the error state is required to offer a distinct
sign-out/reload action rather than a retry control that re-issues only the
account lookup. What remains open, unchanged, is the *root* fix — actually
making retry work by re-attempting creation, or resetting `hasTriedCreation`
on failure — which still lives inside `account-provider.tsx`'s auto-create
effect, outside this capability's declared boundary. Disposition unchanged:
**not added as a session-wakeup requirement**; D6 now correctly describes the
post-fix shape of the failure (a distinct, testable recovery action, not a
misleading retry), and the remaining root-cause gap is still flagged to the
orchestrator for a future `add-account-bootstrap-spec`.

### D10 — Disputed: corporation-name length/content bound stays out of this change's spec

`security`'s MAJOR finding that `corporation-spawn`'s `Spawn` enforces no
server-side max length or character-class bound on the corporation name
(client `maxLength=60` is bypassable via direct API calls or the agent's
token passthrough) is real: `backend/corporations/service.go`'s `Spawn`
only trims and rejects empty. But the fix is a `corporation-spawn`
requirement and a backend code change — `corporation-spawn` is a separate,
already-published capability this change does not otherwise touch (no file
in its declared scope is backend Go). Per the stated tie-break, security
owns controls, but the *placement* of a spec change is technical shape
(architect), and a change's delta should target the capability whose code
it actually modifies. Disposition: **not added to `corporation-spawn/spec.md`
by this change**; recorded here as a real, unclosed gap for a future change
scoped to `corporation-spawn`. This is a dispute of *where* the finding is
fixed, not of its validity — noted, not silently dropped.

**Second-round security review (unchanged disposition).** This revision's
panel pass re-raised the same finding and supplied paste-ready requirement
text (a revised "Idempotent Spawn" requirement with length/character-class
bounds and `ErrNameInvalid` scenarios) for the future `corporation-spawn`
change to use directly. The disposition above is unchanged — this change
still touches no backend Go file — but the paste-ready text is recorded here
so the future change doesn't have to re-derive it:

> The system SHALL, on `Spawn(accountId, name)`, return the account's
> existing living corporation (with its assets ensured/healed) if one
> already exists, rather than creating a new one, and SHALL, for a fresh
> spawn, require a non-empty, whitespace-trimmed name whose length and
> character content fall within configured bounds — rejecting with
> `ErrNameInvalid`, before any corporation document is written, a name
> longer than the server maximum (60 UTF-8 code points, matching the client
> `maxLength`) or containing control/non-printable characters.

### D11 — Public-route matching must be by path segment, not bare prefix

`layout-wrapper.tsx`'s `isPublicRoute` check
(`PUBLIC_ROUTES.some((route) => pathname?.startsWith(route))`) matches on
raw string prefix, so any future route whose path merely *starts with* one
of `/login`, `/oauth`, or `/spike` (e.g. a hypothetical `/oauth-admin` or
`/spike-internal`) would render fully ungated — no such colliding route
exists today, so this is latent, not live, but the existing "Public Routes
Render Ungated" requirement inherited the same loose contract, and the
change's own Open Questions already asked whether `PUBLIC_ROUTES` is a
closed set. This is cheap to close (segment-boundary matching: exact match
or `<route>/…`) and squarely inside `layout-wrapper.tsx`, already in scope,
so the corrected contract is specified directly rather than left as
convention. This also answers (in part) the open question below: the
*membership* of `PUBLIC_ROUTES` stays code-owned, but the *matching rule*
is now pinned at spec level.

### D12 — Login credential failures must not enumerate accounts

`app/login/page.tsx` shows `err.message` verbatim
(`app/login/page.tsx:51,63`), which is whatever Firebase Auth's SDK returns.
Firebase distinguishes `auth/user-not-found` from `auth/wrong-password` on
sign-in, and returns `auth/email-already-in-use` on sign-up — absent the
provider's email-enumeration protection, an unauthenticated visitor can
probe arbitrary emails at `/login` and learn which are registered. This is
inside the login route's declared scope (same file as D7/D8's fixes) and is
a genuine security control, so per the stated tie-break (security owns
controls) the corrected, uniform-message behavior is specified directly. The
new requirement pins the *user-observable* guarantee (same message for
wrong-password and unknown-account; sign-up doesn't confirm an email is
registered) and names its dependency (provider-side enumeration protection
must be enabled) rather than re-implementing enumeration protection
client-side, which Firebase does not expose a client-side equivalent for.

### D13 — A silent mobile Google-redirect sign-in failure is added to scope, not deferred

`hooks/use-auth.ts` is not one of this change's four originally declared
files, but `reliability`'s BLOCKER finding here is a true silence on a
plausible, everyday path, not a merely-suboptimal message — the class of
defect this whole revision exists to close (D6–D8), just one file further
out than the original scope line. Traced: `getRedirectResult(auth)` in the
auth-init effect only `console.error`s a rejection; on
`shouldUseRedirectForOAuth()` devices (the majority of mobile browsers —
Android/iPhone/iPad/iPod/Mobile UA), a cancelled or denied Google sign-in
returns the visitor to a freshly mounted, non-pending `/login` with zero
feedback. This is distinct from the popup path's `try`/`catch` in
`app/login/page.tsx`, which only wraps the synchronous initiation of
`signInWithRedirect` — the eventual rejection is handled separately, and
silently, in `use-auth.ts`.

Unlike D9/D10 (root cause outside scope, fix deferred), this fix is narrow,
additive, and the same shape/size as D6–D8: surface the redirect result's
failure as state instead of only logging it, and render that state through
the login form's *already-fixed* (D8) inline error surface and live
region. Disposition: **added to this change's scope.** `hooks/use-auth.ts`
joins the file list in `proposal.md`'s Impact section; the touch is
additive only, with no change to `signIn`/`signUp`/`signInWithGoogle`'s
existing sign-in behavior on any other path.

**Mechanism, revised this round (M2 — `getRedirectResult` alone cannot
detect "cancelled").** `getRedirectResult(auth)` resolves `null` both on an
ordinary page load (no redirect was ever pending) *and* on a user-cancelled
or denied Google redirect; it only *rejects* on a genuine SDK/network
error. A fix that surfaces only the `.catch` rejection therefore leaves
D13's headline defect — the cancelled case — exactly as silent as before,
and gives an SDET no injectable trigger to red-test "cancelled shows an
error" against. The fix instead needs a **redirect-initiation marker**: a
durable flag (e.g. `sessionStorage`) written *before*
`signInWithRedirect` navigates the browser away, so the return trip can
tell "a redirect was pending and produced no user" apart from "no redirect
was ever pending." Sequence:

1. `signInWithGoogle`'s redirect branch persists the marker, then calls
   `signInWithRedirect`.
2. On return, the auth-init effect awaits `getRedirectResult(auth)` and
   classifies the settled outcome, clearing the marker in every branch:
   - **resolves with a user** → success; no error surfaced.
   - **rejects** → surface `redirectError`.
   - **resolves with no user, marker present** → a cancelled/denied/failed
     redirect; surface `redirectError`.
   - **resolves with no user, no marker** → an ordinary page load; surface
     nothing.

This mechanism is HOW (design), not WHAT (spec) — the spec requirement
("A Failed Google Redirect Sign-In Shows an Error, Not a Silent Return")
states the observable trigger ("a redirect was initiated and did not
produce a signed-in user on return") without naming `sessionStorage`
specifically, so a different durable-marker implementation would still
satisfy it; this section pins the concrete mechanism the tasks build.

**Wiring, added this round (M1 — the login page cannot reach a bare
`use-auth.ts` export).** `app/login/page.tsx` consumes auth state only
through `useAccountContext()`; this frontend's convention forbids calling
`useAuth()` directly from a component. A `redirectError` field added only
to `use-auth.ts`'s return value is therefore invisible to the login form —
task 8.2 as originally scoped was unimplementable, and it also contradicted
`proposal.md`'s Impact line describing `account-provider.tsx`'s touch as
"additive retry export only." Both are corrected this round:
`account-provider.tsx` gains a second, narrow additive passthrough —
re-exposing `use-auth.ts`'s `redirectError` on `AccountContextValue`,
alongside D6's retry-affordance export — so `app/login/page.tsx` reads it
the same way it reads everything else, via `useAccountContext()`. This is
still a passthrough, not new account-lookup/auto-create behavior;
`proposal.md`'s Impact wording is updated from "additive retry export
only" to "additive exports only (retry affordance + redirectError
passthrough)" to keep it honest about the second export. Task 8.1b names
this wiring explicitly.

This does **not** extend to the adjacent, more speculative gap `reliability`
raised alongside it — `onAuthStateChanged`'s own lack of an error handler
(see Open Questions below) — which stays deferred, parallel to D3/D9,
because it is lower-likelihood and reliability's own finding proposes it as
an open question, not a fix.

## Risks / Trade-offs

- **Fiction of a two-state gate.** If a future author reads "signed-in user"
  as "Firebase user" and removes the `account` guard, a new user would flash
  the wake-up flow before the backend account (and thus corp lookup) exists.
  D2 and the added "Gated Routes Blank…" requirement are the guardrail.
- **Unowned bootstrap (D3/D9).** Until a spec owns `account-provider`'s
  auto-create, a change there could silently reopen the account-creation
  dead end with no failing spec scenario to catch it — this revision fixes
  the *lookup*-failure sibling (D6) but explicitly does not fix this one.
- **Synchronous three-stage chain (reliability).** `layout-wrapper.tsx`
  sequences auth → account → corp resolution before *any* gated content
  renders, for every authenticated route (galaxy, systems, fleets) — not
  just the wake-up flow. A slow or degraded account or corp service now
  degrades the whole app. D6's fixes stop the *wrong-state* failure modes
  (blank screen, false wake-up flow); they do not bound *how long* a slow
  (not failed) dependency may hold the blank frame before the user sees a
  loading affordance — no design-doc-sourced number exists for that today
  (apiClient's default request timeout is 120s), so it is left as an open
  question rather than an invented SLO.
- **Unbounded corporation name (D10).** Until `corporation-spawn` enforces a
  server-side bound, the wake-up flow's `maxLength=60` is a UI convenience
  only, bypassable via direct API calls.
- **Session-restore failure has no error surface, one layer out from D6
  (reliability, new this revision).** `use-auth.ts`'s
  `onAuthStateChanged(auth, (user) => {...})` has no error callback; if
  Firebase Auth's own local session-restore genuinely throws (SDK init
  failure, corrupted persistence, blocked storage under strict privacy
  settings), `authLoading` can plausibly stay `true` forever and
  `layout-wrapper.tsx`'s blank frame holds indefinitely — the same failure
  class D6 fixes for account/corp lookup, unaddressed one stage further out.
  Lower likelihood than D13's redirect-result failure (this callback usually
  fires from local persistence even offline), so it is recorded as a risk
  and an open question, not fixed here — see Open Questions.

## Migration Plan

Mostly documentation-only: on archive, `session-wakeup` joins
`openspec/specs/` as a new capability with no data or contract migration.
D6–D8 and D11–D13 require small, additive frontend code changes before this
change's tasks are complete (see `tasks.md`) — surfacing already-available
error state in `corporation-provider.tsx`, scoped so a background refetch
failure while a corporation is already resolved does not evict the player
(B1), and in `layout-wrapper.tsx` (gated on `isCreating` per the D6
refinement), two narrow additive exports from `account-provider.tsx` (a
retry affordance for D6, and a `redirectError` passthrough for D13/M1), a
same-origin + backslash/control-character check and a uniform
credential-failure message (covering `auth/invalid-credential`, per M3) in
`app/login/page.tsx`, a live region on its error text, a segment-boundary
fix to `layout-wrapper.tsx`'s `PUBLIC_ROUTES` match, an invalidation guard
in `wake-up-flow.tsx`'s spawn `onSuccess`, and a redirect-initiation marker
plus a new additive `redirectError` export from `hooks/use-auth.ts`
(D13/M2). None of these files' existing public behavior for the happy path
changes; none require a data migration.

## Open Questions

- Should the frontend account-bootstrap (`account-provider`'s
  auto-create-on-404, including its stuck-on-failure `hasTriedCreation`
  state — D3/D9) get its own capability, and should it stop synthesizing
  profile fields client-side (mirrors the `account-identity` open question
  about self-reported profile fields)? Deferred to Travis / orchestrator.
- Should `PUBLIC_ROUTES` (`/login`, `/oauth`, `/spike`) be asserted as a
  closed set anywhere, or is segment-match on those three (D11, pinned this
  revision) the intended contract indefinitely? The delta now specs the
  *matching rule*; the membership list is still left to code.
- Is there a real SLO for how long the blank frame (auth/account/corp
  resolution) may hold before a distinct "this is slow" affordance is
  required, distinct from "this has failed"? No design-doc-sourced number
  exists (reliability flagged this); not invented here. Extended this
  revision: the same open question applies to the wake-up flow's own
  submit control specifically — "Waking…" can hold for up to apiClient's
  120s default timeout with no cancel affordance and no distinct
  "this is taking longer than usual" state (reliability MINOR); no
  design-doc-sourced number exists for that either, so it is grouped here
  rather than invented.
- Should `use-auth.ts`'s `onAuthStateChanged` surface a distinct error state
  when Firebase Auth's own session-restore fails (SDK init failure, blocked
  persistence), the same way D6 now tells apart account/corp lookup
  failures from their loading states, and the same way D13 now surfaces a
  failed Google-redirect result? Not fixed here (reliability MAJOR,
  parallel to D3/D9's disposition) — lower-likelihood than D13's concrete
  redirect-result rejection, and reliability's own finding proposed it as an
  open question rather than a fix. Flagged to the orchestrator alongside
  D3/D9's account-bootstrap gap, not silently dropped.
- Should `corporation-spawn` bound the corporation name's server-side length
  and character class (D10, security)? Real gap, out of this change's scope.
- Is there a bound on a *persistently* malformed spawn success (the backend
  deterministically omitting `homeSystem.id` on every attempt for a given
  corp, rather than a one-off transient omission)? The delta's
  resubmission-succeeds scenario is now scoped to the transient case (m1,
  adversary MINOR) — a deterministic omission would repeat the same
  retriable error indefinitely, with no distinct state and no bound on
  retry count. No design-doc-sourced behavior exists for this today;
  flagged rather than invented, grouped with the blank-frame/submit-pending
  SLO open questions above.
- Is the focus destination after a sign-up password-mismatch error, or after
  the post-spawn navigation to the new home board, worth pinning explicitly?
  Neither is scripted in the current code (no `.focus()` call either place),
  so there is no current behavior to document truthfully; flagged rather
  than invented (ux raised this as a MINOR gap).
- Should gate-resolution failures (D6) be recorded/counted distinguishably by
  cause (`5xx` vs. `401` vs. network/timeout) for production observability?
  Reliability raised this; it reads as an implementation/telemetry detail
  (HOW to log) rather than a user-observable behavior this capability should
  mandate at requirement altitude, so it is left here as a suggestion for
  whoever implements D6's tasks, not as a spec requirement.
