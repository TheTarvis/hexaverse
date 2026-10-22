import { PHONE_HUD_QUERY } from '@/hooks/use-phone-sheet'
import { expect, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FleetStatusHostingStudy } from './FleetStatusStudy'

const meta = {
  id: 'hud-fleet-status-study', title: 'Tasks/Fleet status/Review', tags: ['catalog'],
  component: FleetStatusHostingStudy,
  parameters: { catalog: { purpose: 'task', status: 'prototype', record: 'docs/hud.md', task: 'fleet-status', primary: true }, layout: 'fullscreen' },
} satisfies Meta<typeof FleetStatusHostingStudy>
export default meta
type Story = StoryObj<typeof meta>

export const OwnCard: Story = {
  name: 'Journey',
  render: () => <FleetStatusHostingStudy />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const arrange = canvas.getByRole('button', { name: 'Arrange HUD' })
    const hit = arrange.getBoundingClientRect()
    await expect(arrange.contains(document.elementFromPoint(hit.x + hit.width / 2, hit.y + hit.height / 2))).toBe(true)
    // Isolate the regression from this demonstration's persisted arrangement.
    await userEvent.click(canvas.getByRole('button', { name: 'Arrange HUD' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Reset HUD layout' }))
    await userEvent.click(canvas.getByRole('button', { name: window.matchMedia(PHONE_HUD_QUERY).matches ? 'Return to map' : 'Arrange HUD' }))
    if (window.matchMedia(PHONE_HUD_QUERY).matches) await userEvent.click(canvas.getByRole('button', { name: 'Fleet status' }))
    const band = canvasElement.querySelector<HTMLElement>('[data-slot="hud-action-band"]')!
    const frame = band.closest<HTMLElement>('[data-hud-framing="frame"]')!
    const content = frame.querySelector<HTMLElement>('[data-slot="hud-footer-layout"] > [data-slot="hud-content"]')!
    const initial = band.getBoundingClientRect()
    const bounds = frame.getBoundingClientRect()
    await expect(Math.abs(bounds.bottom - initial.bottom - 5)).toBeLessThan(1)
    await expect(Math.abs(initial.left - bounds.left - 5)).toBeLessThan(1)
    await expect(Math.abs(bounds.right - initial.right - 5)).toBeLessThan(1)
    await userEvent.click(canvas.getByRole('button', { name: /^Cargo · / }))
    await userEvent.click(canvas.getByRole('button', { name: 'Ships · 3' }))
    content.scrollTop = content.scrollHeight
    await expect(Math.abs(band.getBoundingClientRect().top - initial.top)).toBeLessThan(1)
    // Leave the selected example compact for visual review.
    await userEvent.click(canvas.getByRole('button', { name: /^Cargo · / }))
    await userEvent.click(canvas.getByRole('button', { name: 'Ships · 3' }))
    content.scrollTop = 0
    frame.dataset.footerVerified = 'true'
  },
}
