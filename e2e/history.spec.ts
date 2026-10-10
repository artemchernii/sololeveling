import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* A whole trading history goes in through update all (9 Oct, "go use
   bulk"): apply answers at once, lands, and the same history again
   brings nothing new. A canned reading — no paid reader. */
test('trading history: applied through update all, and again adds nothing', async ({
  page,
}) => {
  const days = await start(page)
  await testClient().mutation(anyApi.e2e.readHistory, { days })
  await page.goto('/finances')

  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('31 trades')).toBeVisible()
  await page.screenshot({ ...shot('history-review'), fullPage: true })
  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText(/Writing|updated/).first()).toBeVisible()
  await expect(sheet.getByText('Revolut updated')).toBeVisible()
  await expect(sheet.getByText(/^31 trades added · /)).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot(shot('history-landed'))
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()

  await testClient().mutation(anyApi.e2e.readHistory, { days })
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText('Revolut updated')).toBeVisible()
  await expect(sheet.getByText('nothing new')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot(shot('history-again'))
})
