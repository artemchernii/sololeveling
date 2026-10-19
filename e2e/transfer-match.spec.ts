import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* A transfer between two accounts, matched before saving (12 Oct,
   docs/specs/2026-10-11-transfer-match.md): the €700 top-up Revolut's
   file wrote and ActivoBank booked three days later; €505.20 sent to
   Trade Republic that arrived as €500.63. Canned readings on mock data —
   a model misread is not what these catch. */

const review = async (
  page: Page,
  as: 'added' | 'unnamed' | 'fee' | 'drop',
  name: string,
) => {
  await start(page)
  await testClient().mutation(anyApi.e2eTransfer.read, { as })
  await page.goto('/finances')
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText(name).first()).toBeVisible()
  return sheet
}
const apply = (sheet: ReturnType<Page['getByRole']>) =>
  sheet.getByRole('button', { name: /^apply/ })

test('the top-up another file wrote: already added, nothing asked, saved once', async ({
  page,
}) => {
  const sheet = await review(page, 'added', 'ActivoBank')
  const line = sheet.locator('[data-transfer="sure"]')
  await expect(line).toContainText('ActivoBank → Revolut')
  await expect(line).toContainText('already added')
  await expect(line).toContainText('in the app')
  await expect(line).toContainText('in this screenshot')
  await expect(sheet.getByText('2 new', { exact: true })).toBeVisible()
  await expect(sheet.getByText('1 transfer', { exact: true })).toBeVisible()
  await expect(sheet.getByText('as the screenshot shows')).toBeVisible()
  await expect(sheet.getByText('not saved')).toHaveCount(0)
  await expect(sheet.getByText('Is this the same')).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('transfer-already-added'))
  await apply(sheet).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(sheet.getByText('ActivoBank is up to date')).toBeVisible()
  await expect(sheet.getByText('€90.35').first()).toBeVisible()
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()
})

test('a line that names no account, the payment the app has: "same payment" adds nothing', async ({
  page,
}) => {
  const sheet = await review(page, 'unnamed', 'ActivoBank')
  const ask = sheet.locator('[data-transfer="ask"]')
  await expect(ask.getByText('Is this the same payment?')).toBeVisible()
  await expect(ask.getByText('Is this the same transfer?')).toHaveCount(0)
  await expect(ask.getByText('new, in this screenshot')).toBeVisible()
  await expect(ask.getByText('already in the app')).toBeVisible()
  await page.screenshot(shot('transfer-same-payment'))
  await ask.getByRole('button', { name: 'same payment' }).click()
  await expect(sheet.getByText('Same payment — already added.')).toBeVisible()
  await apply(sheet).click()
  await expect(sheet.getByText('ActivoBank is up to date')).toBeVisible()
  await expect(sheet.getByText('€90.35').first()).toBeVisible()
})

test('a fee less arrived: not saved until answered; "same transfer" saves one transfer and the fee', async ({
  page,
}) => {
  const sheet = await review(page, 'fee', 'Trade Republic')
  const ask = sheet.locator('[data-transfer="ask"]')
  await expect(ask.getByText('Is this the same transfer?')).toBeVisible()
  await expect(ask.getByText('−€505.20')).toBeVisible()
  await expect(ask.getByText('+€500.63')).toBeVisible()
  await expect(ask.getByText('already in the app')).toBeVisible()
  await expect(ask.getByText('new, in this statement')).toBeVisible()
  await expect(ask.getByText(/less arrived, 4 days apart\./)).toBeVisible()
  await expect(
    sheet.getByText(/Trade Republic not saved — 1 question open/),
  ).toBeVisible()
  await expect(apply(sheet)).toBeDisabled()
  await page.waitForTimeout(700)
  await page.screenshot(shot('transfer-fee-question'))

  await ask.getByRole('button', { name: /^same transfer/ }).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(
    sheet.getByText(/Same transfer — added once\. Fee/),
  ).toBeVisible()
  await expect(sheet.getByText(/saved as spending\./)).toBeVisible()
  await expect(sheet.getByText('as the statement shows')).toBeVisible()
  await expect(sheet.getByText('not saved', { exact: true })).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('transfer-fee-answered'))
  /* Taken back, it asks again. */
  await sheet.getByRole('button', { name: 'undo' }).click()
  await expect(ask.getByText('Is this the same transfer?')).toBeVisible()
  await ask.getByRole('button', { name: /^same transfer/ }).click()

  await apply(sheet).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(sheet.getByText('Trade Republic is up to date')).toBeVisible()
  await expect(sheet.getByText('€513.03').first()).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('transfer-fee-saved'))
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()
})

test('"not this one": the row is saved as the file shows it', async ({
  page,
}) => {
  const sheet = await review(page, 'fee', 'Trade Republic')
  await sheet.getByRole('button', { name: 'not this one' }).click()
  await expect(sheet.getByText(/Not the same transfer\./)).toBeVisible()
  await expect(sheet.getByText(/saved as money in\./)).toBeVisible()
  await expect(apply(sheet)).toBeEnabled()
})

test('both files in one drop: one transfer, nothing asked, both accounts save', async ({
  page,
}) => {
  const sheet = await review(page, 'drop', 'Revolut')
  await expect(sheet.locator('[data-transfer="sure"]')).toHaveCount(2)
  await expect(sheet.locator('[data-transfer="sure"]').first()).toContainText(
    'one transfer',
  )
  await expect(sheet.getByText('not saved')).toHaveCount(0)
  await expect(sheet.getByText(/Where did it go/)).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('transfer-one-drop'))
  await apply(sheet).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(sheet.getByText('€90.35').first()).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'done' })).toBeVisible()
})

test('phone width: the two rows stack, nothing scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const sheet = await review(page, 'fee', 'Trade Republic')
  await expect(sheet.getByText('Is this the same transfer?')).toBeVisible()
  await sheet.locator('[data-transfer="ask"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  await page.screenshot(shot('transfer-fee-phone'))
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)
})
