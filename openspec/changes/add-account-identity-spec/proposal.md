## Why

`backend/account/` — the Firestore mirror of the Firebase-authenticated
user, keyed by `firestoreUid` — is live code with four routes and a push
subscription, but was never baselined in the prior OpenSpec retrofit pass.
Every other identity-adjacent capability (`corporation-spawn`,
`request-authorization`) references "the account" without owning what an
account is or how it is created; this closes that gap from the actual
handler/DAO behavior.

## What Changes

- Add a new `account-identity` capability documenting current, as-built
  behavior: the self/by-id/profile read routes, account creation (and its
  identity binding — see `design.md`), and the no-op push subscription
  placeholder.
- No code changes — documentation-only retrofit baseline.

## Impact

- Affected specs: `account-identity` (new)
- Affected code: `backend/account/` (read-only; no changes). Note:
  `backend/middlewares/firebase_jwt.go` calls this capability's DAO on
  every authenticated request app-wide, not just `backend/account/`'s own
  routes — see `design.md` Risks; that middleware itself is owned by the
  sibling `request-authorization` capability and is untouched here.
