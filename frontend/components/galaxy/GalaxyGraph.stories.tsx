import { useMemo, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import startArea from '@/public/galaxy/start-area.json'
import { adaptGalaxy } from '@/lib/services/galaxy-service'
import type { WireGalaxy } from '@/lib/types/galaxy'
import { RendererStateNotice } from '@/components/render-guard'
import type { RendererSnapshot } from '@/components/render-guard/renderer-owner'
import { GalaxyGraph, type GalaxyGraphController } from './GalaxyGraph'
import { MAP_PALETTES, type MapPalette, type MapRoute } from './map-route-overlay'
import { MapVisionPreview, type VisionPreview } from './map-vision-preview'
import styles from './galaxy-map-review.module.css'
import { DEFAULT_HEX_SKY, type SpaceGridMode, type HexSkyStyle } from '@/components/graphics/space-sky'

const fixture = adaptGalaxy(startArea as WireGalaxy)
// A fixed 13-hop journey along existing fixture lanes, not a route planner.
const itinerary = ['sys_-3_-3', 'sys_-2_-3', 'sys_-1_-2', 'sys_0_-2', 'sys_0_-1', 'sys_-1_-1', 'sys_0_0', 'sys_0_1', 'sys_-1_2', 'sys_-2_1', 'sys_-2_2', 'sys_-2_3', 'sys_-2_4', 'sys_-3_3']

interface ReviewArgs {
  gridMode: SpaceGridMode
  gridDistance: number
  gridBrightness: number
  gridThickness: number
  gridStyle: HexSkyStyle
  showLanes: boolean
  showFleet: boolean
  palette: MapPalette
  routeState: 'none' | MapRoute['state']
  completedLegs: number
  vision: VisionPreview
  cameraRevision: number
  zoom: 'wide' | 'close'
}

function GalaxyMap(args: ReviewArgs) {
  const { showLanes, showFleet, palette, routeState, completedLegs, vision, zoom, gridMode, gridDistance, gridBrightness, gridThickness, gridStyle, cameraRevision } = args
  const [selectedId, select] = useState<string | null>(null)
  const [renderer, setRenderer] = useState<RendererSnapshot>({ phase: 'pending', backend: null, retrying: false })
  const controller = useRef<GalaxyGraphController | null>(null)
  const galaxy = useMemo(() => showLanes ? fixture : { ...fixture, links: [] }, [showLanes])
  const fleetSystems = useMemo(() => showFleet ? [itinerary[Math.min(completedLegs, itinerary.length - 1)]] : [], [showFleet, completedLegs])
  const route = useMemo<MapRoute | undefined>(() => routeState === 'none' || !showLanes ? undefined : {
    systemIds: itinerary, state: routeState, completedLegs,
  }, [routeState, completedLegs, showLanes])
  const home = zoom === 'close' ? itinerary[Math.min(completedLegs, itinerary.length - 1)] : null
  return <main aria-label="Galaxy map art review" className={styles.review + ' dark'}>
    <MapVisionPreview mode={vision}>
      <GalaxyGraph key={zoom + '-' + cameraRevision} galaxy={galaxy} selectedId={selectedId} onSelect={node => select(node?.id ?? null)}
        artStyle="stellar" mapPalette={palette} route={route} homeSystemId={home} gridMode={gridMode}
        gridSettings={{ distance: gridDistance, brightness: gridBrightness, thickness: gridThickness, style: gridStyle }}
        fleetSystemIds={fleetSystems}
        onController={value => { controller.current = value }} onRendererState={setRenderer} />
    </MapVisionPreview>
    {(renderer.phase === 'unavailable' || renderer.phase === 'interrupted') && <RendererStateNotice
      surface="galaxy" status={renderer.phase === 'interrupted' ? 'interrupted' : 'unsupported'}
      cause={renderer.phase === 'interrupted' ? 'lost' : 'creation'} retrying={renderer.retrying}
      onRetry={() => controller.current?.retry()} />}
  </main>
}

const meta = {
  id: 'graphics-galaxy-map', title: 'Graphics/Galaxy',
  component: GalaxyMap,
  tags: ['autodocs', 'catalog'],
  parameters: { catalog: { purpose: 'scene', status: 'reference', record: 'docs/art-direction.md' }, layout: 'fullscreen', docs: { description: { component: 'Production GalaxyGraph with Stellar art, a sky shared with Solar System and a fixed 13-hop fixture journey. Compare surrounding/ground/no grid; tune surrounding-grid distance, brightness and pixel thickness in Storybook Controls. Distance also changes angular cell size so the camera-centered shell visibly recedes. Palette, route-state, progress, zoom and vision previews remain available. No backend, sign-in or gameplay route execution.' } } },
  args: { showLanes: true, showFleet: false, palette: 'emerald', routeState: 'active', completedLegs: 4, vision: 'none', zoom: 'wide', gridMode: 'surround', gridDistance: DEFAULT_HEX_SKY.distance, gridBrightness: DEFAULT_HEX_SKY.brightness, gridThickness: DEFAULT_HEX_SKY.thickness, gridStyle: DEFAULT_HEX_SKY.style, cameraRevision: 0 },
  argTypes: {
    cameraRevision: { name: 'Reset camera', control: { type: 'number', min: 0, step: 1 }, description: 'Increment to restore the selected framing. Use Reset controls to restore grid defaults.' },
    palette: { control: 'select', options: Object.keys(MAP_PALETTES) },
    routeState: { control: 'select', options: ['none', 'proposed', 'active'] },
    completedLegs: { control: { type: 'range', min: 0, max: 13, step: 1 } },
    vision: { control: 'select', options: ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'grayscale'] },
    zoom: { control: 'select', options: ['wide', 'close'] },
    gridMode: { control: 'select', options: ['surround', 'ground', 'none'] },
    gridDistance: { control: { type: 'range', min: 6, max: 36, step: 1 } },
    gridBrightness: { control: { type: 'range', min: 0, max: 0.3, step: 0.005 } },
    gridThickness: { control: { type: 'range', min: 0.5, max: 4, step: 0.25 } },
    gridStyle: { control: 'select', options: ['dark', 'luminous'] },
  },
} satisfies Meta<typeof GalaxyMap>
export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {}
export const StarsOnly: Story = { args: { showLanes: false, showFleet: false, routeState: 'none' } }
export const ProposedRoute: Story = { args: { routeState: 'proposed' } }
