---
name: postgres-safe-migrations
description: PostgreSQL data modeling and zero-downtime migration safety - constraints as spec enforcement, expand-migrate-contract sequencing, lock-hazard table for DDL, batched backfills, data lifecycle and pagination requirements, implementation audit checklist. Load when DBA-reviewing an OpenSpec change or its migrations.
---

# PostgreSQL Data Modeling and Safe Migrations

Premise: data outlives code — a bad function gets patched, a bad schema gets inherited for a decade, and a locking migration takes production down at deploy time. Applies at spec review (is the data behavior specified?) and implementation review (are the migrations safe?).

## Data rules ARE requirements

Uniqueness, referential integrity, cardinality, and lifecycle are observable behavior — they belong in spec deltas with scenarios, including the violation path:

- "User email SHALL be unique per tenant" + "WHEN a second account with the same email is created THEN registration fails with a conflict error."
- If the spec is silent on whether a thing can exist twice, someone will make it exist twice.
- Altitude: "unique per tenant" is spec; "partial unique index on `(tenant_id, lower(email))`" is design.md. Keep both, in their places.

## Constraints over convention

Every invariant a requirement states should be enforced by the schema where PostgreSQL can express it — application-code-only enforcement of a data invariant is a MAJOR finding (every future writer, backfill script, and admin console must re-implement it correctly):

| Invariant | Enforcement |
|---|---|
| Exists exactly once | `UNIQUE` (case handling explicit: `lower(email)`) |
| Must reference a real X | `FOREIGN KEY` with a DELIBERATE `ON DELETE` (see lifecycle) |
| Never absent | `NOT NULL` (added safely — see hazards) |
| Value in range/set | `CHECK` / enum-via-lookup-table (native enums are painful to alter) |
| At most one active per owner | **partial unique index** (`WHERE active`) — a scenario alone cannot prevent this race |
| Read-modify-write races | version column (optimistic) / `SELECT FOR UPDATE` / single-statement atomic `UPDATE` — design.md names which |

## Expand-migrate-contract (the only deploy-safe shape)

Schema change and dependent code must never require simultaneous deployment. Sequence every change so **each step is compatible with both the code before and after it**:

1. **Expand**: add new column (nullable or defaulted) / new table / new index `CONCURRENTLY`. Old code ignores it.
2. **Migrate**: deploy code writing both/reading new-with-fallback; backfill in batches.
3. **Contract** (separate, later deploy): tighten `NOT NULL`, drop old column — only after verifying nothing reads it.

Findings: rename-in-place (rename = add new + dual-write + drop old, later); column drop in the same deploy as the code change; any step that can't be rolled back after taking traffic.

## Lock-hazard table (PostgreSQL specifics)

| Operation | Hazard | Safe form |
|---|---|---|
| `CREATE INDEX` | blocks writes for the build | `CREATE INDEX CONCURRENTLY` (outside a transaction) |
| `ADD COLUMN ... NOT NULL` (no default, existing rows) | fails/rewrites | add nullable → backfill → `SET NOT NULL` (pg11+: constant default is safe) |
| `SET NOT NULL` | full-table scan under lock | pg12+: add `CHECK (col IS NOT NULL) NOT VALID` → `VALIDATE CONSTRAINT` → `SET NOT NULL` |
| `ALTER COLUMN TYPE` | full rewrite + exclusive lock | new column + dual-write + backfill + swap |
| `ADD FOREIGN KEY` | validates whole table under lock | `NOT VALID` then `VALIDATE CONSTRAINT` |
| Any DDL in one transaction with data updates | holds locks for the whole batch | separate DDL from DML migrations |

**Backfills**: batched (bounded rows per statement), checkpointed/resumable, abortable, off the migration critical path (a migration that must touch 50M rows before deploy completes is a BLOCKER). Set `lock_timeout`/`statement_timeout` in migration sessions so a blocked migration fails fast instead of queueing behind and blocking production traffic.

## Lifecycle, retention, pagination

- **Every new entity answers: how does it die?** Soft-delete vs. hard-delete is spec-visible behavior (does the name still appear on old orders?). Cascade behavior is a scenario, not an FK accident: "WHEN a user is deleted THEN their orders are retained with the author anonymized" → design.md picks `ON DELETE SET NULL` vs. application-level anonymization.
- Retention/privacy constraints the design doc names (GDPR deletion, audit retention) become requirements with scenarios.
- **Pagination is a requirement, not an optimization**, on any list that grows. Prefer keyset/cursor over OFFSET for large sets (design.md decision); the requirement states ordering and page bounds.

## Query-shape sanity (spec stage)

Read requirements for access patterns ("list a user's X filtered by Y, ordered by Z") and check design.md's model supports them: indexes matching stated filters/sorts, no N+1-shaped access (child fetched per parent row), no unbounded `IN` lists, counts that will need estimation at scale.

## Implementation audit checklist

- Migrations numbered, append-only (never edit an applied migration), matching the approved plan's expand/contract sequencing; hazards from the table above checked file by file.
- Queries: parameterized ONLY (string-built SQL = automatic BLOCKER); transactions span exactly the atomic unit scenarios demand; the concurrency strategy design.md named actually appears in the code.
- Integrity scenarios tested against a **real database** (testcontainers/compose), not mocks — a mocked store cannot fail a uniqueness test honestly.
- Constraint names explicit (not autogenerated) so future migrations can reference them.
