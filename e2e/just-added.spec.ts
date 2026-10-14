import { expect, test } from '@playwright/test'
import { anyApi } from 'convex/server'
import type { Page } from '@playwright/test'

import { start, testClient } from './helpers'

const shot = (name: string) => ({ path: `e2e/screens/${name}.png` })

/* Just added (14 Oct, mockup just-added.html, docs/specs/2026-10-14-
   just-added.md): the gold buys saved from ADD BUYS sit on top of
   Revolut's sheet and of Gold's page, to open or remove. Mock data only. */
async function savedGold(page: Page, drop = false) {
  await start(page)
  await testClient().mutation(anyApi.e2ePortfolio.goldBuys, { drop })
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
  /* One line until pressed. */
  const line = strip.getByTestId('just-line')
  await expect(line).toContainText('1 file')
  await expect(line).toContainText('4 buy')
  await expect(line).toContainText('today')
  const file = strip.getByTestId('just-file')
  await expect(file).toHaveCount(0)
  await line.getByRole('button', { expanded: false }).click()
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
  await sheet
    .getByTestId('just-line')
    .getByRole('button', { expanded: false })
    .click()
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
  await expect(sheet.getByTestId('just-line')).toBeVisible()
  await page.screenshot({ ...shot('just-added-phone'), fullPage: true })
})

/* 14 Oct, his drop: five Revolut screenshots of gold, IMG_9290 and
   IMG_9291 sharing three rows, IMG_9288 three buys and a sell. The strip
   is one line, counts BUY and SELL apart; an opened file lists its rows;
   × hides it until a newer file. Mock data only. */
test('just added: five files of one drop, one line, BUY and SELL apart', async ({
  page,
}) => {
  const position = await savedGold(page, true)
  const strip = position.getByTestId('just-added')
  const line = strip.getByTestId('just-line')
  await expect(line).toContainText('5 files')
  await expect(line).toContainText('17 buy')
  await expect(line).toContainText('2 sell')
  await expect(line).toContainText('today')
  await expect(strip.getByTestId('just-file')).toHaveCount(0)
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('just-added-line'), fullPage: true })

  await line.getByRole('button', { expanded: false }).click()
  const files = strip.getByTestId('just-file')
  await expect(files).toHaveCount(5)
  const img9288 = files.filter({ hasText: 'IMG_9288.PNG' })
  await expect(img9288).toContainText('3 buy')
  await expect(img9288).toContainText('1 sell')
  /* Whichever of the two overlapping files was saved second had its
     three shared rows in already. */
  const second = files.filter({ hasText: '3 in already' })
  await expect(second).toHaveCount(1)
  await expect(second).toContainText(/IMG_929[01]\.PNG/)
  await page.waitForTimeout(800)
  await page.screenshot({ ...shot('just-added-open'), fullPage: true })

  /* OPEN: its rows, each saved by it or in already, counted on top. */
  const nine = (await second.textContent())?.includes('IMG_9290') === true
  await second.getByRole('button', { name: /open ›/ }).click()
  const sheet = page.getByRole('dialog')
  await expect(
    sheet.getByText(
      nine ? '5 buy in the file · 2 saved' : '4 buy in the file · 1 saved',
    ),
  ).toBeVisible()
  const rows = sheet.getByTestId('file-trade')
  await expect(rows).toHaveCount(nine ? 5 : 4)
  await expect(rows.filter({ hasText: 'in already' })).toHaveCount(3)
  /* The remove box: badges left, the button right, on one line. */
  const box = sheet.getByTestId('take-back')
  const gone = nine ? '−2 buy' : '−1 buy'
  await expect(box).toContainText(gone)
  const badge = await box.getByText(gone).boundingBox()
  const press = await box
    .getByRole('button', { name: /remove screenshot/ })
    .boundingBox()
  expect(badge && press).toBeTruthy()
  expect(
    Math.abs(badge!.y + badge!.height / 2 - (press!.y + press!.height / 2)),
  ).toBeLessThan(4)
  expect(press!.x).toBeGreaterThan(badge!.x + 100)
  await page.waitForTimeout(500)
  await sheet.screenshot(shot('just-added-file-trades'))
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  /* ×: hidden, and still hidden after a reload, until a newer file. */
  await line.getByRole('button', { name: 'hide just added' }).click()
  await expect(strip).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('position-page')).toBeVisible()
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('just-added')).toHaveCount(0)
})
