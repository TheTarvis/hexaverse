# Candidate Wedges into the Power Industry

The repo's organizing question. Storage is one lens — the entries below are the actual candidate wedges, so we stop anchoring on storage by default.

Each entry: what the wedge is, who pays, who's already there, why it's software-shaped, and one question to resolve. Snapshot **April 2026** — verify the competitive landscape before acting on any of this.

## Storage-adjacent wedges

### 1. Hybrid-stack sizing / procurement decision tools

**What:** simulator + UI that tells an operator "for *your* load, here's the right mix of flywheel / battery / flow / generation, with cost + reliability + lifecycle wear tradeoffs."

**Who pays:** colocation operators, hyperscaler procurement, integrators (Vertiv / Schneider / Eaton), BESS vendors selling into datacenters.

**Who's already there:** vendor spreadsheets and rules-of-thumb; partial coverage from grid-side EMS vendors (Stem, Fluence Mosaic). Nobody owns this for *hybrid* datacenter stacks.

**Software-shaped because:** model + UI + data. No hardware.

**Resolve:** are operators willing to pay for this directly, or is it always bundled into vendor procurement? (See `customer-discovery.md`.) This is the in-flight bet — see `simulator/PLAN.md`.

### 2. Lifecycle / wear economics for hybrid stacks

**What:** dispatch optimizer that accounts for *lifetime* cost (battery cycle wear, flywheel bearing-hours, diesel run-hours, fuel-cell stack degradation) instead of just instantaneous spot-market math.

**Who pays:** anyone running >$10M of mixed storage with battery cycle-wear concerns. Likely upsell from #1.

**Who's already there:** Fluence Mosaic, Stem, Habitat Energy — but mostly battery-only and grid-market-focused. Datacenter-side, with hybrid wear, is open.

**Resolve:** is the wear-cost gap big enough to motivate switching, or do operators just eat it as opex?

### 3. Open protocols / interoperability

**What:** common protocol (MQTT or JSON-over-MQTT) for hybrid storage component state. Frees integrators from bespoke wiring.

**Who pays:** indirectly. Integrators benefit because it neutralizes proprietary EMS vendors. Could be open-source-led with paid services.

**Who's already there:** OCP working groups have nibbled. SunSpec is adjacent. Nothing complete for hybrid-stack datacenter use.

**Resolve:** would real integrators adopt? Or is bespoke wiring a feature, not a bug, for them?

### 4. Niche orchestration Emerald AI isn't serving

**What:** orchestration / EMS for configurations Emerald deprioritizes — colocation tenants without underlying-hardware ownership, edge sites, flywheel-heavy stacks, smaller-than-hyperscaler operators.

**Who pays:** colos, edge operators.

**Who's already there:** Emerald AI for hyperscaler+utility deals; Stem / FlexGen / Fluence Mosaic for grid-market BESS. Gap on facility-side small/medium ops.

**Resolve:** are these segments big enough to support a venture, or are they too fragmented?

## Non-storage wedges

### 5. Interconnection workflow software

**What:** software helping utilities and developers move faster through the 5–10 yr interconnection queue. Queue analytics, document automation, scenario modeling for capacity allocation, study automation, pre-app validation.

**Who pays:** utility transmission planners, developers (BESS / generation / datacenter), maybe ISO/RTOs (CAISO, PJM, ERCOT, MISO, NYISO).

**Who's already there:** several startups in 2025–26 attempting this; no clear winner I'd bet on. Verify the current crop before assuming greenfield.

**Software-shaped because:** entirely software. Hard mostly because of regulated processes and data access.

**Resolve:** is access to ISO/utility data realistic without an enterprise sales motion?

### 6. Grid-services / market-side software

**What:** bidding, scheduling, settlement automation for participants in ancillary services markets (frequency reg, spinning reserve, {{PROJECT_SLUG}}age support). Datacenters bidding flexibility, BESS owners bidding capacity.

**Who pays:** asset owners, market participants, aggregators.

**Who's already there:** Tyba, Modo Energy, Fluence Mosaic, Habitat Energy, Ascend Analytics, Aurora Energy Research. Crowded.

**Resolve:** datacenter-as-market-participant is new enough that it might be greenfield even within this otherwise-crowded space.

### 7. Demand-response / flexible-load orchestration (Emerald-adjacent)

**What:** orchestrate compute workloads as flexible load. Emerald AI's space, but possibly room at the edges (non-AI workloads, tier-2 cloud, HPC, on-prem clusters).

**Who pays:** datacenter operators, utilities, aggregators.

**Software-shaped because:** entirely about workload schedulers, signals, and orchestration logic.

**Resolve:** has Emerald already locked the integration into NVIDIA / k8s / Slurm enough to make this hard to enter?

### 8. Energy procurement / tariff decision tools

**What:** "what's the cheapest way to supply this 50 MW load given utility tariffs, on-site generation options, storage, and PPAs?" Optimization + scenario modeling for procurement teams.

**Who pays:** energy-procurement at hyperscalers, colos, large industrials. Often outsourced to consultants today.

**Who's already there:** consultants (DNV, Wood Mackenzie), tariff databases (Genability), some EMS-adjacent tools, lots of spreadsheets. Probably room for a software-led play.

**Software-shaped because:** model + UI + data; the bottleneck is ingesting fragmented tariff/PPA data — see `procurement-deep-dive.md` for why FlywheelETL flips this from "hardest part" to "unfair advantage."

**Resolve:** does the "consultant replacement" pattern work, or do customers want the consultant relationship? See `procurement-deep-dive.md` for the deep-dive.

### 9. Data infrastructure for power markets

**What:** clean APIs for ISO data (LMPs, ancillary prices, capacity prices, generation mix). Less sexy but underpins every other wedge.

**Who pays:** anyone building #5, #6, #7, #8. Possibly research teams.

**Who's already there:** GridStatus.io is the recent entrant. Yes Energy is the legacy incumbent.

**Software-shaped because:** entirely data + APIs.

**Resolve:** is GridStatus already too far ahead? Or is there an underserved customer segment (e.g. datacenter teams specifically, or AI-workload-flexibility builders)?

## How to use this list

This isn't ranked yet — ranking comes from customer discovery. The point of writing it is to *stop anchoring on storage by default*. Revisit after every 3–5 customer interviews.

Prioritization heuristics, applied later:

- **Reachable solo without capital.** Rules out hardware and most enterprise-data plays.
- **Has a believable customer for v1.** Rules out "build it and they will come."
- **Differentiated from incumbent + Emerald + Stem + GridStatus.** No "third entrant in a small market with two well-funded incumbents."
- **Compounds toward learning the sector.** A wedge that makes you sector-literate is worth more than one that doesn't, even at equal revenue.

The simulator (`simulator/PLAN.md`) is the in-flight bet for #1; everything else is on the shelf.
