import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* The watchlist on Portfolio (1 Nov, mockup watchlist.html, his "go";
   spec docs/specs/2026-11-01-watchlist.md). Three names not owned, a
   year of closes each in dollars; mock data only. */

test('Portfolio: WATCHLIST — empty, three names, an alert set and hit, ★ off, a name’s page', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances?room=portfolio')

  /* S1 none watched. */
  const box = page.getByTestId('watchlist')
  await expect(box).toBeVisible()
  await expect(box.getByTestId('watch-count')).toHaveText('0 / 20')
  await expect(box.getByTestId('watch-row')).toHaveCount(0)

  /* S2 three names: price, day, 52W, vs high, signal. */
  await testClient().mutation(anyApi.e2eWatch.names, {})
  const rows = box.getByTestId('watch-row')
  await expect(rows).toHaveCount(3)
  await expect(box.getByTestId('watch-count')).toHaveText('3 / 20')
  const amd = box.locator('[data-testid=watch-row][data-symbol=AMD]')
  await expect(amd).toContainText('Advanced Micro Devices')
  await expect(amd).toContainText('$141.20')
  await expect(amd.getByTestId('watch-day')).toContainText('%')
  await expect(amd.getByTestId('watch-range')).toContainText('$120')
  await expect(amd.getByTestId('watch-vs')).toContainText('-')
  await expect(amd.getByTestId('watch-signal')).toContainText(/add|hold|wait/i)
  await expect(amd.getByTestId('watch-signal')).toContainText('bull')
  await page.waitForTimeout(900)
  await page.screenshot({ ...shot('watchlist'), fullPage: true })

  /* S5 an alert: saving at once, a tick, the field closes; the row says
     which way. */
  const nvo = box.locator('[data-testid=watch-row][data-symbol=NVO]')
  await nvo.getByRole('button', { name: 'alert NVO' }).click()
  await page.getByLabel('alert price NVO').fill('55')
  await page.getByRole('button', { name: 'save alert' }).click()
  await expect(page.getByRole('status', { name: 'Saving' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Saved' })).toBeVisible()
  await expect(page.getByLabel('alert price NVO')).toHaveCount(0)
  await expect(nvo.getByRole('button', { name: 'alert NVO' })).toContainText(
    '≤ $55',
  )

  /* S6 a close past it: rung once, the row says HIT. */
  expect(
    await testClient().mutation(anyApi.e2eWatch.ring, {
      symbol: 'NVO',
      price: 54.7,
    }),
  ).toBe(1)
  await expect(nvo.getByRole('button', { name: 'alert NVO' })).toContainText(
    /hit ≤ \$55/i,
  )
  await page.screenshot({ ...shot('watchlist-hit'), fullPage: true })

  /* S8 a row opens its page: chart and signals, no trades. */
  await amd.getByRole('link', { name: /AMD/ }).click()
  const pageOf = page.getByTestId('watch-page')
  await expect(pageOf).toBeVisible()
  await expect(pageOf).toContainText('Advanced Micro Devices')
  await expect(pageOf.getByTestId('position-price')).toContainText('$141.20')
  await page.screenshot({ ...shot('watchlist-page'), fullPage: true })
  await page.goBack()

  /* S7 ★ off. */
  await box.getByRole('button', { name: 'unwatch TSM' }).click()
  await expect(rows).toHaveCount(2)
  await expect(box.getByTestId('watch-count')).toHaveText('2 / 20')
})

test('MOVERS: ★ on a row puts it on the WATCHLIST', async ({ page }) => {
  await start(page)
  await page.goto('/finances?room=insights')
  const tile = page.locator('[data-tile=movers]')
  const pltr = tile.locator('[data-testid=mover][data-symbol=PLTR]')
  await expect(pltr).toBeVisible({ timeout: 15_000 })
  const star = pltr.getByRole('button', { name: 'watch PLTR' })
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('status', { name: /PLTR · watchlist/i }),
  ).toBeVisible()
  await page.screenshot(shot('watchlist-star'))

  await page.goto('/finances?room=portfolio')
  await expect(
    page.locator('[data-testid=watch-row][data-symbol=PLTR]'),
  ).toBeVisible()
})

test('phone width: the rows stack, nothing runs off', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await start(page)
  await testClient().mutation(anyApi.e2eWatch.names, {})
  await page.goto('/finances?room=portfolio')
  await expect(page.getByTestId('watch-row')).toHaveCount(3)
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(wide).toBe(false)
  await page.screenshot({ ...shot('watchlist-phone'), fullPage: true })
})
