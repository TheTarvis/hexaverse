import { notFound } from 'next/navigation'
import { SystemStoryboard } from '@/components/space/storyboard/SystemStoryboard'
import { HudPrototype } from '@/components/space/hud-prototype/HudPrototype'

// Always render the current prototype during design iteration.
export const dynamic = 'force-dynamic'

export default async function SystemHudStudioPage({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const { variant } = await searchParams
  if (!variant || ['A', 'B', 'C', 'D', 'E'].includes(variant)) return <HudPrototype />
  return <SystemStoryboard mode="hud" />
}
