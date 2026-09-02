'use client'

// FactsPanel — the board's right-hand inspector + fleet panel
// (migrate-fleet-to-continuous-burns, design.md Decision 12). It shows the
// system header, the acting (own) fleet's hold/mine/sell offers, and
// whatever is selected — a body (type, fog band, worth where earned), a bare
// cell, or a lane gate. Movement (burn/cut-drive/stop/jump) is commanded from
// the roster panel, not from here — this panel owns no board.Cell/
// MovementState-shaped verb (design.md Decision 12; fleet-roster "The Roster
// Row Is the Fleet Command Surface").
//
// `board-selection.ts`'s `BoardSelection` carries only an id/destSystemId/
// cell (lean, no embedded domain object) — this panel resolves a selected
// feature id back to its `BoardFeature` from the interior read's own feature
// list, the same list it resolves the acting fleet's docked body from
// (`activeFleet.attachedTo`, design.md Decision 13 — a body id directly, no
// board-cell relation).
//
// Toasts live in the container (component), not in the hooks
// (#frontend/CLAUDE.md).

import { useState } from 'react'
import { Button } from '@/components/catalyst/button'
import { Badge } from '@/components/catalyst/badge'
import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Input } from '@/components/catalyst/input'
import type { BoardFeature, LaneGate, ResourceKind } from '@/lib/types/system-board'
import type { Fleet, FleetRoster } from '@/lib/types/fleet'
import { SHIP_MODE_BURN } from '@/lib/types/fleet'
import type { Quote } from '@/lib/types/market'
import { formatEta as etaLabel } from '@/lib/eta'
import { FOG_TREATMENT } from './board-palette'
import { SellSection } from './SellSection'
import { RefuelSection } from './RefuelSection'
import { BalanceReadout } from './BalanceReadout'
import type { BoardSelection } from './board-selection'

export type { BoardSelection } from './board-selection'

export interface FactsPanelProps {
  starClass: string
  character: string
  radius: number
  featureCount: number
  // The interior read's full feature list — how a selected/docked id resolves
  // to its facts.
  features: BoardFeature[]
  // The interior read's served lane gates (replace-observation-with-
  // sightings tasks.md 4.12) — a picked lane-gate body folds into the SAME
  // 'feature'-shaped `selection` as any other body (its id is the
  // "gate-"+destSystemId convention `attachedTo` also reports), and
  // `board.features` never carries a gate body — so this is how the panel
  // still recognises one and shows its facts instead of blanking the
  // selection section. Optional/defaulted so a caller that never selects a
  // gate need not pass it.
  laneGates?: LaneGate[]
  selection: BoardSelection
  activeFleet: Fleet | null
  worldTime: number
  pending: boolean
  // The running mine's frozen eta (null when no run is in flight) — drives
  // the countdown and blocks a new mine offer.
  mineEta?: number | null
  // Commit a mine run against the docked feature; the panel owns the
  // kind/tonnage choice, the container owns the featureId (the dock parent).
  onMine: (kind: ResourceKind, tons: number) => void
  // The station's live quotes when the acting fleet is docked at one, else null.
  stationQuotes?: Quote[] | null
  // Commit a sale of the docked-at station. The panel owns the kind/tonnage and
  // the first-ton price it quoted; the container owns the featureId and the
  // operation key.
  onSell?: (kind: ResourceKind, tons: number, expectedUnitPrice: number) => void
  // Set after a "price changed" rejection: the price the player HAD expected, so
  // the re-priced offer can show what moved rather than freezing a stale one.
  sellRepricedFrom?: number | null
  // Commit a refuel from the docked-at station (add-fuel-as-cargo tasks.md
  // 8.4; board-view ADDED "Refuel Offer on the Docked Fleet"). The panel
  // owns the chosen tonnage; the container owns the operation key. Reuses
  // the SAME `stationQuotes !== null` gating signal as the sell offer — an
  // empty quotes array still means "docked, nothing to sell, but fuel is
  // still always for sale" — rather than a new prop.
  onRefuel?: (tons: number) => void
  // The most recent refuel's cost, if one just settled — threaded to the
  // balance readout exactly as `lastSaleProceeds` is.
  lastRefuelCost?: number | null
  // The corporation's credit balance, from session data.
  credits?: number | null
  lastSaleProceeds?: number | null
  saleFailure?: string | null
  // Whether the board's rendering context is live
  // (add-renderer-availability-states) — defaults to true.
  available?: boolean
}

const PANEL =
  'pointer-events-auto flex w-72 max-w-[80vw] flex-col gap-4 self-start rounded-xl border border-zinc-200 bg-zinc-50/90 p-4 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]'

export function FactsPanel({
  starClass,
  character,
  radius,
  featureCount,
  features,
  laneGates = [],
  selection,
  activeFleet,
  worldTime,
  pending,
  mineEta = null,
  onMine,
  stationQuotes = null,
  onSell,
  sellRepricedFrom = null,
  onRefuel,
  lastRefuelCost = null,
  credits = null,
  lastSaleProceeds = null,
  saleFailure = null,
  available = true,
}: FactsPanelProps) {
  // A burn whose ArriveMs has passed IS its settled state — the trivial fold
  // (t >= ArriveMs), never a re-derivation of the settled park's geometry
  // (design.md Decision 1; the same discipline components/fleet/roster-*.ts
  // use).
  const state = activeFleet?.state
  const burning =
    state?.Mode === SHIP_MODE_BURN && !!state.Burn && worldTime < state.Burn.ArriveMs
  const dockedBodyId = activeFleet?.attachedTo
  const dockedFeature = dockedBodyId ? (features.find((f) => f.id === dockedBodyId) ?? null) : null
  const mining = mineEta !== null && mineEta > worldTime
  const mineSecondsLeft = mining ? Math.max(1, Math.ceil((mineEta! - worldTime) / 1000)) : 0
  const mineable =
    !!dockedFeature && !!dockedFeature.resources?.length && !!activeFleet?.roster && !mining && !burning

  const selectedFeature = selection?.kind === 'feature' ? (features.find((f) => f.id === selection.id) ?? null) : null
  // gateDestSystemId — a picked lane-gate body's destination. The selection
  // is 'feature'-shaped like any other body (`board.features` never carries
  // a gate body, so this panel needs the served `laneGates` list to
  // recognise one — replace-observation-with-sightings tasks.md 4.12).
  const gateDestSystemId =
    selection?.kind === 'feature'
      ? (laneGates.find((g) => `gate-${g.destSystemId}` === selection.id)?.destSystemId ?? null)
      : null

  return (
    <aside data-testid="facts-panel" className={PANEL}>
      <div>
        <Subheading className="!text-base !text-white">Class {starClass} system</Subheading>
        <p className="mt-0.5 font-mono text-[11px] tracking-wide text-zinc-400 uppercase">
          {character.replace('_', ' ')} · radius {radius} · {featureCount} bodies
        </p>
        {/* The wealth axis, always on screen once a corporation exists — a
            balance you have to navigate to isn't a balance you play against. */}
        {credits !== null && (
          <div className="mt-2">
            <BalanceReadout
              credits={credits}
              lastDelta={lastSaleProceeds}
              lastRefuelCost={lastRefuelCost}
              failure={saleFailure}
            />
          </div>
        )}
      </div>

      {activeFleet && (
        <section data-testid="active-fleet" className="border-t border-white/10 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Your fleet</span>
            <Badge color={burning ? 'amber' : dockedBodyId ? 'green' : 'cyan'}>
              {burning ? 'burning' : dockedBodyId ? 'docked' : 'free-flying'}
            </Badge>
          </div>
          {mining && (
            <p data-testid="mine-countdown" className="mt-2 text-[11px] text-amber-300/80">
              Extractors running — resolves in {mineSecondsLeft}s.
            </p>
          )}
          {activeFleet.roster && <HoldReadout roster={activeFleet.roster} />}
          {mineable && dockedFeature && activeFleet.roster && (
            <MineSection
              key={dockedFeature.id}
              feature={dockedFeature}
              roster={activeFleet.roster}
              pending={pending}
              onMine={onMine}
            />
          )}
          {stationQuotes && onSell && activeFleet.roster && (
            <SellSection
              quotes={stationQuotes}
              roster={activeFleet.roster}
              pending={pending || burning || mining}
              onSell={onSell}
              repricedFrom={sellRepricedFrom}
            />
          )}
          {stationQuotes !== null && onRefuel && activeFleet.roster && (
            <RefuelSection
              roster={activeFleet.roster}
              pricePerTon={activeFleet.roster.fuelPricePerTon ?? 0}
              balance={credits}
              pending={pending || burning || mining}
              onRefuel={onRefuel}
            />
          )}
        </section>
      )}

      <section data-testid="selection" className="border-t border-white/10 pt-3">
        {selection?.kind === 'feature' && selectedFeature && (
          <FeatureFacts feature={selectedFeature} worldTime={worldTime} />
        )}
        {selection?.kind === 'cell' && (
          <Text className="!text-zinc-300">
            Ring {selection.cell.ring}, slot {selection.cell.slot}
          </Text>
        )}
        {gateDestSystemId && (
          <div data-testid="gate-facts">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Lane gate</span>
              <Badge color="sky">GATE</Badge>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-400">
              → {gateDestSystemId}
            </p>
            <p className="mt-3 text-[11px] text-zinc-500">
              Dock a fleet to this gate, then jump from the roster panel.
            </p>
          </div>
        )}
        {!selection && available && (
          <Text data-testid="selection-prompt" className="!text-zinc-500">
            Select a body, tile, or gate.
          </Text>
        )}
        {!selection && !available && (
          <Text data-testid="selection-prompt" className="!text-zinc-500">
            The board must be available to inspect a body, tile, or gate.
          </Text>
        )}
      </section>
    </aside>
  )
}

// Per-kind cargo accents (Tailwind classes, one hue per ResourceKind) — the
// hold meter's fill segments and the dot beside each cargo row share them, so
// a kind reads as the same colour everywhere in the panel.
const RESOURCE_ACCENT: Record<ResourceKind, { dot: string; meter: string }> = {
  metals: { dot: 'bg-amber-400', meter: 'bg-amber-400/80' },
  volatiles: { dot: 'bg-orange-400', meter: 'bg-orange-400/80' },
  water: { dot: 'bg-sky-400', meter: 'bg-sky-400/80' },
  organics: { dot: 'bg-emerald-400', meter: 'bg-emerald-400/80' },
  research: { dot: 'bg-violet-400', meter: 'bg-violet-400/80' },
  exotic: { dot: 'bg-fuchsia-400', meter: 'bg-fuchsia-400/80' },
}

// `fuel` (add-fuel-as-cargo) rides the SAME `roster.cargo` map a mined
// resource does, but is deliberately NOT a `ResourceKind` (`system-interior`
// reserves the name from generation) — so it has no `RESOURCE_ACCENT` entry.
// PRODUCTION DEFECT this capability's own SDET found (FactsPanel.test.tsx:
// "does not crash when a docked fleet's cargo includes fuel"):
// `RESOURCE_ACCENT[kind]` indexed with `kind: 'fuel'` is `undefined`, so the
// old `.meter`/`.dot` access threw for ANY fleet holding fuel — which, after
// spawn's starting fuel, is every fleet immediately. `accentFor` closes that
// gap with its own named accent, falling back to a neutral tone for any
// future non-`ResourceKind` cargo entry rather than throwing.
const FUEL_ACCENT = { dot: 'bg-cyan-300', meter: 'bg-cyan-300/80' }
const DEFAULT_ACCENT = { dot: 'bg-zinc-400', meter: 'bg-zinc-400/80' }
function accentFor(kind: string): { dot: string; meter: string } {
  if (kind === 'fuel') return FUEL_ACCENT
  return RESOURCE_ACCENT[kind as ResourceKind] ?? DEFAULT_ACCENT
}

// HoldReadout — the fleet's cargo picture: used/total capacity over a
// stacked fill meter (one colour-coded segment per kind), tons by kind with
// matching dots, and the free hold remainder — straight off the owner-only
// roster block the fleet read serves.
function HoldReadout({ roster }: { roster: FleetRoster }) {
  const entries = Object.entries(roster.cargo ?? {}).filter(([, tons]) => tons > 0) as [
    string,
    number,
  ][]
  const used = roster.cargoCapacity - roster.freeHold
  return (
    <div data-testid="hold-readout" className="mt-2">
      <div className="flex justify-between font-mono text-[11px] tracking-wide text-zinc-400 uppercase">
        <span>Hold</span>
        <span data-testid="hold-capacity">
          {formatTons(used)} / {formatTons(roster.cargoCapacity)}t
        </span>
      </div>
      <div className="mt-1.5 flex h-1 gap-px overflow-hidden rounded-full bg-white/10">
        {entries.map(([kind, tons]) => (
          <div
            key={kind}
            className={accentFor(kind).meter}
            style={{ width: `${(tons / roster.cargoCapacity) * 100}%` }}
          />
        ))}
      </div>
      {entries.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {entries.map(([kind, tons]) => (
            <li
              key={kind}
              data-testid={`hold-${kind}`}
              className="flex items-center justify-between font-mono text-xs text-zinc-300"
            >
              <span className="flex items-center gap-1.5 capitalize">
                <span className={`size-1.5 rounded-full ${accentFor(kind).dot}`} />
                {kind}
              </span>
              <span>{formatTons(tons)}t</span>
            </li>
          ))}
          <li
            data-testid="hold-free"
            className="flex justify-between font-mono text-xs text-zinc-500"
          >
            <span>free hold</span>
            <span>{formatTons(roster.freeHold)}t</span>
          </li>
        </ul>
      )}
    </div>
  )
}

// MineSection — the extraction verb's offer on the fleet card (#0010 "Mine
// Offer on the Docked Fleet"): pick a kind from what the player can SEE on
// the docked feature, size the run in tons, and preview eta = tons ÷ the
// fleet's SERVED mining rate.
function MineSection({
  feature,
  roster,
  pending,
  onMine,
}: {
  feature: BoardFeature
  roster: FleetRoster
  pending: boolean
  onMine: (kind: ResourceKind, tons: number) => void
}) {
  const resources = feature.resources ?? []
  const richest = resources.reduce((a, b) => (b.richness > a.richness ? b : a), resources[0])
  const [kind, setKind] = useState<ResourceKind>(richest.kind)
  const [tons, setTons] = useState<number>(Math.max(0, roster.freeHold))
  const clampTons = (v: number) => Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), roster.freeHold)

  const committable = tons > 0 && !pending
  const previewMs = roster.miningRate > 0 ? tons / roster.miningRate : null

  return (
    <div data-testid="mine-section" className="mt-3 border-t border-dashed border-white/15 pt-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
          Mine this body
        </span>
        <Badge color="amber">DOCKED</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {resources.map((r) => {
          const selected = r.kind === kind
          return (
            <button
              key={r.kind}
              type="button"
              data-testid={`mine-kind-${r.kind}`}
              aria-pressed={selected}
              onClick={() => setKind(r.kind)}
              className={`rounded-full border px-2.5 py-1 font-mono text-xs transition-colors ${
                selected
                  ? 'border-amber-400/60 bg-amber-400/10 text-amber-300'
                  : 'border-white/15 text-zinc-400 hover:border-white/30 hover:text-zinc-200'
              }`}
            >
              {r.kind}{' '}
              <span className={selected ? 'text-amber-400/80' : 'text-zinc-500'}>
                {Math.round(r.richness * 100)}%
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="relative flex-1">
          <Input
            data-testid="mine-tons-input"
            type="number"
            min={0}
            max={roster.freeHold}
            value={tons}
            onChange={(e) => setTons(clampTons(Number(e.target.value)))}
            aria-label="Tons to extract"
            className="[&_input]:pr-7 [&_input]:text-right [&_input]:font-mono"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 z-10 flex items-center font-mono text-xs text-zinc-500">
            t
          </span>
        </span>
        <Button
          plain
          data-testid="mine-fill-hold"
          disabled={pending}
          onClick={() => setTons(Math.max(0, roster.freeHold))}
          className="!px-1.5 !text-xs !text-zinc-400 hover:!text-amber-300"
        >
          Fill hold
        </Button>
      </div>
      <div className="mt-2 flex items-baseline justify-between font-mono text-xs text-zinc-400">
        {previewMs !== null ? (
          <>
            <span data-testid="mine-rate">at {formatTons(roster.miningRate * 60_000)} t/min</span>
            <span data-testid="mine-eta">
              ETA <span className="font-semibold text-white">{etaLabel(previewMs)}</span>
            </span>
          </>
        ) : (
          <span data-testid="mine-eta">no extractors</span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button
          data-testid="mine-button"
          color="amber"
          disabled={!committable}
          onClick={() => onMine(kind, tons)}
        >
          Mine
        </Button>
        <p className="text-[11px] leading-snug text-zinc-500">
          The server&apos;s ETA is the one that counts.
        </p>
      </div>
    </div>
  )
}

// formatTons keeps fractional holds readable without noise: whole numbers stay
// whole, fractions keep one decimal.
function formatTons(t: number): string {
  return Number.isInteger(t) ? String(t) : t.toFixed(1)
}

function FeatureFacts({ feature, worldTime }: { feature: BoardFeature; worldTime: number }) {
  const fog = FOG_TREATMENT[feature.band]
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white capitalize">
          {feature.type.replace('_', ' ')}
        </span>
        <Badge color={feature.band === 'visible' ? 'green' : feature.band === 'remembered' ? 'amber' : 'zinc'}>
          {fog.label}
        </Badge>
      </div>
      {feature.band === 'remembered' && feature.asOf !== undefined && (
        <p className="mt-1 text-[11px] text-zinc-500">
          last seen {etaLabel(Math.max(0, worldTime - feature.asOf))} ago
        </p>
      )}
      {feature.resources && feature.resources.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {feature.resources.map((r) => (
            <li key={r.kind} className="flex justify-between font-mono text-xs text-zinc-300">
              <span className="capitalize">{r.kind}</span>
              <span>{Math.round(r.richness * 100)}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] text-zinc-500">
          {feature.band === 'astronomical' ? 'Composition unknown — scan to reveal.' : 'No lodes detected.'}
        </p>
      )}
    </div>
  )
}
