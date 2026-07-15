---
name: spec-threat-modeling
description: Defensive threat modeling for spec review - STRIDE applied to OpenSpec requirements, authz-per-requirement discipline, deny-path scenario patterns, sensitive data checklist, Next.js/Go specific traps, implementation audit method. Load when security-reviewing an OpenSpec change or auditing its implementation.
---

# Threat Modeling OpenSpec Changes (Defensive Review)

Premise: a vulnerability the spec permits is a spec bug. This skill is for reviewing this team's own specs and code so controls are designed in — every finding produces a proposed requirement/scenario, not just an alarm.

## STRIDE, applied per requirement

For each ADDED/MODIFIED requirement, ask which threats the surface invites:

| Threat | Question against the requirement | Typical missing spec text |
|---|---|---|
| **S**poofing | Who is the actor, and how is identity established? | actor-qualified requirement + expired/invalid-credential scenario |
| **T**ampering | Can the input or stored value be altered by someone other than its owner? | validation requirement + integrity scenario |
| **R**epudiation | Would we know who did this, after the fact? | audit-record requirement for sensitive mutations |
| **I**nfo disclosure | What does the response/error/log reveal, and to whom? | redaction requirement + wrong-user deny scenario |
| **D**oS | What does abuse of this cost? | rate-limit requirement with numbers + limit-exceeded scenario |
| **E**levation | Can a lesser role reach this via a path the spec forgot? | role-qualified requirement + insufficient-role scenario |

## The four non-negotiable checks

1. **Actor per requirement.** Every requirement exposing data or accepting mutation names WHO may invoke it. "The system SHALL return the user's orders" — which user, to whom? Unqualified actors are findings. **IDOR is the default assumption** for any ID-in-request pattern until a scenario like "WHEN a user requests an order belonging to another user THEN the request fails with not-found" rules it out (prefer 404 over 403 for existence-hiding unless the design says otherwise).
2. **Deny paths as scenarios.** For each protected operation, the spec needs the failure side: wrong user, expired session, insufficient role, revoked token. A spec with only allow-paths will be implemented with only allow-paths.
3. **Input trust boundaries.** Every WHEN accepting external input gets: size limit, format/type constraint, and a rejection scenario. Free text that renders later (XSS) or enters queries (injection) needs explicit handling requirements. All limits are numbers, not "reasonable".
4. **Secrets and sensitive data lifecycle.** Inventory what the change stores/logs/transmits: credentials, tokens, PII, payment data. Each needs: at-rest handling (per design.md), **redaction from logs and error responses**, exclusion from URLs, and — for tokens/sessions — a numeric lifecycle (expiry, rotation, invalidation on logout AND password change). "Securely stored" is a weasel word; "stored only as a salted hash (argon2id/bcrypt per design.md)" is a spec.

## Abuse economics

Anything guessable (codes, tokens, login), enumerable (user IDs, emails via "already registered" errors), or expensive (search, export, email send) needs a specified cost to the attacker: rate limit with threshold + window + lockout behavior, and a scenario for the limit-exceeded path. Account enumeration via differing error messages is a classic spec-level bug — demand uniform responses where the design cares.

## Stack-specific traps

**Next.js**: Server Actions are public endpoints — each needs the same authz requirement as any API route (the page's UI hiding the button is not access control). No secrets in client components or `NEXT_PUBLIC_*`. Authenticated responses must not be statically cached (specify `no-store` behavior for per-user data). Middleware-only auth is bypassable by direct route-handler calls — authz belongs at the data access too.

**Go**: timeouts on every outbound call (missing timeout = resource-exhaustion vector). `http.MaxBytesReader` on request bodies. Multi-step mutations scenarios treat as atomic need transaction/idempotency requirements or a partial-write becomes an integrity hole. Error messages: internal detail logged, generic envelope returned.

## Implementation-phase audit (after code exists)

For each security requirement in the deltas:
1. **Find the enforcement point** (grep middleware, handler, domain check, query WHERE clause) — cite file:line. Unfindable enforcement = unenforced.
2. **Confirm the deny-path test exists** (SDET suite: 401/403/404 cases, limit-exceeded case). Enforcement without a test regresses silently.
3. **Sweep secrets hygiene**: grep for hardcoded credentials, tokens in logs, `NEXT_PUBLIC_` misuse, string-built SQL.
4. **Dependency check** where available: `npm audit`, `govulncheck ./...` — report, don't auto-upgrade.
5. A checked-off task whose security requirement is unenforced is a **BLOCKER** (false completion on a control).

## Finding discipline

Every finding: the requirement/file:line + the concrete attacker action it permits + severity (BLOCKER = exploitable access or exposure permitted · MAJOR = missing control or undefined limit · MINOR = hardening) + proposed delta text in exact OpenSpec format. No vibes-based findings — if you can't name the attacker's move, it's not a finding. No surface → say so in one line and stop.
