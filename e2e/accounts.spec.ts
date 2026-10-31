import { expect, test } from '@playwright/test'

import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

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

/* Revolut connected to its bank (12 Oct): hundreds of rows back past
   January. The sheet opens on the newest 60, the count and the check are
   over all of them, older rows come on a press, and a day of another year
   says its year. */
test('account sheet with many rows: 60 first, older on a press, the year on last year', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eUpdate.manyRows, { count: 400 })
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Open Revolut' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Coffee 1', { exact: true })).toBeVisible()
  await expect(sheet.getByText(/^40\d rows · /)).toBeVisible()
  const rows = sheet.locator('div.group')
  expect(await rows.count()).toBeLessThanOrEqual(60)
  /* The check is over rows that are not on screen. */
  await expect(sheet.getByTestId('no-row-warn')).toHaveCount(0)
  await expect(sheet.getByText('Coffee 200', { exact: true })).toHaveCount(0)
  await page.screenshot(shot('account-sheet-many'))

  const older = sheet.getByTestId('older-rows')
  await expect(older).toContainText(/older rows · 3\d\d more/)
  await older.click()
  await expect(sheet.getByText('Coffee 150', { exact: true })).toBeVisible()
  /* What was on screen stayed there while the older rows came. */
  await expect(sheet.getByText('Coffee 1', { exact: true })).toBeVisible()
  await older.click()
  await older.click()
  await expect(sheet.getByText('Coffee 400', { exact: true })).toBeVisible()
  await expect(older).toHaveCount(0)
  await expect(sheet.getByText(/No rows before/)).toBeVisible()
  /* A row of another year: its day says the year; this year's does not. */
  const lastYear = new Date().getFullYear() - 1
  await expect(
    sheet.getByText(new RegExp(`^\\w{3},? \\d+ \\w{3} ${lastYear}$`)).first(),
  ).toBeVisible()
  await sheet.getByText('Coffee 400', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot(shot('account-sheet-many-year'))
})
