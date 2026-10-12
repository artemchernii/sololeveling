import { ConvexError } from 'convex/values'

import { readPositions, readSummary } from '../src/lib/t212'
import type { T212Cash, T212Position } from '../src/lib/t212'

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
}

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
const CANNED: Partial<
  Record<string, { cash: T212Cash; positions: Array<T212Position> } | T212Fail>
> = {
  '': {
    cash: cash(1200.3, 50, 30),
    positions: [
      { ...NVDA, shares: 8, valueEur: 1200, paidEur: 900 },
      { ...ASML, shares: 1, valueEur: 640, paidEur: 600 },
    ],
  },
  /* Two more Nvidia bought, ASML sold. */
  traded: {
    cash: cash(1620.3),
    positions: [{ ...NVDA, shares: 10, valueEur: 1500, paidEur: 1200 }],
  },
  /* Twenty companies the account never held. */
  many: {
    cash: cash(1280.3),
    positions: [
      { ...NVDA, shares: 8, valueEur: 1200, paidEur: 900 },
      { ...ASML, shares: 1, valueEur: 640, paidEur: 600 },
      ...Array.from({ length: 20 }, (_, i) => ({
        ticker: `CO${i + 1}_US_EQ`,
        name: `Company ${i + 1}`,
        isin: `US00000000${String(i + 1).padStart(2, '0')}`,
        shares: i + 1,
        valueEur: 10 * (i + 1),
      })),
    ],
  },
  /* A share no market prices: only Trading 212 says what it is worth. */
  frozen: {
    cash: cash(1280.3),
    positions: [
      { ...NVDA, shares: 8, valueEur: 1200, paidEur: 900 },
      { ...ASML, shares: 1, valueEur: 640, paidEur: 600 },
      { ticker: 'FRZN_US_EQ', name: 'Frozen Co', shares: 4, valueEur: 80 },
    ],
  },
  cash: { cash: cash(3040.3), positions: [] },
  refused: new T212Fail('refused'),
  down: new T212Fail('down'),
}

function canned(word: string): T212Api {
  const answer = CANNED[word]
  const give = <T>(
    pick: (a: Exclude<typeof answer, T212Fail | undefined>) => T,
  ) =>
    answer === undefined || answer instanceof T212Fail
      ? Promise.reject(answer ?? new T212Fail('down'))
      : Promise.resolve(pick(answer))
  return {
    summary: () => give((a) => a.cash),
    positions: () => give((a) => a.positions),
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
