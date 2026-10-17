import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* The portfolio helper, part 2 (16 Oct, mockup fundamentals.html; his
   go 17 Oct): the verdict above the tabs, with the fundamentals Yahoo
   gives — they can hold an ADD back, never make one — and a NEWS tab of
   headlines fetched on open, never stored. A mock Broadcom whose closes
   end on $343.86 and a canned reading (avg target $412.50, revenue
   +22%, rating buy 1.6); canned headlines. Mock data only. */

type Shape = 'add' | 'hold' | 'wait'
type Reading = {
  ageDays: number
  targetMean?: number
  revenueGrowth?: number
  ratingMean?: number
  ratingKey?: string
}

async function open(
  page: Page,
  args: {
    shape: Shape
    reading?: Reading
    symbol?: string
    fund?: boolean
    sold?: boolean
  },
) {
  await start(page)
  await testClient().mutation(anyApi.e2eFundamentals.share, {
    reading: { ageDays: 0.2 },
    ...args,
  })
  await page.goto('/finances?room=portfolio')
  await page.evaluate(() => localStorage.removeItem('position-tab'))
  const name = args.fund ? 'Vanguard S&P 500' : 'Broadcom'
  if (args.sold) {
    await page.getByRole('button', { name: /^sold · / }).click()
    await page
      .getByTestId('sold-row')
      .filter({ hasText: name })
      .getByRole('link')
      .click()
  } else
    await page
      .getByTestId('owned-row')
      .filter({ hasText: name })
      .getByRole('link')
      .click()
  const position = page.getByTestId('position-page')
  const verdict = position.getByTestId('verdict')
  const why = (id: string) =>
    verdict.locator(`[data-testid=verdict-why][data-id="${id}"]`)
  const feed = (id: string) =>
    verdict.locator(`[data-testid=feed][data-id="${id}"]`)
  const tab = (name: RegExp) =>
    position.getByTestId('position-tabs').getByRole('tab', { name })
  return { position, verdict, why, feed, tab }
}

test('S1 Fundamentals agree: ADD with six reasons, four rule rows', async ({
  page,
}) => {
  const { position, verdict, why, feed, tab } = await open(page, {
    shape: 'add',
  })
  await expect(verdict).toHaveAttribute('data-call', 'add')
  /* Above the tabs, so it stays on every tab. */
  const above = await verdict.evaluate((v) => {
    const tabs = document.querySelector('[data-testid=position-tabs]')
    return tabs !== null && !!(v.compareDocumentPosition(tabs) & 4)
  })
  expect(above).toBe(true)
  await expect(verdict.getByTestId('verdict-why')).toHaveCount(6)
  await expect(why('target')).toContainText(/target\s*▲ \+20\.0%/i)
  await expect(why('revenue')).toContainText(/revenue\s*▲ \+22\.0%/i)
  await expect(why('rating')).toContainText(/rating\s*▲ buy 1\.6/i)
  for (const id of ['sma200', 'sma50', 'target', 'revenue', 'rating'])
    await expect(why(id)).toHaveAttribute('data-key', 'true')
  await expect(why('rsi')).toHaveAttribute('data-key', 'false')
  await expect(feed('fundamentals')).toContainText(/3 ▲\s*0 ▼\s*0 —/)
  await expect(feed('fundamentals')).toContainText(/yahoo/i)
  await expect(feed('fundamentals')).toHaveAttribute('data-tone', 'good')
  await expect(feed('news')).toContainText(/not in the rule/i)
  await verdict.getByRole('button', { name: /rule/i }).click()
  await expect(verdict.getByTestId('rule-row')).toHaveCount(4)
  await expect(
    verdict.locator('[data-testid=rule-row][data-on=true]'),
  ).toContainText(/add/i)

  /* FUNDAMENTALS, opened from its feed: five rows, avg not mean. */
  await feed('fundamentals').click()
  await expect(tab(/fundamentals/i)).toHaveAttribute('aria-selected', 'true')
  await expect(tab(/fundamentals/i)).toContainText(/3 ▲\s*0 ▼\s*2 —/)
  const row = (id: string) =>
    position.locator(`[data-testid=fund-row][data-id="${id}"]`)
  await expect(position.getByTestId('fund-row')).toHaveCount(5)
  await expect(position.getByTestId('fund-source')).toContainText(
    /yahoo finance .* stored · once a day/i,
  )
  await expect(row('target')).toContainText(/analyst target/i)
  await expect(row('target')).toContainText(/avg of 41/i)
  await expect(row('target')).toContainText(/upside/i)
  await expect(row('target')).toContainText('$412.50')
  await expect(row('target')).not.toContainText(/mean/i)
  await expect(row('rating')).toContainText(/41 analysts/i)
  await expect(row('rating')).toContainText(/14\s*strong buy/i)
  await expect(row('revenue')).toContainText(/growing/i)
  await expect(row('revenue')).toContainText('+22.0%')
  await expect(row('pe')).toContainText(/not in the rule/i)
  await expect(row('pe')).toContainText('33.8')
  await expect(row('pe')).toContainText('88.4')
  await expect(row('dividend')).toContainText('0.69%')

  /* The P/E card: the company beside its sector and the market. */
  await row('pe').getByRole('button', { name: /what is p\/e/i }).click()
  const card = row('pe').getByTestId('info-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText(
    '33.8 = $33.80 for every $1 of profit in the next 12 months',
  )
  await expect(card).toContainText(/semiconductor avg\s*37\.3/i)
  await expect(card).toContainText(/us market avg\s*27\.7/i)
  await expect(card).toContainText(/damodaran · nyu stern · 2026/i)
  await page.waitForTimeout(900)
  await page.screenshot({ ...shot('fundamentals-add'), fullPage: true })
})

for (const [name, reading, id, words] of [
  [
    'S2 price at or above the avg target',
    { ageDays: 0.2, targetMean: 331 },
    'target',
    "analysts' avg target of $331.00",
  ],
  [
    'S3 revenue down',
    { ageDays: 0.2, revenueGrowth: -0.04 },
    'revenue',
    'revenue fell 4.0% on a year before',
  ],
  [
    'S4 rating 3.6',
    { ageDays: 0.2, ratingMean: 3.6, ratingKey: 'underperform' },
    'rating',
    'most analysts rate it sell',
  ],
] as const)
  test(`${name}: the ADD is held back to HOLD`, async ({ page }) => {
    const { verdict, why, feed } = await open(page, { shape: 'add', reading })
    await expect(verdict).toHaveAttribute('data-call', 'hold')
    await expect(verdict).toContainText(words)
    await expect(why(id)).toHaveAttribute('data-key', 'true')
    await expect(why('sma50')).toHaveAttribute('data-key', 'false')
    /* The group that held the ADD back is never green. */
    await expect(feed('fundamentals')).not.toHaveAttribute('data-tone', 'good')
    await verdict.getByRole('button', { name: /rule/i }).click()
    await expect(
      verdict.locator('[data-testid=rule-row][data-on=true]'),
    ).toHaveAttribute('data-kind', 'fundamentals')
    if (id === 'target')
      await page.screenshot({ ...shot('fundamentals-held'), fullPage: true })
  })

test("S5 HOLD and WAIT from the lines stay as they are", async ({ page }) => {
  const bad = { ageDays: 0.2, targetMean: 300, revenueGrowth: -0.3 }
  let v = await open(page, { shape: 'hold', reading: bad })
  await expect(v.verdict).toHaveAttribute('data-call', 'hold')
  await expect(v.verdict).toContainText('the trend is up, with no dip')
  await expect(v.why('target')).toHaveAttribute('data-key', 'false')
  v = await open(page, { shape: 'wait', reading: bad })
  await expect(v.verdict).toHaveAttribute('data-call', 'wait')
  await expect(v.why('revenue')).toHaveAttribute('data-key', 'false')
})

test('S6 a fund: the lines alone, NONE FOR A FUND', async ({ page }) => {
  const { position, verdict, feed, tab } = await open(page, {
    shape: 'add',
    fund: true,
  })
  await expect(verdict).toHaveAttribute('data-call', 'add')
  await expect(verdict.getByTestId('verdict-why')).toHaveCount(3)
  await expect(feed('fundamentals')).toContainText(/none for a fund/i)
  await tab(/fundamentals/i).click()
  await expect(position.getByTestId('fund-row')).toHaveCount(0)
  await expect(position.getByTestId('fund-none')).toContainText(
    /no fundamentals · fund/i,
  )
  /* A fund's news: three canned headlines. */
  await tab(/news/i).click()
  await expect(position.getByTestId('headline')).toHaveCount(3)
})

test('S7 a reading 8 days old: lines only, its day in warn', async ({
  page,
}) => {
  const { verdict, why, feed } = await open(page, {
    shape: 'add',
    reading: { ageDays: 8, targetMean: 300 },
  })
  await expect(verdict).toHaveAttribute('data-call', 'add')
  await expect(verdict).toHaveAttribute('data-feed', 'old')
  await expect(why('target')).toHaveAttribute('data-key', 'false')
  await expect(feed('fundamentals')).toHaveAttribute('data-tone', 'warn')
  const day = new Date(Date.now() - 8 * 86_400_000).toLocaleDateString(
    undefined,
    { day: 'numeric', month: 'short' },
  )
  await expect(feed('fundamentals')).toContainText(day)
})

test('S8 NEWS: loading, eight headlines out to a new tab', async ({
  page,
}) => {
  const { position, feed, tab } = await open(page, { shape: 'add' })
  await feed('news').click()
  await expect(tab(/news/i)).toHaveAttribute('aria-selected', 'true')
  /* Slow: shimmer rows first, then the headlines. */
  const rows = position.getByTestId('headline')
  await expect(rows).toHaveCount(8, { timeout: 10_000 })
  await expect(tab(/news/i)).toContainText('8')
  await expect(position.getByTestId('news-source')).toContainText(
    /yahoo finance · 8 headlines .* not stored/i,
  )
  await expect(rows.first()).toContainText('Reuters')
  await expect(rows.first()).toHaveAttribute('target', '_blank')
  await expect(rows.first()).toHaveAttribute(
    'href',
    /^https:\/\/finance\.yahoo\.com\//,
  )
  await page.screenshot({ ...shot('fundamentals-news'), fullPage: true })
})

test('S8 NEWS loading shows shimmer rows', async ({ page }) => {
  const { position, tab } = await open(page, { shape: 'add' })
  await tab(/news/i).click()
  await expect(position.getByTestId('news-loading')).toBeVisible()
  await expect(position.getByTestId('headline')).toHaveCount(8, {
    timeout: 10_000,
  })
  await expect(position.getByTestId('news-loading')).toHaveCount(0)
})

test('S8 NEWS none, and not loaded with TRY AGAIN', async ({ page }) => {
  let v = await open(page, { shape: 'add', symbol: 'QUIET' })
  await v.tab(/news/i).click()
  await expect(v.position.getByTestId('news-none')).toContainText(
    /no headlines · 30 days/i,
  )
  v = await open(page, { shape: 'add', symbol: 'DOWN' })
  await v.tab(/news/i).click()
  const failed = v.position.getByTestId('news-failed')
  await expect(failed).toContainText(/news not loaded · yahoo finance/i, {
    timeout: 10_000,
  })
  await expect(v.feed('news')).toContainText(/not loaded/i)
  await failed.getByRole('button', { name: /try again/i }).click()
  await expect(v.position.getByTestId('news-loading')).toBeVisible()
  await expect(failed).toBeVisible({ timeout: 10_000 })
})

test("S9 a slow refresh: yesterday's reading at once, UPDATING, then today", async ({
  page,
}) => {
  const { position, feed, tab } = await open(page, {
    shape: 'add',
    reading: { ageDays: 1.5 },
  })
  const fmt = (t: number) =>
    new Date(t).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    })
  const was = fmt(Date.now() - 1.5 * 86_400_000)
  const today = fmt(Date.now())
  await tab(/fundamentals/i).click()
  const source = position.getByTestId('fund-source')
  await expect(position.getByTestId('fund-row')).toHaveCount(5)
  await expect(source).toContainText(was)
  await expect(source).toContainText(/updating/i)
  await expect(feed('fundamentals')).toHaveAttribute('data-updating', 'true')
  await expect(source).toContainText(today, { timeout: 10_000 })
  await expect(source).toContainText(/stored · once a day/i)
  await expect(feed('fundamentals')).toHaveAttribute('data-updating', 'false')
})

test('S10 sold out: no verdict, no FUNDAMENTALS or NEWS; phone and light', async ({
  page,
}) => {
  const v = await open(page, { shape: 'add', sold: true })
  await expect(v.position.getByTestId('position-tabs')).toBeVisible()
  await expect(v.verdict).toHaveCount(0)
  await expect(v.tab(/fundamentals/i)).toHaveCount(0)
  await expect(v.tab(/news/i)).toHaveCount(0)

  /* Held, on a phone, in the light theme. */
  const h = await open(page, { shape: 'add' })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.evaluate(() => localStorage.setItem('sl-theme', 'light'))
  await page.reload()
  await expect(h.verdict).toHaveAttribute('data-call', 'add')
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(wide).toBe(false)
  await page.waitForTimeout(900)
  await h.verdict.scrollIntoViewIfNeeded()
  await page.screenshot({ ...shot('fundamentals-phone-light'), fullPage: true })
  await h.tab(/fundamentals/i).click()
  await page.screenshot({
    ...shot('fundamentals-phone-light-tab'),
    fullPage: true,
  })
  await page.evaluate(() => localStorage.removeItem('sl-theme'))
})
