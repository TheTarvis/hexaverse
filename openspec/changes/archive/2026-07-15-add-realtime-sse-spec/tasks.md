## 1. Spec authoring

- [x] 1.1 Confirm each requirement against `backend/sse/handler.go`,
      `manager.go`, and `subscriptions.go` — no code changes expected.
- [x] 1.2 Confirm the 900-second platform timeout and the multi-instance
      fan-out gap against `infra/terraform/cloudrun.tf`
      (`timeout = "900s"`, `max_instance_count = 10`).
- [x] 1.3 Carry the subscribe-side authorization gap (`No Channel-Ownership
      Binding on Subscribe`) into the same defect class as
      `action-dispatch`'s `No Caller-Identity Binding on Action Endpoints`
      and `request-authorization`'s "A3" fleet/action ownership-check gap —
      all three are the same shape (no corp-ownership check on a
      caller-supplied scope/actor id) and should close under one future
      enforcement change, not three independently-scoped patches. The
      *documentation* cross-link already exists (`add-request-authorization-
      spec`'s `design.md` Open Questions names this gap as owned by
      `realtime-sse`); the *enforcement* change (e.g.
      `enforce-channel-and-action-ownership`) does not exist yet and its
      scoping (own-id vs. sensor-coverage audience rule, response code, one
      change vs. several) is a decision for Travis, not created by this
      task (design.md Open Question Q1's "Disputed severity" note).
- [x] 1.4 Carry the security panel's unadopted hardening controls
      (token-in-log redaction or a short-lived stream ticket, a per-account
      concurrent-connection cap and connection-rate limit, a bounded max
      connection lifetime) into the same follow-up change's scoping
      (design.md Open Question Q2). The *defects* these controls would fix
      are now documented as spec requirements/scenarios in this change
      (`Per-Channel Event Stream`'s token-in-URL scenario, `Stream Route Is
      Outside the Rate-Limited, Corp-Resolved Group`); only the controls
      themselves remain future work.
- [x] 1.5 Carry the reliability panel's observability gap (no counter/gauge
      for a zero-match broadcast or connected-client count) into the same
      follow-up change's scoping (design.md Open Question Q3).
- [x] 1.6 Confirm the OIDC push-audience defect cross-referenced on
      `Action-Completion Fan-Out` against `backend/middlewares/oidc.go`
      (`pushAudience`) and `infra/terraform/pubsub.tf` /
      `scheduler.tf` (the signed audience) — matches
      `add-request-authorization-spec`'s own "OIDC Gate on Push Routes"
      defect scenario; no new investigation, just a consistent citation.
- [x] 1.7 Confirm the slow-consumer buffer capacity (100-event channel) and
      the unbounded per-instance client map against `backend/sse/manager.go`
      (`make(chan *Event, 100)`, `AddClient`).

## 2. Validation

- [x] 2.1 `openspec validate add-realtime-sse-spec --strict`
