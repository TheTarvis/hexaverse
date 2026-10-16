#!/usr/bin/env node
// Loopback-only transport for an explicitly authorized, externally gated preview.
// This utility does NOT authenticate visitors, start a tunnel, or log requests.
import http from 'node:http'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ssoHelperAllowed, idpSignInAllowed } from './sso-policy.mjs'

const ID = '[A-Za-z0-9_-]{1,180}'
const api = (pattern) => new RegExp(`^/v1/${pattern}$`)
// Sources: frontend/lib/services/{account,corporation,galaxy,system,fleet,
// discovery,market,action,sighting}-service.ts. Extend intentionally, not by prefix.
const apiRules = {
  GET: [
    api(`accounts/(?:${ID})(?:/profile)?`), api('corporations/me'), api('galaxy'),
    api(`systems/${ID}(?:/station)?`), api(`fleets(?:/${ID}(?:/(?:scan-targets|survey))?)?`),
    api(`actions(?:/${ID})?`), api('sightings'), api('market/board'),
    // Existing authenticated SSE endpoint. No live world subscriber is required.
    api(`channels/${ID}/stream`),
  ],
  POST: [
    api('accounts'), api('corporations'),
    api(`fleets/${ID}/(?:orders(?:/preview)?|hold|release|cut-drive|stop|jump|mine|scan|survey|sell|refuel)`),
    api(`systems/${ID}/bodies/${ID}/name`), api(`actions/${ID}/(?:cancel|acknowledge)`),
  ],
}
const authPaths = new Set([
  '/identitytoolkit.googleapis.com/v1/accounts:signUp',
  '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
  '/identitytoolkit.googleapis.com/v1/accounts:lookup',
  '/securetoken.googleapis.com/v1/token',
  '/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp',
])
const ssoHelperPaths = new Set(['/emulator/auth/handler', '/emulator/auth/iframe'])
const idpPath = '/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp'
const signupPath = '/identitytoolkit.googleapis.com/v1/accounts:signUp'
const signupFields = new Set(['email', 'password', 'returnSecureToken', 'clientType', 'captchaResponse', 'recaptchaVersion'])
const appPages = new RegExp(`^(?:/|/login|/systems/${ID})$`)
const staticAsset = /^\/_next\/static\/(?:[A-Za-z0-9_@.()[\]-]+\/)*[A-Za-z0-9_@.()[\]-]+\.(?:js|css|woff2?|ttf|otf|png|jpe?g|webp|gif|ico|svg)$/
const publicAssets = new Set([
  // Frozen logged-out galaxy, loaded directly by galaxy-service (not /api).
  '/galaxy/start-area.json',
  '/favicon.ico', '/icon.png', '/apple-icon.png', '/google-logo.svg',
  '/flywheel-icon.svg', '/flywheel-icon.png', '/flywheel-logo.png',
  '/flywheel-logo-light.svg', '/flywheel-logo-dark.svg', '/og-image.png',
])
const models = /^\/models\/space\/(?:lane-gate|utility-ship|orbital-station|ruin-candidate|debris-candidate)\.glb$/
const storybookAsset = /^\/storybook\/(?:[A-Za-z0-9_@.()[\]-]+\/)*[A-Za-z0-9_@.()[\]-]+\.(?:html|js|mjs|css|json|woff2?|ttf|otf|png|jpe?g|webp|gif|ico|svg|glb)$/
const defaultStorybookDirectory = fileURLToPath(new URL('../../../frontend/.storybook/phone-preview-static', import.meta.url))

/** Inspect the raw request target before any URL parser can normalize traversal. */
export function previewRoute(method, target) {
  if (typeof target !== 'string' || target.length > 16_384 || /[\x00-\x20\x7f\\#]/.test(target)) return null
  const rawPath = target.split('?', 1)[0]
  if (!rawPath.startsWith('/') || rawPath.includes('//')) return null
  // Encoded Next route-group brackets are needed by production chunk URLs.
  // All other path escapes are rejected, including double encodings/separators.
  if (/%(?!5[bBdD])/i.test(rawPath)) return null
  let pathname
  try { pathname = decodeURIComponent(rawPath) } catch { return null }
  if (pathname.split('/').some(segment => segment === '.' || segment === '..')) return null
  const read = method === 'GET' || method === 'HEAD'
  if (read && (pathname === '/storybook' || pathname === '/storybook/' || storybookAsset.test(pathname))) return { service: 'storybook', path: target }
  if (ssoHelperPaths.has(pathname)) return method === 'GET' ? { service: 'auth', path: target } : null
  if (authPaths.has(pathname)) return method === 'POST' ? { service: 'auth', path: target } : null
  if (pathname.startsWith('/api/')) {
    const path = pathname.slice(4)
    if (!apiRules[method]?.some(rule => rule.test(path))) return null
    return { service: 'backend', path: target.slice(4) }
  }
  // No prefix fallthrough: only actual game pages/assets reach Next.
  if (read && (appPages.test(pathname) || staticAsset.test(pathname) || publicAssets.has(pathname) || models.test(pathname))) {
    return { service: 'frontend', path: target }
  }
  return null
}

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade'])
const spoofHeaders = new Set(['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
  'x-original-url', 'x-rewrite-url', 'x-http-method-override', 'x-method-override'])
function headersWithoutHop(headers) {
  const omitted = new Set([...hopHeaders, ...(headers.connection ?? '').split(',').map(value => value.trim().toLowerCase())])
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !omitted.has(key.toLowerCase())))
}
function port(value) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error('Ports must be integers from 1 to 65535')
  return number
}
function reject(response, status) {
  if (response.headersSent) { response.destroy(); return }
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff' })
  response.end(status === 413 ? 'Request too large' : status === 502 ? 'Preview upstream unavailable' : 'Preview route unavailable')
}
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' }
async function serveStorybook(request, response, directory, expired) {
  const pathname = decodeURIComponent(request.url.split('?', 1)[0])
  if (pathname === '/storybook') {
    response.writeHead(308, { location: '/storybook/', 'cache-control': 'no-store' })
    response.end()
    return
  }
  const relative = pathname === '/storybook/' ? 'index.html' : pathname.slice('/storybook/'.length)
  try {
    const root = await realpath(directory)
    const file = await realpath(path.join(root, relative))
    // Real paths also close symlink escapes from an otherwise safe-looking name.
    if (!file.startsWith(`${root}${path.sep}`)) return reject(response, 404)
    if (!contentTypes[path.extname(file)]) return reject(response, 404)
    const info = await stat(file)
    if (!info.isFile()) return reject(response, 404)
    if (expired()) return reject(response, 410)
    response.writeHead(200, { 'content-type': contentTypes[path.extname(file)] ?? 'application/octet-stream',
      'content-length': info.size, 'cache-control': 'private, max-age=0', 'x-content-type-options': 'nosniff' })
    if (request.method === 'HEAD') { response.end(); return }
    const stream = createReadStream(file)
    stream.on('error', () => response.destroy())
    response.on('close', () => stream.destroy())
    stream.pipe(response)
  } catch { reject(response, 404) }
}

/** All upstream hosts are fixed loopback; only their numeric ports are configurable. */
export function createPreviewGateway({ previewOrigin, frontendPort = 20205, backendPort = 20201, authPort = 20211,
  storybookDirectory = defaultStorybookDirectory, maxBodyBytes = 1_048_576, expiresAt, now = Date.now } = {}) {
  let trusted
  try { trusted = new URL(previewOrigin) } catch { throw new Error('Explicit previewOrigin is required') }
  // Local QA is an explicit alternative, never an additional allowed origin on
  // the external preview. Literal loopback and an exact port prevent widening
  // this exception to aliases, wildcard listeners, or ordinary HTTP sites.
  const localQA = trusted.protocol === 'http:' && trusted.hostname === '127.0.0.1' && trusted.port !== '' &&
    /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(previewOrigin)
  if ((trusted.protocol !== 'https:' && !localQA) || trusted.hostname.includes('*') || trusted.username || trusted.password ||
    trusted.pathname !== '/' || trusted.search || trusted.hash) throw new Error('previewOrigin must be HTTPS, or explicit HTTP 127.0.0.1 with a port for local QA; no wildcard, path or credentials')
  if (!localQA && expiresAt === undefined) throw new Error('HTTPS preview requires an explicit UTC expiry deadline (--until)')
  let deadline = Infinity
  if (expiresAt !== undefined) {
    if (typeof expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expiresAt)) throw new Error('Expiry must be an exact UTC ISO timestamp')
    deadline = Date.parse(expiresAt)
    const canonical = expiresAt.includes('.') ? expiresAt : expiresAt.replace('Z', '.000Z')
    if (!Number.isFinite(deadline) || new Date(deadline).toISOString() !== canonical || deadline <= now() || deadline - now() > 7 * 24 * 60 * 60 * 1000) {
      throw new Error('Expiry must be a valid future UTC timestamp no more than seven days away')
    }
  }
  const expired = () => now() >= deadline
  const ports = { frontend: port(frontendPort), backend: port(backendPort), auth: port(authPort) }
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 1_048_576) throw new Error('Invalid request body limit')
  const server = http.createServer(async (request, response) => {
    // Check wall time on every request as well as using a timer: a delayed
    // timer after sleep/event-loop contention cannot reopen the preview.
    if (expired()) return reject(response, 410)
    // Binding is enforced by the launcher; keep imported use loopback-only too.
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) return reject(response, 403)
    // Never derive trust from Host or forwarding headers. Browsers must send
    // the one configured outer origin before any upstream Origin translation.
    const origin = request.headers.origin
    if ((origin && origin !== trusted.origin) || (request.method !== 'GET' && request.method !== 'HEAD' && origin !== trusted.origin)) return reject(response, 403)
    const route = previewRoute(request.method, request.url)
    if (!route || request.headers['x-http-method-override'] || request.headers['x-method-override']) return reject(response, 404)
    if (route.service === 'auth' && ssoHelperPaths.has(route.path.split('?', 1)[0]) && !ssoHelperAllowed(route.path, trusted.origin)) return reject(response, 400)
    const declaredLength = Number(request.headers['content-length'] ?? 0)
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > maxBodyBytes) return reject(response, 413)
    if ((request.method === 'GET' || request.method === 'HEAD') && (declaredLength || request.headers['transfer-encoding'])) return reject(response, 404)
    if (route.service === 'storybook') return serveStorybook(request, response, storybookDirectory, expired)

    // Browser request bodies are small JSON/form payloads. Bound them before
    // forwarding so a partial oversized mutation never reaches an upstream.
    const chunks = []
    let size = 0
    try {
      for await (const chunk of request) {
        size += chunk.length
        if (size > maxBodyBytes) { reject(response, 413); return }
        chunks.push(chunk)
      }
    } catch { return reject(response, 400) }
    if (expired()) return reject(response, 410)
    if (route.service === 'auth' && route.path.split('?', 1)[0] === signupPath) {
      // Firebase also uses this endpoint for anonymous signup/account linking.
      // Approval covers user-entered email/password creation only. Never log or
      // echo this body; reject unrelated capabilities before reaching Auth.
      try {
        const body = JSON.parse(Buffer.concat(chunks, size).toString('utf8'))
        if (!request.headers['content-type']?.startsWith('application/json') || !body || Array.isArray(body) ||
          typeof body.email !== 'string' || !body.email.trim() || typeof body.password !== 'string' || !body.password ||
          Object.keys(body).some(key => !signupFields.has(key))) return reject(response, 400)
      } catch { return reject(response, 400) }
    }
    if (route.service === 'auth' && route.path.split('?', 1)[0] === idpPath) {
      try {
        const query = new URL(route.path, trusted.origin).searchParams
        if (!request.headers['content-type']?.startsWith('application/json') || query.get('key') !== 'demo-api-key' ||
          [...query.keys()].length !== 1 || !idpSignInAllowed(JSON.parse(Buffer.concat(chunks, size).toString('utf8')), trusted.origin)) return reject(response, 400)
      } catch { return reject(response, 400) }
    }
    const headers = headersWithoutHop(request.headers)
    for (const key of spoofHeaders) delete headers[key]
    for (const key of Object.keys(headers)) if (/^x-(?:middleware|invoke|nextjs)-/.test(key)) delete headers[key]
    headers.host = `localhost:${ports[route.service]}`
    if (route.service === 'backend' && headers.origin) headers.origin = 'http://localhost:20200'
    headers['content-length'] = size
    const upstream = http.request({ hostname: '127.0.0.1', port: ports[route.service], method: request.method, path: route.path, headers }, incoming => {
      if (expired()) { incoming.destroy(); reject(response, 410); return }
      // Pipe each received chunk immediately; no compression or response buffer.
      response.writeHead(incoming.statusCode ?? 502, headersWithoutHop(incoming.headers))
      incoming.on('error', () => response.destroy())
      incoming.pipe(response)
    })
    upstream.on('error', () => reject(response, 502))
    response.on('close', () => upstream.destroy())
    // An SSE response may remain open. Request parsing and upstream connect are
    // bounded; no inactivity timer closes a healthy heartbeat stream.
    upstream.setTimeout(60_000, () => upstream.destroy())
    upstream.on('response', () => upstream.setTimeout(0))
    upstream.end(Buffer.concat(chunks, size))
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 15_000
  let expiryTimer
  if (Number.isFinite(deadline)) {
    server.on('listening', () => {
      expiryTimer = setTimeout(() => {
        // Terminate established HTTP/SSE streams as well as refusing new peers.
        server.closeAllConnections()
        server.close()
      }, Math.max(0, deadline - now()))
      expiryTimer.unref()
    })
    server.on('close', () => clearTimeout(expiryTimer))
  }
  // Isolated production Next needs no HMR; reject every upgrade explicitly.
  server.on('upgrade', (_request, socket) => socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'))
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const allowed = new Set(['--origin', '--until', '--port', '--frontend-port', '--backend-port', '--auth-port'])
  const args = {}
  for (let i = 2; i < process.argv.length; i += 2) {
    if (!allowed.has(process.argv[i]) || !process.argv[i + 1]) throw new Error('Use --origin and --until UTC-ISO-deadline for HTTPS; optional numeric port flags')
    args[process.argv[i]] = ['--origin', '--until'].includes(process.argv[i]) ? process.argv[i + 1] : port(process.argv[i + 1])
  }
  const gateway = createPreviewGateway({ previewOrigin: args['--origin'], expiresAt: args['--until'], frontendPort: args['--frontend-port'], backendPort: args['--backend-port'], authPort: args['--auth-port'] })
  gateway.on('error', () => { console.error('Preview gateway could not listen'); process.exitCode = 1 })
  gateway.listen(args['--port'] ?? 20204, '127.0.0.1', () => {
    console.log(`Preview gateway listening on http://127.0.0.1:${gateway.address().port}; requires a separately authenticated outer gateway; never expose it bare`)
    if (args['--until']) console.log(`Gateway access ends at ${args['--until']}; this does not stop or configure the external tunnel provider`)
  })
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { gateway.closeAllConnections(); gateway.close() })
}
