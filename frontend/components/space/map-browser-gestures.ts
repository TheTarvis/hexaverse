/** Cancel browser navigation/zoom only for touches that begin on the live map.
 * Attach before touchstart: installing a touchmove listener during a gesture is
 * too late for WebKit's gesture arbitration. Camera motion remains Pointer Events.
 */
export function bindMapBrowserGestures(host: HTMLElement) {
  let owned = false
  const control = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-space-camera-control]')
  const cancelDefault = (event: Event) => { if (event.cancelable) event.preventDefault() }
  const start = (event: TouchEvent) => {
    if (!owned) {
      if (control(event.target) || host.closest('[inert]')) return
      // Do not claim a pinch whose other finger began outside the map.
      if (Array.from(event.touches).some(touch => touch.target instanceof Node && (!host.contains(touch.target) || control(touch.target)))) return
      owned = true
    }
    cancelDefault(event)
  }
  const move = (event: TouchEvent) => { if (owned) cancelDefault(event) }
  const end = (event: TouchEvent) => {
    if (!owned) return
    cancelDefault(event)
    // Prevent old per-mark touchend handlers from duplicating pointer selection.
    event.stopPropagation()
    if (!event.touches.length) owned = false
  }
  const cancel = () => { owned = false }
  // Safari may target a common ancestor (rather than the canvas) for GestureEvent.
  // The document listener is gated by ownership of a touch that began on this map.
  const gesture = (event: Event) => { if (owned) cancelDefault(event) }
  const options = { capture: true, passive: false }
  host.addEventListener('touchstart', start, options)
  host.addEventListener('touchmove', move, options)
  host.addEventListener('touchend', end, options)
  host.addEventListener('touchcancel', cancel, options)
  host.ownerDocument.addEventListener('gesturestart', gesture, options)
  host.ownerDocument.addEventListener('gesturechange', gesture, options)
  host.ownerDocument.defaultView?.addEventListener('blur', cancel)
  return () => {
    cancel()
    host.removeEventListener('touchstart', start, options)
    host.removeEventListener('touchmove', move, options)
    host.removeEventListener('touchend', end, options)
    host.removeEventListener('touchcancel', cancel, options)
    host.ownerDocument.removeEventListener('gesturestart', gesture, options)
    host.ownerDocument.removeEventListener('gesturechange', gesture, options)
    host.ownerDocument.defaultView?.removeEventListener('blur', cancel)
  }
}
