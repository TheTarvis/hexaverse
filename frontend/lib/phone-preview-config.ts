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
