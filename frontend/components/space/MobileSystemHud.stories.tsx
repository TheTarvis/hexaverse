import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HudRoot, HudHeading } from '@/components/hud/GameHud'
import { HudWorkspace } from '@/components/hud/HudWorkspace'
import { HudCardShell } from '@/components/hud/HudCardShell'
import { FloatingNavFrame } from '@/components/floating-nav'
import { Button } from '@/components/catalyst/button'
import { RecoveryTransmission } from './RecoveryTransmission'
import { VitalsStrip } from './VitalsStrip'
import { newGuide } from '@/lib/command-onboarding'
import type { Fleet } from '@/lib/types/fleet'
import styles from './command-view.module.css'

const fleet: Fleet = { id: 'fleet_seed_63fd1929d_extremely_long_fixture_name', corporationId: 'mobile-fixture', own: true, position: { X: 0, Y: 0, Z: 0 }, worldTime: 1000, systemId: 'serais', roster: { ships: [{ class: 'hauler' }], cargo: { fuel: 60, water: 20 }, cargoCapacity: 100, freeHold: 20, miningRate: 1 }, state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 2, BodyId: 'feat-station', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 1000, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } } }
function MobileSystemHud() {
  const [guide, setGuide] = useState(() => newGuide('mobile-fixture', fleet.id, 'serais'))
  const [canvasTaps, setCanvasTaps] = useState(0)
  const [request, setRequest] = useState<{ id: 'objects' | 'console'; sequence: number }>()
  const open = (id: 'objects' | 'console') => setRequest(previous => ({ id, sequence: (previous?.sequence ?? 0) + 1 }))
  return <><HudRoot className={styles.commandView} data-testid="space-view">
    <button data-testid="fixture-canvas" aria-label="Select map position" onClick={() => setCanvasTaps(value => value + 1)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', color: '#91a3b7', background: 'radial-gradient(ellipse at center, #1a3447, #05060a)' }}>Map selections: {canvasTaps}</button>
    <HudHeading className={styles.identity} data-testid="command-system-identity" eyebrow="Local space / Command network" title="Serais" detail="1 fleets · 1 ships" />
    {guide.phase !== 'dismissed' && <div className={styles.guideLayer}><RecoveryTransmission guide={guide} fleet={fleet} bodies={[]} interiorFailed={false} actionFailed={false} onRetryAction={() => {}} onSave={setGuide} onTarget={() => open('objects')} onObjects={() => open('objects')} onScan={() => open('console')} />
      <aside className={styles.objectiveCard} aria-label="Current objective"><span className={styles.signal}>CURRENT OBJECTIVE</span><p>Complete tutorial · 0/1</p></aside></div>}
    <HudWorkspace className={styles.workspace} corporationId="isolated-mobile-responsive-fixture" request={request} panels={[
      { id: 'objects', label: 'Objects', children: <HudCardShell title="Known objects" lighting="none"><input aria-label="Find objects" placeholder="Find objects" /><p>Station · feat-station</p><Button outline onClick={() => open('console')}>Open sensors</Button></HudCardShell> },
      { id: 'command', label: 'Command', children: <HudCardShell title="Fleet command" lighting="none"><p>Holding position. No live commands in this fixture.</p><Button outline>Review course</Button></HudCardShell> },
      { id: 'console', label: 'Console', children: <HudCardShell title="Ship console" lighting="none"><label>Console draft<input aria-label="Console draft" /></label><p>Scan telemetry available.</p></HudCardShell> },
    ]} />
    <div className={styles.workspaceVitals}><VitalsStrip acting={fleet} ownedFleets={[fleet]} fleetsFailed={false} status={{ where: 'Serais', activity: 'Docked', tone: 'idle', activityKind: 'docked', hostLabel: 'station feat-station-with-a-long-disclosed-name' }} onSelectFleet={() => {}} systemNames={{ serais: 'Serais' }} credits={1000} scale={1} worldTime={1000} serverWorldTime={1000} /></div>
  </HudRoot><FloatingNavFrame onGalaxy={false} email="fixture@example.com" onSignOut={() => {}} /></>
}
const meta = { title: 'HUD/Mobile System', component: MobileSystemHud, parameters: { layout: 'fullscreen', docs: { description: { component: 'Identity-free regression fixture using live HUD, recovery guide, navigation and vitals components. No Auth, API or game mutations. Map button counts local selections.' } } } } satisfies Meta<typeof MobileSystemHud>
export default meta
type Story = StoryObj<typeof meta>
export const Onboarding: Story = {}
