import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Safety net (5 Oct): a broker screenshot, checked and saved. A canned
   reading — no paid reader. Saving answers at once and lands. */
test('holdings screenshot: save answers at once, then lands', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2e.readHoldings, {})
  await page.goto('/finances')
  await page.getByText('Revolut Invest screenshot').first().click()
  const sheet = page.getByRole('dialog')
  const save = sheet.getByRole('button', {
    name: 'save 2 positions and the cash',
  })
  await expect(save).toBeEnabled()
  await page.screenshot({ ...shot('holdings-check'), fullPage: true })
  await save.click()
  await expect(sheet.getByText(/saving|Portfolio/).first()).toBeVisible()
  await expect(sheet.getByRole('link', { name: /Portfolio/ })).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot(shot('holdings-landed'))
})
