# Authenticated phone preview

Status: protected preview active, 2026-10-16. Current user-approved endpoint is
https://gulf-identity-scrap.ngrok-free.dev/ for exact Google identity
wilson.travis.t@gmail.com until 2026-10-19T00:00:00Z, with no paid charges.
Email signup is approved at `/login?signUp=true`; simulated Google sign-in is now
available at `/login`. Travis enters his own test credentials or chooses the
emulator identity himself. Travis confirmed simulated SSO works on actual iOS on
2026-10-16; session persistence, token refresh and gameplay checks remain unverified.
Earlier proposal/activation sections below are historical checkpoints; the latest
signup/SSO checkpoint controls current access scope.

## Current environment

The local setup audit found ngrok, Vercel, gcloud and Firebase CLIs installed,
with ngrok configured; it found no tailscale, cloudflared or caddy. Configuration
presence does not prove an active account, plan, authorization or viable endpoint.
No credentials are included here.

Ports derive from [ports.env](../ports.env): frontend 20200, Go API 20201,
Auth emulator 20211, Firestore 20212, Pub/Sub 20214. Python 20202 has no current
production callers and is optional for this gameplay preview. Verify running
services and seeded local data before testing.

A frontend-only HTTPS tunnel fails: [API client](../frontend/lib/api-client.ts)
and [Firebase setup](../frontend/lib/firebase.ts) currently target loopback HTTP
services from the browser. On an iPhone, loopback means the phone itself; mixing
HTTPS with HTTP also fails browser security constraints.

## Recommended temporary route — pending approval

Use one ngrok HTTPS endpoint, protected on every application/API/auth route by
Google OAuth plus an exact email allowlist for Travis, forwarding to a loopback
HTTP gateway. ngrok documents both [OAuth and email restrictions](https://ngrok.com/docs/gateway/traffic-policy/actions/oauth).
The outer gate controls access; game authentication and corporation authorization
still apply inside it.

The gateway would route the app to 20200, a relative `/api` prefix to 20201,
and only the Auth-emulator REST paths actually required by sign-in/token refresh
to 20211. Keep emulator admin/UI, Firestore, Pub/Sub and debug services private.
Implement a narrow allowlist after observing the required auth requests; do not
proxy the whole emulator surface. Bind local listeners to loopback and verify
unauthorized requests cannot bypass the outer gate through another endpoint.

Prepare a reversible preview configuration patch for relative API calls and an
explicit HTTPS auth-emulator URL. Preserve ordinary local development defaults.
Match Firebase emulator project identity and backend data identity; use local
test/emulator users and data, not production. Test login, refresh, logout and
corporation authorization on the actual phone, including redirects/cookies.

The [SSE route](../backend/router.go) uses a bearer token in its query. A gateway
must preserve streaming flush/heartbeat behavior and avoid logging sensitive
queries. The audit found a 30-second heartbeat and no current world EventSource
consumer; current world refresh relies on polling. Preserve any development
websocket upgrade needed by the frontend, or use a local production build.

## Costs and alternatives

ngrok's [published free limits](https://ngrok.com/docs/pricing-limits/free-plan-limits)
currently include 1 GB outbound, 20,000 HTTP requests/month and three OAuth
identities. The actual account plan and remaining quotas are unverified; world
polling can exhaust the request budget. Verify dashboard quotas before choosing
this route. No purchase or paid plan change is authorized.

Cloud configuration exists for [Vercel](../infra/terraform/vercel.tf) plus
[Cloud Run](../infra/terraform/cloudrun.tf), including backend service
`hexaverse-backend` in `us-central1`. Dev project is `hexaverse-game-dev`; prod is
`hexaverse`. Cloud inventory/billing remain unverified because CLI inspection
was permission-blocked. Existing environment tfvars contain stale Flywheel
configuration; do not apply them as a shortcut. [Backend CORS](../backend/router.go)
starts from empty allowed origins outside local mode and needs deliberate
configuration before cloud startup. Cloud deployment is a larger separate choice.

## Decision and verification before enabling

Confirm temporary ngrok access, the exact allowed Google identity and account
quotas. Review the gateway routes/config patch before starting exposure. Then
verify an unauthenticated/disallowed visitor is denied on app, API and auth;
Travis can sign in, load the same test corporation, inspect objects, review/commit
travel and reconnect; no browser request targets localhost on his phone; and
private service/admin routes remain unreachable. Stop and remove the temporary
endpoint after testing. The [project checklist](../.scratch/weekend-visual-batch/status.md)
tracks approval and operational state; [HUD acceptance](hud.md) tracks usability.

## Action-time audit — 2026-10-16

- Installed `/opt/homebrew/bin/ngrok`, version **3.39.6**; `ngrok config check`
  validates the existing configuration. An authtoken is configured, but its
  validity/account entitlement has not been tested by connecting an agent.
  Dashboard navigation reaches login, so account plan, quota and billing remain
  unverified. No login, new grant or tunnel was created during this audit.
- Published free entitlement includes HTTPS, five policy rules and three monthly
  OAuth identities. Managed Google OAuth plus exact-email denial needs no new
  OAuth client secret. This fits published free capabilities, but is not evidence
  that the existing account can run it without charges. Verify its actual plan
  before starting; do not upgrade or use a paid endpoint as a fallback.
- Existing local config disagrees: backend `.env.local` uses `hexaverse-emulator`
  for Firebase/GCP, while frontend `.env.local` uses `hexaverse-game-dev`.
  These are configuration files, not a verified process-environment dump. Match
  the preview's project identity deliberately before login, without migrating or
  overwriting existing data. Backend config points Auth/Firestore/PubSub to local
  emulators. Confirm effective connections before exposing any game data.
- Services currently listen on wildcard addresses at 20200, 20201 and 20211.
  No ngrok agent inspector listens on 4040. Do not change those existing listeners
  silently; the added gateway would bind only to loopback and expose one origin.

### Smallest gameplay route

Prefer an existing email/password **test-emulator account** inside the Google
outer gate. That avoids exposing the emulator's simulated Google identity picker
or changing Firebase production authorized domains. The proposed gateway map is:

| Public request | Local destination / restriction |
| --- | --- |
| App pages and assets | `127.0.0.1:20200`; block development/debug and service-admin surfaces, or serve an isolated local production build configured explicitly for emulators |
| `/api/v1/…` | Strip `/api`, forward only required game/account route-and-method allowlist to `127.0.0.1:20201`; exclude push, administrative and debug routes |
| `/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword` | POST only to Auth emulator 20211 |
| `/identitytoolkit.googleapis.com/v1/accounts:lookup` | POST only to Auth emulator 20211 |
| `/securetoken.googleapis.com/v1/token` | POST only to Auth emulator 20211 |
| Other emulator host-prefixed paths, emulator admin/export/import/config/users/UI, Firestore, PubSub | Deny; never fall through to the app |

The three Auth paths are verified SDK code paths, not a completed browser network
trace. Observe an isolated local sign-in/restore/refresh flow and test the final
allowlist before enabling exposure. No signup, reset-password, account editing,
anonymous sign-in or Google emulator popup route is needed for this minimum.
The SDK strips any path prefix from connectAuthEmulator, so the three exact
host-prefixed paths must be at the origin root; an `/auth` prefix would fail.
Production-build emulator support requires an explicit opt-in patch: the present
Firebase setup enables emulators only in development. A relative `/api` base and
same-origin HTTPS emulator origin URL also need a reversible patch.

All routes first pass ngrok Google OAuth and an exact approved identity allowlist.
`wilson.travis.t@gmail.com` is a suggested identity awaiting Travis's approval,
not an installed access rule. Managed OAuth can ask for basic profile/email
consent; no Drive/Gmail access is required. Existing ngrok agent token suffices if
valid; no new API key or persistent grant is needed. Do not bypass a consent screen.

Preserve ngrok session/nonce cookies unchanged and same-origin credentialed API
requests. Start Google authentication through a top-level page; expired outer
sessions can return redirects/HTML to fetch/SSE, requiring reauthentication and
reconnect rather than treating HTML as game JSON. Preserve Firebase bearer tokens.
SSE must flush immediately, retain 30-second heartbeats, avoid buffering and omit
query tokens from gateway/inspector logs. Current world polling still needs quota
monitoring; SSE is not a substitute already wired into that view.

Updated proposed duration, pending the explicit access confirmation: through
Sunday2026-10-18 at20:00 America/New_York, which is2026-10-19T00:00:00Z.
Travis requested all-weekend access;60 minutes was only our earlier proposed pilot,
not a provider limit. Do not activate or retain the old60-minute cutoff if this
weekend scope is approved. Stop ngrok and gateway processes on cutoff or
request, confirm the URL no longer reaches the app, and remove only temporary
preview configuration. Do not install launch agents or background persistence.
Mac awake/network availability is required; ngrok free endpoints do not expire
on their own. A duration request alone does not confirm the pending exact-identity access policy.

## Local preparation completed — 2026-10-16

The [preview utilities](../harness/utilities/phone-preview/README.md) now prepare
a separate production frontend on loopback20205 and a deny-by-default gateway
on loopback20204. Static Storybook is served at `/storybook/` from an isolated
build. Browser verification through that actual prefix covered manager navigation,
iframe JS, all14 thumbnail instances and the world scene with accepted gate GLB
rendering on WebGPU. This confirms local prefix/asset compatibility, not ngrok,
OAuth cookies or iOS. Exact root model paths forward to the isolated frontend.

The game production build succeeded with explicit preview-only project identity,
relative API and same-origin Auth settings. Its ignored TypeScript config/build
cache prevents Next from modifying the ordinary tracked tsconfig. The frontend
and gateway can run in explicit HTTP127.0.0.1 local QA mode; external mode still
requires the exact HTTPS origin and a separately approved authentication gate.
No `.env` files, users or data were changed. Effective backend project and test
account identity still require verification before sign-in; the local build's
project argument is not proof of the running backend environment.

Gateway/helper tests pass18 cases, including Origin checks, forbidden routes,
encoded traversal, confined static files, body limits and immediate SSE flushing.
No tunnel or outer OAuth session has been created; exact-identity/weekend exposure
approval and actual account plan/quota remain pending.

## Bounded weekend shutdown preparation

The proposed weekend deadline remains pending access approval, not active. External
HTTPS gateway launches require an explicit `--until` deadline; loopback-only QA
can remain unbounded. Check wall-clock expiry before every request, close active
connections/streams and stop listening at expiry, and refuse startup with an
expired deadline. This bounds app/Storybook/API/Auth access even if the outer
ngrok agent were accidentally left running. It does not claim a provider-side
expiration feature or revoke an account credential.

Keep ngrok, isolated frontend and gateway as foreground processes owned by this
preview; install no launch agent, cron job, service or automatic restart. At cutoff
stop those owned processes, verify ports20204/20205 have no listeners and verify
the exact external URL cannot reach the application. Leave the user's ordinary
development services untouched. Request checks fail closed after wake from sleep;
the Mac must remain awake/online for availability during the approved window.
No prior OAuth authorization extends the approved deadline automatically.

Quota planning: `useSurveyOptions` currently polls every1 second while an owned
fleet's celestial controls are mounted (`frontend/hooks/use-discovery.ts`). That
single active query can use3,600 requests/hour;20,000 requests would cover less
than5.6 hours before other requests/assets. Baseline world polling is20 seconds
and selected burn-preview refresh is10 seconds. A weekend access window does not
mean the free monthly request quota supports a continuously open game tab. Check
remaining quota first, close idle tabs, and let limits stop access rather than
automatically upgrading or buying capacity. No polling behavior changed here.

## Activation state — 2026-10-16

Travis explicitly approved protected game+Storybook access until2026-10-19T00:00:00Z,
restricted to wilson.travis.t@gmail.com, with no paid charges. This supersedes the
earlier proposed60-minute pilot and resolves the pending identity/duration decision.
No endpoint is active yet. Existing-account Google sign-in reached a new consent
screen granting ngrok the Google email address. Continue was not pressed: awaiting
Travis's completion or explicit email-only consent authorization as requested.
Account plan/quota remain unverified, so no tunnel has been launched.

External deadline protection is implemented and tested:15 gateway cases plus
seven build-helper cases pass. Current isolated game and Storybook builds pass
and include the latest tap-layer/contrast fixes. No listeners are running on the
preview ports. No account token or credential is recorded in this document.

Latest activation check: Travis explicitly authorized the email-only Google consent,
and Continue completed it. The next screen is **new ngrok account creation** for
wilson.travis.t@gmail.com, including an unchecked Terms of Service acceptance.
No terms were accepted or account created. This Google identity did not reach an
existing account dashboard; the configured agent token's account is still unknown.
Need the existing account's sign-in method or user-completed account creation before
plan/quota verification. No tunnel, public endpoint, purchase or upgrade occurred.
The isolated preview rebuild including reduced polling now passes.

Account verification update: Travis created the account himself. Dashboard now
shows Free, 0 B of 1 GB transfer used, zero HTTP requests, and zero active endpoints.
A local fingerprint comparison found that the configured ngrok token differs from
this account's displayed existing token; neither value was printed. No token was
created, rotated or configured by the agent. Need explicit approval to configure
this account's existing credential locally, or the existing configured token's
correct account sign-in, before activation. The browser was returned to Usage.

### Current checkpoint: protected endpoint running

Travis completed token configuration himself. The existing ngrok process now serves
https://gulf-identity-scrap.ngrok-free.dev/ and `/storybook/` through the bounded
loopback gateway. Earlier pending-activation notes above are historical checkpoints.
No token value was configured by the agent during this activation.

The accepted traffic policy requires Google OAuth first, then denies identities
other than `wilson.travis.t@gmail.com` using an anchored, case-insensitive match.
Unauthenticated app, Storybook, API, emulator-admin, push and traversal requests
all returned redirects to `idp.ngrok.com`; no application content was returned.
Read-only router checks also reject emulator administration, push, traversal,
environment files and GET requests to the POST-only Auth lookup route. These
checks do not prove the signed-in or wrong-identity visitor flow.

Visitor sign-in is paused before Continue: Google's consent screen requests name
and profile picture in addition to email. The earlier email-only approval does
not cover those additional fields. Travis has the links to review this consent
on his phone; authenticated game/Storybook access remains unverified. Do not
accept expanded consent or launch duplicate processes while awaiting feedback.
The gateway deadline remains `2026-10-19T00:00:00Z`; the foreground ngrok
supervisor independently stops its owned tunnel at that deadline. No paid plan,
purchase, persistent service, credential change or deadline extension occurred.

### Logged-out galaxy regression corrected

The first phone visit exposed a missing gateway asset route: galaxy-service loads
the frozen `/galaxy/start-area.json` directly, while the gateway previously allowed
only game pages, framework assets and a small public-asset set. The isolated Next
server already returned200 with73 systems; the gateway returned404. Added only
this exact static filename for GET/HEAD, with a regression test rejecting sibling
files, suffixes, encoded variants and POST. All16 gateway tests pass.

Reloaded only the gateway with the same URL, allowlist and UTC deadline. The live
gateway now returns200 and the exact committed JSON payload; adjacent/forbidden
paths remain404. External unauthenticated requests still redirect to ngrok OAuth.
No frontend rebuild, backend change, data reset, seed or user-cookie reuse occurred.
Travis's signed-in phone refresh remains the final remote verification.

Follow-up bootstrap audit checked45 resources across home/login/system pages,
framework assets/CSS fonts, frozen galaxy and production GLBs with zero failures.
The browser renders the local73-system/92-lane galaxy. Unauthenticated API reads
return401, and deliberately invalid login/lookup/refresh probes return JSON400
from the Auth emulator. These are route checks, not successful account login or
token refresh. No additional public path was required. New compatibility/recovery
review stories are included in the staged and verified static Storybook refresh;
old hashed assets remain available to existing tabs. Exact external origin,
identity allowlist and expiry are unchanged.

## Approved email signup and pending simulated SSO

Travis confirmed the phone galaxy loads, then found no way to create a game account.
The isolated build intentionally excluded signup/Google while normal20200 retained
both. That assumed an existing password test account, which had not been established:
the default dev account was absent; the only listed emulator identity used google.com.
Ngrok's real Google entrance is separate from game authentication.

Travis explicitly approved enabling the existing email signup form and exactly
POST `/identitytoolkit.googleapis.com/v1/accounts:signUp` to local Auth20211.
Preview now supports email signup/sign-in while Google remains hidden. The gateway
requires nonempty email/password JSON and rejects anonymous, linking-token, tenant,
custom-user and unknown-field payloads before Auth. Installed Firebase SDK's initial
signup fields and optional reCAPTCHA fields fit that allowlist. GET/HEAD/other methods,
suffix/encoded variants, missing/wrong Origin, SSO/reset/update/admin remain denied.
No credentials were entered, account created or local game data changed by the agent.

Signup form verified at390×844 with no horizontal overflow, three fields and Create
account; live gateway displays it after hydration. Login23 tests and gateway17 tests,
TypeScript/scoped lint, required validators and isolated Next build pass. Empty-body
signup returns400 without reaching Auth; wrong origin403; SSO/helper paths404.
Unauthenticated external signup/form/Storybook requests still redirect to ngrok OAuth.
Actual successful account creation/session restore remains Travis's own verification.

The build uses a temporary source snapshot of b0f42be plus only the login changes,
so subsequent local art candidates were NOT promoted. No environment files were
copied; node_modules is a local link. `/tmp/hexaverse-signup-preview-root.txt` identifies
that ephemeral source. Its frontend listens on loopback20207 under a foreground
deadline supervisor; the20204 gateway now forwards there. During switch, previous
gateway/frontend/ngrok processes were found ended; only the absent owned gateway
and tunnel were restored, using the same unchanged traffic policy and deadline.
No token value was read/configured. Temporary QA20208 was stopped. These remain
foreground processes, not installed persistent services or an availability guarantee.

User also requested SSO. Read-only installed-source audit confirms existing local
Google sign-in uses Firebase's SIMULATED identity picker, not real Google auth or
an additional Google consent grant. Required extra routes would be GET
`/emulator/auth/handler`, GET `/emulator/auth/iframe`, and POST
`/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp`. Mobile uses redirect;
desktop popup. Helper resources include Google GAPI/fonts and unpkg Material assets.

Crucially the emulator permits arbitrary claimed emails with email_verified=true.
It can reuse/link existing local accounts, propagate their custom claims, and in
some cases clear an unverified account's password/provider information. That can
change existing local login methods and access local game data. This is not merely
creating a harmless fresh test identity. No production project or Google account
change is needed, but the additional local access implications need explicit review.
No SSO/helper/IdP route was enabled and no OAuth grant accepted. Before any SSO
exposure, approve its concrete existing-account effects or a separately isolated
emulator identity store, and constrain provider/query/redirect/body parameters.


## Approved simulated Google SSO — current checkpoint

Travis explicitly approved the simulated picker and its existing-account access,
custom-claim and provider/password-linking effects after those implications were
explained. The same protected endpoint now exposes exactly GET
`/emulator/auth/handler`, GET `/emulator/auth/iframe`, and POST
`/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp`. The exact outer Google
identity allowlist and `2026-10-19T00:00:00Z` cutoff are unchanged. This is local
Firebase simulation, separate from ngrok's real Google entrance.

`sso-policy.mjs` pins the installed Firebase12.15.0 SDK: unique known query keys,
demo API key, default app, Google/profile provider, same-origin `/login` callback,
and bounded popup/redirect parameters. IdP POST requires the exact four SDK fields,
same-origin handler URI and emulator fake-Google JSON claims; linking, tenant,
access-token, real-JWT, arbitrary custom claims and unknown fields are rejected.
This constrains transport, not identity ownership. Emulator admin, production,
reset-password and other provider routes remain blocked.

Verification: login24 plus auth-hook24 tests, gateway18 plus SSO-policy5 tests,
TypeScript, scoped lint, validators and isolated Next build pass. Actual desktop
popup and iframe loaded through the QA gateway; popup cancellation returned to a
usable login form. Redirect helper rendered at390×844 without selecting an identity.
Live login also has no horizontal overflow at390px. A viewport does not simulate
mobile user-agent behavior. Actual iOS sign-in was subsequently confirmed by Travis
(see phone checkpoint below). During agent testing no identity was selected,
credentials entered, account created or IdP sign-in submitted.

Live loopback checks: login/helper200, malformed helper/IdP400, wrong helper method
and admin404. Anonymous external login/helper requests still return302 to
`idp.ngrok.com`. Travis subsequently confirmed actual iOS emulator SSO works;
session persistence and token refresh remain unverified.

The isolated SSO frontend listens on loopback20209; source pointer is
`/tmp/hexaverse-sso-preview-root.txt`. It again uses b0f42be plus only login files,
without environment files or later art candidates. Gateway20204 now forwards there;
existing ngrok policy/process is unchanged. Frontend and gateway enforce the same
cutoff. Temporary QA gateway20208 was stopped. These are foreground processes,
not installed persistent services or guaranteed availability. No push, spend,
production change or comparison-image publication occurred.


## Temporary launchd supervision — current lifecycle checkpoint

Repeatedly restarted foreground preview commands were owned by the Codex command
runner. Available frontend logs show successful startup, without a crash traceback
or recorded termination signal. Executor cleanup is the likely cause of earlier
stops, not a proven signal-level diagnosis.

At Travis's explicit request, the same preview now runs as temporary user-session
launchd job `gui/501/local.hexaverse.weekend-preview`. Its supervisor has parent PID1;
frontend, gateway and ngrok are children of that supervisor, independent of command
sessions. No plist was installed in Library/LaunchAgents, no login-startup setting
or OS security setting changed. Runtime files are private under
`/tmp/hexaverse-weekend-supervision/`: `preview.plist`, `supervisor.py`, `config.json`,
`events.log` and `errors.log`. Events record process lifecycle only; subprocess
output is discarded, ngrok inspection/logging remain disabled, and no token is
copied or read. Config hashes pin the existing gateway/policy, build identity and
Storybook index before a child is started/restarted. There was no rebuild.

Supervisor restarts failed child processes with bounded backoff before the original
`2026-10-19T00:00:00Z` deadline. At the deadline it sends termination to all three
owned process groups, including ngrok, then force-kills any survivor after five
seconds. Gateway independently closes listeners/connections at the same deadline.
A harmless four-second subprocess test verified deadline termination and that its
child no longer existed. The installed job and all three processes were verified
running in subsequent, separately completed command sessions; launchctl reports
running and supervisor PPID1. Login/galaxy/Storybook200, unauthenticated API401 and
external login302 to ngrok OAuth were rechecked. Exact email restriction and artifact
set remain unchanged; no identity submission was performed.

To stop early: `launchctl bootout gui/501/local.hexaverse.weekend-preview`.
This registration lasts only in the current macOS user session; logout/reboot,
sleep, network loss, emulator/backend failure and ngrok quotas can still interrupt
availability. No power settings changed and no always-on guarantee is implied.
Actual iOS emulator SSO is now confirmed; session persistence, token refresh and
gameplay checks remain unverified.


## Actual iOS SSO checkpoint — 2026-10-16

Travis reported from iOS: “Yup emulator sso working.” Record actual phone emulator
SSO sign-in as user-validated. This is user-reported device evidence, distinct from
the earlier agent desktop/viewport checks. It does not separately confirm session
persistence after reload/reopen, token refresh, logout/re-login, corporation access,
or gameplay interactions. Those checks remain unverified. No new identity details,
account-creation result or broader gameplay acceptance are inferred.

This documentation-only checkpoint leaves the running services, published artifacts,
exact Google email restriction and `2026-10-19T00:00:00Z` cutoff unchanged.


## Mobile system layout update — 2026-10-16

Travis requested a mobile correction after his actual iOS screenshot. The protected
frontend now includes the requested responsive HUD/onboarding fixes, device-width
viewport and safe-area handling. This is a same-origin frontend update within the
existing authorization: no route, identity restriction, permission or expiry expansion
was needed. The supervisor still terminates all owned groups, including ngrok, at
`2026-10-19T00:00:00Z` with the existing termination grace period.

Source pointer: `/tmp/hexaverse-mobile-preview-root.txt`; provenance is recorded in
that source's `preview-source.json`. It uses b0f42be plus approved login and mobile
layout files. All57 public asset files are byte-identical to the prior SSO preview;
no newer local art or comparison image was published. Static protected Storybook
is unchanged. Temporary launchd supervision was reloaded to change only frontend
source/build pins; gateway and ngrok policy/command/deadline remain unchanged.

Chrome identity-free HUD fixture checks and204 distinct relevant tests pass; see
[hud.md](hud.md) for dimensions, actions and limits. Actual iPhone visual retest is
still pending. No identity was selected or account created during implementation;
Travis's earlier actual iOS SSO success remains a separate confirmed checkpoint.


## iPhone feedback and travel-status correction — 2026-10-16

Travis reports actual iPhone layout “Looks better”. Record perceived layout improvement
separately from full gameplay, session persistence and token refresh verification.
A focused isolated QA pass reproduced premature loss of accepted travel status after
closing/reopening before a fleet refresh. The small status-retention correction is
validated by four regression cases; no movement/backend rules or auth routes change.
The protected frontend now reuses the prior published mobile/login source and changes only
SystemSpaceView plus its tests; local-only gameplay fixture is not in the published
build or static protected Storybook. Build/art checks and deployment details are
recorded in the task board. Same exact-email policy and Oct19 00UTC cutoff apply.

Current source pointer: `/tmp/hexaverse-gameplay-preview-root.txt`. Isolated build
passes and all57 public files are byte-identical. Controlled supervisor reload
retained the exact gateway/Google policy/static Storybook pins and cutoff. Subsequent
login/Storybook checks return200, anonymous external login302 to ngrok OAuth, with no
supervisor errors. No emulator identity selection or live gameplay mutation occurred.


## Full-page mobile cards — 2026-10-16

Travis explicitly requested that opened mobile cards fill the available page. The
protected build now includes full-page Arrange HUD, Objects/Command/Console,
travel/detail flows, recovery guide and fleet inspection. Background heading,
navigation/vitals leave the opened page; a reachable close/title area and internal
scrolling use100dvh/safe areas. Closing restores map input and mounted state.
No browser Fullscreen API or new auth route/permission is involved.

Source pointer: `/tmp/hexaverse-fullpage-preview-root.txt`; prior approved source
plus only the responsive page/focus changes. Isolated build and245 focused tests,
types/lint/validators pass. All57 public asset files are byte-identical to the prior
preview, and protected static Storybook is unchanged. Same launchd service,
exact Google identity policy and Oct19 00UTC cutoff, including tunnel termination.
Desktop IAB viewport checks passed; actual iPhone acceptance of this new treatment
is pending. Earlier “Looks better” feedback applied to the preceding mobile fix.

Post-deploy checks: login/Storybook200, unauthenticated API401, emulator admin404,
anonymous external login302 to ngrok OAuth. Supervisor43823 remains launchd-owned;
all gateway/policy/Storybook and new build pins match, with no supervisor errors.


## ERR_NGROK_3004 incident — 2026-10-16,22:29UTC

Travis's iPhone screenshot reports an invalid/incomplete upstream HTTP response.
Earlier anonymous302 health checks proved the OAuth gate only, not authenticated
upstream delivery. Diagnosis remains open; no root cause or successful phone
remediation is claimed. Exact failed path and a fresh authenticated phone retry
have been requested. No user session cookies or identities were accessed.

At22:30UTC the same supervisor/frontend/gateway/tunnel processes remained running
without restart churn. Historical child stdout/stderr are deliberately discarded;
ngrok inspection and request logging remain disabled, so there is no captured
22:29 request trace. The agent still targets HTTP127.0.0.1:20204, which speaks HTTP;
the common HTTPS-upstream mismatch in the [official error guide](https://ngrok.com/docs/errors/err_ngrok_3004)
is not supported by this configuration.

Safe local response audit: direct frontend20209 and gateway20204 root/login/system
HTML200 with complete plain/gzip bodies; Serais `/systems/sys_0_1` HTML/RSC/prefetch/
reload/HEAD responses complete. Thirty production assets and conditional reads
pass through the gateway under concurrent load, synthetic non-secret OAuth-like
headers and a fixture cookie. HTTP/1.0 and reused HTTP/1.1 compressed page reads
complete. These checks do not exercise a real OAuth session through the ngrok edge.
No speculative code change, service restart, exposure expansion or deadline change
was made. Authenticated edge delivery remains unverified pending phone evidence.


## Prepared error-only diagnostics — not activated

Diagnostics are prepared in an isolated checkout so the live supervisor's pinned
gateway files and current retry window remain untouched. Existing production stdout/
stderr are discarded and ngrok inspection is disabled; these cannot reconstruct
an upstream truncation after the fact. No new live failure evidence was obtained.

The optional gateway `--error-log` accepts an absolute local file. Its JSONL records
contain only UTC timestamp, fixed error category, method, route template (all dynamic
IDs and asset names redacted), status/error code and received-byte count. No headers,
cookies, authorization, query strings, bodies, error messages/stacks or identities
are recorded. Normal successful responses are silent. Fixed code vocabularies also
prevent a remote error message from entering a record. The file is owned0600,
non-symlink/regular, capped at256KiB across reopen and gated by the same `--until`
cutoff. The supervised gateway stops at that cutoff; full ngrok inspection remains off.

Synthetic loopback tests distinguish refused upstream connections, incomplete
Content-Length responses, browser stream cancellation and completed5xx responses.
Fragmented gzip remains complete and silent. Redaction, file permissions/symlink
refusal, byte cap across reopen, expiry and diagnostic-callback failure are covered.
All29 gateway/SSO/diagnostics tests pass. No private traffic was replayed.

Activation is deferred until Travis's imminent retry is resolved: stop the same
launchd job, apply the prepared commit to the primary checkout, append
`--error-log /tmp/hexaverse-weekend-supervision/transport-errors.jsonl` to its gateway
command, and update gateway/new diagnostic-module source pins before restarting.
Keep the frontend/art/Storybook, origin, exact email restriction, ngrok inspection/log
flags and `2026-10-19T00:00:00Z` unchanged. Then verify healthy local responses stay
silent and unauthorized external traffic still reaches the OAuth gate. This enables
future evidence collection; it is not a confirmed fix for ERR_NGROK_3004.


## Error diagnostics activated — 2026-10-16 22:42 UTC

Prepared commit d60d909 was applied to the project branch as830cba6. The supervisor
loads configuration once, so a gateway-only restart could not activate the optional
flag. The same authorized process set was stopped22:42:32.49UTC and restarted
22:42:38.62UTC (about6.1seconds). An immediate launchd bootstrap returned error5
while teardown finished; the next bootstrap succeeded. No access restriction changed.
Frontend48343, gateway48344 and ngrok48345 are owned by the relaunched supervisor.

Active gateway SHA256: `8157fb8ee473cd9f7fc5bc436451dc2edefd9a3789b69657c83fcbcb3fd281d0`.
Diagnostic module SHA256: `105f687c3e650891e2095b9fcd1453aa434ccad1fb6a9a072a6e6bdf24617f74`.
All supervisor source/build/policy pins match. Frontend build/assets, exact Google
email restriction, endpoint, disabled ngrok inspection/logging and
`2026-10-19T00:00:00Z` cutoff are unchanged. Gateway now uses
`--error-log /tmp/hexaverse-weekend-supervision/transport-errors.jsonl`.

Verification: local `/`, `/login` and `/systems/sys_0_1` returned complete200 gzip
HTML and decompressed successfully. Debug route404 and foreign-origin POST403;
anonymous public root302 to idp.ngrok.com. The owned0600 diagnostic log remained
zero bytes after healthy checks.29 synthetic gateway/SSO/diagnostics tests passed
before activation. No authenticated edge session was exercised. ERR_NGROK_3004
remains an open incident; this activation enables recurrence evidence, not a fix.


## Mobile touch correction deployed — 2026-10-16 23:53 UTC

Local commit0796429 fixes world-hit interception, unified touch pointer gestures,
sheet isolation and compact phone map chrome. See docs/hud.md for diagnosis/tests
and device-validation limits. Source /private/tmp/hexaverse-touch-preview-58mz5yd5
is copied from the previous full-page snapshot with only seven runtime overlays,
listed in its preview-source.json. Pointer: /tmp/hexaverse-touch-preview-root.txt.
All57 public assets are byte-identical to the prior published build. Static protected
Storybook remains unchanged; the new Touch Map fixture/evidence stay local.

The supervisor was stopped23:53:42UTC; all owned groups stopped23:53:43.00UTC and
the replacement supervisor started23:53:44.11UTC. Frontend53106, gateway53107 and
ngrok53108 are supervised; the candidate-only20215 smoke listener was stopped.
Only the frontend source command and its build/manifest pins changed. Build ID:
`shZoojsNHZsEIOJCz0MoQ`. Gateway8157fb8ee473cd9f7fc5bc436451dc2edefd9a3789b69657c83fcbcb3fd281d0
and diagnostic module105f687c3e650891e2095b9fcd1453aa434ccad1fb6a9a072a6e6bdf24617f74
retain their exact hashes. Endpoint, Google exact-email policy, gateway routes,
private error-only logging, disabled ngrok inspection/logging and Oct19 00UTC
cutoff remain unchanged. All active source/build/policy pins match.

Post-update checks: home/login/system pages return complete200 gzip HTML; protected
Storybook200; debug404 and foreign-origin POST403; anonymous external root302 to
idp.ngrok.com. The private diagnostic log remains0bytes. This does not exercise an
authenticated iPhone session or prove ERR_NGROK_3004 fixed. Travis's fresh-link load
report is recorded separately from touch usability; actual iPhone retest is pending.

Final checks:1,063 HUD/space tests across64 files, TypeScript, scoped ESLint, file
validators/diff checks and isolated production build pass. Trusted Chromium touch
pan/pinch/taps/cancel and post-card/resize input pass; installed WebKit touch card
open/close, map tap and zoom fallback pass; desktop docks/mouse orbit pass after
resize. Physical iPhone/native iOS pinch remain unverified. No identity selection,
live gameplay mutation, new art, upload or push occurred.


## Safari gesture arbitration update — 2026-10-17 02:34 UTC

Commit db1b3f9 adds map-scoped nonpassive capture touch cancellation and gated
Safari gesture cancellation, plus directional phone pan fallback. See docs/hud.md
for the concrete implementation gap, primary references and physical-device limits.
No global touch blocker, zoom restriction or body scroll lock was added.

Source: /private/tmp/hexaverse-safari-preview-1pns2p8g; pointer:
/tmp/hexaverse-safari-preview-root.txt. It reuses the previously published touch
snapshot and overlays only SpaceStage.tsx plus map-browser-gestures.ts. All57 public
assets compare byte-identical. Local fixtures/evidence are not published; protected
static Storybook is unchanged. Build ID: mtPOKUcqkDqkyp2OvjhVz.

The same supervised process set stopped02:34:34.14UTC and relaunched02:34:35.30UTC.
Frontend74557, gateway74558 and ngrok74559 are supervised. Only frontend source
and build/manifest pins changed; all active pins match. Exact endpoint/Google-email
restriction, gateway routes/error-only diagnostics, ngrok inspection/logging off
and2026-10-19T00:00:00Z cutoff remain unchanged. The candidate20215 listener stopped.

At02:34:56UTC home/login/system pages returned complete200 gzip HTML; protected
Storybook200; debug404; foreign-origin POST403; anonymous external root302 to
idp.ngrok.com. Transport error log remains0bytes. These are service/access checks,
not physical Safari gesture acceptance or an ngrok root-cause diagnosis.

1,067 HUD/space tests across65 files, types/scoped lint, file validators, diff checks
and isolated build pass. Browser-generated touchstart is defaultPrevented:true and
still selects in installed Chromium and WebKit. Constructed TouchEvents with fixture
TouchLists and gesture events test map-label cancellation/release in both engines.
Chromium native pan/pinch preserve document scroll and visualViewport state; native
card scrolling works. WebKit card touches are uncancelled and its card container
scrolls programmatically; native two-finger WebKit/Safari tab UI remain untested.
Pan fallback, post-close map cancellation, existing resize/card and desktop regressions
pass. Physical iPhone retest is still required, including reserved-edge behavior.


## System document scroll ownership deployed — 2026-10-17 12:10 UTC

Commit dece79e adds SystemViewport/system-viewport-lock.ts to the production
SystemSpaceView, locking mobile html/body for the route lifetime and handling
non-scrollable HUD starts at document capture. Full-page sheets use visible viewport
height/top, external navigation compensates for obscured bottom space, and route
exit restores document styles/listeners. See docs/hud.md for exact findings and limits.

Source /private/tmp/hexaverse-rootlock-preview-6t9znyk7 is the prior Safari snapshot
with eight runtime overlays listed in preview-source.json. Pointer:
/tmp/hexaverse-rootlock-preview-root.txt. All57 public assets compare byte-identical.
Temporary loopback QA route/login/touch-qa and its compiled chunk were removed
before the final build. Local test fixtures/evidence are not published; protected
static Storybook is unchanged. Build ID: LgIyBe9FOe9Jgw-TIDrs1.

The same supervised process set stopped12:10:25.21UTC and relaunched12:10:26.34UTC.
Frontend94896, gateway94897 and ngrok94898 remain supervised. Only frontend source
and build/manifest pins changed; all non-frontend commands/pins remain exact.
At12:10:50UTC all pins match, home/login/system return complete200 gzip HTML, static
Storybook200, removed QA/debug404, foreign-origin POST403, and anonymous external
root302 to idp.ngrok.com. Exact Google/email policy, gateway routes/error-only
diagnostics, ngrok inspection/logging off and2026-10-19T00:00:00Z cutoff unchanged.
The diagnostic log remains0bytes.

Deployed system HTML references page-80df1ffb44593e03.js containing the unique
system-viewport-lock-v1 document-owner marker. The prior map fix was also positively
verified in its old served chunk before replacement, rather than dismissing actual
phone feedback as stale code. No identity was selected or gameplay action issued.

1,072 tests across66 files, types/scoped lint/validators/diff checks and final isolated
production build pass. A temporary actual Next production layout (RootLayout,
Providers/portals, production shell/map/HUD, identity-free data) verifies baseline
missed HUD cancellation versus new ownership in Chromium/WebKit, canvas/labels/
heading/fleet starts, card scroll/close, modal-style restoration, visible fallbacks
at375×667/390×600/844×390/390×844, and Next route-exit cleanup. Chromium native
HUD downward drag leaves shell/document fixed; WebKit drag arbitration checks are
constructed events. Safari's physical pull-to-refresh UI remains unreproduced and
actual iPhone acceptance is pending. Service checks do not resolve the earlier
ngrok root-cause question. No push or new art publication occurred.


## Emergency input rollback and native-touch restoration — 2026-10-17

Actual iPhone12:27UTC regression: refresh stopped but all fingers/buttons appear
dead. Universal physical lockout could not be reproduced locally. The document
interceptor's zero-threshold move cancellation is an unsafe click-suppression risk,
and cancelled touches must not be assumed to keep producing pointer events.

Emergency commit0feef64 removed ALL application document input interception while
retaining viewport layout. It became active12:31:57UTC, build Gc95NqcOZceQZ1cbdWNTu
from/private/tmp/hexaverse-input-rollback-9l90d206. This was a narrow rollback, not a
claim of confirmed physical recovery.

Commit47b9a8f subsequently moved map motion/selection to native TouchEvents and
preserved native button/affordance click paths. Touchstart is never cancelled; only
owned map gestures/end suppress compatibility behavior where necessary. Touch-
pointer events are ignored by mouse/pen handling and cannot cancel native touch
tracking. No document-level touch/gesture interception remains. See docs/hud.md.

Final source:/private/tmp/hexaverse-native-touch-3at75qb3; pointer:
/tmp/hexaverse-native-touch-root.txt. It overlays only SpaceStage.tsx and
map-browser-gestures.ts over the emergency rollback snapshot. Build ID:
qdpG4CBaaka42onE4x6L_. All57 public assets are byte-identical; auth/gateway/routes/
diagnostics/ngrok flags/static Storybook/cutoff unchanged. Local QA route and its
compiled chunk were removed before the final build; its gateway path returns404.

The authorized process set relaunched12:40:57UTC: frontend96910, gateway96911 and
ngrok96912 under supervisor96909. All pins match. Served system page-cf492bdf39a1e810.js
contains native changedTouches input and system-viewport-layout-only-v2, and its
bytes match the final snapshot's compiled chunk. Complete home/login/system gzip
HTML and static Storybook200 verified; foreign POST403 and anonymous OAuth302
verified. At12:43UTC transport log0bytes; exact Google/email and Oct19 00UTC cutoff
remain unchanged. No identity was selected, live gameplay mutated, art uploaded or
push performed.

Stronger input evidence:1,072 tests/66 files, types/scoped lint/validators/build pass.
Local Next production-layout QA blocks every touch-pointer event before the app:
trusted Chromium/WebKit touches still select map/fleet exactly once and activate
HUD/menu/open/close/settings/zoom/pan/recenter and in-memory travel Start/Stop
callbacks at390×844/844×390/390×600. No stale inert after close; cards scroll; actual
Next route exit restores layout. Constructed WebKit TouchEvents assert actual
pan/pinch camera changes; Chromium also uses browser-generated native pan/pinch.
A separate private production build with identical runtime sources confirms trusted
map taps and TouchEvent-only pan immediately after each Objects/Console/Command
close with no reload and no pointer stream. Its20215 listener was stopped.

Evidence:/tmp/hexaverse-input-production-qa.log and/tmp/hexaverse-input-postclose.log;
runner:.scratch/weekend-visual-batch/input-restoration-regression.cjs. QA fixtures
remain private; the deployed snapshot never includes them. Physical iPhone success
and native WebKit two-finger/Safari UI remain unconfirmed. Stationary trusted taps
and prior synthetic defaultPrevented checks did not reproduce the user's universal
physical failure; those earlier checks were insufficient for acceptance. No new
physical retest was requested before the stronger callback evidence was obtained.
