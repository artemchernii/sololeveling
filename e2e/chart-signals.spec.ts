import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* The portfolio helper, part 1 (15 Oct, mockup indicators.html): lines
   on one position's chart — AVG BUY, SMA 50, SMA 200, RSI 14, 52W — off
   on every open, each named with its period in the key; and a SIGNALS
   tab beside BUYS & SELLS, one row a line with its textbook verdict.
   The mock Microsoft rises half a dollar a day to $449.50, so every
   answer is known: above both averages and the average buy, RSI 100,
   at its 52-week high. Mock data only. */
test('Portfolio: chart lines and the SIGNALS tab', async ({ page }) => {
  await start(page)
  await testClient().mutation(anyApi.e2eSignals.heldShare, {})
  await page.goto('/finances?room=portfolio')
  await page.evaluate(() => localStorage.removeItem('position-tab'))
  await page
    .getByTestId('owned-row')
    .filter({ hasText: 'Microsoft' })
    .getByRole('link')
    .click()
  const position = page.getByTestId('position-page')
  const chart = position.getByTestId('price-plot')
  const keys = position.getByTestId('chart-keys')
  const read = position.getByTestId('price-read')
  const pill = (name: string) =>
    position.getByRole('button', { name, exact: true })
  await expect(chart).toHaveAttribute('data-days', '300')

  /* Off on open: no line, no key. */
  for (const name of ['avg buy', 'sma 50', 'sma 200', 'rsi 14', '52w'])
    await expect(pill(name)).toHaveAttribute('aria-pressed', 'false')
  await expect(chart).toHaveAttribute('data-lines', '')

  /* SIGNALS first: five rows, their verdicts, the counts on the tab. */
  const tabs = position.getByTestId('position-tabs')
  await expect(tabs.getByRole('tab', { name: /signals/i })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(tabs.getByRole('tab', { name: /signals/i })).toContainText('4 ▲')
  await expect(tabs.getByRole('tab', { name: /signals/i })).toContainText('1 ▼')
  const row = (id: string) =>
    position.locator(`[data-testid=signal][data-id="${id}"]`)
  await expect(position.getByTestId('signal')).toHaveCount(5)
  await expect(row('avg')).toContainText(/in profit/i)
  await expect(row('avg')).toContainText('+9.6%')
  await expect(row('sma50')).toContainText(/bullish/i)
  await expect(row('sma50')).toContainText('+2.8%')
  await expect(row('sma200')).toContainText(/bullish/i)
  await expect(row('rsi')).toContainText(/overbought/i)
  await expect(row('rsi')).toContainText('100')
  await expect(row('yr')).toContainText(/near high/i)

  /* The verdict above the tabs (15 Oct, mockup verdict.html; 16 Oct,
     fundamentals.html): RSI 100 is over 70, so WAIT, its line and the
     three reasons; the RSI reason made the call. No reading stored for
     Microsoft, so fundamentals are not loaded; three canned headlines.
     RULE opens the rule with today's row lit. */
  const verdict = position.getByTestId('verdict')
  await expect(verdict).toHaveAttribute('data-call', 'wait')
  await expect(verdict.getByTestId('verdict-badge')).toHaveText(/wait/i)
  await expect(verdict).toContainText('RSI 14 above 70')
  await expect(verdict).toContainText(/a buy now raises the avg buy/i)
  const why = verdict.getByTestId('verdict-why')
  await expect(why).toHaveCount(3)
  await expect(why.filter({ hasText: /rsi 14/i })).toHaveAttribute(
    'data-key',
    'true',
  )
  await expect(why.filter({ hasText: /sma 50/i })).toContainText('+2.8%')
  await expect(
    verdict.locator('[data-testid=feed][data-id=fundamentals]'),
  ).toContainText(/not loaded/i)
  await expect(
    verdict.locator('[data-testid=feed][data-id=news]'),
  ).toContainText(/3 · not in the rule/i, { timeout: 10_000 })
  await verdict.getByRole('button', { name: 'rule', exact: true }).click()
  await expect(verdict.getByTestId('rule-row')).toHaveCount(4)
  await expect(
    verdict.locator('[data-testid=rule-row][data-on=true]'),
  ).toContainText(/wait/i)

  /* The tiles: worth in euros, then dollars; P&L with its badge and
     first day; the account's own P&L under its worth. */
  const tiles = position.getByTestId('position-tiles')
  await expect(tiles.getByTestId('worth-there')).toContainText('$1,011')
  await expect(tiles.getByTestId('pl-tile')).toContainText(/p&l/i)
  await expect(tiles.getByTestId('pl-badge')).toHaveText(/up/i)
  await expect(tiles.getByTestId('pl-tile')).toContainText(/since first buy/i)
  await expect(tiles.getByTestId('account-pl')).toHaveCount(1)
  await expect(tiles.getByTestId('account-pl')).toContainText('▲')
  await page.waitForTimeout(900)
  await position.getByTestId('position-tabs').scrollIntoViewIfNeeded()
  await page.screenshot({ ...shot('chart-signals'), fullPage: true })

  /* A row opens on a tap: its sentence and both numbers. */
  await row('sma50').locator('button[aria-expanded]').first().click()
  await expect(row('sma50')).toContainText(
    'Price above its 50-day average: the trend of recent months is up.',
  )
  await expect(row('sma50')).toContainText('$437.25')

  /* Its line mark puts the line on the chart, as the pill does. */
  await row('sma50')
    .getByRole('button', { name: 'SMA 50 on the chart' })
    .click()
  await expect(pill('sma 50')).toHaveAttribute('aria-pressed', 'true')
  await expect(chart).toHaveAttribute('data-lines', 'sma50')
  await expect(keys).toContainText('SMA 50 · 50 closes')
  await expect(pill('sma 50')).toContainText('▲')
  await pill('sma 50').click()
  await expect(chart).toHaveAttribute('data-lines', '')
  await expect(keys).not.toContainText('SMA 50')

  /* AVG BUY: the round now, its buys and first day in the key. */
  await pill('avg buy').click()
  await expect(chart).toHaveAttribute('data-lines', 'avg')
  await expect(keys).toContainText(
    /AVG BUY \$410(\.00)? · €352\.60 · 2 BUY · SINCE/i,
  )
  await pill('avg buy').click()

  /* RSI 14 in its own pane, and the 52-week high and low. */
  await pill('rsi 14').click()
  await pill('52w').click()
  await expect(chart).toHaveAttribute('data-lines', 'rsi yr')
  await expect(keys).toContainText('RSI 14 · 14 closes · 30 / 70')
  await expect(keys).toContainText('52W HIGH $449.50')
  await expect(keys).toContainText(/52W LOW \$300(\.00)? · /)
  await chart.scrollIntoViewIfNeeded()
  const plot = await chart.boundingBox()
  if (plot === null) throw new Error('no chart')
  await page.mouse.move(plot.x + plot.width * 0.6, plot.y + plot.height / 3)
  await expect(read).toContainText('RSI 14')
  await page.screenshot({ ...shot('chart-lines-rsi'), fullPage: true })
  await pill('rsi 14').click()
  await pill('52w').click()

  /* SMA 200 reads the older years first, then draws. */
  await pill('sma 200').click()
  await expect
    .poll(() => chart.getAttribute('data-lines'), { timeout: 15_000 })
    .toBe('sma200')
  await expect(keys).toContainText('SMA 200 · 200 closes')

  /* BUYS AND SELLS is kept on this device; the lines are off again. */
  await tabs.getByRole('tab', { name: /buys and sells/i }).click()
  await expect(position.getByTestId('round-now')).toBeVisible()
  await page.reload()
  await expect(
    page
      .getByTestId('position-tabs')
      .getByRole('tab', { name: /buys and sells/i }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('price-plot')).toHaveAttribute('data-lines', '')

  /* A phone: nothing runs off the side. */
  await page.setViewportSize({ width: 375, height: 812 })
  await page
    .getByTestId('position-tabs')
    .getByRole('tab', { name: /signals/i })
    .click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.waitForTimeout(900)
  await page.screenshot({ ...shot('chart-signals-phone'), fullPage: true })
})

/* Sold out: nothing held, so no average buy. */
test('Portfolio: a sold-out position has no AVG BUY', async ({ page }) => {
  await start(page)
  await testClient().mutation(anyApi.e2ePortfolio.soldOut, {})
  await page.goto('/finances?room=portfolio')
  await page.getByTestId('sold-row').first().getByRole('link').click()
  const position = page.getByTestId('position-page')
  await expect(position.getByTestId('price-plot')).toBeVisible()
  await expect(
    position.getByRole('button', { name: 'avg buy', exact: true }),
  ).toHaveCount(0)
  await expect(
    position.locator('[data-testid=signal][data-id="avg"]'),
  ).toHaveCount(0)
})
