'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/catalyst/dialog'
import { useCelestialName, useSurvey, useSurveyOptions } from '@/hooks/use-discovery'
import type { SpaceBody } from '@/lib/types/system-space'

export function CelestialActions({ systemId, body, fleetId, onSettled }: {
  systemId: string
  body: SpaceBody
  fleetId: string | null
  onSettled: () => void
}) {
  const eligible = ['star', 'rocky', 'gas_giant', 'ice', 'moon'].includes(body.type)
  const options = useSurveyOptions(eligible ? fleetId : null)
  const survey = useSurvey()
  const naming = useCelestialName()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const wasSurveying = useRef(false)
  const settleRef = useRef(onSettled)
  settleRef.current = onSettled
  const running = options.data?.survey
  useEffect(() => {
    if (wasSurveying.current && !running && options.isSuccess) settleRef.current()
    wasSurveying.current = !!running
  }, [running, options.isSuccess])
  const target = options.data?.targets.find(target => target.bodyId === body.id)
  const history = body.discovery
  return <div className="space-y-3 text-sm" data-testid="celestial-actions">
    <dl>
      <dt>Owner</dt><dd>{body.ownerCorpId ?? 'Unclaimed'}</dd>
      {history?.firstArrival && <><dt>First arrival</dt><dd>{history.firstArrival.corporationId} · {history.firstArrival.at}</dd></>}
      {history?.firstSurvey && <><dt>First survey</dt><dd>{history.firstSurvey.corporationId} · {history.firstSurvey.at}</dd></>}
      {history?.firstPlayerName && <><dt>Name confirmed</dt><dd>{history.firstPlayerName.corporationId} · {history.firstPlayerName.at}</dd></>}
    </dl>
    {eligible && <>
      {body.namingProtected ? <p>This place has a protected name.</p> : <>
        <p>Survey range: {options.data?.range ?? '…'} units · Duration: {options.data ? options.data.durationMs / 1000 : '…'} world seconds</p>
        {options.data?.outcome && <p role="status">{options.data.outcome}</p>}
        {running && <progress aria-label="Survey progress" max={Math.max(1, running.arriveMs - running.departMs)} value={Math.max(0, Math.min(running.arriveMs, options.data?.worldTime ?? running.departMs) - running.departMs)} />}
        {running && <p role="status">Surveying {running.bodyId === body.id ? body.name ?? body.id : 'another body'} · {Math.max(0, Math.ceil((running.arriveMs - (options.data?.worldTime ?? 0)) / 1000))} world seconds remaining</p>}
        {!fleetId && <p>Select a command fleet in this system to survey.</p>}
        {fleetId && <Button data-testid="survey-body" disabled={!target?.eligible || survey.isPending} onClick={() => survey.mutate({ fleetId, bodyId: body.id })}>Survey</Button>}
        {target?.reason && <p>{target.reason}</p>}
        {options.data?.inTransit && <p>Surveys require a fleet in this system.</p>}
        {options.isError && <p role="alert">Survey prerequisites are unavailable.</p>}
        {survey.isError && <p role="alert">{survey.error.message}</p>}
      </>}
      {body.canName && <><p>Your naming right is reserved. You can choose a name from anywhere.</p><Button data-testid="name-body" onClick={() => { setOpen(true); setPreview(null); naming.reset() }}>Choose permanent name</Button></>}
      {history?.firstPlayerName && <p>This name is locked.</p>}
      {!body.canName && !history?.firstPlayerName && body.ownerCorpId && <p>{history?.firstSurvey ? "The owner’s naming right is reserved." : "The owner must complete a survey to earn naming eligibility."}</p>}
    </>}
    <Dialog open={open} onClose={setOpen}>
      <DialogTitle>Name {body.name ?? body.catalogueRef}</DialogTitle>
      <DialogDescription>The first confirmed name is permanent.</DialogDescription>
      <DialogBody>{preview === null ? <><label htmlFor="celestial-name">Name</label><Input id="celestial-name" data-testid="celestial-name" value={draft} onChange={event => setDraft(event.target.value)} /><p>3–40 characters: Latin letters, numbers, spaces, apostrophes, and hyphens.</p></> : <p data-testid="name-preview">Everyone will see: <strong>{preview}</strong></p>}{naming.isError && <p role="alert">{naming.error.message}</p>}</DialogBody>
      <DialogActions>
        <Button plain onClick={() => setOpen(false)}>Cancel</Button>
        {preview === null ? <Button data-testid="preview-name" disabled={!draft.trim()} onClick={() => setPreview(draft.trim().replace(/\s+/g, ' '))}>Preview</Button> : <><Button plain onClick={() => setPreview(null)}>Edit</Button><Button data-testid="confirm-name" disabled={naming.isPending} onClick={() => naming.mutate({ systemId, bodyId: body.id, name: preview }, { onSuccess: () => setOpen(false) })}>Confirm permanent name</Button></>}
      </DialogActions>
    </Dialog>
  </div>
}
