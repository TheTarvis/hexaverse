import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { GameViewShell, GameViewHeading, GameViewWorkspace } from '@/components/hud/GameViewShell'
import { HudCardShell } from '@/components/hud/HudCardShell'
import { GameMusicProvider } from './GameMusicProvider'

function GameMusicPreview({ scene }: { scene: 'Galaxy' | 'Serais' }) {
  return <GameMusicProvider><GameViewShell>
    <GameViewHeading title={scene} />
    <GameViewWorkspace key={scene} corporationId="music-story" panels={[
      { id: 'objects', label: 'Objects', children: <HudCardShell title="Music integration" lighting="none">
        <p>Open Arrange HUD to find Music. Change scene in Storybook Controls or close settings while a track plays.</p>
      </HudCardShell> },
    ]} />
  </GameViewShell></GameMusicProvider>
}

const meta = {
  title: 'Audio/Game Music', component: GameMusicPreview,
  args: { scene: 'Galaxy' },
  argTypes: { scene: { control: 'inline-radio', options: ['Galaxy', 'Serais'] } },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof GameMusicPreview>
export default meta
type Story = StoryObj<typeof meta>
export const InGameSettings: Story = {}
