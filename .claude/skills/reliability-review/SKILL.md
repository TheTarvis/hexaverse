---
name: reliability-review
description: Reliability engineering review method for specs - dependency failure-mode inventory, converting adjectives to thresholds, degradation and blast-radius analysis, retry/idempotency semantics, observability requirements, expand-migrate-contract rollout safety. Load when reliability-reviewing an OpenSpec change.
---

# Reliability Review of OpenSpec Changes

Premise: everything fails — dependencies, networks, deploys, disks. A spec that only describes the working system is half a spec, and the missing half is discovered at 3am. The review forces failure behavior into requirements while it's still cheap.

## 1. Dependency failure inventory

List every external dependency the change introduces or touches: Go service→service calls, third-party APIs, database, cache, queue, email/SMS providers, the Next.js→Go boundary itself. For each, three questions — each answer should exist as a scenario or design.md decision:

- **Slow** (latency, not failure): what bounds the wait? (timeout value → design.md; resulting caller-visible behavior → scenario)
- **Down** (connection refused / 5xx): what does the user/caller observe? Is the failure contained or does it cascade?
- **Wrong** (garbage/partial responses): validated or trusted?

The signature scenario shape: "WHEN the payment provider times out, THEN the order is marked pending and the user is informed — AND the customer is not double-charged." **Fail-open vs. fail-closed is an explicit decision** for anything guarding access or money (fail-closed by default; fail-open only with the design doc's blessing, recorded in design.md).

## 2. Numbers, not adjectives

Sweep for: fast, responsive, real-time, highly available, scalable, eventually, periodically, large, heavy. Each becomes a testable threshold in the requirement — p95 latency, max payload, expected volume, sync interval. Source the number from the design doc; **when the doc is silent, file an open question — never invent an SLO**, because invented numbers become contractual. Then sanity-check feasibility: "SHALL complete within 200ms" calling a third-party API is a finding against the design, not a spec to rubber-stamp.

## 3. Degradation and blast radius

- For each user-facing capability: what still works when each subsystem is down? Specify the degraded mode where the design implies one ("WHEN recommendations are unavailable THEN the product page renders without the recommendations section").
- **Blast-radius widening**: a change that makes a previously independent page/flow depend on a new service has coupled their availability. That trade-off must be stated in design.md `## Risks / Trade-offs` — implicit coupling is a MAJOR finding.
- New synchronous chains (A→B→C) multiply failure rates and add latencies; ask whether the design doc intended async.

## 4. Retry and idempotency semantics

Anything retried — by users (double-click, refresh), clients (timeout retry), or infrastructure (queue redelivery) — executes **at least once, possibly more**:

- Mutations reachable by retries need an idempotency requirement (key-based or naturally idempotent), with a duplicate-submission scenario.
- Queue/event consumers need a duplicate-delivery scenario and, where ordering matters, an out-of-order scenario.
- Retry policies (who retries, how many times, with what backoff) live in design.md; the caller-visible outcome after retries exhaust lives in a scenario. Retries without backoff+jitter against a struggling dependency are a self-inflicted outage — flag them.

## 5. Observability as requirements

A capability whose failures are invisible is unfinished. Where the change adds meaningful failure modes, propose testable, tool-agnostic requirements:

- Failures distinguishable by cause: "The system SHALL record delivery failures such that failures are countable per destination and per cause" — not "add monitoring".
- Key operations traceable end-to-end (the repo's correlation/request-ID convention, per design.md).
- Anything with a threshold (rate limit, quota, expiry sweep) observable when it triggers — otherwise ops can't distinguish "limit working" from "feature broken".

Phrase them as SHALLs with scenarios where feasible ("WHEN a delivery fails THEN the failure is recorded with destination and cause"), so SDET can automate them.

## 6. Rollout and rollback safety

Read design.md's `## Migration Plan` with one question: **can this deploy be reversed after taking traffic?**

- Schema changes follow expand-migrate-contract (details in `postgres-safe-migrations`); schema change + dependent code in one atomic deploy is a finding.
- Backfills: batched, checkpointed, resumable, and abortable — a backfill that must finish or corrupt is a BLOCKER.
- Irreversible data rewrites (destructive transforms, dropped columns with data) need explicit design-doc sanction and a stated point-of-no-return.
- New config/flags: what's the safe default if the flag system itself fails?

## Discipline

- **Proportionality**: an internal admin CRUD page needs failure scenarios for its DB dependency, not an SLO and a degradation matrix. Calibrate to blast radius; "low reliability surface, no findings" is a valid, complete review.
- Proposed WHENs must be **inducible without a production incident**: "WHEN the provider returns 5xx / times out" (injectable via the test harness), never "WHEN there is an outage".
- Every finding: severity (BLOCKER = data loss/undefined behavior under plausible failure, or irreversible rollout · MAJOR = unspecified failure mode or adjective threshold · MINOR = observability polish) + what it attaches to + proposed text in exact OpenSpec format.
