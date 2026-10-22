/** Retired examples resolve to their maintained owner without duplicate sidebar entries. */
export const storyRedirects: Record<string, string> = {
  'graphics-galaxy-map--original': 'graphics-galaxy-map--overview',
  'hud-travel-card--travelling': 'hud-fleet-status-study--own-card',
  'hud-fleet-status-study--interaction': 'hud-fleet-status-study--own-card',
  'hud-typography--travel-review': 'hud-typography--text-roles',
  'hud-typography--narrow': 'hud-typography--structured-text-list',
  'hud-typography--long-names': 'hud-typography--structured-text-list',
  'hud-typography--long-name-comparison': 'hud-typography--structured-text-list',
  'hud-typography--name-length-study': 'hud-typography--structured-text-list',
  'hud-typography--structured-text-list-narrow': 'hud-typography--structured-text-list',
  'hud-typography--structured-text-list-long-content': 'hud-typography--structured-text-list',
  'hud-typography--structured-text-list-comparison': 'hud-typography--structured-text-list',
}

export function redirectRetiredStory() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const path = url.searchParams.get('path')
  const id = url.searchParams.get('id') ?? path?.replace(/^\/story\//, '')
  const target = id && storyRedirects[id]
  if (!target) return
  if (url.searchParams.has('id')) url.searchParams.set('id', target)
  else url.searchParams.set('path', `/story/${target}`)
  window.location.replace(url)
}
