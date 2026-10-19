import { expect, it } from 'vitest'
import { browserPhonePreviewConfig, phonePreviewConfig } from './phone-preview-config'

it.each([undefined, '', 'false', '1'])('keeps ordinary modes unchanged for flag %s', flag => {
  expect(phonePreviewConfig(flag, 'example-emulator', 'https://preview.example')).toBeNull()
})

it('requires deliberate project identity and supports production SSR without a browser endpoint', () => {
  expect(() => phonePreviewConfig('true', '')).toThrow('explicit emulator Firebase project ID')
  expect(phonePreviewConfig('true', 'hexaverse-emulator')).toEqual({ projectId: 'hexaverse-emulator', apiBase: '/api', authEmulatorUrl: undefined })
})

it.each(['https://preview.example', 'http://127.0.0.1:20204', 'http://localhost:20204', 'http://[::1]:20204'])('uses the current origin without an SDK-stripped prefix: %s', origin => {
  expect(phonePreviewConfig('true', 'hexaverse-emulator', origin)).toMatchObject({ apiBase: '/api', authEmulatorUrl: origin })
})

it.each(['https://preview.example/auth', 'http://public.example', 'https://user:password@preview.example', 'https://preview.example?token=private', 'https://preview.example#fragment'])('rejects a non-origin or insecure remote emulator URL: %s', origin => {
  expect(() => phonePreviewConfig('true', 'hexaverse-emulator', origin)).toThrow()
})

it('uses a gateway-injected same-origin emulator profile and rejects mismatched origin', () => {
  const element = document.createElement('script')
  element.id = 'hexaverse-phone-preview'
  document.head.append(element)
  try {
    element.textContent = JSON.stringify({ origin: window.location.origin, projectId: 'hexaverse-emulator' })
    expect(browserPhonePreviewConfig()).toMatchObject({ projectId: 'hexaverse-emulator', apiBase: '/api', authEmulatorUrl: window.location.origin })
    element.textContent = JSON.stringify({ origin: 'https://foreign.example', projectId: 'hexaverse-emulator' })
    expect(() => browserPhonePreviewConfig()).toThrow('Invalid live phone preview')
  } finally { element.remove() }
})
