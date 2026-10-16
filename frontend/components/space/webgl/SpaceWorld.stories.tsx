import { useEffect, useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpaceCanvas } from '../SpaceCanvas'
import { defaultCamera } from '../space-camera'
import { viewBasisOf } from '../space-projection'
import type { SpaceFrame } from '../space-transform-loop'
import { SpaceWorld } from './SpaceWorld'

function GateWorld({ distance = 45 }: { distance?: number }) {
  const host = useRef<HTMLDivElement>(null)
  const frameRef = useRef<SpaceFrame | null>(null)
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, previous = 0, elapsed = 0
    const tick = (now: number) => {
      if (previous && !motion.matches && !document.hidden) elapsed += Math.min(now - previous, 100)
      previous = now
      const { width, height } = host.current!.getBoundingClientRect()
      const camera = { ...defaultCamera(100), distance, target: { x: 20, y: 0, z: 0 } }
      frameRef.current = {
        camera, basis: viewBasisOf(camera, { width, height }), projected: new Map(),
        scene: {
          marks: [
            { id: 'star', kind: 'star', starClass: 'G', position: { x: 0, y: 0, z: 0 }, radius: 3, selected: false, pickable: false },
            { id: 'gate', kind: 'gate', position: { x: 20, y: 0, z: 0 }, radius: 1.2, selected: true, pickable: true },
          ],
          curves: [], orbitRings: [], beltFields: [], omissions: [], positionTimeMs: 0, decorativeTimeMs: elapsed,
        },
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [distance])
  return <div ref={host} style={{ position: 'relative', width: '100%', height: '100dvh' }}>
    <SpaceCanvas renderWorld={(canvas, bindings) => <SpaceWorld canvas={canvas} frameRef={frameRef} extent={100} {...bindings} />} />
  </div>
}

const meta = {
  title: 'Graphics/World Gate',
  component: GateWorld,
  parameters: { layout: 'fullscreen' },
  args: { distance: 45 },
  argTypes: { distance: { control: { type: 'range', min: 8, max: 150, step: 1 } } },
} satisfies Meta<typeof GateWorld>
export default meta
type Story = StoryObj<typeof meta>

/** Actual world renderer, light rig, selection ring and gate asset loading. */
export const GameplayScale: Story = {}
export const Close: Story = { args: { distance: 12 } }
