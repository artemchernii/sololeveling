import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Check before saving (11 Oct, docs/specs/2026-10-11-check-before-saving.md):
   his ActivoBank screenshot, read and waiting. Before apply the account
   says was · out · in · now; when that is not the balance the screenshot
   prints, nothing of it is saved until he answers. Canned readings on mock
   data — a model misread is not what these catch. */

const review = async (page: Page, as: 'yours' | 'twice' | 'missing') => {
  await start(page)
  await testClient().mutation(anyApi.e2eUpdate.readActivo, { as })
  await page.goto('/finances')
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('ActivoBank').first()).toBeVisible()
  return sheet
}
const apply = (sheet: ReturnType<Page['getByRole']>) =>
  sheet.getByRole('button', { name: /^apply/ })

test('his screenshot adds up: one press, and the pending row is not taken off twice', async ({
  page,
}) => {
  const sheet = await review(page, 'yours')
  await expect(sheet.getByText('as the screenshot shows')).toBeVisible()
  await expect(sheet.getByText('2 new', { exact: true })).toBeVisible()
  await expect(sheet.getByText('1 was pending')).toBeVisible()
  await expect(sheet.getByText('1 already added')).toBeVisible()
  await expect(sheet.getByText(/was pending on/)).toBeVisible()
  await expect(sheet.getByText('not saved')).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('check-adds-up'))
  await apply(sheet).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(sheet.getByText('ActivoBank is up to date')).toBeVisible()
  await expect(sheet.getByText('€90.35').first()).toBeVisible()
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()
})

test('one row too many: not saved until answered; "same payment" adds it once', async ({
  page,
}) => {
  const sheet = await review(page, 'twice')
  await expect(sheet.getByText('not saved', { exact: true })).toBeVisible()
  await expect(sheet.getByText('Is this the same payment?')).toBeVisible()
  await expect(sheet.getByText('screenshot shows €90.35')).toBeVisible()
  await expect(sheet.getByText('Top-up by *2789')).toBeVisible()
  await expect(
    sheet.getByText(/ActivoBank not saved — 1 question open/),
  ).toBeVisible()
  await expect(apply(sheet)).toBeDisabled()
  await page.waitForTimeout(700)
  await page.screenshot(shot('check-same-payment'))

  await sheet.getByRole('button', { name: 'same payment' }).click()
  await expect(sheet.getByText('Same payment — added once.')).toBeVisible()
  await expect(sheet.getByText('as the screenshot shows')).toBeVisible()
  await expect(sheet.getByText('not saved', { exact: true })).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('check-same-payment-answered'))
  /* Taken back, it asks again. */
  await sheet.getByRole('button', { name: 'undo' }).click()
  await expect(sheet.getByText('Is this the same payment?')).toBeVisible()
  await sheet.getByRole('button', { name: 'same payment' }).click()

  await apply(sheet).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(sheet.getByText('ActivoBank is up to date')).toBeVisible()
  await expect(sheet.getByText('€90.35').first()).toBeVisible()
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()
})

test('"two payments": both rows are saved', async ({ page }) => {
  const sheet = await review(page, 'twice')
  await sheet.getByRole('button', { name: 'two payments' }).click()
  await expect(sheet.getByText('Two payments.')).toBeVisible()
  await expect(sheet.getByText('2 was pending')).toBeVisible()
  await expect(apply(sheet)).toBeEnabled()
})

test('no row explains it: save with the screenshot’s balance, or skip the account', async ({
  page,
}) => {
  const sheet = await review(page, 'missing')
  await expect(sheet.getByText(/went out with no row\./)).toBeVisible()
  await expect(apply(sheet)).toBeDisabled()
  await page.waitForTimeout(700)
  await page.screenshot(shot('check-no-row'))
  await sheet.getByRole('button', { name: /save with balance/ }).click()
  await expect(sheet.getByText(/as the screenshot shows\.$/)).toBeVisible()
  await expect(apply(sheet)).toBeEnabled()
  await page.waitForTimeout(700)
  await page.screenshot(shot('check-no-row-saved'))
  await sheet.getByRole('button', { name: 'undo' }).click()
  await sheet.getByRole('button', { name: 'skip ActivoBank' }).click()
  await expect(sheet.getByText('left out · undo')).toBeVisible()
})

test('phone width: the four numbers fold to two rows, nothing scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const sheet = await review(page, 'twice')
  await expect(sheet.getByText('Is this the same payment?')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.waitForTimeout(700)
  await page.screenshot(shot('check-phone'))
})
