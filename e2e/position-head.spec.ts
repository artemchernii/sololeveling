import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* A position's head line (14 Oct, mockup position-rounds.html "4 · head
   line"): the currency is a chip with its symbol, and a fund's region
   comes from its own name, read once and stored. Gold is one GOLD badge,
   never "GOLD · GOLD". Shares ask Yahoo, which the test backend never
   does: no badge, the chip alone. Mock data only. */
test('Portfolio: the head line — currency chip and sector badge', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eHead.asiaFund, {})
  await testClient().mutation(anyApi.e2ePortfolio.goldBuys, {})
  await page.goto('/finances?room=portfolio')
  const open = async (name: string) => {
    await page.goto('/finances?room=portfolio')
    await page
      .getByTestId('owned-row')
      .filter({ hasText: name })
      .getByRole('link')
      .click()
    return page.getByTestId('position-page')
  }

  let position = await open('Asia Pacific')
  const sector = position.getByTestId('head-sector')
  await expect(sector).toHaveText(/asia pacific/i)
  await expect(sector).toHaveAttribute('title', /the fund’s name/)
  await expect(position.getByText('ETF', { exact: true })).toBeVisible()
  await expect(position.getByTestId('head-currency')).toHaveText('$USD')
  await page.waitForTimeout(800)
  await page.screenshot(shot('portfolio-head-fund'))

  position = await open('Gold')
  await expect(position.getByTestId('head-sector')).toHaveCount(1)
  await expect(position.getByTestId('head-sector')).toHaveText(/^gold$/i)
  await expect(position.getByText('gold', { exact: true })).toHaveCount(1)
  await expect(position.getByTestId('head-currency')).toHaveText('€EUR')
  await page.waitForTimeout(800)
  await page.screenshot(shot('portfolio-head-gold'))
  await page.setViewportSize({ width: 390, height: 844 })
  await position.getByRole('heading', { name: 'Gold' }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot(shot('portfolio-head-gold-phone'))
})
