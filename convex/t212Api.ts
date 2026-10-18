import { ConvexError } from 'convex/values'

import { readPositions, readSummary } from '../src/lib/t212'
import type { T212Cash, T212Position } from '../src/lib/t212'
import {
  readCashflow,
  readDividend,
  readOrder,
  readPage,
} from '../src/lib/t212History'
import type { T212Event } from '../src/lib/t212History'

/* Trading 212's own API (12 Oct, docs/specs/2026-10-12-trading-212.md):
   the two calls a look needs. Nothing here can place or cancel an order —
   only GET is ever sent, and the key is made read-only in the 212 app. The
   key and secret are Convex environment variables he sets himself; they are
   never logged, returned or stored in a row.

   On the test backend (E2E=1) no call leaves: the answers are canned. */

const BASE = 'https://live.trading212.com/api/v0'

/** Why Trading 212 gave nothing: it did not accept the key, or it did not
    answer. */
export class T212Fail extends Error {
  constructor(readonly why: 'refused' | 'down') {
    super(why)
  }
}

export type T212Api = {
  summary: () => Promise<T212Cash>
  positions: () => Promise<Array<T212Position>>
  /** Orders, dividends and cash in and out since a moment, newest first
      (18 Oct, docs/specs/2026-10-18-t212-history.md). */
  history: (since: number) => Promise<Array<T212Event>>
}

/* Pages a call reads at most: 20 calls a minute each, 50 items a page. */
const PAGES = 10

function real(key: string, secret: string): T212Api {
  const call = async (path: string): Promise<unknown> => {
    let res: Response
    try {
      res = await fetch(BASE + path, {
        headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` },
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new T212Fail('down')
    }
    if (res.status === 401 || res.status === 403) throw new T212Fail('refused')
    if (!res.ok) throw new T212Fail('down')
    return await res.json().catch(() => null)
  }
  return {
    summary: async () => {
      const cash = readSummary(await call('/equity/account/summary'))
      if (cash === null) throw new T212Fail('down')
      return cash
    },
    positions: async () => {
      const rows = readPositions(await call('/equity/positions'))
      if (rows === null) throw new T212Fail('down')
      return rows
    },
    history: async (since) => {
      const out: Array<T212Event> = []
      for (const [path, read] of [
        ['/equity/history/orders', readOrder],
        ['/equity/history/dividends', readDividend],
        ['/equity/history/transactions', readCashflow],
      ] as const) {
        let next: string | null = `${path}?limit=50`
        for (let n = 0; next !== null && n < PAGES; n++) {
          const page = readPage(await call(next))
          /* Half a history is no history: nothing is written. */
          if (page === null) throw new T212Fail('down')
          const got = page.items.map(read)
          out.push(...got.filter((e): e is T212Event => e !== null))
          /* Newest first: a page that reaches back past `since` is the last. */
          const oldest = Math.min(...got.map((e) => e?.at ?? Infinity))
          next =
            oldest < since || page.next === null
              ? null
              : page.next.replace(/^\/api\/v0/, '')
        }
      }
      return out.filter((e) => e.at >= since)
    },
  }
}

const NVDA = { ticker: 'NVDA_US_EQ', name: 'Nvidia', isin: 'US67066G1040' }
const ASML = { ticker: 'ASML_NA_EQ', name: 'ASML', isin: 'NL0010273215' }
const cash = (free: number, inPies = 0, reserved = 0): T212Cash => ({
  currency: 'EUR',
  free,
  inPies,
  reserved,
})

/* The test backend's Trading 212, by the word e2eBank.answer puts after
   the link's id ("t212:traded"). With no word: what the mock account's
   file already says — €1,280.30 in all, 8 Nvidia, 1 ASML. */
type Canned = {
  cash: T212Cash
  positions: Array<T212Position>
  history?: Array<T212Event>
}

const HOUR = 3_600_000
const ago = (h: number) => Date.now() - h * HOUR
const TRADED = (): Array<T212Event> => [
  {
    ref: 't212:fill:1',
    at: ago(1),
    kind: 'buy',
    ...NVDA,
    shares: 2,
    priceEur: 150,
  },
  {
    ref: 't212:fill:2',
    at: ago(2),
    kind: 'sell',
    ...ASML,
    shares: 1,
    priceEur: 640,
  },
]
/* A dividend, interest on the free cash and a currency fee. */
const PAID = (): Array<T212Event> => [
  {
    ref: 't212:div:1',
    at: ago(1),
    kind: 'dividend',
    ...ASML,
    shares: 1,
    amount: 1.38,
    currency: 'EUR',
  },
  {
    ref: 't212:cash:1',
    at: ago(3),
    kind: 'interest',
    amount: 2.04,
    currency: 'EUR',
  },
  {
    ref: 't212:cash:2',
    at: ago(4),
    kind: 'fee',
    amount: -0.45,
    currency: 'EUR',
  },
]
const DEPOSIT = (): Array<T212Event> => [
  {
    ref: 't212:cash:3',
    at: ago(2),
    kind: 'deposit',
    amount: 500,
    currency: 'EUR',
  },
]

const HELD = (): Array<T212Position> => [
  { ...NVDA, shares: 8, valueEur: 1200, paidEur: 900 },
  { ...ASML, shares: 1, valueEur: 640, paidEur: 600 },
]

const CANNED: Record<string, (() => Canned) | T212Fail | undefined> = {
  '': () => ({ cash: cash(1200.3, 50, 30), positions: HELD() }),
  /* Two more Nvidia bought, ASML sold: the history says so too. */
  traded: () => ({
    cash: cash(1620.3),
    positions: [{ ...NVDA, shares: 10, valueEur: 1500, paidEur: 1200 }],
    history: TRADED(),
  }),
  /* The same trades with no history: a change no row explains. */
  shares: () => ({
    cash: cash(1620.3),
    positions: [{ ...NVDA, shares: 10, valueEur: 1500, paidEur: 1200 }],
  }),
  /* Positions as they were, and money paid for holding them. */
  paid: () => ({ cash: cash(1283.27), positions: HELD(), history: PAID() }),
  /* €500 from his own account: e2eBank.answer puts Revolut's side. */
  deposit: () => ({
    cash: cash(1780.3),
    positions: HELD(),
    history: DEPOSIT(),
  }),
  /* The same €500, and no bank has a row for it. */
  early: () => ({ cash: cash(1780.3), positions: HELD(), history: DEPOSIT() }),
  /* The first answer after the file: five new, and the buy of three days
     ago that e2eBank.answer saves as the file's. */
  first: () => ({
    cash: cash(1283.27),
    positions: HELD(),
    history: [
      ...TRADED().map((e) => ({ ...e, at: e.at - 24 * HOUR })),
      ...PAID(),
      {
        ref: 't212:fill:3',
        at: ago(72),
        kind: 'buy',
        ...NVDA,
        shares: 1,
        priceEur: 140,
      },
    ],
  }),
  /* Twenty companies the account never held. */
  many: () => ({
    cash: cash(1280.3),
    positions: [
      ...HELD(),
      ...Array.from({ length: 20 }, (_, i) => ({
        ticker: `CO${i + 1}_US_EQ`,
        name: `Company ${i + 1}`,
        isin: `US00000000${String(i + 1).padStart(2, '0')}`,
        shares: i + 1,
        valueEur: 10 * (i + 1),
      })),
    ],
  }),
  /* A share no market prices: only Trading 212 says what it is worth. */
  frozen: () => ({
    cash: cash(1280.3),
    positions: [
      ...HELD(),
      { ticker: 'FRZN_US_EQ', name: 'Frozen Co', shares: 4, valueEur: 80 },
    ],
  }),
  cash: () => ({ cash: cash(3040.3), positions: [] }),
  refused: new T212Fail('refused'),
  down: new T212Fail('down'),
}

function canned(word: string): T212Api {
  const make = CANNED[word]
  const answer = make === undefined || make instanceof T212Fail ? make : make()
  const give = <T>(pick: (a: Canned) => T) =>
    answer === undefined || answer instanceof T212Fail
      ? Promise.reject(answer ?? new T212Fail('down'))
      : Promise.resolve(pick(answer))
  return {
    summary: () => give((a) => a.cash),
    positions: () => give((a) => a.positions),
    history: (since) =>
      give((a) => (a.history ?? []).filter((e) => e.at >= since)),
  }
}

/** `uid` is the link's own id of the account ("t212", or "t212:traded" on
    the test backend). */
export function t212Api(uid: string): T212Api {
  if (process.env.E2E === '1') return canned(uid.split(':')[1] ?? '')
  const key = process.env.TRADING212_KEY
  const secret = process.env.TRADING212_SECRET
  if (!key || !secret)
    throw new ConvexError('The key is not on the backend yet. Nothing changed.')
  return real(key, secret)
}
