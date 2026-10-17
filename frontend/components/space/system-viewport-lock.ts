import { PHONE_HUD_QUERY } from '@/hooks/use-phone-sheet'

type SavedStyle = { element: HTMLElement; name: string; value: string; priority: string }
type RootState = { styles: SavedStyle[] }
const documents = new WeakMap<Document, { roots: Map<HTMLElement, RootState>; release: () => void; update: () => void }>()
const marker = 'system-viewport-layout-only-v2'
const properties = ['overflow', 'overflow-x', 'overflow-y', 'overscroll-behavior', 'overscroll-behavior-x', 'overscroll-behavior-y', 'height', 'max-height', 'position', 'top', 'left', 'right', 'width', 'scroll-behavior']
const variables = ['--system-viewport-height', '--system-viewport-top', '--system-viewport-bottom']
function save(element: HTMLElement, names: string[]): SavedStyle[] {
  return names.map(name => ({ element, name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) }))
}
function restore(styles: SavedStyle[]) {
  for (const { element, name, value, priority } of styles) {
    if (value) element.style.setProperty(name, value, priority)
    else element.style.removeProperty(name)
  }
}
function set(element: HTMLElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    if (element.style.getPropertyValue(name) !== value || element.style.getPropertyPriority(name) !== 'important') element.style.setProperty(name, value, 'important')
  }
}
function acquire(root: HTMLElement) {
  const doc = root.ownerDocument, win = doc.defaultView!
  const prior = documents.get(doc)
  const rootState = { styles: save(root, properties) }
  if (prior) {
    prior.roots.set(root, rootState); prior.update()
    return () => { prior.roots.delete(root); restore(rootState.styles); if (!prior.roots.size) prior.release() }
  }
  const html = doc.documentElement, body = doc.body
  const styles = [...save(html, [...properties, ...variables]), ...save(body, properties)]
  const originalMarker = html.getAttribute('data-system-scroll-lock')
  const scroll = { x: win.scrollX, y: win.scrollY }
  const roots = new Map([[root, rootState]])
  let lastHeight = win.innerHeight, lastTop = 0
  const update = () => {
    const viewport = win.visualViewport
    // Browser accessibility zoom pans its visual viewport; do not resize the game
    // into that zoomed rectangle or fight its offset while scale differs from one.
    if (!viewport || Math.abs(viewport.scale - 1) < .01) {
      const editing = doc.activeElement instanceof Element && doc.activeElement.matches('input, textarea, [contenteditable="true"]')
      // A keyboard may pan the visual viewport. Never follow rubber-band offsets
      // during ordinary map interaction: that would shift the game down with Safari.
      lastTop = editing ? Math.max(0, Math.min(win.innerHeight - 1, viewport?.offsetTop ?? 0)) : 0
      lastHeight = Math.max(1, Math.min(win.innerHeight - lastTop, viewport?.height ?? win.innerHeight))
    }
    const bottom = Math.max(0, win.innerHeight - lastHeight - lastTop)
    set(html, { overflow: 'hidden', 'overscroll-behavior': 'none', height: `${win.innerHeight}px`, 'scroll-behavior': 'auto', '--system-viewport-height': `${lastHeight}px`, '--system-viewport-top': `${lastTop}px`, '--system-viewport-bottom': `${bottom}px` })
    set(body, { position: 'fixed', top: '0px', left: '0px', right: '0px', width: '100%', height: `${win.innerHeight}px`, 'max-height': `${win.innerHeight}px`, overflow: 'hidden', 'overscroll-behavior': 'none' })
    for (const element of roots.keys()) set(element, { position: 'fixed', top: `${lastTop}px`, left: '0px', right: '0px', width: '100%', height: `${lastHeight}px`, 'max-height': `${lastHeight}px`, overflow: 'hidden', 'overscroll-behavior': 'none' })
  }
  // Layout ownership must never cancel document input. Native buttons and card
  // scrolling keep their complete touch/click streams; only the map owns gestures.
  win.addEventListener('resize', update)
  win.visualViewport?.addEventListener('resize', update)
  win.visualViewport?.addEventListener('scroll', update)
  html.setAttribute('data-system-scroll-lock', marker)
  update()
  win.scrollTo(0, 0)
  // Portalled dialogs may restore html/body styles on close. The system route,
  // rather than an individual modal, retains ownership until the route exits.
  const observer = new MutationObserver(update)
  observer.observe(html, { attributes: true, attributeFilter: ['style'] })
  observer.observe(body, { attributes: true, attributeFilter: ['style'] })
  const state = {
    roots, update,
    release: () => {
      observer.disconnect()
      win.removeEventListener('resize', update); win.visualViewport?.removeEventListener('resize', update); win.visualViewport?.removeEventListener('scroll', update)
      restore(styles)
      if (originalMarker === null) html.removeAttribute('data-system-scroll-lock'); else html.setAttribute('data-system-scroll-lock', originalMarker)
      documents.delete(doc)
      win.scrollTo(scroll.x, scroll.y)
    },
  }
  documents.set(doc, state)
  return () => { roots.delete(root); restore(rootState.styles); if (!roots.size) state.release() }
}

/** System-route lifetime owns document scroll; responsive exit fully restores it. */
export function bindSystemViewport(root: HTMLElement) {
  const win = root.ownerDocument.defaultView!
  const media = win.matchMedia(PHONE_HUD_QUERY)
  let release: (() => void) | undefined
  const update = () => {
    if (media.matches && !release) release = acquire(root)
    else if (!media.matches && release) { release(); release = undefined }
  }
  update(); media.addEventListener('change', update)
  return () => { media.removeEventListener('change', update); release?.() }
}
