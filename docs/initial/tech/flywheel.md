# Flywheel Energy Storage — Fundamentals

> One of several storage-tech deep-dives in `tech/`. Flywheels were the project's entry point but aren't the spine — see `strategy/wedges.md` for the actual organizing question. Read this when you want the physics, not because flywheels are privileged.

## The mental model

A flywheel energy storage system (FES) is a rotor on a shaft coupled to a motor-generator. To **charge**, push electricity into the machine and it spins the rotor up. To **discharge**, let the rotor drive the machine and pull electricity out. Energy is stored as kinetic energy in the spinning mass.

## The one equation that matters

```
E = ½ I ω²
```

- `I` — moment of inertia (kg·m²). Depends on mass *and* how it's distributed. `I = ∫r² dm`, so mass at the rim counts much more than mass near the axis.
- `ω` — angular velocity (rad/s).

ω is squared. Doubling RPM → 4× energy. Doubling mass → 2× energy. **Every serious FES design pushes ω higher, not mass heavier.**

## Why you can't just spin faster forever

Hoop stress. The rim wants to fly outward at `σ ∝ ρ v²` (where v = ωr is the rim speed). The material has to hold it together. The relevant figure of merit is **specific strength** σ/ρ — strength per unit density.

This is why high-performance rotors use carbon-fiber composites instead of steel: fiber is way lighter, so for a given rim strength it can spin much faster, and energy goes as v². Steel is "stronger" in absolute terms but loses on σ/ρ.

Failure modes also differ: a steel rotor that lets go produces shrapnel; a composite rotor tends to "puff" into fluff because the fibers aren't continuous structures. This affects containment design.

## Motor and generator are one machine

The "motor" and "generator" are typically the same physical device — a motor-generator (often a permanent-magnet synchronous machine, PMSM). A bidirectional inverter handles the direction of energy flow:

- Charging: grid AC → inverter → machine acts as motor → rotor accelerates.
- Discharging: rotor decelerates → machine acts as generator → inverter → grid AC.

So the full system is: **rotor + bearings + motor-generator + bidirectional inverter + containment (often partial vacuum)**.

## Where the energy actually goes when "stored"

Idle losses are the big story. Even sitting at speed, a flywheel loses energy to:

1. **Windage** — air drag on the rotor. Solved by running in partial vacuum.
2. **Bearing friction** — solved by magnetic or superconducting bearings (at increasing cost/complexity).
3. **Electronics standby** — small but nonzero.

This is why FES is great for **short-duration, high-cycle** applications (grid frequency regulation, UPS, regenerative braking) and **bad for long-duration** storage (you'd lose meaningful energy over hours-to-days holding it).

## What to dig into next

- Hoop stress derivation and the σ/ρ figure of merit for candidate rotor materials.
- Bearing options: mechanical vs. active magnetic vs. superconducting — loss vs. cost vs. complexity trade.
- Motor-generator topologies (PMSM, induction, switched reluctance) and which suits FES.
- Containment and vacuum: how good a vacuum is "good enough"?
- Round-trip efficiency: where the percentage points actually go (electronics, machine, bearings, windage).
- Real-world systems for reference: Beacon Power (grid regulation), Amber Kinetics (longer-duration steel rotor), Active Power (UPS).
