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
import styles from './hud-object-thumbnail.module.css'

const thumbnails = { fleet, station, rocky, 'resource-site': resourceSite, star, gas_giant: gasGiant, ice, moon }
export type HudObjectKind = keyof typeof thumbnails

type HudObjectThumbnailProps = ({
  analyzed: false
  kind?: never
} | {
  analyzed?: true
  kind: HudObjectKind
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
  return <KnownThumbnail key={props.kind} {...props} />
}

function KnownThumbnail({ kind, alt = '', className }: Extract<HudObjectThumbnailProps, { kind: HudObjectKind }>) {
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
