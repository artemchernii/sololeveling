import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Safety net (5 Oct): Portfolio says what to do when it is empty, and
   shows a broker's positions once a holdings screenshot is saved. */
test('Portfolio: empty, then the positions a screenshot brought', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances?room=portfolio')
  await expect(page.getByText('No positions yet.')).toBeVisible()
  await page.screenshot(shot('portfolio-empty'))

  await testClient().mutation(anyApi.e2e.readHoldings, {})
  await page.goto('/finances')
  await page.getByText('Revolut Invest screenshot').first().click()
  const sheet = page.getByRole('dialog')
  await sheet
    .getByRole('button', { name: 'save 2 positions and the cash' })
    .click()
  await sheet.getByRole('link', { name: /Portfolio/ }).click()

  await expect(page).toHaveURL(/room=portfolio/)
  await expect(page.getByText('No positions yet.')).toHaveCount(0)
  await expect(page.getByText('worth now')).toBeVisible()
  await expect(page.getByText('2 positions')).toBeVisible()
  /* "put in" was meaningless (10 Oct): gone. */
  await expect(page.getByText(/put in/)).toHaveCount(0)
  for (const name of ['Apple', 'Microsoft'])
    await expect(page.getByText(name).first()).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('portfolio-held'), fullPage: true })
})
