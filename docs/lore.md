# Hexaverse — Universe & Lore

> **Living doc.** The *fiction that grounds the mechanics* — the "because" behind
> the rules the specs encode. When a mechanic needs a reason it exists, it should
> trace to something here; when the lore implies a mechanic, note it. High-level
> and evolving. `?` = open question; **TODO(travis)** = a blank only you can fill.
> Created 2026-07-08.
>
> **Grounds / grounded-by:** `vision.md` (what we're building & why), `plans/fog-of-war.md`
> (subspace knowledge *is* the fog), `plans/movement-galaxy.md` (lanes *are* subspace
> travel), `plans/market.md` (the market trades *current subspace* intel), and specs
> #0001 (the star map) / #0004 (in-system movement).

---

## Premise

Players run **Corporations** operating across a procedurally generated galaxy of
star systems. You explore, colonize, extract, and compete — and knowledge itself
is the scarce, tradable prize. The galaxy is a shared, persistent, dangerous place;
a Corporation can lose everything and start again. (See `vision.md` for the game's
goals and pillars; this doc explains the *world* those pillars sit in.)

---

## The two channels of knowledge (the load-bearing idea)

Everything about visibility, exploration, and the intel economy falls out of one
fact: **there are two ways to know something about the galaxy, carried by two
different physics, and they reveal completely different things.**

| | **Lightspeed** — telescopes | **Subspace** — lanes & presence |
|---|---|---|
| Medium | ordinary light, crossing real space | subspace, entered only via lanes |
| Reveals | the **star map**: that a system exists, where, coarse stellar character | the **road network** + **current truth**: lanes, live occupants, real resources, the interior |
| Reach | the whole galaxy, always | only where you have **presence** (or a relay/sensor that does) |
| Age | ancient & coarse (old light) | current & precise (now) |
| Who has it | **everyone** — common knowledge, unhideable | **only you**, earned, perishable |

### Lightspeed: you can always see the stars

Light crosses the galaxy, so from the very first moment every Corporation sees the
entire **star field** — positions, and coarse stellar character (a star-rich sector
literally *glows* richer; a dead zone is dim — that is a telescope reading). This is
common knowledge. No one can hide a star, and no one can sell you the fact that a
star is *there*. What the telescope gives you is **scale, orientation, and ambition**:
you can see the glittering cluster you covet long before you can reach or truly know
it.

### Subspace: the roads, and the truth, are earned

Faster-than-light travel happens only through **subspace lanes**. Light does not
travel them, and — crucially — **subspace geometry does not match real-space
geometry.** Two stars that look adjacent in the sky may have no lane between them;
a lane may run to somewhere that looks far away. So **the star map tells you nothing
about the roads.** You cannot infer routes by looking; you have to *map subspace by
being in it.*

This is why **you must reach a system to discover its onward lanes.** A lane's far
end is only detectable from within the system it departs — arrive, and that system's
subspace connections resolve; until then you know only the lanes leaving places
you've already been. Exploration is therefore the act of **tracing the road network
outward, one system at a time, toward stars you can already see but cannot yet
reach.**

Everything *current and actionable* — who is in a system right now, what it actually
yields, its hazards, its interior board — is likewise subspace/presence-gated. Old
light shows you a coarse, ancient star; only going there (or a subspace sensor/relay
that reaches there) shows you the truth as it is *now*.

---

## Barriers are subspace chokes, not walls

A galactic **barrier** is a region where subspace corridors are sparse or impossible
— but **light still crosses it.** So you *see* the stars on the far side with your
telescope (the promised land, glittering) while there are few or no lanes to get
there. A barrier is something you can look at and not reach. This is why barriers
funnel traffic through a handful of crossings (economic chokes) without ever being a
black wall — and it's exactly what the galaxy generator already produces: stars
visible everywhere, lanes sparse across the seam (spec #0001).

---

## Corporations, loss, and restart

A **Corporation** is the persistent player entity. The galaxy is dangerous and a
Corporation can be wiped — or you can choose to fold and restart fresh. The lore
draws a clean line through what a wipe touches:

- **The star map is universal astronomy — it persists.** The sky doesn't reset; the
  galaxy is the galaxy for everyone.
- **What a Corporation loses is its *subspace* estate:** the lanes it had mapped, the
  systems it had surveyed and explored, its holdings, and its intel inventory. Your
  *knowledge of the roads and the current truth* is the perishable thing, and it's
  what starts over.

New Corporations spawn at the **fresh frontier edge** (`vision.md`), where the
surrounding roads are unmapped and first-hand subspace intel is genuinely valuable.
*(Restart triggers, total-loss conditions, and how much carries over are open —
TODO(travis); the market and spawn specs own the details.)*

---

## What the two channels ground (mechanic map)

The whole design leans on this spine. Each row is a mechanic and the lore fact it
rests on:

| Mechanic | Rests on |
|---|---|
| **Fog of war** = your *subspace-knowledge* layer over an always-visible star map | two channels — light is common, subspace is earned |
| **Exploration** = tracing the lane network outward by presence | subspace geometry is only locally detectable |
| **Movement** = travel only along known lanes | lanes are the only FTL medium |
| **Intel market** trades *current subspace* surveys, not star positions | the star map is free & common; subspace truth is scarce & perishable |
| **Generator regions** (star-rich / dead / barrier) read at a glance | coarse stellar character is a telescope observation |
| **Frontier** = the edge of *your mapped roads*, not the edge of what exists | you see the whole sky; you've charted little of it |
| **Restart** wipes subspace holdings, keeps the sky | the star map is universal, your road-map is yours |

---

## Open threads

- **How much leaks through the telescope** (the dial): bare points of light →
  + brightness → + spectral class/region → + hints of large planets. Leaning: enough
  to see the star field and coarse richness (orientation + romance), with current
  truth and the road network firmly subspace-gated.
- **Relays / sensors as remote subspace eyes** — can a good subspace sensor detect a
  *neighbouring* system's lanes without travelling there (survey-at-range), or is
  presence always required? (Progression hook; base case = presence-only.)
- **Restart / total-loss rules** — TODO(travis); owned by the corporation/spawn specs.
- **Why subspace geometry diverges from real space** — flavour depth we can leave
  vague, but a consistent hand-wave (subspace folds along mass/gravity, not distance)
  keeps barriers and long lanes feeling intentional.
