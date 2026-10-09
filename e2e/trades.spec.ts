import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Safety net (5 Oct): a broker's order history, confirmed. A canned
   reading — no paid reader. Confirming answers at once and lands. */
test('stock orders: confirm answers at once, then lands', async ({ page }) => {
  const days = await start(page)
  await testClient().mutation(anyApi.e2e.readTrades, { days })
  await page.goto('/finances')
  await page.getByText('Revolut stock orders').first().click()
  const sheet = page.getByRole('dialog')
  const confirm = sheet.getByRole('button', { name: 'confirm · 3 trades' })
  await expect(confirm).toBeEnabled()
  await page.screenshot({ ...shot('trades-check'), fullPage: true })
  await confirm.click()
  await expect(sheet.getByText(/adding|Portfolio/).first()).toBeVisible()
  await expect(sheet.getByRole('link', { name: /Portfolio/ })).toBeVisible()
  await expect(sheet.getByText(/^3 trades added · /)).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot(shot('trades-landed'))
})
