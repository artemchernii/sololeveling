import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* The account sheet: is the balance right (11 Oct, docs/specs/2026-10-11-
   account-sheet-check.md). His Trade Republic as it stood: two balances a
   week apart, €500.63 more in the later one and no row between; in
   `found`, ActivoBank's file shows €505.20 sent to it. Mock data only. */

const open = async (page: Page, as: 'found' | 'none') => {
  await start(page)
  await testClient().mutation(anyApi.e2eUpdate.sheetGap, { as })
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  await page.getByRole('button', { name: 'Open Trade Republic' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('€500.63 came in with no row')).toBeVisible()
  await expect(sheet.getByText('€500.63 has no row')).toBeVisible()
  /* The sums written out are gone. */
  await expect(sheet.getByText(/that no row shows|It adds up| = /)).toHaveCount(
    0,
  )
  return sheet
}

test('the same money is in ActivoBank: one press adds the transfer and its fee, undo takes it back', async ({
  page,
}) => {
  const sheet = await open(page, 'found')
  await expect(sheet.getByText('Is it this transfer?')).toBeVisible()
  await expect(sheet.getByText('ActivoBank → Trade Republic')).toBeVisible()
  await expect(sheet.getByText('€4.57 less arrived — a fee')).toBeVisible()
  await expect(sheet.getByText('€505.20', { exact: true })).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('sheet-check-found'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await page.screenshot(shot('sheet-check-found-phone'))
  await page.setViewportSize({ width: 1280, height: 720 })

  await sheet.getByRole('button', { name: 'same transfer, €4.57 fee' }).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(
    sheet.getByText('Transfer from ActivoBank added. Fee €4.57.'),
  ).toBeVisible()
  await expect(sheet.getByText(/rows match · since/)).toBeVisible()
  await expect(sheet.getByText('came in with no row')).toHaveCount(0)
  await expect(sheet.getByText('+€505.20')).toBeVisible()
  await expect(sheet.getByText('−€4.57')).toBeVisible()
  await expect(sheet.getByText('Transfer fee')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('sheet-check-added'))

  await sheet.getByRole('button', { name: 'undo' }).click()
  await expect(sheet.getByText('Is it this transfer?')).toBeVisible()
  await expect(sheet.getByText('Transfer from ActivoBank added.')).toHaveCount(
    0,
  )
  await expect(sheet.getByText('Transfer fee')).toHaveCount(0)
})

test('"not this one": the day to add it on, instead', async ({ page }) => {
  const sheet = await open(page, 'found')
  await sheet.getByRole('button', { name: 'not this one' }).click()
  await expect(sheet.getByText('Is it this transfer?')).toHaveCount(0)
  await expect(
    sheet.getByRole('button', { name: /^add \+€500\.63 on / }),
  ).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'drop a file' })).toBeVisible()
})

test('no account shows it: pick the day, add — saving, then the rows match', async ({
  page,
}) => {
  const sheet = await open(page, 'none')
  await expect(sheet.getByText('Is it this transfer?')).toHaveCount(0)
  await expect(sheet.getByText('no row', { exact: true })).toBeVisible()
  const days = sheet.locator('button[aria-pressed]')
  await expect(days).toHaveCount(7)
  await days.nth(2).click()
  await expect(days.nth(2)).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(700)
  await page.screenshot(shot('sheet-check-none'))

  await sheet.getByRole('button', { name: /^add \+€500\.63 on / }).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(sheet.getByText(/rows match · since/)).toBeVisible()
  await expect(sheet.getByText('came in with no row')).toHaveCount(0)
  await expect(sheet.getByText('no row', { exact: true })).toHaveCount(0)
  await expect(sheet.getByText('Missing from the file')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('sheet-check-right'))
})

test('one balance only: nothing to check yet, and no tick', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Open ActivoBank' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText(/One balance so far/)).toBeVisible()
  await expect(sheet.getByText('free cash · EUR')).toBeVisible()
  await expect(sheet.getByText(/rows match/)).toHaveCount(0)
})
