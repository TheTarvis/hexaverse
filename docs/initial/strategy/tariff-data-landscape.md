# Tariff Data — Market Landscape

Snapshot **May 2026**. Companion to `market-landscape.md` (which is storage/orchestration-focused) and direct downstream of `procurement-deep-dive.md` + `data/texas_puc/flywheel-etl-poc.md`. Re-verify before acting — the data-center-tariff space in particular is moving fast.

## Why this matters

The FlywheelETL POC's premise is that fragmented tariff PDFs → structured queryable database is *useful*. That's only true if no one has already done it well enough. This note maps who's currently aggregating tariff data and where the gaps are.

The TL;DR: the commercial players are mostly shaped for **rate-engine / billing-calculator** use cases (solar, EV, storage savings calculators). The **regulatory-intelligence / tariff-structure** use case — "show me every tariff with feature X that came online in window Y, with provenance" — is mostly served by manual nonprofit databases or expensive enterprise tracking platforms. That's the gap the FlywheelETL angle is pointed at.

## Players by category

### Commercial rate-engine providers (the well-funded incumbents)

| Player | Coverage | Shape | Customers |
|---|---|---|---|
| **Genability / Arcadia Signal** | 25K+ NA tariffs (US/CA/MX), residential + C&I, automatic tracking of rate changes | Rate-calculation API; "what would this customer pay" | Solar, EV, storage, smart-appliance vendors. Acquired by Arcadia 2021. **The dominant commercial player.** |
| **RateAcuity** | US + Canada electric + gas tariffs. Claims 99.99% rate-schedule accuracy | API + web portal, on-demand rate datasets | Utilities, energy consultants, EMS, EV infrastructure. 40 yr operating history. |
| **Energy Toolbase (ETB)** | 100K+ rate schedules from 2K+ utilities | Built into solar+storage modeling product (ETB Developer/Monitor); **best-in-class for demand-charge modeling** specifically. In-house team calls utilities to manually verify. | Solar/storage developers. Owns the C&I solar-finance underwriting workflow. |
| **Aurora Solar / HelioScope** | Bundled tariff DB (auto-selects by address) | Solar design + proposal tool. Tariff DB is good enough for residential, weaker than ETB on commercial demand charges | Solar installers/EPCs. |

### Enterprise data + regulatory tracking

| Player | Coverage | Shape | Customers |
|---|---|---|---|
| **S&P Global (formerly SNL Energy)** | 450+ power/midstream cos; FERC Forms 1/2/3/714, EIA 861/176, SEC filings, rate cases | Enterprise data terminal + Snowflake feeds. Financial + regulatory + market data integrated | Wall St, IPPs, utilities. Six-figure subscriptions. |
| **Hitachi Energy Velocity Suite** | 90B+ NA energy market records; nodal LMPs, near-real-time + decades of history | API-first market-intelligence; **wholesale price-focused, not retail tariff** | IPPs, traders, financiers, ISO/utility planners. On Google Cloud Marketplace. |
| **Wood Mackenzie Lens Power** | Power, solar, wind, storage, hydrogen integrated dataset | Analyst platform | Enterprise energy/finance. |
| **EQ Research — PolicyVista** | Regulatory dockets, IRPs, rate cases, incentive policy | **Tracking**, not structured rate data. Narrative summaries of filings + expert-witness services | Clean-energy advocates, utility reg teams, IPPs. Subscription. |

### Free / public infrastructure

| Source | Coverage | Use |
|---|---|---|
| **NREL URDB / NLR** (`apps.openei.org/USURDB`) | Rate structure for 3,700 US utilities. Crowd-sourced; small subset annually verified | Free bulk download + API. **Stale on the long tail** — fine for residential common rates, unreliable for niche C&I. (Dev API moves to `developer.nlr.gov` 2026-04-30.) |
| **OpenEI** | Meta-aggregator over URDB | Web UI, FOSS modeling tool input. |
| **EIA Form 861** | Utility list, sales by state + customer class | Authoritative utility entity registry — the right anchor for entity resolution. |
| **FERC Form 1 / data.ferc.gov** | Wholesale-side rate filings, structured XBRL/CSV | Sanity-check on wholesale; orthogonal to retail tariffs. |
| **FERC eLibrary** | Raw Section 205/210 filings, dockets | Unstructured PDFs. The thing that needs ingesting. **No commercial scraper-as-a-product visible** — closest is S&P Global's regulatory feed at enterprise pricing. |
| **PUCT Interchange** | Texas state-level filings | Raw, no API, weak search (see POC notes). |
| **PowerToChoose** | Texas REP retail offerings | Standardized EFLs — semi-structured already. |

### The directly adjacent specialty databases (most relevant to the wedge)

These are the ones to study closely — they're the closest existing things to what FlywheelETL is pointed at.

| Source | What it is | Why it's the most relevant comp |
|---|---|---|
| **SEPA + NCCETC — DELTa** (`sepapower.org/large-load-tariffs-database`) | Database of Emerging Large-Load Tariffs. **77 approved/proposed tariffs across 60 utilities** as of 2026-03-31. Quarterly manual updates. Specifically targets the AI-datacenter load-growth surge. | **This is the closest existing artifact to the FlywheelETL POC angle.** Same problem, manually solved. Public, free, but: manually curated by 2 nonprofits, narrow scope (large-load only), Airtable-shaped not API-shaped, no tariff-structure schema or per-clause provenance. A FlywheelETL-powered version would be 10× the throughput at full schema fidelity. |
| **DSIRE Insight** | Commercial arm of DSIRE (NCCETC). Publishes data-center-tariff trend reports + incentive tracking | Aligned audience; could be partner or buyer of structured output. |
| **LBNL Tariff Analysis Project (2004) + `LBNL-ETA/elecprice` GitHub** | Academic schema work; sample of 90 utilities / 250 C&I tariffs, 2004 vintage | Schema design is foundational reading. Long-since dormant as a product, but the data model thinking holds up. |

## Where the gaps look real

Mapped against the existing landscape, the wedges that look defensible:

1. **Regulatory-intelligence tariff queries with provenance.** Genability/RateAcuity answer "what's the bill" but not "every tariff with feature X effective in window Y." DELTa answers a narrow version of that question manually for ~77 tariffs. Nobody answers it broadly with linked source paragraphs. **The canonical FlywheelETL POC query is in this gap.**
2. **Datacenter-/large-load-specific tariff structure intelligence.** Demand explosion + state regs spawning new tariff types fast. DELTa is keeping up at 77 tariffs by manual labor. The growth rate (29 large-load tariffs approved in 2025 alone, vs 14 in all of 2018–2024) outpaces manual curation.
3. **C&I tariff data with deep schema fidelity (TOU shoulders, ratchets, riders, coincident-peak rules).** Even ETB — best-in-class — wraps this in a black-box solar-savings calculator. Exposing the structure as a queryable artifact, not a calculator output, is its own product.
4. **A "GridStatus for tariffs."** GridStatus.io has demonstrated the appetite for free-tier-with-paid-API of clean public data in the ISO market space. No equivalent exists for tariffs. URDB is the closest free attempt — it's stale and not API-credible. ([market-landscape.md](market-landscape.md) doesn't cover GridStatus directly; see `wedges.md` #9 — data infrastructure wedge.)
5. **Provenance-grade tariff data for compliance and litigation.** Nothing in the commercial set ships with paragraph-level source links and confidence scores. EQ Research delivers narrative summaries; S&P Global delivers structured but un-cited data feeds. The "every fact links back to the originating PDF page" property is unique to FlywheelETL's design. Buyers: utility regulatory teams defending rate cases, intervenors, expert witnesses.

## Where the gaps look fake (be honest)

- **Rate-calculation-as-a-service is closed.** Genability/Arcadia + ETB own this. Don't chase. The wedge is *not* "what would Customer X pay on Tariff Y."
- **Enterprise regulatory tracking is taken.** S&P Global + EQ Research own institutional buyers. Beating them on coverage is a 10-year, capital-intensive bet.
- **Residential tariff savings calculators are a feature, not a market.** Every solar/EV/HEMS tool has one — Genability or URDB API, integrated.

## Customer-conversation candidates surfaced by this research

Per `customer-discovery.md` — discovery > more reading. Likely-fruitful conversations:

- **NCCETC / SEPA DELTa team.** Doing this manually right now. Either potential partner (FlywheelETL feeds DELTa), potential buyer (replace their workflow), or a free signal of pain points. Lowest-cost interview because the artifact is public and the people are reachable.
- **Energy Toolbase rates team.** They cold-call utilities to verify rates. If FlywheelETL can match accuracy at fraction of cost, they're a buyer or acquirer. (Risk: they may consider this their moat and be hostile.)
- **DSIRE Insight authors.** They publish trend reports on data-center tariffs (ref Apr 2026 piece). Structured data 10×s their throughput.
- **Energy procurement consultants in ERCOT** (e.g. Muirfield, Elite Energy Consultants). Buy-side users. Do they touch the raw PDFs, or do they buy from RateAcuity/Genability? If raw PDFs — direct customer; if vendor data — competitor's customer.
- **A utility regulatory team or rate-case intervenor.** Provenance-grade tariff data is their love language. Expensive sale, but high willingness-to-pay.

## The procurement consultant's full data stack (tariffs are one slice of ~13)

Tariff data is one row in a procurement consultant's daily data needs. Knowing the rest matters because (a) it sizes the relative pain of the tariff slice vs. adjacent ones, and (b) it sketches the natural expansion path if a tariff wedge takes hold.

| Data | Why they need it | Where they get it today |
|---|---|---|
| **Utility delivery tariffs** (TDU rates) | The "wires" leg of the bill | Genability / ETB / RateAcuity / URDB / raw PDFs |
| **REP supply offers** (deregulated states) | The "energy" leg | Each REP's portal; PowerToChoose; quote calls |
| **Wholesale forward curves** (gas + power) | Timing the lock; pricing hedges | NYMEX/ICE; S&P Platts; subscription terminals |
| **Day-ahead / real-time LMPs** | Index-product pricing; pass-through verification | ERCOT/PJM/etc.; GridStatus; Yes Energy |
| **Capacity prices** (PJM, ISO-NE) | Pass-through line items in those markets | RTO settlement docs; consulting databases |
| **Customer interval / AMI data** | Load shape → custom offer fit | Customer's utility account (Smart Meter Texas, Green Button) |
| **REC / VPPA market** | Sustainability strategy + RECs standalone | LevelTen, 3Degrees, S&P |
| **PPA pricing benchmarks** | Long-term green strategy comparisons | LevelTen Marketplace, BNEF |
| **Demand-response program rules** | Capture demand-side revenue/savings | ERCOT / PJM / NYISO docs |
| **REP counterparty credit** | Won't recommend a REP that defaults | S&P, Moody's, EnerKnol |
| **Bill audit / line-item parsing** | Catching utility/REP errors (~5% of bills have one) | Hand-extraction from PDFs |
| **Regulatory / docket news** | Heads-up on rate cases, tariff changes | EQ Research, Utility Dive, EnergyChoiceMatters, RTO Insider |
| **Weather forecasts** | Load + price driver | NOAA, Weather Co, Speedwell |

Two strategic paths fall out:

- **"Tariff slice" play** — own one row deeper than anyone else. Sell to consultants as a feature inside their existing stack. Smaller TAM, reachable solo, validates FlywheelETL cleanly. Where the POC naturally lands.
- **"Consolidate the stack" play** — workspace pulling 5–7 of these into one tool where a consultant runs comparison + builds deliverable in one place. Higher TAM, higher stickiness, much higher build cost, direct competition with incumbents (PCI, Power Costs Inc., Cinergy, Mantis Innovation, EnergyBy5). Not solo-shaped.

The honest read: path A is shippable solo, path B is what to graduate to. Path A's natural expansion is by adding adjacent slices that are *also* FlywheelETL-shaped (rider tracking → bill-audit extraction → DR program rules). Each row that's PDF-fragmented is a candidate.

## Frequency context: how common are tariff comparisons

Three cadences:

1. **Contract renewals.** C&I retail contracts run 6–36 months; pre-renewal RFPs typically start 6–12 months out. **PUCT lists 1,300+ registered energy brokers in Texas alone**; UK comparison (~2,200 brokers serving 50–80% of I&C) is the saturation indicator. Comparison runs are a daily activity across the broker community, not an occasional one.
2. **Annual rider re-comparison.** DCRF / TCRF / EECRF / fuel adjustments update every year per utility — pass-through delivery cost re-baselining for every C&I client annually, even mid-contract.
3. **Event-triggered.** New site, M&A, base rate case in the customer's TDU, load class crossover, sustainability mandate. Less predictable, higher urgency, higher WTP for fast answers.

Implication: the marginal cost of the consultant's current process *is* internalized — their analyst hours are billable but capped, and "we don't have analyst capacity" becomes "we lose the deal." That ceiling is where willingness-to-pay for tooling lives.

The sharper consultant-interview question (replaces the broader version above):

> *"Walk me through the data sources you pulled for your last C&I RFP. Show me the actual files — what was a PDF, what was an Excel export, what came from a portal, what did your analyst hand-build?"*

Three consultants independently saying "tariff PDFs are the worst part" → wedge confirmed. If they say "tariff data is fine, but normalizing REP offers across formats is hell" → wedge isn't tariffs, it's REP-offer normalization, and FlywheelETL re-points.

## Which slice to own first

Scoring the 13 slices against criteria that matter for "best in class":

1. FlywheelETL structural fit (PDF-fragmented vs. already-structured)
2. Incumbent vacuum
3. Pain intensity (consultants DIY today)
4. Solo-shippable in 3 months without enterprise data licensing
5. Recurring usage shape (daily/monthly vs. once-a-year)
6. Expansion adjacency (does winning lead to selling neighbors)
7. WTP density (dollars per customer per year)

After scoring, **the shortlist is 1, 2, 9, 11**. The other rows are either already-structured data owned by entrenched players (3, 4, 6, 7, 10, 13) or mediocre across multiple axes (5, 8, 12).

| # | Slice | Headline | Killer concern |
|---|---|---|---|
| 1 | **Utility delivery tariffs** | Public data, POC done, market research done. Long-tail + structural query + provenance is the wedge. | Annual-ish comparison cadence; Genability could ship structural query in 6–12 months. |
| 2 | **REP supply offers** | Highest fragmentation, highest pain, no incumbent, every deal | Commercial REP offers are negotiated quotes, not public — chicken-and-egg distribution. |
| 9 | **DR program rules** | No incumbent, real fragmentation | Narrower audience (DR aggregators); smaller TAM. |
| 11 | **Bill audit / line-items** | Highest WTP density on the list. Monthly recurring per customer. Deliverable is a check, not a comparison. | Bills are private — need consultant/customer relationship to ingest. |

### Recommendation: tariffs (v1) → bill audit (v2) → REP offers (v3)

Same FlywheelETL pipeline architecture across all three; each step earns the relationship that unlocks the next.

- **v1 = tariffs (public, free tier, marketing).** The only slice solo-shippable in 3 months without customer dependency, because the data is public. Public artifact (a "DELTa-but-better" or long-tail tariff API) creates inbound, validates FlywheelETL in the open, and builds credibility for the B2B sale that comes next. Tariffs alone is a $1–10K/yr SaaS-per-consultant product max — that's not the business, it's the lead-gen.
- **v2 = bill audit (private, paid, business).** Where the actual revenue lives. Bill auditors charge 30–50% contingency on recovered amounts or $200–500/hr — real money. Once your tariff API is public, procurement consultants are already aware of you; pivot to "we'll ingest your clients' bills and find the errors." Architecture is identical (agentic PDF extraction with provenance), customer base overlaps. Existing players (APPI Energy, Engie Impact, Mantis, Cost Recovery Solutions) are human-labor-intensive — agents are the structural answer.
- **v3 = REP offer normalization (network-effect, expansion).** Once you have broker relationships from v2, you can ingest the negotiated quotes they have but can't share with each other. Solves the chicken-and-egg: distribution comes from the relationships v1 + v2 already earned.

### What would change the recommendation

- 3 procurement consultants independently saying "tariff data is fine, REP offer normalization is hell" → row 2 becomes v1 (sign one design partner to break chicken-and-egg before building).
- A bill-audit firm (APPI, Engie Impact) saying they'd license a bill-extraction API tomorrow → row 11 becomes v1 via B2B2C path.
- Genability shipping structural-query in the next 6 months → row 1's defensibility window closes; fall back to row 11.

## Things to verify next

- ~~Does Genability/Arcadia Signal cover demand-charge and TOU shoulder structure to the depth the canonical query needs, or only enough for billing-calculation?~~ **Partially answered (2026-05-04) from API docs alone.** Their `GET /tariffs` accepts `chargeTypes=DEMAND_BASED`, `hasTimeOfUseRates`, `fromDateTime`/`effectiveOn`, customer-class, LSE filters — about 80% of the canonical query is server-side filterable. The 20% gap: no server-side amount-threshold filter (e.g. `demand_charge_gt=20` requires populate-then-filter client-side), and `populateDocuments` returns document links of unknown depth (filing-level URL? paragraph anchor?). The remaining unknowns that need actually using a dev account: (a) what `populateDocuments` resolves to specifically, (b) whether long-tail utility coverage is real or thin, (c) what their pricing tier looks like for a procurement-consultant-shaped buyer.
  - **Wedge implication:** the moat is no longer "we have structural query, they don't" — it's the *conjunction* of amount-threshold filtering + per-paragraph provenance + long-tail coverage + same-day filing freshness + free public tier. Pick any two and Genability matches in 12 months; all five together is defensible.
- Pricing of the commercial tier: RateAcuity, Genability, S&P Global. Public pricing is rare; need a sales conversation or a customer disclosure.
- DELTa technical underbelly — Airtable? Sheets? Custom? How many person-hours per quarterly update? (Talk to NCCETC.)
- Whether any AI-native ingest plays have emerged that I missed. The "FERC eLibrary scraper startup" search came back empty, which is either a real gap or a search-keyword miss.
- Does Emerald AI (`market-landscape.md`) consume tariff data, and from where? AI-datacenter orchestration depends on the rate signal.
