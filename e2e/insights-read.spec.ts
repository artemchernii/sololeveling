import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'
import { monthKey, nextMonthWord } from '../src/lib/marketRead'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Insights I3 (19 Oct, docs/specs/2026-10-19-insights.md; mockup
   design/treasury-mockup/insights.html): the market read and the ideas.
   The test backend never calls out — the dev server has no Claude Code
   route under E2E_RUN, so the page reads through the API path, and the
   action answers with a canned read (src/lib/marketReadCanned.ts) armed
   by e2eMarketRead.arm; idea quotes are canned too, ZZZZ unknown. A mock
   Broadcom is held. */

async function open(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2eFundamentals.share, {
    shape: 'add',
    reading: { ageDays: 0.2 },
  })
  await page.goto('/finances?room=insights')
  const hero = page.getByTestId('read-hero')
  await expect(hero).toHaveAttribute('data-state', 'idle')
  return hero
}

const arm = (shape: 'calm' | 'mixed' | 'fail' | 'broken') =>
  testClient().mutation(anyApi.e2eMarketRead.arm, { shape })

async function readMarket(page: Page) {
  const hero = page.getByTestId('read-hero')
  const button = page.getByTestId('read-market')
  await expect(button).toBeEnabled()
  await button.click()
  /* Pressed: it answers at once, and the button cannot pay twice. */
  await expect(hero).toHaveAttribute('data-state', 'reading')
  await expect(hero).toContainText('Reading the market…')
  await expect(button).toBeDisabled()
  return hero
}

test('S1 READ MARKET → reading → the read: headline, lines with icons and facts, sources, ideas', async ({
  page,
}) => {
  const hero = await open(page)
  await expect(hero).toContainText('Not read yet')
  await expect(page.getByTestId('read-pay')).toHaveText('💳 API CREDITS')
  await expect(page.getByTestId('read-cost')).toHaveText(
    'CAP $2.00 · USED $0.00',
  )
  await expect(page.getByTestId('read-lines')).toContainText('AFTER THE READ')
  await expect(page.getByTestId('ideas-after')).toBeVisible()

  await readMarket(page)
  await expect(hero).toHaveAttribute('data-state', 'done', { timeout: 15_000 })
  await expect(page.getByTestId('read-headline')).toHaveText(
    'Rates falling · shares up',
  )
  await expect(page.getByTestId('read-kpi').first()).toContainText('S&P 500')
  await expect(page.getByTestId('read-stamp')).toContainText(
    '62K IN · 3.1K OUT',
  )
  await expect(page.getByTestId('read-cost')).toHaveText(
    '$0.24 · CAP $2.00 · USED $0.24',
  )
  await expect(page.getByTestId('read-market')).toHaveText('↻ READ AGAIN')

  const lines = page.getByTestId('read-line')
  await expect(lines).toHaveCount(4)
  await expect(lines.nth(0)).toHaveAttribute('data-kind', 'inflation')
  await expect(lines.nth(0)).toContainText('🌡️')
  await expect(lines.nth(0)).toContainText('US CPI SEP 2.9%')
  await expect(lines.nth(0)).toContainText('US CPI AUG 3.1%')
  await expect(lines.nth(3)).toHaveAttribute('data-kind', 'dont')
  await expect(lines.nth(3)).toContainText('AVGO')

  await expect(page.getByTestId('read-plain')).toHaveCount(0)
  await lines
    .nth(0)
    .getByRole('button', { name: /WHAT IT MEANS/ })
    .click()
  await expect(page.getByTestId('read-plain')).toContainText('more slowly')
  await expect(page.getByTestId('read-sources')).toContainText('REUTERS')

  /* Two ideas the market answered; ZZZZ is dropped. */
  const cards = page.getByTestId('idea-card')
  await expect(cards).toHaveCount(2, { timeout: 15_000 })
  await expect(page.locator('[data-ticker="ZZZZ"]')).toHaveCount(0)
  const novo = page.locator('[data-ticker="NOVO-B.CO"]')
  await expect(novo).toContainText('DKK 412')
  await expect(novo).toContainText('▼ 3.9% · 1M')
  await expect(novo).toContainText('MODEL · NOT ADVICE')
  await expect(novo).toContainText('WRONG IF')
  await expect(novo).toContainText('NOT SAVED')
  await page.screenshot({ ...shot('insights-read-calm'), fullPage: true })

  await page.setViewportSize({ width: 375, height: 812 })
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(0)
  await page.screenshot({ ...shot('insights-read-phone'), fullPage: true })
})

test('S2 a mixed month: warn edge, a NO DATA line, no ideas', async ({
  page,
}) => {
  await open(page)
  await arm('mixed')
  const hero = await readMarket(page)
  await expect(hero).toHaveAttribute('data-state', 'done', { timeout: 15_000 })
  await expect(page.getByTestId('read-headline')).toHaveText(
    'Mixed · no clear trend',
  )
  const lines = page.getByTestId('read-line')
  await expect(lines).toHaveCount(3)
  const none = page.locator('[data-testid=read-line][data-kind=nodata]')
  await expect(none).toContainText('❔')
  await expect(none).toContainText('NO DATA')
  await expect(page.getByTestId('ideas-none')).toContainText('0 IDEAS')
  await page.screenshot({ ...shot('insights-read-mixed'), fullPage: true })
})

test('S3 failed: nothing paid, the last read stays', async ({ page }) => {
  await open(page)
  const hero = await readMarket(page)
  await expect(hero).toHaveAttribute('data-state', 'done', { timeout: 15_000 })
  await arm('fail')
  await readMarket(page)
  await expect(hero).toHaveAttribute('data-state', 'failed', {
    timeout: 15_000,
  })
  await expect(hero).toContainText('Reader not reached')
  await expect(page.getByTestId('read-failed')).toContainText(
    /NOTHING PAID · THE LAST READ STAYS · \d+ [A-Z]{3}/,
  )
  await expect(page.getByTestId('read-market')).toHaveText('↻ TRY AGAIN')
  await expect(page.getByTestId('read-line')).toHaveCount(4)
  await expect(page.getByTestId('read-cost')).toHaveText(
    '$0.24 · CAP $2.00 · USED $0.24',
  )
  await page.screenshot(shot('insights-read-failed'))
})

test('S4 cap reached: the button is off until the next month', async ({
  page,
}) => {
  await open(page)
  await testClient().mutation(anyApi.e2eMarketRead.spend, { usd: 2 })
  const hero = page.getByTestId('read-hero')
  await expect(hero).toHaveAttribute('data-state', 'cap')
  await expect(hero).toContainText('Month cap reached')
  await expect(page.getByTestId('read-cap')).toHaveText(
    `CAP $2.00 · USED $2.00 · NEXT ${nextMonthWord(monthKey(Date.now()))}`,
  )
  await expect(page.getByTestId('read-market')).toBeDisabled()
  await page.screenshot(shot('insights-read-cap'))
})

test('S5 reload shows the stored read without paying again', async ({
  page,
}) => {
  await open(page)
  const hero = await readMarket(page)
  await expect(hero).toHaveAttribute('data-state', 'done', { timeout: 15_000 })
  await page.reload()
  await expect(page.getByTestId('read-hero')).toHaveAttribute(
    'data-state',
    'done',
  )
  await expect(page.getByTestId('read-headline')).toHaveText(
    'Rates falling · shares up',
  )
  await expect(page.getByTestId('read-line')).toHaveCount(4)
  await expect(page.getByTestId('read-cost')).toHaveText(
    '$0.24 · CAP $2.00 · USED $0.24',
  )
})
