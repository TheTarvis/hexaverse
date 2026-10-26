'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMine, useMiningOptions } from './use-fleets'
import { useRunningMine, useCancelAction } from './use-actions'
import { useSubmitGuard } from './use-submit-guard'
import { actionService, fleetService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import { BOARD_POLL_MS, ETA_CUSHION_MS } from '@/lib/realtime'
import { wallMsUntil, type WorldClock } from '@/lib/client-clock'
import { mineErrorCopy, commandErrorReason } from '@/lib/rejection-copy'
import { miningFleet, resourceHost, attachedToHost } from '@/lib/hud-action-targets'
import type { Fleet } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'
import type { ResourceKind, SpaceBody } from '@/lib/types/system-space'
import type { MiningCardProps } from '@/components/space/MiningCard'
import type { ObjectSearchValue } from '@/components/space/ObjectSearch'
import { emptyObjectSearch } from '@/components/space/ObjectSearch'

type Pair = { fleetId: string | null; targetId: string | null }
type Step = 'fleet' | 'target' | 'review'
interface Options {
  systemId: string
  fleets: readonly Fleet[]
  features: readonly SpaceBody[]
  clock: WorldClock
  worldTime: number
  scale: number | undefined
  failed: boolean
  loading: boolean
  onExit?: (toFleetOverview: boolean) => void
  onFleet: (id: string) => void
  onAccepted: (accepted: { fleetId: string; featureId: string; actionId: string; kind: ResourceKind; tons: number; cargoBefore: number }) => void
}

/** Session drafts and receipts survive panel dismissal; the server remains the command authority. */
export function useMiningJourney(options: Options) {
  const { systemId, fleets, features, clock, worldTime, scale } = options
  const qc = useQueryClient()
  const mutation = useMine(systemId)
  const guard = useSubmitGuard()
  const cancelGuard = useSubmitGuard()
  const cancelMutation = useCancelAction(systemId)
  const [active, setActive] = useState(false)
  const [pair, setPair] = useState<Pair>({ fleetId: null, targetId: null })
  const [step, setStep] = useState<Step>('fleet')
  const [origin, setOrigin] = useState<'fleet' | 'object'>('fleet')
  const [drafts, setDrafts] = useState<Record<string, { kind: ResourceKind; quantity: string }>>({})
  const [receipts, setReceipts] = useState<Record<string, GameAction>>({})
  const [queries, setQueries] = useState<Record<'fleet' | 'target', ObjectSearchValue>>({ fleet: { ...emptyObjectSearch, type: 'fleets' }, target: { ...emptyObjectSearch, type: 'resource-sites' } })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const ignored = useRef(new Set<string>())
  const fleet = fleets.find(item => item.id === pair.fleetId) ?? null
  const target = features.find(item => item.id === pair.targetId) ?? null
  const optionsRead = useMiningOptions(pair.fleetId)
  const candidateFleets = target && !pair.fleetId ? fleets.filter(item => miningFleet(item, target, systemId)) : []
  const candidateReads = useQueries({ queries: candidateFleets.map(item => ({ queryKey: queryKeys.fleets.miningOptions(item.id),
    queryFn: () => fleetService.miningOptions(item.id), retry: false, refetchInterval: BOARD_POLL_MS })) })
  const eligibleCandidates = candidateFleets.filter((item, index) => candidateReads[index]?.data?.eligible && candidateReads[index]?.data?.featureId === target?.id)
  const prerequisites = optionsRead.data
  const runningRead = useRunningMine(pair.fleetId)
  const servedRunning = runningRead.data && !ignored.current.has(runningRead.data.id) ? runningRead.data : null
  useEffect(() => {
    if (!pair.fleetId || pair.targetId || !servedRunning || servedRunning.actor !== pair.fleetId) return
    const hostId = String(servedRunning.params?.featureId ?? '').split('#')[0]
    if (!features.some(body => body.id === hostId)) return
    setPair(previous => ({ ...previous, targetId: hostId })); setStep('review')
  }, [pair.fleetId, pair.targetId, servedRunning, features])
  const receipt = pair.fleetId ? receipts[pair.fleetId] : null
  const tracked = receipt ?? servedRunning
  const trackedEta = tracked?.eta
  const actionId = tracked?.id
  const actorId = pair.fleetId
  const actionRead = useQuery({
    queryKey: queryKeys.actions.detail(fleet?.corporationId ?? '', actionId ?? ''), enabled: false, retry: false,
    queryFn: async () => {
      if (!actorId || !actionId) throw new Error('No mining action selected')
      // Fleet reads resolve due mining. Read the exact outcome only after that read succeeds.
      const refreshed = await fleetService.get(actorId)
      const action = await actionService.get(actionId)
      if (action.id !== actionId || action.actor !== actorId || action.type !== 'mine') throw new Error('Mining action identity changed')
      qc.setQueryData(queryKeys.fleets.detail(actorId), refreshed)
      return action
    },
  })
  const action = actionRead.data?.id === actionId ? actionRead.data : tracked
  const terminal = !!action && action.status !== 'running'
  const readRef = useRef(actionRead.refetch)
  readRef.current = actionRead.refetch
  const check = useCallback(() => { void readRef.current({ cancelRefetch: false }) }, [])
  useEffect(() => {
    if (!actionId || terminal) return
    check()
    const timer = setTimeout(check, Math.max(0, wallMsUntil(clock, trackedEta!)) + ETA_CUSHION_MS)
    const interval = setInterval(check, BOARD_POLL_MS)
    const reconnect = () => check()
    window.addEventListener('sse-reconnect', reconnect)
    const unsubscribe = actionService.subscribe(systemId, data => {
      if (data && typeof data === 'object' && 'actionId' in data && data.actionId === actionId) check()
    }, check)
    return () => { clearTimeout(timer); clearInterval(interval); window.removeEventListener('sse-reconnect', reconnect); unsubscribe() }
  }, [actionId, terminal, clock, trackedEta, systemId, check])
  const completed = useRef(new Set<string>())
  useEffect(() => {
    if (!action || action.status === 'running' || completed.current.has(action.id)) return
    completed.current.add(action.id)
    ignored.current.add(action.id)
    void qc.invalidateQueries({ queryKey: queryKeys.fleets.mine() })
    void qc.invalidateQueries({ queryKey: queryKeys.systemSpace.detail(systemId) })
    void qc.invalidateQueries({ queryKey: queryKeys.actions.running(action.actor) })
  }, [action, qc, systemId])

  const key = `${pair.fleetId ?? ''}:${pair.targetId ?? ''}`
  const resources = (target?.resources ?? []).filter(resource => resource.richness > 0 && prerequisites?.resources.some(option => option.kind === resource.kind && option.remainingTons > 0))
  const fallbackKind = [...resources].sort((a, b) => b.richness - a.richness)[0]?.kind ?? 'metals'
  const draft = drafts[key] ?? { kind: fallbackKind, quantity: String(prerequisites?.freeHold ?? fleet?.roster?.freeHold ?? 0) }
  const draftFleetId = fleet?.id
  const draftTargetId = target?.id
  const optionsTargetId = prerequisites?.featureId
  const optionsFreeHold = prerequisites?.freeHold
  useEffect(() => {
    if (!draftFleetId || !draftTargetId || optionsTargetId !== draftTargetId || optionsFreeHold === undefined) return
    setDrafts(previous => previous[key] ? previous : { ...previous, [key]: { kind: fallbackKind, quantity: String(optionsFreeHold) } })
  }, [draftFleetId, draftTargetId, optionsTargetId, optionsFreeHold, key, fallbackKind])
  const kind = draft.kind
  const changeDraft = (patch: Partial<typeof draft>) => { setDrafts(previous => ({ ...previous, [key]: { ...draft, ...patch } })); setError(null) }
  const blocker = options.loading ? 'Loading mining readings…' : options.failed || runningRead.isError || optionsRead.isError ? 'Mining readings are unavailable.'
    : optionsRead.isLoading ? 'Loading mining prerequisites…' : !fleet || !target ? 'Choose a fleet and resource site.' : !miningFleet(fleet, target, systemId) ? 'Mining requires an attached fleet with mining capability and free hold.'
      : !prerequisites?.eligible ? prerequisites?.reason ? mineErrorCopy(prerequisites.reason) : 'Mining prerequisites are unavailable.'
      : prerequisites.featureId !== target.id || !resources.length ? 'This resource site is no longer eligible.'
      : !resources.some(resource => resource.kind === kind) ? 'The selected resource is no longer available. Choose another resource.'
      : servedRunning && !ignored.current.has(servedRunning.id) ? 'Mining is already running.' : null
  const begin = (initial: Partial<Pair>, source: 'fleet' | 'object') => {
    if (guard.held || cancelGuard.held) return
    const next = { fleetId: initial.fleetId ?? null, targetId: initial.targetId ?? null }
    const current = fleets.find(item => item.id === next.fleetId)
    const remembered = current ? receipts[current.id] : null
    // Reopening a known active run restores its own target/status.
    if (current && remembered && !ignored.current.has(remembered.id)) next.targetId = String(remembered.params?.featureId ?? current.attachedTo?.split('#')[0] ?? '')
    if (current && !next.targetId && runningRead.data?.actor === current.id) next.targetId = String(runningRead.data.params?.featureId ?? current.attachedTo?.split('#')[0] ?? '')
    setPair(next); setOrigin(source); setStep(!next.fleetId ? 'fleet' : !next.targetId ? 'target' : 'review'); setActive(true); setError(null)
    if (current && remembered && ignored.current.has(remembered.id)) setReceipts(previous => { const next = { ...previous }; delete next[current.id]; return next })
  }
  const selectFleet = (id: string) => {
    const selected = fleets.find(item => item.id === id)
    if (!selected || !target || !eligibleCandidates.some(item => item.id === id)) return
    options.onFleet(id); setPair(previous => ({ ...previous, fleetId: id })); setStep('review'); setError(null)
  }
  const selectTarget = (id: string) => {
    const selected = features.find(item => item.id === id)
    if (!selected || !fleet || !prerequisites?.eligible || prerequisites.featureId !== id || !miningFleet(fleet, selected, systemId)) return
    setPair(previous => ({ ...previous, targetId: id })); setStep('review'); setError(null)
  }
  const back = () => {
    if (guard.held || cancelGuard.held) return
    if (step === 'review' && !action) setStep(origin === 'fleet' ? 'target' : 'fleet')
    else { setActive(false); options.onExit?.(!!action) }
  }
  const start = async () => {
    const tons = Number(draft.quantity)
    if (blocker || action?.status === 'running' || !fleet || !target || !resources.some(resource => resource.kind === kind) || !Number.isFinite(tons) || tons <= 0 || !guard.claim()) return
    const captured = { fleetId: fleet.id, featureId: target.id, kind, tons, cargoBefore: fleet.roster?.cargo?.[kind] ?? 0 }
    setPending(true); setError(null)
    try {
      // Revalidate limits/attachment/ledger after a retained draft is reopened.
      const freshRead = await optionsRead.refetch({ cancelRefetch: false })
      const fresh = freshRead.data
      if (freshRead.isError || !fresh) { setError('Mining prerequisites could not be refreshed. Try again.'); return }
      if (!fresh.eligible || fresh.featureId !== captured.featureId || tons > fresh.freeHold || tons < fresh.minRunTons || !fresh.resources.some(resource => resource.kind === kind && resource.remainingTons > 0)) {
        setError(fresh.reason ? mineErrorCopy(fresh.reason) : 'Mining limits changed. Review the resource and quantity before starting.'); return
      }
      const result = await mutation.mutateAsync({ fleetId: captured.fleetId, request: { featureId: fresh.commitFeatureId, kind, tons } })
      const accepted: GameAction = { id: result.actionId, actor: captured.fleetId, type: 'mine', scope: systemId, status: 'running', committedAt: result.worldTime, eta: result.eta, worldTime: result.worldTime, params: { featureId: captured.featureId, kind: captured.kind, tons: captured.tons } }
      setReceipts(previous => ({ ...previous, [captured.fleetId]: accepted }))
      options.onAccepted({ ...captured, actionId: result.actionId })
    } catch (error) { setError(mineErrorCopy(commandErrorReason(error))) }
    finally { guard.release(); setPending(false) }
  }
  const cancel = () => {
    if (!action || action.status !== 'running' || guard.held || !cancelGuard.claim()) return
    cancelMutation.mutate({ actionId: action.id, fleetId: action.actor }, {
      onSuccess: result => qc.setQueryData(queryKeys.actions.detail(fleet?.corporationId ?? '', action.id), result),
      onError: error => setError(mineErrorCopy(commandErrorReason(error))),
      onSettled: () => cancelGuard.release(),
    })
  }
  const card: MiningCardProps | null = fleet && target ? {
    fleet: prerequisites && fleet.roster ? { ...fleet, roster: { ...fleet.roster, freeHold: prerequisites.freeHold, miningRate: prerequisites.miningRate } } : fleet,
    target: { ...target, resources }, kind, quantity: draft.quantity, minQuantity: prerequisites?.minRunTons,
    onKind: kind => changeDraft({ kind }), onQuantity: quantity => changeDraft({ quantity }), onStart: start, onRetry: check, onCancel: cancel, cancelPending: cancelMutation.isPending,
    onBack: back, backDestination: action ? 'fleet status' : origin === 'fleet' ? 'mining targets' : 'fleets',
    worldTime, scale, pending, blocker, error, action: action ?? null, checking: actionRead.isFetching, connectionUncertain: actionRead.isError } : null
  return { active, begin, back, step, fleet, target, pair, card, pending,
    eligibleFleets: eligibleCandidates,
    eligibleTargets: fleet ? features.filter(item => prerequisites?.eligible && prerequisites.featureId === item.id && resourceHost(item) && miningFleet(fleet, item, systemId)) : [],
    searchLoading: optionsRead.isLoading || candidateReads.some(read => read.isLoading),
    searchFailed: optionsRead.isError || candidateReads.some(read => read.isError),
    retryOptions: () => { void optionsRead.refetch(); for (const read of candidateReads) void read.refetch() },
    queries, changeQuery: (kind: 'fleet' | 'target', value: ObjectSearchValue) => setQueries(previous => ({ ...previous, [kind]: value })),
    selectFleet, selectTarget, hasRun: (id: string) => !!receipts[id] && !ignored.current.has(receipts[id].id),
    attachedTarget: fleet ? features.find(body => attachedToHost(fleet, body.id)) : undefined,
  }
}
