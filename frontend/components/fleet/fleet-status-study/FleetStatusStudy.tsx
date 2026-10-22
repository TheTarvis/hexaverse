'use client'

import { useState } from 'react'
import { HudBackButton, HudButton, HudSearchInput, HudSelect } from '@/components/hud/HudControls'
import { HudObjectThumbnail } from '@/components/hud/HudObjectThumbnail'
import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { HudWorkspace } from '@/components/hud/HudWorkspace'
import { FleetStatusActions, FleetStatusContent, type FleetStatusProps } from '../FleetStatusCard'
import type { Fleet } from '@/lib/types/fleet'
import { fleetFixture, fixtureNameOf, fixtureResolveBody, statusFixture, statusScenarios, type StatusScenario } from './fixtures'
import styles from './fleet-status-study.module.css'

/** Fixture adapter only. The production module owns every fleet fact and disclosure. */
export function FleetStatusHostingStudy() {
  const [scenario, setScenario] = useState<StatusScenario>('travelling')
  const [query, setQuery] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [travelControlsOpen, setTravelControlsOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [recovered, setRecovered] = useState(false)
  const [override, setOverride] = useState<Fleet | null>(null)
  const fixture = statusFixture(scenario)
  const props: FleetStatusProps = {
    ...fixture, fleet: override ?? fixture.fleet, scale: 1, nameOf: fixtureNameOf, resolveBody: fixtureResolveBody,
    failed: scenario === 'unavailable' && !recovered,
    notice: notice || (scenario === 'completed' ? 'Focused scan completed (fixture).' : scenario === 'failed' ? 'Focused scan failed (fixture).' : 'Fictional readings. No live orders.'),
    travelControlsOpen, onTravelControls: () => setTravelControlsOpen(true), onBack: () => setTravelControlsOpen(false),
    onReviewTravel: () => setNotice('Travel review requested (fixture).'), onFocus: () => setNotice('Map focus changed (fixture).'),
    focusLabel: scenario === 'transit' ? 'Focus destination' : scenario === 'remote' ? 'Open fleet system' : 'Focus fleet',
    onRetry: () => { setRecovered(true); setNotice('Fixture readings recovered.') },
    onStop: () => { setOverride(fleetFixture()); setNotice('Stop accepted (fixture). No live order changed.') },
  }
  return <main className={`dark ${styles.workspaceStage}`}>
    <div className={styles.workspaceIntro}><HudHeading level={1} size="compact">Fleet status · own card</HudHeading><HudText variant="secondary">Production presentation with fictional reads and callbacks. Arrange HUD contains situation controls.</HudText></div>
    <HudWorkspace corporationId="storybook-fleet-status-own-host" panels={[
      { id: 'objects', label: 'Objects', children: <>
        {inspecting && <HudBackButton destination="objects" onClick={() => setInspecting(false)} />}
        <HudSearchInput aria-label="Find objects" placeholder="Find an object…" value={query} onChange={event => setQuery(event.target.value)} />
        {inspecting ? <><HudHeading size="compact">Nereid Outer System Research Anchorage</HudHeading><HudText variant="secondary">Station · fictional inspection</HudText><HudText>Inspecting this station keeps Peregrine selected for commands.</HudText></> : 'Nereid Outer System Research Anchorage'.toLowerCase().includes(query.toLowerCase()) ? <HudButton presentation="row" onClick={() => setInspecting(true)}><HudObjectThumbnail kind="station" />Nereid Outer System Research Anchorage</HudButton> : <HudText>No matching objects.</HudText>}
      </> },
      { id: 'fleet-status', label: 'Fleet status', children: <FleetStatusContent {...props} />, footer: <FleetStatusActions {...props} /> },
    ]} settingsContent={<label className={styles.fixtureControl}><HudText variant="label">Simulated situation</HudText><HudSelect aria-label="Simulated situation" value={scenario} onChange={event => { setScenario(event.target.value as StatusScenario); setRecovered(false); setOverride(null); setNotice(''); setTravelControlsOpen(false) }}>{Object.entries(statusScenarios).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</HudSelect></label>} />
  </main>
}
