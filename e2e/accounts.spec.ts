import { expect, test } from '@playwright/test'

import { start } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

test('add an account: pick the bank, its balance, and it lands', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: 'account', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Find a bank or broker').fill('Trading')
  await sheet
    .getByRole('button', { name: /Trading 212/ })
    .first()
    .click()
  await sheet.getByLabel('Trading 212 EUR now').fill('500')
  await page.screenshot(shot('add-account'))
  await sheet.getByRole('button', { name: 'add Trading 212' }).click()
  await expect(sheet.getByText('Trading 212 added')).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot(shot('account-added'))
  await expect(sheet).toHaveCount(0, { timeout: 5_000 })
  await expect(
    page.getByRole('button', { name: 'Open Trading 212' }),
  ).toBeVisible()
})

/* The account sheet (5 Oct): open Revolut, its rows are there, and a typed
   row deleted says so at once, then is gone. */
test('account sheet: a typed row deleted — deleting, then gone', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Open Revolut' }).click()
  const sheet = page.getByRole('dialog')
  for (const name of ['Guacamole', 'Bolt', 'Continente'])
    await expect(sheet.getByText(name).first()).toBeVisible()
  await page.screenshot(shot('account-sheet'))

  const bolt = sheet.locator('div.group', { hasText: 'Bolt' })
  await bolt.hover()
  await bolt.getByRole('button', { name: 'delete' }).click()
  await expect(bolt.getByText('deleting')).toBeVisible()
  await expect(sheet.getByText('Bolt')).toHaveCount(0)
  await expect(sheet.getByText('Guacamole').first()).toBeVisible()
  await page.screenshot(shot('account-row-deleted'))
})
