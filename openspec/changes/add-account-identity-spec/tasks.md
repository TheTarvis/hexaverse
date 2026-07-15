## 1. Spec authoring

- [ ] 1.1 Confirm each requirement against `backend/account/handler.go`,
      `model.go`, `dao.go`, and `subscriptions.go` — no code changes
      expected.
- [ ] 1.2 Record the self-reported-profile-fields open question (see
      `design.md`) for a future decision; do not resolve it in this change.
- [ ] 1.3 Record the concurrent-account-creation and account-deletion-path
      open questions (see `design.md`), confirmed against
      `backend/account/dao.go` (`GetAccountByFirestoreUid`/`SaveAccount`)
      and `backend/middlewares/firebase_jwt.go`
      (`FirebaseUidToAccountMiddleware`) — no code changes expected.
- [ ] 1.4 Confirm the strict rate-limit tier's application to the three
      account-creation/enumeration routes against `backend/router.go` and
      `backend/account/handler.go`'s `RegisterRoutes`.

## 2. Validation

- [ ] 2.1 `openspec validate add-account-identity-spec --strict`
