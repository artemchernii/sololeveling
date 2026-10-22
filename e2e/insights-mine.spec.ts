import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Insights I2 (19 Oct, docs/specs/2026-10-19-insights.md; mockup
   design/treasury-mockup/insights.html "3 MINE"): every Portfolio
   position as a box sized by its euros, coloured by the period's move,
   with its Portfolio verdict; ALLOCATION mine against the world. The
   test backend seeds four positions (convex/e2eMine.ts) whose verdicts
   come from their stored closes; moves and what Yahoo opens up are
   canned (convex/insightsMine.ts). */

async function open(page: Page, seed = true, many = false) {
  await start(page)
  if (seed) await testClient().mutation(anyApi.e2eMine.positions, {})
  if (many)
    for (const part of [1, 2])
      await testClient().mutation(anyApi.e2eMine.positions, { part })
  await page.goto('/finances?room=insights')
  await expect(page.getByTestId('insights-room')).toBeVisible()
  await page.locator('[data-tab="mine"]').click()
  await expect(page.getByTestId('tab-mine')).toBeVisible()
}

const box = (page: Page, symbol: string) =>
  page.locator(`[data-testid=mine-box][data-symbol="${symbol}"]`)

test('S1 every position a box by its euros, with its Portfolio verdict', async ({
  page,
}) => {
  await open(page)
  await expect(page.getByTestId('mine-box')).toHaveCount(4)
  /* The tab says how many ADD, from the same verdicts. */
  await expect(page.locator('[data-tab="mine"]')).toContainText('1 ADD', {
    timeout: 15_000,
  })
  await expect(box(page, 'VUAA.L')).toHaveAttribute('data-call', 'hold', {
    timeout: 15_000,
  })
  await expect(box(page, 'VUAA.L')).toContainText('❚❚ HOLD')
  await expect(box(page, 'AVGO')).toContainText('✚ ADD')
  await expect(box(page, 'NVDA')).toContainText('⧗ WAIT')
  /* The biggest is first and widest: 6 shares against 3 and 1.5. */
  const w = async (s: string) => (await box(page, s).boundingBox())?.width ?? 0
  expect(await w('VUAA.L')).toBeGreaterThan(await w('AVGO'))
  await expect(box(page, 'VUAA.L')).toContainText('€')
  await expect(box(page, 'AVGO')).toContainText(/[+−]\d+\.\d%/)
  for (const [call, n] of [
    ['add', 1],
    ['hold', 1],
    ['wait', 1],
  ] as const)
    await expect(
      page.locator(`[data-testid=verdict-card][data-call=${call}]`),
    ).toContainText(`· ${n}`)
  await expect(page.getByTestId('mine-foot')).toContainText(
    /VERDICT · PORTFOLIO'S OWN RULES · .* YAHOO · FETCHED \d\d:\d\d · NOT SAVED/,
  )

  /* Another period changes the moves, not the verdicts. */
  const month = await box(page, 'AVGO').locator('.v').textContent()
  /* The period is MARKET's switch, shared by the room. */
  await page.locator('[data-tab="market"]').click()
  await page.getByRole('button', { name: '1Y', exact: true }).click()
  await page.locator('[data-tab="mine"]').click()
  await expect(page.getByTestId('mine-positions')).toContainText(
    'POSITIONS · 1Y',
  )
  await expect(box(page, 'AVGO').locator('.v')).not.toHaveText(month ?? '', {
    timeout: 15_000,
  })
  await expect(box(page, 'AVGO')).toContainText('✚ ADD')

  await page.getByTestId('mine-positions').screenshot(shot('insights-mine'))
  await page.getByRole('button', { name: 'About POSITIONS' }).click()
  await expect(page.getByRole('dialog', { name: 'POSITIONS' })).toContainText(
    'ADD 1 · HOLD 1 · WAIT 1',
  )
})

test('S2 a frozen position is striped, FROZEN, with no verdict', async ({
  page,
}) => {
  await open(page)
  const ozon = box(page, 'OZON')
  await expect(ozon).toContainText('FROZEN')
  await expect(ozon).toHaveClass(/frozen/)
  await expect(ozon).toHaveAttribute('data-call', '')
})

test('S3 allocation: places by region tag, the world only with a source, unknown named', async ({
  page,
}) => {
  await open(page)
  const row = (id: string) =>
    page.locator(`[data-testid=alloc-row][data-id="${id}"]`)
  await expect(page.getByTestId('alloc-row')).toHaveCount(6)
  await expect(row('tech')).toContainText(/\d+%/, { timeout: 15_000 })
  await expect(row('tech')).toContainText('WORLD 26%')
  await expect(row('health')).toContainText('WORLD 10%')
  await expect(row('gold')).toContainText('WORLD 0%')
  /* Places are Portfolio's region tags: VUAA's name says S&P 500 and
     AVGO's stored country is the US; NVDA's is not stored, so its
     Yahoo profile on this open places it. No world number for places. */
  await expect(row('us')).toContainText('100%')
  await expect(row('us').getByTestId('not-opened')).toHaveCount(0)
  await expect(row('us').locator('.vals .ins-was')).toHaveCount(0)
  await expect(row('world')).toContainText('0%')
  await expect(row('world').locator('.vals .ins-was')).toHaveCount(0)
  await expect(page.getByTestId('alloc-lead')).toContainText('TECH · AI')
  await page.getByTestId('mine-alloc').screenshot(shot('insights-alloc'))
})

test('S4 no positions: the empty state', async ({ page }) => {
  await open(page, false)
  await expect(page.getByTestId('mine-empty')).toContainText('0 POSITIONS')
  await expect(page.getByTestId('mine-box')).toHaveCount(0)
})

test('S5 phone width: no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page)
  await expect(box(page, 'AVGO')).toContainText('✚ ADD', { timeout: 15_000 })
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(wide).toBe(false)
  await page
    .getByTestId('mine-positions')
    .screenshot(shot('insights-mine-phone'))
})

test('S6 many positions: the band at his window width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page, true, true)
  await expect(page.getByTestId('mine-box')).toHaveCount(15, {
    timeout: 15_000,
  })
  await expect(
    page.locator('[data-testid=alloc-row][data-id="tech"]'),
  ).toContainText(/\d+%/, { timeout: 15_000 })
  const band = page.locator('.ins-grid', {
    has: page.getByTestId('mine-alloc'),
  })
  await band.scrollIntoViewIfNeeded()
  await band.screenshot(shot('insights-mine-many'))
})

/* Earnings on MINE (22 Oct, docs/specs/2026-10-21-earnings-dates.md;
   mockup design/treasury-mockup/earnings.html). Canned on the test
   backend: AVGO reported yesterday and fell 7.8%, NVDA reports in five
   days; the fund and the frozen share get none. */
test('S7 earnings: a ribbon on a company that reported or soon will', async ({
  page,
}) => {
  await page.setViewportSize({ width: 950, height: 900 })
  await open(page)
  const ribbon = (s: string) => box(page, s).getByTestId('earn-ribbon')
  await expect(ribbon('AVGO')).toHaveAttribute('data-kind', 'reported', {
    timeout: 15_000,
  })
  await expect(ribbon('AVGO')).toHaveAttribute(
    'aria-label',
    /^REPORTED \d+ [A-Z]{3} ▼ 7\.8%$/,
  )
  await expect(ribbon('NVDA')).toHaveAttribute('data-kind', 'soon')
  await expect(ribbon('NVDA')).toHaveAttribute(
    'aria-label',
    /^EARNINGS \d+ [A-Z]{3} · IN 5 DAYS$/,
  )
  await expect(ribbon('VUAA.L')).toHaveCount(0)
  await expect(ribbon('OZON')).toHaveCount(0)
  /* Shown in words that fit: nothing cut. */
  for (const s of ['AVGO', 'NVDA']) {
    const cut = await ribbon(s).evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    )
    expect(cut).toBe(false)
  }
  await expect(ribbon('NVDA')).toHaveCSS('opacity', '1')
  await page.getByTestId('mine-positions').screenshot(shot('insights-earnings'))

  /* A press opens both prices; ASK is not asked. */
  await ribbon('AVGO').click()
  const card = page.getByTestId('earn-card')
  await expect(card).toContainText('REPORTED')
  await expect(card).toContainText('$340.50')
  await expect(card).toContainText('$313.94')
  await expect(card).toContainText('▼ 7.8%')
  await expect(card).toContainText(/YAHOO · FETCHED \d\d:\d\d · NOT SAVED/)
  await expect(page.getByTestId('ask-drawer')).toHaveAttribute(
    'aria-hidden',
    'true',
  )
  await card.screenshot(shot('insights-earnings-card'))
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)

  /* The ⓘ card lists them. */
  await page.getByRole('button', { name: 'About POSITIONS' }).click()
  await expect(page.getByRole('dialog', { name: 'POSITIONS' })).toContainText(
    'NVDA EARNINGS',
  )
})

test('S8 earnings at phone width: short words, nothing cut', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page)
  const ribbons = page.getByTestId('earn-ribbon')
  await expect(ribbons.first()).toBeVisible({ timeout: 15_000 })
  /* Landed: the ribbon slides in after the boxes. */
  await expect(ribbons.first()).toHaveCSS('opacity', '1')
  for (const r of await ribbons.all()) {
    if (!(await r.isVisible())) continue
    const cut = await r.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(cut).toBe(false)
  }
  await page
    .getByTestId('mine-positions')
    .screenshot(shot('insights-earnings-phone'))
})
