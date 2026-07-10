'use client'

// GalaxyView — the container the home page renders (spec #0002).
//
// Composes the three.js <GalaxyGraph> renderer with two Catalyst overlays:
//  - LEFT  intel panel: galaxy / player summary + stat tiles (system count,
//          region breakdown with colored dots, lane count) and a live-vs-frozen
//          badge (isStartArea).
//  - RIGHT inspector: empty state until a node is selected, then name / region /
//          connections + the major-body skeleton (ALWAYS visible, never gated by
//          `discovered` — spec Decision #7).
//
// The heavy, three-dependent renderer is pulled in via next/dynamic({ssr:false})
// so three.js stays off the SSR/initial-render path entirely.

import dynamic from 'next/dynamic'
import { useMemo, useRef, useState } from 'react'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Button } from '@/components/catalyst/button'
import { Text, TextLink, Strong } from '@/components/catalyst/text'
import { useGalaxy } from '@/hooks/use-galaxy'
import type { Galaxy, GalaxyNode, Region } from '@/lib/types/galaxy'
import { REGION_PALETTE, REGIONS, regionColor } from './region-palette'
import type { GalaxyGraphController } from './GalaxyGraph'

// Client-only: GalaxyGraph statically imports `three` (and the camera rig), so
// importing it lazily keeps that weight off the SSR path (spec Design details →
// Library / Bundle). ssr:false because three needs `document`/WebGL.
const GalaxyGraph = dynamic(() => import('./GalaxyGraph').then((m) => m.GalaxyGraph), {
  ssr: false,
  loading: () => <GraphFallback label="Loading renderer…" />,
})

function GraphFallback({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center text-sm text-white/50">{label}</div>
  )
}

// A colored region dot — the ONE raw-value colour exception (region-palette).
function RegionDot({ region }: { region: Region }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full ring-1 ring-white/20"
      style={{ backgroundColor: regionColor(region) }}
    />
  )
}

const PANEL =
  'pointer-events-auto rounded-xl border border-zinc-200 bg-zinc-50/90 p-4 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]'

export function GalaxyView() {
  const { data: galaxy, isLoading, isError, error, isStartArea } = useGalaxy()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const controllerRef = useRef<GalaxyGraphController | null>(null)

  // Per-system lane (connection) counts and region tallies, derived once.
  const { laneCountById, regionCounts } = useMemo(() => {
    const laneCountById = new Map<string, number>()
    const regionCounts = new Map<Region, number>()
    if (galaxy) {
      for (const l of galaxy.links) {
        laneCountById.set(l.source, (laneCountById.get(l.source) ?? 0) + 1)
        laneCountById.set(l.target, (laneCountById.get(l.target) ?? 0) + 1)
      }
      for (const n of galaxy.nodes) {
        regionCounts.set(n.region, (regionCounts.get(n.region) ?? 0) + 1)
      }
    }
    return { laneCountById, regionCounts }
  }, [galaxy])

  const selected = useMemo(
    () => (galaxy && selectedId ? (galaxy.nodes.find((n) => n.id === selectedId) ?? null) : null),
    [galaxy, selectedId],
  )

  const handleRecenter = () => controllerRef.current?.recenter()

  if (isLoading) {
    return (
      <div className="relative h-dvh w-full overflow-hidden bg-[#05070d]">
        <GraphFallback label="Charting the galaxy…" />
      </div>
    )
  }

  if (isError || !galaxy) {
    return (
      <div className="relative grid h-dvh w-full place-items-center overflow-hidden bg-[#05070d] px-6">
        <div className={PANEL}>
          <Subheading className="!text-white">Couldn’t load the galaxy</Subheading>
          <Text className="mt-1 !text-zinc-400">
            {error?.message ?? 'The galaxy read failed. Try again shortly.'}
          </Text>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#05070d]">
      <GalaxyGraph
        galaxy={galaxy}
        selectedId={selectedId}
        onSelect={(node) => setSelectedId(node?.id ?? null)}
        onReady={(controller) => {
          controllerRef.current = controller
        }}
      />

      {/* Overlay layer — panels catch pointer events, the gap between lets the
          graph receive orbit/pan/zoom/clicks. */}
      <div className="pointer-events-none absolute inset-0 flex justify-between gap-4 p-4">
        <IntelPanel
          galaxy={galaxy}
          isStartArea={isStartArea}
          regionCounts={regionCounts}
          onRecenter={handleRecenter}
        />
        <Inspector node={selected} connections={selected ? (laneCountById.get(selected.id) ?? 0) : 0} />
      </div>
    </div>
  )
}

// ---- Left intel panel ----

function IntelPanel({
  galaxy,
  isStartArea,
  regionCounts,
  onRecenter,
}: {
  galaxy: Galaxy
  isStartArea: boolean
  regionCounts: Map<Region, number>
  onRecenter: () => void
}) {
  return (
    <aside
      data-testid="intel-panel"
      className={`${PANEL} flex w-72 max-w-[80vw] flex-col gap-4 self-start`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <Heading level={2} className="!text-base !text-white">
            {isStartArea ? 'Start Area' : 'Live Galaxy'}
          </Heading>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
            {isStartArea ? 'Frozen · read-only' : 'Live · your galaxy'}
          </p>
        </div>
        <Button
          plain
          onClick={onRecenter}
          data-testid="galaxy-recenter"
          title="Recenter the view"
          aria-label="Recenter"
          className="!text-lg !text-white"
        >
          ⌖
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Systems" value={galaxy.nodes.length} />
        <StatTile label="Lanes" value={galaxy.links.length} />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium tracking-wide text-zinc-400 uppercase">Regions</p>
        <ul className="flex flex-col gap-1.5">
          {REGIONS.filter((r) => (regionCounts.get(r) ?? 0) > 0).map((r) => (
            <li key={r} className="flex items-center justify-between text-sm text-white">
              <span className="flex items-center gap-2">
                <RegionDot region={r} />
                {REGION_PALETTE[r].label}
              </span>
              <span className="font-mono text-zinc-400">{regionCounts.get(r) ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>

      {isStartArea && (
        <div
          data-testid="signin-prompt"
          className="rounded-lg border border-zinc-200 bg-zinc-100/70 p-3 dark:border-zinc-800/50 dark:bg-black/30"
        >
          <Text className="!text-xs !text-zinc-300">
            You’re exploring the frozen start area. <Strong className="!text-white">Sign in</Strong>{' '}
            to command a fleet and claim a system.
          </Text>
          <TextLink href="/login" className="mt-1 inline-block text-xs !text-sky-400">
            Sign in →
          </TextLink>
        </div>
      )}
    </aside>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-100/60 px-3 py-2 dark:border-zinc-800/50 dark:bg-black/20">
      <div className="font-mono text-xl leading-none text-white">{value}</div>
      <div className="mt-1 text-[11px] tracking-wide text-zinc-400 uppercase">{label}</div>
    </div>
  )
}

// ---- Right inspector ----

function Inspector({ node, connections }: { node: GalaxyNode | null; connections: number }) {
  if (!node) {
    return (
      <aside
        data-testid="inspector"
        className={`${PANEL} flex w-72 max-w-[80vw] flex-col self-start`}
      >
        <p className="text-sm text-zinc-400">
          Select a system to inspect its star, bodies, and lanes.
        </p>
      </aside>
    )
  }

  return (
    <aside data-testid="inspector" className={`${PANEL} flex w-72 max-w-[80vw] flex-col gap-3 self-start`}>
      <div>
        <Heading level={2} data-testid="inspector-name" className="!text-base !text-white">
          {node.name}
        </Heading>
        <p
          data-testid="inspector-region"
          className="mt-1 flex items-center gap-2 text-sm text-zinc-300"
        >
          <RegionDot region={node.region} />
          {REGION_PALETTE[node.region].label}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-zinc-200 bg-zinc-100/60 px-3 py-2 dark:border-zinc-800/50 dark:bg-black/20">
          <dt className="text-[11px] tracking-wide text-zinc-400 uppercase">Lanes</dt>
          <dd className="font-mono text-white">{connections}</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-100/60 px-3 py-2 dark:border-zinc-800/50 dark:bg-black/20">
          <dt className="text-[11px] tracking-wide text-zinc-400 uppercase">Star</dt>
          <dd className="font-mono text-white">Class {node.skeleton.starClass}</dd>
        </div>
      </dl>

      {/* Major-body skeleton — the free astronomical layer, ALWAYS shown
          (spec Decision #7); never gated by `discovered`. */}
      <div>
        <p className="mb-1.5 text-xs font-medium tracking-wide text-zinc-400 uppercase">
          Major bodies
        </p>
        {node.skeleton.bodies.length === 0 ? (
          <p className="text-sm text-zinc-500">No major bodies.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {node.skeleton.bodies.map((b, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-100/50 px-2.5 py-1.5 text-sm text-white dark:border-zinc-800/50 dark:bg-black/20"
              >
                <span className="capitalize">{b.type.replace('_', ' ')}</span>
                <span className="font-mono text-xs text-zinc-400">ring {b.ring}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!node.discovered && (
        <p className="text-xs text-zinc-500 italic">Undiscovered — survey to reveal detail.</p>
      )}
    </aside>
  )
}

export default GalaxyView
