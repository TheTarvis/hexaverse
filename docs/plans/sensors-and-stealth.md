> **Historical record.** Current intent and open questions live in the
> [canonical domain documentation](../README.md). Status labels, checklists and
> workflow instructions below describe the earlier design, not current authority.

# Sensors & Stealth — Brainstorm

> **Living doc, nothing committed.** The future-ideas shelf for active
> scanning, sensor play, and the stealth/combat game that grows out of
> #0006's sensing model. What's *shipped* lives in
> `../specs/0006-scan-and-fog.md` (the 360° radial echo — Decisions #21–#24 —
> and the loud-scan rule — Decision #25); what's *designed but deferred* is
> flagged there in Non-goals. This doc is everything further out, so good
> ideas from playtest conversations don't evaporate. `?` marks open
> questions, per `BRAINSTORM.md` convention.
>
> Genre north star: Expanse / Expeditionary Force sensor combat — active vs.
> passive, emissions discipline, "there's no stealth in space… unless you're
> coasting cold."

## Live tensions (2026-07-14 playtest)

What the current ping surfaced. The moving-antenna tension is **resolved**
(Decision #26, same day); ping-vs-survey is still open.

### The moving antenna — RESOLVED: one ring, pinned at its origin

*(Decided 2026-07-14 — #0006 Decision #26.)* The two-ring render (fast/
bright flash + slow/dim live-centred front) was the real problem: only the
slow ring betrayed that it was following the ship. The fix: **one
consolidated, faster ring that grows from the emission hex and stays
there** — the stationary-antenna approximation, acceptable exactly because
scans got fast — and the ship still collects the returns wherever it's
moved. Bonus that decided it: the pulse hands enemies **where you pinged
from, not where you are** — the loud rule (#25) becomes a stealth mechanic
(scan-then-run, bait pings) for free.

**Shelved refinement — the bistatic ellipse**, if origin-pinning ever reads
wrong again: the honest physics is that the echo from feature `F` arrives
when the total path closes — `d(A,F) + d(F, shipNow) ≤ frontDistance` — an
ellipse with one focus pinned at the emission hex, one glued to the live
ship. Degenerates to the pinned circle when stationary; stretches with the
ship when burning (echoes from ahead arrive sooner, the wake lags). Cost is
two hex-distance calls per feature; `Coverage` grows params
`(emissionHex, liveHex, frontDistance)`. Its follow-on — "you keep what
echoed": the resolve mints what the final ellipse covered, making
scan-while-burning trade a blind wake — is worth stealing even without the
ellipse. ?

### Combat ping vs. survey scan — one wave, two depths

The felt tension: the fast ring reads *tactical* ("what's out there?") but
the verb's payload is *survey* ("what's it worth?" — the mint, the lanes),
which is slow. Two products are hiding in one verb:

| | Contact ping (combat) | Survey (environment) |
|---|---|---|
| Question | what's out there, where | composition, threats, worth |
| Timescale | fast — the front crossing | slow — the full round trip |
| Product | live contacts, no mint | the minted observation + lanes |
| Genre | radar sweep, sonar ping | spectroscopy, mapping pass |

Leaning: **don't split the verb — split the payoff depth.** The wave already
does both: contacts/presence reveal **live as the front crosses them**
(that's Decision #23's echo disc joining the live band — the fast, tactical
payoff), while detail/mint/lanes require the full echo (the slow payoff at
eta). Under this reading:

- The ring animation should be paced by the *front* (contacts popping as it
  crosses them — the combat feel), not by the survey timer.
- The survey's completion wants a different affordance entirely (a filling
  dial on the fleet card / hex shading), decoupled from the ring.
- **Cancel early = you pinged; run it out = you surveyed.** Decision #24
  already prices this (cancel keeps nothing durable, but you were loud —
  and you *saw* the live band while it ran). Ping-and-abort is a play today.

If playtest still wants a dedicated cheap ping, it's a small verb later:
contacts-only, short duration, no mint, no lanes, still loud (#25). Add only
if cancel-as-ping proves unsatisfying in the hand. ? Also: should a survey be
*louder* than a ping (longer dwell = longer window you're lit)? — falls out
free if loudness lasts the scan's duration.

## Future active-sensing verbs (the exotic menu)

Each entry: the idea, the trade it creates, what it touches.

- **Directional cone (aimed scan)** — *already deferred, not new*
  (#0006 Decision #21). Trade the 360° sweep for a narrow aimed cone —
  reach/speed for coverage. `board.BeamHexes` ships golden-pinned and
  unused, waiting.
- **Illumination flare / starshell** — launch a torch to a hex; it reveals a
  disc around *itself*, not you. Decouples "where I'm looking" from "where I
  am"; recon a shadowed pocket without entering it. Very Expeditionary
  Force. Touches: a projectile-ish entity (the flare is a thing on the
  board others can see — it's loud *at its own hex*), a timed coverage
  source in `observation.Coverage`. ? Does the flare mint, or only reveal
  live? (Leaning live-only — minting stays the ship's scanner.)
- **Tightbeam interrogation** — active scan of *one* body/hex: full detail,
  near-instant, single target — and unmistakably aimed: the target (if
  crewed) knows *who* is looking at *them*, not just that someone pinged.
  The sniper scope to the sweep's floodlight. Touches: a `{target}` variant
  on the scan verb; a pointed version of the #25 pulse event.
- **Multistatic / sensor pickets** — deploy passive drones; your ping's
  echoes are received at every picket, so coverage becomes the union of
  ellipses (emission focus at the ship, receive focus at each picket) and
  you can hear around occluders. Turns scanning into a placement game.
  Touches: a deployable entity domain; `Coverage` unions more sources.
  Pairs with the relay questions in `market.md` (relays as sensors vs.
  network). ?
- **Gravimetric pulse** — a mass detector: **ignores LOS occlusion** (mass
  reads through planets) but returns only *big* things, no detail, no
  activity. A different trade, not a strict upgrade — the counter to
  hiding-behind-the-planet, at the cost of resolution. Touches: a second
  sensing law next to LOS, so it's a big lore/consistency decision. ?
- **Interferometry / aperture synthesis** — two of your fleets (later: an
  ally ?) scanning the same system inside a time window sharpen each other:
  bigger union, or detail-grade returns at range. Co-op sensing as a
  mechanic; the first *positive* multi-fleet interaction. Touches: resolve-
  time check for overlapping scans; market implications (shared mints?).
- **PPI sweep variant** — same total coverage as the ping but revealed **in
  bearing order** (a rotating beam, lighthouse-style) instead of distance
  order. Mostly a *presentation* alternative, but it has one real mechanic:
  a fast mover can slip between sweeps. Keep in the pocket for a scanner-
  hardware personality (rotating dish vs. omni array) when scanners become
  buildable (#0006 Non-goals).

## The stealth half (combat-era, all deferred by #0006 Non-goals)

The loud-scan rule (#25) is the shipped seed; these grow from it. Ordering
instinct: emissions model first — every stealth verb prices off it.

- **The emissions model** — every unit has a signature: burning ≫ scanning ≫
  coasting ≫ cold. Fleet state already encodes most of this
  (`coast|burn|docked` + the scan channels) — stealth is *reading* that
  state through a detection check rather than new state. "No stealth in
  space": a burn is a torch flare, visible far beyond ambient range. ? Does
  burn-flare detection respect LOS only, or also range-by-signature?
- **Passive listening / quiet running** — a stance, not an action: go dark
  (no scans, no burns) and your detection of *others'* emissions improves
  (or simply: you emit nothing detectable). The drift-in-silent Expanse
  move. Touches: a fleet stance field; the #25 pulse fan-out and burn
  broadcasts become the things you're listening *for*.
- **Decoys / sensor ghosts** — a deployable that fakes a signature (a false
  burn flare, a false ping return). The Expeditionary Force special. Only
  makes sense *after* the emissions model — a decoy is a forged emission.
  Market angle: sold intel could be *seeded* with ghosts? (nasty, fun,
  far-future ?)
- **Ping logs as tradable intel** — "a pulse came from hex X at T" as a
  mintable observation for the *hearer*. Already an open question on #0006
  (Decision #25 keeps the hearer's side live-band only). Turns listening
  posts into an economy.
- **Occlusion shadows as geography** — render the LOS shadow wedges behind
  planets during scans, so "planet shadow = hiding spot" is legible on the
  board and stealth play becomes something you can *see* and plan around.
  Pure frontend; the math already exists (`board.LineOfSight`). Cheap,
  high-value, could ship any time.

## Presentation notes (the animation side)

- **Adopted (2026-07-14):** flash-then-returns — the outgoing ping is a
  one-beat flash; the show is the *echoes* crackling in by distance. The
  wavefront is the boring part; never animate it as the hero again.
- Contacts should **pop** the moment the front crosses them (the combat
  read); survey progress belongs on a dial/card, not the ring (see the
  two-depths tension above).
- **Adopted (2026-07-14, #0006 Decision #26):** one ring, faster, pinned at
  its origin — no second ring, no live-centring. If the shelved bistatic
  ellipse ever lands, the ring becomes an ellipse with one focus glued to
  the ship.
- Uncertainty staging for far returns (a loose blip that tightens) is a
  cheap way to make range feel like range. Pairs with detection-depth
  stealth later (a faint contact = a wide ellipse, literally).
- PPI scope trope (sweep line, phosphor-fade trails) reserved for the
  rotating-dish scanner personality if hardware variants happen.

## References

- `../specs/0006-scan-and-fog.md` — the shipped sensing model; Decisions
  #15–#25 are the frontier this doc extends.
- `../plans/fog-of-war.md` — the underlying two-channel sensing design.
- `../plans/market.md` — intel valuation; relays; where ping logs and
  ghost-seeded intel would price.
- `../lore.md` — lightspeed free / subspace earned; any new sensing law
  (gravimetrics ?) has to survive this doc.
