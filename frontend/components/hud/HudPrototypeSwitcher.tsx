'use client'

import { useEffect } from 'react'
import { Button } from '@/components/catalyst/button'

export const HUD_PROTOTYPE_VARIANTS = [
  { key: 'A', name: 'Bridge', description: 'Left fleet overview · combined object browser' },
  { key: 'B', name: 'Operations', description: 'Fleet rail · combined browser opposite the map' },
  { key: 'C', name: 'Console', description: 'Horizontal fleet watch · combined object browser' },
  { key: 'D', name: 'On-object', description: 'Quiet labels · selected object holds details and course controls' },
  { key: 'E', name: 'Transfer', description: 'One fleet → one destination · preview and start travel' },
] as const

export type HudPrototypeVariant = typeof HUD_PROTOTYPE_VARIANTS[number]['key']

/** Shared throwaway switcher; never rendered in production. */
export function HudPrototypeSwitcher({ variant, onChange }: {
  variant: HudPrototypeVariant
  onChange: (variant: HudPrototypeVariant) => void
}) {
  const index = HUD_PROTOTYPE_VARIANTS.findIndex(item => item.key === variant)
  function cycle(direction: number) {
    onChange(HUD_PROTOTYPE_VARIANTS[(index + direction + HUD_PROTOTYPE_VARIANTS.length) % HUD_PROTOTYPE_VARIANTS.length].key)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.target instanceof HTMLElement) || event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        onChange(HUD_PROTOTYPE_VARIANTS[(index + (event.key === 'ArrowRight' ? 1 : -1) + HUD_PROTOTYPE_VARIANTS.length) % HUD_PROTOTYPE_VARIANTS.length].key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, onChange])

  if (process.env.NODE_ENV === 'production') return null
  return <nav aria-label="Prototype variants">
    <Button plain aria-label="Previous layout" onClick={() => cycle(-1)}>←</Button>
    <span><small>LAYOUT {variant} / {HUD_PROTOTYPE_VARIANTS.length}</small><strong>{HUD_PROTOTYPE_VARIANTS[index].name}</strong></span>
    <Button plain aria-label="Next layout" onClick={() => cycle(1)}>→</Button>
  </nav>
}
