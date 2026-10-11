import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* A trading history against the shares in the account (11 Oct,
   docs/specs/2026-10-11-stocks-check.md): the canned history adds up to
   20 Apple and 5 Microsoft; the screenshot shows the same, or 6
   Microsoft. Mock data only. */

const open = async (page: Page, as: 'same' | 'fewer') => {
  const days = await start(page)
  await testClient().mutation(anyApi.e2eUpdate.sharesScreen, { as })
  await testClient().mutation(anyApi.e2e.readHistory, { days })
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  return page.getByRole('dialog')
}

test('the same shares in the file and in the account: one press saves it all', async ({
  page,
}) => {
  const sheet = await open(page, 'same')
  await expect(
    sheet.getByText(
      'All 2 companies: same shares in the file and in the account.',
    ),
  ).toBeVisible()
  await expect(sheet.getByText('shares are right')).toBeVisible()
  await expect(sheet.getByText('31 to save')).toBeVisible()
  await expect(sheet.getByTestId('shares-differ')).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('shares-check-same'), fullPage: true })
  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText(/Writing|updated/).first()).toBeVisible()
  await expect(sheet.getByText('Revolut updated')).toBeVisible()
  await expect(sheet.getByText(/^31 trades added · /)).toBeVisible()
})

test('one company differs: it is asked, each answer lands and undoes, and it is not saved', async ({
  page,
}) => {
  const sheet = await open(page, 'fewer')
  const box = sheet.getByTestId('shares-differ')
  await expect(
    box.getByText('Microsoft: 5 shares in the file, 6 in the account.'),
  ).toBeVisible()
  await expect(box.getByText(/A buy is missing from the file\./)).toBeVisible()
  await expect(box.getByText('in the file', { exact: true })).toBeVisible()
  await expect(box.getByText('in the account', { exact: true })).toBeVisible()
  await expect(box.getByText('bought 10 times, never sold')).toBeVisible()
  await expect(sheet.getByText('21 to save')).toBeVisible()
  await expect(sheet.getByText('10 Microsoft not saved')).toBeVisible()
  await expect(
    sheet.getByText(
      'The other company: same shares in the file and in the account.',
    ),
  ).toBeVisible()
  await expect(
    sheet.getByText('Microsoft not saved — 1 question open.'),
  ).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('shares-check-differs'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await page.screenshot(shot('shares-check-differs-phone'))
  await page.setViewportSize({ width: 1280, height: 720 })

  await box.getByRole('button', { name: 'save Microsoft anyway' }).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(
    sheet.getByText(/Microsoft saved as the file says\./),
  ).toBeVisible()
  await expect(sheet.getByText('31 to save')).toBeVisible()
  await sheet.getByRole('button', { name: 'undo' }).click()
  await expect(box).toBeVisible()

  await box.getByRole('button', { name: 'do not save Microsoft' }).click()
  await expect(
    sheet.getByText(/Microsoft not saved\. Still 6 shares in the account\./),
  ).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('shares-check-answered'), fullPage: true })

  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText(/Writing|updated/).first()).toBeVisible()
  await expect(sheet.getByText('Revolut updated')).toBeVisible()
  await expect(sheet.getByText(/^21 trades added · /)).toBeVisible()
  await page.waitForTimeout(900)
  await page.screenshot(shot('shares-check-landed'))
})
