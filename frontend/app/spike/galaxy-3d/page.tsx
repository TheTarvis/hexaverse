'use client'

// SPIKE (throwaway) — 3D variant of /spike/galaxy. Same mock data + glass panels,
// but rendered with react-force-graph-3d so you can ORBIT and read depth/distance.
// The glow is preserved WITHOUT shaders: the 2D radial gradient is baked into a
// sprite texture and drawn with additive blending (near nodes render larger →
// natural depth cue). Route: /spike/galaxy-3d

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import * as THREE from 'three'
import { generateMockGalaxy, type MockSystem, type Region } from './mock-galaxy'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false }) as any

const REGION: Record<Region, { label: string; color: string }> = {
  star_rich: { label: 'Star-rich', color: '#ffd27d' },
  normal: { label: 'Normal', color: '#7dd3fc' },
  dead: { label: 'Dead zone', color: '#8b98a9' },
  barrier: { label: 'Barrier', color: '#f472b6' },
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// Lazy singleton glow texture (client-only — needs document). The SAME radial
// gradient as the 2D spike, baked once and tinted per node via material.color.
let _glow: THREE.Texture | null = null
function glowTexture(): THREE.Texture {
  if (_glow) return _glow
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.14, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.18)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = new THREE.Texture(c)
  t.needsUpdate = true
  _glow = t
  return t
}

type GraphNode = MockSystem & { fx?: number; fy?: number; fz?: number }

export default function Galaxy3DSpikePage() {
  const galaxy = useMemo(() => generateMockGalaxy(), [])
  const [selected, setSelected] = useState<MockSystem | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<{ zoomToFit: (ms: number, px: number) => void } | null>(null)

  // Pin nodes to their generated 3D positions so orbit reveals the real spatial
  // structure (flattened disk, clusters, seam) rather than a re-solved layout.
  const graphData = useMemo(
    () => ({
      nodes: galaxy.systems.map((s) => ({ ...s, fx: s.x, fy: s.y, fz: s.z })) as GraphNode[],
      links: galaxy.lanes.map((l) => ({ ...l })),
    }),
    [galaxy],
  )

  const adjacency = useMemo(() => {
    const byId = new Map(galaxy.systems.map((s) => [s.id, s]))
    const map = new Map<string, MockSystem[]>()
    for (const s of galaxy.systems) map.set(s.id, [])
    for (const l of galaxy.lanes) {
      const a = byId.get(l.source)
      const b = byId.get(l.target)
      if (a && b) {
        map.get(a.id)!.push(b)
        map.get(b.id)!.push(a)
      }
    }
    return map
  }, [galaxy])

  const stats = useMemo(() => {
    const counts: Record<Region, number> = { star_rich: 0, normal: 0, dead: 0, barrier: 0 }
    let discovered = 0
    for (const s of galaxy.systems) {
      counts[s.region]++
      if (s.discovered) discovered++
    }
    return { total: galaxy.systems.length, lanes: galaxy.lanes.length, counts, discovered }
  }, [galaxy])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(700, 90), 400)
    return () => clearTimeout(t)
  }, [size.w, size.h])

  const makeNode = (node: GraphNode) => {
    const dim = node.discovered ? 1 : 0.16
    const color = REGION[node.region].color
    const group = new THREE.Group()

    // soft halo (additive, low opacity so dense clusters don't blow to white)
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color(color),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.4 * dim,
      }),
    )
    const hs = (2 + node.val * 1.5) * 4
    halo.scale.set(hs, hs, 1)

    // crisp bright core (keeps each system a distinct point)
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.95 * dim,
      }),
    )
    const cs = (1.4 + node.val * 0.5) * 2.6
    core.scale.set(cs, cs, 1)

    group.add(halo)
    group.add(core)
    return group
  }

  const linkColor = (link: { source: GraphNode; target: GraphNode }) => {
    const a = link.source
    const b = link.target
    const both = a.discovered && b.discovered
    const seam = a.region === 'barrier' || b.region === 'barrier'
    if (!a.discovered && !b.discovered) return 'rgba(120,140,170,0.08)'
    if (seam) return `rgba(244,114,182,${both ? 0.5 : 0.18})`
    return `rgba(150,185,230,${both ? 0.4 : 0.13})`
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05070d] text-white">
      <div ref={wrapRef} className="absolute inset-0">
        {size.w > 0 && (
          <ForceGraph3D
            ref={fgRef}
            width={size.w}
            height={size.h}
            graphData={graphData}
            backgroundColor="#05070d"
            showNavInfo={false}
            controlType="orbit"
            cooldownTicks={0}
            nodeThreeObject={makeNode}
            nodeLabel={(n: MockSystem) => (n.discovered ? n.name : '')}
            linkColor={linkColor}
            linkWidth={0.5}
            linkOpacity={0.8}
            onNodeClick={(node: MockSystem) => setSelected(node)}
            onBackgroundClick={() => setSelected(null)}
          />
        )}
      </div>

      {/* --- title --- */}
      <div className="pointer-events-none absolute left-6 top-5">
        <div className="font-mono text-[11px] tracking-[0.35em] text-white/40">HEXAVERSE</div>
        <div className="font-mono text-lg tracking-[0.25em] text-white/85">GALAXY // SECTOR-0 · 3D</div>
      </div>

      {/* --- left: intel panel --- */}
      <aside className="absolute left-6 top-24 w-64 rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
        <h2 className="mb-3 font-mono text-[10px] tracking-[0.3em] text-white/45">GALAXY INTEL</h2>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Systems" value={stats.total} />
          <StatTile label="Lanes" value={stats.lanes} />
          <StatTile
            label="Discovered"
            value={`${Math.round((stats.discovered / stats.total) * 100)}%`}
          />
          <StatTile label="Sector" value="0" />
        </div>
        <h3 className="mb-2 mt-4 font-mono text-[10px] tracking-[0.3em] text-white/45">REGIONS</h3>
        <ul className="space-y-1.5">
          {(Object.keys(REGION) as Region[]).map((r) => (
            <li key={r} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-white/70">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: REGION[r].color, boxShadow: `0 0 8px ${REGION[r].color}` }}
                />
                {REGION[r].label}
              </span>
              <span className="font-mono tabular-nums text-white/50">{stats.counts[r]}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* --- right: system inspector --- */}
      <aside className="absolute right-6 top-24 w-72 rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
        <h2 className="mb-3 font-mono text-[10px] tracking-[0.3em] text-white/45">SYSTEM</h2>
        {!selected ? (
          <p className="text-sm text-white/40">Select a system to inspect it.</p>
        ) : (
          <div>
            <div className="text-lg text-white/90">{selected.name}</div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[11px]"
                style={{
                  background: rgba(REGION[selected.region].color, 0.15),
                  color: REGION[selected.region].color,
                }}
              >
                {REGION[selected.region].label}
              </span>
              {!selected.discovered && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/50">
                  Undiscovered
                </span>
              )}
            </div>
            <dl className="mt-3 space-y-1 font-mono text-[11px] text-white/50">
              <div className="flex justify-between">
                <dt>coords</dt>
                <dd className="tabular-nums text-white/70">
                  {selected.x.toFixed(0)}, {selected.y.toFixed(0)}, {selected.z.toFixed(0)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>lanes</dt>
                <dd className="tabular-nums text-white/70">{adjacency.get(selected.id)?.length ?? 0}</dd>
              </div>
            </dl>
            <h3 className="mb-2 mt-4 font-mono text-[10px] tracking-[0.3em] text-white/45">
              CONNECTIONS
            </h3>
            <ul className="space-y-1">
              {(adjacency.get(selected.id) ?? []).map((n) => (
                <li key={n.id}>
                  <button
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-white/70 hover:bg-white/10"
                    onClick={() => setSelected(n)}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: REGION[n.region].color }}
                    />
                    <span className="flex-1 truncate">{n.name}</span>
                    <span className="text-white/35">{REGION[n.region].label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* --- controls hint --- */}
      <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-wider text-white/35">
        drag to orbit · scroll to zoom · right-drag to pan · click a system
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="font-mono text-lg tabular-nums text-white/90">{value}</div>
      <div className="font-mono text-[9px] tracking-[0.2em] text-white/40">{label.toUpperCase()}</div>
    </div>
  )
}
