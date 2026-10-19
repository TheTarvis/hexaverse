/** Explicit phone-preview build mode. Never enabled by NODE_ENV or hostname alone. */
export function phonePreviewConfig(flag: string | undefined, projectId: string | undefined, browserOrigin?: string) {
  if (flag !== 'true') return null
  if (!projectId?.trim()) throw new Error('Phone preview requires an explicit emulator Firebase project ID.')
  let authEmulatorUrl: string | undefined
  if (browserOrigin) {
    const url = new URL(browserOrigin)
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Phone preview auth requires an HTTPS origin or loopback HTTP origin, without a path.')
    }
    authEmulatorUrl = url.origin
  }
  return { projectId, apiBase: '/api', authEmulatorUrl }
}

/** Gateway-only live-dev opt-in; ordinary localhost development stays unchanged. */
export function livePhonePreviewConfig() {
  if (typeof document !== 'undefined') {
    const element = document.getElementById('hexaverse-phone-preview')
    if (element?.textContent) {
      const config: unknown = JSON.parse(element.textContent)
      if (config && typeof config === 'object' && 'origin' in config && config.origin === window.location.origin &&
        'projectId' in config && typeof config.projectId === 'string') {
        return phonePreviewConfig('true', config.projectId, window.location.origin)
      }
      throw new Error('Invalid live phone preview configuration')
    }
  }
  return null
}

export function browserPhonePreviewConfig() {
  return livePhonePreviewConfig() ?? phonePreviewConfig(process.env.NEXT_PUBLIC_PHONE_PREVIEW, process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    typeof window !== 'undefined' ? window.location.origin : undefined)
}
