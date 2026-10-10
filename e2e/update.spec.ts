import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anyApi } from 'convex/server'

import { bigRevolutCsv, revolutCsv, start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* The update window when things go wrong (10 Oct). Artem: "all scenarios,
   not only happy path … user journey shouldn't collapse for some stupid
   reason." Cases: docs/specs/2026-10-10-one-update.md. Mock data and
   canned readings only. */

const open = async (page: Page) => {
  await page.goto('/finances')
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  return page.getByRole('dialog')
}

/* One door (10 Oct, "why we have 2 buttons UPDATE ALL and ADD?"): files go
   in through ADD and nowhere else, one file or many. */
test('one button: update all is gone, and ADD shows what is waiting', async ({
  page,
}) => {
  await start(page)
  await page.goto('/finances')
  const add = page.getByRole('button', { name: 'add', exact: true }).first()
  await expect(add).toBeVisible()
  await expect(page.getByRole('button', { name: 'update all' })).toHaveCount(0)
  await expect(add.getByLabel('an update is waiting')).toHaveCount(0)

  await testClient().mutation(anyApi.e2eUpdate.holdRead, {})
  await expect(add.getByLabel('an update is waiting')).toBeVisible()
  /* It opens on what is waiting, not on an empty drop area. */
  await add.click()
  const sheet = page.getByRole('dialog', { name: 'add' })
  await expect(sheet.getByText('statement-sep.pdf')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('add-one-door-waiting'))
})

test('ADD opens as it always did: the drop area, your accounts, rows by hand', async ({
  page,
}) => {
  await start(page)
  const sheet = await open(page)
  await expect(sheet.getByText('Drop statements or screenshots')).toBeVisible()
  await expect(sheet.getByText('lands on the account')).toBeVisible()
  await expect(sheet.getByText('Revolut').first()).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'money in' })).toBeVisible()
  await page.waitForTimeout(900)
  await page.screenshot(shot('add-one-door'))
})

test('a wrong kind of file is named, and nothing starts', async ({ page }) => {
  await start(page)
  const sheet = await open(page)
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'notes.docx',
      mimeType: 'application/msword',
      buffer: Buffer.from('x'),
    },
  ])
  await expect(
    sheet.getByText('notes.docx is not a PDF, a CSV or a screenshot.'),
  ).toBeVisible()
  await expect(sheet.getByText('Drop statements or screenshots')).toBeVisible()
  await expect(page.getByLabel('an update is waiting')).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('update-wrong-file'))
})

test('the same statement twice: the second time there is nothing to save', async ({
  page,
}) => {
  const days = await start(page)
  const file = {
    name: 'revolut.csv',
    mimeType: 'text/csv',
    buffer: revolutCsv(days),
  }
  const sheet = await open(page)
  await page.locator('input[type=file]').setInputFiles([file])
  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText('2 movements added')).toBeVisible()
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  await page.locator('input[type=file]').setInputFiles([file])
  await expect(
    sheet.getByText(
      'Everything in this file is already in. There is nothing to save.',
    ),
  ).toBeVisible()
  await expect(sheet.getByRole('button', { name: /apply/ })).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('update-same-file-again'))
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByLabel('an update is waiting')).toHaveCount(0)
})

/* Artem, 10 Oct: "One starts Sep 1 till Sep 15. Second starts Sep 1 till
   Sep 30. I upload 2nd and it should understand that we do not duplicate
   what we already have uploaded." */
test('a longer statement over a shorter one: only the new days are added', async ({
  page,
}) => {
  const days = await start(page)
  const sheet = await open(page)
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'revolut-short.csv',
      mimeType: 'text/csv',
      buffer: revolutCsv(days),
    },
  ])
  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText('2 movements added')).toBeVisible()
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'revolut-long.csv',
      mimeType: 'text/csv',
      buffer: revolutCsv(days, 3),
    },
  ])
  await expect(sheet.getByText('3 new rows')).toBeVisible()
  await expect(sheet.getByText('5 already had')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('update-longer-statement'))
  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText('3 movements added')).toBeVisible()
  await sheet.getByRole('button', { name: 'done' }).click()

  /* And the whole of it once more: nothing left to add. */
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'revolut-long.csv',
      mimeType: 'text/csv',
      buffer: revolutCsv(days, 3),
    },
  ])
  await expect(
    sheet.getByText(/is already in\. There is nothing to save\./),
  ).toBeVisible()
})

test('reading: it shows at once, closing asks first, and leaving loses nothing', async ({
  page,
}) => {
  await start(page)
  await testClient().mutation(anyApi.e2eUpdate.holdRead, {})
  const sheet = await open(page)
  await expect(sheet.getByText('of 1 files read')).toBeVisible()
  await expect(sheet.getByText('statement-sep.pdf')).toBeVisible()

  /* Escape, the ✕ and a click outside all ask. */
  const ask = page.getByRole('alertdialog', { name: 'Still reading' })
  await page.keyboard.press('Escape')
  await expect(ask).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('update-close-asks'))
  await ask.getByRole('button', { name: 'keep it open' }).click()
  await expect(ask).toBeHidden()
  await expect(sheet.getByText('statement-sep.pdf')).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'keep it open' }).click()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await ask.getByRole('button', { name: 'close it' }).click()
  await expect(sheet).toBeHidden()

  /* Gone from sight, not lost: the button says so, a reload too. */
  await expect(page.getByLabel('an update is waiting')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  await expect(sheet.getByText('statement-sep.pdf')).toBeVisible()
})

/* The look agreed on the mockup (design/treasury-mockup/update.html): one
   line per file, each the same height whatever it says, so nothing shifts
   while files are read. */
test('reading: one line per file, each the same height, with whose it is', async ({
  page,
}) => {
  const days = await start(page)
  const batchId = await testClient().mutation(anyApi.e2e.readHistory, { days })
  await testClient().mutation(anyApi.e2eUpdate.holdRead, { batchId })
  const sheet = await open(page)
  await expect(sheet.getByText('of 2 files read')).toBeVisible()
  const read = sheet
    .getByTestId('file-line')
    .filter({ hasText: 'trading-account.csv' })
  const reading = sheet
    .getByTestId('file-line')
    .filter({ hasText: 'statement-sep.pdf' })
  await expect(read.getByText('31 trades')).toBeVisible()
  await expect(read.getByText('Revolut')).toBeVisible()
  await expect(reading.getByText(/reading rows · 12/)).toBeVisible()
  const a = await read.boundingBox()
  const b = await reading.boundingBox()
  expect(Math.round(a!.height)).toBe(Math.round(b!.height))
  await page.waitForTimeout(700)
  await page.screenshot(shot('update-reading-lines'))

  /* The read line holds its place and height when the other one ends. */
  await testClient().mutation(anyApi.e2eUpdate.failRead, { batchId })
  await expect(
    sheet.getByRole('button', { name: /apply 1 account/ }),
  ).toBeVisible()
})

test('every file bad: it says so, per file, and nothing is saved', async ({
  page,
}) => {
  await start(page)
  const batchId = await testClient().mutation(anyApi.e2eUpdate.holdRead, {})
  const sheet = await open(page)
  await expect(sheet.getByText('statement-sep.pdf')).toBeVisible()
  await testClient().mutation(anyApi.e2eUpdate.failRead, { batchId })
  await expect(sheet.getByText('None of these could be read')).toBeVisible()
  await expect(sheet.getByText('statement-sep.pdf')).toBeVisible()
  await expect(
    sheet.getByText('The picture is too blurry to read the numbers.'),
  ).toBeVisible()
  await expect(sheet.getByText('Nothing was saved.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: /apply/ })).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot(shot('update-all-bad'))
})

test('one file bad: it is named with its reason, the rest still applies', async ({
  page,
}) => {
  const days = await start(page)
  const batchId = await testClient().mutation(anyApi.e2e.readHistory, { days })
  await testClient().mutation(anyApi.e2eUpdate.badFile, { batchId })
  const sheet = await open(page)
  await expect(sheet.getByText('blurry.png')).toBeVisible()
  await expect(
    sheet.getByText('The picture is too blurry to read the numbers.'),
  ).toBeVisible()
  await page.screenshot({ ...shot('update-one-bad'), fullPage: true })
  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText('Revolut updated')).toBeVisible()
})

test('a big file: saving shows at once, and the landing says what came in', async ({
  page,
}) => {
  const days = await start(page)
  const sheet = await open(page)
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'revolut-year.csv',
      mimeType: 'text/csv',
      buffer: bigRevolutCsv(days, 150),
    },
  ])
  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(sheet.getByText('Revolut is up to date')).toBeVisible()
  await expect(sheet.getByText('150 movements added')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot(shot('update-big-landed'))
})

test('a save that stopped: it says so, closing asks, and finishing lands it once', async ({
  page,
}) => {
  const days = await start(page)
  await testClient().mutation(anyApi.e2eUpdate.stuckApply, { days })
  const sheet = await open(page)
  await expect(sheet.getByText('saving…')).toBeVisible()
  /* A row per bank: its logo, its name, how far it is. */
  const bank = sheet.getByTestId('bank-row').filter({ hasText: 'Revolut' })
  await expect(bank.getByTestId('bank-logo')).toBeVisible()
  await expect(bank.getByText('saving')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('update-saving-rows'))
  const ask = page.getByRole('alertdialog', { name: 'Still saving' })
  await page.keyboard.press('Escape')
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'keep it open' }).click()

  await expect(sheet.getByText('The save stopped before the end')).toBeVisible({
    timeout: 20_000,
  })
  await expect(bank.getByText('not finished')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('update-save-stopped'))
  await sheet.getByRole('button', { name: 'finish saving' }).click()
  await expect(sheet.getByText('Revolut updated')).toBeVisible()
  await expect(sheet.getByText(/^31 trades added · /)).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot(shot('update-save-finished'))
})
