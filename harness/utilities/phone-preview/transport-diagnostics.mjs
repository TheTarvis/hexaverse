// Optional local error-only telemetry. Never retain request/response contents.
import { constants, openSync, fstatSync, fchmodSync, writeSync, closeSync } from 'node:fs'
import path from 'node:path'

const routes = [
  [/^\/v1\/accounts$/, '/api/v1/accounts'],
  [/^\/v1\/accounts\/[^/]+\/profile$/, '/api/v1/accounts/:id/profile'],
  [/^\/v1\/accounts\/[^/]+$/, '/api/v1/accounts/:id'],
  [/^\/v1\/corporations\/me$/, '/api/v1/corporations/me'],
  [/^\/v1\/corporations$/, '/api/v1/corporations'],
  [/^\/v1\/galaxy$/, '/api/v1/galaxy'],
  [/^\/v1\/systems\/[^/]+\/station$/, '/api/v1/systems/:id/station'],
  [/^\/v1\/systems\/[^/]+\/bodies\/[^/]+\/name$/, '/api/v1/systems/:id/bodies/:id/name'],
  [/^\/v1\/systems\/[^/]+$/, '/api/v1/systems/:id'],
  [/^\/v1\/fleets$/, '/api/v1/fleets'],
  [/^\/v1\/fleets\/[^/]+$/, '/api/v1/fleets/:id'],
  ...['scan-targets', 'survey', 'orders', 'orders/preview', 'hold', 'release', 'cut-drive', 'stop', 'jump', 'mine', 'scan', 'sell', 'refuel'].map(verb => [new RegExp(`^/v1/fleets/[^/]+/${verb}$`), `/api/v1/fleets/:id/${verb}`]),
  [/^\/v1\/actions$/, '/api/v1/actions'],
  [/^\/v1\/actions\/[^/]+$/, '/api/v1/actions/:id'],
  ...['cancel', 'acknowledge'].map(verb => [new RegExp(`^/v1/actions/[^/]+/${verb}$`), `/api/v1/actions/:id/${verb}`]),
  [/^\/v1\/sightings$/, '/api/v1/sightings'],
  [/^\/v1\/market\/board$/, '/api/v1/market/board'],
  [/^\/v1\/channels\/[^/]+\/stream$/, '/api/v1/channels/:id/stream'],
]
const auth = new Set(['/emulator/auth/handler', '/emulator/auth/iframe', '/securetoken.googleapis.com/v1/token',
  ...['signUp', 'signInWithPassword', 'lookup', 'signInWithIdp'].map(verb => `/identitytoolkit.googleapis.com/v1/accounts:${verb}`)])
const labels = new Set(['/', '/login', '/systems/:id', '/_next/static/:asset', '/models/space/:asset', '/public/:asset', '/storybook/:asset', '/:upstream', ...auth, ...routes.map(([, label]) => label)])
const events = new Set(['upstream_connection_error', 'upstream_truncated', 'upstream_timeout', 'upstream_http_error', 'downstream_aborted', 'downstream_response_error', 'request_aborted'])
const codes = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN',
  'ERR_STREAM_PREMATURE_CLOSE', 'ERR_HTTP_CONTENT_LENGTH_MISMATCH', 'HPE_INVALID_CONSTANT', 'HPE_INVALID_HEADER_TOKEN',
  'HPE_INVALID_CONTENT_LENGTH', 'HPE_UNEXPECTED_CONTENT_LENGTH', 'HPE_HEADER_OVERFLOW', 'HPE_INVALID_TRANSFER_ENCODING', 'HPE_INVALID_CHUNK_SIZE',
  'INCOMPLETE_UPSTREAM', 'UPSTREAM_TIMEOUT', 'DOWNSTREAM_ABORT', 'HTTP_4XX', 'HTTP_5XX', 'UNKNOWN'])

export function transportPath(route) {
  const pathname = String(route.path ?? '').split('?', 1)[0]
  if (route.service === 'auth') return auth.has(pathname) ? pathname : '/:upstream'
  if (route.service === 'backend') return routes.find(([pattern]) => pattern.test(pathname))?.[1] ?? '/:upstream'
  if (route.service === 'storybook') return '/storybook/:asset'
  if (pathname === '/' || pathname === '/login') return pathname
  if (/^\/systems\/[^/]+$/.test(pathname)) return '/systems/:id'
  if (pathname.startsWith('/_next/static/')) return '/_next/static/:asset'
  if (pathname.startsWith('/models/space/')) return '/models/space/:asset'
  return '/public/:asset'
}

/** Only fixed vocabularies and numeric metadata can cross this boundary. */
export function transportRecord(value, now = Date.now()) {
  return {
    timestamp: new Date(now).toISOString(),
    event: events.has(value.event) ? value.event : 'upstream_connection_error',
    method: ['GET', 'HEAD', 'POST'].includes(value.method) ? value.method : 'OTHER',
    pathname: labels.has(value.pathname) ? value.pathname : '/:upstream',
    status: Number.isInteger(value.status) && value.status >= 100 && value.status <= 599 ? value.status : null,
    code: codes.has(value.code) ? value.code : 'UNKNOWN',
    receivedBytes: Number.isSafeInteger(value.receivedBytes) && value.receivedBytes >= 0 ? value.receivedBytes : 0,
  }
}

/** A private, non-symlink regular file; hard cap and the same preview cutoff. */
export function createTransportLog({ filePath, expiresAt, now = Date.now, maxBytes = 262144 }) {
  const deadline = Date.parse(expiresAt)
  if (!path.isAbsolute(filePath) || !Number.isFinite(deadline) || deadline <= now() || deadline - now() > 7 * 86400000) throw new Error('Diagnostics require an absolute local file and the preview expiry')
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 512 || maxBytes > 1048576) throw new Error('Invalid diagnostics byte cap')
  const fd = openSync(filePath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
  const info = fstatSync(fd)
  if (!info.isFile() || (process.getuid && info.uid !== process.getuid())) { closeSync(fd); throw new Error('Diagnostics require an owned regular file') }
  fchmodSync(fd, 0o600)
  let bytes = info.size, closed = false
  const record = value => {
    if (closed || now() >= deadline || bytes >= maxBytes) return false
    const line = JSON.stringify(transportRecord(value, now())) + '\n'
    const size = Buffer.byteLength(line)
    if (bytes + size > maxBytes) return false
    try { writeSync(fd, line); bytes += size; return true } catch { return false }
  }
  record.close = () => { if (!closed) { closed = true; closeSync(fd) } }
  return record
}
