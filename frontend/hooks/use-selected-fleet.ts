'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { Fleet } from '@/lib/types/fleet'

const event = 'hexaverse-selected-fleet'
const memory = new Map<string, string>()
const key = (corp: string) => `hexaverse:selected-fleet:v1:${corp}`
function read(corp: string | null) {
  if (!corp || typeof window === 'undefined') return null
  if (memory.has(corp)) return memory.get(corp)!
  try { return sessionStorage.getItem(key(corp)) } catch { return null }
}
function write(corp: string, id: string) {
  try { sessionStorage.setItem(key(corp), id); memory.delete(corp) }
  catch { memory.set(corp, id) }
  window.dispatchEvent(new Event(event))
}
function subscribe(notify: () => void) {
  window.addEventListener(event, notify)
  window.addEventListener('storage', notify)
  return () => { window.removeEventListener(event, notify); window.removeEventListener('storage', notify) }
}

/** Resolve persisted ids only against the currently served owned roster. */
export function useSelectedFleet(fleets: Fleet[], preferredId: string | null = null, failed = false) {
  const corp = fleets[0]?.corporationId ?? null
  const stored = useSyncExternalStore(subscribe, useCallback(() => read(corp), [corp]), () => null)
  const eligible = fleets.filter(f => f.own && f.corporationId === corp)
  const fleet = eligible.find(f => f.id === stored) ?? eligible.find(f => f.id === preferredId) ?? eligible[0] ?? null
  const select = useCallback((id: string) => {
    if (corp && !failed && fleets.some(f => f.id === id && f.own && f.corporationId === corp)) write(corp, id)
  }, [corp, fleets, failed])
  useEffect(() => {
    if (corp && fleet && stored !== fleet.id && !failed) write(corp, fleet.id)
  }, [corp, fleet, stored, failed])
  return { fleet, select }
}
