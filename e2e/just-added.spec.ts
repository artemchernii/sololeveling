import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Just added (14 Oct, mockup just-added.html, docs/specs/2026-10-14-
   just-added.md): the gold buys saved from ADD BUYS sit on top of
   Revolut's sheet and of Gold's page, to open or remove. Mock data only. */
async function savedGold(page: Page) {
  await start(page)
  await testClient().mutation(anyApi.e2ePortfolio.goldBuys, {})
  await page.goto('/finances?room=portfolio')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  await page
    .getByTestId('owned-row')
    .filter({ hasText: 'Gold' })
    .getByRole('link')
    .click()
  const position = page.getByTestId('position-page')
  /* Nothing saved yet: no strip. */
  await expect(position.getByTestId('just-added')).toHaveCount(0)
  await position.getByRole('button', { name: 'add buys' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /apply/ }).click()
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()
  return position
}

test('just added: the saved buys on Gold, removed in one press', async ({
  page,
}) => {
  const position = await savedGold(page)
  const strip = position.getByTestId('just-added')
  const file = strip.getByTestId('just-file')
  await expect(file).toHaveCount(1)
  await expect(file).toContainText('gold.png')
  await expect(file).toContainText(/added today/)
  await expect(file).toContainText('4 buy')
  await expect(file.getByRole('button', { name: 'open ›' })).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ ...shot('just-added-gold'), fullPage: true })

  /* REMOVE: each buy that goes, and the buy total before → after. */
  await file.getByRole('button', { name: 'remove' }).click()
  const ask = strip.getByTestId('just-ask')
  await expect(ask.getByText('goes')).toHaveCount(4)
  await expect(ask).toContainText('Gold · buy total')
  await expect(ask).toContainText('4 buy → 0')
  await page.waitForTimeout(500)
  await page.screenshot({ ...shot('just-added-remove'), fullPage: true })

  /* Pressed: "removing…" at once, then the landed line, buys gone. */
  await ask.getByRole('button', { name: 'remove' }).click()
  await expect(ask.getByText('removing…')).toBeVisible()
  const landed = strip.getByTestId('just-removed')
  await expect(landed).toContainText('−4 buy')
  await expect(landed).toContainText('removed')
  await expect(strip.getByTestId('just-file')).toHaveCount(0)
  await expect(position.getByText('buys and sells · 4')).toHaveCount(0)
  await page.screenshot({ ...shot('just-added-removed'), fullPage: true })
})

test("just added: on Revolut's sheet, with its BANK and BROKER badges", async ({
  page,
}) => {
  await savedGold(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Open Revolut' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('bank', { exact: true })).toBeVisible()
  await expect(sheet.getByText('broker', { exact: true })).toBeVisible()
  const file = sheet.getByTestId('just-file')
  await expect(file).toHaveCount(1)
  await expect(file).toContainText('4 buy')
  await page.waitForTimeout(1500)
  await page.screenshot({ ...shot('just-added-account'), fullPage: true })

  /* OPEN: the built file view. */
  await file.getByRole('button', { name: 'open ›' }).click()
  await expect(sheet.getByTestId('take-back')).toBeVisible()

  /* Phone width. */
  await page.setViewportSize({ width: 390, height: 844 })
  await sheet.getByRole('button', { name: 'Back' }).first().click()
  await expect(sheet.getByTestId('just-file')).toBeVisible()
  await page.screenshot({ ...shot('just-added-phone'), fullPage: true })
})
