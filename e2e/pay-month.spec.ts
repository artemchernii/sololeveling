import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })
const DAY = 86_400_000

/* Safety net for Flow's pay month (12 Oct): payday to payday — salary in,
   day-to-day out, what is left. The mock's three payments (€61.02) fall
   after a €2,900 salary five days ago. */

test('pay month: no salary found yet says so, and shows no numbers', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances?room=flow')
  await expect(page.getByText('No salary found yet.')).toBeVisible()
  await expect(page.getByText('BALANCE THIS MONTH')).toHaveCount(0)
  await page.screenshot(shot('pay-month-empty'))
})

test('pay month: salary, day-to-day and the balance between them', async ({
  page,
}) => {
  const days = await start(page)
  await testClient().mutation(anyApi.e2e.paySalary, { day: days[0] - DAY })
  await page.goto('/finances?room=flow')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  const month = page.locator('section', { hasText: 'BALANCE THIS MONTH' })
  await expect(month.getByText(/PAY MONTH · .* · day 5 of \d\d/)).toBeVisible()
  /* €2,900 in, €61.02 out day to day, no bills: €2,839 left (whole euros). */
  await expect(month.getByText('+€2,900').first()).toBeVisible()
  await expect(month.getByText('−€61').first()).toBeVisible()
  await expect(month.getByText('+€2,839').first()).toBeVisible()
  await expect(month.getByText('Bills still to pay')).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('pay-month'))

  /* Day-to-day opens the rows behind it. */
  await month.getByRole('button', { name: /day-to-day/ }).click()
  await expect(
    page
      .getByRole('navigation', { name: 'Flow' })
      .getByRole('button', { name: /Movements/ }),
  ).toHaveAttribute('aria-current', 'page')
  for (const name of ['Guacamole', 'Bolt', 'Continente'])
    await expect(page.getByText(name).first()).toBeVisible()
})
