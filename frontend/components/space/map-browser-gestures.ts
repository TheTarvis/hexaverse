export interface MapTouchActions {
  start: (event: TouchEvent) => void
  move: (event: TouchEvent) => boolean
  end: (event: TouchEvent) => boolean
  cancel: () => void
}

/** Native touch owns map motion; never depend on cancelled touch becoming pointer
 * events. No document input listeners and no touchstart cancellation. Buttons,
 * inputs and scrollable cards outside this host retain their native click path.
 */
export function bindMapBrowserGestures(host: HTMLElement, actions: MapTouchActions) {
  let owned = false, count = 0
  const control = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-space-camera-control]')
  const cancelDefault = (event: Event) => { if (event.cancelable) event.preventDefault() }
  const cancel = () => { owned = false; count = 0; actions.cancel() }
  const start = (event: TouchEvent) => {
    if (control(event.target) || host.closest('[inert]')) return
    if (Array.from(event.touches).some(touch => touch.target instanceof Node && (!host.contains(touch.target) || control(touch.target)))) { if (owned) cancel(); return }
    owned = true; count = event.touches.length
    actions.start(event)
  }
  const move = (event: TouchEvent) => {
    if (!owned) return
    if (host.closest('[inert]')) { cancel(); return }
    if (actions.move(event)) cancelDefault(event)
  }
  const end = (event: TouchEvent) => {
    if (!owned) return
    if (actions.end(event)) cancelDefault(event)
    // Legacy mark touchend handlers must not duplicate the owned native path.
    event.stopPropagation()
    count = event.touches.length
    if (!count) owned = false
  }
  const gesture = (event: Event) => { if (owned && count >= 2) cancelDefault(event) }
  const options = { capture: true, passive: false }
  host.addEventListener('touchstart', start, options)
  host.addEventListener('touchmove', move, options)
  host.addEventListener('touchend', end, options)
  host.addEventListener('touchcancel', cancel, options)
  host.addEventListener('gesturestart', gesture, options)
  host.addEventListener('gesturechange', gesture, options)
  host.ownerDocument.defaultView?.addEventListener('blur', cancel)
  return () => {
    cancel()
    host.removeEventListener('touchstart', start, options); host.removeEventListener('touchmove', move, options)
    host.removeEventListener('touchend', end, options); host.removeEventListener('touchcancel', cancel, options)
    host.removeEventListener('gesturestart', gesture, options); host.removeEventListener('gesturechange', gesture, options)
    host.ownerDocument.defaultView?.removeEventListener('blur', cancel)
  }
}
