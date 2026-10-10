import { clerk } from '@clerk/testing/playwright'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

const DAY = 86_400_000

/** Local midnights of the four days before today, oldest first. */
export function lastDays(n = 4): Array<number> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Array.from({ length: n }, (_, i) => today.getTime() - (n - i) * DAY)
}

let signedIn: ConvexHttpClient | null = null

/** The test user's backend, after start(): to drop a canned reading in. */
export function testClient(): ConvexHttpClient {
  if (!signedIn) throw new Error('start(page) first')
  return signedIn
}

/** Sign the test user in, then reset its data to the bad day. */
export async function start(page: Page): Promise<Array<number>> {
  await page.goto('/login')
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_EMAIL as string,
  })
  const token = await page.evaluate(async () => {
    const w = window as unknown as {
      Clerk: { session: { getToken: (o: object) => Promise<string> } }
    }
    return w.Clerk.session.getToken({ template: 'convex' })
  })
  const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL as string)
  client.setAuth(token)
  signedIn = client
  const days = lastDays()
  await client.mutation(anyApi.e2e.reset, { days })
  return days
}

const iso = (day: number, time: string) => {
  const d = new Date(day)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${time}`
}

/** Revolut's EUR export over those four days: three rows the test user
    already has, two new on the last day — and `more` after those, for a
    longer statement that covers the same days again. */
export function revolutCsv(days: Array<number>, more = 0): Buffer {
  const [d1, d2, d3, d4] = days
  const rows = [
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
    `CARD_PAYMENT,Current,${iso(d1, '13:20:11')},${iso(d1, '13:20:12')},Guacamole,-13.05,0.00,EUR,COMPLETED,1186.95`,
    `CARD_PAYMENT,Current,${iso(d2, '09:15:00')},${iso(d2, '09:15:01')},Bolt,-6.70,0.00,EUR,COMPLETED,1180.25`,
    `CARD_PAYMENT,Current,${iso(d3, '19:02:40')},${iso(d3, '19:02:41')},Continente,-41.27,0.00,EUR,COMPLETED,1138.98`,
    `CARD_PAYMENT,Current,${iso(d4, '09:05:00')},${iso(d4, '09:05:01')},Bolt,-8.80,0.00,EUR,COMPLETED,1130.18`,
    `CARD_PAYMENT,Current,${iso(d4, '18:42:10')},${iso(d4, '18:42:11')},Pingo Doce,-22.14,0.00,EUR,COMPLETED,1108.04`,
  ]
  /* A longer statement of the same days: `more` rows after the last. */
  for (let i = 0; i < more; i++) {
    const at = iso(d4, `2${i}:10:00`)
    rows.push(
      `CARD_PAYMENT,Current,${at},${at},Late shop ${i + 1},-${5 + i}.00,0.00,EUR,COMPLETED,${(1108.04 - (i + 1) * 5 - (i * (i + 1)) / 2).toFixed(2)}`,
    )
  }
  return Buffer.from(rows.join('\n') + '\n')
}

/** Revolut's EUR export with `n` new rows on the last day — a big file. */
export function bigRevolutCsv(days: Array<number>, n: number): Buffer {
  const day = days[3]
  const p = (x: number) => String(x).padStart(2, '0')
  let balance = 1138.98
  const rows = [
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
  ]
  for (let i = 0; i < n; i++) {
    const amount = 1 + i / 100
    balance -= amount
    const at = iso(day, `${p(8 + Math.floor(i / 60))}:${p(i % 60)}:00`)
    rows.push(
      `CARD_PAYMENT,Current,${at},${at},Shop ${i + 1},-${amount.toFixed(2)},0.00,EUR,COMPLETED,${balance.toFixed(2)}`,
    )
  }
  return Buffer.from(rows.join('\n') + '\n')
}

/** An ActivoBank export over the same days: two rows, both new. */
export function activoCsv(days: Array<number>): Buffer {
  const [, , d3, d4] = days
  const day = (d: number) => iso(d, '').trim()
  const rows = [
    'Date,Description,Amount,Balance',
    `${day(d3)},Condominio,-60.00,770.50`,
    `${day(d4)},EDP,-42.10,728.40`,
  ]
  return Buffer.from(rows.join('\n') + '\n')
}

/** Revolut's commodity account export (9 Oct): the same columns as its
    euro account, ounces of silver and gold in the amount. Silver bought
    and sold out; 0.408365 oz of gold left. */
export function revolutMetalsCsv(days: Array<number>): Buffer {
  const [d1, d2, d3, d4] = days
  const row = (d: number, what: string, n: string, cur: string, bal: string) =>
    `EXCHANGE,Current,${iso(d, '10:00:00')},${iso(d, '10:00:01')},${what},${n},0.00,${cur},COMPLETED,${bal}`
  const rows = [
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
    row(d1, 'Exchanged to XAG', '12.9', 'XAG', '12.9'),
    row(d2, 'Exchanged to XAU', '0.14', 'XAU', '0.14'),
    row(d3, 'Exchanged to EUR', '-12.9', 'XAG', '0'),
    row(d4, 'Exchanged to XAU', '0.268365', 'XAU', '0.408365'),
  ]
  return Buffer.from(rows.join('\n'))
}
