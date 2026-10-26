/** Task identity is presentation data, not an action commitment or inferred fleet state. */
export type HudTaskTitle = {
  fleet?: string | null
  action: 'mining' | 'travel'
  object?: string | null
}

/** Selection context uses the same plaque as action review; it never implies a committed order. */
export type HudSearchTitle = {
  search: 'objects' | 'travel-destination' | 'mining-target' | 'command-fleet'
  scope: string
  fleet?: string | null
  object?: string | null
}

export type HudCardTitle = string | HudTaskTitle | HudSearchTitle

const searches = {
  objects: 'Objects',
  'travel-destination': 'Choose destination',
  'mining-target': 'Choose mining target',
  'command-fleet': 'Choose command fleet',
} satisfies Record<HudSearchTitle['search'], string>

const actions = {
  mining: { label: 'Mining', relation: 'at' },
  travel: { label: 'Travel', relation: 'to' },
} satisfies Record<HudTaskTitle['action'], { label: string; relation: string }>

/** One wording policy for standalone cards and their owning workspace frames. */
export function formatHudCardTitle(title: HudCardTitle): string {
  if (typeof title === 'string') return title
  if ('search' in title) {
    const scope = title.scope.trim()
    const fleet = title.fleet?.trim()
    const object = title.object?.trim()
    const label = searches[title.search]
    return `${fleet ? `${fleet} · ` : ''}${label}${object ? ` for ${object}` : ''}${scope ? ` · ${scope}` : ''}`
  }
  const fleet = title.fleet?.trim()
  const object = title.object?.trim()
  const action = actions[title.action]
  return `${fleet ? `${fleet} · ` : ''}${action.label}${object ? ` ${action.relation} ${object}` : ''}`
}
