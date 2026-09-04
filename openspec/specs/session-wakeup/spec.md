# session-wakeup Specification

## Purpose
TBD - created by archiving change add-session-wakeup-spec. Update Purpose after archive.
## Requirements
### Requirement: Public Routes Render Ungated
The system SHALL render `/login`, `/oauth`, and `/spike` — and any route
that equals one of these paths or is a sub-path of one (`<route>` itself, or
`<route>/…`) — without any authentication or wake gating — no redirect, no
blank frame, no wake-up flow — regardless of auth state. Matching SHALL be
by full path segment, never by bare string prefix, so a route that merely
starts with the same characters (e.g. `/oauth-admin`, `/spike-internal`) is
not treated as public.

#### Scenario: Login renders for a logged-out visitor
- **WHEN** a logged-out visitor loads `/login`
- **THEN** the login form renders directly, with no gating

#### Scenario: Login renders even for an authenticated user before redirect
- **WHEN** an authenticated user's session is still resolving on a public
  route
- **THEN** the public route renders ungated (public routes never hold a
  blank frame waiting on auth)

#### Scenario: A path that merely shares a public-route prefix is still gated
- **WHEN** a route's path starts with a public-route string but is not that
  route or a sub-path of it (e.g. `/oauth-admin` vs. `/oauth`,
  `/spike-internal` vs. `/spike`)
- **THEN** it is treated as a gated route, not a public one

### Requirement: Unauthenticated Visitors Are Redirected to Login, Except on the Home Route
The system SHALL, once authentication has resolved and found no signed-in
user, redirect to `/login` for any route that is neither a public route
(above) nor the home route (`/`) — the home route is the one exception,
serving the galaxy view's own logged-out start area (see `galaxy-view`)
instead of a redirect.

#### Scenario: A logged-out visitor on a gated route is redirected to login
- **WHEN** an unauthenticated visitor's session has resolved and they are
  on a route other than a public route or the home route
- **THEN** they are redirected to `/login`

#### Scenario: A logged-out visitor on the home route is not redirected
- **WHEN** an unauthenticated visitor's session has resolved and they are
  on the home route (`/`)
- **THEN** no redirect occurs — the route renders its own logged-out
  content (the galaxy view's frozen start area)

#### Scenario: No redirect fires while auth is still resolving
- **WHEN** authentication has not yet resolved
- **THEN** no redirect to `/login` occurs, even on a gated route

### Requirement: Gated Routes Blank While Auth or Account Resolution Is In Flight
The system SHALL, on any route that is neither a public route nor the home
route, render nothing (a blank frame) while authentication or the backend
account lookup has not yet resolved — including while a
Firebase-authenticated visitor's backend account is still resolving, before
the corporation lookup begins — rather than any partial content, redirect
flash, or app chrome.

#### Scenario: A gated route blanks while auth or account resolution is in flight
- **WHEN** a visitor lands on a gated, non-public, non-home route and
  authentication or the backend account lookup has not yet completed
- **THEN** nothing renders until it resolves (no partial content, no flash
  of either the login redirect or the app)

#### Scenario: A signed-in visitor whose backend account is still resolving does not reach the wake gate
- **WHEN** a Firebase-authenticated visitor's backend account record has
  not yet resolved (so the corporation lookup has not begun)
- **THEN** nothing renders (no wake-up flow, no app content) until the
  account, and then the corporation status, resolve

### Requirement: An Account-Lookup Failure Shows a Retriable Error, Not an Indefinite Blank Frame
The system SHALL, when the backend account lookup fails for a signed-in
user on a route that is neither a public route nor the home route, render
a retriable error state in place of the blank frame, with a visible way to
retry, rather than leaving the route blank indefinitely. The system SHALL
NOT render this error state while account auto-creation (the one-time
bootstrap that follows a first-time 404) is in progress. When the
surfaced failure is a persisting `404` (indicating a prior auto-creation
attempt failed, rather than a lookup failure on an account known to
exist), the error state SHALL NOT present a retry control that re-issues
only the account lookup; it SHALL instead offer a distinct recovery
action (e.g. sign out / reload) — so the UI never presents an action that
provably cannot resolve the state.

#### Scenario: A failed account lookup shows a retriable error instead of staying blank
- **WHEN** a signed-in user's backend account lookup fails on a gated,
  non-home route
- **THEN** a retriable error state renders in place of the blank frame,
  with a visible way to retry

#### Scenario: Retrying a failed account lookup resumes the normal gate
- **WHEN** the user retries after an account-lookup failure and the retry
  succeeds
- **THEN** the gate resumes its normal resolution (account, then
  corporation, then wake-up or app content)

#### Scenario: An in-progress account auto-creation is not shown as a lookup failure
- **WHEN** a signed-in user's backend account is being auto-created (the
  one-time bootstrap following a first-time 404) and that creation has not
  yet succeeded or failed
- **THEN** the gate shows its ordinary blank-frame resolving state, not the
  account-lookup-failure error state

#### Scenario: A stuck account-creation failure does not present retry as certain to succeed
- **WHEN** the account-lookup-failure error state is showing because a
  prior account-creation attempt failed (not because a lookup on an account
  known to exist failed) — surfaced as a persisting `404`
- **THEN** the error state offers a sign-out/reload action, not a plain
  retry control that re-issues only the account lookup (which would
  provably repeat the same `404`)

### Requirement: Corp-Resolution Gate Holds a Blank Frame
The system SHALL, for a signed-in user whose living-corporation lookup
(`GET /v1/corporations/me`) has not yet resolved, render nothing (a blank
frame) rather than flashing either the wake-up flow or the playable app,
so a corpless-vs-woken determination is never guessed at ahead of the
actual answer.

#### Scenario: A signed-in user sees a blank frame while corp status resolves
- **WHEN** a signed-in, authenticated user's corporation lookup is still
  in flight
- **THEN** nothing renders (no wake-up flow, no app content) until it
  resolves

### Requirement: A Corp-Lookup Failure Shows a Retriable Error, Not the Wake-Up Flow
The system SHALL, when the corporation lookup (`GET /v1/corporations/me`)
fails for a reason other than "no living corporation" (any status other
than `404`, or a network failure) **and no living corporation is already
known for the session**, render a retriable error state distinct from the
wake-up flow, and SHALL NOT treat the failure as evidence of corplessness.
A failure of a background refetch while a corporation is already resolved
SHALL keep serving the resolved app, not replace it with the error state.

#### Scenario: A network or server error on corp lookup does not trigger the wake-up flow
- **WHEN** a signed-in user's corporation lookup fails with a network or
  server error (not a `404`), and no living corporation is already known
  for the session
- **THEN** a retriable error is shown instead of the wake-up flow

#### Scenario: Retrying a failed corp lookup resumes the normal gate
- **WHEN** the user retries after a corp-lookup failure and the retry
  succeeds
- **THEN** the gate resumes normally — the wake-up flow renders only if
  the retried lookup itself resolves to "no living corporation"

#### Scenario: A background refetch failure does not evict a woken player
- **WHEN** a signed-in user whose living corporation is already resolved
  triggers a corp-lookup refetch (e.g. on window refocus) that fails with a
  network or server error
- **THEN** the app content remains rendered from the last-known
  corporation; the retriable error state does not replace it

### Requirement: Corpless Wake-Up Gate
The system SHALL, once a signed-in user's corporation lookup has resolved
to "no living corporation" (the backend's `404` on
`GET /v1/corporations/me`), render the wake-up flow full-screen in place
of the rest of the app, and SHALL NOT render the playable galaxy or any
other gated route content until spawn succeeds.

#### Scenario: A corpless signed-in user sees the wake-up flow
- **WHEN** a signed-in user's corporation lookup resolves to no living
  corporation
- **THEN** the wake-up flow renders full-screen, replacing all other
  content

#### Scenario: A woken user never sees the wake-up flow
- **WHEN** a signed-in user has a living corporation
- **THEN** the wake-up flow does not render; the app's own routed content
  renders instead, with the floating navigation chrome

### Requirement: Wake-Up Flow Requires a Name Before Submitting
The system SHALL disable the wake-up flow's submit control until the
player has entered a non-empty (post-trim) lineage name, and SHALL disable
it again while a spawn request is in flight.

#### Scenario: Submit is disabled with no name entered
- **WHEN** the wake-up flow renders with an empty name field
- **THEN** its submit control is disabled

#### Scenario: Submit enables once a name is entered
- **WHEN** the player types a non-whitespace name into the field
- **THEN** the submit control becomes enabled

#### Scenario: The name field is focused on mount
- **WHEN** the wake-up flow renders
- **THEN** the name field holds keyboard focus, so a new player can begin
  typing immediately without clicking

#### Scenario: Submit disables again once a spawn request is in flight
- **WHEN** the wake-up flow's submit control is activated with a valid name
- **THEN** the submit control (and the name field) enter a pending state and
  further submissions are blocked until the spawn request resolves

### Requirement: Successful Spawn Hands Off to the Home Board
The system SHALL, on a successful wake-up submission, cause the wake gate
to re-evaluate so the newly woken corporation and its first fleet become
visible without a manual reload, record the new home system's id as a
wake-focus hint for `galaxy-view`'s later use, and navigate directly to
that home system's space-view route (`system-space-view`) — never to the
galaxy view first.

#### Scenario: A successful spawn routes to the new home system's board
- **WHEN** the wake-up flow's spawn call succeeds with a home system id
- **THEN** the wake gate re-evaluates so the new corporation and fleet
  appear, and the app navigates to that home system's space-view route

#### Scenario: The wake-focus hint is recorded for the galaxy view
- **WHEN** a successful spawn returns a home system id
- **THEN** that id is recorded as a wake-focus hint (best-effort; its
  absence is non-fatal) for `galaxy-view` to consume if the player later
  opens the galaxy

#### Scenario: A malformed success response does not leave the flow silently stuck
- **WHEN** a wake-up spawn call succeeds but the response omits a home
  system id
- **THEN** the corporation/fleet cache invalidation and the wake-focus-hint
  write are withheld (the wake gate does NOT re-evaluate and does not flip
  away from the wake-up flow on this response), and the flow shows a
  retriable error while remaining mounted and resubmittable

#### Scenario: A resubmission after a transient malformed response succeeds normally
- **WHEN** the player resubmits from the wake-up flow after a malformed
  success response caused by a transient omission (the resubmission's
  response includes the home system id)
- **THEN** the resubmission rides `corporation-spawn`'s idempotent-spawn
  guarantee (the same corporation and home system already created), and —
  being well-formed — the gate re-evaluates, the wake-focus hint is
  recorded, and the player is routed to the home system's space view
  normally

#### Scenario: Resubmitting after a client-side timeout does not mint a second hull
- **WHEN** the wake-up flow's spawn call times out client-side after the
  backend has already created the corporation, and the player resubmits
- **THEN** the resubmission returns the same existing corporation and home
  system (per `corporation-spawn`'s idempotent spawn), not a second hull

### Requirement: Spawn Failure Shows a Retriable Error, Not a Blank Screen
The system SHALL, when a wake-up spawn request fails for any reason
(including the backend's `503` when no spawn site is available), show a
retriable error notification and leave the wake-up flow visible and
resubmittable, rather than navigating away or leaving a blank screen.

#### Scenario: A spawn failure leaves the flow visible with an error shown
- **WHEN** the wake-up flow's spawn call fails
- **THEN** an error notification is shown and the wake-up flow remains
  rendered, ready for another submission attempt

#### Scenario: A failed spawn preserves the entered name
- **WHEN** a wake-up spawn call fails
- **THEN** the name the player entered remains in the field, ready for
  resubmission without retyping

### Requirement: Login Route Supports Sign-In, Sign-Up, and Google, With Redirect Handoff
The system SHALL serve `/login` with a toggle between sign-in and sign-up
modes (sign-up additionally requiring and validating a matching
confirm-password field before submitting), a "Continue with Google" option,
and SHALL, once authentication resolves to a signed-in user, navigate to
the validated `redirect` target (see "Login Redirect Target Is Same-Origin
Only" for the validation rule) rather than leaving the user on the login
form.

#### Scenario: Sign-in mode is the default
- **WHEN** `/login` loads with no `signUp` query parameter
- **THEN** it renders in sign-in mode (no confirm-password field)

#### Scenario: The signUp query parameter opens sign-up mode directly
- **WHEN** `/login` loads with `signUp=true`
- **THEN** it renders in sign-up mode with the confirm-password field
  shown

#### Scenario: Mismatched passwords block sign-up submission
- **WHEN** the sign-up form is submitted with a confirm-password value
  that does not match the password field
- **THEN** an error is shown and no sign-up request is made

#### Scenario: A sign-in failure shows an error inline
- **WHEN** a sign-in attempt fails
- **THEN** an error message is shown on the login form (see "Login Failures
  Do Not Reveal Whether an Account Exists" for what that message may say on
  a credential/unknown-account failure), and the user remains on `/login`

#### Scenario: Submitting sign-in or sign-up shows a pending state and blocks double submission
- **WHEN** the sign-in or sign-up form is submitted
- **THEN** the submit control enters a pending state and further
  submissions are blocked until the request resolves

#### Scenario: Continue with Google shows a pending state
- **WHEN** "Continue with Google" is activated
- **THEN** the control enters a pending state and cannot be re-triggered
  until the attempt resolves

#### Scenario: A failed attempt preserves entered credentials
- **WHEN** a sign-in, sign-up, or Google attempt fails
- **THEN** any email/password already entered remains in the form (the
  user is not made to retype it)

### Requirement: Login Redirect Target Is Same-Origin Only
The system SHALL treat the `redirect` query parameter as a same-origin
relative path only — accepting it solely when it begins with a single `/`,
is not `//`- or `/\`-prefixed, and contains no backslash (`\`) or
control/whitespace character anywhere in the value — and SHALL fall back to
`/` for any absolute URL, protocol-relative URL, backslash- or
control-character-bearing value, or other non-local value, so the
post-authentication login handoff can never navigate an authenticated
visitor to an attacker-controlled origin.

#### Scenario: A successful sign-in redirects to the target
- **WHEN** authentication resolves to a signed-in user while on `/login`
  with `?redirect=/settings`
- **THEN** the app navigates to `/settings`

#### Scenario: An off-site redirect target is refused
- **WHEN** `/login` is loaded with `?redirect=//evil.example` (or any
  absolute or protocol-relative URL) and authentication resolves to a
  signed-in user
- **THEN** the post-authentication navigation goes to `/`, never to the
  off-site target

#### Scenario: A redirect value containing a backslash or control character is refused
- **WHEN** `/login` is loaded with a `redirect` value that begins with `/`
  but contains a backslash or a control/whitespace character (e.g.
  `/\/evil.example`) and authentication resolves to a signed-in user
- **THEN** the post-authentication navigation falls back to `/`, never
  following the value (accepted redirect targets are a single leading `/`
  followed only by printable, non-backslash path characters)

### Requirement: Login Failures Do Not Reveal Whether an Account Exists
The system SHALL present sign-in and sign-up credential failures with a
uniform, provider-agnostic message for the wrong-credential and
unknown-account cases, so the login form cannot be used to enumerate which
email addresses have registered accounts, and SHALL rely on the identity
provider's email-enumeration protection being enabled. The raw provider
error code or message — including, but not limited to, `auth/user-not-found`,
`auth/wrong-password`, `auth/invalid-credential` (the single code Firebase
returns for both wrong-password and unknown-account sign-in attempts once
enumeration protection is enabled), and `auth/email-already-in-use` —
SHALL NOT be shown verbatim on these paths. A non-credential failure (e.g.
`auth/network-request-failed`, `auth/too-many-requests`,
`auth/user-disabled`) SHALL NOT be presented using the credential-uniform
copy; it SHALL show a separate, neutral generic-failure message instead, so
a transient or account-status failure is never reported as a wrong email or
password. This raw-provider-string prohibition also covers the mobile
Google-redirect path (see "A Failed Google Redirect Sign-In Shows an
Error, Not a Silent Return"), so the OAuth channel cannot leak what the
credential paths already withhold.

#### Scenario: A wrong password and an unknown account are indistinguishable
- **WHEN** a sign-in attempt fails because no account exists for the email,
  and separately because the password is wrong
- **THEN** the same generic error message is shown in both cases, revealing
  nothing about account existence

#### Scenario: A credential failure shows the app's uniform copy, not the provider string
- **WHEN** a sign-in attempt fails with a provider error whose message is
  `Firebase: Error (auth/invalid-credential)`
- **THEN** the inline error shows the application's uniform
  credential-failure copy, and the raw provider string is not rendered

#### Scenario: A sign-up on an existing email does not confirm the account exists
- **WHEN** a sign-up attempt fails because the email is already registered
- **THEN** the error shown does not distinguish "already registered" from
  other sign-up failures

#### Scenario: A non-credential sign-in error is not labeled as a credential failure
- **WHEN** a sign-in attempt fails with a non-credential provider error
  (e.g. `auth/network-request-failed` or `auth/too-many-requests`)
- **THEN** the inline error shows a neutral generic-failure message —
  neither the credential-specific copy nor the raw provider string — so a
  transient failure is not reported as a wrong email or password

### Requirement: Login Errors Are Announced to Assistive Technology
The system SHALL expose the login form's inline error message in a way
that assistive technology announces automatically when it appears (e.g. an
assertive live region), not only as visible red text.

#### Scenario: A sign-in error is announced
- **WHEN** a sign-in, sign-up, or Google attempt fails and the inline
  error renders
- **THEN** the error is exposed in a live region so a screen-reader user
  is notified without needing to re-scan the page

### Requirement: A Failed Google Redirect Sign-In Shows an Error, Not a Silent Return
The system SHALL, when a mobile Google sign-in redirect flow
(`signInWithRedirect`) was initiated and the browser's return to `/login`
does not produce a signed-in user — whether because the redirect result
rejects (the user cancels or is denied at Google, or the flow otherwise
errors) or because the redirect result resolves with no user despite a
redirect having been initiated — surface a visible, retriable error on
`/login`, using the same inline error surface and live region as a failed
sign-in/sign-up/popup attempt, rather than silently returning the visitor
to an unremarkable, non-pending login form with no explanation. An
ordinary page load on which no Google redirect sign-in was initiated SHALL
NOT surface this error, even though the redirect result also resolves with
no user on that load. When the redirect result rejects with an
identity-provider error, the message surfaced on `/login` SHALL be a
neutral, provider-agnostic message — the same class of copy as a failed
popup sign-in — and SHALL NOT contain the raw identity-provider error
string (no `auth/…` code, no `Firebase` provider text), so the
OAuth-redirect channel cannot be used to leak a provider error string or an
account-existence signal, consistent with "Login Failures Do Not Reveal
Whether an Account Exists".

#### Scenario: A cancelled Google redirect sign-in shows an error on return
- **WHEN** a mobile visitor initiates "Continue with Google," is redirected
  to Google, and returns to `/login` without a signed-in user resulting
  (cancelled, denied, or failed — whether the redirect result rejects or
  resolves with no user)
- **THEN** an inline error is shown on `/login`, in the same live region as
  other login errors, explaining that sign-in did not complete

#### Scenario: A rejected redirect result does not leak the raw provider error
- **WHEN** the Google redirect flow returns and `getRedirectResult` rejects
  with an identity-provider error (e.g. `auth/account-exists-with-different-credential`
  or `auth/network-request-failed`)
- **THEN** the inline login error shows a neutral, provider-agnostic message
  (e.g. that sign-in did not complete) and does NOT render the raw provider
  string (no `auth/…` code, no `Firebase` provider text) or any signal of
  whether the account exists

#### Scenario: A successful Google redirect sign-in still redirects normally
- **WHEN** a mobile visitor completes the Google redirect flow successfully
- **THEN** the existing post-authentication redirect-to-target behavior
  fires unchanged, with no error shown

#### Scenario: An ordinary page load with no redirect initiated shows no error
- **WHEN** a visitor loads `/login` directly, having never initiated a
  Google redirect sign-in in this browser
- **THEN** no redirect-sign-in error is shown, even though the redirect
  result resolves with no user on this load

