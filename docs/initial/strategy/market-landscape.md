# Datacenter Energy Storage — Market Landscape

Snapshot taken **April 2026**. This stuff moves fast — re-verify anything load-bearing before acting on it.

## The big shift this year

Datacenters have crossed from "passive grid consumers" to "grid-interactive assets." The driver is grid interconnection delays (5–10 years for new MW) plus AI training workloads that swing power on millisecond-to-second timescales. The result is a stack of new players, each occupying a different timescale.

## Players by category

### Hardware: storage assets

| Company | Tech | Position |
|---|---|---|
| **Torus** | Flywheel + battery hybrid | $200M raised, ~230 deployments. Vertically integrated; sells the hybrid system. |
| **Revterra** | Flywheel ("Kinetic Stabilizer") | Just started US grid-scale manufacturing March 2026. Earlier stage than Torus. |
| **Beacon Power** | Flywheel | Veteran. Grid frequency regulation. |
| **Amber Kinetics** | Steel flywheel | Longer-duration FES (~4 hr). |
| **Active Power** (Piller) | Flywheel UPS | Datacenter UPS niche. |
| **Tesla, LG, CATL, BYD** | Lithium BESS | Commodity scale. |
| **Form Energy, ESS Inc., Storion** | Iron-air / flow batteries | Long-duration play. |
| **Terraflow Energy** | VRFB ("LDUPS") | Long-duration UPS for datacenters. |
| **Bloom Energy** | Solid-oxide fuel cells | Behind-the-meter generation, datacenter focus. |
| **Oklo, Kairos, X-energy** | SMRs | Long-horizon behind-the-meter generation. |

### Software: orchestration / EMS

| Company | Position | Threat to a solo software wedge |
|---|---|---|
| **Emerald AI** ("Conductor") | NVIDIA-backed (Mar 2026), partnered with AES, Constellation, Invenergy, NextEra, Nscale, Vistra. Orchestrates *computational flexibility* + behind-the-meter resources. | **High** — they own the top of the funnel for AI-datacenter orchestration. |
| **FlexGen** ("HybridOS") | EMS for grid-scale BESS. | Medium — BESS-focused, not flywheel-hybrid. |
| **AutoGrid** (Schneider) | DERMS / VPP. | Medium — utility-side, less datacenter-specific. |
| **Stem** | AI-powered storage operation. | Medium — utility/C&I, not datacenter. |
| **Fluence Digital** (Mosaic) | Bidding & dispatch for storage. | Medium — market-side, not facility-side. |
| **Bolo.ai, Elastic Energy, BITA Energy** | Smaller startups in DER orchestration. | Low — early stage, niche. |
| **Schneider EcoStruxure**, **Vertiv Power Assist**, **Eaton Brightlayer** | Incumbent UPS vendors' software. | Low for orchestration — these are mostly *monitoring/DCIM*, not active control. They could acquire, though. |

## Where the white space probably is

Emerald AI's land grab makes a head-on "DERMS for AI datacenters" play hard. But the picture isn't closed:

1. **Sizing / procurement decision tools.** Operators picking a hybrid stack (flywheel + battery + diesel + grid) have no good way to model trade-offs. Most decisions are vendor-driven spreadsheets. A clean simulator-as-a-service could be a wedge — and naturally upsell into ongoing operations.
2. **Wear / lifecycle economics modeling.** Most EMS platforms optimize for instantaneous dispatch, not lifetime cost. Battery cycle wear, flywheel bearing wear, generator hours-since-overhaul — accounting for these in dispatch is mostly missing.
3. **Interoperability / open protocol work.** Each integrator (Torus, Vertiv, Schneider) wires up their stack bespoke. An open protocol layer (ModBus → MQTT → standardized JSON for hybrid storage state) could matter.
4. **Niche orchestration for specific configurations** Emerald doesn't optimize for. E.g. flywheel-heavy stacks, edge sites, colocation tenants who don't own the underlying hardware.
5. **Workload-specific power profiling.** Building a public benchmark of training-workload power spectra for different model sizes / architectures. Research-y but could become a standard.

## What this implies for a software wedge

- Avoid "control plane for AI datacenter storage" — Emerald is there.
- A **simulator/sizing tool** (white-space #1, #2) is reachable solo, useful as a sales calling card, and converts naturally into operator conversations. **This is the entry point.**
- The **orchestration play** stays viable as a niche-second-act if customer interviews surface specific configurations Emerald isn't serving.

## Things I want to verify

- Is Emerald AI selling to colocation operators, hyperscalers, or both? Their utility-partnership model suggests utility-led — possible gap on the *facility* side.
- What does Torus actually use for orchestration software in their 230 deployments? Bespoke? Partnered? Could be a customer or partner.
- How sticky is Emerald's NVIDIA partnership — is this exclusive or is there room for second sources?
- What software do the big three UPS vendors actually ship vs. license vs. acquire?
