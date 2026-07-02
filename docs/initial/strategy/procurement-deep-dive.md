# Energy Procurement Decision Tools — Deep Dive

Detail on `wedges.md` #8. Why it's interesting, what software would actually do, where it overlaps with the simulator, the on-ramp, and the FlywheelETL dogfooding angle.

## Why this matters: datacenters are mostly electricity bills

Datacenters are capex-heavy upfront (building, gear, gen, switchgear, UPS, BESS) but the recurring electricity bill compounds:

- Electricity is **30–50% of total opex**; for AI/HPC workloads it's often the single largest line item.
- A modern 100 MW facility runs an annual electricity bill in the **hundreds of millions of dollars**; a hyperscaler portfolio is in the billions.
- Over a 15-year facility life, **lifetime electricity cost often exceeds total capex**.
- A 1–2% improvement in procurement structure = $millions per site per year.

Microsoft / Google / Meta all run internal energy trading desks. Everyone smaller feels the same pain without the desk. The capex-heavy framing of datacenters obscures that the long-run cost is the electricity bill — and most facilities can't optimize it well without help.

## What "energy procurement" actually means

Not one decision — a stack of interacting ones:

| Decision | Example options |
|---|---|
| Default supply | Utility tariff (TOU vs. flat, demand charges, riders) |
| Competitive retail | Pick a retail supplier (ERCOT, PJM, NYISO, ISO-NE — deregulated regions) |
| PPA | Physical or virtual; fixed-price for renewables; 10–15 yr commitment |
| On-site generation | Solar / fuel cell / gas turbine; can trigger standby charges |
| Storage | Shaves peak demand → changes tariff economics |
| Demand response | Program participation = revenue, constrains operations |
| Hedging | Financial instruments against forward power prices |

Each option interacts with the others. Adding storage changes peak demand → changes which tariff is optimal. Signing a PPA hedges price but commits you to a load profile you have to defend. On-site gen lowers grid draw but might trigger standby charges that wipe out the savings.

## What the software would do

Six steps:

1. **Ingest the load.** Hourly or sub-hourly historical PDU data; for new sites, projected load curves.
2. **Ingest the menu.** Applicable tariffs, available retail suppliers, current PPA market prices, viable on-site generation options, tax incentives (IRA / ITC / PTC), demand-response programs.
3. **Model each scenario.** Simulate 12 months of operation under each combination — energy cost, demand charges, PPA settlement, basis risk, carbon, cash flow, capex amortization.
4. **Optimize.** MILP or simulation-based search across the combinatorial space. Output a ranked list, not just "the answer."
5. **Sensitivity analysis.** "What if gas prices double? What if your load grows 30%? What if the utility files for new TOU rates?"
6. **Surface the recommendation** with traceable reasoning — "we picked X because of Y, here's the breakeven on Z."

The output isn't a number; it's a decision artifact procurement teams can take to their CFO.

## Why this is a good wedge

- **Pure software.** Model + UI + data. Hardware-free.
- **Big, quantifiable pain.** "We wasted $X on the wrong tariff" is a sentence operators actually say.
- **High-leverage output.** One decision = $millions/year.
- **Findable buyer.** Energy procurement / strategy roles at hyperscalers; CFO / facilities lead at colos. They have budget for consultants today.
- **Compounds with wedge #1.** Same modeling stack, different decision surface. The simulator says *what stack to build*; this says *what tariff/PPA to sign* — and they share inputs (load profile, asset costs).

## Why it's hard

- **Tariff data is fragmented hell.** ~3,000 US utilities; some charge for tariff books; some publish only PDFs. No standard schema.
- **PPA market data is opaque.** Real prices are private; published numbers lag and are regional medians.
- **Bespoke per utility.** Each tariff structure is idiosyncratic. Coverage costs.
- **Customer trust gap.** Procurement teams don't fire their consultant for software easily. The consultant has 20 years of relationships.
- **Long sales cycles.** Procurement decisions happen on a multi-year cadence.

## The FlywheelETL angle (the funny part)

The project is called **{{PROJECT_NAME}}**. It started narrowly on **flywheels** as an energy-storage entry point. We then broadened away from flywheels — they're now one tech deep-dive among many, not the spine. The most promising non-storage wedge surfaced (this one — energy procurement) has its single biggest "why this is hard" item bottlenecked on ingesting fragmented + unstructured data: tariff PDFs, FERC filings, state PUC records, utility web portals, sustainability disclosures.

The user happens to have already built **FlywheelETL** — an agentic-workflow ETL tool whose entire job is converting fragmented and unstructured data into structured data. The flywheel name we tried to leave behind walks back in through a completely different door, this time as the data-ingestion layer.

**Substantively (not just funny): this flips the wedge analysis.** The fragmented-data problem is the moat-eating-iceberg most attempts at "energy procurement software" hit and revert to manual / consultant-assisted ingestion. Dogfooding FlywheelETL here:

- Every utility's tariff PDF / CSV / web portal → an ETL target.
- Every PPA disclosure (FERC, state PUC, sustainability reports, news releases) → structured data.
- Every demand-response program description → a structured offer.
- Every retail supplier's contract terms → comparable schema.

The ingestion layer becomes the moat — coverage breadth + schema quality others can't replicate without comparable agentic infrastructure. That moves "tariff fragmentation" from *"the reason this is hard"* to *"the reason we have an unfair advantage."*

Caveat: incumbents (Yes Energy, Genability — verify) may already have curated tariff databases that beat agentic ingestion on freshness/accuracy. Worth a comparative read before betting hard on this. The advantage is real but not unconditional.

## The realistic on-ramp

Narrow first:

1. **Pick one ISO region.** ERCOT is the obvious starter: deregulated, lots of retail choice, public data, real-time prices, datacenter-friendly (Texas is where new builds go).
2. **Answer one question well.** "Given this load profile, which retail electricity contract minimizes 12-month cost?" Don't try to do PPAs + on-site gen + DR + storage on day one.
3. **Bootstrap with public data via FlywheelETL.** EIA Form 861 (utility sales), FERC tariff filings, ERCOT public market data, NREL ATB cost curves. The ingestion is itself the v0 deliverable — even with no UI, "structured tariff data for ERCOT" is something people pay for.
4. **Open source the core, charge for premium.** Open-source the load-modeling and tariff-evaluation engine; charge for current tariff/PPA data ingest, multi-region coverage, reporting. GridStatus pattern, applied to the demand side.
5. **Expand outward.** Add ISOs → PPAs → on-site generation → merge with the simulator (#1) into a unified "what should this site do, technically + commercially?" tool.

## Overlap with wedge #1 (simulator)

The simulator and the procurement tool are arguably the same product viewed from different angles:

- Simulator: *"what physical assets should I build?"* → outputs stack design.
- Procurement: *"what commercial structure should I buy?"* → outputs contract recommendation.

They share the load profile, cost models, and constraints. They differ on the decision surface.

**Don't fork into two products.** Build #1 first (already in motion, simpler modeling primitives), add tariff/contract evaluation as a layer on top once operator interviews tell you whether procurement is the more painful question.

The tell from customer discovery:
- If operators describe "we sized the wrong stack" → simulator wins.
- If they describe "we signed the wrong contract / are stuck in a tariff that doesn't fit our load" → procurement tool wins.

Listen for which sentence is more common in interviews 1–5.

## POC

For a weekend-scoped end-to-end test of FlywheelETL on real tariff PDFs (Oncor → Postgres → canonical "TOU + demand charge > $20/kW" query), see `../data/texas_puc/flywheel-etl-poc.md`.

## Open questions

- Is GridStatus.io already moving toward demand-side data? They started supply-side (ISO market data); the demand-side coverage gap is obvious from the outside.
- Is Genability's tariff database already comprehensive enough that FlywheelETL ingestion is duplicative? Need a comparative read before relying on agentic ingestion as the moat.
- What's the right v0 customer? ERCOT colocation operators are reachable; hyperscalers have in-house teams that may not buy.
- Are there integrators (Vertiv, Schneider) who'd license the procurement engine to bundle into their sales motion? Could bypass long sales cycles.
- How much of the consultant pain is "they don't have software" vs. "they have relationships and judgment software can't replace"? Software replaces the first; not the second.
- What is FlywheelETL's actual current scope, schema-handling depth, and operator UX? Capture this in repo when it becomes load-bearing for build decisions.
