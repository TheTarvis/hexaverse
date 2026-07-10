'use client'

// The home page IS the galaxy view (spec #0002) — the game's primary screen,
// rendered for BOTH authed users (live galaxy) and logged-out visitors (frozen
// start area). GalaxyView is a client component; it picks live-vs-start-area by
// auth state via useGalaxy().

import { GalaxyView } from '@/components/galaxy/GalaxyView'

export default function HomePage() {
  return <GalaxyView />
}
