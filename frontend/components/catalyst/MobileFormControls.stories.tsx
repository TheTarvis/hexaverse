import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Input } from './input'
import { Textarea } from './textarea'
import { Select } from './select'
import { Button } from './button'
import { Dialog, DialogBody, DialogTitle } from './dialog'

const meta: Meta = { id: 'forms-mobile-input-sizing', title: 'Foundations/Forms', tags: ['catalog'], parameters: { catalog: { purpose: 'foundation', status: 'reference', record: 'docs/hud.md' }, layout: 'fullscreen' } }
export default meta

function Controls() {
  const [open, setOpen] = useState(false)
  return <main style={{ padding: 24, maxWidth: 480 }}>
    <p>Shared controls outside HUD cards, including invalid, disabled and portalled fields.</p>
    {(['text', 'search', 'email', 'password', 'number', 'tel', 'url', 'date', 'datetime-local', 'month', 'time', 'week'] as const).map(type => <label key={type} style={{ display: 'block', marginBlock: 12 }}>{type}<Input type={type} aria-label={type} placeholder={type} /></label>)}
    <Input aria-label="Invalid field" invalid placeholder="Invalid field" />
    <Input aria-label="Disabled field" disabled placeholder="Disabled field" />
    <Input aria-label="Read-only field" readOnly defaultValue="Read-only" />
    <Textarea aria-label="Draft message" placeholder="Draft message" />
    <Select aria-label="Resource"><option>Metals</option><option>Water</option></Select>
    <Button onClick={() => setOpen(true)}>Open naming dialog</Button>
    <Dialog open={open} onClose={setOpen}><DialogTitle>Naming field</DialogTitle><DialogBody><Input aria-label="Portalled name" placeholder="Name" /><Button onClick={() => setOpen(false)}>Close naming dialog</Button></DialogBody></Dialog>
  </main>
}

export const AllStates: StoryObj = { render: () => <Controls /> }
