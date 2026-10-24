import { ConvexError } from 'convex/values'

import type { Aspsp, BankAccount, BankBalance } from '../src/lib/bankLink'
import type { BankTx } from '../src/lib/bankRows'

/* Enable Banking, Account Information only (11 Oct): the five calls a
   connection needs. Read-only by registration — the application has no
   payment service. The private key is a Convex environment variable he sets
   himself; it is never logged, returned or stored in a row.

   On the test backend (E2E=1) no call leaves: the answers are canned, so a
   test walks the whole connection without a bank. */

const BASE = 'https://api.enablebanking.com'

/* Enable Banking turned the call away: the key or the application changed
   (a new application after the 12 Oct leak), or the bank's approval was
   taken back. Asking again changes nothing until he approves again. */
export const BANK_REFUSED = 'The bank rejected the key.'
const REFUSED_STATUS = [401, 403, 404]

export const isRefused = (e: unknown) =>
  e instanceof ConvexError && e.data === BANK_REFUSED

export type BankSession = {
  sessionId: string
  bank: string
  country: string
  accounts: Array<BankAccount>
  /** When the bank's approval ends, ms. */
  validUntil: number
}

export type BankApi = {
  aspsps: () => Promise<Array<Aspsp>>
  /** The bank's own page to send him to. */
  auth: (o: {
    bank: Aspsp
    state: string
    validUntil: number
  }) => Promise<string>
  session: (code: string) => Promise<BankSession>
  balances: (uid: string) => Promise<Array<BankBalance>>
  /** Every row from `from` ("2026-10-10") on, all pages — or it throws:
      half an answer is no answer. */
  transactions: (uid: string, from: string) => Promise<Array<BankTx>>
}

/* Pages of rows asked for in one check: a month of his is one or two. */
const MAX_PAGES = 20

const b64url = (bytes: Uint8Array | string) => {
  const raw =
    typeof bytes === 'string'
      ? bytes
      : Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The signed token every call carries: RS256, the application as `kid`. */
export async function signToken(
  appId: string,
  pem: string,
  now: number,
): Promise<string> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')),
    (c) => c.charCodeAt(0),
  )
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const iat = Math.floor(now / 1000)
  const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }))
  const body = b64url(
    JSON.stringify({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat,
      exp: iat + 600,
    }),
  )
  const signed = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${head}.${body}`),
  )
  return `${head}.${body}.${b64url(new Uint8Array(signed))}`
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined
const list = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v)
    ? v.filter(
        (x): x is Record<string, unknown> =>
          typeof x === 'object' && x !== null,
      )
    : []

export function real(appId: string, pem: string, redirect: string): BankApi {
  const call = async (
    path: string,
    body?: object,
  ): Promise<Record<string, unknown>> => {
    const res = await fetch(BASE + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${await signToken(appId, pem, Date.now())}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json: unknown = await res.json().catch(() => null)
    const data =
      typeof json === 'object' && json !== null
        ? (json as Record<string, unknown>)
        : {}
    if (REFUSED_STATUS.includes(res.status)) throw new ConvexError(BANK_REFUSED)
    if (!res.ok) {
      /* The bank's own reason, when it gave one; never the request. */
      throw new ConvexError(
        text(data.message) ?? `The bank did not answer (${res.status}).`,
      )
    }
    return data
  }
  const balances = async (uid: string): Promise<Array<BankBalance>> =>
    list(
      (await call(`/accounts/${encodeURIComponent(uid)}/balances`)).balances,
    ).flatMap((b) => {
      const type = text(b.balance_type)
      const amount = b.balance_amount
      if (type === undefined || typeof amount !== 'object' || amount === null)
        return []
      const value = text((amount as Record<string, unknown>).amount)
      const currency = text((amount as Record<string, unknown>).currency)
      if (value === undefined || currency === undefined) return []
      return [
        { balance_type: type, balance_amount: { amount: value, currency } },
      ]
    })

  /* BPI (through SIBS, 24 Oct) answered the approval with no account the
     app could read: an account's uid "can be not set" there, and its
     currency may be missing. The session itself is asked for its account
     ids, each account for its details, and its balances for a currency. */
  const details = (uid: string) =>
    call(`/accounts/${encodeURIComponent(uid)}/details`).catch(() => null)

  const readAccount = async (
    a: Record<string, unknown>,
    uid: string,
  ): Promise<Array<BankAccount>> => {
    const more = text(a.currency) ? null : await details(uid)
    const from = { ...(more ?? {}), ...a }
    const listed = text(from.currency) || text(more?.currency) || undefined
    const currency =
      listed ??
      (await balances(uid).catch(() => [])).at(0)?.balance_amount.currency
    if (currency === undefined) return []
    const id = from.account_id
    const iban =
      typeof id === 'object' && id !== null
        ? text((id as Record<string, unknown>).iban)
        : undefined
    const name = text(from.name) ?? text(from.product)
    return [
      {
        uid,
        currency,
        ...(iban !== undefined ? { iban } : {}),
        ...(name !== undefined ? { name } : {}),
      },
    ]
  }

  const sessionAccounts = async (
    sessionId: string,
    listed: Array<Record<string, unknown>>,
  ): Promise<Array<BankAccount>> => {
    const read = (
      await Promise.all(
        listed.map((a) => {
          const uid = text(a.uid)
          return uid === undefined ? [] : readAccount(a, uid)
        }),
      )
    ).flat()
    if (read.length > 0) return read
    const kept = await call(`/sessions/${encodeURIComponent(sessionId)}`)
    const uids = [
      ...(Array.isArray(kept.accounts) ? kept.accounts : []).flatMap((u) => {
        const uid = text(u)
        return uid === undefined ? [] : [uid]
      }),
      ...list(kept.accounts_data).flatMap((d) => {
        const uid = text(d.uid)
        return uid === undefined ? [] : [uid]
      }),
    ]
    const found = (
      await Promise.all([...new Set(uids)].map((uid) => readAccount({}, uid)))
    ).flat()
    /* Its shape, never its numbers: the logs say why next time. */
    console.log('bank.session accounts', {
      listed: listed.length,
      listedWithUid: listed.filter((a) => text(a.uid) !== undefined).length,
      status: text(kept.status),
      sessionUids: uids.length,
      read: found.length,
    })
    return found
  }

  return {
    aspsps: async () =>
      list((await call('/aspsps')).aspsps).flatMap((a) => {
        const name = text(a.name)
        const country = text(a.country)
        if (name === undefined || country === undefined) return []
        const max = a.maximum_consent_validity
        return [
          {
            name,
            country,
            ...(typeof max === 'number'
              ? { maximum_consent_validity: max }
              : {}),
          },
        ]
      }),
    auth: async ({ bank, state, validUntil }) => {
      const url = text(
        (
          await call('/auth', {
            access: { valid_until: new Date(validUntil).toISOString() },
            aspsp: { name: bank.name, country: bank.country },
            state,
            redirect_url: redirect,
            psu_type: 'personal',
          })
        ).url,
      )
      if (url === undefined)
        throw new ConvexError('The bank gave no page to open.')
      return url
    },
    session: async (code) => {
      const data = await call('/sessions', { code })
      const sessionId = text(data.session_id)
      const access = data.access
      const until =
        typeof access === 'object' && access !== null
          ? Date.parse(
              text((access as Record<string, unknown>).valid_until) ?? '',
            )
          : NaN
      const aspsp =
        typeof data.aspsp === 'object' && data.aspsp !== null
          ? (data.aspsp as Record<string, unknown>)
          : {}
      if (sessionId === undefined || !Number.isFinite(until))
        throw new ConvexError('The bank did not open a session.')
      return {
        sessionId,
        bank: text(aspsp.name) ?? '',
        country: text(aspsp.country) ?? '',
        validUntil: until,
        accounts: await sessionAccounts(sessionId, list(data.accounts)),
      }
    },
    balances,
    transactions: async (uid, from) => {
      const rows: Array<BankTx> = []
      let key: string | undefined
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await call(
          `/accounts/${encodeURIComponent(uid)}/transactions?date_from=${from}` +
            (key === undefined
              ? ''
              : `&continuation_key=${encodeURIComponent(key)}`),
        )
        for (const t of list(data.transactions)) {
          const money =
            typeof t.transaction_amount === 'object' &&
            t.transaction_amount !== null
              ? (t.transaction_amount as Record<string, unknown>)
              : {}
          const amount = text(money.amount)
          const currency = text(money.currency)
          const named = (v: unknown) =>
            typeof v === 'object' && v !== null
              ? text((v as Record<string, unknown>).name)
              : undefined
          if (amount === undefined || currency === undefined) continue
          rows.push({
            status: text(t.status) ?? '',
            amount,
            currency,
            indicator: text(t.credit_debit_indicator) ?? '',
            bookingDate: text(t.booking_date),
            valueDate: text(t.value_date),
            transactionDate: text(t.transaction_date),
            creditor: named(t.creditor),
            debtor: named(t.debtor),
            remittance: Array.isArray(t.remittance_information)
              ? t.remittance_information.filter(
                  (w): w is string => typeof w === 'string',
                )
              : [],
          })
        }
        key = text(data.continuation_key)
        if (key === undefined) return rows
      }
      throw new ConvexError('The bank sent more rows than can be read at once.')
    },
  }
}

/* The test backend's bank: one euro account, €727.49 booked. A code of
   "two" answers with two accounts the app cannot tell apart. */
export const CANNED: BankApi = {
  aspsps: () =>
    Promise.resolve([
      {
        name: 'ActivoBank',
        country: 'PT',
        maximum_consent_validity: 15_552_000,
      },
      {
        name: 'Banco BPI',
        country: 'PT',
        maximum_consent_validity: 15_552_000,
      },
      /* Trade Republic allows 90 days (its TPP guide, 19 Oct). */
      {
        name: 'Trade Republic',
        country: 'PT',
        maximum_consent_validity: 7_776_000,
      },
    ]),
  auth: ({ state }) =>
    Promise.resolve(`/bank/callback?code=one&state=${state}`),
  session: (code) =>
    Promise.resolve({
      sessionId: 'e2e-session',
      bank: 'ActivoBank',
      country: 'PT',
      validUntil: Date.now() + 180 * 86_400_000,
      accounts:
        code === 'two'
          ? [
              {
                uid: 'e2e-a',
                currency: 'EUR',
                iban: 'PT50000000004471',
                name: 'Conta à Ordem',
              },
              {
                uid: 'e2e-b',
                currency: 'EUR',
                iban: 'PT50000000009920',
                name: 'Conta Poupança',
              },
            ]
          : [{ uid: 'e2e-a', currency: 'EUR', iban: 'PT50000000004471' }],
    }),
  balances: (uid) =>
    uid.endsWith(':refused')
      ? Promise.reject(new ConvexError(BANK_REFUSED))
      : Promise.resolve([
          {
            balance_type: 'ITAV',
            balance_amount: { amount: '702.49', currency: 'EUR' },
          },
          {
            balance_type: 'CLBD',
            balance_amount: {
              amount: LATER[uid.split(':')[1]]?.balance ?? '727.49',
              currency: 'EUR',
            },
          },
        ]),
  transactions: (uid) => {
    const today = new Date().toISOString().slice(0, 10)
    return Promise.resolve(
      (LATER[uid.split(':')[1]]?.rows ?? []).map(([amount, words, status]) => ({
        status: status ?? 'BOOK',
        amount,
        currency: 'EUR',
        indicator: 'DBIT',
        bookingDate: today,
        remittance: [words],
      })),
    )
  },
}

/* What the canned bank answers after the day it was connected, by the word
   e2eBank.answer puts after the account's id ("e2e-a:two"). Each starts
   from the €727.49 of the connect. */
const LATER: Partial<
  Record<string, { balance: string; rows: Array<[string, string, string?]> }>
> = {
  /* Two payments booked, one still pending: they reach the balance. */
  two: {
    balance: '685.09',
    rows: [
      ['25.00', 'TRF P/ ANDREI PAVLOV'],
      ['17.40', 'COMPRA 2789 PINGO DOCE LISBOA'],
      ['9.99', 'COMPRA 2789 SPOTIFY', 'PDNG'],
    ],
  },
  /* The top-up the account already has under Revolut's name, booked. */
  twin: {
    balance: '702.49',
    rows: [
      ['700.00', 'COMPRA 2789 REVOLUT 8134 DUBLIN IE'],
      ['25.00', 'TRF P/ ANDREI PAVLOV'],
    ],
  },
  /* A month at once: sixty payments of one euro. */
  many: {
    balance: '667.49',
    rows: Array.from({ length: 60 }, (_, i): [string, string] => [
      '1.00',
      `COMPRA 2789 CAFE ${i + 1}`,
    ]),
  },
}

export function bankApi(): BankApi {
  if (process.env.E2E === '1') return CANNED
  const appId = process.env.ENABLE_BANKING_APP_ID
  const pem = process.env.ENABLE_BANKING_KEY
  const redirect = process.env.BANK_REDIRECT_URL
  if (!appId || !pem || !redirect)
    throw new ConvexError('The bank connection is not set up yet.')
  return real(appId, pem, redirect)
}
