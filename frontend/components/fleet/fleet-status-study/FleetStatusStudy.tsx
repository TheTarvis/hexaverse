'use client'

import { HudCardBack } from '@/components/hud/HudCardShell'

import { ObjectSearch, emptyObjectSearch } from '@/components/space/ObjectSearch'
import { useState } from 'react'
import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { HudWorkspace } from '@/components/hud/HudWorkspace'
import { FleetStatusActions, FleetStatusContent, type FleetStatusProps } from '../FleetStatusCard'
import type { Fleet } from '@/lib/types/fleet'
import { fleetFixture, fixtureNameOf, fixtureResolveBody, statusFixture, type StatusScenario } from './fixtures'
import styles from './fleet-status-study.module.css'

/** Fixture adapter only. The production module owns every fleet fact and disclosure. */
export function FleetStatusHostingStudy({ scenario = 'travelling' }: { scenario?: StatusScenario }) {
  const [query, setQuery] = useState(emptyObjectSearch)
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
    <HudWorkspace corporationId="storybook-fleet-status-own-host" panels={[
      { id: 'objects', label: 'Objects', children: <>
        {inspecting && <HudCardBack destination="objects" onClick={() => setInspecting(false)} />}
        {inspecting ? <><HudHeading size="compact">Nereid Outer System Research Anchorage</HudHeading><HudText variant="secondary">Station · fictional inspection</HudText><HudText>Inspecting this station keeps Peregrine selected for commands.</HudText></>
          : <ObjectSearch items={[{ id: 'nereid', name: 'Nereid Outer System Research Anchorage', kind: 'station', subtitle: 'Station · fictional inspection' }]} value={query} onChange={setQuery} onSelect={() => setInspecting(true)} />}

      </> },
      { id: 'fleet-status', label: 'Fleet status', children: <FleetStatusContent {...props} />, footer: <FleetStatusActions {...props} /> },
    ]} />
  </main>
}
