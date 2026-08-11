## ADDED Requirements

### Requirement: Escrow-Mutating Routes With No Ledger Entry Also Join the Per-Corporation Write Quota
`market-listings`'s cancel route mutates a corporation's locked/available
balance split (releasing an escrow reservation) without appending a
trade-ledger entry, so it falls outside the literal "appends a trade-ledger
entry" scope of `request-authorization`'s "Per-Corporation Write Quota on
Credit-Mutating Routes." This route SHALL nonetheless be counted against
that same per-corporation quota bucket, keyed identically
(`common.ActorCorp`), since it is an equally corporation-scoped, equally
per-IP-spoofable write surface as any route already in that quota's group.
`market-listings`'s post route (buy or sell) already joins the quota
unmodified, since posting always appends a `listingFee` ledger entry and so
already falls within the existing requirement's own stated scope.
`trading-station`'s deposit and withdraw routes mutate no credit balance at
all (only tonnage) and do NOT join this quota — the general per-IP tier
already applied to the whole authorized group is sufficient for them, for
the same reason `goods-sale`'s own sell route relies on the general tier
for everything the strict credential/enumeration tier does not cover.

#### Scenario: A corporation's listing cancels count toward its per-corporation quota
- **WHEN** a corporation submits cancel requests against its own open
  listings
- **THEN** each is counted against that corporation's per-corporation write
  quota bucket, the same bucket its listing posts and sales count against

#### Scenario: Exceeding the quota via cancels alone is rejected exactly as via posts or sales
- **WHEN** a corporation's combined posts, cancels, and sales in one minute
  exceed the configured per-corporation quota
- **THEN** requests over the quota receive `429 Too Many Requests`,
  regardless of which of the three route types pushed the count over

#### Scenario: A storage deposit or withdrawal does not draw against the credit-mutating quota
- **WHEN** a corporation submits many storage deposit or withdrawal
  requests in one minute
- **THEN** none of them are counted against the per-corporation
  credit-mutating quota, only against the general per-IP tier
