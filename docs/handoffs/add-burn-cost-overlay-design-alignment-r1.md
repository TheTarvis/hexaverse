# add-burn-cost-overlay — design.md alignment list after the round-1 repair

From the spec writer's round-1 repair hand-back, verbatim (2026-10-05). The
delta, tasks.md and proposal.md are the repaired state; design.md must be made
to agree with them. Findings: `add-burn-cost-overlay-adversary-r1.md`.

1. Decision 5 (lines ~275-277) quotes requirement text ("at the extent's end, displaced only as far as it must be…") that is not in the delta. Replace it with the delta's wording: start position at the extent's length in percent, pulled back by the same percentage of the mark's own width.
2. Decision 5's closing paragraph (lines ~308-312) and Decision 11's mark row (line ~493) say task 2.2 leaves position to review. Task 2.2 now asserts both components at costs 0, 100 and 250. Only pixel containment and the rounded cap are left to the journey, where an unaffordable overlay is arranged.
3. Decision 5's tier-1 table needs a row for the band's part height (task 1.1), and for the mark's non-zero full-height size and its colour tokens differing from the band's (tasks 2.2 and 1.4).
4. The wrong-reader table (line ~90) and the Decision 11 row (line ~499) say the restore row (45 t, flag false) is the only row that fails an affordability computed at the mount. Task 3.5's row (100 t, flag true, fill 80 t, state affordable) is what kills `flag && cost <= fuel`, so name it there.
5. Decision 11 needs the new rows. A refresh sent after a failure draws no overlay while pending (3.4) is one. The first-pending and first-failed arms each end with a positive control (3.3) is the other.
6. Decision 8's paragraph on a refresh in flight (line ~454) needs the failed-then-pending case: the hook keeps the error while a refetch is in flight, so the overlay stays withdrawn.
7. Decision 6's opening says "no other new palette entry"-style language, and the delta now says "no colour family other than amber and zinc". Reword so `bg-amber-800`, `border-zinc-900` and `dark:border-zinc-950` are consistent with it.
8. The journey measurement note (line ~514) must match the delta's sample points and the UNTESTED threshold under 2 device pixels. Its "band is 2 px high" remark stays.
9. The Risks bullet "The mark may reach no rendered tier" (line ~527) should say position and size are asserted at tier 1. The unobserved remainder is pixels and cap clipping.
10. Decision 1's lag wording, if present, should use the rescoped bound. Decision 8 may keep the Q5 note unchanged.
