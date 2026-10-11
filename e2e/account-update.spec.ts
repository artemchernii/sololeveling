import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anyApi } from 'convex/server'

import { revolutCsv, start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* UPDATE on one account opens the window ADD opens, named for that
   account (11 Oct; docs/specs/2026-10-10-one-update.md, piece 3b; mockup
   design/treasury-mockup/update-account.html). Mock data only. */

const card = (page: Page, name: string) =>
  page.getByRole('button', { name: `Open ${name}` })

async function update(page: Page, name: string) {
  await page.goto('/finances')
  await card(page, name).getByRole('button', { name: 'update' }).click()
  return page.getByRole('dialog', { name: `update · ${name}` })
}

test('UPDATE on a card: the drop area named for it, the numbers under it, no tabs', async ({
  page,
}) => {
  await start(page)
  const sheet = await update(page, 'Revolut')
  await expect(
    sheet.getByText('Drop a Revolut statement or screenshot'),
  ).toBeVisible()
  await expect(sheet.getByText('lands on the account')).toBeVisible()
  await expect(sheet.getByText('or type what is in it now')).toBeVisible()
  await expect(sheet.getByLabel('Revolut EUR')).toBeVisible()
  await expect(sheet.getByLabel('Revolut USD')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'type it' })).toHaveCount(0)
  /* Only this account: no other account to tap, no rows by hand. */
  await expect(sheet.getByText('ActivoBank')).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'money in' })).toHaveCount(0)
  /* The steps are in the drop area until a file is in. */
  await expect(sheet.getByTestId('steps')).toHaveCount(0)
  await page.waitForTimeout(900)
  await page.screenshot(shot('account-update-open'))
})

test('a file from UPDATE: the steps in the header, checked, saving…, landed, closed', async ({
  page,
}) => {
  const days = await start(page)
  const sheet = await update(page, 'Revolut')
  const before = (await sheet.boundingBox())!.height
  await page.locator('input[type=file]').setInputFiles({
    name: 'account-statement.csv',
    mimeType: 'text/csv',
    buffer: revolutCsv(days),
  })
  /* The many-files check, not the old one-file one. */
  const apply = sheet.getByRole('button', { name: /apply 1 account/ })
  await expect(apply).toBeVisible()
  await expect(sheet.getByText('2 new', { exact: true })).toBeVisible()
  await expect(sheet.getByText('3 already added')).toBeVisible()
  await expect(sheet.getByText('as the statement shows')).toBeVisible()
  await expect(
    sheet.getByText('Nothing is saved until apply is pressed.'),
  ).toBeVisible()
  const steps = sheet.getByTestId('steps')
  await expect(steps.locator('[aria-current=step]')).toHaveText('you check')
  await page.waitForTimeout(700)
  await page.screenshot(shot('account-update-check'))
  /* The window took the check's height, and holds it. */
  const checked = (await sheet.boundingBox())!.height
  expect(Math.abs(checked - before)).toBeGreaterThan(1)
  await page.waitForTimeout(300)
  expect((await sheet.boundingBox())!.height).toBe(checked)

  await apply.click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(sheet.getByText('Revolut is up to date')).toBeVisible()
  await expect(sheet.getByText('2 movements added')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot(shot('account-update-landed'))
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()
})

test('a typed number: saving, up to date, and it closes by itself', async ({
  page,
}) => {
  await start(page)
  const sheet = await update(page, 'Revolut')
  await sheet.getByLabel('Revolut EUR').fill('846.22')
  await sheet.getByRole('button', { name: 'save', exact: true }).click()
  await expect(sheet.getByText('saving')).toBeVisible()
  await expect(sheet.getByText('Revolut is up to date')).toBeVisible()
  /* Landed is the tick alone: the drop area is gone with the fields. */
  await expect(sheet.getByText(/Drop a Revolut/)).toHaveCount(0)
  await page.screenshot(shot('account-update-typed'))
  await expect(sheet).toHaveCount(0, { timeout: 5_000 })
  await expect(card(page, 'Revolut').getByText('€846.22')).toBeVisible()
})

test('cash has no statement: only the number', async ({ page }) => {
  await start(page)
  const sheet = await update(page, 'Cash')
  await expect(sheet.getByLabel('Cash EUR')).toBeVisible()
  await expect(sheet.getByText(/Drop a/)).toHaveCount(0)
  await expect(sheet.getByText('or type what is in it now')).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('account-update-cash'))
})

test('a connected bank: free cash is from the bank, nothing to type', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eBank.reachable, {})
  await page.goto('/finances')
  await card(page, 'ActivoBank').getByRole('button', { name: 'connect' }).click()
  const bank = page.getByRole('dialog')
  await bank.getByRole('button', { name: /continue at ActivoBank/ }).click()
  await expect(bank.getByText('ActivoBank is connected')).toBeVisible()
  await bank.getByRole('button', { name: 'Close' }).click()
  /* Its card has no UPDATE; its sheet does, for a statement's rows. */
  await card(page, 'ActivoBank').click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'update' })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: 'update · ActivoBank' })
  await expect(
    sheet.getByText('Drop a ActivoBank statement or screenshot'),
  ).toBeVisible()
  await expect(sheet.getByTestId('from-bank')).toContainText('€727.49')
  await expect(sheet.getByTestId('from-bank')).toContainText('from the bank')
  await expect(sheet.getByLabel('ActivoBank EUR')).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'save' })).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('account-update-connected'))
})

test('an update still being read: UPDATE opens on it, closing asks, Overview has no strip', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eUpdate.holdRead, {})
  const sheet = await update(page, 'Revolut')
  await expect(sheet.getByText('of 1 file read')).toBeVisible()
  await expect(
    sheet.getByText(
      'Closing does not stop the reading. It opens again from ADD.',
    ),
  ).toBeVisible()
  await expect(
    sheet.getByTestId('steps').locator('[aria-current=step]'),
  ).toHaveText('read')
  await page.keyboard.press('Escape')
  const ask = page.getByRole('alertdialog', { name: 'Still reading' })
  await expect(
    ask.getByText(
      'Closing does not stop the reading. ADD shows a dot and opens here again.',
    ),
  ).toBeVisible()
  await ask.getByRole('button', { name: 'close it' }).click()
  await expect(sheet).toBeHidden()
  /* The dot on ADD is the one sign of it. */
  await expect(page.getByLabel('an update is waiting')).toBeVisible()
  await expect(page.getByText('statement-sep.pdf')).toHaveCount(0)
})

test('phone width: the window fits, the steps take their own line', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const days = await start(page)
  await page.goto('/finances')
  await page.getByRole('button', { name: /check-in/ }).click()
  await page
    .getByRole('dialog')
    .locator('div', { hasText: /^Revolut/ })
    .getByRole('button', { name: 'update' })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: 'update · Revolut' })
  await expect(sheet.getByLabel('Revolut EUR')).toBeVisible()
  await page.waitForTimeout(900)
  await page.screenshot(shot('account-update-phone'))
  await page.locator('input[type=file]').setInputFiles({
    name: 'account-statement.csv',
    mimeType: 'text/csv',
    buffer: revolutCsv(days),
  })
  await expect(
    sheet.getByRole('button', { name: /apply 1 account/ }),
  ).toBeVisible()
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(wide).toBe(false)
  const steps = (await sheet.getByTestId('steps').boundingBox())!
  const close = (await sheet
    .getByRole('button', { name: 'Close' })
    .boundingBox())!
  expect(steps.y).toBeGreaterThan(close.y + close.height - 1)
  await page.waitForTimeout(700)
  await page.screenshot(shot('account-update-check-phone'))
})
