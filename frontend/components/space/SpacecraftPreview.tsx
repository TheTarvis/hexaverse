'use client'

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { Button } from '@/components/catalyst/button'
import { createSpacecraftPreview, type PreviewKind, type PreviewStatus, type SpacecraftPreviewController } from './webgl/spacecraft-preview'

export interface SpacecraftPreviewProps {
  kind: PreviewKind
  objectId: string
  label: string
  accentColor: number
}

export function SpacecraftPreview({ kind, objectId, label, accentColor }: SpacecraftPreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const controller = useRef<SpacecraftPreviewController | null>(null)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const [status, setStatus] = useState<PreviewStatus>('loading')
  const instructions = useId()
  const currentAccent = useRef(accentColor)
  useEffect(() => {
    currentAccent.current = accentColor
    controller.current?.setAccentColor(accentColor)
  }, [accentColor])
  useEffect(() => {
    if (!canvas.current || !surface.current) return
    let live = true
    const instance = createSpacecraftPreview(canvas.current, kind, currentAccent.current, next => { if (live) setStatus(next) }, objectId)
    controller.current = instance
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) instance.resize(rect.width, rect.height)
    })
    observer.observe(surface.current)
    const rect = surface.current.getBoundingClientRect()
    instance.resize(rect.width, rect.height)
    return () => { live = false; drag.current = null; observer.disconnect(); instance.dispose(); controller.current = null }
  }, [kind, objectId])
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return <div onClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
    <div ref={surface} tabIndex={0} aria-label={`3D preview of ${label}`} aria-describedby={instructions}
      data-testid="spacecraft-preview-surface"
      className="relative w-full rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
      style={{ height: 200, touchAction: 'none' }}
      onPointerDown={event => {
        event.stopPropagation()
        if (!event.isPrimary || event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      }}
      onPointerMove={event => {
        event.stopPropagation()
        const previous = drag.current
        if (!previous || previous.id !== event.pointerId) return
        controller.current?.rotate((event.clientX - previous.x) * 0.01, (event.clientY - previous.y) * 0.01)
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      }} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
      onKeyDown={event => {
        const step = Math.PI / 12
        const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
        if (event.key !== 'Home' && !delta[event.key]) return
        event.preventDefault(); event.stopPropagation()
        if (event.key === 'Home') controller.current?.reset()
        else controller.current?.rotate(...delta[event.key]!)
      }}>
      <canvas ref={canvas} aria-hidden="true" className="h-full w-full" style={{ visibility: status === 'unavailable' ? 'hidden' : 'visible' }} />
    </div>
    <p role="status" aria-live="polite" className="text-xs text-zinc-600 dark:text-zinc-400">{status === 'loading' ? 'Loading model preview…' : status === 'fallback' ? 'Simplified model preview.' : status === 'unavailable' ? 'Model preview unavailable.' : ''}</p>
    <div className="flex items-center justify-between gap-2">
      <p id={instructions} className="text-xs text-zinc-600 dark:text-zinc-400">Drag or use arrow keys to rotate. Home resets.</p>
      <Button plain style={{ color: 'var(--command-ink)' }} data-testid="spacecraft-preview-reset" onClick={() => controller.current?.reset()}>Reset view</Button>
    </div>
  </div>
}
