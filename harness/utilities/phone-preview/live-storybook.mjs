import WebSocket from 'ws'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as acorn from 'acorn'

const prefix = '/storybook'
const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url))
const extension = /\.(?:m?js|cjs|jsx|tsx?|css|json|html|woff2?|ttf|otf|png|jpe?g|webp|gif|ico|svg|glb|mp3|ogg|wav)$/
const publicAsset = /^\/(?:models\/space\/|music\/|sb-manager\/|sb-addons\/|sb-common-assets\/)/

export function storybookClientMessage(data, page) {
  let value
  try { value = JSON.parse(data.toString()) } catch { return null }
  if (!value || typeof value !== 'object' || typeof value.from !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(value.from)) return null
  if (value.type === 'channelCreated' && Array.isArray(value.args) && value.args.length === 0) return JSON.stringify({ type: value.type, args: [], from: value.from })
  if (!['UNIVERSAL_STORE:storybook/status', 'UNIVERSAL_STORE:storybook/test-provider'].includes(value.type) || !Array.isArray(value.args) || value.args.length !== 1) return null
  const event = value.args[0]?.event, actor = value.args[0]?.eventInfo?.actor
  if (!['__FOLLOWER_CREATED', '__EXISTING_STATE_REQUEST', '__FOLLOWER_REMOVED'].includes(event?.type) ||
    actor?.type !== 'FOLLOWER' || actor.environment !== page.toUpperCase() || typeof actor.id !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(actor.id)) return null
  return JSON.stringify({ type: value.type, args: [{ event: { type: event.type }, eventInfo: { actor: { id: actor.id, type: 'FOLLOWER', environment: actor.environment } } }], from: value.from })
}

/** A graph of browser modules referenced by trusted Storybook output, not a filesystem proxy. */
export function createLiveStorybook({ port, origin, expired }) {
  const known = new Set(['/', '/index.html', '/iframe.html', '/index.json', '/favicon.svg'])
  const safe = pathname => {
    if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || pathname.includes('//') ||
      pathname.split('/').some(part => part === '.' || part === '..')) return false
    if (pathname.startsWith('/@fs/')) {
      const absolute = path.resolve(pathname.slice(4))
      if (!absolute.startsWith(frontend) && !absolute.startsWith(path.resolve(frontend, '../node_modules') + '/')) return false
    }
    return pathname === '/@vite/client' || pathname.startsWith('/@id/__x00__virtual:/@storybook/builder-vite/') || extension.test(pathname)
  }
  const remember = (value, from) => {
    try {
      const url = new URL(value, `http://storybook.local${from}`)
      if (url.origin === 'http://storybook.local' && safe(url.pathname)) known.add(url.pathname)
    } catch { /* Computed URLs are not module grants. */ }
  }
  const route = (method, target) => {
    if (!['GET', 'HEAD'].includes(method) || !target.startsWith(prefix + '/')) return null
    const raw = target.slice(prefix.length), pathname = raw.split('?', 1)[0]
    if (/[\x00-\x20\x7f\\#]/.test(raw) || /%(?!40|5b|5d)/i.test(pathname)) return null
    const decoded = decodeURIComponent(pathname)
    if (decoded !== '/' && !safe(decoded)) return null
    // Vite control queries and arbitrary filesystem reads never reach upstream.
    const query = new URL(raw, 'http://storybook.local').searchParams
    if ([...query.keys()].some(key => !['id', 'viewMode', 'path', 'globals', 'args', 'v', 't', 'import', 'direct'].includes(key))) return null
    if (!known.has(decoded) && !publicAsset.test(decoded)) return null
    return { service: 'storybook', path: decoded + (raw.includes('?') ? raw.slice(raw.indexOf('?')) : '') }
  }
  const transform = (body, from, contentType) => {
    if (!/(?:javascript|text\/css|text\/html|application\/json)/.test(contentType)) return body
    let text = body.toString('utf8')
    const urlValue = value => {
      if (typeof value !== 'string' || !/^(?:\/(?!\/)|\.\.?\/)/.test(value) || /[\s<>]/.test(value)) return value
      if (!safe(new URL(value, `http://storybook.local${from}`).pathname)) return value
      remember(value, from)
      return value.startsWith('/') && !value.startsWith(prefix + '/') ? prefix + value : value
    }
    const javascript = source => {
      const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true })
      const changes = [], walk = node => {
        if (!node || typeof node !== 'object') return
        if (node.type === 'Literal' && typeof node.value === 'string') {
          const next = urlValue(node.value)
          if (next !== node.value) changes.push({ start: node.start, end: node.end, value: JSON.stringify(next) })
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(walk)
          else if (value && typeof value === 'object') walk(value)
        }
      }
      walk(ast)
      for (const change of changes.sort((a, b) => b.start - a.start)) source = source.slice(0, change.start) + change.value + source.slice(change.end)
      return source
    }
    if (contentType.includes('javascript')) text = javascript(text)
    if (contentType.includes('application/json')) {
      const walk = value => typeof value === 'string' ? urlValue(value) : Array.isArray(value) ? value.map(walk) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item)])) : value
      text = JSON.stringify(walk(JSON.parse(text)))
    }
    if (contentType.includes('text/css')) text = text.replace(/url\((\/[^)\s]+)\)/g, (all, value) => {
      remember(value, from); return `url(${prefix}${value})`
    })
    if (contentType.includes('text/html')) {
      text = text.replace(/\b(src|href)=(['"])([^'"]+)\2/g, (all, attribute, quote, value) => `${attribute}=${quote}${urlValue(value)}${quote}`)
      text = text.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, (all, open, source, end) => /\bsrc=/.test(open) || !source.trim() ? all : open + javascript(source) + end)
      // Vite hard-codes its local HMR port; Storybook's channel uses a root
      // path. Adapt these in this document only, keeping both local servers intact.
      const shim = `<script>(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(address,protocols){const u=new URL(address,location.href);if((u.hostname===location.hostname||['localhost','127.0.0.1'].includes(u.hostname))&&['/','/storybook/','/storybook-server-channel','/storybook/storybook-server-channel'].includes(u.pathname)){const outer=new URL(location.origin);u.protocol=outer.protocol==='https:'?'wss:':'ws:';u.host=outer.host;u.pathname=u.pathname.endsWith('storybook-server-channel')?'/storybook/storybook-server-channel':'/storybook/__hmr'}super(u.href,protocols)}}})()</script>`
      text = text.replace('<head>', '<head>' + shim)
    }
    return text
  }
  const sockets = new Set()
  const close = () => { for (const socket of sockets) socket.terminate(); sockets.clear() }
  const relay = new WebSocket.Server({ noServer: true, maxPayload: 65536, perMessageDeflate: false })
  const upgrade = (request, socket, head) => {
    const reject = code => socket.end(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`)
    if (expired()) return reject('410 Gone')
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress) || request.headers.origin !== origin) return reject('403 Forbidden')
    const url = new URL(request.url, origin), hmr = url.pathname === prefix + '/__hmr'
    const channel = url.pathname === prefix + '/storybook-server-channel'
    if (request.method !== 'GET' || request.headers['x-http-method-override'] || request.headers['x-method-override'] || !(hmr || channel) || [...url.searchParams.keys()].some(key => !['token', 'page'].includes(key)) ||
      !url.searchParams.get('token') || channel && !['manager', 'preview'].includes(url.searchParams.get('page'))) return reject('404 Not Found')
    relay.handleUpgrade(request, socket, head, downstream => {
      const upstream = new WebSocket(`ws://127.0.0.1:${port}${hmr ? '/' : '/storybook-server-channel'}${url.search}`, hmr ? 'vite-hmr' : undefined,
        { origin: `http://localhost:${port}`, handshakeTimeout: 10000, maxPayload: 16 * 1024 * 1024, perMessageDeflate: false })
      sockets.add(downstream); sockets.add(upstream)
      const stop = () => { downstream.terminate(); upstream.terminate(); sockets.delete(downstream); sockets.delete(upstream) }
      for (const peer of [downstream, upstream]) { peer.on('error', stop); peer.on('close', stop) }
      const pending = []
      upstream.on('open', () => { if (expired()) stop(); else for (const message of pending.splice(0)) upstream.send(message) })
      // Only read-only follower initialization reaches Storybook's server
      // channel. Vite invalidation is confined to already referenced modules.
      downstream.on('message', data => {
        if (expired()) return stop()
        if (!hmr) {
          const message = storybookClientMessage(data, url.searchParams.get('page'))
          if (message && upstream.readyState === WebSocket.OPEN) upstream.send(message)
          else if (message && pending.length < 32) pending.push(message)
          return
        }
        if (upstream.readyState !== WebSocket.OPEN) return
        try {
          const message = JSON.parse(data.toString())
          if (message.type === 'custom' && message.event === 'vite:invalidate' && typeof message.data?.path === 'string') {
            const module = message.data.path.replace(/^\/storybook(?=\/)/, '')
            if (known.has(module.split('?', 1)[0])) upstream.send(JSON.stringify({ type: 'custom', event: 'vite:invalidate', data: { path: module } }))
          }
        } catch { /* Unsupported client notifications are ignored. */ }
      })
      upstream.on('message', data => {
        if (expired()) return stop()
        try { if (downstream.readyState === WebSocket.OPEN) downstream.send(transform(data, '/', 'application/json')) }
        catch { stop() }
      })
    })
  }
  return { route, transform, upgrade, close }
}
