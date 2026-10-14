import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Take a file back (11 Oct, docs/specs/2026-10-11-undo-file.md): his
   ActivoBank as it stood — €153.21 read on 3 Oct, then the screenshot
   IMG_9282 saved, €90.35. Taken back from the opened file, and from the
   card the save lands on. Mock data only. */

const save = async (page: Page) => {
  await start(page)
  await testClient().mutation(anyApi.e2eUpdate.readActivo, { as: 'yours' })
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /^apply/ }).click()
  await expect(sheet.getByText('ActivoBank is up to date')).toBeVisible()
  return sheet
}

test('the opened file says what goes, one press takes it back, the account is €153.21 again', async ({
  page,
}) => {
  const landed = await save(page)
  await landed.getByRole('button', { name: 'done' }).click()
  await expect(landed).toBeHidden()

  await page.getByRole('button', { name: 'Open ActivoBank' }).click()
  const sheet = page.getByRole('dialog')
  await sheet
    .getByRole('button', { name: /IMG_9282/ })
    .last()
    .click()
  const box = sheet.getByTestId('take-back')
  await expect(
    box.getByText(/3 rows and the balance of \d+ Oct go\./),
  ).toBeVisible()
  await expect(box.getByText('ActivoBank now')).toBeVisible()
  await expect(box.getByText('€90.35')).toBeVisible()
  await expect(box.getByText('€153.21')).toBeVisible()
  await expect(box.getByText(/^balance of \d+ Oct$/)).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('undo-file-box'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await page.screenshot(shot('undo-file-box-phone'))
  await page.setViewportSize({ width: 1280, height: 720 })

  await box.getByRole('button', { name: 'take this file back' }).click()
  await expect(sheet.getByText('taking it back…')).toBeVisible()
  await expect(sheet.getByText('Taken back.')).toBeVisible()
  await expect(sheet.getByText('ActivoBank is €153.21 again.')).toBeVisible()
  /* Back on the account: the file and its rows are gone. */
  await expect(sheet.getByRole('button', { name: /IMG_9282/ })).toHaveCount(0)
  await expect(sheet.getByText('Veiga e Seabra')).toHaveCount(0)
  await expect(sheet.getByText('Top-up by *2789')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('undo-file-taken'))
})

test('undo on the card a save lands on takes that save back', async ({
  page,
}) => {
  const sheet = await save(page)
  await page.waitForTimeout(700)
  await page.screenshot(shot('undo-file-landed'))
  await sheet.getByRole('button', { name: 'undo' }).click()
  await expect(sheet.getByText('taking it back…')).toBeVisible()
  await expect(sheet.getByText('Taken back')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot(shot('undo-file-undone'))
  await sheet.getByRole('button', { name: 'done' }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name: 'Open ActivoBank' }).click()
  const account = page.getByRole('dialog')
  await expect(account.getByText('€153.21').first()).toBeVisible()
  await expect(account.getByRole('button', { name: /IMG_9282/ })).toHaveCount(0)
})
