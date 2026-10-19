import { useId, useMemo, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useArgs } from 'storybook/preview-api'
import startArea from '@/public/galaxy/start-area.json'
import { adaptGalaxy } from '@/lib/services/galaxy-service'
import type { WireGalaxy } from '@/lib/types/galaxy'
import { RendererStateNotice } from '@/components/render-guard'
import type { RendererSnapshot } from '@/components/render-guard/renderer-owner'
import { Field, Label } from '@/components/catalyst/fieldset'
import { Select } from '@/components/catalyst/select'
import { Button } from '@/components/catalyst/button'
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
  artStyle: 'stellar' | 'current'
  palette: MapPalette
  routeState: 'none' | MapRoute['state']
  completedLegs: number
  vision: VisionPreview
  zoom: 'wide' | 'close'
}

function GridSlider({ label, value, min, max, step, display, disabled, onChange }: {
  label: string; value: number; min: number; max: number; step: number; display: string; disabled: boolean; onChange: (value: number) => void
}) {
  const id = useId()
  return <Field className={styles.fullWidth} disabled={disabled}>
    <Label htmlFor={id}>{label} <span className={styles.sliderValue}>{display}</span></Label>
    <input id={id} type="range" data-slot="control" min={min} max={max} step={step} value={value}
      disabled={disabled} onChange={event => onChange(Number(event.target.value))} className={styles.slider} />
  </Field>
}

function GalaxyMap({ onReviewChange, ...args }: ReviewArgs & { onReviewChange: (values: Partial<ReviewArgs>) => void }) {
  const { showLanes, showFleet, artStyle, palette, routeState, completedLegs, vision, zoom, gridMode, gridDistance, gridBrightness, gridThickness, gridStyle } = args
  const [selectedId, select] = useState<string | null>(null)
  const [framing, resetFraming] = useState(0)
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
      <GalaxyGraph key={zoom + '-' + framing} galaxy={galaxy} selectedId={selectedId} onSelect={node => select(node?.id ?? null)}
        artStyle={artStyle} mapPalette={palette} route={route} homeSystemId={home} gridMode={gridMode}
        gridSettings={{ distance: gridDistance, brightness: gridBrightness, thickness: gridThickness, style: gridStyle }}
        fleetSystemIds={fleetSystems}
        onController={value => { controller.current = value }} onRendererState={setRenderer} />
    </MapVisionPreview>
    <details open className={styles.panel}>
      <summary>GALAXY · ART REVIEW</summary>
      <div className={styles.controls}>
        <Field className={styles.fullWidth}><Label>Map palette</Label><Select value={palette} onChange={e => onReviewChange({ palette: e.target.value as MapPalette })}>
          {Object.entries(MAP_PALETTES).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
        </Select></Field>
        <Field><Label>Route state</Label><Select value={routeState} onChange={e => onReviewChange({ routeState: e.target.value as ReviewArgs['routeState'] })}>
          <option value="proposed">Proposed</option><option value="active">Active</option><option value="none">No route</option>
        </Select></Field>
        <Field><Label>Completed hops</Label><Select value={completedLegs} disabled={routeState !== 'active'} onChange={e => onReviewChange({ completedLegs: Number(e.target.value) })}>
          {Array.from({ length: itinerary.length }, (_, i) => <option key={i} value={i}>{i} of 13</option>)}
        </Select></Field>
        <Field><Label>View</Label><Select value={zoom} onChange={e => onReviewChange({ zoom: e.target.value as ReviewArgs['zoom'] })}>
          <option value="wide">Wide</option><option value="close">Close</option>
        </Select></Field>
        <Field><Label>Vision preview</Label><Select value={vision} onChange={e => onReviewChange({ vision: e.target.value as VisionPreview })}>
          <option value="none">Normal</option><option value="protanopia">Protanopia</option><option value="deuteranopia">Deuteranopia</option><option value="tritanopia">Tritanopia</option><option value="grayscale">Grayscale</option>
        </Select></Field>
        <Field><Label>Map art</Label><Select value={artStyle} onChange={e => onReviewChange({ artStyle: e.target.value as ReviewArgs['artStyle'] })}>
          <option value="stellar">Stellar sky</option><option value="current">Original</option>
        </Select></Field>
        <Field><Label>Hex grid</Label><Select value={gridMode} disabled={artStyle !== 'stellar'} onChange={e => onReviewChange({ gridMode: e.target.value as SpaceGridMode })}>
          <option value="surround">Surrounding</option><option value="ground">Ground</option><option value="none">No grid</option>
        </Select></Field>
        <GridSlider label="Grid distance" value={gridDistance} min={6} max={36} step={1} display={`${gridDistance}×`}
          disabled={gridMode !== 'surround' || artStyle !== 'stellar'} onChange={value => onReviewChange({ gridDistance: value })} />
        <GridSlider label="Grid brightness" value={gridBrightness} min={0} max={0.3} step={0.005} display={`${Math.round(gridBrightness * 1000) / 10}%`}
          disabled={gridMode !== 'surround' || artStyle !== 'stellar'} onChange={value => onReviewChange({ gridBrightness: value })} />
        <GridSlider label="Grid thickness" value={gridThickness} min={0.5} max={4} step={0.25} display={`${gridThickness}px`}
          disabled={gridMode !== 'surround' || artStyle !== 'stellar'} onChange={value => onReviewChange({ gridThickness: value })} />
        <Field className={styles.fullWidth}><Label>Grid treatment</Label><Select value={gridStyle} disabled={gridMode !== 'surround' || artStyle !== 'stellar'} onChange={e => onReviewChange({ gridStyle: e.target.value as HexSkyStyle })}>
          <option value="dark">Dark seams</option><option value="luminous">Luminous lines</option>
        </Select></Field>
      </div>
      <div className={styles.route} aria-live="polite">
        <p><span aria-hidden="true" className={styles.swatch} style={{ background: MAP_PALETTES[palette].route }} />
          {!showLanes ? 'Lanes hidden' : routeState === 'none' ? 'No route selected' : (routeState === 'active' ? 'Active' : 'Proposed') + ' route · 13 hops'}</p>
        {routeState === 'active' && showLanes && <p>{completedLegs} complete · {13 - completedLegs} remaining</p>}
        <details><summary>Review itinerary</summary><ol>{itinerary.map((id, i) => <li key={id}>{fixture.nodes.find(node => node.id === id)?.name}{i === itinerary.length - 1 ? ' · Destination' : ''}</li>)}</ol></details>
      </div>
      <div className={styles.actions}>
        <Button outline onClick={() => resetFraming(value => value + 1)}>Reset camera</Button>
        <Button outline onClick={() => onReviewChange({ gridDistance: DEFAULT_HEX_SKY.distance, gridBrightness: DEFAULT_HEX_SKY.brightness, gridThickness: DEFAULT_HEX_SKY.thickness, gridStyle: DEFAULT_HEX_SKY.style })}>Reset grid</Button>
      </div>
      <p className={styles.note}>Shared in-app sky and dark seams. Controls are for art review. Fixed review journey; palette alternatives remain candidates.</p>
      {selectedId && <p className={styles.note}>Inspecting: {fixture.nodes.find(node => node.id === selectedId)?.name}</p>}
    </details>
    {(renderer.phase === 'unavailable' || renderer.phase === 'interrupted') && <RendererStateNotice
      surface="galaxy" status={renderer.phase === 'interrupted' ? 'interrupted' : 'unsupported'}
      cause={renderer.phase === 'interrupted' ? 'lost' : 'creation'} retrying={renderer.retrying}
      onRetry={() => controller.current?.retry()} />}
  </main>
}

const meta = {
  title: 'Graphics/Galaxy Map',
  component: GalaxyMap,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Production GalaxyGraph with Stellar art, a sky shared with Solar System and a fixed 13-hop fixture journey. Compare surrounding/ground/no grid; tune surrounding-grid distance, brightness and pixel thickness directly on canvas or in Controls. Distance also changes angular cell size so the camera-centered shell visibly recedes. Palette, route-state, progress, zoom and vision previews remain available. No backend, sign-in or gameplay route execution.' } } },
  args: { showLanes: true, showFleet: false, artStyle: 'stellar', palette: 'emerald', routeState: 'active', completedLegs: 4, vision: 'none', zoom: 'wide', gridMode: 'surround', gridDistance: DEFAULT_HEX_SKY.distance, gridBrightness: DEFAULT_HEX_SKY.brightness, gridThickness: DEFAULT_HEX_SKY.thickness, gridStyle: DEFAULT_HEX_SKY.style, onReviewChange: () => {} },
  argTypes: {
    onReviewChange: { table: { disable: true }, control: false },
    artStyle: { control: 'select', options: ['stellar', 'current'] },
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
  render: function Render(args) {
    const [, updateArgs] = useArgs()
    return <GalaxyMap {...args} onReviewChange={updateArgs} />
  },
} satisfies Meta<typeof GalaxyMap>
export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {}
export const StarsOnly: Story = { args: { showLanes: false, showFleet: false, routeState: 'none' } }
export const ProposedRoute: Story = { args: { routeState: 'proposed' } }
export const Original: Story = { args: { artStyle: 'current', routeState: 'none' } }
