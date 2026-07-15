## Why

`frontend/app/login/`, `components/layout-wrapper.tsx`,
`components/corporation-provider.tsx`, and `components/wake-up-flow.tsx`
implement the frontend's auth → corp-resolution → wake gate, which the
`galaxy-view` baseline already assumes ("wake-up focus handoff") without
owning. This closes that gap from the running code, and resolves the
retrofit analysis's open question about the boundary between this flow and
`galaxy-view`'s logged-out start area (they are different routes — `/login`
is the auth form; `/` is the galaxy view, gated separately) directly from
`components/layout-wrapper.tsx`. Two rounds of specialist-panel review of
the initial documentation-only baseline surfaced a set of concrete,
in-scope defects in the gate's failure paths (error states mistaken for
"not yet spawned," an unvalidated open redirect, a login error invisible to
screen readers, a silent dead end on a malformed spawn response, a
credential-enumeration leak, loose public-route matching, and a silent
mobile Google-redirect sign-in failure); this revision documents the
baseline **and** specifies the corrected behavior for those, since each is
small and (with one narrow, deliberate scope addition — see D13) squarely
inside the files this change owns (see `design.md` D6–D8 and D11–D13 for
what's fixed here vs. D9/D10 for what's flagged out of scope instead).

## What Changes

- Add a new `session-wakeup` capability (frontend) documenting current,
  as-built behavior: the public/gated route split, the wake gate driven by
  `GET /v1/corporations/me`, the wake-up flow (name → spawn → route to the
  new home system's board), and the `/login` auth form route.
- Specify (and implement) the following failure-path corrections:
  - `corporation-provider.tsx` SHALL stop treating a corp-lookup error
    (non-`404`) the same as "no corporation yet."
  - `layout-wrapper.tsx` (plus one narrow, additive export from
    `account-provider.tsx`) SHALL surface an account-lookup failure as a
    retriable error instead of an indefinite blank frame — SHALL NOT show
    that error while auto-creation is merely in progress, and, when the
    failure is a persisting `404` from a stuck account-creation attempt
    rather than a fresh lookup failure, SHALL offer a distinct recovery
    action (e.g. sign out / reload) instead of a plain retry that only
    re-issues the same lookup (refined this revision — dedupes ux +
    reliability findings; sharpened again to a structural, testable
    distinction rather than a wording constraint).
  - `app/login/page.tsx` SHALL treat the `redirect` query parameter as a
    same-origin path only, never an open redirect, and SHALL additionally
    reject any value containing a backslash or control/whitespace character
    (refined this revision). **BREAKING**: any existing deep link relying
    on an absolute/protocol-relative `redirect` target stops working (none
    are known to be in use).
  - `app/login/page.tsx`'s inline error SHALL be exposed in a live region
    for assistive technology.
  - `wake-up-flow.tsx` SHALL, on a malformed spawn success (no home system
    id), withhold the cache-invalidation and wake-focus-hint write so the
    gate does not flip and the flow stays mounted and resubmittable,
    showing a retriable error rather than a toast layered over an
    unmountable flow (corrected this revision — the prior scenario text
    understated what the fix required; see `design.md` D5).
  - `app/login/page.tsx` SHALL show a uniform, provider-agnostic error for
    sign-in/sign-up credential failures (wrong password vs. unknown
    account vs. already-registered email are not distinguishable), closing
    an account-enumeration leak (new this revision, security).
  - `layout-wrapper.tsx`'s `PUBLIC_ROUTES` match SHALL be by full path
    segment, not bare string prefix (new this revision, security).
  - `hooks/use-auth.ts` (new file in this change's scope, D13) SHALL
    surface a failed/cancelled mobile Google-redirect sign-in as state, and
    `app/login/page.tsx` SHALL render it through the existing inline error
    surface, instead of silently returning the visitor to an unremarkable
    login form (new this revision, reliability BLOCKER).
- Everything else in the delta documents current, unchanged behavior
  (route gating, blank-frame states, wake-up flow mechanics, login pending
  states, credential/name persistence on failure) — no code change for
  those requirements.

## Impact

- Affected specs: `session-wakeup` (new)
- Affected code: `frontend/app/login/page.tsx` (redirect validation
  including backslash/control-char hardening, error live region, uniform
  credential-failure message, rendering the redirect-sign-in error),
  `frontend/components/layout-wrapper.tsx` (account/corp error surfacing,
  gated on `!isCreating`; public-route segment-boundary matching),
  `frontend/components/corporation-provider.tsx` (corp-lookup error
  surfacing), `frontend/components/account-provider.tsx` (additive retry
  export only — no change to its auto-create behavior),
  `frontend/components/wake-up-flow.tsx` (malformed-response handling,
  invalidation guard), `frontend/hooks/use-auth.ts` (new file this
  revision, D13 — additive: surface the mobile Google-redirect result's
  rejection as state; no change to its sign-in/sign-up/redirect-initiation
  behavior). Everything else in this file list is otherwise read-only for
  this change.
- Not in scope (flagged, not fixed here — see `design.md` D9/D10):
  `account-provider.tsx`'s auto-create-on-404 dead end on creation failure
  (root cause); `backend/corporations/service.go`'s unbounded corporation
  name (a future `corporation-spawn`-scoped change — this revision's
  security review supplied paste-ready requirement text for that future
  change, recorded in `design.md` D10, but does not add it here);
  `hooks/use-auth.ts`'s `onAuthStateChanged` having no distinct
  session-restore-failure state (reliability, parallel to D3/D9 — flagged,
  not fixed, since it is speculative/lower-likelihood versus the concrete
  redirect-result failure D13 does fix).
