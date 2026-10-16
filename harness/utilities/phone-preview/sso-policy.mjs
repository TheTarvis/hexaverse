// Deliberately limited to the installed Firebase 12.15.0 web SDK's Google
// sign-in simulation. This validates transport shape, not identity ownership.
// Auth Emulator can impersonate/link existing accounts; the outer gate is vital.
const version = '12.15.0'
const handlerPath = '/emulator/auth/handler'
const iframePath = '/emulator/auth/iframe'
const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))
const bounded = (value, length) => typeof value === 'string' && value.length <= length && !/[\x00-\x1f\x7f]/.test(value)

function originOf(value) {
  try {
    const url = new URL(value)
    const local = url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(value)
    if ((url.protocol !== 'https:' && !local) || url.hostname.includes('*') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch { return null }
}
function uniqueParams(params, allowed) {
  const keys = [...params.keys()]
  return keys.length === new Set(keys).size && keys.every(key => allowed.has(key))
}
function sameOriginUrl(value, origin, pathname) {
  if (!bounded(value, 8192) || !(value === `${origin}${pathname}` || value.startsWith(`${origin}${pathname}?`))) return null
  try {
    const url = new URL(value)
    return url.origin === origin && url.pathname === pathname && !url.username && !url.password && !url.hash ? url : null
  } catch { return null }
}
function loginRedirectAllowed(value, origin) {
  const url = sameOriginUrl(value, origin, '/login')
  if (!url || !uniqueParams(url.searchParams, new Set(['redirect', 'signUp']))) return false
  const redirect = url.searchParams.get('redirect')
  if (redirect !== null && !/^(?:\/|\/systems\/[A-Za-z0-9_-]{1,180})$/.test(redirect)) return false
  const signUp = url.searchParams.get('signUp')
  return signUp === null || signUp === 'true' || signUp === 'false'
}

/** Exact GET helper routes only; caller still enforces method, origin and expiry. */
export function ssoHelperAllowed(target, previewOrigin) {
  const origin = originOf(previewOrigin)
  if (!origin || !bounded(target, 16384) || !target.startsWith('/') || target.includes('#')) return false
  const rawPath = target.split('?', 1)[0]
  if (rawPath !== handlerPath && rawPath !== iframePath) return false
  let url
  try { url = new URL(target, origin) } catch { return false }
  const params = url.searchParams
  if (params.get('apiKey') !== 'demo-api-key' || params.get('appName') !== '[DEFAULT]' || params.get('v') !== version) return false
  if (rawPath === handlerPath) {
    if (!uniqueParams(params, new Set(['apiKey', 'appName', 'v', 'providerId', 'authType', 'redirectUrl', 'scopes', 'eventId']))) return false
    if (params.get('providerId') !== 'google.com' || params.get('scopes') !== 'profile' || !loginRedirectAllowed(params.get('redirectUrl'), origin)) return false
    const type = params.get('authType'), event = params.get('eventId')
    return type === 'signInViaPopup' ? /^\d{10}$/.test(event ?? '') : type === 'signInViaRedirect' && event === null
  }
  if (!uniqueParams(params, new Set(['apiKey', 'appName', 'v', 'eid', 'fw', 'usegapi', 'jsh']))) return false
  if (params.get('eid') !== 'p') return false
  if (params.has('fw') && !/^[A-Za-z0-9_.-]{1,40}(?:,[A-Za-z0-9_.-]{1,40}){0,5}$/.test(params.get('fw'))) return false
  // gapi's iframe loader may append these transport hints. They do not select
  // an emulator action/provider/tenant. Fragments never reach this validator.
  if (params.has('usegapi') && params.get('usegapi') !== '1') return false
  if (params.has('jsh') && (!bounded(params.get('jsh'), 2048) || !/^m;\/_\/scs\/[A-Za-z0-9_./=;-]+$/.test(params.get('jsh')))) return false
  return true
}

function fakeGoogleClaimsAllowed(encoded) {
  if (!bounded(encoded, 8192)) return false
  let claims
  try { claims = JSON.parse(encoded) } catch { return false }
  if (!plainObject(claims)) return false
  const allowed = new Set(['sub', 'iss', 'aud', 'exp', 'iat', 'name', 'screen_name', 'email', 'email_verified', 'picture'])
  if (!Object.keys(claims).every(key => allowed.has(key))) return false
  if (!bounded(claims.sub, 256) || !claims.sub || claims.iss !== '' || claims.aud !== '' || claims.exp !== 0 || claims.iat !== 0 || claims.email_verified !== true) return false
  if (!bounded(claims.email, 320) || !/^[^\s@]+@[^\s@]+$/.test(claims.email)) return false
  for (const key of ['name', 'screen_name']) if (key in claims && !bounded(claims[key], 256)) return false
  if ('picture' in claims && !bounded(claims.picture, 2048)) return false
  return true
}

/** Parsed JSON from the SDK's sign-in flow, excluding linking/reauth/tenants. */
export function idpSignInAllowed(body, previewOrigin) {
  const origin = originOf(previewOrigin)
  if (!origin || !plainObject(body)) return false
  const allowed = new Set(['requestUri', 'sessionId', 'returnSecureToken', 'returnIdpCredential'])
  if (Object.keys(body).length !== allowed.size || !Object.keys(body).every(key => allowed.has(key))) return false
  if (body.sessionId !== 'ValueNotUsedByAuthEmulator' || body.returnSecureToken !== true || body.returnIdpCredential !== true) return false
  const uri = sameOriginUrl(body.requestUri, origin, handlerPath)
  if (!uri || !uniqueParams(uri.searchParams, new Set(['providerId', 'id_token'])) || uri.searchParams.size !== 2 || uri.searchParams.get('providerId') !== 'google.com') return false
  return fakeGoogleClaimsAllowed(uri.searchParams.get('id_token'))
}
