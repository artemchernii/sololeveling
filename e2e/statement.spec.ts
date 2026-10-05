import { expect, test } from '@playwright/test'

import { revolutCsv, start } from './helpers'

/* What broke on 5 Oct, pressed the way he presses it — on mock data. */

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

test('check-in names what is old', async ({ page }) => {
  await start(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: 'check-in' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Revolut')).toBeVisible()
  /* Two pockets: the words name the old one. */
  await expect(sheet.getByText(/Its EUR balance is from/)).toBeVisible()
  await page.screenshot(shot('check-in'))
})

test('a Revolut CSV: read, checked, added — and it lands', async ({ page }) => {
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
    name: 'account-statement.csv',
    mimeType: 'text/csv',
    buffer: revolutCsv(days),
  })

  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('2 new payments')).toBeVisible()
  await expect(
    sheet.getByText('The other 3 rows you already have.', { exact: false }),
  ).toBeVisible()
  await expect(sheet.getByText(/^csv$/i)).toBeVisible()
  await expect(sheet.getByText('no AI needed · $0')).toBeVisible()
  await expect(sheet.getByText('18:42')).toBeVisible()
  await expect(sheet.getByText(/USD .* kept as is/)).toBeVisible()
  await page.screenshot({ ...shot('check-it'), fullPage: true })

  const add = sheet.getByRole('button', {
    name: 'add 2 payments and the balance',
  })
  await add.click()
  await expect(sheet.getByText('2 payments added')).toBeVisible()
  await expect(sheet.getByText(/kept as is, not in this file/)).toBeVisible()
  await page.screenshot(shot('landed'))
  await sheet.getByRole('button', { name: 'done' }).click()

  /* Revolut — EUR and USD — is no longer out of date. */
  await page.getByRole('button', { name: 'check-in' }).click()
  await expect(page.getByRole('dialog').getByText('Revolut')).toHaveCount(0)
})

test('"still the same": saving, saved, up to date, closed', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: 'check-in' }).click()
  await page
    .getByRole('dialog')
    .locator('div', { hasText: /^Cash/ })
    .getByRole('button', { name: 'update' })
    .first()
    .click()
  const sheet = page.getByRole('dialog')
  const same = sheet.getByRole('button', { name: /still the same/ })
  await expect(same).toHaveCount(1)
  await same.click()
  await expect(sheet.getByText('Cash is up to date')).toBeVisible()
  await page.screenshot(shot('still-the-same'))
  await expect(sheet).toHaveCount(0, { timeout: 5_000 })
})
