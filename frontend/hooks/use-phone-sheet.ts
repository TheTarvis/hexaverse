'use client'

import { useEffect, useState, type RefObject } from 'react'

export const PHONE_HUD_QUERY = '(max-width: 760px), (max-height: 500px) and (max-width: 1024px)'

export function usePhoneHud() {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const media = window.matchMedia(PHONE_HUD_QUERY)
    const update = () => setPhone(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return phone
}

// Sheet handoffs can overlap within one React commit. Recompute from the top
// owner rather than restoring another owner's stale inert snapshot on unmount.
const sheets: { token: symbol; root: HTMLElement }[] = []
const isolated = new Map<HTMLElement, string | null>()
function updateSheetIsolation() {
  for (const [element, previous] of isolated) {
    if (previous === null) element.removeAttribute('inert')
    else element.setAttribute('inert', previous)
  }
  isolated.clear()
  const root = sheets.at(-1)?.root
  if (!root) return
  for (let node = root; node.parentElement; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue
      isolated.set(sibling, sibling.getAttribute('inert'))
      sibling.setAttribute('inert', '')
    }
    if (node.parentElement === document.body) break
  }
}

/** Keep mounted HUD state in place while its phone sheet owns focus/input. */
export function usePhoneSheet(open: boolean, scope: RefObject<HTMLElement | null>, identity: string | null, initialFocus: 'close' | 'root' = 'close') {
  useEffect(() => {
    const root = scope.current
    if (!open || !root) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const token = Symbol('phone-sheet')
    sheets.push({ token, root })
    updateSheetIsolation()
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'))
      .filter(element => !element.closest('[inert], [hidden]') && element.getClientRects().length > 0)
    const focusInitial = () => {
      const close = initialFocus === 'close' ? Array.from(root.querySelectorAll<HTMLElement>('[data-mobile-close]')).find(element => !element.closest('[hidden], [inert]')) : null
      ;(close ?? root).focus({ preventScroll: true })
    }
    focusInitial()
    // Review/Start/Back can remove the focused control without closing its page.
    const observer = new MutationObserver(() => {
      if (document.activeElement === document.body && !root.closest('[inert]')) focusInitial()
    })
    observer.observe(root, { childList: true, subtree: true })
    const trap = (event: KeyboardEvent) => {
      // Nested portalled form dialogs own their own focus handling.
      if (event.key !== 'Tab' || !root.contains(event.target as Node)) return
      const items = focusable(), first = items[0], last = items.at(-1)
      if (!first || !last) { event.preventDefault(); root.focus({ preventScroll: true }); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last.focus({ preventScroll: true }) }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) { event.preventDefault(); first.focus({ preventScroll: true }) }
    }
    root.addEventListener('keydown', trap)
    return () => {
      observer.disconnect()
      root.removeEventListener('keydown', trap)
      const index = sheets.findIndex(sheet => sheet.token === token)
      if (index !== -1) sheets.splice(index, 1)
      updateSheetIsolation()
      if (previous?.isConnected && !previous.closest('[inert], [hidden]')) previous.focus({ preventScroll: true })
    }
  }, [open, scope, identity, initialFocus])
}
