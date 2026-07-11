'use client'

// FactsPanel — the board's right-hand inspector + command surface (#0007). It
// shows the system header, the acting (own) fleet with its verbs (scan / cancel),
// and whatever is selected — a body (type, fog band, worth where earned), a fleet,
// or a bare tile — with the move commit + its previewed ETA. It reads the plan the
// container recomputes each frame, so a led-intercept ETA ticks as the world turns.
//
// Toasts live here (component), not in the hooks (#frontend/CLAUDE.md).

import { Button } from '@/components/catalyst/button'
import { Badge } from '@/components/catalyst/badge'
import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import type { Hex } from '@/lib/hex'
import type { BoardFeature, LaneGate } from '@/lib/types/system-board'
import type { Fleet, RoutePreview } from '@/lib/types/fleet'
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
  plan: MovePlan | null
  worldTime: number
  pending: boolean
  route: RouteState | null
  onMove: () => void
  onScan: () => void
  onCancel: () => void
  onDepart: () => void
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
  plan,
  worldTime,
  pending,
  route,
  onMove,
  onScan,
  onCancel,
  onDepart,
}: FactsPanelProps) {
  const burning = activeFleet?.state.mode === 'burn'
  const canMoveToSelection = !!activeFleet && (selection?.kind === 'feature' || selection?.kind === 'hex')
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
            <Badge color={burning ? 'amber' : activeFleet.state.mode === 'docked' ? 'green' : 'cyan'}>
              {activeFleet.state.mode}
            </Badge>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              data-testid="scan-button"
              color="cyan"
              disabled={pending || burning}
              onClick={onScan}
            >
              Scan
            </Button>
            {burning && (
              <Button data-testid="cancel-button" outline disabled={pending} onClick={onCancel}>
                Cancel burn
              </Button>
            )}
          </div>
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
            {selection.fleet.own ? 'Your fleet' : 'Foreign contact'} — {selection.fleet.state.mode}
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
        {!selection && <Text className="!text-zinc-500">Select a body, tile, or gate.</Text>}

        {canMoveToSelection && plan && (
          <div className="mt-3 flex items-center gap-3">
            <Button data-testid="move-button" color="cyan" disabled={pending} onClick={onMove}>
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
