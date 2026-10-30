import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Insights I1 (19 Oct, docs/specs/2026-10-19-insights.md; mockup
   design/treasury-mockup/insights.html): Finances' fourth room and its
   first band, THE MARKET — rates, eight markets, the S&P 500 heatmap and
   the regions, fetched on open and never saved. The test backend answers
   with a canned market (convex/insightsMarket.ts), a moment late; it has
   no FRED_API_KEY, so the Fed card is the one not reached. A mock
   Broadcom is held, so AVGO carries the white dot. */

async function open(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2eFundamentals.share, {
    shape: 'add',
    reading: { ageDays: 0.2 },
  })
  await page.goto('/finances?room=insights')
  const room = page.getByTestId('insights-room')
  await expect(room).toBeVisible()
  return room
}

const rate = (page: Page, id: string) =>
  page.locator(`[data-testid=rate-card][data-id="${id}"]`)
const market = (page: Page, id: string) =>
  page.locator(`[data-testid=market-card][data-id="${id}"]`)

test('S1 open: six rates, the trend, sectors as rows, each with its source and time', async ({
  page,
}) => {
  const room = await open(page)
  /* Asked on open: the cards wait for the answer, then fill. */
  await expect(
    room.getByText('READING', { exact: false }).first(),
  ).toBeVisible()
  await expect(page.getByTestId('rate-card')).toHaveCount(6)
  await expect(rate(page, 'us-cpi')).toContainText('2.9%', { timeout: 15_000 })
  await expect(rate(page, 'us-cpi')).toContainText('AUG 3.1%')
  await expect(rate(page, 'us-cpi')).toContainText('BLS · SEP')
  await expect(rate(page, 'eu-hicp')).toContainText('2.1%')
  await expect(rate(page, 'eu-hicp')).toContainText('EUROSTAT · SEP')
  await expect(rate(page, 'ecb')).toContainText('2.00%')
  await expect(rate(page, 'ecb')).toContainText('SINCE 11 SEP')
  for (const id of ['us-cpi', 'eu-hicp', 'ecb'])
    await expect(rate(page, id)).toContainText('NOT SAVED')

  await expect(page.getByTestId('market-card')).toHaveCount(8)
  await expect(market(page, 'sp500')).toContainText('S&P 500')
  await expect(market(page, 'sp500')).toContainText('6,612')
  /* THE TREND opens on 3M (30 Oct): the canned month × 2.5. */
  await expect(market(page, 'sp500')).toContainText('▲ 6.0%')
  await expect(market(page, 'sp500')).toContainText('→ 6,612')
  await expect(market(page, 'us10y')).toContainText('PTS')
  await expect(page.getByTestId('markets-foot')).toContainText(
    /YAHOO FINANCE · FETCHED \d\d:\d\d · NOT SAVED/,
  )

  await expect(page.getByTestId('stock')).toHaveCount(30)
  await expect(
    page.locator('[data-testid=stock][data-symbol=AVGO]'),
  ).toHaveAttribute('data-held', 'true')
  await expect(
    page.locator('[data-testid=stock][data-symbol=AAPL]'),
  ).toHaveAttribute('data-held', 'false')
  await expect(page.getByTestId('sector')).toHaveCount(8)
  await expect(page.getByTestId('region')).toHaveCount(6)
  /* YOUR COMPANIES: the held company with its results, analysts, insider. */
  const co = page.getByTestId('company-row').first()
  await expect(co).toContainText('$2.31 a share')
  await expect(co).toContainText('$2.10 expected')
  await expect(co).toContainText('Buy 48 · Hold 9')
  await expect(co).toContainText('Sold $4.2M')
  /* ON REDDIT: five rows, today over yesterday, HELD on a held one. */
  await expect(page.getByTestId('crowd-row')).toHaveCount(5)
  await expect(page.getByTestId('crowd-row').first()).toContainText(
    '1,240× today',
  )
  await expect(page.getByTestId('crowd-row').first()).toContainText(
    '410× yesterday',
  )
  await expect(page.getByTestId('crowd-row').nth(2)).toContainText('HELD')
  /* No emoji anywhere on the tab (29 Oct: "Emojies again"). */
  expect(await page.getByTestId('tab-market').innerText()).not.toMatch(
    /\p{Extended_Pictographic}/u,
  )
  await page.waitForTimeout(1200)
  await page.screenshot(shot('insights-market'))
  await page.screenshot({ ...shot('insights-market-full'), fullPage: true })
})

test('S2 each period changes the numbers and the vs line', async ({ page }) => {
  await open(page)
  const sp = market(page, 'sp500')
  await expect(sp).toContainText('▲ 6.0%', { timeout: 15_000 })
  const since = page.getByTestId('markets-since')
  await expect(since).toContainText(/VS \d+ [A-Z]{3} CLOSE/)
  const seen: Array<string> = [(await since.textContent()) ?? '']

  for (const [p, change] of [
    ['1M', '▲ 2.4%'],
    ['1Y', '▲ 9.6%'],
  ] as const) {
    await page.getByRole('button', { name: p, exact: true }).click()
    await expect(
      page.getByRole('button', { name: p, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(sp).toContainText(change, { timeout: 15_000 })
    await expect(page.getByTestId('heat-period')).toHaveText(p)
    const line = (await since.textContent()) ?? ''
    expect(seen).not.toContain(line)
    seen.push(line)
  }
  await expect(since).toContainText(/2025 CLOSE/)
  /* A period seen once is kept: back to 3M is at once, no reading. */
  await page.getByRole('button', { name: '3M', exact: true }).click()
  await expect(sp).toContainText('▲ 6.0%')
  await expect(page.getByTestId('insights-room')).not.toContainText('READING')
  await page.screenshot(shot('insights-periods'))
})

test('S3 a source not reached: that card says so, the rest stand', async ({
  page,
}) => {
  await open(page)
  const fed = rate(page, 'fed')
  await expect(fed).toHaveAttribute('data-reached', 'false', {
    timeout: 15_000,
  })
  await expect(fed).toContainText('NOT REACHED')
  await expect(fed).toContainText('FRED')
  await expect(rate(page, 'ecb')).toHaveAttribute('data-reached', 'true')
  await expect(rate(page, 'ecb')).not.toContainText('NOT REACHED')
  await expect(page.getByTestId('market-card')).toHaveCount(8)
  await fed.screenshot(shot('insights-not-reached'))
})

test('S4 ⓘ opens its card in plain words, and closes', async ({ page }) => {
  await open(page)
  await expect(rate(page, 'us-cpi')).toContainText('2.9%', { timeout: 15_000 })
  await page.getByRole('button', { name: 'About US INFLATION' }).click()
  const card = page.getByRole('dialog', { name: 'US INFLATION' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('WHAT IT IS')
  await expect(card).toContainText('WHY IT MOVES THE MONEY')
  await expect(card).toContainText('SEP 2.9% · AUG 3.1%')
  /* It pops in: the picture once it has landed. */
  await expect(card).toHaveCSS('opacity', '1')
  await page.screenshot(shot('insights-info'))
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()

  await page.getByRole('button', { name: 'About SECTORS' }).click()
  await expect(page.getByRole('dialog', { name: 'SECTORS' })).toContainText(
    'framed',
  )
  await page.mouse.click(5, 5)
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('S5 phone width: no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page)
  await expect(market(page, 'sp500')).toContainText('▲ 6.0%', {
    timeout: 15_000,
  })
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(over).toBeLessThanOrEqual(0)
  await page.screenshot({ ...shot('insights-phone'), fullPage: true })
})

test('S6 tabs: MARKET with no read, one band at a time, the last tab kept on reload', async ({
  page,
}) => {
  await open(page)
  const tab = (id: string) => page.locator(`[data-tab="${id}"]`)
  await expect(page.getByTestId('insights-tab')).toHaveCount(5)
  await expect(tab('market')).toHaveAttribute('aria-pressed', 'true')
  /* The S&P 500's change over the period, as its card says it. */
  await expect(tab('market').getByTestId('tab-badge')).toHaveText(
    'S&P ▲ 6.0%',
    { timeout: 15_000 },
  )
  await expect(page.getByTestId('tab-market')).toBeVisible()
  await expect(page.getByTestId('tab-mine')).toHaveCount(0)

  await tab('mine').click()
  await expect(tab('mine')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('tab-mine')).toBeVisible()
  await expect(page.getByTestId('tab-market')).toHaveCount(0)
  await expect(page.getByTestId('rate-card')).toHaveCount(0)

  await page.reload()
  await expect(tab('mine')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('tab-mine')).toBeVisible()

  /* The bar stays on top while the band scrolls. */
  await page.mouse.wheel(0, 2000)
  await expect
    .poll(
      async () => (await page.getByTestId('insights-tabs').boundingBox())?.y,
    )
    .toBeLessThan(80)
  await expect(page.getByTestId('insights-tabs')).toBeInViewport()
  await page.screenshot(shot('insights-tabs'))
})
