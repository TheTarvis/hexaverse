/** Task identity is presentation data, not an action commitment or inferred fleet state. */
export type HudTaskTitle = {
  fleet?: string | null
  action: 'mining' | 'travel'
  object?: string | null
}

export type HudCardTitle = string | HudTaskTitle

const actions = {
  mining: { label: 'Mining', relation: 'at' },
  travel: { label: 'Travel', relation: 'to' },
} satisfies Record<HudTaskTitle['action'], { label: string; relation: string }>

/** One wording policy for standalone cards and their owning workspace frames. */
export function formatHudCardTitle(title: HudCardTitle): string {
  if (typeof title === 'string') return title
  const fleet = title.fleet?.trim()
  const object = title.object?.trim()
  const action = actions[title.action]
  return `${fleet ? `${fleet} · ` : ''}${action.label}${object ? ` ${action.relation} ${object}` : ''}`
}
