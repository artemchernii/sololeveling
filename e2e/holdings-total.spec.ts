import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { anyApi } from 'convex/server'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* A broker screenshot against the total it prints (11 Oct,
   docs/specs/2026-10-11-holdings-total.md): Trade Republic's 20 positions
   and cash reach €25,125.78; with the last one not read they do not.
   Mock data only. */

const open = async (page: Page, as: 'same' | 'cut' | 'none' | 'two') => {
  await start(page)
  await testClient().mutation(anyApi.e2eHoldingsTotal.screens, { as })
  await page.goto('/finances')
  await page.getByRole('button', { name: 'Show amounts' }).first().click()
  await page.getByRole('button', { name: 'add', exact: true }).first().click()
  return page.getByRole('dialog')
}
const DIFFERS =
  'Trade Republic: €24,727.26 in the positions and cash, €25,125.78 total on the screenshot.'

test('it adds up: nothing is asked, one press saves it', async ({ page }) => {
  const sheet = await open(page, 'same')
  await expect(sheet.getByText('20 positions', { exact: true })).toBeVisible()
  await expect(sheet.getByText('positions and cash')).toBeVisible()
  await expect(sheet.getByText('total on the screenshot')).toBeVisible()
  await expect(sheet.getByText('adds up')).toBeVisible()
  await expect(sheet.getByText('€23,920.12')).toBeVisible()
  await expect(sheet.getByText('€25,125.78').first()).toBeVisible()
  await expect(sheet.getByTestId('total-differs')).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('holdings-total-same'), fullPage: true })
  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText(/saving|up to date/).first()).toBeVisible()
  await expect(sheet.getByText('Trade Republic is up to date')).toBeVisible()
  await expect(sheet.getByText(/^20 positions added · /)).toBeVisible()
  await page.waitForTimeout(900)
  await page.screenshot(shot('holdings-total-landed'))
})

test('it does not add up: not saved, each answer lands and undoes', async ({
  page,
}) => {
  const sheet = await open(page, 'cut')
  const box = sheet.getByTestId('total-differs')
  await expect(box.getByText(DIFFERS)).toBeVisible()
  await expect(
    box.getByText(
      'A position is missing from the screenshot, or a number was read wrong.',
    ),
  ).toBeVisible()
  await expect(box.getByText('19 positions · cash €1,205.66')).toBeVisible()
  await expect(box.getByText('IMG_9301.png')).toBeVisible()
  await expect(sheet.getByText('does not add up')).toBeVisible()
  await expect(
    sheet.getByText('Trade Republic not saved — 1 question open.'),
  ).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^apply/ })).toBeDisabled()
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('holdings-total-differs'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await page.screenshot({
    ...shot('holdings-total-differs-phone'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1280, height: 720 })

  await box.getByRole('button', { name: 'save Trade Republic anyway' }).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(
    sheet.getByText(
      'Trade Republic saved as the screenshot shows: 19 positions and the cash.',
    ),
  ).toBeVisible()
  await expect(
    sheet.getByRole('button', { name: /apply 1 account/ }),
  ).toBeEnabled()
  await sheet.getByRole('button', { name: 'undo' }).click()
  await expect(box).toBeVisible()

  await box.getByRole('button', { name: 'do not save Trade Republic' }).click()
  await expect(sheet.getByText('saving…')).toBeVisible()
  await expect(
    sheet.getByText('Trade Republic not saved. Positions stay as they are.'),
  ).toBeVisible()
  await expect(sheet.getByText(/question open/)).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: /^apply/ })).toBeDisabled()
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('holdings-total-answered'), fullPage: true })
})

test('no total on the screenshot: it says so and saves', async ({ page }) => {
  const sheet = await open(page, 'none')
  await expect(
    sheet.getByText('Not checked: no total on the screenshot.'),
  ).toBeVisible()
  await expect(sheet.getByText('not on the screenshot')).toBeVisible()
  await page.screenshot({ ...shot('holdings-total-none'), fullPage: true })
  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText('Trade Republic is up to date')).toBeVisible()
})

test('two accounts in one drop: the one that adds up is saved', async ({
  page,
}) => {
  const sheet = await open(page, 'two')
  await expect(sheet.getByText('adds up')).toBeVisible()
  await expect(sheet.getByText('positions and broker cash')).toBeVisible()
  await expect(
    sheet.getByTestId('total-differs').getByText(DIFFERS),
  ).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot({ ...shot('holdings-total-two'), fullPage: true })
  await sheet.getByRole('button', { name: /apply 1 account/ }).click()
  await expect(sheet.getByText(/saving|up to date/).first()).toBeVisible()
  await expect(sheet.getByText(/Revolut (is up to date|updated)/)).toBeVisible()
  await expect(sheet.getByText(/^2 positions added · /)).toBeVisible()
})
