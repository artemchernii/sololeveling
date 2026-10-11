import { expect, test } from 'vitest'

import { signToken } from './bankApi'

const NOON = new Date(2026, 9, 11, 12).getTime()

test('the token is signed with the application’s key', async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const der = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', pair.privateKey),
  )
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`
  const token = await signToken('app-id', pem, NOON)
  const [head, body, sig] = token.split('.')
  const open = (s: string) =>
    JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/')))
  expect(open(head)).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-id' })
  expect(open(body)).toEqual({
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: NOON / 1000,
    exp: NOON / 1000 + 600,
  })
  const raw = Uint8Array.from(
    atob(sig.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  )
  expect(
    await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      pair.publicKey,
      raw,
      new TextEncoder().encode(`${head}.${body}`),
    ),
  ).toBe(true)
})
