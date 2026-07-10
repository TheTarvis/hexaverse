'use client'

// SystemBoardView — the container the /systems/[systemId] route renders (#0007).
//
// For this slice it wires the fogged interior read (useSystemBoard) into the
// SVG HexBoard: a star-centred hex lattice at the system's radius, full-bleed,
// with a lightweight facts chip (the seed of the spike's KNOWN FACTS panel).
// Glyph / fog / selection-preview layers and the verb gestures slot in above
// the lattice on later slices; pan/zoom upgrades HexBoard in place.

import { Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { useSystemBoard } from '@/hooks/use-system-board'
import { HexBoard } from './HexBoard'

const PANEL =
  'pointer-events-auto rounded-xl border border-zinc-200 bg-zinc-50/90 p-4 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]'

const STAGE = 'relative h-dvh w-full overflow-hidden bg-[#05070d]'

export interface SystemBoardViewProps {
  systemId: string
}

export function SystemBoardView({ systemId }: SystemBoardViewProps) {
  const { data: board, isLoading, isError, error } = useSystemBoard(systemId)

  if (isLoading) {
    return (
      <div data-testid="system-board-view" className={STAGE}>
        <div className="absolute inset-0 grid place-items-center text-sm text-white/50">
          Charting the system…
        </div>
      </div>
    )
  }

  if (isError || !board) {
    return (
      <div data-testid="system-board-view" className={`${STAGE} grid place-items-center px-6`}>
        <div className={PANEL}>
          <Subheading className="!text-white">Couldn’t load the system</Subheading>
          <Text className="mt-1 !text-zinc-400">
            {error?.message ?? 'The interior read failed. Try again shortly.'}
          </Text>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="system-board-view" className={STAGE}>
      <HexBoard radius={board.radius} />

      {/* Overlay layer — the chip catches pointer events; the gap lets board
          clicks through (glyph/selection layers land above the lattice later). */}
      <div className="pointer-events-none absolute inset-0 flex justify-between gap-4 p-4">
        <FactsChip
          character={board.character}
          starClass={board.starClass}
          radius={board.radius}
          featureCount={board.features.length}
        />
      </div>
    </div>
  )
}

function FactsChip({
  character,
  starClass,
  radius,
  featureCount,
}: {
  character: string
  starClass: string
  radius: number
  featureCount: number
}) {
  return (
    <aside
      data-testid="system-facts"
      className={`${PANEL} flex w-64 max-w-[80vw] flex-col gap-3 self-start`}
    >
      <div>
        <Subheading className="!text-base !text-white">Class {starClass} system</Subheading>
        <p className="mt-0.5 font-mono text-[11px] tracking-wide text-zinc-400 uppercase">
          {character.replace('_', ' ')}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Fact label="Radius" value={radius} />
        <Fact label="Bodies" value={featureCount} />
      </dl>
    </aside>
  )
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-100/60 px-3 py-2 dark:border-zinc-800/50 dark:bg-black/20">
      <dd className="font-mono text-xl leading-none text-white">{value}</dd>
      <dt className="mt-1 text-[11px] tracking-wide text-zinc-400 uppercase">{label}</dt>
    </div>
  )
}

export default SystemBoardView
