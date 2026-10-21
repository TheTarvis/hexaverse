import { expect, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FleetStatusHostingStudy, FleetStatusStudy } from './FleetStatusStudy'

const meta = {
  title: 'HUD/Fleet Status Study',
  component: FleetStatusStudy,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FleetStatusStudy>
export default meta
type Story = StoryObj<typeof meta>

export const Interaction: Story = {}

export const OwnCard: Story = {
  render: () => <FleetStatusHostingStudy />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Isolate the regression from this demonstration's persisted arrangement.
    await userEvent.click(canvas.getByRole('button', { name: 'Arrange HUD' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Reset HUD layout' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Close HUD settings' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Fleet status' }))
    const band = canvasElement.querySelector<HTMLElement>('[data-slot="hud-action-band"]')!
    const frame = band.closest<HTMLElement>('[data-hud-framing="frame"]')!
    const content = frame.querySelector<HTMLElement>('[data-slot="hud-footer-layout"] > [data-slot="hud-content"]')!
    const initial = band.getBoundingClientRect()
    const bounds = frame.getBoundingClientRect()
    await expect(Math.abs(bounds.bottom - initial.bottom - 5)).toBeLessThan(1)
    await expect(Math.abs(initial.left - bounds.left - 5)).toBeLessThan(1)
    await expect(Math.abs(bounds.right - initial.right - 5)).toBeLessThan(1)
    await userEvent.click(canvas.getByRole('button', { name: 'Cargo · 48 t free' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Ships · 3' }))
    content.scrollTop = content.scrollHeight
    await expect(Math.abs(band.getBoundingClientRect().top - initial.top)).toBeLessThan(1)
    // Leave the selected example compact for visual review.
    await userEvent.click(canvas.getByRole('button', { name: 'Cargo · 48 t free' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Ships · 3' }))
    content.scrollTop = 0
    frame.dataset.footerVerified = 'true'
  },
}
