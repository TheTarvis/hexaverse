'use client'
import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react'
import { HudRoot } from '@/components/hud/GameHud'
import { bindSystemViewport } from './system-viewport-lock'

/** This is the production system shell, including while reads/rendering load. */
export function SystemViewport(props: ComponentPropsWithoutRef<'div'>) {
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => root.current ? bindSystemViewport(root.current) : undefined, [])
  return <HudRoot {...props} ref={root} data-system-viewport="true" />
}
