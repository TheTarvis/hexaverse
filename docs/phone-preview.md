# Authenticated phone preview proposal

Status: proposal, 2026-10-16. Travis wants to test from iOS while away.
Read-only diagnosis and this plan are authorized. Exposure, deployment, persistent
access, credentials, purchases and security/network changes await explicit approval.
No preview endpoint has been created by this plan.

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

Proposed duration: one foreground 60-minute pilot, then a separately agreed weekend
cutoff after phone verification. Stop ngrok and gateway processes on cutoff or
request, confirm the URL no longer reaches the app, and remove only temporary
preview configuration. Do not install launch agents or background persistence.
Mac awake/network availability is required; ngrok free endpoints do not expire
on their own. A weekend-long service is therefore not enabled by a pilot approval.

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
No tunnel or outer OAuth session has been created; identity/60-minute exposure
approval and actual account plan/quota remain pending.
