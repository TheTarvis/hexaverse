'use client'

// The system space view route — drill-in from a galaxy node opens
// `/systems/[systemId]` and renders that system's continuous-R³ interior
// (openspec change `build-production-space-view`, `system-space-view`:
// *System Space View Route and Data Fan-In*; design.md Decision 7).
//
// Thin by design: read the route param, hand it to the view container, which
// owns the reads and the render (mirrors app/page.tsx → GalaxyView). No React
// Server Component fetches game data and no route handler proxies the
// backend — auth is a Firebase ID token held in the browser, so every read
// this view makes is necessarily client-side. The WebGL canvas itself is
// loaded through `next/dynamic` with `ssr: false` inside `SpaceStage`, a GL
// context being uncreatable during SSR.

import { useParams } from 'next/navigation'
import { SystemSpaceView } from '@/components/space/SystemSpaceView'

export default function SystemSpacePage() {
  const params = useParams<{ systemId: string }>()
  return <SystemSpaceView systemId={params.systemId} />
}
