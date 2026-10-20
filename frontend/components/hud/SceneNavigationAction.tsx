'use client'

import { ArrowLeftStartOnRectangleIcon, ArrowRightEndOnRectangleIcon } from '@heroicons/react/24/outline'
import { HudButton } from '@/components/hud/HudControls'
import { HudIcon } from './HudIcon'

/** Scene navigation shares the workspace's existing visible navigation/focus owner. */
export function SceneNavigationAction({ destination, onEnter, systemName, systemId }: { destination: 'galaxy' | 'system'; onEnter?: () => void; systemName?: string; systemId?: string }) {
  const label = destination === 'galaxy' ? 'Leave system for galaxy' : `Enter selected system${systemName ? `: ${systemName}` : ''}`
  const icon = destination === 'galaxy' ? ArrowLeftStartOnRectangleIcon : ArrowRightEndOnRectangleIcon
  return destination === 'galaxy'
    ? <HudButton presentation="chrome" href={systemId ? `/?system=${encodeURIComponent(systemId)}` : '/'} aria-label={label} title={label}><HudIcon icon={icon} /></HudButton>
    : <HudButton presentation="chrome" onClick={onEnter} aria-label={label} title={label}><HudIcon icon={icon} /></HudButton>
}
