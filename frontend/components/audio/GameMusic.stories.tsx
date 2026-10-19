import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from '@/components/catalyst/button'
import { GameViewShell, GameViewHeading, GameViewWorkspace } from '@/components/hud/GameViewShell'
import { HudCardShell } from '@/components/hud/HudCardShell'
import { GameMusicProvider } from './GameMusicProvider'

function GameMusicPreview() {
  const [scene, setScene] = useState<'Galaxy' | 'Serais'>('Galaxy')
  return <GameMusicProvider><GameViewShell>
    <GameViewHeading title={scene} />
    <GameViewWorkspace key={scene} corporationId="music-story" panels={[
      { id: 'objects', label: 'Objects', children: <HudCardShell title="Music integration" lighting="none">
        <p>Open Arrange HUD to find Music. Change scene or close settings while a track plays.</p>
        <Button outline onClick={() => setScene(value => value === 'Galaxy' ? 'Serais' : 'Galaxy')}>Change scene</Button>
      </HudCardShell> },
    ]} />
  </GameViewShell></GameMusicProvider>
}

const meta = {
  title: 'Audio/Game Music', component: GameMusicPreview,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof GameMusicPreview>
export default meta
type Story = StoryObj<typeof meta>
export const InGameSettings: Story = {}
