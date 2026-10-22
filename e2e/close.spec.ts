import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* CLOSE (22 Oct, docs/specs/2026-10-22-n3-investment-alerts.md; mockup
   design/treasury-mockup/close.html). Microsoft held, its newest close
   6% above the day before. Nothing is pushed: the test backend has no
   private key. */

test.beforeEach(async ({ page }) => {
  await start(page)
  const client = testClient()
  await client.mutation(anyApi.e2eSignals.heldShare, {})
  await client.action(anyApi.e2eInvest.bigDay, {})
})

test('S12 CLOSE: the day, the move with BIG DAY, the market, the news', async ({
  page,
}) => {
  await page.goto('/finances?room=insights#close')
  const close = page.getByTestId('close')
  await expect(close).toBeVisible()
  await expect(page.getByTestId('close-diff')).toHaveText(/^▲ €.* · 6%$/)
  const row = close.getByTestId('close-row').filter({ hasText: 'Microsoft' })
  await expect(row.getByText(/^WAS \$449\.50 · NOW \$476\.47$/)).toBeVisible()
  await expect(row.getByTestId('close-badge').first()).toHaveText('BIG DAY')
  await expect(row.getByText('▲ 6%')).toBeVisible()
  await expect(
    page.getByTestId('close-market').getByText('S&P 500'),
  ).toBeVisible()
  await expect(close.getByTestId('close-news').first()).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('close'), fullPage: true })
})

test('S8 the 21:30 push → the bell row → CLOSE', async ({ page }) => {
  await testClient().action(anyApi.e2eInvest.ring, {})
  await page.goto('/dashboard')
  await expect(page.getByTestId('bell-count')).toHaveText('1')
  await page.getByRole('button', { name: 'Notifications' }).click()
  const row = page
    .getByTestId('bell-panel')
    .getByTestId('bell-row')
    .filter({ hasText: /^Close · ▲ €/ })
  await expect(row).toBeVisible()
  await expect(row.getByText(/MSFT ▲ 6%/i)).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('close-bell'))
  await row.click()
  await expect(page).toHaveURL(/\/finances\?room=insights#close/)
  await expect(page.getByTestId('close')).toBeVisible()
})
