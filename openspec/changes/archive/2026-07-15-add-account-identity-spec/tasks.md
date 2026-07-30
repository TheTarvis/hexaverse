## 1. Spec authoring

- [x] 1.1 Confirm each requirement against `backend/account/handler.go`,
      `model.go`, `dao.go`, and `subscriptions.go` — no code changes
      expected. Confirmed via a line-by-line adversary fidelity walk:
      status codes (404-vs-500 split at `handler.go:39/49`, owner 403 at
      `handler.go:70-80` before any DAO read, creation branches, push
      no-op returning 200 via `WrapPushHandler`), `firestoreUid` omitted
      via `json:"-"` (`model.go:7`), `ToProfile` projects only
      Id/Name/Email/Picture (`model.go:38-45`). No code changes needed.
- [x] 1.2 Record the self-reported-profile-fields open question (see
      `design.md`) for a future decision; do not resolve it in this change.
      Recorded in `design.md` and left unresolved, as intended.
- [x] 1.3 Record the concurrent-account-creation and account-deletion-path
      open questions (see `design.md`), confirmed against
      `backend/account/dao.go` (`GetAccountByFirestoreUid`/`SaveAccount`)
      and `backend/middlewares/firebase_jwt.go`
      (`FirebaseUidToAccountMiddleware`) — no code changes expected.
      Recorded in `design.md`; confirmed against `dao.go`'s non-atomic
      check-then-write and `FirebaseUidToAccountMiddleware`. No code
      changes made.
- [x] 1.4 Confirm the strict rate-limit tier's application to the three
      account-creation/enumeration routes against `backend/router.go` and
      `backend/account/handler.go`'s `RegisterRoutes`. Confirmed:
      `strictLimit` applies to `POST /accounts`, `GET /accounts/firestore`,
      and `GET /accounts/:accountId/profile`; the owner read
      `GET /:accountId` is NOT strict — matching the requirement's route
      list. Consistent with `request-authorization/spec.md`.

## 2. Validation

- [x] 2.1 `openspec validate add-account-identity-spec --strict` — re-run
      post-archive of world-clock and request-authorization; reports the
      change valid.
