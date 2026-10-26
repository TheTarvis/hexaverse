'use client'

import { useRef, useState, type ComponentProps } from 'react'
import { HudCardShell } from '@/components/hud/HudCardShell'
import { TuningCard } from './TuningCard'
import { useLocalTuning } from './LocalTuningContext'

export function TunableHudCard({ groups, ...props }: ComponentProps<typeof HudCardShell> & { groups?: string[] }) {
  const tuneButton = useRef<HTMLButtonElement>(null)
  const tuning = useLocalTuning()
  const [editing, setEditing] = useState(false)
  const available = !!groups?.length && !!tuning?.snapshot
  return <>
    <HudCardShell {...props} tuneButtonRef={tuneButton} paused={editing || props.paused} hidden={editing} style={editing ? { display: 'none' } : props.style} onTune={available ? () => setEditing(true) : undefined} />
    {editing && available && <TuningCard groups={groups} onBack={() => { setEditing(false); requestAnimationFrame(() => tuneButton.current?.focus()) }} onClose={props.onClose} closeLabel={props.closeLabel} className={props.className} contentClassName={props.contentClassName} style={props.style} />}
  </>
}
