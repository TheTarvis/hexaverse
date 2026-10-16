import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HudRoot, HudHeading } from '@/components/hud/GameHud'
import { HudWorkspace } from '@/components/hud/HudWorkspace'
import { HudCardShell } from '@/components/hud/HudCardShell'
import { FloatingNavFrame } from '@/components/floating-nav'
import { Button } from '@/components/catalyst/button'
import { RecoveryTransmission } from './RecoveryTransmission'
import { VitalsStrip } from './VitalsStrip'
import { CompactTravelCard } from './CompactTravelCard'
import { rosterRowStatus } from '@/components/fleet/roster-status'
import { newGuide } from '@/lib/command-onboarding'
import type { Fleet } from '@/lib/types/fleet'
import styles from './command-view.module.css'

const fleet: Fleet = { id: 'fleet_seed_63fd1929d_extremely_long_fixture_name', corporationId: 'mobile-fixture', own: true, position: { X: 0, Y: 0, Z: 0 }, worldTime: 1000, systemId: 'serais', roster: { ships: [{ class: 'hauler' }], cargo: { fuel: 60, water: 20 }, cargoCapacity: 100, freeHold: 20, miningRate: 1 }, state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 2, BodyId: 'feat-station', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 1000, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } } }
function MobileSystemHud({ gameplay = false }: { gameplay?: boolean }) {
  // In-memory demonstration only. Production quote/mutation ownership is tested
  // in SystemSpaceView; this fixture never calls services or Auth.
  const [owned, setOwned] = useState<Fleet[]>([fleet, { ...fleet, id: 'fleet_fixture_second', roster: { ...fleet.roster!, cargo: { fuel: 8 }, freeHold: 92 } }])
  const [actingId, setActingId] = useState(fleet.id)
  const acting = owned.find(item => item.id === actingId)!
  const [travelMode, setTravelMode] = useState<'review' | 'status' | null>(null)
  const [worldTime, setWorldTime] = useState(1000)
  const [started, setStarted] = useState(0)
  const [stopped, setStopped] = useState(0)
  const quote = { controlPoints: [], departMs: worldTime, arriveMs: worldTime + 180000, deltaV: 24, fuelCostTons: 18, affordable: (acting.roster?.cargo?.fuel ?? 0) >= 18, strandingWarning: false }
  function updateFleet(next: Fleet) { setOwned(items => items.map(item => item.id === next.id ? next : item)) }
  function startTravel() {
    if (!quote.affordable) return
    setStarted(value => value + 1)
    updateFleet({ ...acting, attachedTo: undefined, state: { Mode: 0, Park: null, Drift: null, Burn: { DepartMs: worldTime, ArriveMs: worldTime + 180000, Origin: { X: 0, Y: 0, Z: 0 }, Target: { BodyId: 'feat-station', Point: null }, Intercept: { X: 10, Y: 0, Z: 0 }, Curve: [], Length: 10, Accel: 1, InsertionPhase: 0 } } })
    setTravelMode('status')
  }
  function stopTravel() { setStopped(value => value + 1); updateFleet({ ...acting, state: fleet.state, attachedTo: undefined }) }
  function arrive() {
    setWorldTime(value => value + 180000)
    updateFleet({ ...acting, state: fleet.state, attachedTo: 'feat-station' })
  }
  const [guide, setGuide] = useState(() => ({ ...newGuide('mobile-fixture', fleet.id, 'serais'), ...(gameplay ? { phase: 'dismissed' as const } : {}) }))
  const [canvasTaps, setCanvasTaps] = useState(0)
  const [request, setRequest] = useState<{ id: 'objects' | 'command' | 'console'; sequence: number }>()
  const open = (id: 'objects' | 'command' | 'console') => setRequest(previous => ({ id, sequence: (previous?.sequence ?? 0) + 1 }))
  return <><HudRoot className={styles.commandView} data-testid="space-view">
    <button data-testid="fixture-canvas" aria-label="Select map position" onClick={() => setCanvasTaps(value => value + 1)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', color: '#91a3b7', background: 'radial-gradient(ellipse at center, #1a3447, #05060a)' }}>Map selections: {canvasTaps}</button>
    <HudHeading className={styles.identity} data-testid="command-system-identity" eyebrow="Local space / Command network" title="Serais" detail={gameplay ? "2 fleets · 2 ships" : "1 fleets · 1 ships"} />
    {guide.phase !== 'dismissed' && <div className={styles.guideLayer}><RecoveryTransmission guide={guide} fleet={fleet} bodies={[]} interiorFailed={false} actionFailed={false} onRetryAction={() => {}} onSave={setGuide} onTarget={() => open('objects')} onObjects={() => open('objects')} onScan={() => open('console')} />
      <aside className={styles.objectiveCard} aria-label="Current objective"><span className={styles.signal}>CURRENT OBJECTIVE</span><p>Complete tutorial · 0/1</p></aside></div>}
    <HudWorkspace className={styles.workspace} corporationId={gameplay ? "isolated-mobile-gameplay-fixture" : "isolated-mobile-responsive-fixture"} request={request} panels={[
      { id: 'objects', label: 'Objects', children: <HudCardShell title="Known objects" lighting="none"><input aria-label="Find objects" placeholder="Find objects" /><p>Station · feat-station</p><Button outline onClick={() => open('console')}>Open sensors</Button></HudCardShell> },
      { id: 'command', label: 'Command', children: gameplay ? <>
        {travelMode ? <CompactTravelCard mode={travelMode} fleet={acting} fleets={owned} systemId="serais" destination="Trading station · feat-station" quote={quote} worldTime={worldTime} scale={1} blocker={quote.affordable ? null : 'Insufficient fuel for this trip.'} onFleet={setActingId} onStart={startTravel} onStop={stopTravel} onBack={() => { setTravelMode(null); open('objects') }} onClose={() => setTravelMode(null)} onRetry={() => {}} /> : <HudCardShell title="Fixture travel" lighting="none"><p>In-memory state only. No live commands.</p><Button outline onClick={() => setTravelMode('review')}>Review course</Button><Button outline onClick={() => setTravelMode('status')}>Fleet status</Button></HudCardShell>}
        <p data-testid="fixture-command-counts">Fixture starts {started} · stops {stopped}</p>
      </> : <HudCardShell title="Fleet command" lighting="none"><p>Holding position. No live commands in this fixture.</p><Button outline>Review course</Button></HudCardShell> },
      { id: 'console', label: 'Console', children: <HudCardShell title="Ship console" lighting="none"><label>Console draft<input aria-label="Console draft" /></label><p>Scan telemetry available.</p>{gameplay && <Button outline onClick={arrive}>Fixture: settle station arrival</Button>}</HudCardShell> },
    ]} />
    <div className={styles.workspaceVitals}><VitalsStrip acting={gameplay ? acting : fleet} ownedFleets={gameplay ? owned : [fleet]} fleetsFailed={false} status={gameplay ? rosterRowStatus(acting, worldTime, id => id === 'serais' ? 'Serais' : id) : { where: 'Serais', activity: 'Docked', tone: 'idle', activityKind: 'docked', hostLabel: 'station feat-station-with-a-long-disclosed-name' }} onSelectFleet={gameplay ? selected => setActingId(selected.id) : () => {}} systemNames={{ serais: 'Serais' }} credits={1000} scale={1} worldTime={worldTime} serverWorldTime={worldTime} /></div>
  </HudRoot><FloatingNavFrame onGalaxy={false} email="fixture@example.com" onSignOut={() => {}} /></>
}
const meta = { title: 'HUD/Mobile System', component: MobileSystemHud, parameters: { layout: 'fullscreen', docs: { description: { component: 'Identity-free regression fixture using live HUD, recovery guide, navigation and vitals components. No Auth, API or game mutations. Map button counts local selections.' } } } } satisfies Meta<typeof MobileSystemHud>
export default meta
type Story = StoryObj<typeof meta>
export const Onboarding: Story = {}

export const Gameplay: Story = { args: { gameplay: true } }
