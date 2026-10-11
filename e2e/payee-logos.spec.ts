import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* A row's mark (11 Oct: "icons for statements like BP or Spotify are not
   there"): a shop the app knows shows its site's icon; anything else keeps
   its arrow in the account and gets letters in a file. Nothing is written. */

test('an account: a known shop has its logo, a transfer keeps its arrow', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Open Revolut' }).click()
  const sheet = page.getByRole('dialog')
  const row = (name: string) =>
    sheet.locator('div.group', { hasText: name }).first()
  await expect(row('Continente').locator('img')).toHaveAttribute(
    'src',
    /domain=continente\.pt/,
  )
  await expect(row('Bolt').locator('img')).toHaveAttribute(
    'src',
    /domain=bolt\.eu/,
  )
  /* Not in the list: the arrow, as before. */
  await expect(row('Guacamole').locator('img')).toHaveCount(0)
  await expect(row('Guacamole').locator('svg').first()).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('payee-logos-account'))
})

test('an opened file: every row has a mark', async ({ page }) => {
  await start(page)
  await testClient().mutation(anyApi.e2eUpdate.readActivo, { as: 'yours' })
  await page.goto('/finances')
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  const add = page.getByRole('dialog')
  await add.getByRole('button', { name: /^apply/ }).click()
  await add.getByRole('button', { name: 'done' }).click()
  await page.getByRole('button', { name: 'Open ActivoBank' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /IMG_9282/ }).click()
  await expect(sheet.getByTestId('take-back')).toBeVisible()
  await expect(
    sheet.locator('img[src*="domain=traderepublic.com"]'),
  ).toBeVisible()
  await expect(sheet.locator('img[src*="domain=revolut.com"]')).toBeVisible()
  /* A person, a shop not in the list: letters. */
  await expect(sheet.getByText('TR', { exact: true })).toBeVisible()
  await expect(sheet.getByText('VE', { exact: true })).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('payee-logos-file'))
})
