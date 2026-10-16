import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { createPreviewGateway, previewRoute } from './gateway.mjs'

const origin = 'https://preview.example'
const futureExpiry = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()
const seen = []
const servers = []
let gatewayPort
let streamFinished = false
let temporaryDirectory
async function listen(server) {
  servers.push(server)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return server.address().port
}
function fixture(service) {
  return http.createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const received = { service, url: request.url, method: request.method, headers: request.headers, body: Buffer.concat(chunks).toString() }
    seen.push(received)
    if (request.url.startsWith('/v1/channels/')) {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' })
      response.write('event: connected\ndata: fixture\n\n')
      const timer = setTimeout(() => { streamFinished = true; response.end(': heartbeat\n\n') }, 100)
      response.once('close', () => clearTimeout(timer))
      return
    }
    response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': ['session=fixture; HttpOnly; Secure', 'nonce=fixture; Secure'] })
    response.end(JSON.stringify(received))
  })
}
before(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'hexaverse-preview-gateway-'))
  const storybookDirectory = path.join(temporaryDirectory, 'storybook')
  await mkdir(path.join(storybookDirectory, 'assets'), { recursive: true })
  await writeFile(path.join(storybookDirectory, 'index.html'), '<h1>Fixture Storybook</h1>')
  await writeFile(path.join(storybookDirectory, 'iframe.html'), '<p>Fixture iframe</p>')
  await writeFile(path.join(storybookDirectory, 'index.json'), '{"fixture":true}')
  await writeFile(path.join(storybookDirectory, 'assets/fixture.js'), 'export const fixture = true')
  await writeFile(path.join(temporaryDirectory, 'outside.js'), 'must never serve')
  await symlink(path.join(temporaryDirectory, 'outside.js'), path.join(storybookDirectory, 'assets/escape.js'))
  const frontendPort = await listen(fixture('frontend'))
  const backendPort = await listen(fixture('backend'))
  const authPort = await listen(fixture('auth'))
  gatewayPort = await listen(createPreviewGateway({ previewOrigin: origin, expiresAt: futureExpiry(), frontendPort, backendPort, authPort, storybookDirectory, maxBodyBytes: 256 }))
})
after(async () => {
  await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })))
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
})
function request(path, { method = 'GET', headers = {}, body, port = gatewayPort } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({ hostname: '127.0.0.1', port, method, path,
      headers: Object.fromEntries(Object.entries({ origin, ...headers }).filter(([, value]) => value !== undefined)) }, incoming => {
      const chunks = []
      incoming.on('data', chunk => chunks.push(chunk))
      incoming.on('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks).toString() }))
    })
    outgoing.on('error', reject)
    outgoing.end(body)
  })
}

test('configuration requires an explicit secure or literal loopback QA origin and numeric upstream ports', () => {
  for (const value of [undefined, 'http://preview.example', 'http://0.0.0.0:20204', 'http://localhost:20204', 'http://127.1:20204',
    'http://127.0.0.1', 'https://*.example', 'http://127.0.0.1:20204/path', 'http://name:password@127.0.0.1:20204',
    'https://name:password@preview.example', 'https://preview.example/path', 'https://preview.example/?secret=a']) {
    assert.throws(() => createPreviewGateway({ previewOrigin: value, expiresAt: futureExpiry() }))
  }
  for (const frontendPort of [0, -1, 65536, 'example.com', '20205/path']) assert.throws(() => createPreviewGateway({ previewOrigin: origin, expiresAt: futureExpiry(), frontendPort }))
  assert.equal(servers.at(-1).address().address, '127.0.0.1')
})

test('logged-out galaxy forwards only the exact committed start-area asset to the frontend', async () => {
  for (const method of ['GET', 'HEAD']) {
    assert.deepEqual(previewRoute(method, '/galaxy/start-area.json'), { service: 'frontend', path: '/galaxy/start-area.json' })
    const response = await request('/galaxy/start-area.json', { method })
    assert.equal(response.status, 200)
    if (method === 'GET') {
      const received = JSON.parse(response.body)
      assert.equal(received.service, 'frontend')
      assert.equal(received.url, '/galaxy/start-area.json')
    }
  }
  for (const target of ['/galaxy/other.json', '/galaxy/start-area.json/extra', '/galaxy/%73tart-area.json']) {
    assert.equal(previewRoute('GET', target), null)
    assert.equal((await request(target)).status, 404)
  }
  assert.equal(previewRoute('POST', '/galaxy/start-area.json'), null)
  assert.equal((await request('/galaxy/start-area.json', { method: 'POST' })).status, 404)
})

test('explicit local QA origin accepts only its configured exact port and does not weaken external mode', async () => {
  const localOrigin = 'http://127.0.0.1:20204'
  const localPort = await listen(createPreviewGateway({ previewOrigin: localOrigin, frontendPort: servers[0].address().port }))
  const result = await request('/', { port: localPort, headers: { origin: localOrigin } })
  assert.equal(result.status, 200)
  assert.equal(JSON.parse(result.body).service, 'frontend')
  for (const wrong of ['http://127.0.0.1:20205', 'http://localhost:20204', origin]) {
    assert.equal((await request('/', { port: localPort, headers: { origin: wrong } })).status, 403)
  }
  assert.equal((await request('/', { headers: { origin: localOrigin } })).status, 403)
})

test('external mode requires a valid exact future UTC expiry within seven days; local QA may omit it', () => {
  const wallTime = Date.parse('2026-10-16T10:00:00Z')
  const options = { previewOrigin: origin, now: () => wallTime }
  for (const expiresAt of [undefined, '', null, 'tomorrow', '2026-10-16', '2026-10-17T10:00:00+00:00',
    '2026-10-17T10:00:00', '2026-02-30T10:00:00Z', '2026-10-16T10:00:00Z', '2026-10-15T10:00:00Z',
    '2026-10-24T10:00:00Z']) assert.throws(() => createPreviewGateway({ ...options, expiresAt }))
  for (const expiresAt of ['2026-10-19T00:00:00Z', '2026-10-19T00:00:00.123Z']) {
    assert.doesNotThrow(() => createPreviewGateway({ ...options, expiresAt }))
  }
  assert.doesNotThrow(() => createPreviewGateway({ previewOrigin: 'http://127.0.0.1:20204' }))
})

test('wall-clock expiry denies requests even before the scheduled shutdown callback runs', async () => {
  let wallTime = Date.parse('2026-10-16T10:00:00Z')
  const deadline = '2026-10-16T11:00:00Z'
  const expiredPort = await listen(createPreviewGateway({ previewOrigin: origin, expiresAt: deadline,
    now: () => wallTime, frontendPort: servers[0].address().port }))
  assert.equal((await request('/', { port: expiredPort })).status, 200)
  const count = seen.length
  wallTime = Date.parse(deadline)
  assert.equal((await request('/', { port: expiredPort })).status, 410)
  assert.equal((await request('/api/v1/accounts', { port: expiredPort, method: 'POST' })).status, 410)
  assert.equal(seen.length, count)
  assert.throws(() => createPreviewGateway({ previewOrigin: origin, expiresAt: deadline, now: () => wallTime }), /future/)
})

test('expiry while awaiting a request body or static filesystem lookup fails closed', async () => {
  const start = Date.parse('2026-10-16T10:00:00Z'), deadline = '2026-10-16T11:00:00Z'
  for (const [target, method] of [['/api/v1/accounts', 'POST'], ['/storybook/index.html', 'GET']]) {
    let wallTime = start
    const gateway = createPreviewGateway({ previewOrigin: origin, expiresAt: deadline, now: () => wallTime,
      backendPort: servers[1].address().port, storybookDirectory: path.join(temporaryDirectory, 'storybook') })
    const temporaryPort = await listen(gateway)
    // The factory's request listener passes its first guard then yields while
    // awaiting the body/filesystem. This listener advances the injected clock.
    gateway.on('request', () => { wallTime = Date.parse(deadline) })
    const count = seen.length
    assert.equal((await request(target, { method, port: temporaryPort, ...(method === 'POST' ? { body: '{}' } : {}) })).status, 410)
    assert.equal(seen.length, count, 'expired mutation must not reach the backend')
  }
})

test('deadline closes an active SSE stream and listener; subsequent connections are refused', { timeout: 5000 }, async () => {
  let upstreamClosed
  const upstreamClosedPromise = new Promise(resolve => { upstreamClosed = resolve })
  const fixturePort = await listen(http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write('data: connected\n\n')
    response.on('close', upstreamClosed)
  }))
  const expiring = createPreviewGateway({ previewOrigin: origin, backendPort: fixturePort,
    expiresAt: new Date(Date.now() + 700).toISOString() })
  const closed = once(expiring, 'close')
  const expiringPort = await listen(expiring)
  let firstChunk = false
  const streamClosed = new Promise((resolve, reject) => {
    const connection = http.get({ hostname: '127.0.0.1', port: expiringPort,
      path: '/api/v1/channels/fixture/stream?token=fake-expiry-fixture', headers: { origin } }, incoming => {
      incoming.on('data', () => { firstChunk = true })
      incoming.on('close', resolve)
      incoming.on('error', () => {}) // Deliberate shutdown aborts the open body.
    })
    connection.on('error', reject)
  })
  await Promise.all([closed, streamClosed, upstreamClosedPromise])
  assert.equal(firstChunk, true)
  assert.equal(expiring.listening, false)
  await assert.rejects(request('/', { port: expiringPort }), { code: 'ECONNREFUSED' })
})

test('raw path validation rejects encoded traversal, separators, debug/admin/push and unsupported methods', async () => {
  const denied = [
    '/dev/login', '/dev/system-storyboard', '/spike/stealth', '/admin', '/healthcheck', '/.env', '/.git/config',
    '/api/v1/push/action-sweep', '/api/v1/admin', '/api/v1/accounts/id/admin', '/api/v1/corporations/id',
    '/emulator/v1/projects/id/accounts', '/www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp', '/identitytoolkit.googleapis.com/v1/accounts:update',
    '/identitytoolkit.googleapis.com/v1/projects/id/accounts', '/__/auth/handler', '/_next/image?url=http://localhost',
    '/_next/static/chunks/app.js.map', '/_next/webpack-hmr', '/_next/server/app/page.js',
    '/api/v1/fleets/../push', '/api/v1/fleets/%2e%2e/push', '/api/v1/fleets/%252e%252e/push',
    '/api%2fv1/galaxy', '/api/v1/systems/a%2fb', '/api/v1/systems/a%5cb', '/api/v1/systems/a%00',
    '/api//v1/galaxy', '//api/v1/galaxy', '/api/./v1/galaxy', '/api/v1/galaxy/',
  ]
  const count = seen.length
  for (const path of denied) {
    assert.equal(previewRoute('GET', path), null, path)
    assert.equal((await request(path)).status, 404, path)
  }
  for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) assert.equal((await request('/api/v1/fleets/id/orders', { method })).status, 404)
  for (const path of ['http://localhost/api/v1/galaxy', '/api\\v1/galaxy', '/api/v1/galaxy#fragment', '/api/v1/galaxy\n']) assert.equal(previewRoute('GET', path), null)
  assert.equal(seen.length, count, 'denied requests never reach any upstream')
})

test('only exact four browser Auth REST POST routes reach the emulator', async () => {
  for (const path of ['/identitytoolkit.googleapis.com/v1/accounts:signUp', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword', '/identitytoolkit.googleapis.com/v1/accounts:lookup', '/securetoken.googleapis.com/v1/token']) {
    assert.equal((await request(path)).status, 404)
    const signup = path.endsWith(':signUp')
    const body = signup ? JSON.stringify({ email: 'fixture@example.com', password: 'fixture-only', returnSecureToken: true, clientType: 'CLIENT_TYPE_WEB' }) : 'grant_type=refresh_token'
    const response = await request(`${path}?key=fixture-key`, { method: 'POST', body, headers: { 'content-type': signup ? 'application/json' : 'application/x-www-form-urlencoded' } })
    assert.equal(response.status, 200)
    const received = JSON.parse(response.body)
    assert.equal(received.service, 'auth')
    assert.equal(received.url, `${path}?key=fixture-key`)
    assert.equal(received.body, body)
    assert.equal((await request(`${path}/extra`, { method: 'POST' })).status, 404)
  }
})

test('email signup permits only its exact POST path and trusted origin, never adjacent Auth capabilities', async () => {
  const signup = '/identitytoolkit.googleapis.com/v1/accounts:signUp'
  const count = seen.length
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    assert.equal((await request(signup, { method })).status, 404)
  }
  for (const path of [`${signup}/extra`, `${signup}/`, signup.replace(':', '%3A'), signup.toLowerCase(),
    '/identitytoolkit.googleapis.com/v1/accounts:update', '/identitytoolkit.googleapis.com/v1/accounts:sendOobCode',
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp', '/emulator/v1/projects/fixture/accounts']) {
    assert.equal((await request(path, { method: 'POST' })).status, 404)
  }
  for (const origin of [undefined, 'null', 'https://other.example']) {
    assert.equal((await request(signup, { method: 'POST', headers: { origin } })).status, 403)
  }
  for (const body of [{}, { email: 'fixture@example.com' }, { password: 'fixture-only' },
    { email: '', password: 'fixture-only' },
    { email: 'fixture@example.com', password: 'fixture-only', idToken: 'fixture-linking-token' },
    { email: 'fixture@example.com', password: 'fixture-only', tenantId: 'other' },
    { email: 'fixture@example.com', password: 'fixture-only', localId: 'existing-user' }]) {
    assert.equal((await request(signup, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })).status, 400)
  }
  assert.equal(seen.length, count, 'restricted signup variants never reach an upstream')
})

test('browser gameplay routes forward bearer, cookies, query and body; strip spoofed forwarding/hop headers', async () => {
  const response = await request('/api/v1/fleets/fleet_1/orders?fixture=one%20two', {
    method: 'POST', body: '{"bodyId":"feat-body-1"}', headers: {
      authorization: 'Bearer fixture-token', cookie: 'session=fixture; fw_aid=fixture', 'content-type': 'application/json',
      'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'http', 'x-original-url': '/admin',
      connection: 'close, x-secret-hop', 'x-secret-hop': 'must-not-forward',
    },
  })
  assert.equal(response.status, 200)
  const received = JSON.parse(response.body)
  assert.equal(received.service, 'backend')
  assert.equal(received.url, '/v1/fleets/fleet_1/orders?fixture=one%20two')
  assert.equal(received.headers.authorization, 'Bearer fixture-token')
  assert.equal(received.headers.cookie, 'session=fixture; fw_aid=fixture')
  assert.equal(received.headers.origin, 'http://localhost:20200')
  for (const name of ['x-forwarded-host', 'x-forwarded-proto', 'x-original-url', 'x-secret-hop']) assert.equal(received.headers[name], undefined)
  assert.equal(received.body, '{"bodyId":"feat-body-1"}')
  assert.deepEqual(response.headers['set-cookie'], ['session=fixture; HttpOnly; Secure', 'nonce=fixture; Secure'])
  for (const path of ['/api/v1/accounts/firestore', '/api/v1/corporations/me', '/api/v1/galaxy', '/api/v1/systems/sys_0_0', '/api/v1/market/board', '/api/v1/sightings?limit=5', '/api/v1/actions?actor=fleet_1']) assert.equal((await request(path)).status, 200, path)
})

test('foreign, absent or null mutation origins fail before any upstream translation', async () => {
  const count = seen.length
  for (const badOrigin of ['https://attacker.example', 'null', 'http://localhost:20200']) {
    assert.equal((await request('/api/v1/galaxy', { headers: { origin: badOrigin } })).status, 403)
    assert.equal((await request('/api/v1/accounts', { method: 'POST', headers: { origin: badOrigin, host: 'preview.example' } })).status, 403)
  }
  assert.equal((await request('/api/v1/accounts', { method: 'POST', headers: { origin: '' } })).status, 403)
  assert.equal((await request('/api/v1/accounts', { method: 'POST', headers: { 'x-http-method-override': 'DELETE' } })).status, 404)
  assert.equal(seen.length, count)
})

test('only production game pages and asset types reach Next, with encoded build brackets supported', async () => {
  for (const path of ['/', '/login?redirect=%2Fsystems%2Fsys_0_0', '/systems/sys_0_0?_rsc=fixture', '/_next/static/chunks/app/systems/%5BsystemId%5D/page-fixture.js', '/_next/static/media/font-fixture.woff2', '/models/space/lane-gate.glb']) {
    const result = await request(path)
    assert.equal(result.status, 200, path)
    assert.equal(JSON.parse(result.body).service, 'frontend')
  }
  assert.equal((await request('/', { method: 'POST' })).status, 404)
})

test('oversized request is rejected without partial forwarding', async () => {
  const count = seen.length
  assert.equal((await request('/api/v1/accounts', { method: 'POST', body: 'x'.repeat(257) })).status, 413)
  assert.equal((await request('/api/v1/accounts', { method: 'POST', headers: { 'transfer-encoding': 'chunked' }, body: 'x'.repeat(257) })).status, 413)
  assert.equal(seen.length, count)
})

test('Storybook serves confined production artifacts without reaching Next or exposing sources/symlink escapes', async () => {
  const count = seen.length
  const redirect = await request('/storybook')
  assert.equal(redirect.status, 308)
  assert.equal(redirect.headers.location, '/storybook/')
  assert.match((await request('/storybook/')).body, /Fixture Storybook/)
  assert.match((await request('/storybook/iframe.html?id=fixture--story')).body, /Fixture iframe/)
  assert.equal((await request('/storybook/assets/fixture.js')).headers['content-type'], 'text/javascript; charset=utf-8')
  assert.deepEqual(JSON.parse((await request('/storybook/index.json')).body), { fixture: true })
  for (const name of ['assets/escape.js', '../outside.js', '%2e%2e/outside.js', '.env', 'main.ts', 'assets/fixture.js.map', 'assets/missing.js']) assert.equal((await request(`/storybook/${name}`)).status, 404, name)
  assert.equal((await request('/storybook/index.html', { method: 'POST' })).status, 404)
  assert.equal((await request('/storybook/', { method: 'HEAD' })).body, '')
  assert.equal(seen.length, count)
})

test('all websocket upgrades are rejected; production app does not need HMR', async () => {
  assert.equal((await request('/', { headers: { connection: 'Upgrade', upgrade: 'websocket' } })).status, 404)
})

test('SSE first chunk arrives before upstream completion; fake query token is preserved without logs', async () => {
  streamFinished = false
  const logs = []
  const previousLog = console.log, previousError = console.error
  console.log = (...items) => logs.push(items)
  console.error = (...items) => logs.push(items)
  try {
    const chunks = await new Promise((resolve, reject) => {
      const outgoing = http.get({ hostname: '127.0.0.1', port: gatewayPort, path: '/api/v1/channels/fixture/stream?token=fixture-stream-secret', headers: { origin } }, incoming => {
        assert.equal(incoming.headers['content-type'], 'text/event-stream')
        const pieces = []
        incoming.on('data', chunk => {
          if (!pieces.length) assert.equal(streamFinished, false, 'first event must not be buffered until stream ends')
          pieces.push(chunk.toString())
        })
        incoming.on('end', () => resolve(pieces.join('')))
      })
      outgoing.on('error', reject)
    })
    assert.match(chunks, /event: connected/)
    assert.match(chunks, /: heartbeat/)
    assert.equal(seen.at(-1).url, '/v1/channels/fixture/stream?token=fixture-stream-secret')
    assert.deepEqual(logs, [])
  } finally { console.log = previousLog; console.error = previousError }
})
