## 1. Spec authoring

- [x] 1.1 Confirm each requirement against
      `backend/middlewares/{firebase_jwt,firebase_jwt_query_param,oidc,
      corporation,rate_limiter,error_sanitizer,security_headers,admin,
      audit_logger,anonymous_id,tracer}.go` and `backend/router.go`'s
      wiring — no code changes expected.
- [x] 1.2 Record the token-passthrough trust model and the ownership-check
      cross-reference in `design.md` — do not resolve either open question.
- [x] 1.3 Cross-check the OIDC push audience against
      `infra/terraform/{pubsub,scheduler}.tf` and record the confirmed
      mismatch as a defect scenario, not a hypothetical.
- [x] 1.4 (panel revision) Confirm the additional dependency-initialization
      defect surfaces (nil `authClient`, nil `accountDao`), the rate
      limiter's memory-growth consequence, the push-route audit blind spot,
      and `ResolveCorporation`'s Firestore lookup as a fourth unbounded
      per-request call — against the same middleware files plus
      `backend/corporations/service.go` and
      `infra/terraform/cloudrun.tf` (`invoker_iam_disabled`) — and add the
      corresponding scenarios/design.md notes.
- [x] 1.5 (panel revision) Confirm the two consuming-side gaps against
      `frontend/` — the sanitized-5xx trace id is never read by
      `api-client.ts`, and no consumer distinguishes a corp-resolution
      fail-open degradation from genuine corplessness — and add the
      corresponding gap scenarios.

## 2. Validation

- [x] 2.1 `openspec validate add-request-authorization-spec --strict` — the
      CLI is now available (`openspec` `1.6.0`); ran it against this
      revision and it reports the change valid.
