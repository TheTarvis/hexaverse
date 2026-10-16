import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ssoHelperAllowed, idpSignInAllowed } from './sso-policy.mjs'

const origin = 'https://preview.example'
const base = { apiKey: 'demo-api-key', appName: '[DEFAULT]', v: '12.15.0' }
const helper = (kind, params) => `/emulator/auth/${kind}?${new URLSearchParams(params)}`
const redirect = { ...base, authType: 'signInViaRedirect', providerId: 'google.com', scopes: 'profile', redirectUrl: `${origin}/login?redirect=%2Fsystems%2Fsys_0_0` }
const popup = { ...redirect, authType: 'signInViaPopup', eventId: '1234567890' }
const iframe = { ...base, eid: 'p' }
const claims = { sub: '1234567890123456789012345678901234567890', iss: '', aud: '', exp: 0, iat: 0,
  name: 'Fixture Person', email: 'fixture@example.test', email_verified: true }
const bodyFor = (values = claims, targetOrigin = origin) => ({ requestUri: `${targetOrigin}${helper('handler', { providerId: 'google.com', id_token: JSON.stringify(values) })}`,
  sessionId: 'ValueNotUsedByAuthEmulator', returnSecureToken: true, returnIdpCredential: true })

test('current SDK popup, redirect and helper iframe requests fit exact policy', () => {
  for (const params of [redirect, popup]) assert.equal(ssoHelperAllowed(helper('handler', params), origin), true)
  assert.equal(ssoHelperAllowed(helper('iframe', iframe), origin), true)
  assert.equal(ssoHelperAllowed(helper('iframe', { ...iframe, usegapi: '1', jsh: 'm;/_/scs/apps-static/_/js/k=oz.gapi.en.fixture/m=__features__', fw: 'react' }), origin), true)
  assert.equal(ssoHelperAllowed(helper('handler', { ...redirect, redirectUrl: `${origin}/login?signUp=true&redirect=%2F` }), origin), true)
  const local = 'http://127.0.0.1:20204'
  assert.equal(ssoHelperAllowed(helper('handler', { ...redirect, redirectUrl: `${local}/login` }), local), true)
})

test('helper rejects tenants, providers, linking, duplicate keys and unrelated routes', () => {
  for (const change of [{ providerId: 'facebook.com' }, { authType: 'linkViaRedirect' }, { authType: 'reauthViaPopup' },
    { tid: 'tenant' }, { tenantId: 'tenant' }, { admin: 'true' }, { apiKey: 'real-key' }, { appName: 'other-app' },
    { v: 'future-version' }, { customParameters: '{}' }, { scopes: 'profile,email' }, { eventId: '1234567890' },
    { redirectUrl: 'https://foreign.example/login' }, { redirectUrl: `${origin}/dev/login` },
    { redirectUrl: `${origin}/other/../login` }, { redirectUrl: `${origin}/login?redirect=//foreign.example` }]) {
    assert.equal(ssoHelperAllowed(helper('handler', { ...redirect, ...change }), origin), false, JSON.stringify(change))
  }
  for (const target of [helper('handler', redirect) + '&providerId=google.com', helper('iframe', iframe) + '&apiKey=demo-api-key',
    helper('iframe', { ...iframe, tid: 'tenant' }), helper('iframe', { ...iframe, usegapi: '2' }),
    helper('iframe', { ...iframe, jsh: 'https://foreign.example/script.js' }), '/emulator/auth/%68andler', '/emulator/v1/projects/fixture/accounts']) assert.equal(ssoHelperAllowed(target, origin), false)
})

test('actual serialized SDK IdP body omits null tenant and empty postBody/pendingToken', () => {
  const sdkShape = { ...bodyFor(), postBody: undefined, tenantId: undefined, pendingToken: undefined }
  assert.equal(idpSignInAllowed(JSON.parse(JSON.stringify(sdkShape)), origin), true)
  assert.equal(idpSignInAllowed(bodyFor({ ...claims, screen_name: 'fixture', picture: 'https://example.test/photo.png' }), origin), true)
  const local = 'http://127.0.0.1:20204'
  assert.equal(idpSignInAllowed(bodyFor(claims, local), local), true)
})

test('IdP body rejects linking, tenants, foreign callback, duplicate token keys and arbitrary claims', () => {
  for (const extra of [{ idToken: 'linking-token' }, { tenantId: null }, { tenantId: 'tenant' }, { pendingToken: 'token' },
    { postBody: 'providerId=other.com' }, { admin: true }, { returnSecureToken: false }, { returnIdpCredential: false },
    { sessionId: 'other' }]) assert.equal(idpSignInAllowed({ ...bodyFor(), ...extra }, origin), false, JSON.stringify(extra))
  for (const change of [{ admin: true }, { providerId: 'other.com' }, { email_verified: false }, { email: '' }, { sub: '' }, { exp: 123 }]) assert.equal(idpSignInAllowed(bodyFor({ ...claims, ...change }), origin), false)
  assert.equal(idpSignInAllowed(bodyFor(claims, 'https://foreign.example'), origin), false)
  const original = bodyFor()
  for (const requestUri of [original.requestUri + '&id_token=duplicate', original.requestUri.replace('providerId=google.com', 'providerId=facebook.com'),
    original.requestUri.replace('/emulator/auth/handler', '/dev/login'), original.requestUri + '#admin=true']) assert.equal(idpSignInAllowed({ ...original, requestUri }, origin), false)
  for (const invalid of [null, [], '{}', { ...original, requestUri: `${origin}/emulator/auth/handler?providerId=google.com&id_token=fake.jwt.token` }]) assert.equal(idpSignInAllowed(invalid, origin), false)
})

test('both policies reject untrusted origin configuration', () => {
  for (const invalid of ['http://foreign.example', 'http://0.0.0.0:20204', 'https://user:password@preview.example', 'https://*.example', `${origin}/path`]) {
    assert.equal(ssoHelperAllowed(helper('handler', redirect), invalid), false)
    assert.equal(idpSignInAllowed(bodyFor(), invalid), false)
  }
})
