'use client'

import { useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { PhotoIcon } from '@heroicons/react/24/outline'
import { HudIcon } from './HudIcon'
import fleet from './thumbnails/fleet.png'
import station from './thumbnails/station.png'
import rocky from './thumbnails/rocky.png'
import resourceSite from './thumbnails/resource-site.png'
import star from './thumbnails/star.png'
import gasGiant from './thumbnails/gas_giant.png'
import ice from './thumbnails/ice.png'
import moon from './thumbnails/moon.png'
import gate from './thumbnails/gate.png'
import anomaly from './thumbnails/anomaly.png'
import ruin from './thumbnails/ruin.png'
import nebula from './thumbnails/nebula.png'
import gravityWell from './thumbnails/gravity_well.png'
import debris from './thumbnails/debris.png'
import radiation from './thumbnails/radiation.png'
import styles from './hud-object-thumbnail.module.css'

const thumbnails = { fleet, station, rocky, 'resource-site': resourceSite, star, gas_giant: gasGiant, ice, moon, gate, anomaly, ruin, nebula, gravity_well: gravityWell, debris, radiation }
export type HudObjectKind = keyof typeof thumbnails

/** Resolve disclosed categories only; unknown types never inherit another object's art. */
export function resolveHudObjectKind(kind: string): HudObjectKind | null {
  const normalized = kind.trim().toLowerCase().replaceAll(' ', '_')
  if (normalized === 'belt' || normalized === 'asteroid_belt') return 'resource-site'
  if (normalized === 'lane_gate') return 'gate'
  return Object.hasOwn(thumbnails, normalized) ? normalized as HudObjectKind : null
}

type HudObjectThumbnailProps = ({
  analyzed: false
  kind?: never
} | {
  analyzed?: true
  kind: string
}) & {
  alt?: string
  className?: string
}

/** Callers supply disclosed analysis state; this component never infers detection. */
export function HudObjectThumbnail(props: HudObjectThumbnailProps) {
  const { alt = '', className } = props
  if (props.analyzed === false) {
    return (
      <span
        className={clsx(styles.thumbnail, styles.unresolved, className)}
        {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
      />
    )
  }
  const kind = resolveHudObjectKind(props.kind)
  if (!kind) {
    return <span
      className={clsx(styles.thumbnail, styles.frame, className)}
      {...(alt ? { role: 'img', 'aria-label': `${alt} — no category image` } : { 'aria-hidden': true })}
      title="No category image"
    ><HudIcon icon={PhotoIcon} className={styles.placeholder} /></span>
  }
  return <KnownThumbnail key={kind} kind={kind} alt={alt} className={className} />
}

function KnownThumbnail({ kind, alt = '', className }: { kind: HudObjectKind; alt?: string; className?: string }) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading')
  const status = phase === 'failed' ? 'Image unavailable' : phase === 'loading' ? 'Loading image' : ''
  const label = status ? `${alt} — ${status.toLowerCase()}` : alt

  return (
    <span
      className={clsx(styles.thumbnail, styles.frame, className)}
      {...(alt ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      {...(status ? { title: status } : {})}
    >
      {phase !== 'ready' && <HudIcon icon={PhotoIcon} className={styles.placeholder} />}
      {phase !== 'failed' && (
        <Image
          src={thumbnails[kind]}
          alt=""
          width={32}
          height={32}
          unoptimized
          className={clsx(styles.image, phase === 'loading' && styles.loading)}
          onLoad={() => setPhase('ready')}
          onError={() => setPhase('failed')}
        />
      )}
    </span>
  )
}
