# FlywheelETL POC — FERC/PUCT Tariff Ingestion

A weekend-scoped proof of concept: validate that FlywheelETL can ingest fragmented tariff PDFs into a structured, queryable database, and answer a real procurement-style question end-to-end.

## The canonical question

> "Every TOU tariff in ERCOT-North with demand charges over $20/kW that took effect in the last 18 months."

If FlywheelETL + this schema + a Postgres query return a plausible answer to this question against a small corpus of real tariff PDFs, the POC is a success. That's the bar.

## Important jurisdictional correction

**ERCOT is mostly outside FERC jurisdiction.** The Texas Interconnection is intrastate, so retail tariffs in ERCOT-North are filed at **PUCT (Texas PUC)**, not FERC. The user-facing wedge (`procurement-deep-dive.md`) targets retail/procurement decisions; that data lives at PUCT + utility portals, not eLibrary.

FERC eLibrary is still useful for testing FlywheelETL on similar-shaped filings (Section 205 wholesale rate filings) and for the wholesale/PPA side of procurement. Just don't expect to answer the canonical query from FERC alone — the right primary sources are PUCT + the four ERCOT TDUs.

## v0 test scope (1 weekend)

Pull **5–10 Oncor delivery tariff PDFs**. Single utility, single jurisdiction, similar format — perfect for shaking out FlywheelETL extraction without entity-resolution noise. If that works, expand to:

- **CenterPoint** (Houston area)
- **AEP Texas** (south/west)
- **TNMP** (Texas-New Mexico Power)

These four TDUs cover most of ERCOT and answer the bulk of "ERCOT-zone" tariff queries.

## PUCT Interchange search recipe (for tariffs)

Daily Filings is a firehose with no useful filter; Filings Search has the right filters but Case Style searches are deceiving. The working recipe:

- Go to **Filings Search** (not Daily Filings)
- `Utility Type` = **Electric**
- `Filing Party` = **Oncor** (or CenterPoint / AEP Texas / TNMP)
- `Item Type` = **TARIFF** ← this is the magic filter; it matches at the document level, not docket level
- `Date Filed From` = ~24 months ago
- Leave Case Style and Filing Description **blank**

**Why `Item Type = TARIFF` is the trick:** Oncor's tariff dockets often have case styles like "Application to Adjust its Distribution Cost Recovery Factor" — no "tariff" in the title. But individual filings *inside* those dockets are classified type=TARIFF, which Item Type catches.

### Oncor docket types (terminology cheat sheet)

| Acronym | Full name | Cadence | What's in it |
|---|---|---|---|
| **Base rate case** | "Application for Authority to Change Rates" | Every ~5 yr | The full tariff book — every rate schedule across every customer class. The goldmine. |
| **DCRF** | Distribution Cost Recovery Factor | Annual | Adjustment to distribution-related charges between rate cases |
| **TCRF** | Transmission Cost Recovery Factor | Annual | Adjustment to transmission-related charges (TCOS pass-through) |
| **EECRF** | Energy Efficiency Cost Recovery Factor | Annual | Recovery of energy efficiency program costs |
| **Rider RCE / NDC / etc.** | Various surcharge riders | As needed | Narrow rider modifications |

For the POC, the base rate case has the most tariff content per docket; DCRF/TCRF/EECRF are best for cross-year structural consistency testing.

### Initial POC corpus to grab (priority order)

Within the dockets returned by the search recipe above, prioritize:

1. **The most recent base rate case docket** — full tariff book, most extraction surface. (Look for case style "Application for Authority to Change Rates.")
2. **3 DCRF dockets across consecutive years** — cross-year consistency test. Same filing type, evolving values.
3. **1 TCRF or EECRF docket** — different-but-similar structure check.

Click into each control number, find items typed TARIFF inside, download those PDFs to your GCS bucket. Expected v0 corpus: ~10–30 PDFs. Skip dockets that turned up under the TARIFF filter but are actually CCN amendments or transmission-line construction cases (e.g. joint applications for line projects) — those are mis-classified for our purposes.

### Pinned starter corpus: Oncor docket 58306, item 757

**Filed 4/27/2026, effective 6/1/2026** — `COMPLIANCE TARIFF FOR FINAL ORDER IN DOCKET NO. 58306`. Oncor's full tariff book just approved out of their most recent base rate case ("Application for Authority to Change Rates"). Final order entered 4/17/2026; rates effective 45 days later.

**Download from PUCT Interchange:** navigate to control 58306, item 757; download the **ZIP** (`1633383`) — it contains the logically-separated source files. Don't bother with the page-range PDFs (`1633384`–`1633387`); those are the same content reflowed into 100-page chunks for download convenience.

**ZIP contents (4 files):**

| File | Size | What it is | ISO/Zone |
|---|---|---|---|
| `58306_Compliance Tariffs Cover Ltr.pdf` | 164 KB | Filing manifest — metadata, effective date, references the order | — |
| `Retail Tariff.pdf` | 3.6 MB | **The canonical-query target.** Oncor TDU retail delivery rate schedules | ERCOT-North |
| `Wholesale Tariff.pdf` | 1.5 MB | Oncor transmission service tariff (TCOS), wholesale-side | ERCOT |
| `NTU_Tariff.pdf` | 1.2 MB | **Oncor NTU** transmission service — a *separate corporate entity* with assets in the Texas Panhandle | **SPP** (not ERCOT) |

**Cover letter facts (the metadata model needs to handle):**

- Filing party: Oncor Electric Delivery Company LLC
- File stamp: 2026-04-27
- Final order date: 2026-04-17
- Effective date: 2026-06-01 (45 days from order)
- PUCT docket: 58306; SOAH docket: 473-25-24800
- Status as of today (4/30/2026): **approved, not yet effective**

**Why this is the ideal v0 corpus:**

- About-to-be-effective — query results will reflect the actual current state of Oncor as of 6/1/2026.
- Logically pre-segmented (cover letter + 3 tariffs by service type) — no need to chunk by page.
- Single corporate parent but **two distinct ISO regions** (ERCOT for Oncor, SPP for Oncor NTU) — exposes the multi-ISO entity edge case in v0, which is good.
- PUCT compliance filings are typically text-extractable PDFs (no OCR needed).

### Schema lessons from this corpus

The cover letter and first FlywheelETL run surfaced five schema concerns, all baked into the consolidated v0 schema below:

- **`status` needs four states** — `'proposed' | 'approved-pending-effective' | 'active' | 'superseded'`. The 45-day gap between final order and effective date is real; all four states appeared organically in the first slice of real data.
- **`iso_region` and `service_zone` must be extracted per-tariff, not per-filer.** Oncor is in ERCOT-North; Oncor NTU is in SPP/Texas Panhandle — same corporate parent, different ISOs. Agent must pull from the document itself, not a hardcoded `filer → ISO` lookup.
- **`customer_class` enum was retail-shaped.** Wholesale tariffs serve DSPs and WDSCs, not residential/commercial/industrial. Solved with a `customer_segment` retail/wholesale split + widened `customer_class` values.
- **`charge_period` was the dangerous gap.** Some schedules quote demand charges as `$/kW-year`, others as `$/kW-month`. Without a `charge_period` field, the canonical query falsely flags annual rates. Real example: Oncor NTS quotes `$22.708039/kW` annual; monthly equivalent is ~$1.89/kW — a 12× false positive without the fix. Solved with `charge_period` field + a GENERATED `_monthly` column for apples-to-apples queries.
- **`service_zone` is null for wholesale (acceptable).** Wholesale tariffs apply across the utility's full territory; service_zone is retail-only. Documented as a column comment.

See the consolidated schema in [v0 schema](#v0-schema-consolidated) below.

### Lessons from FlywheelETL run #1 (slice 0 of Wholesale Tariff)

First slice extracted 8 schedules from 20 source pages. Validated behaviors worth preserving:

- **DRAFT handling:** placeholder rates (`$ x.xxxxxx`) → `null` value, lower confidence (0.85), `extraction_notes` flagged it, `status: 'proposed'`. Exactly the "return null, don't guess" behavior the prompt was designed for.
- **Inactive riders:** $0.00 current value → returned `0` not `null` (real value, not unknown). Canonical `> 20` query correctly skips.
- **Confidence stratification:** 0.85 on DRAFT, 0.9 on cost-calculated services without fixed rates, 0.95 on clean fixed-rate schedules.
- **Provenance:** every schedule has populated `raw_text` and `source_pdf_page_range`.

**Validation check that must happen before trusting any run:** open the source PDF, find one schedule, hand-verify the agent's extracted value matches the document. The NTS annual-vs-monthly issue above was caught by reading `extraction_notes` — but only because the agent flagged it. Confidence ≠ correctness; the golden-set check is non-negotiable.

**NTS verification outcome (2026-05-02):** source PDF confirmed annual. Source language: *"Monthly charges are determined by multiplying one-twelfth of the Annual Access Rate by the monthly DSP Utility System Demand. Annual Access Rate $22.708039/kW."* Agent's `extraction_notes` interpretation was accurate; confidence (0.95) was warranted. Effective monthly demand charge for NTS = $22.708039 / 12 ≈ **$1.892/kW**. The `charge_period` + GENERATED `_monthly` schema fix handles this mechanically once `charge_period='annual'` is set on the row.

### Backfilling `charge_period` on existing rows without re-running

The agent already encoded the period in `extraction_notes` and `raw_text`. Backfill with a text-pattern UPDATE rather than burning another agent run:

```sql
UPDATE tariffs
SET charge_period = CASE
  WHEN extraction_notes ILIKE '%annual access rate%'
    OR extraction_notes ILIKE '%divided by 12%'
    OR raw_text        ILIKE '%Annual Access Rate%'
    OR raw_text        ILIKE '%/kW-year%'
    OR raw_text        ILIKE '%per kW-year%'
  THEN 'annual'
  ELSE 'monthly'
END
WHERE charge_period IS NULL;
```

### Prompt tightening for future runs

Append to the FlywheelETL extraction prompt:

```
Extract charge_period for every demand-related schedule:
- 'annual'  if source uses "Annual Access Rate", "$/kW-year", "annual demand charge",
            or describes a monthly bill as "one-twelfth of [some annual rate]"
- 'monthly' if source uses "$/kW", "$/kW-month", or quotes a per-month figure directly
- Default to 'monthly' if ambiguous, AND note the ambiguity in extraction_notes

Always quote the unit/period verbatim in raw_text. Don't normalize or paraphrase units.
```

The last line is the rule that prevents the inverse failure mode — agent silently normalizes annual to monthly without saying so, masking the unit ambiguity from downstream review.

### Recommended ingestion order

1. **Cover letter first.** ~2 pages, highly structured, validates the pipeline end-to-end before any heavy lift. Should yield a clean `filings` record with 8+ metadata fields and high confidence. If this fails, fix the pipeline before processing the larger PDFs.
2. **Retail Tariff.pdf** — main extraction target. Two-pass: classifier identifies ~20–40 schedules; per-schedule extractor pulls structured fields. This is where `has_tou` and `max_demand_charge_per_kw` come from.
3. **Wholesale Tariff.pdf** — different rate structure (TCOS, demand-based, typically no TOU). Schema robustness check.
4. **NTU_Tariff.pdf** — same shape as Wholesale but `iso_region='SPP'`, `service_zone='Texas Panhandle'`. Edge case for the multi-ISO entity model.

### Recommended chunking: two-pass extraction

A 100-page compliance tariff PDF contains many distinct rate schedules. One agent extracting the whole PDF will struggle. Instead:

1. **First pass — classifier agent per PDF:** "Identify each rate schedule in this PDF. Return `[{schedule_code, page_range, customer_class}, ...]`." Cheap, fast, structural.
2. **Second pass — extraction agent per schedule:** Given a schedule's page range, extract the structured fields per the schema above. One agent invocation per detected schedule.

This handles the "many schedules per PDF" problem and gives you per-schedule provenance (which is non-negotiable). FlywheelETL's fan-out architecture is well-suited for this — first pass produces N work items, fan out the second pass over those N items.

## Where to grab PDFs (entry points)

URLs rotate; specific docket IDs go stale. Drill down from these starting points:

**Primary sources for the canonical query:**

- **PUCT Interchange** — https://interchange.puc.texas.gov/ — search by utility name + filing type. For ERCOT-North, search "Oncor" filtered to "Tariff" or "Rate Case." Hundreds of PDFs.
- **Oncor tariff page** — https://www.oncor.com/ → "Electric Rates" / "Tariffs." Cleanest source for current-effective tariff PDFs.
- **PowerToChoose** — https://www.powertochoose.org/ — PUCT-run REP shopping site. REP retail tariffs published as standardized "Electricity Facts Labels" (EFLs) — already semi-structured, good warm-up for entity resolution.

**Secondary (for FERC-shape testing on similar PDF structure):**

- **FERC eLibrary** — https://elibrary.ferc.gov/eLibrary/search — filter "Filing Type = Rate Filing" + a date range to find Section 205 filings.
- **FERC Form 1** — https://www.ferc.gov/industries-data/electric/general-information/electric-industry-forms/form-1-electric-utility-annual — already structured (XBRL/CSV); good sanity-check that the pipeline matches authoritative output.

**Bonus for entity resolution:**

- **EIA Form 861** — https://www.eia.gov/electricity/data/eia861/ — utility list with sales by state and customer class. Use as the canonical entity registry for v0.

## v0 schema (consolidated)

One wide Postgres table with JSONB for polymorphic content and denormalized scalars for the canonical query. Consolidates all corrections from the first FlywheelETL run.

```sql
-- ============================================================
-- v0 tariff schema for FlywheelETL POC
-- Wide table + JSONB for polymorphic content,
-- denormalized scalars for the canonical query.
-- ============================================================

CREATE TABLE tariffs (
  id                SERIAL PRIMARY KEY,

  -- ---- Provenance (non-negotiable for regulatory data) ----
  source_url            TEXT NOT NULL,
  source_filing         TEXT,           -- e.g. '58306-757' (PUCT docket-item)
  source_pdf_filename   TEXT,           -- e.g. 'Wholesale Tariff.pdf'
  source_pdf_page       INT,            -- starting page
  source_pdf_page_range TEXT,           -- e.g. '6-9' for multi-page schedules
  extracted_at          TIMESTAMPTZ DEFAULT now(),

  -- ---- Entity (strings for v0; canonical IDs after entity resolution) ----
  utility_name      TEXT NOT NULL,
  utility_id        INT,                -- FK to utilities; null until entity res
  iso_region        TEXT,               -- 'ERCOT'|'SPP'|'PJM'|'CAISO'|'NYISO'|'ISO-NE'|'MISO'
  service_zone      TEXT,               -- e.g. 'ERCOT-North'. NULL for wholesale (see COMMENT)
  state             CHAR(2),

  -- ---- Tariff identity ----
  schedule_code     TEXT NOT NULL,      -- 'NTS','XFMR','DLS','GS-3', etc.
  schedule_name     TEXT,               -- 'Network Transmission Service'
  customer_segment  TEXT,               -- 'retail' | 'wholesale'
  customer_class    TEXT,               -- retail: 'residential'|'commercial'|'industrial'
                                        -- wholesale: 'DSP'|'WDSC'
  {{PROJECT_SLUG}}age_level     TEXT,               -- 'transmission'|'subtransmission'|'primary'|'secondary'
  effective_date    DATE,
  termination_date  DATE,
  status            TEXT,               -- 'proposed'|'approved-pending-effective'|'active'|'superseded'

  -- ---- Denormalized scalars for the canonical query (indexable) ----
  rate_type                  TEXT,      -- 'demand'|'energy'|'mixed'|'fixed'
  has_tou                    BOOLEAN,
  max_demand_charge_per_kw   NUMERIC,   -- raw value, as stated in source
  charge_period              TEXT,      -- 'monthly' | 'annual'
  max_demand_charge_per_kw_monthly NUMERIC GENERATED ALWAYS AS (
    CASE WHEN charge_period = 'annual'
         THEN max_demand_charge_per_kw / 12.0
         ELSE max_demand_charge_per_kw END
  ) STORED,

  -- ---- Polymorphic content (JSONB) ----
  -- Forward-looking; v0 agent populates raw_text + scalars only.
  -- Prompt expansion in v0.1 will fill these.
  tou_periods       JSONB,              -- [{name, rate_per_kwh, days[], start_hr, end_hr, season}, ...]
  demand_charges    JSONB,              -- [{charge_per_kw, charge_period, window, ratchet, season}, ...]
  energy_charges    JSONB,              -- [{rate_per_kwh, season, window}, ...]
  customer_charges  JSONB,              -- [{charge, basis, frequency}, ...]
  riders            JSONB,              -- [{name, type, rate, period, conditions}, ...]

  -- ---- Extraction quality / auditability ----
  raw_text                TEXT,         -- verbatim source paragraph(s)
  extraction_confidence   NUMERIC,      -- 0.0–1.0, agent's self-reported
  extraction_notes        TEXT          -- caveats, ambiguities, edge cases
);

-- ---- Column documentation ----
COMMENT ON COLUMN tariffs.service_zone IS
  'Retail-only concept. NULL for wholesale tariffs (they apply across the utility''s full territory, not a specific retail zone).';
COMMENT ON COLUMN tariffs.charge_period IS
  'Period basis of max_demand_charge_per_kw. Some tariffs (e.g. transmission NTS) quote annual; retail typically quotes monthly. The _monthly generated column normalizes for queries.';
COMMENT ON COLUMN tariffs.status IS
  'Lifecycle. ''approved-pending-effective'' covers the 45-day gap between final order and effective date.';
COMMENT ON COLUMN tariffs.customer_segment IS
  'Top-level retail/wholesale split. customer_class values differ between segments.';

-- ---- Indexes ----
CREATE INDEX ON tariffs (iso_region, service_zone, effective_date DESC);
CREATE INDEX ON tariffs (max_demand_charge_per_kw_monthly);
CREATE INDEX ON tariffs (utility_id, customer_segment, customer_class);
CREATE INDEX ON tariffs (has_tou) WHERE has_tou;
CREATE INDEX ON tariffs (status) WHERE status IN ('active','approved-pending-effective');
CREATE INDEX ON tariffs USING gin (tou_periods);
CREATE INDEX ON tariffs USING gin (demand_charges);
```

**Why this shape:**

- `has_tou` and `max_demand_charge_per_kw_monthly` as scalar indexed columns make the canonical query fast.
- The GENERATED `_monthly` column normalizes annual quotes (e.g. NTS) without requiring extraction-time conversion.
- JSONB everywhere else so extraction-field iteration doesn't require migrations.
- `raw_text` + `extraction_confidence` + `extraction_notes` give provenance + a way to audit FlywheelETL's output by hand.
- Strings for entity fields (`utility_name`) until you build entity resolution; canonical IDs (`utility_id`) layer on later.
- JSONB content fields are forward-looking — v0 agent populates scalars only; v0.1 prompt expansion will populate the structured arrays.

## The canonical query

```sql
-- "Every TOU tariff in ERCOT-North with monthly demand charges over $20/kW
--  that took effect in the last 18 months."
SELECT
  utility_name,
  schedule_code,
  schedule_name,
  effective_date,
  max_demand_charge_per_kw_monthly,
  charge_period,
  source_url
FROM tariffs
WHERE service_zone = 'ERCOT-North'
  AND has_tou
  AND max_demand_charge_per_kw_monthly > 20
  AND effective_date >= now() - INTERVAL '18 months'
  AND effective_date <= now()                              -- exclude future-effective until live
  AND status IN ('active','approved-pending-effective')
ORDER BY max_demand_charge_per_kw_monthly DESC;
```

If this returns plausible results from 5–10 ingested Oncor tariff PDFs, the POC succeeds. Note: queries against `max_demand_charge_per_kw_monthly` (the GENERATED column) are unit-safe; queries against `max_demand_charge_per_kw` are NOT — that column holds raw values that may be annual or monthly per the source.

## FlywheelETL prompt sketch

For each tariff PDF, the agent returns a JSON object per schedule matching the v0 schema. Critical: **return `null` rather than guessing** when a field isn't clearly stated; quality > coverage in regulatory data.

```
For the attached tariff PDF, extract one JSON object per rate schedule with these fields:

  -- entity / identity
  utility_name, schedule_code, schedule_name,
  customer_segment ('retail' | 'wholesale'),
  customer_class (retail: residential|commercial|industrial; wholesale: DSP|WDSC),
  {{PROJECT_SLUG}}age_level (transmission|subtransmission|primary|secondary),
  iso_region, service_zone (NULL for wholesale),
  effective_date, termination_date, status,

  -- canonical-query scalars
  rate_type (demand|energy|mixed|fixed),
  has_tou (bool),
  max_demand_charge_per_kw (numeric, raw value as stated in source),
  charge_period ('monthly' | 'annual'),

  -- structured content (arrays)
  tou_periods    [{name, rate_per_kwh, days, start_hr, end_hr, season}, ...],
  demand_charges [{charge_per_kw, charge_period, window, ratchet, season}, ...],
  energy_charges [...],
  customer_charges [...],
  riders         [...],

  -- audit
  raw_text (paragraph(s) the extracted facts came from, verbatim),
  source_pdf_page_range (e.g. '6-9'),
  extraction_confidence (0-1),
  extraction_notes (caveats, ambiguities, edge cases).

Rules:
- If a field isn't clearly stated in the document, return null. Don't guess.
- iso_region and service_zone must be inferred from document content, not from the
  filer name (e.g. Oncor proper → ERCOT; Oncor NTU → SPP).
- For service_zone, leave NULL for wholesale tariffs.
- charge_period rules:
    'annual'  if source uses "Annual Access Rate", "$/kW-year", "annual demand charge",
              or describes a monthly bill as "one-twelfth of [some annual rate]"
    'monthly' if source uses "$/kW", "$/kW-month", or quotes a per-month figure directly
    Default to 'monthly' if ambiguous, AND note the ambiguity in extraction_notes.
- ALWAYS quote the unit/period verbatim in raw_text. Don't normalize or paraphrase units.
- Note ambiguities in extraction_notes (e.g. "demand charge varies seasonally — used summer rate as max").
- Keep raw_text under 500 chars per fact group; quote the original verbatim.
```

## "Done" criteria for the POC

1. ✅ FlywheelETL ingests 5–10 Oncor tariff PDFs end-to-end.
2. ✅ Extracted records match a hand-curated golden set on the key fields (`schedule_code`, `effective_date`, `max_demand_charge_per_kw`, `has_tou`).
3. ✅ The canonical query returns at least one plausible result, with `source_url` traceable to the original PDF.
4. ✅ At least one extraction has a non-null `extraction_notes` flag — meaning the agent caught its own ambiguity rather than papering over it.

If 1–3 pass but 4 doesn't, the agent is over-confident — tighten the prompt before scaling.

## Path from v0 to v1

Once the POC validates:

1. **Expand utilities.** CenterPoint → AEP Texas → TNMP. Same schema, more rows.
2. **Add entity resolution.** Build `utilities` table; backfill `utility_id` via embedding clustering + manual review of the small initial set.
3. **Normalize the gnarl.** Split JSONB into `tou_periods`, `demand_charges`, `riders` tables when query patterns demand it (e.g. "show me every tariff with off-peak rate < $0.05/kWh").
4. **Add ISOs.** PJM, CAISO, NYISO, ISO-NE. Each ISO is a coverage expansion + a new set of source URLs.
5. **Layer in FERC.** Section 205 + Section 210 filings for the wholesale/PPA side. Different schema, same pipeline.
6. **Ship a faceted-search FE.** Meilisearch or Typesense over the Postgres corpus. This is the public artifact.

## What this validates beyond the obvious

If the POC works:

- **FlywheelETL handles regulatory PDFs.** Demonstrated on the hardest fragmentation case (utility tariffs).
- **The procurement wedge moat is real.** Tariff fragmentation flips from "why this is hard" to "why we have an unfair advantage" — see `procurement-deep-dive.md`.
- **The data infrastructure wedge (#9) is in reach.** Same pipeline, broader scope, a "GridStatus for FERC/PUC tariffs" becomes credible.
- **Customer conversations get sharper.** "I ingested 5 tariffs and ran this query — does this match your reality?" is a much better interview prompt than "would you use a tool that...?"

## What this doesn't validate

- Quality at scale (5 PDFs is not 5,000).
- Edge cases in tariff structure (the long tail of weird ratchet rules, riders, special-case clauses).
- Anything about the FE / customer experience.
- Whether anyone will pay for this.

Those are downstream. The POC's job is to prove the pipeline + schema + query path is viable, nothing more.
