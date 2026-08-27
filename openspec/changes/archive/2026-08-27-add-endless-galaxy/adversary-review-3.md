# Adversary Review #3 — add-endless-galaxy (2026-08-20)

Verdict: **CLEAN-WITH-MINORS** — all three round-2 blockers verified
genuinely resolved (R2-B1 anchor read set provably complete; R2-B2 walk
ensure rule in requirement; R2-B3 reservation as criterion (c) with
recorded-home healing). Round-2 majors/minors resolved except R2-m3
(partial → F5) and R2-m8 (design contradiction introduced → F1).
Clean passes: fidelity walk, reservation lifecycle atomicity,
full-lane-horizon well-definedness from pure field data, recorded-home vs
baseline healing, tasks/spec drift, observation baseline preservation,
cross-change disjointness with add-credits-and-npc-market (verified).

## MAJOR (each a one-clause repair; applied in the round-3 fix pass)

- **F1. Bounds invariant vs alongside-merge contradiction.** Spec says
  bounds "always contain every materialized system" / "the next GET";
  D7's non-atomic lost-update merge cannot guarantee that. Fix (option a):
  atomic monotonic max on the galaxy doc in its own retried transaction,
  outside the block txn — no hotspot, no lost updates; correct D7's
  "self-heals" line.
- **F2. Empty-frontier outcome undefined.** A finite origin pocket smaller
  than the depth cap exhausts the BFS queue with no specified result (nil
  home / 500) — the design names this exact path as what the rail is for.
  Fix: extend the failure clause with "or the walk exhausts the
  lane-reachable graph without a qualifier" + scenario.
- **F3. Re-pick vs One Living Corporation Per Account.** Same-account
  double-spawn: loser fails BOTH the account pointer and the reservation;
  treating it as a reservation race re-picks to exhaustion → 503 where the
  baseline requires 200 with the winner's corp. Fix: account-has-corp
  commit failure returns the winner's corporation, never re-picks; only
  reservation contention by a different account triggers re-pick.

## MINOR

- **F4.** "Full lane horizon" used by two consumers, defined nowhere in
  galaxy-generation — add the defining sentence to the materialization
  requirement.
- **F5.** `MinOriginComponentSystems < 1` rejection has no scenario.
- **F6.** Bridge clause's "non-empty block" must pin FIELD emptiness (not
  materialized emptiness) or bridges go history-dependent.
- **F7.** "Block-hop distance" needs a metric (Chebyshev).
- **F8.** Determinism scenario's "same galaxy" is unreproducible after the
  first run materializes blocks — pin field/claimed/reservation state,
  independent of materialization.
- **F9.** Uniform draw needs a pinned candidate ordering (by system id) or
  Go map iteration silently breaks determinism.
- **F10.** `SpawnParams` validation (where, what error) unspecified.
- **F11.** Two sources of truth for "home system" (recorded home vs hull's
  current system) — recorded home is the home of record.
- **F12.** Reservation permanence vs Death Invariant — state that a
  reservation outlives its corporation's death.
- **F13.** Proposal Impact omits `spawnClaims`, the recorded-home field,
  `MaxSpawnRepicks`.
