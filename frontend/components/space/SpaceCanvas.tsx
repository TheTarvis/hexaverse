'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CanvasRegionBoundary, RendererStateNotice } from '@/components/render-guard'
import type { RendererOwner, RendererSnapshot } from '@/components/render-guard/renderer-owner'
import type { RendererCandidateFactory } from '@/components/render-guard/renderer-candidate'
export interface SpaceRendererBindings {
  createCanvas: () => HTMLCanvasElement
  onCanvas: (canvas: HTMLCanvasElement) => void
  onRendererState: (snapshot: RendererSnapshot) => void
  onRendererOwner: (owner: RendererOwner | null) => void
  rendererFactory?: RendererCandidateFactory
}
export interface SpaceCanvasProps {
  children?: ReactNode | ((available: boolean) => ReactNode)
  renderWorld?: (canvas: HTMLCanvasElement, bindings: SpaceRendererBindings) => ReactNode
  onPendingChange?: (pending: boolean) => void
  onAvailabilityChange?: (available: boolean) => void
  claimFocus?: boolean
  rendererFactory?: RendererCandidateFactory
}
export function SpaceCanvas({ children, renderWorld, onAvailabilityChange, onPendingChange, claimFocus, rendererFactory }: SpaceCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const seedUsed = useRef(false)
  const owner = useRef<RendererOwner | null>(null)
  const [seed, setSeed] = useState<HTMLCanvasElement | null>(null)
  const [snapshot, setSnapshot] = useState<RendererSnapshot>({ phase: 'pending', backend: null, retrying: false })
  const [boundary, setBoundary] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { setSeed(document.createElement('canvas')) }, [])
  const onCanvas = useCallback((canvas: HTMLCanvasElement) => {
    canvas.dataset.testid = 'space-canvas'
    canvas.className = 'absolute inset-0 block h-full w-full'
    canvas.style.touchAction = 'none'
    host.current?.replaceChildren(canvas)
  }, [])
  const onRendererOwner = useCallback((value: RendererOwner | null) => { owner.current = value }, [])
  const bindings = useMemo<SpaceRendererBindings>(() => ({ createCanvas: () => { if (seed && !seedUsed.current) { seedUsed.current = true; return seed }; return document.createElement('canvas') }, onCanvas, onRendererOwner, onRendererState: setSnapshot, rendererFactory }), [onCanvas, onRendererOwner, rendererFactory, seed])
  const available = snapshot.phase === 'ready' && !boundary
  useEffect(() => { onAvailabilityChange?.(available) }, [available, onAvailabilityChange])
  useEffect(() => { onPendingChange?.(snapshot.phase === 'pending' && !boundary) }, [snapshot.phase, boundary, onPendingChange])
  const retry = () => { if (boundary) { setBoundary(false); setAttempt(value => value + 1) } else owner.current?.retry() }
  const interrupted = snapshot.phase === 'interrupted'
  const failed = interrupted || snapshot.phase === 'unavailable' || boundary
  const notice = <RendererStateNotice status={interrupted ? 'interrupted' : 'unsupported'} cause={interrupted ? 'lost' : 'creation'} surface="space" retrying={snapshot.retrying} onRetry={retry} claimFocus={claimFocus} />
  return <div className="absolute inset-0">
    <div ref={host} className="absolute inset-0" />
    <CanvasRegionBoundary key={attempt} onError={() => setBoundary(true)} fallback={notice}>
      {seed && renderWorld?.(seed, bindings)}
      {typeof children === 'function' ? children(available) : available && children}
    </CanvasRegionBoundary>
    {!boundary && failed && <div className="absolute inset-0 grid place-items-center">{notice}</div>}
    {!failed && snapshot.phase === 'pending' && <p role="status" className="sr-only">Loading system view…</p>}
  </div>
}
export default SpaceCanvas
