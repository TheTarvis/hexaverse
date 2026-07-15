## 1. Spec authoring

- [ ] 1.1 Confirm each documentation-only requirement against
      `frontend/components/layout-wrapper.tsx`,
      `frontend/components/corporation-provider.tsx`,
      `frontend/components/wake-up-flow.tsx`,
      `frontend/app/login/page.tsx`, and (added this revision, D13)
      `frontend/hooks/use-auth.ts`.
- [ ] 1.2 Confirm the route boundary with `galaxy-view` (home route renders
      its own logged-out content; this capability does not own the
      start-area rendering, only the gating around it).

## 2. Failure-path fixes (D6 — corp/account-lookup errors)

- [ ] 2.1 `corporation-provider.tsx`: read `isError`/`error` from the corp
      `useQuery` and expose it on `CorporationContextValue` instead of
      collapsing any non-`404` failure into `needsWake`, and expose the corp
      query's `refetch` on `CorporationContextValue` so layout-wrapper can
      drive a user-triggered retry (parity with 2.2's account refetch).
- [ ] 2.2 `account-provider.tsx`: add a narrow, additive retry export (e.g.
      re-expose `refetchAccount`) for a failed account *lookup* — no change
      to the auto-create-on-404 effect itself (that stays D3/D9's unowned
      gap).
- [ ] 2.3 `layout-wrapper.tsx`: render a retriable error state for a
      corp-lookup error (2.1) and for an account-lookup error (2.2),
      distinct from the existing blank-frame and wake-up-flow branches.
      This branch MUST gate on `!isCreating` (already exposed by
      `useAccountContext()`) so an in-progress auto-creation renders the
      ordinary blank frame, not the error state — `account-provider.tsx`'s
      computed `error` field does not by itself distinguish "still
      creating" from "creation failed" (reliability, sharpened).
- [ ] 2.4 `layout-wrapper.tsx`: when the account-lookup error is a
      persisting `404` (indicating a prior auto-creation attempt failed,
      not a fresh lookup failure on an account known to exist), render a
      distinct recovery action (e.g. sign out / reload) instead of a plain
      retry control that re-issues only the account lookup — a structural
      branch on `error.status === 404`, not a copy-tone change (this does
      not fix the underlying auto-create dead end, which stays D3/D9's
      unowned gap — it only stops the UI from offering an action that
      provably cannot resolve the state).
- [ ] 2.5 Tests: a `5xx`/network corp-lookup error does not render the
      wake-up flow; a failed account lookup shows a retriable error, not an
      indefinite blank frame; an in-progress auto-creation shows the blank
      frame, not the error state; retrying a genuine (non-404) lookup
      failure resumes the normal gate; a stuck-creation (`404`) failure
      renders the sign-out/reload action rather than a plain retry control;
      retrying a corp-lookup failure (invoking the exposed corp refetch)
      re-runs `GET /v1/corporations/me` and resumes the normal gate —
      rendering the wake-up flow only if the retried lookup itself resolves
      to no living corporation.

## 3. Failure-path fixes (D7 — open redirect)

- [ ] 3.1 `app/login/page.tsx`: validate the `redirect` query parameter
      before use — accept only values starting with a single `/`, not `//`
      or `/\`-prefixed, and containing no backslash or control/whitespace
      character anywhere in the value; fall back to `/` otherwise.
- [ ] 3.2 Tests: `?redirect=//evil.example` (and other absolute/
      protocol-relative values) navigates to `/`; a backslash- or
      control-character-bearing value (e.g. `/\/evil.example`) navigates to
      `/`; `?redirect=/settings` still navigates to `/settings`.

## 4. Failure-path fixes (D8 — login error accessibility)

- [ ] 4.1 `app/login/page.tsx`: give the inline error `Text` an assertive
      live region (`role="alert"` or `aria-live="assertive"`).
- [ ] 4.2 Test: the error element is announced (queryable via its
      accessible role/live-region attribute) when a sign-in/sign-up/Google
      attempt fails.

## 5. Failure-path fix (malformed spawn response)

- [ ] 5.1 `wake-up-flow.tsx`: in the spawn mutation's `onSuccess`, move both
      `qc.invalidateQueries` calls (corp + fleets) and the `sessionStorage`
      wake-focus write **inside** the `if (res.homeSystem?.id)` branch, so
      a malformed response neither flips the wake gate nor writes a stale
      hint; in the `else` branch, show a retriable error (matching the
      existing `onError` toast pattern) and leave the flow mounted.
      Architect-sharpened: a toast alone does not satisfy "resubmittable"
      under the current unconditional-invalidation ordering — the
      invalidation guard is the fix, not an addition to it.
- [ ] 5.2 Test: a spawn success with no `homeSystem.id` shows an error,
      does NOT invalidate the corp/fleet queries or write the wake-focus
      hint, and leaves the wake-up flow mounted and resubmittable; a
      resubmission after that state succeeds via `corporation-spawn`'s
      idempotent spawn and completes the normal hand-off (invalidation,
      wake-focus hint, navigation).

## 6. Failure-path fix (login failure message uniformity)

- [ ] 6.1 `app/login/page.tsx`: replace the raw `err.message` shown for
      sign-in/sign-up credential failures with a uniform, provider-agnostic
      message for the wrong-credential and unknown-account cases (do not
      surface Firebase's `auth/user-not-found`, `auth/wrong-password`, or
      `auth/email-already-in-use` strings verbatim).
- [ ] 6.2 Confirm (or file separately, if not already true) that the
      Firebase project has email-enumeration protection enabled, since this
      requirement's guarantee depends on it.
- [ ] 6.3 Test: a sign-in failure for a non-existent email and a sign-in
      failure for a wrong password on an existing email render the same
      message; a sign-up on an already-registered email does not render a
      distinguishing message.

## 7. Failure-path fix (D11 — public-route matching by path segment)

- [ ] 7.1 `layout-wrapper.tsx`: change `PUBLIC_ROUTES` matching from
      `pathname?.startsWith(route)` to a segment-boundary check (exact
      match, or `route + '/'` prefix).
- [ ] 7.2 Test: a hypothetical/synthetic route sharing a public-route
      string prefix (e.g. `/oauth-admin`) is gated, not public; `/oauth`
      and `/oauth/callback` remain public.

## 8. Failure-path fix (D13 — silent mobile Google redirect failure)

- [ ] 8.1 `hooks/use-auth.ts`: surface `getRedirectResult(auth)`'s
      rejection as state (e.g. a new returned `redirectError`) instead of
      only `console.error`-ing it.
- [ ] 8.2 `app/login/page.tsx`: read that state on mount and, if present,
      render it through the same inline error surface and live region used
      for a failed sign-in/sign-up/popup attempt.
- [ ] 8.3 Test: a rejected/cancelled `getRedirectResult` shows the inline
      login error; a successful redirect result shows no error and the
      existing post-authentication redirect proceeds unchanged.

## 9. Test-coverage addition (ux minor — submit pending-state parity)

- [ ] 9.1 Test: activating the wake-up flow's submit control with a valid
      name disables it (and the name field) until the spawn request
      resolves — parity with the equivalent login-form scenario.

## 10. Validation

- [ ] 10.1 `openspec validate add-session-wakeup-spec --strict`
- [ ] 10.2 Existing test suites (`corporation-service.test.ts`,
      `layout-wrapper.test.tsx`) updated to cover the new corp/account
      error branches (including the creation-in-progress and
      stuck-creation-retry distinctions) rather than only loading and
      legitimate-404 cases.
