'use client'

// FactsPanel — the board's right-hand inspector + command surface (#0007). It
// shows the system header, the acting (own) fleet with its verbs (scan / cancel),
// and whatever is selected — a body (type, fog band, worth where earned), a fleet,
// or a bare tile — with the move commit + its previewed ETA. It reads the plan the
// container recomputes each frame, so a led-intercept ETA ticks as the world turns.
//
// Toasts live here (component), not in the hooks (#frontend/CLAUDE.md).

import { useState } from 'react'
import { Button } from '@/components/catalyst/button'
import { Badge } from '@/components/catalyst/badge'
import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Input } from '@/components/catalyst/input'
import { stateAt, type Hex } from '@/lib/hex'
import type { BoardFeature, LaneGate, ResourceKind } from '@/lib/types/system-board'
import type { Fleet, FleetRoster, RoutePreview } from '@/lib/types/fleet'
import { etaLabel, type MovePlan } from './move-preview'
import { FOG_TREATMENT } from './board-palette'

export type BoardSelection =
  | { kind: 'feature'; feature: BoardFeature }
  | { kind: 'hex'; hex: Hex }
  | { kind: 'fleet'; fleet: Fleet }
  | { kind: 'gate'; gate: LaneGate }
  | null

// The route-preview query state the depart section reads (a subset of the
// useRoutePreview result) — a 422 no-charted-route surfaces as `isError`.
export interface RouteState {
  isLoading: boolean
  isError: boolean
  data?: RoutePreview
}

export interface FactsPanelProps {
  starClass: string
  character: string
  radius: number
  featureCount: number
  selection: BoardSelection
  activeFleet: Fleet | null
  // The feature the acting fleet is currently docked to (resolved by the
  // container from the interior read), or null. The mine offer anchors here —
  // a fleet can only mine what it's docked to, so no selection is involved
  // (add-mine-ui "Mine Offer on the Docked Fleet").
  dockedFeature?: BoardFeature | null
  plan: MovePlan | null
  worldTime: number
  pending: boolean
  // The running scan's frozen eta (null when no scan is in flight) — drives the
  // Scanning… countdown and blocks a second scan (#0006 Decision #19).
  scanEta?: number | null
  // The running mine's frozen eta (null when no run is in flight) — the
  // movement channel's busy signal: gates move + mine, never scan (#0010,
  // add-mine-ui "Running Mine Gates the Movement Channel").
  mineEta?: number | null
  route: RouteState | null
  onMove: () => void
  onScan: () => void
  // Commit a mine run against the docked feature; the panel owns the
  // kind/tonnage choice, the container owns the featureId (the dock parent).
  onMine: (kind: ResourceKind, tons: number) => void
  // Cancel the running mine via the generic #0005 action endpoint.
  onCancelMine: () => void
  // Hover/focus intent on the Scan verb — the parent shows the aim-corridor
  // overlay only while the player is actually considering a scan, so clicking
  // around to plan a burn stays visually quiet.
  onScanPreview?: (show: boolean) => void
  // The playtest FX toggle: which effect a running scan renders — the radial
  // ping (the slice mechanic's picture) or the arc-scan (kept as a future
  // variant's look). Absent → no toggle shown.
  scanFx?: 'ping' | 'arc'
  onToggleScanFx?: () => void
  onCancel: () => void
  onDepart: () => void
  // Whether the board's rendering context is live (add-renderer-availability-states,
  // tasks.md 2.2b) — defaults to true so every existing caller is unaffected.
  // false while the board's canvas region shows the unsupported/interrupted
  // state: the empty-selection prompt stops inviting a selection on a canvas
  // that doesn't exist, and `scan-fx-toggle` (2.2c) — a canvas-only control —
  // is disabled, since it only switches which effect the board draws.
  available?: boolean
}

const PANEL =
  'pointer-events-auto flex w-72 max-w-[80vw] flex-col gap-4 self-start rounded-xl border border-zinc-200 bg-zinc-50/90 p-4 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]'

export function FactsPanel({
  starClass,
  character,
  radius,
  featureCount,
  selection,
  activeFleet,
  dockedFeature = null,
  plan,
  worldTime,
  pending,
  scanEta = null,
  mineEta = null,
  route,
  onMove,
  onScan,
  onMine,
  onCancelMine,
  onScanPreview,
  scanFx,
  onToggleScanFx,
  onCancel,
  onDepart,
  available = true,
}: FactsPanelProps) {
  // Mode reads off the EFFECTIVE state (stateAt): a burn whose arrival passed is
  // already docked/coasting, so the badge and verb gates don't lag the picture.
  const effectiveState = activeFleet ? stateAt(activeFleet.state, worldTime) : null
  const activeMode = effectiveState?.mode
  const burning = activeMode === 'burn'
  const canMoveToSelection = !!activeFleet && (selection?.kind === 'feature' || selection?.kind === 'hex')
  // The scan is a 360° sweep (#0006 Decision #21) — one manual trigger, no
  // aim. Burning does NOT gate it: movement and sensing are separate channels
  // (#0006 Decision #19). One scan at a time, though — a running scan holds
  // the sensor slot until eta.
  const scanning = scanEta !== null && scanEta > worldTime
  const scanSecondsLeft = scanning ? Math.max(1, Math.ceil((scanEta - worldTime) / 1000)) : 0
  // A running mine holds the MOVEMENT slot until eta (#0010): move + mine gate
  // on it, scan doesn't. Past-eta entries stop gating by world time alone —
  // the refetch that resolves them lands via the board's realtime rules.
  const mining = mineEta !== null && mineEta > worldTime
  const mineSecondsLeft = mining ? Math.max(1, Math.ceil((mineEta - worldTime) / 1000)) : 0
  // Mine anchors to the DOCKED state, never a selection (add-mine-ui "Mine
  // Offer on the Docked Fleet"): the fleet can only mine what it's docked to,
  // and its own glyph occludes that body on the board. Offered while docked
  // at a body with visible resources and the movement channel is free.
  const docked = effectiveState?.mode === 'docked'
  const mineable =
    docked && !!dockedFeature?.resources?.length && !!activeFleet?.roster && !mining && !burning
  return (
    <aside data-testid="facts-panel" className={PANEL}>
      <div>
        <Subheading className="!text-base !text-white">Class {starClass} system</Subheading>
        <p className="mt-0.5 font-mono text-[11px] tracking-wide text-zinc-400 uppercase">
          {character.replace('_', ' ')} · radius {radius} · {featureCount} bodies
        </p>
      </div>

      {activeFleet && (
        <section data-testid="active-fleet" className="border-t border-white/10 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Your fleet</span>
            <Badge color={burning ? 'amber' : activeMode === 'docked' ? 'green' : 'cyan'}>
              {activeMode}
            </Badge>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              data-testid="scan-button"
              color="cyan"
              disabled={pending || scanning}
              onClick={onScan}
              onMouseEnter={() => onScanPreview?.(true)}
              onMouseLeave={() => onScanPreview?.(false)}
              onFocus={() => onScanPreview?.(true)}
              onBlur={() => onScanPreview?.(false)}
            >
              {scanning ? 'Scanning…' : 'Scan'}
            </Button>
            {burning && (
              <Button data-testid="cancel-button" outline disabled={pending} onClick={onCancel}>
                Cancel burn
              </Button>
            )}
          </div>
          {scanning ? (
            <p data-testid="scan-countdown" className="mt-2 text-[11px] text-cyan-300/80">
              Sensors sweeping — resolves in {scanSecondsLeft}s.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-zinc-400">
              Sweeps 360° from your position — large bodies shadow what’s behind them.
            </p>
          )}
          {mining && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <p data-testid="mine-countdown" className="text-[11px] text-amber-300/80">
                Extractors running — resolves in {mineSecondsLeft}s.
              </p>
              <Button
                data-testid="cancel-mine-button"
                plain
                disabled={pending}
                onClick={onCancelMine}
                className="!px-1 !py-0 !text-[11px] !text-zinc-400 hover:!text-amber-300"
              >
                Cancel
              </Button>
            </div>
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
          {scanFx && onToggleScanFx && (
            <Button
              plain
              disabled={!available}
              data-testid="scan-fx-toggle"
              onClick={onToggleScanFx}
              className="mt-1 !px-0 !py-0 !font-mono !text-[10px] tracking-wide !text-zinc-500 uppercase hover:!text-cyan-300"
            >
              scan fx: {scanFx === 'arc' ? 'arc-scan' : 'radial ping'} ⇄
            </Button>
          )}
        </section>
      )}

      <section data-testid="selection" className="border-t border-white/10 pt-3">
        {selection?.kind === 'feature' && (
          <FeatureFacts feature={selection.feature} worldTime={worldTime} />
        )}
        {selection?.kind === 'hex' && (
          <Text className="!text-zinc-300">
            Tile {selection.hex.q}, {selection.hex.r}
          </Text>
        )}
        {selection?.kind === 'fleet' && (
          <Text className="!text-zinc-300">
            {selection.fleet.own ? 'Your fleet' : 'Foreign contact'} —{' '}
            {stateAt(selection.fleet.state, worldTime).mode}
          </Text>
        )}
        {selection?.kind === 'gate' && (
          <GateFacts
            gate={selection.gate}
            hasFleet={!!activeFleet}
            route={route}
            worldTime={worldTime}
            pending={pending}
            onDepart={onDepart}
          />
        )}
        {!selection && available && (
          <Text data-testid="selection-prompt" className="!text-zinc-500">
            Select a body, tile, or gate.
          </Text>
        )}
        {!selection && !available && (
          <Text data-testid="selection-prompt" className="!text-zinc-500">
            The board must be available to choose a move or departure target.
          </Text>
        )}

        {canMoveToSelection && plan && (
          <div className="mt-3 flex items-center gap-3">
            <Button data-testid="move-button" color="cyan" disabled={pending || mining} onClick={onMove}>
              {selection?.kind === 'feature' ? 'Intercept' : 'Move here'}
            </Button>
            <span data-testid="move-eta" className="font-mono text-xs text-zinc-400">
              {plan.tiles} hex · ETA {etaLabel(plan.etaMs)}
            </span>
          </div>
        )}
        {canMoveToSelection && !plan && (
          <p data-testid="core-blocked" className="mt-3 text-[11px] text-zinc-500">
            The star can’t be a destination — you can’t fly onto the core or dock a sun.
          </p>
        )}
      </section>
    </aside>
  )
}

// GateFacts is the board-tier depart gesture (#0008): a selected rim gate shows
// its charted route (per-leg + total ETA) and offers Depart, mirroring the galaxy
// view's TravelSection. Leg 0 (the in-system burn to this gate) rides in the trip
// action server-side; the on-board dashed overlay draws it, so the panel shows the
// journey past the gate. A no-charted-route destination surfaces as `route.isError`.
function GateFacts({
  gate,
  hasFleet,
  route,
  worldTime,
  pending,
  onDepart,
}: {
  gate: LaneGate
  hasFleet: boolean
  route: RouteState | null
  worldTime: number
  pending: boolean
  onDepart: () => void
}) {
  return (
    <div data-testid="gate-facts">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">Lane gate</span>
        <Badge color="sky">DEPART</Badge>
      </div>
      <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-400">→ {gate.destSystemId}</p>

      {!hasFleet && (
        <p className="mt-3 text-[11px] text-zinc-500">Bring a fleet here to depart through this gate.</p>
      )}

      {hasFleet && route?.isLoading && <p className="mt-3 text-sm text-zinc-400">Plotting a route…</p>}

      {hasFleet && route?.isError && (
        <p data-testid="gate-no-route" className="mt-3 text-sm text-amber-400">
          No charted route this way. Explore toward it first.
        </p>
      )}

      {hasFleet && route?.data && (
        <div className="mt-3 flex flex-col gap-2">
          <ul className="flex flex-col gap-0.5">
            {route.data.route.slice(1).map((sysId, i) => (
              <li
                key={sysId}
                className="flex items-center justify-between rounded-md border border-zinc-800/50 bg-black/20 px-2.5 py-1 text-sm text-white"
              >
                <span className="truncate font-mono text-xs">
                  <span className="text-zinc-500">{i + 1}.</span> {sysId}
                </span>
                <span className="font-mono text-xs text-zinc-400">
                  {etaLabel(Math.max(0, route.data!.legEtas[i + 1] - worldTime))}
                </span>
              </li>
            ))}
          </ul>
          <Button
            data-testid="depart-button"
            color="sky"
            disabled={pending}
            onClick={onDepart}
            className="w-full"
          >
            {`Depart · ${etaLabel(Math.max(0, route.data.totalEta - worldTime))}`}
          </Button>
        </div>
      )}
    </div>
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

// HoldReadout — the fleet's cargo picture (#0010 "Fleet Panel Hold Readout"):
// used/total capacity over a stacked fill meter (one colour-coded segment per
// kind), tons by kind with matching dots, and the free hold remainder —
// straight off the owner-only roster block the fleet read serves. Kinds at
// zero are absent from `cargo`, so an empty hold renders as the bare capacity
// line over an empty track.
function HoldReadout({ roster }: { roster: FleetRoster }) {
  const entries = Object.entries(roster.cargo ?? {}).filter(([, tons]) => tons > 0) as [
    ResourceKind,
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
            className={RESOURCE_ACCENT[kind].meter}
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
                <span className={`size-1.5 rounded-full ${RESOURCE_ACCENT[kind].dot}`} />
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
// the docked feature (fog decides the menu — richness-labelled chips, richest
// preselected), size the run in tons (default: fill the hold; clamped to the
// free hold — the lode's truth stays server-side, the honest outcome reports
// any shortfall), and preview eta = tons ÷ the fleet's SERVED mining rate.
// Keyed by feature id so re-docking elsewhere resets it.
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
  // The input clamps as it changes — never over the free hold, never negative
  // (the lode-side clamp stays server-side; its outcome reports shortfalls).
  const clampTons = (v: number) => Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), roster.freeHold)

  const committable = tons > 0 && !pending
  // Advisory only — the commit's frozen server ETA drives the countdown.
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
