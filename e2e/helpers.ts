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
    already has, two new on the last day. */
export function revolutCsv(days: Array<number>): Buffer {
  const [d1, d2, d3, d4] = days
  const rows = [
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
    `CARD_PAYMENT,Current,${iso(d1, '13:20:11')},${iso(d1, '13:20:12')},Guacamole,-13.05,0.00,EUR,COMPLETED,1186.95`,
    `CARD_PAYMENT,Current,${iso(d2, '09:15:00')},${iso(d2, '09:15:01')},Bolt,-6.70,0.00,EUR,COMPLETED,1180.25`,
    `CARD_PAYMENT,Current,${iso(d3, '19:02:40')},${iso(d3, '19:02:41')},Continente,-41.27,0.00,EUR,COMPLETED,1138.98`,
    `CARD_PAYMENT,Current,${iso(d4, '09:05:00')},${iso(d4, '09:05:01')},Bolt,-8.80,0.00,EUR,COMPLETED,1130.18`,
    `CARD_PAYMENT,Current,${iso(d4, '18:42:10')},${iso(d4, '18:42:11')},Pingo Doce,-22.14,0.00,EUR,COMPLETED,1108.04`,
  ]
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
