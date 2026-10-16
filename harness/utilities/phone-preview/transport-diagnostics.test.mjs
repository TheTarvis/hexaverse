import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, readFile, stat, symlink, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createPreviewGateway } from './gateway.mjs'
import { transportPath, transportRecord, createTransportLog } from './transport-diagnostics.mjs'

const origin = 'https://preview.example'
const expiry = () => new Date(Date.now() + 60000).toISOString()
let servers = [], directories = []
async function listen(server) {
  servers.push(server)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return server.address().port
}
afterEach(async () => {
  await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })))
  for (const dir of directories) await rm(dir, { recursive: true, force: true })
  servers = []; directories = []
})
function read(port, target = '/', headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: target, headers: { origin, ...headers } }, response => {
      const chunks = []
      const finish = () => resolve({ status: response.statusCode, complete: response.complete, body: Buffer.concat(chunks) })
      response.on('data', chunk => chunks.push(chunk))
      response.once('end', finish); response.once('aborted', finish); response.on('error', finish)
    })
    request.on('error', reject)
  })
}
async function waitFor(predicate) {
  const end = Date.now() + 1000
  while (!predicate()) { if (Date.now() > end) throw new Error('Missing diagnostic event'); await new Promise(resolve => setTimeout(resolve, 5)) }
}

test('route labels exclude all dynamic identifiers and query values', () => {
  for (const [service, target, expected] of [
    ['frontend', '/systems/private-corporation?token=private-query', '/systems/:id'],
    ['frontend', '/_next/static/private-hash/app.js?key=private-key', '/_next/static/:asset'],
    ['backend', '/v1/accounts/private-email/profile?email=private-email', '/api/v1/accounts/:id/profile'],
    ['backend', '/v1/fleets/private-fleet/orders/preview?token=private-query', '/api/v1/fleets/:id/orders/preview'],
    ['backend', '/v1/channels/private-user/stream?token=private-token', '/api/v1/channels/:id/stream'],
    ['auth', '/emulator/auth/handler?email=private-email&token=private-token', '/emulator/auth/handler'],
    ['storybook', '/storybook/private-name.png?token=private-token', '/storybook/:asset'],
  ]) assert.equal(transportPath({ service, path: target }), expected)
})

test('private log filters fields and codes, caps bytes across reopen, expires, and refuses symlinks', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hexaverse-transport-test-')); directories.push(directory)
  const filePath = path.join(directory, 'errors.jsonl')
  let now = Date.now()
  const expiresAt = new Date(now + 60000).toISOString()
  const log = createTransportLog({ filePath, expiresAt, now: () => now, maxBytes: 1024 })
  const value = { event: 'upstream_truncated', method: 'GET', pathname: '/systems/:id', status: 200, code: 'INCOMPLETE_UPSTREAM', receivedBytes: 12,
    headers: { cookie: 'private-cookie' }, authorization: 'private-authorization', body: 'private-body', query: 'private-query', message: 'private-error' }
  assert.equal(log(value), true)
  for (let i = 0; i < 20; i++) log(value)
  log.close()
  const text = await readFile(filePath, 'utf8')
  assert.ok(Buffer.byteLength(text) <= 1024)
  assert.doesNotMatch(text, /private-|cookie|authorization|body|query|message/)
  assert.equal((await stat(filePath)).mode & 0o777, 0o600)
  const reopened = createTransportLog({ filePath, expiresAt, now: () => now, maxBytes: 1024 })
  assert.equal(reopened(value), false)
  now += 60000
  assert.equal(reopened(value), false); reopened.close()
  assert.equal(await readFile(filePath, 'utf8'), text)
  assert.equal(transportRecord({ ...value, pathname: '/systems/private-user', code: 'private-error' }).pathname, '/:upstream')
  assert.equal(transportRecord({ ...value, code: 'private-error' }).code, 'UNKNOWN')
  const link = path.join(directory, 'link'); await symlink(filePath, link)
  assert.throws(() => createTransportLog({ filePath: link, expiresAt, maxBytes: 1024 }))
})

test('connection refusal records a safe error and returns a complete 502', async () => {
  const unused = http.createServer(); const frontendPort = await listen(unused)
  await new Promise(resolve => unused.close(resolve)); servers = servers.filter(server => server !== unused)
  const events = []
  const port = await listen(createPreviewGateway({ previewOrigin: origin, expiresAt: expiry(), frontendPort, onTransportError: value => events.push(value) }))
  const response = await read(port, '/systems/private-person?token=private-query', { cookie: 'private-cookie', authorization: 'Bearer private-authorization' })
  assert.equal(response.status, 502); assert.equal(response.complete, true)
  assert.equal(events.length, 1); assert.equal(events[0].code, 'ECONNREFUSED'); assert.equal(events[0].pathname, '/systems/:id')
  assert.doesNotMatch(JSON.stringify(events), /private-|cookie|authorization|token/)
})

test('truncated content-length response records byte count without logging its body', async () => {
  const frontendPort = await listen(http.createServer((_request, response) => {
    response.writeHead(200, { 'content-length': 100 }); response.write('private-body')
    setTimeout(() => response.destroy(), 10)
  }))
  const events = []
  const port = await listen(createPreviewGateway({ previewOrigin: origin, expiresAt: expiry(), frontendPort, onTransportError: value => events.push(value) }))
  const response = await read(port, '/systems/private-user?token=private-query')
  await waitFor(() => events.length > 0)
  assert.equal(response.complete, false)
  assert.equal(events.length, 1); assert.equal(events[0].event, 'upstream_truncated'); assert.equal(events[0].status, 200)
  assert.equal(events[0].receivedBytes, Buffer.byteLength('private-body'))
  assert.doesNotMatch(JSON.stringify(events), /private-/)
})

test('client cancellation of a live stream is distinguished from upstream truncation', async () => {
  const backendPort = await listen(http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' }); response.write('data: private-body\n\n')
    const timer = setInterval(() => response.write(': heartbeat\n\n'), 50)
    response.once('close', () => clearInterval(timer))
  }))
  const events = []
  const port = await listen(createPreviewGateway({ previewOrigin: origin, expiresAt: expiry(), backendPort, onTransportError: value => events.push(value) }))
  await new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/api/v1/channels/private-user/stream?token=private-token', headers: { origin } }, response => {
      response.once('data', () => { request.destroy(); resolve() }); response.on('error', () => {})
    }); request.on('error', reject)
  })
  await waitFor(() => events.length > 0)
  assert.equal(events.length, 1); assert.equal(events[0].event, 'downstream_aborted')
  assert.equal(events[0].pathname, '/api/v1/channels/:id/stream')
  assert.doesNotMatch(JSON.stringify(events), /private-/)
})

test('valid fragmented gzip remains complete and silent; completed 5xx records no content', async () => {
  const compressed = gzipSync('fixture successful page')
  const frontendPort = await listen(http.createServer((request, response) => {
    if (request.url === '/login') { response.writeHead(503); response.end('private-error-body'); return }
    response.writeHead(200, { 'content-encoding': 'gzip' }); response.write(compressed.subarray(0, 10))
    setTimeout(() => response.end(compressed.subarray(10)), 10)
  }))
  const events = []
  const port = await listen(createPreviewGateway({ previewOrigin: origin, expiresAt: expiry(), frontendPort, onTransportError: value => events.push(value) }))
  const success = await read(port)
  assert.equal(success.complete, true); assert.equal(gunzipSync(success.body).toString(), 'fixture successful page')
  assert.deepEqual(events, [])
  assert.equal((await read(port, '/login')).status, 503)
  assert.equal(events.length, 1); assert.equal(events[0].event, 'upstream_http_error'); assert.equal(events[0].status, 503)
  assert.doesNotMatch(JSON.stringify(events), /private-/)
  const brokenCallback = await listen(createPreviewGateway({ previewOrigin: origin, expiresAt: expiry(), frontendPort, onTransportError: () => { throw new Error('fixture telemetry failure') } }))
  assert.equal((await read(brokenCallback, '/login')).status, 503)
})
