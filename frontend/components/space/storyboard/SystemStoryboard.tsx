'use client'

import { useState, useRef, type CSSProperties } from 'react'
import { Button } from '@/components/catalyst/button'
import { Figure } from '@/components/figure/Figure'
import { formatTons } from '@/lib/format'
import { Checkbox, CheckboxField } from '@/components/catalyst/checkbox'
import { Label } from '@/components/catalyst/fieldset'
import { SystemIndex } from './SystemIndex'
import styles from './storyboard.module.css'

const hudScenes = [
  { title: 'First light', phase: 'Arrive', heading: 'A small ship. An enormous sky.', copy: 'This is your home system. Your fleet is waiting at the home station. Start by finding your ship.', action: 'Find my fleet', note: 'The system is the hero. Give the player a place, a ship, and one invitation — no wall of controls.', checks: ['The star and planets establish a sense of place.', 'One primary action makes the first step obvious.'] },
  { title: 'Your foothold', phase: 'Orient', heading: 'Meet Nyxiour.', copy: 'Your first fleet has 71.3 tonnes of fuel. It is holding near the inner anchorage, ready for a new course.', action: 'Choose a destination', note: 'Anchor identity and readiness to the ship. Fuel belongs beside the fleet, not in a full-width accounting strip.', checks: ['I can locate my fleet in the scene.', 'I understand that the fleet is ready to move.'] },
  { title: 'Somewhere to go', phase: 'Select', heading: 'The blue world is within reach.', copy: 'Select Nereid in the system, or try another highlighted destination. Inspect a world before asking your fleet to move.', action: 'Plot course', note: 'Selection should feel physical: a fine halo, a nearby label, and one contextual inspector. No commands for unrelated tasks.', checks: ['The selected world is unmistakable.', 'The destination name matches the inspector.'] },
  { title: 'Before the burn', phase: 'Review', heading: 'Know what you are committing.', copy: 'Review the destination, fuel cost, and arrival time. Plotting a course has not moved your fleet yet.', action: 'Commit burn', note: 'Preview and commitment are distinct. Keep the projected course on the map and its cost next to the commit action.', checks: ['Fuel cost and arrival time are visible before commitment.', 'I can change my mind without moving the fleet.'] },
  { title: 'Under way', phase: 'Travel', heading: 'You have the conn.', copy: 'Your fleet is under way. The course stays visible while a compact flight card tracks the journey.', action: 'Simulate arrival', note: 'Replace the planning controls with flight status. This prototype advances on click; these timings are illustrative.', checks: ['The UI confirms that the burn was committed.', 'I can distinguish travelling from being docked.'] },
  { title: 'A new horizon', phase: 'Arrive', heading: 'Your first crossing.', copy: 'Nyxiour has arrived. Confirm where the ship is before introducing the next decision: inspect, scan, or plan another flight.', action: 'Plan another flight', note: 'Arrival closes the loop with a clear destination and fleet status. Let the player decide what comes next.', checks: ['Arrival is explicit, not inferred from a vanished timer.', 'The next flight is easy to start.'] },
]

// Review scenes are snapshots; only the in-world actions advance the tutorial.
const onboardingScenes = [
  { title: 'You’re online', phase: 'Wake', heading: 'Wakey wakey. You’re online.', copy: 'Your command network comes online in your home system, already focused on Nyxiour. Your fleet is selected and waiting for your first command.', action: 'Begin systems check', prompt: 'Wakey wakey. You’re online. Let’s make sure everything still works.', note: 'Start with the camera on the selected fleet. There is no search or fleet-selection task before onboarding begins.', checks: ['My fleet is visible, selected, and in focus immediately.', 'The first prompt speaks to me as the newly awakened intelligence.'] },
  { title: 'Motor function', phase: 'Brief', heading: 'Confirm basic motor function.', copy: 'Travel to Nereid to confirm basic motor function. The tutorial supplies a nearby destination; the player learns how to issue the command.', action: 'Open system index', prompt: 'First: basic motor function. Travel to Nereid. Open Objects, find Nereid, then select it to see where it sits in the system.', note: 'Keep the fleet selected. Introduce one concrete objective and one named destination before widening the view.', checks: ['I know exactly where I am being asked to go.', 'The movement check is pending until I actually arrive.'] },
  { title: 'Set destination', phase: 'Target', heading: 'There. The blue world.', copy: 'The camera opens onto the system with Nereid highlighted. Nyxiour remains your active fleet. Plot a course to the tutorial destination.', action: 'Plot course', prompt: 'Nereid is highlighted. Plot a course for Nyxiour, then review the burn before you commit.', note: 'A guided first destination removes choice overload. Other bodies remain scenery during this check.', checks: ['Nereid is clearly highlighted as the objective.', 'Nyxiour remains the fleet receiving my command.'] },
  { title: 'Commit burn', phase: 'Review', heading: 'A small test of the drives.', copy: 'Review the crossing to Nereid, its fuel cost, and the arrival estimate. Commit the burn when ready.', action: 'Engage drive', prompt: 'Course ready. Check the fuel cost, then commit the burn. Let’s see you move.', note: 'Previewing a course does not complete the motor check. Back returns to the same tutorial target without spending fuel.', checks: ['I can review the cost before committing.', 'I can back out without losing the tutorial objective.'] },
  { title: 'Under way', phase: 'Travel', heading: 'Drive response detected.', copy: 'Nyxiour is burning toward Nereid. The motor check remains in progress until arrival.', action: 'Simulate arrival', prompt: 'There we go. Drive response detected. Hold this course to Nereid; we’ll confirm motor function on arrival.', note: 'This is a paused travel snapshot. Simulate arrival advances the storyboard, standing in for the server arrival event.', checks: ['I can see that my command took effect.', 'The tutorial has not marked the motor check complete early.'] },
  { title: 'Mining function', phase: 'Extract', heading: 'Motor function confirmed.', copy: 'You have arrived at Nereid. Next, extract a ten-tonne sample of volatiles to confirm mining function.', action: 'Mine 10 t of volatiles', prompt: 'Motor function confirmed. Nicely done. Now, the mining rig: extract ten tonnes of volatiles from Nereid.', note: 'Arrival confirms movement and introduces the next verb in place. The sample resource and yield are authored tutorial fixtures.', checks: ['Movement is confirmed only after arrival.', 'The mining objective names both the resource and the amount.'] },
  { title: 'Sample extraction', phase: 'Mine', heading: 'Mining rig responding.', copy: 'The extraction is running. Mining function is still being checked; the sample has not reached the hold yet.', action: 'Simulate extraction complete', prompt: 'Mining rig responding. Wait for the sample to reach your hold. We’re looking for ten tonnes of volatiles.', note: 'Starting extraction is not success. This paused snapshot advances on the simulated mining completion event.', checks: ['I can distinguish running extraction from collected cargo.', 'The mining check stays pending until the sample arrives.'] },
  { title: 'Cargo secured', phase: 'Cargo', heading: 'Mining function confirmed.', copy: 'Ten tonnes of volatiles are in the hold. Cargo is not fuel: return to the station, sell it for credits, then buy fuel.', action: 'Plot course to Home Station', prompt: 'Ten tonnes secured. Mining confirmed. Now let’s make this trip sustain the next one. Bring the cargo to Home Station.', note: 'Mining adds cargo, not propellant. Prices and quantities in this study are illustrative; live commands use served quotes.', checks: ['Cargo increased only after extraction finished.', 'I understand that volatiles are not automatically fuel.'] },
  { title: 'Return reserve', phase: 'Review', heading: 'Leave enough to get home.', copy: 'Review the return burn before committing. Fuel and mined cargo share the hold, so capacity matters as well as range.', action: 'Engage return burn', prompt: 'Home Station is in reach. This return costs 4.8 tonnes of fuel. Check the reserve before committing.', note: 'The return preview preserves cargo and fuel until commitment. Back returns to the cargo summary.', checks: ['The return cost and remaining fuel are visible.', 'Cargo and fuel both count toward hold capacity.'] },
  { title: 'Homeward', phase: 'Travel', heading: 'Cargo aboard. Course set.', copy: 'The return burn is committed. Selling and refuelling become available only after docking at the station.', action: 'Simulate station arrival', prompt: 'On the way home. Keep the cargo aboard; the station cannot trade with us until we arrive.', note: 'No sale or purchase is offered during travel. Simulated arrival stands in for confirmed server telemetry.', checks: ['The return burn consumed fuel, not cargo.', 'Trading is unavailable while under way.'] },
  { title: 'Your first sale', phase: 'Trade', heading: 'Turn cargo into credits.', copy: 'Docked at Home Station. Review the station offer: 10 tonnes of volatiles for 100 credits in this simulated quote.', action: 'Sell 10 t for 100 credits', prompt: 'Docking confirmed. Sell the volatiles to the station. Check the offer first: prices depend on the market.', note: 'Selling is an instant accepted transaction: remove cargo and add proceeds together. This quote is authored, not a guaranteed live price.', checks: ['I see the quantity and proceeds before selling.', 'The fleet is docked at the station before trading.'] },
  { title: 'Replenish fuel', phase: 'Refuel', heading: 'Buy the next crossing.', copy: 'The sale credited 100 credits and freed cargo space. Buy 10 tonnes of fuel for 100 credits at the illustrative price of 10 credits per tonne.', action: 'Buy 10 t of fuel · 100 credits', prompt: 'Sale confirmed. Fuel is purchased here, not made automatically from volatiles. Check the price, credits and free hold, then refuel.', note: 'The live game buys fuel at stations. No onboard refining mechanic is implied. Fuel occupies hold space and purchases are limited by credits and capacity.', checks: ['I can afford the fuel and have room for it.', 'The purchase cost and resulting fuel are visible.'] },
  { title: 'Ready for another trip', phase: 'Ready', heading: 'You can sustain your fleet.', copy: 'Movement, mining and refuelling are confirmed. Choose another resource body, check the round-trip fuel budget, and repeat the loop.', action: 'Systems nominal', prompt: 'Fuel aboard. You can travel, extract resources, sell cargo and replenish. Before the next burn, leave enough fuel to reach a station again.', note: 'Close with visible evidence: cargo sold, credits settled and fuel increased after purchase. Reset replays the entire simulated loop.', checks: ['All three checks are confirmed.', 'I know how to fund and fuel another trip.'] },
]

const destinations = [
  { name: 'Nereid', kind: 'Ice giant', className: 'ice', x: 67, y: 65, size: 62, fuel: '4.8', eta: '2m 14s', remaining: '66.5', detail: 'A pale atmosphere, threaded with cobalt storms.' },
  { name: 'Vesper', kind: 'Rocky world', className: 'rock', x: 39, y: 55, size: 26, fuel: '2.1', eta: '1m 08s', remaining: '69.2', detail: 'A quiet, copper-lit world inside the dust belt.' },
  { name: 'Aurelia', kind: 'Gas giant', className: 'gas', x: 83, y: 39, size: 72, fuel: '8.2', eta: '4m 36s', remaining: '63.1', detail: 'Amber cloud bands beyond the outer ring.' },
] as const

const homeStation = { name: 'Home Station', kind: 'Trading station', className: 'rock', x: 31, y: 57, size: 18, fuel: '4.8', eta: '2m 14s', remaining: '61.7', detail: 'Sell cargo and purchase fuel while docked.' } as const

const indexObjects = [...destinations.map(body => ({ ...body, group: 'Worlds' })), { name: 'Inner Belt', kind: 'Asteroid belt', group: 'Resource sites', x: 61, y: 53 }, { ...homeStation, group: 'Stations' }]

type PreviewState = 'ready' | 'loading' | 'empty' | 'error'

export function SystemStoryboard({ mode }: { mode: 'journey' | 'hud' }) {
  const onboarding = mode === 'journey'
  const scenes = onboarding ? onboardingScenes : hudScenes
  const [intro, setIntro] = useState<'objects' | 'station' | 'scan' | 'scanning' | 'ready'>('objects')
  const [step, setStep] = useState(mode === 'hud' ? 2 : 0)
  const reviewButton = useRef<HTMLElement>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [indexOpen, setIndexOpen] = useState(false)
  const [locatorVisible, setLocatorVisible] = useState(false)
  const [located, setLocated] = useState<string | null>(null)
  const [objectFocused, setObjectFocused] = useState(false)
  const [offscreen, setOffscreen] = useState(false)
  const locatedObject = indexObjects.find(object => object.name === located)
  const [target, setTarget] = useState(0)
  const [density, setDensity] = useState<'quiet' | 'rich'>('quiet')
  const [previewState, setPreviewState] = useState<PreviewState>('ready')
  const [orbits, setOrbits] = useState(true)
  const [labels, setLabels] = useState(true)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const scene = scenes[step]
  const returning = onboarding && step >= 8
  const travelling = step === 4 || (onboarding && step === 9)
  const destination = returning ? homeStation : destinations[target]
  const fleetLocation = onboarding && step === 8 ? destinations[0] : destination
  const selected = step >= 2
  const fuel = onboarding && step >= 12 ? '71.7' : onboarding && step >= 9 ? '61.7' : step >= 4 ? destinations[target].remaining : '71.3'
  const miningComplete = onboarding && step >= 7
  const cargo = miningComplete && step < 11 ? 10 : 0
  const credits = onboarding && step === 11 ? 1100 : 1000
  const freeHold = 200 - Number(fuel) - cargo
  const tutorial = onboarding ? onboardingScenes[step] : null
  const fleetFocused = onboarding && step < 2
  const complete = onboarding && step === 12

  function selectDestination(index: number) {
    if (onboarding && (index !== 0 || step < 1 || step > 3 || (step === 1 && intro !== 'ready'))) return
    if (onboarding) { setLocatorVisible(true); setLocated(destinations[index].name); setOffscreen(false); setObjectFocused(false) }
    setTarget(index)
    setStep(2)
  }

  function reset() {
    setIntro('objects')
    setStep(mode === 'hud' ? 2 : 0)
    setTarget(0)
    setIndexOpen(false)
    setLocatorVisible(false)
    setLocated(null)
    setOffscreen(false)
    setObjectFocused(false)
    setChecked({})
    setPreviewState('ready')
    setDensity('quiet')
    setLabels(true)
    setOrbits(true)
  }

  function openObjects(open: boolean) {
    setIndexOpen(open)
    if (open && step === 1 && intro === 'objects') { setIntro('station'); setLocated('Home Station'); setLocatorVisible(true) }
  }
  const introActive = onboarding && step === 1 && intro !== 'ready'
  const introCopy = intro === 'objects' ? 'Let’s see where we are. Open the Objects panel.' : intro === 'station' ? 'This station is your home port. Sell mined cargo here, then buy fuel for your next trip.' : intro === 'scan' ? 'Let’s scan our surroundings. Sweep a nearby host to look for resources.' : 'Sensors working. Waiting for the scan report.'
  function advanceIntro() {
    if (intro === 'objects') openObjects(true)
    else if (intro === 'station') setIntro('scan')
    else if (intro === 'scan') setIntro('scanning')
    else { setIntro('ready'); setLocated(null); setLocatorVisible(false) }
  }

  function advance() {
    if (onboarding && step === 1) { setIndexOpen(true); return }
    setLocatorVisible(false)
    setOffscreen(false)
    setIndexOpen(false)
    setStep(onboarding ? Math.min(step + 1, scenes.length - 1) : step === 5 ? 2 : step + 1)
  }

  const sceneNavigation = (
      <nav className={`${styles.scenes} ${onboarding ? styles.onboardingScenes : ''}`} aria-label="Walkthrough scenes">
        {scenes.map((item, i) => <Button plain key={item.title} data-testid={`scene-${i}`} aria-current={step === i ? 'step' : undefined} onClick={() => { setStep(i); setIntro(i > 1 ? 'ready' : 'objects'); setLocatorVisible(false); setLocated(null); setOffscreen(false); setObjectFocused(false); setIndexOpen(false); setPreviewState('ready') }}><span className={styles.sceneNumber}>{String(i + 1).padStart(2, '0')}</span><span><small>{item.phase}</small><strong>{item.title}</strong></span></Button>)}
      </nav>
  )

  return (
    <main className={`${styles.root} ${onboarding ? styles.game : ''} dark`} onKeyDown={event => { if (event.key === 'Escape') { setLocatorVisible(false); setOffscreen(false) } if (event.key === 'Escape' && reviewOpen) { setReviewOpen(false); reviewButton.current?.focus() } }}>
      {onboarding && <div className={styles.reviewToggle}><span>STORYBOARD · SIMULATED</span><Button plain ref={reviewButton} data-testid="toggle-review" aria-expanded={reviewOpen} aria-controls="storyboard-review" onClick={() => setReviewOpen(!reviewOpen)}>{reviewOpen ? 'Close review ×' : 'Review scenes'}</Button></div>}
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>HEXAVERSE / EXPERIENCE LAB</p><h1>{mode === 'journey' ? 'Coming online' : 'The observatory'}</h1><p className={styles.muted}>{mode === 'journey' ? 'Wake. Travel. Mine. Sell cargo. Replenish fuel.' : 'A working study in light, depth, and just enough information.'}</p></div>
        <div className={styles.headerActions}><span className={styles.prototype}>DESIGN PROTOTYPE · SIMULATED DATA</span><nav aria-label="Design areas"><Button plain href="/dev/system-storyboard" aria-current={mode === 'journey' ? 'page' : undefined} data-testid="journey-link">Coming online</Button><Button plain href="/dev/system-storyboard/hud" aria-current={mode === 'hud' ? 'page' : undefined} data-testid="hud-link">HUD studio ↗</Button></nav></div>
      </header>

      {!onboarding && sceneNavigation}

      <div className={styles.workspace}>
        <section data-scene={step} aria-label="Solar system preview" className={`${styles.viewport} ${onboarding ? styles.onboardingViewport : ''} ${density === 'rich' ? styles.rich : ''}`}>
          <div className={styles.sceneTop}><div><p className={styles.eyebrow}>PERSEUS REACH / HOME SYSTEM</p><h2>Solace <span>α</span></h2><p className={styles.muted}>{onboarding ? 'COMMAND NETWORK / 1 FLEET · 1 SHIP' : '6 visible bodies · 1 fleet'}</p></div><span className={styles.liveDot}>LOCAL SPACE</span></div>

          {onboarding && locatorVisible && offscreen && locatedObject && <Button plain className={styles.edgeLocator} data-testid="edge-locator" onClick={() => { setOffscreen(false); setObjectFocused(true) }}>↗ {locatedObject.name}<small>Outside view · Focus object</small></Button>}
          <div className={`${styles.space} ${fleetFocused ? styles.fleetFocus : ''}`} data-testid="system-camera" data-focus={objectFocused ? 'object' : fleetFocused ? 'fleet' : 'system'} style={offscreen ? { transform: 'translate(-150%, -100%) scale(1.1)' } : objectFocused && locatedObject ? { transform: `translate(-${locatedObject.x}%, -${locatedObject.y}%) scale(1.1)` } : undefined}>
            <svg className={styles.orbitalMap} viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
              <defs><radialGradient id="starlight"><stop stopColor="#ffc879" stopOpacity=".2" /><stop offset="1" stopColor="#ffc879" stopOpacity="0" /></radialGradient></defs>
              <ellipse cx="490" cy="295" rx="260" ry="180" fill="url(#starlight)" />
              {Array.from({ length: 130 }, (_, i) => <circle key={i} cx={(i * 173 + 41) % 1000} cy={(i * i * 37 + 13) % 650} r={i % 7 === 0 ? 1 : .55} fill="#b9d5f5" opacity={.2 + (i % 5) * .12} />)}
              {orbits && <g transform="rotate(-12 490 295)" fill="none" stroke="#738da8" strokeWidth=".7">{[65, 105, 165, 240, 325, 425, 530].map((r, i) => <ellipse key={r} cx="490" cy="295" rx={r} ry={r * .34} opacity={i === 4 ? .35 : .17} />)}</g>}
              {Array.from({ length: 160 }, (_, i) => { const angle = i * 2.39996; const radius = 218 + (i % 13) * 2; return <circle key={`dust-${i}`} cx={(490 + Math.cos(angle) * radius).toFixed(3)} cy={(295 + Math.sin(angle) * radius * .33 - Math.cos(angle) * radius * .2).toFixed(3)} r={i % 3 === 0 ? 1.1 : .6} fill="#b7a68c" opacity=".35" /> })}
              {step >= 3 && (!onboarding || step <= 4 || step === 8 || step === 9) && <path d={`M ${returning ? '670 422' : '310 370'} Q 430 540 ${destination.x * 10} ${destination.y * 6.5}`} fill="none" stroke="#76e3ef" strokeWidth="1.5" strokeDasharray={step === 3 || step === 8 ? '5 7' : undefined} opacity=".8" />}
            </svg>
            <div className={styles.sun} style={{ left: '49%', top: '45.4%' }} />
            <div className={`${styles.smallPlanet} ${styles.rock}`} style={{ left: '45%', top: '42%' }} />
            <div className={`${styles.smallPlanet} ${styles.gas}`} style={{ left: '56%', top: '36%', width: 17, height: 17 }} />
            {destinations.map((body, i) => <div key={body.name} className={styles.bodyAnchor} style={{ left: `${body.x}%`, top: `${body.y}%`, '--planet-size': `${body.size}px` } as CSSProperties}>
              <Button plain className={`${styles.planetButton} ${selected && destination.name === body.name ? styles.selected : ''}`} aria-label={`Select ${body.name}`} aria-pressed={selected && destination.name === body.name} data-testid={`planet-${body.name}`} disabled={step === 4 || previewState !== 'ready' || (onboarding && (i !== 0 || step < 1 || step > 3))} onClick={() => selectDestination(i)}><span className={`${styles.planet} ${styles[body.className]}`} /></Button>
              {labels && (selected && destination.name === body.name || density === 'rich') && <span className={`${styles.bodyLabel} ${body.x > 80 ? styles.labelLeft : ''}`}><strong>{body.name}</strong><small>{body.kind}{step >= 5 && !travelling && destination.name === body.name ? ' · Fleet docked' : ''}</small></span>}
            </div>)}
            {onboarding && <div className={styles.bodyAnchor} style={{ left: '31%', top: '57%' }} data-testid="home-station"><span className={styles.fleetIcon}>◇</span><span className={styles.bodyLabel}><strong>Home Station</strong><small>{step < 4 || step >= 10 ? 'Fleet docked' : 'Home port'}</small></span></div>}
            {onboarding && locatorVisible && locatedObject && !offscreen && <div className={styles.worldLocator} style={{ left: `${locatedObject.x}%`, top: `${locatedObject.y}%` }} data-testid="world-locator"><span className={styles.locatorRing} /><div className={styles.locatorLabel}><strong>{locatedObject.name}</strong><small>{locatedObject.kind}</small><Button plain data-testid="locator-close" aria-label="Close object locator" onClick={() => { setLocatorVisible(false); setOffscreen(false) }}>×</Button></div></div>}
            {(onboarding || step >= 1) && <div className={`${styles.ship} ${onboarding ? styles.activeFleet : ''}`} data-testid="active-fleet" aria-label={onboarding ? 'Nyxiour, selected fleet' : 'Nyxiour'} style={{ left: onboarding && step === 9 ? '49%' : step >= 5 ? `${fleetLocation.x - (onboarding ? 12 : 3)}%` : step === 4 ? `${(31 + destination.x) / 2}%` : '31%', top: onboarding && step === 9 ? '69%' : step >= 5 ? `${fleetLocation.y + (onboarding ? 12 : 5)}%` : step === 4 ? '69%' : '57%' }}><span>◈</span>{labels && !(onboarding && step >= 5) && <small>NYXIOUR{travelling ? ' / BURNING' : onboarding ? ' / SELECTED' : ''}</small>}</div>}
          </div>

          {density === 'rich' && previewState === 'ready' && <aside className={styles.objectList} aria-label="System objects"><p className={styles.eyebrow}>SYSTEM OBJECTS</p><p className={styles.muted}>Solace · G-type star</p>{destinations.map((body, i) => <Button plain key={body.name} data-testid={`object-${i}`} disabled={step === 4} aria-pressed={target === i && selected} onClick={() => selectDestination(i)}><span className={`${styles.dot} ${styles[body.className]}`} />{body.name}</Button>)}</aside>}

          <div className={onboarding ? styles.leftRail : undefined} data-testid="story-command-rail">
          {onboarding && step >= 1 && previewState === 'ready' && <SystemIndex objects={indexObjects.map(object => ({ ...object, ...(object.name === 'Nereid' && (miningComplete || intro === 'ready') ? { resources: 'Volatiles · disclosed' } : {}), fleets: step >= 5 && !travelling && object.name === fleetLocation.name ? ['Nyxiour'] : [] }))} canPlot={step === 2} onPlot={() => { setLocatorVisible(false); setOffscreen(false); setStep(3); setIndexOpen(false) }} selected={located} open={indexOpen} onOpen={openObjects} onSelect={name => { setLocatorVisible(true); setLocated(name); setObjectFocused(false); setOffscreen(false); if (name === 'Nereid' && step <= 3 && intro === 'ready') { setTarget(0); setStep(2) } }} onFocus={() => { setObjectFocused(true); setOffscreen(false) }} offscreen={offscreen} onOffscreen={() => { setLocatorVisible(true); setOffscreen(true); setObjectFocused(false); setIndexOpen(false) }} />}
          {previewState !== 'ready' ? <div className={styles.stateOverlay} role="status"><p className={styles.eyebrow}>{previewState === 'loading' ? 'ESTABLISHING UPLINK' : previewState === 'empty' ? 'NO FLEET IN THIS SYSTEM' : 'SIGNAL INTERRUPTED'}</p><h3>{previewState === 'loading' ? 'Resolving local space…' : previewState === 'empty' ? 'A quiet corner of the galaxy.' : 'We couldn’t load this system.'}</h3><p className={styles.muted}>{previewState === 'loading' ? 'Your system view will appear when telemetry arrives.' : previewState === 'empty' ? 'There are no fleets here to command. Return to your fleet’s system to plot a course.' : 'Your last command has not been changed. Reconnect to retrieve current telemetry.'}</p><Button color="cyan" data-testid="state-recover" onClick={() => setPreviewState('ready')}>{previewState === 'error' ? 'Retry connection' : previewState === 'empty' ? 'Return to my fleet' : 'Simulate data received'}</Button></div>
            : !onboarding && step === 0 ? <div className={styles.welcome}><p className={styles.eyebrow}>YOUR JOURNEY BEGINS HERE</p><h3>There is a whole<br />system out there.</h3><p>And one small ship with your name on it.</p><Button color="cyan" data-testid="preview-action" onClick={advance}>Find my fleet <span aria-hidden="true">↗</span></Button></div>
            : <aside className={styles.inspector} aria-label="Contextual command panel" hidden={onboarding && (indexOpen || introActive)}>
              <p className={styles.eyebrow}>{step <= 1 ? 'YOUR FLEET · SELECTED' : step === 3 || step === 8 ? 'COURSE PREVIEW' : travelling ? 'FLIGHT IN PROGRESS' : step === 6 ? 'EXTRACTION IN PROGRESS' : complete ? 'SYSTEMS NOMINAL' : step === 10 ? 'STATION MARKET' : step === 11 ? 'FUEL PURCHASE' : step === 7 ? 'CARGO SECURED' : step === 5 ? 'ARRIVAL CONFIRMED' : 'SELECTED WORLD'}</p>
              <div className={styles.inspectorTitle}>{selected && <span className={`${styles.portrait} ${styles[destination.className]}`} />}<div><h3>{selected ? destination.name : 'Nyxiour'}</h3><p className={styles.muted}>{selected ? destination.kind : 'Explorer · First fleet'}</p></div></div>

              {step === 2 && <p className={styles.description}>{destination.detail}</p>}
              <div className={styles.telemetry}>
                {step <= 1 && <><span>Location <strong>Inner anchorage</strong></span><span>Drive <strong>Ready</strong></span></>}
                {step === 2 && <><span>Known from <strong>Astronomical observation</strong></span><span>Surface resources <strong>{onboarding ? 'Inspect on arrival' : 'Not yet surveyed'}</strong></span></>}
                {(step === 3 || (onboarding && step === 8)) && <><span>Departure <strong>{returning ? 'Nereid' : 'Inner anchorage'}</strong></span><span>Arrival in <strong>{destination.eta}</strong></span><span>Fuel required <strong>{destination.fuel} t</strong></span><span>Fuel after burn <strong>{destination.remaining} t</strong></span></>}
                {travelling && <><span>Fleet <strong>Nyxiour → {destination.name}</strong></span><span>Arrival in <strong>{destination.eta}</strong></span><div className={styles.progress}><i /></div><small>Burn committed · illustrative flight snapshot</small></>}
                {step >= 5 && !travelling && <><span>Fleet <strong>Nyxiour</strong></span><span>Status <strong>{step === 8 ? 'Docked at Nereid' : `Docked at ${destination.name}`}</strong></span><span>Fuel remaining <strong>{fuel} t</strong></span>{onboarding && <><span>Cargo resource <strong>Volatiles</strong></span><span>Sample in hold <strong data-testid="sample-cargo">{cargo} t</strong></span>{step === 6 && <span>Extraction <strong>Running · 0 / 10 t</strong></span>}</>}</>}
                {onboarding && step >= 5 && <><span>Free hold <strong data-testid="free-hold"><Figure raw={freeHold} unit="tons" text={formatTons(freeHold)} /> / <Figure raw={200} unit="tons" text={formatTons(200)} /></strong></span><span>Credits <strong data-testid="story-credits">{credits.toLocaleString('en-US')}</strong></span></>}
                {onboarding && step === 10 && <span>Sale offer <strong>10 t → 100 credits</strong></span>}
                {onboarding && step === 11 && <><span>Fuel price <strong>10 credits / t · simulated</strong></span><span>Fuel after purchase <strong>71.7 t</strong></span><span>Credits after purchase <strong>1,000</strong></span></>}
              </div>
              <Button color="cyan" className={styles.primary} data-testid="preview-action" disabled={complete} onClick={advance}>{scene.action} <span aria-hidden="true">↗</span></Button>
              {(step === 3 || (onboarding && step === 8)) && <Button plain className={styles.primary} data-testid="cancel-course" onClick={() => setStep(returning ? 7 : 2)}>Back to {returning ? 'cargo' : 'destination'}</Button>}
              {!onboarding && step === 5 && <p className={styles.muted}>You can now plan your next crossing.</p>}
            </aside>}
          </div>
              {tutorial && !introActive && previewState === 'ready' && <div className={styles.tutorialPrompt} role="status" aria-live="polite" data-testid="tutorial-prompt">
                <p className={styles.eyebrow}><span className={styles.transmissionMark}>⌁</span> RECOVERY SIGNAL / {step >= 8 ? '03' : step >= 5 ? '02' : '01'}</p>
                <p>{tutorial.prompt}</p>
                <ol className={styles.functionChecks} aria-label="Startup checks">
                  <li data-testid="motor-check" data-state={step >= 5 ? 'complete' : 'pending'}><span>{step >= 5 ? '✓' : '01'}</span> Motor function <strong>{step >= 5 ? 'Confirmed' : step === 4 ? 'In progress' : 'Pending'}</strong></li>
                  <li data-testid="mining-check" data-state={miningComplete ? 'complete' : 'pending'}><span>{miningComplete ? '✓' : '02'}</span> Mining function <strong>{miningComplete ? 'Confirmed' : step === 6 ? 'In progress' : 'Pending'}</strong></li>
                  <li data-testid="fuel-check" data-state={complete ? 'complete' : 'pending'}><span>{complete ? '✓' : '03'}</span> Refuelling <strong>{complete ? 'Confirmed' : 'Pending'}</strong></li>
                </ol>
              </div>}

          {introActive && <aside className={styles.introTransmission} aria-label="Recovery transmission"><p className={styles.eyebrow}>RECOVERY SIGNAL</p><p data-testid="intro-prompt">{introCopy}</p><Button color="cyan" data-testid="intro-action" onClick={advanceIntro}>{intro === 'objects' ? 'Open Objects panel' : intro === 'station' ? 'Check sensors' : intro === 'scan' ? 'Simulate scan' : 'Simulate scan completion'}</Button></aside>}
          <footer className={styles.fleetBar}><div className={styles.fleetIdentity}><span className={styles.fleetIcon}>◈</span><div><strong>Nyxiour{onboarding && <span className={styles.assetCount}> / 1 SHIP</span>}</strong><small>{previewState === 'empty' ? 'In another system' : travelling ? `Burning to ${destination.name}` : step >= 5 ? `Docked at ${fleetLocation.name}${step === 6 ? ' · Mining' : miningComplete ? ` · ${cargo} t volatiles` : ''}` : onboarding ? 'Docked at Home Station' : 'Holding · Inner anchorage'}</small></div></div><div className={styles.fuel}><span>FUEL <strong>{fuel} <small>t</small></strong></span><div><i style={{ width: `${Number(fuel)}%` }} /></div></div><div className={styles.credits}><small>AVAILABLE CREDITS</small><strong>₡ {credits.toLocaleString('en-US')}</strong></div></footer>
          <span className={styles.previewCaption}>ART & INTERACTION STUDY / NOT LIVE TELEMETRY</span>
        </section>

        <aside id="storyboard-review" className={styles.review} aria-label="Storyboard controls" hidden={onboarding && !reviewOpen}>
          {onboarding && sceneNavigation}
          {mode === 'hud' && <section><p className={styles.eyebrow}>01 / COMPOSITION</p><h2>Give space some space.</h2><p className={styles.muted}>Compare the same moment with two levels of information.</p><div className={styles.controlRow}>{(['quiet', 'rich'] as const).map(value => <Button outline key={value} data-testid={`density-${value}`} aria-pressed={density === value} onClick={() => setDensity(value)}>{value === 'quiet' ? 'Cinematic' : 'Information rich'}</Button>)}</div><div className={styles.controlRow}><Button plain data-testid="toggle-orbits" aria-pressed={orbits} onClick={() => setOrbits(!orbits)}>Orbits {orbits ? 'on' : 'off'}</Button><Button plain data-testid="toggle-labels" aria-pressed={labels} onClick={() => setLabels(!labels)}>Labels {labels ? 'on' : 'off'}</Button></div><p className={styles.eyebrow}>02 / SYSTEM STATES</p><div className={styles.controlRow}>{(['ready', 'loading', 'empty', 'error'] as const).map(value => <Button outline key={value} data-testid={`state-${value}`} aria-pressed={previewState === value} onClick={() => setPreviewState(value)}>{value}</Button>)}</div></section>}
          <section><p className={styles.eyebrow} role="status" aria-live="polite">SCENE {String(step + 1).padStart(2, '0')} / {String(scenes.length).padStart(2, '0')} · {scene.phase}</p><h2>{scene.heading}</h2><p>{scene.copy}</p><div className={styles.controlRow}><Button outline data-testid="previous-scene" disabled={step === 0} onClick={() => setStep(step - 1)}>← Previous</Button><Button color="cyan" data-testid="next-scene" disabled={step === scenes.length - 1} onClick={() => setStep(step + 1)}>Next →</Button></div></section>
          <section><p className={styles.eyebrow}>DESIGN INTENT</p><p className={styles.muted}>{scene.note}</p><div className={styles.checks}>{scene.checks.map((check, i) => <CheckboxField key={`${step}-${i}`}><Checkbox data-testid={`review-check-${i}`} checked={checked[`${step}-${i}`] ?? false} onChange={value => setChecked({ ...checked, [`${step}-${i}`]: value })} /><Label>{check}</Label></CheckboxField>)}</div></section>
          {!onboarding && <section className={styles.palette}><p className={styles.eyebrow}>DEEP-SPACE OBSERVATORY</p><div aria-label="Palette: void, glass, frost, signal cyan, starlight">{['#060b12', '#152332', '#cbd8e5', '#76e3ef', '#efbc76'].map(color => <i key={color} style={{ background: color }} />)}</div><p className={styles.muted}>Sculpted worlds. Warm starlight.<br />Quiet instruments. One clear next move.</p></section>}
          <Button plain data-testid="restart-storyboard" onClick={reset}>↺ Reset study</Button>
        </aside>
      </div>
      <footer className={styles.pageFooter}><span>HEXAVERSE DESIGN LAB / 001</span><span>Local prototype · fictional names and travel estimates · no commands sent · review checks reset on reload</span></footer>
    </main>
  )
}
