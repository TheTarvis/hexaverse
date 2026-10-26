'use client'

import { useEffect, useId, useRef, useState, type ComponentProps } from 'react'
import { HudCardBack, HudCardShell } from '@/components/hud/HudCardShell'
import { HudActionBand } from '@/components/hud/HudActionBand'
import { HudButton, HudSelect } from '@/components/hud/HudControls'
import { Input } from '@/components/catalyst/input'
import { HudHeading, HudText } from '@/components/hud/HudTypography'
import { toast } from '@/lib/toast'
import type { TuningProfile, TuningSnapshot } from '@/lib/types/tuning'
import { useLocalTuning } from './LocalTuningContext'
import styles from './tuning.module.css'

type Props = Omit<ComponentProps<typeof HudCardShell>, 'children' | 'footer'> & { groups?: string[]; onBack?: () => void }

export function TuningCard(props: Props) {
  const tuning = useLocalTuning()
  if (!tuning?.snapshot) return null
  return <TuningEditor {...props} snapshot={tuning.snapshot} />
}

function TuningEditor({ groups, onBack, snapshot, ...shell }: Props & { snapshot: TuningSnapshot }) {
  const tuning = useLocalTuning()!
  const [values, setValues] = useState({ ...snapshot.profile.values })
  useEffect(() => { setValues({ ...snapshot.profile.values }) }, [snapshot.profile])
  const available = [...new Set(snapshot.fields.filter(field => !groups || groups.includes(field.group)).map(field => field.group))]
  const [group, setGroup] = useState(available[0] ?? 'World')
  const file = useRef<HTMLInputElement>(null)
  const formId = useId()
  const fields = snapshot.fields.filter(field => field.group === group)
  const profile = (): TuningProfile => ({ version: 1, values })
  const defaults = (all: boolean) => setValues(current => ({ ...current, ...Object.fromEntries(snapshot.fields.filter(field => all || field.group === group).map(field => [field.key, field.default])) }))
  async function apply() {
    if (Object.values(values).some(value => !Number.isFinite(value))) { toast.error('Enter a number for every setting'); return }
    try { await tuning.apply(profile()); toast.success('Tuning saved') } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not apply tuning') }
  }
  async function importFile(selected: File | undefined) {
    if (!selected) return
    try {
      await tuning.stage(JSON.parse(await selected.text()) as TuningProfile)
      toast.success('Imported settings saved for the next backend restart')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not import tuning') }
  }
  function exportProfile() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot.profile, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'hexaverse-tuning.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function regenerate() {
    try { await tuning.regenerate(); window.location.assign('/') } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not regenerate world') }
  }
  return <HudCardShell {...shell} title={shell.title ?? "Tuning"} footer={<HudActionBand label="Tuning actions" actions={[
    { id: 'defaults', label: 'Restore defaults', onClick: () => defaults(false), disabled: tuning.pending },
    { id: 'apply', label: tuning.pending ? 'Working…' : 'Apply', onClick: () => (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit(), disabled: tuning.pending },
  ]} />}>
    {onBack && <HudCardBack destination="card" onClick={onBack} autoFocus />}
    <HudSelect aria-label="Tuning section" value={group} onChange={event => setGroup(event.target.value)}>{available.map(name => <option key={name}>{name}</option>)}</HudSelect>
    <form id={formId} className={styles.fields} onSubmit={event => { event.preventDefault(); const form = event.currentTarget; if (form.reportValidity()) void apply() }}>
      <HudHeading variant="section" level={3}>{group}</HudHeading>
      {fields.map(field => <label key={field.key} className={styles.field}>
        <span>{field.label}</span>
        <Input type="number" aria-label={field.label} min={field.min} max={field.max} step={field.integer ? 1 : 'any'} required value={Number.isFinite(values[field.key]) ? values[field.key] : ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.valueAsNumber }))} />
        <HudText>{field.unit} · Active: {snapshot.active[field.key]}{field.regenerate ? ' · Requires regeneration' : ' · Applies live'}</HudText>
      </label>)}
    </form>
    {!groups && <div className={styles.files}>
      <HudText>{snapshot.restartPending ? 'Saved settings differ from the running world. Restart for imported values; regenerate for orbit/generation changes.' : 'Local tuning is saved on Apply.'}</HudText>
      <HudButton presentation="chrome" onClick={exportProfile}>Export JSON</HudButton>
      <HudButton presentation="chrome" disabled={tuning.pending} onClick={() => file.current?.click()}>Import JSON</HudButton>
      <input ref={file} type="file" accept="application/json,.json" aria-label="Import tuning JSON" hidden onChange={event => { void importFile(event.target.files?.[0]); event.target.value = '' }} />
      <HudButton presentation="chrome" disabled={tuning.pending} onClick={() => defaults(true)}>Restore all tuning defaults</HudButton>
      <HudText>Regenerate clears local gameplay, corporations, fleets and actions. Login accounts and tuning are retained.</HudText>
      <HudButton presentation="chrome" tone="danger" disabled={tuning.pending} onClick={() => { void regenerate() }}>Regenerate local world</HudButton>
    </div>}
  </HudCardShell>
}
