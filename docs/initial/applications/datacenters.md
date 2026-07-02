# Datacenter Power — Storage Tech by Duty Cycle

## Why this question matters now

AI training workloads create **power swings the grid was never designed for**: GPU clusters synchronize training steps, drawing tens-to-hundreds of MW in coordinated bursts on millisecond-to-second timescales. On top of that:

- **Grid interconnection takes 5–10 years** for new MW capacity. Behind-the-meter storage and on-site generation matter more than they ever have.
- **24/7 reliability requirements** are unchanged from classical datacenter standards.
- **Hyperscalers are willing to spend** because power is now the binding constraint on AI buildout, not chips.

This shifts datacenters from "passive grid load" to "grid-interactive asset" and pulls every storage tech (plus behind-the-meter generation) into scope.

## The mental model: storage by duty cycle

| Timescale         | Best-fit tech                 | Datacenter problem it solves                          |
|-------------------|-------------------------------|-------------------------------------------------------|
| ms – seconds      | Flywheel, supercap            | Training-step swings, gen-start bridge                |
| seconds – minutes | Li-ion (LFP)                  | Classical UPS ride-through, gen-start failure margin  |
| minutes – ~4 hrs  | Li-ion                        | Short outages, peak shaving                           |
| hours – days      | Flow battery (VRFB), iron-air | AI ramp shaping, sustained outages, replacing diesel  |
| days+             | Hydrogen, thermal             | Long-duration "always-on" backup                      |
| primary power     | Fuel cell, gas turbine, SMR   | The thing the rest of the stack is buffering          |

The right answer is rarely *one* tech — it's a stack matched to the duty-cycle spectrum of the load.

## Tech-by-tech: when each wins, when each loses

### Flywheel (FES)
- **Wins:** sub-second response, ~10⁷ cycle life, no thermal runaway, predictable available energy (`E = ½Iω²`), wide operating temperature.
- **Loses:** poor energy density (10-min ride-through is borderline), 1–3% nameplate to idle losses (windage + bearings), mechanical wear, hyperscaler standardization on Li-ion.
- **Sweet spot:** absorbing training oscillations + bridging to gen start.
- **Players:** Beacon Power, Amber Kinetics, Active Power (Piller), Torus (hybrid), Revterra.

### Li-ion (LFP / NMC)
- **Wins:** dominant cost curve, mature supply chain, energy density, hyperscaler-standardized.
- **Loses:** cycle life crashes under continuous sub-second cycling, thermal runaway = real fire risk, SoC derating, calendar aging.
- **Sweet spot:** classical UPS ride-through (5–15 min) and short outages.
- **Players:** Tesla, LG, CATL, BYD; integrators stack them into BESS.

### Flow battery (VRFB, Fe-Cr)
- **Wins:** decoupled energy/power sizing, ~20k+ cycles with minimal degradation, no thermal runaway, long-duration native.
- **Loses:** bad $/kW (electrolyte tanks are bulky), low round-trip efficiency (~70%), early commercial scale.
- **Sweet spot:** hours-of-discharge UPS, AI ramp shaping, replacing diesel for non-emergency duty.
- **Players:** ESS Inc., Storion, Terraflow Energy.

### Iron-air / long-duration novel chemistries
- **Wins:** very low $/kWh at long duration (10–100+ hr), abundant materials.
- **Loses:** very low round-trip efficiency, slow response, very early deployment.
- **Sweet spot:** multi-day backup, seasonal-ish.
- **Players:** Form Energy.

### Supercapacitors
- **Wins:** sub-millisecond response, huge cycle life.
- **Loses:** terrible $/kWh, low energy density.
- **Sweet spot:** power-quality fixes, niche; rarely main-line for datacenter.

### Behind-the-meter generation (not storage, but in scope)
- **Fuel cells (Bloom):** clean-ish, modular, slow ramp. Already deployed for primary power at some datacenters.
- **Gas turbines:** fast, dirty, mature. Standard for backup; increasingly considered for primary.
- **SMRs (Oklo, Kairos, X-energy):** future primary power. ~5–10 yr horizon. Doesn't help right now but reshapes the long view.

## The pragmatic answer: hybrid stacks

Most real deployments stack technologies by duty cycle. Operators picking the stack today are doing it on vendor spreadsheets and rules of thumb.

| Timescale       | Tool                     | Role                                              |
|-----------------|--------------------------|---------------------------------------------------|
| ms – seconds    | Flywheel / supercap      | Absorb training swings, ride through gen start    |
| seconds – mins  | Li-ion                   | Classical UPS, gen-start failure margin           |
| mins – hours    | Flow battery / Li-ion    | Sustained outages, ramp shaping, peak shaving     |
| hours+          | Diesel / gas turbine     | Long outage; transitional                         |
| primary         | Grid → fuel cell → SMR   | The thing the rest of the stack is buffering      |

The interesting *software* problem is sizing and dispatching this stack — not picking one tech. See `strategy/wedges.md` for the broader candidate-wedge inventory.

## Open questions

- What's the actual power-swing spectrum (Hz vs. amplitude) of a 100k-GPU training cluster? Where do the duty-cycle crossover points fall?
- How much have NVIDIA's smoothing features actually reduced upstream swing? Where in the stack does that erode value?
- Real-world $/kW and $/kWh numbers across techs at the same duty cycle.
- Does behind-the-meter storage + flexible compute + on-site generation actually accelerate interconnection — or do utilities still treat it as a full grid-load request?
- For a colocation operator (vs. hyperscaler), who's the budget owner for the full stack? UPS vendor? Facilities? Energy procurement?
- Is there a deployed datacenter using FES as primary fast-response buffer, or is it always hybrid + battery-dominant?
