'use client'

// The system board route (spec #0007) — drill-in from a #0002 galaxy node opens
// `/systems/[systemId]` and renders that system's fogged interior as a hex board.
// Thin by design: read the route param, hand it to the view container, which
// owns the read + render (mirrors app/page.tsx → GalaxyView).

import { useParams } from 'next/navigation'
import { SystemBoardView } from '@/components/board/SystemBoardView'

export default function SystemBoardPage() {
  const params = useParams<{ systemId: string }>()
  return <SystemBoardView systemId={params.systemId} />
}
