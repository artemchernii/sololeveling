import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* The excluded list (1 Nov, his "excluded list"): ⊘ HIDE on a position's
   page folds its row under HIDDEN at the foot of EVERYTHING OWNED; SHOW
   brings it back. Mock data only. */
test('Portfolio: hide a holding, it folds under HIDDEN, show brings it back', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eFind.manyHeld, {})
  await page.goto('/finances?room=portfolio')

  const rows = page.getByTestId('owned-row')
  await expect(rows).toHaveCount(8)
  const name = (
    await rows.first().locator('span.truncate').first().innerText()
  ).trim()
  await rows.first().getByRole('link').first().click()

  /* Hide: saving at once, a tick, the button says hidden. */
  const hide = page.getByTestId('hide-button')
  await expect(hide).toHaveText(/hide/i)
  await hide.click()
  await expect(page.getByRole('status', { name: 'Saving' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Saved' })).toBeVisible()
  await expect(hide).toHaveText(/hidden · show/i)
  await page.waitForTimeout(600)
  await page.screenshot(shot('hides-page'))

  /* The list: seven rows, the eighth folded under HIDDEN · 1. */
  await page.goto('/finances?room=portfolio')
  await expect(rows).toHaveCount(7)
  await expect(page.getByText(/everything owned · 7/i)).toBeVisible()
  const fold = page.getByTestId('hidden-fold')
  await expect(fold).toContainText(/hidden · 1/i)
  await fold.click()
  await expect(page.getByTestId('hidden-list')).toContainText(name)
  await page.waitForTimeout(600)
  await page.screenshot({ ...shot('hides-list'), fullPage: true })

  /* Show: back in the list, no fold. */
  await page.getByTestId('hidden-list').getByRole('link').first().click()
  await page.getByTestId('hide-button').click()
  await expect(page.getByTestId('hide-button')).toHaveText(/^hide$/i)
  await page.goto('/finances?room=portfolio')
  await expect(rows).toHaveCount(8)
  await expect(page.getByTestId('hidden-fold')).toHaveCount(0)
})
