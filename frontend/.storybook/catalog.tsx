import type { Decorator } from '@storybook/nextjs-vite'
import { HudText } from '../components/hud/HudTypography'
import './catalog.css'

export type CatalogEntry = {
  purpose: 'foundation' | 'task' | 'scene'
  status: 'reference' | 'prototype' | 'comparison'
  record: string
  task?: string
  primary?: boolean
  question?: string
}

/** Metadata describes the example, never a second set of component defaults. */
export const withCatalog: Decorator = (Story, context) => {
  const entry = context.parameters.catalog as CatalogEntry | undefined
  if (!entry) return <Story />
  if (entry.status === 'reference') return <div className="dark story-catalog-canvas"><Story /></div>
  return <div className="dark story-catalog-canvas story-catalog-page">
    <aside className="story-catalog-notice" aria-label="Story context">
      <HudText variant="caption">{entry.status === 'prototype' || entry.purpose === 'task' ? 'Prototype — simulated outcomes' : 'Active comparison'}</HudText>
      <a href={`${import.meta.env.BASE_URL}project-docs/${entry.record.replace(/^docs\//, '')}`} target="_blank" rel="noreferrer">Decision record</a>
      {entry.question && <HudText variant="caption">{entry.question}</HudText>}
    </aside>
    <div className="story-catalog-content"><Story /></div>
  </div>
}
