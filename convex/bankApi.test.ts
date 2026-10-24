import { afterEach, expect, test, vi } from 'vitest'

import { real, signToken } from './bankApi'

const NOON = new Date(2026, 9, 11, 12).getTime()

async function newPair() {
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
  return { pair, pem }
}

test('the token is signed with the application’s key', async () => {
  const { pair, pem } = await newPair()
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

afterEach(() => vi.unstubAllGlobals())

/* BPI through SIBS (24 Oct): its session lists the account with no
   currency, so the account's details are asked; with none there either, its
   balances say it. */
test('an account listed with no currency is read from its details, then its balances', async () => {
  const { pem } = await newPair()
  const answers: Record<string, unknown> = {
    '/sessions': {
      session_id: 's1',
      access: { valid_until: '2027-04-20T00:00:00Z' },
      aspsp: { name: 'Banco BPI', country: 'PT' },
      accounts: [
        { uid: 'a', account_id: { iban: 'PT50000000001234' } },
        { uid: 'b', currency: '' },
        { uid: 'c' },
      ],
    },
    '/accounts/a/details': { uid: 'a', currency: 'EUR' },
    '/accounts/b/details': {},
    '/accounts/b/balances': {
      balances: [
        {
          balance_type: 'CLBD',
          balance_amount: { amount: '10.00', currency: 'USD' },
        },
      ],
    },
    '/accounts/c/details': {},
    '/accounts/c/balances': { balances: [] },
  }
  vi.stubGlobal('fetch', async (url: string) => {
    const path = url.replace('https://api.enablebanking.com', '')
    const body = answers[path]
    return new Response(JSON.stringify(body ?? {}), {
      status: body === undefined ? 500 : 200,
    })
  })
  const session = await real('app', pem, 'https://x/cb').session('code')
  expect(session.accounts).toEqual([
    { uid: 'a', currency: 'EUR', iban: 'PT50000000001234' },
    { uid: 'b', currency: 'USD' },
    { uid: 'c', currency: '' },
  ])
})

/* BPI's answer on 24 Oct: no account readable in the approval, so the
   session is asked for its account ids and each one for its details. */
test('accounts the approval did not list are read from the session', async () => {
  const { pem } = await newPair()
  const answers: Record<string, unknown> = {
    '/sessions': {
      session_id: 's1',
      access: { valid_until: '2027-04-20T00:00:00Z' },
      aspsp: { name: 'BPI', country: 'PT' },
      accounts: [{ currency: 'EUR', cash_account_type: 'CACC' }],
    },
    '/sessions/s1': {
      status: 'AUTHORIZED',
      accounts: ['x'],
      accounts_data: [{ uid: 'x', identification_hash: 'h' }],
    },
    '/accounts/x/details': {
      uid: 'x',
      currency: 'EUR',
      account_id: { iban: 'PT50000000005678' },
      name: 'Conta',
    },
  }
  vi.stubGlobal('fetch', async (url: string) => {
    const path = url.replace('https://api.enablebanking.com', '')
    const body = answers[path]
    return new Response(JSON.stringify(body ?? {}), {
      status: body === undefined ? 500 : 200,
    })
  })
  const session = await real('app', pem, 'https://x/cb').session('code')
  expect(session.accounts).toEqual([
    { uid: 'x', currency: 'EUR', iban: 'PT50000000005678', name: 'Conta' },
  ])
})

/* Nothing names the currency and the session fills its ids only on the
   second ask: the account is kept with '' for pickAccounts to name. */
test('the session asked again when its ids come late; no currency kept as blank', async () => {
  const { pem } = await newPair()
  let asked = 0
  vi.stubGlobal('fetch', async (url: string) => {
    const path = url.replace('https://api.enablebanking.com', '')
    const body: unknown =
      path === '/sessions'
        ? {
            session_id: 's1',
            access: { valid_until: '2027-04-20T00:00:00Z' },
            aspsp: { name: 'BPI', country: 'PT' },
            accounts: [],
          }
        : path === '/sessions/s1'
          ? { status: 'AUTHORIZED', accounts: ++asked > 1 ? ['x'] : [] }
          : path === '/accounts/x/balances'
            ? { balances: [] }
            : {}
    return new Response(JSON.stringify(body), { status: 200 })
  })
  const read = await real('app', pem, 'https://x/cb').session('code')
  expect(read.accounts).toEqual([{ uid: 'x', currency: '' }])
  expect(asked).toBe(2)
}, 10_000)
