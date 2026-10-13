import { notFound } from 'next/navigation'
import { SystemStoryboard } from '@/components/space/storyboard/SystemStoryboard'

// Always render the current prototype during design iteration.
export const dynamic = 'force-dynamic'

export default function SystemStoryboardPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <SystemStoryboard mode="journey" />
}
