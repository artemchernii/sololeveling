import { expect, test } from '@playwright/test'

import { revolutMetalsCsv, start } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Gold and silver (9 Oct): Revolut's commodity CSV has its euro account's
   columns, ounces in the amount. It lands as what he holds — never as
   euros of his own money arriving, asked about one row at a time. */
test('a commodity CSV lands as gold held at Revolut, with no money questions', async ({
  page,
}) => {
  const days = await start(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'account-statement_metals.csv',
      mimeType: 'text/csv',
      buffer: revolutMetalsCsv(days),
    },
  ])
  const sheet = page.getByRole('dialog')
  const apply = sheet.getByRole('button', { name: /apply 1 account/ })
  await expect(apply).toBeVisible()
  await expect(sheet.getByText(/Exchanged to/)).toHaveCount(0)
  await expect(sheet.getByText(/only you know/i)).toHaveCount(0)
  await expect(sheet.getByText(/1\s+position\b/)).toBeVisible()
  await page.screenshot({ ...shot('metals-review'), fullPage: true })
  await apply.click()
  await expect(sheet.getByText('Revolut updated')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot(shot('metals-landed'))
})

/* The same file through an account's own UPDATE opens the holdings check
   (10 Oct: he saw €0 total, "0.4084 sh", "1 positions" and "a screenshot
   doesn't say it" for a file — "it looks weird to me"). A file gives
   ounces and no worth: unknown is a dash, never €0. */
test('a commodity CSV in the holdings check: ounces, no €0, and it is a file', async ({
  page,
}) => {
  const days = await start(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: 'check-in' }).click()
  await page
    .getByRole('dialog')
    .locator('div', { hasText: /^Revolut/ })
    .getByRole('button', { name: 'update' })
    .first()
    .click()
  await page.getByRole('button', { name: 'statement or screenshot' }).click()
  await page.locator('input[type=file]').setInputFiles({
    name: 'account-statement_metals.csv',
    mimeType: 'text/csv',
    buffer: revolutMetalsCsv(days),
  })
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('no AI needed · $0')).toBeVisible()
  await expect(sheet.getByText(/0\.4084 oz/)).toBeVisible()
  await expect(sheet.getByText(/\b1 position\b/).first()).toBeVisible()
  await expect(sheet.getByText(/\b1 positions\b/)).toHaveCount(0)
  await expect(sheet.getByText('€0', { exact: true })).toHaveCount(0)
  await expect(sheet.getByText('worth is not in this file')).toBeVisible()
  await expect(sheet.getByText(/This file doesn.t say it/)).toBeVisible()
  await expect(sheet.getByText(/A screenshot doesn.t say it/)).toHaveCount(0)
  await page.screenshot({ ...shot('metals-check'), fullPage: true })
})
