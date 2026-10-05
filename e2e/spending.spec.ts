import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })
const DAY = 86_400_000

/* Safety net for Spending (5 Oct): a row's group changes from its badge —
   saving at once, the row lands in its new group, and a done line says so. */

test('Spending: a row moved to another group — saving, done, moved', async ({
  page,
}) => {
  const days = await start(page)
  await testClient().mutation(anyApi.e2e.paySalary, { day: days[0] - DAY })
  await page.goto('/finances?room=flow')
  await page
    .getByRole('navigation', { name: 'Flow' })
    .getByRole('button', { name: /Spending/ })
    .click()
  await page.getByRole('button', { name: /Eating out.*3 payments/ }).click()
  await page.screenshot(shot('spending-open'))

  await page
    .getByRole('button', { name: 'Eating out', exact: true })
    .first()
    .click()
  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  await expect(page.getByText('saving').first()).toBeVisible()
  await expect(page.getByText(/moved to Groceries/)).toBeVisible()
  await expect(page.getByText('saving')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Groceries/ })).toBeVisible()
  await page.screenshot(shot('spending-moved'))
})
