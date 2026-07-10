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
import type { BoardFeature } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import { etaLabel, type MovePlan } from './move-preview'
import { FOG_TREATMENT } from './board-palette'

export type BoardSelection =
  | { kind: 'feature'; feature: BoardFeature }
  | { kind: 'hex'; hex: Hex }
  | { kind: 'fleet'; fleet: Fleet }
  | null

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
  onMove: () => void
  onScan: () => void
  onCancel: () => void
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
  onMove,
  onScan,
  onCancel,
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
        {!selection && <Text className="!text-zinc-500">Select a body or tile.</Text>}

        {canMoveToSelection && (
          <div className="mt-3 flex items-center gap-3">
            <Button data-testid="move-button" color="cyan" disabled={pending} onClick={onMove}>
              {selection?.kind === 'feature' ? 'Intercept' : 'Move here'}
            </Button>
            {plan && (
              <span data-testid="move-eta" className="font-mono text-xs text-zinc-400">
                {plan.tiles} hex · ETA {etaLabel(plan.etaMs)}
              </span>
            )}
          </div>
        )}
      </section>
    </aside>
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
