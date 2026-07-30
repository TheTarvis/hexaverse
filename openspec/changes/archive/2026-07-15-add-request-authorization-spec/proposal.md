## Why

`backend/middlewares/` is the authentication/authorization boundary every
other backend capability assumes exists — the `claude-agent-service`
baseline explicitly states "the backend's own auth enforcement is the only
permission boundary" (the agent inherits the user's own token, no
service-account path) — but the middleware chain itself was never
baselined. This closes that gap and, in `design.md`, records the
token-passthrough trust model plus two open questions the retrofit
analysis surfaced (channel subscribe-side authorization is owned by
`realtime-sse`; this change covers request-level auth/authz middleware).

## What Changes

- Add a new `request-authorization` capability documenting current,
  as-built behavior: Firebase bearer verification, the Firebase-UID→account
  mapping (including its soft-fail path that lets account creation
  proceed, and its fail-closed `500` on a lookup error), OIDC verification
  on push routes, the corporation-resolution seam
  (`ResolveCorporation`/`common.ActorCorp`), fixed-window rate limiting
  (strict vs. general tiers, concrete thresholds), error sanitization,
  security headers, the admin-only gate, request trace-id assignment, and
  auth-event audit logging.
- Baseline the confirmed, as-built defects the retrofit surfaced, each
  framed as "current, observable behavior — not an endorsement" rather than
  silently asserted as working: the push-route OIDC audience is hardcoded
  to a stale skeleton value that never matches what Terraform signs
  (every `/v1/push/*` route currently 401s in any deployed environment, on
  a service that also has no Cloud Run IAM backstop); the audit logger's
  identity-enrichment fields never populate (a context-key mismatch, so the
  requirement no longer claims identity capture) and, separately, never
  fires at all on push routes; per-IP rate limiting is bypassable via a
  spoofed `X-Forwarded-For` header, enforced per-instance rather than
  service-wide, and the same spoofing vector grows the limiter's in-memory
  map unbounded between cleanups; two dependency-initialization paths
  (`nil` Firebase auth client, `nil` account DAO) return `500`s
  indistinguishable from other failures; and a sanitized 5xx error's trace
  id is not yet surfaced anywhere in the frontend, so the correlation
  mechanism it exists for is not yet completed on the consuming side.
- Add `design.md` recording the token-passthrough trust model (the agent
  inherits the user's own permissions; the backend is the sole enforcement
  point) and cross-referencing the fleet/action ownership-check gap that
  the existing `fleet-movement` and `action-dispatch` baselines already
  document as current (unresolved) behavior — not re-litigated here.
- No code changes — documentation-only retrofit baseline.

## Impact

- Affected specs: `request-authorization` (new)
- Affected code: `backend/middlewares/`, `backend/router.go`,
  `backend/corporations/service.go` (read-only; no changes);
  `infra/terraform/{pubsub,scheduler,cloudrun}.tf` read only to confirm the
  OIDC push-audience defect and the missing Cloud Run IAM backstop;
  `frontend/` (`api-client.ts` and consuming capabilities) read only to
  confirm the trace-id-not-surfaced and corp-resolution-degradation gaps
