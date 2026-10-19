# Authenticated phone preview

## One-week live app and Storybook preview — 2026-10-19

Travis requested restoration for one week and live Storybook on20203. The explicit
new deadline is **2026-10-26T11:53:17Z** (October26 at7:53a.m. Eastern), superseding
the earlier cutoff and static-Storybook records below. The same ngrok URL, Google identity allowlist,
credentials and game API/Auth restrictions apply. Only the loopback gateway and
ngrok belong to the supervisor; the separately managed dev servers on20200/20203
remain running after preview expiry. Automatic shutdown at the prior04:00 cutoff
was observed: cleanup completed04:00:00.530UTC, launchd exit0, public ngrok404.

Live Storybook uses explicit `--live-storybook-port 20203` beneath `/storybook/`.
Its manager, iframe, index, modules and update sockets retain that prefix. The
relay admits modules referenced by trusted Storybook output and fixed public
asset directories, rather than forwarding arbitrary Vite/filesystem routes.
Environment files, unreferenced files, raw-file queries, editor/debug endpoints
and writes are rejected. JavaScript URL literals are parsed before rewriting;
regular-expression literals are preserved. Storybook's server channel permits
only sanitized read-only follower initialization; test runners, editor commands
and unrelated RPC are not exposed. Vite invalidation is limited to known modules.

Live stories expose their browser source modules and client-side diagnostics to
the already authorized reviewer. This is inherent in the requested development
preview; it does not grant arbitrary filesystem or server-control access. Both
Storybook update channels require the configured outer Origin, retain upstream
tokens, and close at the same independent gateway deadline as app HMR/SSE.
Existing Next frontend HMR continues through its separate exact endpoint.

Isolated browser validation rendered the original card story, discovered a
disposable new story in the manager, rendered its iframe, and observed an actual
source change through HMR. The temporary story was removed. Physical iPhone and
an authenticated public browser session remain separate device acceptance.
The app's gateway-only login guidance is applied after initial hydration so a
fresh dev-server page matches its server-rendered markup; a hydration regression
test and fresh mobile-browser check cover that handoff.

### Interrupted development responses — 2026-10-19

Travis reported NGROK_3004 after activation. Initial checks found healthy local
services and SSO redirects; no recorded diagnostic identified his exact request.
Fault injection reproduced a concrete gap: interruption while buffering live
HTML/JSON closed the downstream socket before any HTTP response bytes and omitted
the upstream-truncation record. Buffered failures now return a complete HTTP502,
record redacted status/byte counts, and allow the next healthy request to succeed.
This fixes a verified failure mode; it does not establish the cause of the
original user request. App/mobile and Storybook source-HMR browser checks, active
update sockets and protected-route checks passed after the preview-only reload.

## Live development preview — 2026-10-19

Travis approved switching the existing protected endpoint to the separately
managed development server on localhost:20200. The current cutoff is
2026-10-19T04:00:00Z. These details supersede the earlier built-preview and
midnight-cutoff checkpoints below. The ngrok Google identity policy, credentials,
API/Auth restrictions and static Storybook routing are unchanged.

The loopback gateway's explicit `--live-project hexaverse-emulator` mode injects
a same-origin browser profile into app HTML. Firebase Auth uses the served
emulator identity and API requests use `/api`; ordinary direct localhost use
keeps its existing configuration. Firestore and emulator management stay private.
Only the exact `/_next/webpack-hmr` upgrade is relayed, with the configured Origin
required. Client messages admit client-chunk subscriptions and sanitized lifecycle
notifications; arbitrary module paths and dev commands are not forwarded. Editor,
debug, dev-login and stack-frame endpoints remain blocked. Development client
bundles and HMR diagnostics are development output, rather than production assets.

The gateway independently expires HTTP and open HMR/SSE streams. The operational
supervisor owns only gateway/ngrok, so cutoff cannot stop the separately managed
dev server, Storybook, backend or emulators. The old isolated frontend on20209 is
stopped. Live game source is intentionally mutable; gateway/access-policy pins
remain enforced. Storybook still serves its existing static artifact and requires
its own refresh workflow when those stories change.

Validation: isolated gateway/Auth/HMR tests, mobile-width browser login routing,
same-origin API denial and an actual source edit reaching the open browser through
HMR passed. Active gateway HMR returned101; unauthenticated public app/API/Auth/HMR
requests still redirected to SSO. No authenticated public browser session or
physical iPhone was available to this agent, so those remain device acceptance.

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


## Invisible recovery modal correction — active 2026-10-17 13:27UTC

Commit520d8ee removes one broad CSS visibility selector. The hidden inline Console
contains an expanded collapse button; the former selector hid an active Recovery
transmission while its modal kept every background control inert. This reproduced
the reported universal lockout on the real production route in Chromium/WebKit,
without JavaScript errors. No additional gesture change was made.

Active source:/private/tmp/hexaverse-modal-visibility-quiuqx95; build
g6x-pM1Iv7ri05_u6lWi5. Only command-view.module.css differs at runtime from the
previous native-touch snapshot. All57 public assets are identical. Supervisor
restarted13:27:28UTC with frontend468 (Next479), gateway469 and ngrok470.
Gateway/ngrok commands, exact Google identity policy, diagnostics/static Storybook
pins and Oct19 00UTC cutoff are unchanged. No push or new exposure.

Live first-login and persisted wake/objects tests pass in installed Chromium and
WebKit at390×844. Real app login/system routes and ConsoleDock are used; Auth/game
responses are intercepted synthetic fixtures. First-login uses the real wake form
and app-created guide, with one browser-only mocked spawn; no identity is selected
and no live game writes occur. Guide is visible, Begin works, dismissal releases
inert, and HUD/Console/open/close/zoom callbacks work with zero browser errors.
Avoid unnecessary navigation during initial GLB texture loading: it can produce
expected aborted-load errors in the test itself.

Evidence:/tmp/hexaverse-invisible-modal-live-{first,wake,objects}.log; runner
.scratch/weekend-visual-batch/deployed-page-diagnostic.cjs. HTTPS origin is locally
forwarded to deployed resource bytes by the browser test; authenticated ngrok
edge and physical iPhone acceptance remain unverified. Anonymous external request
returns302 to idp.ngrok.com. Complete gzip home/login/system HTML200, deployed CSS
byte equality, Storybook200, debug/QA404, foreign-origin POST403, all active pins
and zero-byte transport error log verified. System HTML retains no-store.

## Mobile orbit — active 2026-10-17 18:01UTC

Travis reports actual iPhone pan/zoom working and requests rotation around a
selected object. Local commit54cc3ce adds parallel two-finger orbit and a visible
one-finger Rotate toggle. Default one-finger pan and pinch zoom remain. Shared
centroid motion is separated from finger spacing; a stationary-finger pinch does
not rotate. Selected-object orbit preserves framing rather than recentering.
No selection keeps the existing target/fleet-follow pivot. No document listeners,
touchstart cancellation or recovery-modal changes were introduced.

Source:/private/tmp/hexaverse-mobile-orbit-b5eje4ch; build
yXPU27qyhgZ6M8vmNK4x6. Runtime overlay contains only SpaceStage.tsx and
space-camera.ts over the accepted modal-fix snapshot;57 public assets identical.
Supervisor restarted18:01:00UTC: frontend6722, gateway6723, ngrok6724. Existing
Google/exact-email auth, gateway/diagnostic/static Storybook pins and routes,
ngrok flags and Oct19 00UTC cutoff unchanged. No push.

148 tests/11 files, TypeScript, scoped lint and production build pass. Final
candidate first-login and persisted wake/objects routes pass in Chromium/WebKit.
Post-deployment first-login and persisted objects/orbit checks also pass: guide
visible/dismissed, inert released, selected pivot retained, pan/pinch/orbit and
finger transitions/cancel work, Rotate toggle and HUD card close retain orbit,
no-selection orbit uses current target. Chromium input is browser-generated native
multi-touch. WebKit drags are constructed TouchLists; toggle/HUD/close taps are
browser-generated. This does not establish physical iPhone orbit acceptance.

All32 initial JS/CSS assets match deployed build bytes; complete compressed home,
login and system responses verified. Backend health/Auth/SDK iframe pass;
Storybook200, QA/debug404, foreign POST403 and anonymous external302 to idp.ngrok.com
verified. Transport error log0bytes. Synthetic browser Auth/game fixtures include
an intercepted preview quote POST on selection; no real identities or game writes.
Evidence:/tmp/hexaverse-mobile-orbit-{final-first,final-wake,final-objects,
live-first,live-objects}.log; unit:/tmp/hexaverse-mobile-orbit-regression.log.

## Camera buttons removed everywhere — active 2026-10-17 18:52UTC

Travis requests removal on mobile, then explicitly extends that to desktop.
Commit c7b3ec4 removes the entire camera button cluster, center-selection button,
phone pan buttons and Rotate toggle/state. No hidden one-finger rotate mode remains.
One finger pans, pinch zooms, two-finger parallel drag orbits. Desktop primary drag
orbits, secondary drag pans and wheel zooms. Keyboard navigation now belongs to the
focusable map: arrows orbit, Shift+arrows pan, +/- zoom, Home recenters, Enter
selects center. Recovery/card ownership and touch cancellation rules are unchanged.

Source:/private/tmp/hexaverse-gesture-only-ttis_ub1; build
ny2xmLsnZmFwjFEgptsx2. Only runtime overlay is SpaceStage.tsx over the previous
mobile-orbit snapshot; all57 public assets and accepted recovery CSS identical.
Supervisor restarted18:52:41UTC: frontend9533, gateway9534, ngrok9535. Same exact
Google/email policy, gateway/diagnostic/static Storybook pins, routes, ngrok flags
and Oct19 00UTC cutoff. No push or new exposure.

148 tests/11 files, scoped lint, TypeScript and production build pass. Updated
legacy emulator journeys statically checked; full emulator journeys not run.
Candidate and deployed first-login/recovery and persisted objects checks pass in
Chromium/WebKit, with actual app routes and synthetic browser-intercepted data.
No buttons at390×844/844×390/390×600/1280×900; no horizontal overflow. Orbit pivot,
pan/pinch transitions/cancel and card close preserve gestures; native Chromium
card scrolling passes. Desktop mouse and map keyboard camera inputs pass in both
engines. Chromium multi-touch is browser-generated; WebKit drags are constructed
TouchLists and its card scrolling is programmatic. Native HUD/close taps pass.
Physical iPhone orbit acceptance remains pending; UI feedback is not acceptance.

All32 initial JS/CSS files match deployed bytes; complete compressed home/login/
system HTML200, backend/Auth/SDK iframe health, Storybook200, QA/debug404, foreign
POST403 and anonymous external302 to idp.ngrok.com verified. Transport log347bytes
contains only two historical downstream_aborted reads at18:03:06UTC, with zero
received bytes; no new deployment errors. Log preserved. No identities selected,
live game mutations or asset operations. Evidence:/tmp/hexaverse-gesture-only-
{candidate,live}-{first,objects}.log; unit:/tmp/hexaverse-gesture-only-unit.log.


## Shared HUD card baseline — active 2026-10-17 19:20UTC

Implementation3c4732b, pre-deployment containment correction1039623. Existing
HudCardShell now owns workspace Objects/Command/Console, recovery/objective,
settings, fleet inspector and remote-fleet surfaces. Nested travel/actions use
unframed shared sections. Existing typography/facts and Catalyst controls replace
ad-hoc dashed/left-edge surfaces; controls remain dark in either OS color scheme.
Phone pages retain safe areas, mounted state and internal scrolling; desktop frame
placement reserves navigation. Console activation/dismissal delegates to its
existing state owner; tabs/logs/announcements retain controlled lifecycle.

Source:/private/tmp/hexaverse-hud-baseline-ck3ach0k; build
-wmbFYvCfz67ugLHJP3zV.20 runtime overlays exact to committed sources;57 public
assets unchanged. Supervisor restarted19:20:49UTC: frontend14918, gateway14919,
ngrok14920. All non-build pins, commands, exact Google/email auth, routes, published
Storybook, error diagnostics and Oct19 00UTC cutoff unchanged. No push. Temporary
candidate and Storybook listeners stopped; no QA route added to the build.

1,081 tests/66 files pass, plus74 targeted tests after final control changes.
TypeScript/scoped lint and production/Storybook builds pass. Existing full emulator
journeys were not run. Nested-shell Storybook browser check verifies one frame/two
sections. Before and after deployment, Chromium/WebKit real-route synthetic fixtures
pass for mining/station services, retained drafts/search/detail-back, Console/log,
settings, first-login and persisted recovery, detached fleet inspection, narrow/
landscape phone and desktop layout/navigation clearance. The final visual review
caught objective decoration covering recovery despite successful clicks; fixed its
positioned containing block before deployment and added decoration-bounds checks.

Mobile pan/pinch/two-finger orbit and desktop mouse/keyboard input remain. Chromium
uses browser-generated multi-touch/card scroll; WebKit uses constructed TouchLists
and programmatic card scroll, with native control taps. These checks do not prove
physical iPhone visual acceptance. Auth/game responses are intercepted synthetic
fixtures; no real identity selected or live gameplay mutated.

All33 initial JS/CSS assets match served build bytes. Complete compressed home/
login/system HTML200, backend/Auth/SDK iframe health, Storybook200, QA/debug404,
foreign POST403 and anonymous external302 to idp.ngrok.com verified. Transport log
347bytes contains only two historical downstream_aborted reads at18:03UTC; no new
release errors. Logs preserved. Evidence:/tmp/hexaverse-hud-live-
{mine,station,first,camera}.log; durable captures/migration record in
.scratch/hud-card-baseline/. Physical iPhone review remains pending.

## Mobile workspace navigation refinement — 2026-10-17

User phone feedback requested consistent tabs in Arrange, a clearer close target
and correction of search-focus magnification. Implementation 2efc4e6 keeps the shared
HudCardShell style and adds its mobileHeader to workspace/Arrange: fixed title,
48 px inset close and Objects/Command/Console/Arrange controls above internal scroll.
One workspace sheet owner persists through tab handoffs, avoiding stale focus
restoration to hidden inputs. Shared phone/coarse HUD inputs/selects/textareas use
16 px text. The previous live search computed 14 px in Chromium and WebKit; new search
computes 16 px. Browser pinch/viewport accessibility zoom remains unrestricted.

Live source:/private/tmp/hexaverse-mobile-chrome-ddd8b7dj. Build:
4mNlQJf9OD5UVRpDcNTAz. Supervisor 23541 / frontend 23542 / gateway 23543 / ngrok 23544
started 22:56:09 UTC. Initial launchd bootstrap raced asynchronous bootout; after the
old group finished stopping, registration succeeded with the same service config.
Only frontend source command/build pins changed. Gateway/ngrok commands, all 57
public assets, Google allowlist wilson.travis.t@gmail.com, routes, published protected
Storybook, diagnostics and 2026-10-19T00:00:00Z cutoff remain unchanged. No push.
Temporary candidate 20215 and local Storybook 20218 listeners were stopped.

Validation: 60 tests / 6 files, TypeScript/scoped lint, isolated production and Storybook
builds pass. PhoneNavigation story interaction passes in Chromium. Synthetic actual
production-route checks pass in Chromium/WebKit before and after deployment:
375/390 portrait, 844 landscape, reduced keyboard space/focus/blur, all Arrange/panel
handoffs, active callbacks, preserved search/details/back and mining drafts, fixed
reachable close, content scroll and released inert. Separate candidate checks pass
first-login/station drafts and retained gesture-only camera/desktop keyboard/mouse.
No real identities or unmocked game writes. Engines do not reproduce native iOS
focus magnification/keyboard; actual iPhone acceptance remains pending.

Complete gzip home/login/system responses 200; system HTML stays no-store. All 35
initial JS/CSS resources match deployed build bytes; seven active pins match.
Anonymous edge access302 to identity gate; Storybook 200, debug/QA 404 and foreign
Origin POST 403. Supervisor errors 0 bytes, transport log unchanged 347 bytes containing
two historical downstream aborts, capped 256 KiB. Evidence:
/tmp/hexaverse-mobile-{font-before,chrome-candidate,chrome-first-station,chrome-camera,chrome-live}.log
and .scratch/hud-card-baseline/mobile-{search,arrange}-phone.png.

## Centered shared-card titles — 2026-10-17

User spotted mobile title alignment differing from the accepted Storybook shell.
The mobileHeader flex row introduced in 2efc4e6 removed the title's 50% anchor and
left-aligned it. Live 390px viewport measurements placed its midpoint roughly
110px left of the card midpoint in both engines. Implementation e997380 replaces
only that phone header's layout with equal side tracks and a central title track.
The visible inset 48px close, persistent tabs, safe areas/internal scroll, retained
state, 16px inputs and unrestricted browser accessibility zoom are preserved.

Build KcC37CyGkxAjvy3gFc6Hr, source
/private/tmp/hexaverse-centered-title-_8x6cshq, is deployed on the same protected
endpoint. Supervisor 26657 / frontend 26658 / gateway 26659 / ngrok 26660 started
23:57:18 UTC. Deployment waited for the previous supervisor to finish stopping.
Only the frontend source command and build pins changed. All 57 public assets,
Google exact-email policy, gateway/ngrok commands, routes, protected Storybook,
diagnostic cap and 2026-10-19T00:00:00Z cutoff are unchanged. No push.

60 HUD tests, types/scoped lint and production/Storybook builds pass. Candidate
Chromium/WebKit production-route tests assert title/card midpoints within 1 CSS px
at 375/390 portrait, 844 landscape and 1280 desktop, including long-title unequal
Back/close geometry and actual detail/back transitions. Tabs/search/mining drafts,
content scroll, dismissal and inert release pass. Baseline Storybook comparisons
also pass. The user's local in-app browser measures -0.00390625px mobile title
midpoint offset with 48x48px close, and 0px desktop offset. Native iPhone acceptance
is not inferred from these checks.

Complete gzip home/login/system responses return 200; system HTML stays no-store.
All 35 initial JS/CSS files match the deployed build bytes and all seven pins match.
Anonymous edge 302, Storybook 200, debug/QA 404 and foreign Origin POST 403 remain.
Supervisor errors 0 bytes; transport unchanged 347 bytes (two historical aborts).
Capture: .scratch/hud-card-baseline/mobile-centered-title-phone.png.
Logs: /tmp/hexaverse-centered-title-{unit,static,story-browser,candidate,live}.log
and /tmp/hexaverse-title-before.log.

Final gateway20204 Chromium/WebKit runs also pass title geometry, mobile handoffs,
mining drafts and desktop centering, with no JS errors or unmocked writes. Temporary
candidate20215 and local Storybook20218 listeners were stopped; the in-app browser
viewport override was reset and its temporary story tab closed.

## Original Storybook header/close restored — 2026-10-18

Travis requests 1:1 original visuals, superseding the recent inset-header studies.
Source baseline: commit 624c4ff, HudCardShell.tsx / hud-card-shell.module.css / Plain
story. Implementation 9a0446b removes mobileHeader and its boxed controls, app close
offset overrides and phone minimum sizing on close. The shared component now keeps
the original 11px floating plaque, transparent 28px corner control and 14px X on
phone and desktop. An invisible inward-aligned 44px Catalyst target preserves touch
usability without changing the visual design. Original focus outlines remain.
Tabs/Arrange, fullscreen ownership, scroll/safe areas, mounted details/drafts,
16px inputs, accessible zoom and camera gestures are retained.

Live build vInWVcxECS_kYn3wvSRH_, source
/private/tmp/hexaverse-original-chrome-qsq6t1up. Supervisor 29105 / frontend 29106 /
gateway 29107 / ngrok 29108 started 2026-10-18 00:16:24 UTC. Only the frontend source
command/build pins changed. All 57 public assets, gateway/ngrok commands, Google
exact-email allowlist, routes, protected Storybook, diagnostic cap and
2026-10-19T00:00:00Z cutoff are unchanged. No push or new exposure.

61 tests / 7 files, types/scoped lint and production/Storybook builds pass. A golden
CSS fixture preserves original header/close rules verbatim, and a commit/hash-
labeled JSON reference pins computed styles/geometry. Candidate Chromium/WebKit
checks pass original Storybook/app parity side by side at phone and desktop sizes,
long-title/Back separation, invisible-target edge-tap dismissal, desktop close/
reopen, tabs, retained search/details/mining drafts, scroll and inert release.
First-login/camera and inspector close checks also pass. The user's local browser
verified original 11px/28px/14px visuals with an invisible 44px target, and both
comparison artifacts. No unavoidable fidelity conflict was found. Native iPhone
acceptance remains pending.

Complete gzip home/login/system responses 200; system HTML remains no-store.
All 34 initial JS/CSS resources match deployed build bytes; all seven pins match.
Anonymous edge 302, Storybook 200, debug/QA 404 and foreign Origin POST 403 persist.
Supervisor errors 0 bytes; transport unchanged at 347 bytes (two historical aborts).
Evidence: .scratch/hud-card-baseline/original-vs-app-{phone,desktop}.svg and
original-chrome-phone.png; /tmp/hexaverse-original-chrome-{unit-final,static-final,
candidate,camera-first,inspector,live}.log. Comparison SVGs are local QA artifacts;
none were added to the protected published Storybook or public game assets.

Final deployed gateway20204 runs pass original Storybook/app parity at phone and
desktop sizes in both Chromium/WebKit, including invisible target edge taps,
desktop close/reopen and preserved HUD state, with no JS errors/unmocked writes.
Temporary candidate20215 and local comparison Storybook20218 servers were stopped.
The in-app browser override was reset and temporary inspection tabs closed.

## Direct mobile HUD icons — 2026-10-18

Implementation 3e00a47 replaces the phone HUD menu/dropdown with four direct icon
buttons for the actual existing destinations: Objects, Command, Console, Arrange.
They use HudIcon/Heroicons outline assets, accessible names/titles, aria-controls,
pressed state and 44px targets. One strip appears beside the system heading on the
map or inside the open card toolbar, with no second visible nav/dropdown. Desktop
keeps existing text controls. The phone heading reserves the strip width, and the
paused guide resume/objective controls occupy separate rows below it. Closing or
Escape restores the launch icon. Layout/drafts/details, modal ownership and scroll
remain mounted. Original 624c4ff card/header/close CSS, 16px inputs, unrestricted
accessibility zoom and camera gestures are unchanged.

Live build trwcoovSMTxWb7fxtZDlG, source
/private/tmp/hexaverse-direct-icons-i51tcfp5. Supervisor 52451 / frontend 52452 /
gateway 52453 / ngrok 52454 started 2026-10-18 11:42:09 UTC. Only the frontend command and
build pins changed. All 57 public assets, exact Google/email policy, routes, protected
published Storybook, diagnostics/ngrok flags and 2026-10-19T00:00:00Z cutoff remain
unchanged. No push or new exposure.

62 tests / 7 files, types/scoped lint, isolated production and Storybook builds pass.
Candidate Chromium/WebKit synthetic actual-route checks pass 320/375/390 portrait,
844 landscape, direct labels/active 44px controls, one nav/clear map center, keyboard
Enter/Space open and Escape/close focus restore, preserved search/details/mining
quantities, guide-to-Objects/icon-Console/resume and inert release. Original frozen
Storybook chrome parity, first-login and touch/mouse/keyboard camera checks pass.
The user's local browser verified direct open/switch/Arrange, retained draft and
close, with original chrome intact. Native iPhone acceptance remains pending.

The supplied Library screenshot IDs could not be opened: the local session exposed
no Library content tools. Implementation was grounded in current source/rendered
routes rather than claiming those attachments were inspected.

Complete gzip home/login/system 200; system HTML stays no-store. All 34 initial
JS/CSS responses match build bytes; all 7 pins match. Anonymous edge 302, Storybook 200,
debug/QA 404 and foreign Origin POST 403 remain. Errors 0 bytes / unchanged 347 byte
transport log (two historical downstream aborts). Captures:
.scratch/hud-card-baseline/direct-icons-{map,panel}-phone.png. Evidence:
/tmp/hexaverse-direct-icons-{unit,static-final,build,storybook,candidate,camera-first,live}.log.

The first post-deploy QA run hit a reset GET connection in its browser-to-local
resource forwarder while fetching the rocky thumbnail. A direct read returned 200
and exactly matched the build; supervisor/transport logs stayed 0/347 bytes and all
processes remained healthy. The QA forwarder now retries one ECONNRESET for GET
only (Playwright maxRetries), never HTTP errors or gameplay writes. Original
failure log: /tmp/hexaverse-direct-icons-live-first-reset.log. No production code,
process restart, gate or exposure change was needed for this harness issue.

The deployed rerun passes in Chromium and WebKit: direct44px icons, keyboard and
focus restore, tutorial/resume/inert handoffs, retained drafts, original chrome
parity and desktop behavior. Final browser errors[]; no live game writes. Temporary
candidate20215 and local Storybook20218 listeners were stopped after verification.
The in-app browser viewport was reset and its temporary inspection tab closed.

## Battery-shutdown recovery — 2026-10-18 17:59 UTC

Travis requested $spinup and restarting the existing tunnel after battery shutdown.
The repository spinup skill was applied through GoLand MCP: dependencies already
existed; firebase:emulators, dev:backend, dev:frontend, dev:agent and storybook were
restored in IDE Run tabs. No existing listener required killing, no packages were
installed, and test-emulator lanes were untouched. Frontend20200/login,
backend20201/healthcheck, agent20202/health and Storybook20203 return200. Enabled
Firebase Auth/Firestore/websocket/PubSub/UI/hub/logging ports are ready; storage
is not enabled. These development services remain running after preview testing.

Reboot cleared temporary preview builds and logs. Rebuilt accepted commit bd41074
in /private/tmp/hexaverse-recovered-preview-66adydwd (build RPXd_Ngg6m1kqFBcDgvQ1)
and restored the temporary launchd supervisor at
/tmp/hexaverse-weekend-supervision/preview.plist. It owns only frontend20209,
gateway20204 and ngrok. The same gulf-identity-scrap.ngrok-free.dev URL, exact
Google-email allowlist, existing routes and Oct19 00:00UTC cutoff remain. No
new login/power settings or exposure were introduced. Seven source/build/policy
pins, bounded restart delays and process-group termination at cutoff are enforced.
Local preview/login200 and anonymous external302 verified. Post-reboot error and
transport logs start empty; the historical347-byte transport log was lost rather
than preserved through reboot. The accepted build remains live until the Objects
candidate finishes verification and the existing supervisor is switched.

### Objects candidate deployed — 2026-10-18 18:18 UTC

Local commit aafb57f removes the inner Objects disclosure and pins text search
while showing all available rows immediately. Verified isolated production build
**dzvUlXJ5gttS9vxBEcbSW** now serves through the existing supervisor. Only the
frontend snapshot path and its two build pins changed; gateway/ngrok commands,
exact Google-email restriction, deadline and existing published Storybook/art
snapshot are unchanged. All57 public assets and original card-shell CSS match the
accepted source. The new Objects search story is available in local Storybook20203.

Complete compressed home/login/system HTML200 (system no-store),33initial served
JS/CSS assets matching build bytes,7valid pins, anonymous edge302, Storybook200,
debug/QA404 and foreign OriginPOST403 verified. Chromium/WebKit runs through the
live gateway pass immediate24synthetic rows, sticky search over actual overflow,
320/375/390portrait/844landscape/1280desktop, filtering/clear/no-results,
keyboard/detail/Back/close, original chrome and guide/resume/inert handoffs.
Errors[] and no live game writes; all game/Auth traffic uses synthetic intercepted
fixtures. Native Chromium list touch and both-engine PageDown pass. Native WebKit
swipe, physical iPhone acceptance and local user-Chrome inspection remain unverified;
the latter's browser connection disappeared and native access timed out after reboot.

383unit/component tests across24files, types/scoped lint and production/Storybook
builds pass. Full emulator journeys were updated/type checked, not executed.
Evidence: /tmp/hexaverse-objects-search-{regression,candidate-final,live,deployment}.log,
/tmp/hexaverse-objects-camera-first.log and .scratch/hud-card-baseline/objects-sticky-search-
{phone,desktop}.png. Supervisor errors and post-reboot transport logs remain0bytes.
Stopped only temporary candidate20218 after validation; all requested development
services, emulators and protected preview remain running. No push.

### Shared input-focus fix deployed — 2026-10-18

Source commit602e8da, build **LZQ850NK0eM1Mfbe64zJo**, replaces dzvUlXJ5gttS9vxBEcbSW
through the same supervisor. IMG_1048 was inspected locally: the initial Recovery
Signal is enlarged/clipped after input interaction, but the exact focused field
is not visible. Actual preceding login and autofocus wake/name controls computed
14px in the served baseline, with no reducing transforms; the earlier16px fix
covered only HUD cards. Shared global form sizing now applies max(16px,1rem) on
mobile/short-landscape/coarse-pointer surfaces before focus, including portalled
controls. Desktop fine-pointer controls retain14px. Focus/blur now clears stale
keyboard viewport pan without resetting browser scale. Original card/navigation
CSS, all57 assets, touch gestures and unrestricted viewport zoom remain unchanged.

430tests/28files, types/scoped lint and production/Storybook builds pass. Candidate
and live-route login/signup-confirm/wake-invalid audits compute16px with effective
scale1 and no ancestor shrink. Both-engine shared-control checks cover17 native
variants/states and a portalled naming field at320/390/844 widths. Candidate
mining/sell/refuel, sticky Objects, guide/inert and first-login/camera checks pass.
All Auth/game traffic is intercepted synthetic data; no live commands submitted.

Deployment verification: complete compressed pages200 (system no-store),33initial
served JS/CSS assets byte-identical,7valid pins, anonymous302,Storybook200,
debug/QA404 and foreignOriginPOST403. Same exact identity/cutoff/routes and pinned
published Storybook/art. Error/transport logs0bytes. No push or security changes.
Native iPhone focus magnification/software keyboard and local user-Chrome remain
unverified. Existing magnification is not forcibly reset because that could also
be deliberate accessibility zoom. See docs/hud.md and input-focus-evidence.json.

Live gateway final runs pass in Chromium and WebKit: login/signup/name-invalid
at16px, sell/refuel and sticky Objects fields at16px/effective scale1, 320/375/390
portrait/landscape/desktop layout, guide/icon/inert/Back handoffs and first-login/
camera checks. Errors[]; no live writes. A QA resource-forwarder teardown race
was limited to post-assertion cleanup; its handler now ignores errors only once
teardown begins, while active request errors still fail the run. Final runs exit0.
Shared-control placeholder/font and modal checks also exit0 in both engines.
Saved compact audit: .scratch/hud-card-baseline/input-focus-evidence.json; matching
initial Recovery Signal capture: input-focus-recovery-phone.png. The private
IMG_1048 reference itself remains unpublished. Temporary candidate20218 stopped;
development services and protected preview remain running. Shared production
files are ready for the separately authorized shell/Galaxy work; no such refactor
was attempted in this fix.

### Shared game shell deployed — 2026-10-18 19:19 UTC

Build **ZxLqLPRswDR9eUMPSekHj** now serves the shared Galaxy/System shell and
Galaxy workspace through the existing protected preview. Travis explicitly approved
the brief restart at 19:18 UTC after the initial automatic-review block. The old
supervisor finished stopping 19:18:52 UTC; its replacement started 19:19:12 UTC with
frontend 11573/gateway 11574/ngrok 11575. Only the frontend snapshot path and two build
pins changed. All 57 public assets, original 624c4ff card CSS, released iOS input/viewport
fixes, gateway/ngrok commands, routes, exact Google/email policy and
2026-10-19T00:00:00Z cutoff remain unchanged.

438 tests / 30 files, types/scoped lint and isolated production build pass. Live
Chromium/WebKit checks cover390 portrait,844 landscape and1280 desktop guest/auth,
renderer readiness, search/details/focus, shared preferences and corporation
isolation. Both engines also pass first-login/guide isolation, direct mobile icon
navigation, original close target and 16px input checks with synthetic intercepted
identity/game APIs. No real user/game writes occurred.

All 34 initial JS/CSS resources match build bytes and all 7 pins pass. Home/login/system
HTML and Storybook return200; debug/QA remain404, foreign-Origin writes403,
unauthenticated galaxy/account APIs401 and anonymous protected edge302. Supervision
and transport error logs remain empty. The temporary candidate listener is stopped.
[Implementation, screenshots and live evidence](../.scratch/shared-game-shell/README.md)
record snapshot/config paths and checks. Source implementation:e3bfdcb; local commits
only, no push. Native physical-iPhone acceptance and full emulator gameplay journeys
remain unverified.

### Footer and Command fleet cleanup deployed — 2026-10-18 20:34 UTC

Build **u9qNOlafjaKaU_zBlgiqo** now serves the single Galaxy map button, Account/
Sign out inside existing Arrange HUD settings, and direct Command fleet selection.
Telemetry is preserved in Command, including resolved dock host and burn target/ETA;
the map telemetry toggle, fleet dropdown and Account footer panel are removed.
The production travel-review dropdown is replaced by a link to the same Command
selector. Source implementation: 568e9d5; local commits only, no push.

The initial cleanup was activated at 20:27 UTC; the final status-preserving build was
activated at 20:34:39 UTC (frontend 16659/gateway 16660/ngrok 16661). Only frontend snapshot
paths and their two build pins changed. Exact Google/email protection, gateway/ngrok
commands, routes, all 57 public assets, frozen 624c4ff card CSS, released iOS fixes and
2026-10-19T00:00:00Z cutoff remain unchanged. The temporary candidate listener is
stopped. Config backups and snapshot paths are in the
[implementation/evidence record](../.scratch/footer-cleanup/README.md).

584 tests / 39 files, TypeScript, scoped lint and production build pass. Final candidate
and live Chromium/WebKit checks pass 390 portrait/844 landscape/1280 desktop for the
single footer button, direct selected-fleet state, telemetry, reachable account
settings, guest/auth, retained state and original chrome. Both engines also pass
live first-login/guide, sheet isolation, direct icons and 16px input regressions.
Sign-out wiring is tested with a unit spy; browser QA never activates Sign out, and
all identity/game API traffic is synthetic. No real user/game writes occurred.

Home/login/system HTML and all 34 initial JS/CSS resources match final build bytes;
all 7 pins pass. Storybook 200, debug/QA 404, foreign-Origin writes 403, unauthenticated
galaxy/account APIs 401 and anonymous edge 302 remain correct. Supervision and
transport error logs are empty. Native physical-iPhone acceptance and full emulator
gameplay journeys remain unverified. An earlier synthetic HTTPS WebKit blob-resource
message did not recur in an isolated diagnostic or the final full candidate/live
sweeps; no blob-error filtering is applied during assertions.

### Fleet names and grouped navigation deployed — 2026-10-18 21:08 UTC

Build **djrZX23fL1PNIxIAUI8rm** serves optional owner-facing fleet names with an
explicit legacy-ID fallback, plus leave/selected-system-enter icons beside the
existing HUD controls. The old footer, reserved spacing and duplicate inspector
Enter control are removed. No live fleets were named, renamed or migrated; the
optional read contract does not imply existing fleets contain names. Source local
commit: a5c4e8e; no push.

The backend alone was refreshed through GoLand dev:backend and is healthy on
20201 (PID 19255); existing emulators stayed running. The protected supervisor
restarted at 21:08:32 UTC (frontend 21074, gateway 21075, ngrok 21076), changing only
the frontend snapshot path and its two build pins. Existing auth/email policy,
gateway/ngrok commands, routes, all 57 public assets, original card CSS, released
iOS fixes and 2026-10-19T00:00:00Z cutoff are unchanged. Candidate 20218 is stopped.

501 frontend tests / 37 files, TypeScript, scoped lint, production build and backend
fleet/corporations short tests and compilation pass. Candidate and final live
Chromium/WebKit sweeps pass portrait/landscape/desktop with synthetic identities
and blocked game writes. Both engines pass first-login/guide, full-page HUD,
original chrome and 16px field checks. Initial live WebKit blob errors did not
recur in the isolated landscape check or final full rerun; no assertion error
filtering was added. Two downstream-aborted model/static requests are retained in
transport diagnostics; supervisor errors are empty.

Home/login/system HTML and 35 initial JS/CSS assets match the serving build; all
seven pins pass. Storybook 200, debug/QA 404, foreign-Origin POST 403, unauthenticated
galaxy/account APIs 401 and anonymous edge 302 remain correct. The
[evidence record](../.scratch/scene-navigation/README.md) preserves initial failures
and final checks. Physical-iPhone and full emulator gameplay acceptance remain
unverified.

### Shared Galaxy/System controls deployed — 2026-10-18 21:58 UTC

Build **MkAAbDiRe8bzrMLMoKGOR** uses one extracted MapCameraRig in both scenes.
System now follows Galaxy's one-finger/left-drag orbit, two-finger pan plus pinch,
right-drag pan, middle-drag dolly, plain-wheel ground pan and Ctrl+wheel dolly.
Keyboard shortcuts live in the same controller. System retains its Y-up/extent
adapter, follow/picking/projection pipeline and scene-specific selection callbacks;
no persistent renderer or gameplay rule change was introduced. Source local
commit: 275bfb5; no push.

The protected supervisor restarted at 21:58:03 UTC (frontend 27129, gateway 27130,
ngrok 27131). Only the frontend snapshot and two build pins changed. Backend and
emulators stayed running. Exact Google/email protection, gateway/ngrok commands,
routes, 57 public assets, original card CSS, iOS files and the existing
2026-10-19T00:00:00Z cutoff are unchanged. Temporary candidate 20218 is stopped.

582 scoped tests / 41 files, types, scoped lint and production build pass. Six
candidate Chromium/WebKit profiles cover portrait/landscape/desktop; final live
phone checks pass in both engines. Chromium generates trusted touch sequences;
WebKit drags use injected Pointer Events because native swipe automation is
unavailable. Focus/orbit, gesture parity, keyboard, HUD/chrome and selection/quote
regressions are covered without live writes or Sign out activation.

Live HTML and 36 initial JS/CSS assets match the candidate; seven pins pass.
Storybook 200, debug/QA 404, foreign-Origin POST 403, unauthenticated API 401 and
anonymous edge 302 remain correct. Supervisor errors are empty; transport retains
two prior aborted GETs, with no new record after activation. The
[evidence record](../.scratch/shared-map-controls/README.md) retains the interrupted
QA run and completed profile reruns. Physical-iPhone and full emulator gameplay
acceptance remain unverified.

### Shared card highlights deployed — 2026-10-18 22:18 UTC

Build **LIQ5XAA0mkhVDiW0hfwKs** and the protected static Storybook enable the existing
signal effect on Plain and owning workspace cards. Wide already used that effect;
Plain's original explicit none override was the cause of the visual difference.
Static Frame retains the CSS-only variant. Shader constants, materials, original
header/close CSS and frozen fixtures remain unchanged. Source commit: 5e00e95.

Final supervisor activation was 22:18:53 UTC (frontend 30127, gateway 30128, ngrok
30129). The preceding Storybook copies and config are preserved under
/tmp/hexaverse-weekend-supervision. Frontend/build pins and Storybook index pin
changed; auth/email policy, gateway/ngrok commands, routes, 57 public assets, iOS
files, shared controls and 2026-10-19T00:00:00Z cutoff are unchanged. Backend,
emulators and local Storybook 20203 were not restarted. Candidate 20218 is stopped.

584 scoped tests / 41 files, types/lint, Next and audited Storybook builds pass.
Twenty lit/static pixel comparisons cover Plain/Wide and real Galaxy/System cards
at phone/landscape/desktop sizes. Both actual Storybook URLs on 20203 and deployed
Storybook variants pass Chromium/WebKit; game candidate profiles and final live
phone checks pass. Multiple visible owners retain stable renderer counts, bounded
submissions, reduced-motion stop and exact disposal. The browser engines exercised
WebGL2 fallback; physical native-WebGPU/iPhone acceptance remains separate.

Live HTML/36 initial assets match; seven pins pass. Storybook 200, debug/QA 404 and
foreign-Origin POST 403 remain correct. Initial bare-HTTP Storybook module 403s
confirmed exact-Origin enforcement; final checks use the configured HTTPS origin.
No policy was weakened. [Evidence](../.scratch/card-lighting/README.md) preserves
the initial WebKit blob-error run and passing isolated rerun, comparisons and
main-branch integration. No live writes, sign-out activation or push occurred.
