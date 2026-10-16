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
