import WebSocket from 'ws'

export function injectLiveConfig(html, origin, projectId) {
  const config = JSON.stringify({ origin, projectId }).replaceAll('<', '\\u003c')
  return html.replace('<head>', `<head><script type="application/json" id="hexaverse-phone-preview">${config}</script>`)
}

export function liveClientMessage(data) {
  let value
  try { value = JSON.parse(data.toString()) } catch { return null }
  if (!value || typeof value !== 'object') return null
  if (['turbopack-subscribe', 'turbopack-unsubscribe'].includes(value.type) &&
    typeof value.path === 'string' && /^static\/chunks\/(?:[A-Za-z0-9_@.()[\]-]+\/)*[A-Za-z0-9_@.()[\]-]+\.(?:js|css)$/.test(value.path) &&
    !value.path.split('/').some(segment => segment === '.' || segment === '..')) {
    return JSON.stringify({ type: value.type, path: value.path })
  }
  // These notifications carry no commands or client-supplied paths upstream.
  if (['client-success', 'client-error', 'client-warning', 'client-reload-page', 'client-full-reload',
    'server-component-reload-page', 'client-added-page', 'client-removed-page'].includes(value.event)) {
    return JSON.stringify({ event: value.event })
  }
  return null
}

export function attachLiveHmr(server, { origin, frontendPort, expired }) {
  const relay = new WebSocket.Server({ noServer: true, maxPayload: 65536, perMessageDeflate: false })
  const connections = new Set()
  const close = () => { for (const socket of connections) socket.terminate(); connections.clear() }
  server.on('close', close)
  server.on('upgrade', (request, socket, head) => {
    const reject = status => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
    if (expired()) return reject('410 Gone')
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress) ||
      request.headers.origin !== origin) return reject('403 Forbidden')
    if (request.method !== 'GET' || request.url !== '/_next/webpack-hmr' ||
      request.headers['x-http-method-override'] || request.headers['x-method-override']) return reject('404 Not Found')
    relay.handleUpgrade(request, socket, head, downstream => {
      if (expired()) { downstream.terminate(); return }
      const upstream = new WebSocket(`ws://127.0.0.1:${frontendPort}/_next/webpack-hmr`, {
        origin: `http://localhost:${frontendPort}`, maxPayload: 16 * 1024 * 1024,
        perMessageDeflate: false, handshakeTimeout: 10000,
      })
      connections.add(downstream); connections.add(upstream)
      const pending = []
      const stop = () => {
        downstream.terminate(); upstream.terminate()
        connections.delete(downstream); connections.delete(upstream)
      }
      downstream.on('error', stop); upstream.on('error', stop)
      downstream.on('close', stop); upstream.on('close', stop)
      downstream.on('message', (data, binary) => {
        if (expired() || binary) { stop(); return }
        const message = liveClientMessage(data)
        if (!message) return
        if (upstream.readyState === WebSocket.OPEN) upstream.send(message)
        else if (pending.length < 128) pending.push(message)
        else stop()
      })
      upstream.on('open', () => { if (expired()) stop(); else for (const message of pending.splice(0)) upstream.send(message) })
      upstream.on('message', (data, binary) => {
        if (expired()) stop()
        else if (downstream.readyState === WebSocket.OPEN) downstream.send(data, { binary })
      })
    })
  })
  return close
}
