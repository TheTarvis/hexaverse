import { useEffect, useMemo, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpaceCanvas } from '../SpaceCanvas'
import { defaultCamera } from '../space-camera'
import { viewBasisOf } from '../space-projection'
import type { SceneMark } from '../space-scene'
import type { SpaceFrame } from '../space-transform-loop'
import { SpaceWorld } from './SpaceWorld'
import { createRendererCandidate, type RendererCandidateFactory } from '@/components/render-guard/renderer-candidate'
import { HudObjectThumbnail, type HudObjectKind } from '@/components/hud/HudObjectThumbnail'

function GateWorld({ distance = 45, lineup = false, rendererReview = 'auto' }: { distance?: number; lineup?: boolean; rendererReview?: 'auto' | 'compatibility' | 'recovery' }) {
  const host = useRef<HTMLDivElement>(null)
  const frameRef = useRef<SpaceFrame | null>(null)
  // Story-only failure injection at the existing renderer boundary. Compatibility
  // still uses a real WebGL2 renderer; recovery fails both initial candidates,
  // then allows the normal renderer factory when the visitor presses Retry.
  const rendererFactory = useMemo<RendererCandidateFactory | undefined>(() => {
    if (rendererReview === 'auto') return undefined
    let failures = 0
    return options => {
      if ((rendererReview === 'compatibility' && !options.forceWebGL) || (rendererReview === 'recovery' && failures++ < 2)) {
        throw new Error('Intentional Storybook renderer creation failure')
      }
      return createRendererCandidate(options)
    }
  }, [rendererReview])
  useEffect(() => {
    const spacing = distance <= 40 ? 7 : 14
    const categories = ['anomaly', 'ruin', 'nebula', 'gravity_well', 'debris', 'radiation']
    const features: SceneMark[] = categories.map((bodyType, i) => ({
      id: `review-${bodyType}`, kind: 'body', bodyType, position: { x: (i % 3 - 1) * spacing + 20, y: 0, z: (Math.floor(i / 3) - 0.5) * spacing },
      radius: 1.2, selected: false, pickable: true,
    }))
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, previous = 0, elapsed = 0
    const tick = (now: number) => {
      if (previous && !motion.matches && !document.hidden) elapsed += Math.min(now - previous, 100)
      previous = now
      const { width, height } = host.current!.getBoundingClientRect()
      const camera = { ...defaultCamera(100), ...(lineup ? { yaw: 0, pitch: 0.9 } : {}), distance, target: { x: 20, y: 0, z: lineup && distance <= 40 ? -2.5 : 0 } }
      frameRef.current = {
        camera, basis: viewBasisOf(camera, { width, height }), projected: new Map(),
        scene: {
          marks: [
            { id: 'star', kind: 'star', starClass: 'G', position: { x: 0, y: 0, z: 0 }, radius: 3, selected: false, pickable: false },
            ...(lineup ? features : []),
            { id: 'gate', kind: 'gate', position: { x: 20, y: 0, z: lineup ? distance <= 40 ? -12 : -22 : 0 }, radius: 1.2, selected: true, pickable: true },
          ],
          curves: [], orbitRings: [], beltFields: [], omissions: [], positionTimeMs: 0, decorativeTimeMs: elapsed,
        },
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [distance, lineup])
  return <div ref={host} style={{ position: 'relative', width: '100%', height: lineup ? 'calc(100dvh - 64px)' : '100dvh', background: '#080e19', color: '#d6e2ef' }}>
    <SpaceCanvas rendererFactory={rendererFactory} renderWorld={(canvas, bindings) => <SpaceWorld canvas={canvas} frameRef={frameRef} extent={100} {...bindings} />} />
    {rendererReview === 'recovery' && <aside aria-label="Static object categories during renderer recovery" style={{ position: 'absolute', top: 16, left: 16, padding: 12, color: '#d6e2ef', background: '#102030', display: 'flex', gap: 12, zIndex: 1 }}>
      {(['gate', 'anomaly', 'ruin', 'nebula', 'gravity_well', 'debris', 'radiation'] satisfies HudObjectKind[]).map(kind => <span key={kind} style={{ display: 'grid', justifyItems: 'center', gap: 4 }}><HudObjectThumbnail kind={kind} /><span>{kind.replaceAll('_', ' ')}</span></span>)}
    </aside>}
    {lineup && <p style={{ position: 'absolute', top: '100%', left: 0, right: 0, minHeight: 64, margin: 0, padding: '10px 16px', background: '#080e19', color: '#d6e2ef', font: 'var(--hud-secondary-font)' }}>Back: accepted lane gate. Middle row, left to right: anomaly · ruin · nebula. Front row: gravity well · debris · radiation.</p>}
  </div>
}

const meta = {
  id: 'graphics-world-gate', title: 'Graphics/Gates and features', tags: ['catalog'],
  component: GateWorld,
  parameters: { catalog: { purpose: 'scene', status: 'reference', record: 'docs/art-direction.md' }, layout: 'fullscreen' },
  args: { distance: 45 },
  argTypes: { distance: { control: { type: 'range', min: 8, max: 150, step: 1 } } },
} satisfies Meta<typeof GateWorld>
export default meta
type Story = StoryObj<typeof meta>

/** Actual world renderer, light rig, selection ring and gate asset loading. */
export const GameplayScale: Story = {}
export const Close: Story = { args: { distance: 12 } }

/** Same factories, positions, selection and lighting as the game's system view. */
export const FeatureLineupClose: Story = { args: { lineup: true, distance: 35 } }
export const FeatureLineupGameplay: Story = { args: { lineup: true, distance: 120 } }
export const FeatureLineupDistant: Story = { args: { lineup: true, distance: 240 } }
export const FeatureLineupCompatibility: Story = {
  args: { lineup: true, distance: 35, rendererReview: 'compatibility' },
  parameters: { docs: { description: { story: 'Rejects the native candidate at the existing factory boundary, then renders actual world art through the real WebGL2 compatibility backend.' } } },
}
export const RendererRecovery: Story = {
  args: { lineup: true, distance: 35, rendererReview: 'recovery' },
  parameters: { docs: { description: { story: 'Story-only creation failure for both initial renderer candidates. Static category thumbnails stay available. Press Retry to use the normal real renderer and recover the same world scene. This does not simulate physical device loss or prove iOS support.' } } },
}
