import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* 5 Oct: "add to Revolut … WE STUCK AND IT LOOKED FROZEN". A canned
   reading of a Revolut crypto statement — no paid reader. */
test('crypto statement: add to Revolut answers at once, then lands', async ({
  page,
}) => {
  const days = await start(page)
  await testClient().mutation(anyApi.e2e.readCrypto, { days })
  await page.goto('/finances')
  await page.getByText('Revolut crypto statement').first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText(/coins you hold/)).toBeVisible()
  await page.screenshot({ ...shot('crypto-check'), fullPage: true })
  await sheet.getByRole('button', { name: /add to Revolut/ }).click()
  await expect(
    sheet.getByText(/adding|Revolut (is up to date|updated)/),
  ).toBeVisible()
  await expect(sheet.getByText('Revolut is up to date')).toBeVisible()
  await expect(sheet.getByText('still the same')).toHaveCount(0)
  await expect(sheet.getByText('5 trades added')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot(shot('crypto-landed'))
})
