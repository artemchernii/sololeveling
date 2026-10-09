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
  await page.getByRole('button', { name: 'update all' }).click()
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
